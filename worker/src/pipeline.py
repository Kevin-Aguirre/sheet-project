import json
import logging
import tempfile
import time
from pathlib import Path

from .config import settings
from .converter import convert_to_musicxml
from .metrics import job_duration_seconds, jobs_in_progress, jobs_processed_total
from .separator import separate_piano
from .storage import S3Client
from .transcriber import transcribe

logger = logging.getLogger(__name__)


def publish_status(redis_client, job_id: str, status: str, result_key: str = "", error: str = "") -> None:
    msg = json.dumps({
        "job_id": job_id,
        "status": status,
        "result_key": result_key,
        "error": error,
    })
    redis_client.publish(f"jobs:{job_id}:status", msg)

    # Also update the job hash so the API can read latest status
    redis_client.hset(f"jobs:{job_id}", mapping={"status": status, "result_key": result_key, "error": error})


def process_job(job_data: dict, s3_client: S3Client, redis_client) -> None:
    job_id = job_data["id"]
    s3_key = job_data["s3_key"]

    logger.info("processing job", extra={"job_id": job_id, "s3_key": s3_key})
    jobs_in_progress.inc()
    start = time.time()

    tmp_dir = tempfile.mkdtemp(prefix=f"sheetflow-{job_id}-")
    mp3_path = Path(tmp_dir) / "input.mp3"
    midi_path = None
    musicxml_path = None

    try:
        # Download MP3
        publish_status(redis_client, job_id, "processing")
        s3_client.download_file(s3_key, mp3_path)

        # Separate piano from drums/other instruments
        publish_status(redis_client, job_id, "separating")
        clean_audio = separate_piano(mp3_path, Path(tmp_dir))

        # Transcribe to MIDI
        midi_path = transcribe(clean_audio)

        # Convert to MusicXML
        publish_status(redis_client, job_id, "converting")
        musicxml_path = convert_to_musicxml(midi_path)

        # Upload result
        result_key = f"results/{job_id}.musicxml"
        s3_client.upload_file(musicxml_path, result_key)

        publish_status(redis_client, job_id, "completed", result_key=result_key)
        jobs_processed_total.labels(status="success").inc()
        logger.info("job completed", extra={"job_id": job_id, "result_key": result_key})

    except Exception as e:
        error_msg = str(e)
        publish_status(redis_client, job_id, "failed", error=error_msg)
        jobs_processed_total.labels(status="failed").inc()
        logger.exception("job failed", extra={"job_id": job_id})

    finally:
        jobs_in_progress.dec()
        job_duration_seconds.observe(time.time() - start)
        # Cleanup temp dir and all contents
        import shutil
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except OSError:
            pass
        for path in [midi_path, musicxml_path]:
            if path and path.exists():
                try:
                    path.unlink()
                except OSError:
                    pass
