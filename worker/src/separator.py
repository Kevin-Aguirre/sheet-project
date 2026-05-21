import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


def separate_piano(mp3_path: Path, output_dir: Path) -> Path:
    """Use demucs to isolate the 'other' stem (piano/melodic content).

    4-stem mode splits into: drums, bass, vocals, other.
    The 'other' stem captures piano, synths, and similar instruments
    while removing drums, bass, and vocals.
    """
    logger.info("separating audio stems", extra={"mp3_path": str(mp3_path)})

    result = subprocess.run(
        [
            "python", "-m", "demucs",
            "-n", "htdemucs",
            "--out", str(output_dir),
            str(mp3_path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        logger.error("demucs failed", extra={"stderr": result.stderr, "stdout": result.stdout})
        raise RuntimeError(f"demucs failed: {result.stderr[-500:]}")

    # 4-stem output: output_dir/htdemucs/<stem_name>/{drums,bass,vocals,other}.wav
    stem_name = mp3_path.stem
    other_path = output_dir / "htdemucs" / stem_name / "other.wav"

    if not other_path.exists():
        logger.warning("'other' stem not found, falling back to original")
        return mp3_path

    logger.info("separation complete", extra={"stem_path": str(other_path)})
    return other_path
