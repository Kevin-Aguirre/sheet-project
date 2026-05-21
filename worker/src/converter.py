import logging
import tempfile
import time
from pathlib import Path

import pretty_midi
from .metrics import conversion_duration_seconds

logger = logging.getLogger(__name__)

PIANO_LOW = 21   # A0
PIANO_HIGH = 108  # C8
MIDDLE_C = 60


def _snap(value, grid):
    """Snap a value to the nearest grid point."""
    return round(value / grid) * grid


def convert_to_musicxml(midi_path: Path) -> Path:
    """Convert MIDI to MusicXML with proper quantization."""
    logger.info("starting conversion", extra={"midi_path": str(midi_path)})
    start = time.time()

    try:
        from music21 import stream, note as m21note, chord as m21chord
        from music21 import instrument, tempo, meter, key as m21key, duration, analysis

        pm = pretty_midi.PrettyMIDI(str(midi_path))

        # Get tempo
        tempo_changes = pm.get_tempo_changes()
        bpm = float(tempo_changes[1][0]) if len(tempo_changes[1]) > 0 else 120.0
        logger.info("detected tempo", extra={"bpm": round(bpm, 1)})

        # Quarter note duration in seconds
        quarter_dur = 60.0 / bpm
        # Quantize to 16th notes
        grid = quarter_dur / 4.0

        # Build note list from pretty_midi with quantized timings
        all_notes = []
        for pm_inst in pm.instruments:
            if pm_inst.is_drum:
                continue
            for n in pm_inst.notes:
                if n.pitch < PIANO_LOW or n.pitch > PIANO_HIGH:
                    continue
                onset = _snap(n.start, grid)
                offset = _snap(n.end, grid)
                # Ensure minimum duration of one grid unit
                if offset <= onset:
                    offset = onset + grid
                all_notes.append((onset, offset, n.pitch, n.velocity))

        all_notes.sort(key=lambda x: (x[0], x[2]))
        logger.info("notes to convert", extra={"count": len(all_notes)})

        # Convert seconds to quarter-note offsets
        treble = stream.Part()
        treble.insert(0, instrument.Piano())
        bass = stream.Part()
        bass.insert(0, instrument.Piano())

        for onset_s, offset_s, pitch, velocity in all_notes:
            # Convert time in seconds to quarter-note beats
            onset_q = onset_s / quarter_dur
            dur_q = (offset_s - onset_s) / quarter_dur

            m21n = m21note.Note(pitch)
            m21n.duration = duration.Duration(dur_q)
            m21n.volume.velocity = velocity

            if pitch >= MIDDLE_C:
                treble.insert(onset_q, m21n)
            else:
                bass.insert(onset_q, m21n)

        # Build score
        piano_score = stream.Score()
        piano_score.insert(0, tempo.MetronomeMark(number=bpm))
        piano_score.insert(0, meter.TimeSignature('4/4'))

        # Detect key
        try:
            combined = stream.Part()
            for n_data in all_notes[:200]:  # sample first 200 notes
                combined.insert(n_data[0] / quarter_dur, m21note.Note(n_data[2]))
            detected_key = analysis.discrete.KrumhanslSchmuckler().getSolution(combined)
            if detected_key:
                piano_score.insert(0, detected_key)
        except Exception:
            logger.debug("key detection failed, skipping")

        if treble.notes:
            piano_score.insert(0, treble)
        if bass.notes:
            piano_score.insert(0, bass)

        # Make measures
        piano_score.makeMeasures(inPlace=True)

        output_path = Path(tempfile.mktemp(suffix=".musicxml"))
        piano_score.write("musicxml", fp=str(output_path))

        dur = time.time() - start
        conversion_duration_seconds.observe(dur)
        logger.info(
            "conversion complete",
            extra={"output_path": str(output_path), "duration_s": round(dur, 2)},
        )
        return output_path

    except Exception:
        logger.exception("conversion failed")
        raise
