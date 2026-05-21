import logging
from pathlib import Path

import boto3
from botocore.config import Config as BotoConfig

from .config import settings

logger = logging.getLogger(__name__)


class S3Client:
    def __init__(self) -> None:
        kwargs: dict = {
            "service_name": "s3",
            "region_name": settings.s3_region,
            "aws_access_key_id": settings.s3_access_key,
            "aws_secret_access_key": settings.s3_secret_key,
        }
        if settings.s3_endpoint:
            kwargs["endpoint_url"] = settings.s3_endpoint
        if settings.s3_use_path_style:
            kwargs["config"] = BotoConfig(s3={"addressing_style": "path"})

        self.client = boto3.client(**kwargs)
        self.bucket = settings.s3_bucket

    def download_file(self, key: str, local_path: Path) -> None:
        logger.info("downloading from s3", extra={"key": key, "local_path": str(local_path)})
        self.client.download_file(self.bucket, key, str(local_path))

    def upload_file(self, local_path: Path, key: str) -> None:
        logger.info("uploading to s3", extra={"key": key, "local_path": str(local_path)})
        self.client.upload_file(str(local_path), self.bucket, key)
