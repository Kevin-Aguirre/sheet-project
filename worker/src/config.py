from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379"
    s3_endpoint: str = "http://localhost:9000"
    s3_bucket: str = "sheetflow"
    s3_region: str = "us-east-1"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_use_path_style: bool = True
    worker_concurrency: int = 1
    metrics_port: int = 9090
    log_level: str = "INFO"

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
