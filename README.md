# SheetFlow

MP3 to playable piano sheet music. Upload an audio file, get interactive sheet music you can play back in the browser.

## Architecture

```
Browser (React) → Go API Gateway → Redis Queue → Python ML Worker
                                        |
                                   MinIO/S3 (files)
                                   PostgreSQL (metadata)
```

- **Go API** - REST + WebSocket, handles uploads and job orchestration
- **Python Worker** - Spotify basic-pitch transcription, MIDI → MusicXML conversion
- **React Frontend** - OpenSheetMusicDisplay for interactive sheet music with playback
- **Prometheus + Grafana** - Observability dashboards

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Go 1.22+](https://go.dev/dl/) (for local API development)
- [Node.js 20+](https://nodejs.org/) (for local frontend development)
- [Python 3.11+](https://www.python.org/) (for local worker development)

For cluster deployment:
- [Helm 3](https://helm.sh/docs/intro/install/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Terraform 1.5+](https://developer.hashicorp.com/terraform/install) (AWS deployment only)

## Quick Start (Docker Compose)

This spins up all 9 services locally:

```bash
git clone <repo-url> && cd sheet-project

# Start everything
make dev

# Or without make:
docker compose up --build
```

Once running:

| Service         | URL                    |
|-----------------|------------------------|
| Frontend        | http://localhost:3000   |
| API             | http://localhost:8080   |
| Grafana         | http://localhost:3001   |
| Prometheus      | http://localhost:9090   |
| MinIO Console   | http://localhost:9001   |

Grafana login: `admin` / `admin`
MinIO login: `minioadmin` / `minioadmin`

To stop and clean up:

```bash
make dev-down
```

## Local Development (Without Docker)

### API (Go)

```bash
cd api
go mod download

# Requires PostgreSQL, Redis, and MinIO running locally
export DATABASE_URL="postgres://sheetflow:sheetflow@localhost:5432/sheetflow?sslmode=disable"
export REDIS_URL="redis://localhost:6379"
export S3_ENDPOINT="http://localhost:9000"
export S3_BUCKET="sheetflow"
export S3_ACCESS_KEY="minioadmin"
export S3_SECRET_KEY="minioadmin"
export S3_USE_PATH_STYLE="true"

go run ./cmd/server
```

### Worker (Python)

```bash
cd worker
python -m venv .venv && source .venv/bin/activate
pip install -e .

# Same Redis/S3 env vars as above
python -m src.main
```

### Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to `localhost:8080`.

## Deploy to Kubernetes (Helm)

### Any cluster (homelab, Talos, etc.)

Uses in-cluster PostgreSQL, Redis, and MinIO:

```bash
make helm-install
# or
helm install sheetflow ./helm/sheetflow
```

### AWS (EKS)

1. Provision infrastructure with Terraform:

```bash
cd terraform/aws
terraform init
terraform plan -var="db_password=YOUR_SECURE_PASSWORD"
terraform apply -var="db_password=YOUR_SECURE_PASSWORD"
```

2. Configure kubectl:

```bash
aws eks update-kubeconfig --name sheetflow-prod --region us-east-1
```

3. Build and push images to ECR:

```bash
# Get ECR registry URL from terraform output
REGISTRY=$(terraform output -raw ecr_repository_urls | jq -r '.api' | cut -d/ -f1)

make build
REGISTRY=$REGISTRY TAG=latest make push
```

4. Deploy with Helm:

```bash
helm install sheetflow ./helm/sheetflow \
  -f ./helm/sheetflow/values-aws.yaml \
  --set api.image=$REGISTRY/sheetflow-api:latest \
  --set worker.image=$REGISTRY/sheetflow-worker:latest \
  --set frontend.image=$REGISTRY/sheetflow-frontend:latest \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=$(terraform output -raw irsa_role_arn)
```

## Makefile Commands

```
make dev              # Start all services with Docker Compose
make dev-down         # Stop and remove volumes
make build            # Build all Docker images
make test             # Run all tests
make lint             # Lint all services
make helm-lint        # Validate Helm chart
make helm-template    # Render Helm templates
make tf-plan          # Terraform plan (AWS)
make clean            # Remove containers and local images
```

## Project Structure

```
api/                  Go API gateway
worker/               Python ML worker (basic-pitch + music21)
frontend/             React + TypeScript + OSMD
helm/sheetflow/       Helm chart (cloud-agnostic + AWS overlay)
terraform/aws/        AWS infrastructure (EKS, RDS, S3, ECR, etc.)
monitoring/           Prometheus + Grafana configs
.github/workflows/    CI/CD pipelines
```
