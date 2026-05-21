FROM python:3.11-slim AS builder
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir --prefix=/install .

FROM python:3.11-slim
COPY --from=builder /install /usr/local
WORKDIR /app
COPY src/ ./src/
EXPOSE 9090
USER nobody
ENTRYPOINT ["python", "-m", "src.main"]
