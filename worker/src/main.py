import json
import logging
import signal
import sys
import threading

import redis
from prometheus_client import start_http_server
from pythonjsonlogger import jsonlogger

from .config import settings
from .pipeline import process_job
from .storage import S3Client


def setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    formatter = jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
        rename_fields={"asctime": "timestamp", "levelname": "level"},
    )
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(settings.log_level)
    root.addHandler(handler)


def main() -> None:
    setup_logging()
    logger = logging.getLogger(__name__)

    logger.info("starting sheetflow worker", extra={
        "metrics_port": settings.metrics_port,
        "redis_url": settings.redis_url,
    })

    # Start Prometheus metrics server
    start_http_server(settings.metrics_port)

    # Connect to Redis
    redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    redis_client.ping()
    logger.info("connected to redis")

    # S3 client
    s3_client = S3Client()

    # Graceful shutdown
    shutdown = threading.Event()

    def handle_signal(signum, frame):
        logger.info("received shutdown signal", extra={"signal": signum})
        shutdown.set()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # Main processing loop
    logger.info("worker ready, waiting for jobs")
    while not shutdown.is_set():
        try:
            result = redis_client.brpop("jobs:pending", timeout=5)
            if result is None:
                continue

            _, raw = result
            job_data = json.loads(raw)
            logger.info("received job", extra={"job_id": job_data["id"]})
            process_job(job_data, s3_client, redis_client)

        except json.JSONDecodeError as e:
            logger.error("invalid job data", extra={"error": str(e)})
        except Exception:
            logger.exception("unexpected error in worker loop")

    logger.info("worker shutdown complete")


if __name__ == "__main__":
    main()
