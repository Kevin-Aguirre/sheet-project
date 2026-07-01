FROM python:3.11-slim AS builder
WORKDIR /app
COPY pyproject.toml ./

# Install CPU-only torch first, from PyTorch's dedicated index, so we don't pull
# the ~2GB CUDA build that PyPI ships for Linux.
RUN pip install --no-cache-dir --prefix=/install \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.2.2

# Remaining deps from PyPI. PYTHONPATH exposes the torch we just installed into
# --prefix so pip treats it as satisfied instead of re-resolving it from PyPI.
RUN PYTHONPATH=/install/lib/python3.11/site-packages \
    pip install --no-cache-dir --prefix=/install .

# Pre-download the ByteDance high-resolution checkpoint (~170MB) at build time,
# so the worker needs neither network access nor a writable HOME at runtime.
RUN mkdir -p /models && \
    python -c "import urllib.request; urllib.request.urlretrieve('https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1', '/models/note_F1=0.9677_pedal_F1=0.9186.pth')"

FROM python:3.11-slim
COPY --from=builder /install /usr/local
COPY --from=builder /models/ /app/models/

# Runtime caches must be writable by USER nobody; models live where the code expects.
ENV PIANO_MODEL_PATH=/app/models/note_F1=0.9677_pedal_F1=0.9186.pth \
    NUMBA_CACHE_DIR=/tmp \
    MPLCONFIGDIR=/tmp

WORKDIR /app
COPY src/ ./src/
EXPOSE 9090
USER nobody
ENTRYPOINT ["python", "-m", "src.main"]
