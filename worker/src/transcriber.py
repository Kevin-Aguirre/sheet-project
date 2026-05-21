import logging
import tempfile
import time
from pathlib import Path

from .metrics import transcription_duration_seconds

logger = logging.getLogger(__name__)


def transcribe(mp3_path: Path) -> Path:
    """Transcribe an MP3 file to MIDI using Spotify's basic-pitch."""
    logger.info("starting transcription", extra={"mp3_path": str(mp3_path)})
    start = time.time()

    try:
        from basic_pitch.inference import predict

        _, midi_data, _ = predict(str(mp3_path))

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
