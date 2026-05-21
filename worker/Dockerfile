FROM python:3.11-slim AS builder
WORKDIR /app
# Install CPU-only PyTorch first (avoids pulling ~2GB CUDA version)
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
WORKDIR /app
COPY src/ ./src/
EXPOSE 9090
USER nobody
ENTRYPOINT ["python", "-m", "src.main"]
