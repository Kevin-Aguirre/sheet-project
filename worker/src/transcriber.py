import logging
import os
import tempfile
import time
from pathlib import Path

import pretty_midi

from .metrics import transcription_duration_seconds

logger = logging.getLogger(__name__)

MIN_NOTE_DURATION = 0.05  # Ignore notes shorter than 50ms

# Path to the ByteDance high-resolution piano transcription checkpoint.
# Pre-downloaded at Docker build time (see worker/Dockerfile).
MODEL_PATH = os.environ.get(
    "PIANO_MODEL_PATH",
    "/app/models/note_F1=0.9677_pedal_F1=0.9186.pth",
)

# Lazily-initialised singleton so the model (and its weights) load once per
# worker process rather than on every job.
_transcriptor = None


def _get_transcriptor():
    global _transcriptor
    if _transcriptor is None:
        from piano_transcription_inference import PianoTranscription

        logger.info("loading transcription model", extra={"checkpoint": MODEL_PATH})
        _transcriptor = PianoTranscription(
            device="cpu",
            checkpoint_path=MODEL_PATH,
        )
    return _transcriptor


def _estimate_tempo(audio, sr) -> float:
    """Estimate BPM from the audio, folding octave errors into a piano range.

    ByteDance's MIDI carries no tempo (defaults to 120), which makes downstream
    quantization wrong. beat_track occasionally lands on a double/half tempo, so
    we fold the result into a musically plausible 55-180 BPM band.
    """
    import librosa
    import numpy as np

    try:
        tempo = librosa.beat.beat_track(y=audio, sr=sr)[0]
        bpm = float(np.atleast_1d(tempo)[0])
    except Exception:
        logger.debug("tempo estimation failed, defaulting to 120")
        return 120.0

    if bpm <= 0:
        return 120.0
    while bpm > 180:
        bpm /= 2.0
    while bpm < 55:
        bpm *= 2.0
    return bpm


def _with_tempo(pm, bpm: float):
    """Return a copy of the MIDI with a real tempo baked in.

    Note times stay in absolute seconds, so only the tempo metadata changes —
    enough for the converter to build a correct beat grid. Pedal control changes
    are dropped; their effect is already baked into note durations.
    """
    out = pretty_midi.PrettyMIDI(initial_tempo=bpm)
    for inst in pm.instruments:
        ni = pretty_midi.Instrument(
            program=inst.program, is_drum=inst.is_drum, name=inst.name
        )
        ni.notes = inst.notes
        out.instruments.append(ni)
    return out


def _merge_overlapping_notes(notes):
    """Merge overlapping notes of the same pitch (stuttered sustains)."""
    if not notes:
        return notes

    notes.sort(key=lambda n: (n.pitch, n.start))
    merged = []
    current = notes[0]

    for note in notes[1:]:
        if note.pitch == current.pitch and note.start < current.end:
            current.end = max(current.end, note.end)
            current.velocity = max(current.velocity, note.velocity)
        else:
            merged.append(current)
            current = note

    merged.append(current)
    merged.sort(key=lambda n: n.start)
    return merged


def transcribe(audio_path: Path) -> Path:
    """Transcribe piano audio to MIDI using ByteDance's high-resolution model.

    Unlike a general multi-instrument model, this network is trained solely on
    solo piano (MAESTRO), so it has a strong prior for what a real piano note
    looks like. That makes it far more robust to background noise and non-piano
    sound, which get rejected instead of transcribed as ghost notes. It also
    recovers sustain-pedal events and high-resolution velocities.
    """
    logger.info("starting transcription", extra={"audio_path": str(audio_path)})
    start = time.time()

    try:
        import librosa
        from piano_transcription_inference import sample_rate

        # The model expects mono audio at its native 16 kHz sample rate.
        audio, _ = librosa.load(str(audio_path), sr=sample_rate, mono=True)

        midi_path = Path(tempfile.mktemp(suffix=".mid"))
        _get_transcriptor().transcribe(audio, str(midi_path))

        # Light cleanup on the (already clean) output for downstream stability.
        pm = pretty_midi.PrettyMIDI(str(midi_path))
        raw_count = sum(len(i.notes) for i in pm.instruments)

        for inst in pm.instruments:
            inst.notes = [
                n for n in inst.notes
                if (n.end - n.start) >= MIN_NOTE_DURATION
            ]
            inst.notes = _merge_overlapping_notes(inst.notes)

        # Estimate a real tempo and bake it into the MIDI so the converter can
        # build a correct beat grid (ByteDance output defaults to 120 BPM).
        bpm = _estimate_tempo(audio, sample_rate)
        pm = _with_tempo(pm, bpm)
        pm.write(str(midi_path))

        final_count = sum(len(i.notes) for i in pm.instruments)
        logger.info("transcription done", extra={
            "raw_notes": raw_count, "final_notes": final_count,
            "estimated_bpm": round(bpm, 1),
        })

        duration = time.time() - start
        transcription_duration_seconds.observe(duration)
        logger.info("transcription complete", extra={
            "midi_path": str(midi_path), "duration_s": round(duration, 2)
        })
        return midi_path

    except Exception:
        logger.exception("transcription failed")
        raise
