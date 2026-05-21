import logging
import tempfile
import time
from pathlib import Path

from .metrics import transcription_duration_seconds

logger = logging.getLogger(__name__)

MIN_NOTE_VELOCITY = 40    # Ignore very quiet ghost notes (0-127 scale)
MIN_NOTE_DURATION = 0.08  # Ignore notes shorter than 80ms
MERGE_GAP = 0.06          # Merge same-pitch notes with gaps under 60ms


def _merge_repeated_notes(notes):
    """Merge overlapping notes of the same pitch into sustained notes.

    When a piano key is held, basic-pitch often detects multiple onsets
    within the sustain. This merges them back into one long note.
    Only merges when the next note starts DURING the current note
    (true overlap), not just because they're close together.
    """
    if not notes:
        return notes

    # Sort by pitch then start time
    notes.sort(key=lambda n: (n.pitch, n.start))

    merged = []
    current = notes[0]

    for note in notes[1:]:
        # Same pitch and the next note starts while current is still sounding
        if note.pitch == current.pitch and note.start < current.end:
            # Extend current note to cover both
            current.end = max(current.end, note.end)
            current.velocity = max(current.velocity, note.velocity)
        else:
            merged.append(current)
            current = note

    merged.append(current)
    # Restore chronological order
    merged.sort(key=lambda n: n.start)
    return merged


def transcribe(audio_path: Path) -> Path:
    """Transcribe an audio file to MIDI using Spotify's basic-pitch."""
    logger.info("starting transcription", extra={"audio_path": str(audio_path)})
    start = time.time()

    try:
        from basic_pitch.inference import predict

        _, midi_data, _ = predict(
            str(audio_path),
            onset_threshold=0.6,
            frame_threshold=0.45,
            minimum_note_length=80,
            minimum_frequency=65.0,   # C2
            maximum_frequency=2100.0, # C7
        )

        # Log raw output
        raw_count = sum(len(i.notes) for i in midi_data.instruments)
        logger.info("raw transcription", extra={"note_count": raw_count})

        # Post-process each instrument
        for instrument in midi_data.instruments:
            before = len(instrument.notes)
            # Remove quiet and very short notes
            instrument.notes = [
                n for n in instrument.notes
                if n.velocity >= MIN_NOTE_VELOCITY
                and (n.end - n.start) >= MIN_NOTE_DURATION
            ]
            after_filter = len(instrument.notes)
            # Merge stuttered sustained notes
            instrument.notes = _merge_repeated_notes(instrument.notes)
            after_merge = len(instrument.notes)
            logger.info("post-processing", extra={
                "raw": before, "after_filter": after_filter, "after_merge": after_merge
            })

        note_count = sum(len(i.notes) for i in midi_data.instruments)
        logger.info("post-processing complete", extra={"notes_kept": note_count})

        midi_path = Path(tempfile.mktemp(suffix=".mid"))
        midi_data.write(str(midi_path))

        duration = time.time() - start
        transcription_duration_seconds.observe(duration)
        logger.info(
            "transcription complete",
            extra={"midi_path": str(midi_path), "duration_s": round(duration, 2)},
        )
        return midi_path

    except Exception:
        logger.exception("transcription failed")
        raise
