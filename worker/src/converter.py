import logging
import tempfile
import time
from pathlib import Path

from .metrics import conversion_duration_seconds

logger = logging.getLogger(__name__)

PIANO_LOW = 21   # A0
PIANO_HIGH = 108  # C8
MIDDLE_C = 60


def convert_to_musicxml(midi_path: Path) -> Path:
    """Convert MIDI to MusicXML with piano-specific processing."""
    logger.info("starting conversion", extra={"midi_path": str(midi_path)})
    start = time.time()

    try:
        from music21 import converter, instrument, stream, analysis

        score = converter.parse(str(midi_path))

        # Quantize note timings
        score.quantize(inPlace=True)

        # Filter to piano range
        for note in score.recurse().notes:
            if hasattr(note, "pitch"):
                if note.pitch.midi < PIANO_LOW or note.pitch.midi > PIANO_HIGH:
                    note.activeSite.remove(note)
            elif hasattr(note, "pitches"):
                # Chord: filter out-of-range pitches
                note.pitches = [
                    p for p in note.pitches if PIANO_LOW <= p.midi <= PIANO_HIGH
                ]

        # Analyze key signature
        try:
            key = analysis.discrete.KrumhanslSchmuckler().getSolution(score)
            if key:
                score.insert(0, key)
        except Exception:
            logger.debug("key detection failed, skipping")

        # Create piano score with treble/bass split
        piano_part = stream.Part()
        piano_part.insert(0, instrument.Piano())

        treble = stream.Voice()
        bass = stream.Voice()

        for note in score.flatten().notes:
            if hasattr(note, "pitch"):
                midi_num = note.pitch.midi
            elif hasattr(note, "pitches") and note.pitches:
                midi_num = max(p.midi for p in note.pitches)
            else:
                continue

            if midi_num >= MIDDLE_C:
                treble.insert(note.offset, note)
            else:
                bass.insert(note.offset, note)

        piano_part.insert(0, treble)
        piano_part.insert(0, bass)

        piano_score = stream.Score()
        piano_score.insert(0, piano_part)

        output_path = Path(tempfile.mktemp(suffix=".musicxml"))
        piano_score.write("musicxml", fp=str(output_path))

        duration = time.time() - start
        conversion_duration_seconds.observe(duration)
        logger.info(
            "conversion complete",
            extra={"output_path": str(output_path), "duration_s": round(duration, 2)},
        )
        return output_path

    except Exception:
        logger.exception("conversion failed")
        raise
