# SheetFlow - MP3 to Playable Piano Sheet Music

## Overview

SheetFlow converts uploaded MP3 files into playable, interactive piano sheet music rendered in the browser. Users upload audio, the system transcribes it to MIDI via ML, converts MIDI to MusicXML, and presents an interactive score the user can play back with a synchronized cursor - similar to MuseScore's playback experience.

## Architecture

### High-Level Flow

```
[Browser/React] --> [Go API Gateway] --> [Redis Queue] --> [Python ML Worker]
                                              |
                                         [MinIO/S3]
                                        (file storage)
                                              |
                                     [PostgreSQL] (metadata)
```

1. User uploads MP3 via React frontend
2. Go API Gateway accepts upload, stores file in object storage (S3/MinIO), creates a job record in PostgreSQL, publishes job to Redis queue
3. Python ML Worker picks up the job, downloads the MP3, runs transcription pipeline, produces MusicXML, uploads result to object storage, updates job status
4. Frontend polls (or receives WebSocket push) for completion, then renders the MusicXML as interactive sheet music with playback

### Services (6 containers)

| Service | Language | Purpose |
|---------|----------|---------|
| **api-gateway** | Go | REST API. Handles uploads, job management, auth, serves results. WebSocket support for real-time job status. |
| **worker** | Python | Consumes jobs from Redis. Runs basic-pitch (Spotify) for audio-to-MIDI transcription, then converts MIDI to MusicXML. Stateless, horizontally scalable. |
| **frontend** | React/TS | Upload UI, job status dashboard, interactive sheet music renderer using OpenSheetMusicDisplay (OSMD) with playback/cursor sync. |
| **postgres** | PostgreSQL | Job metadata, user accounts, file references. |
| **redis** | Redis | Job queue (reliable queue pattern with acknowledgment). Also used for caching and WebSocket pub/sub fan-out. |
| **minio** | MinIO | S3-compatible object storage for local/dev. Swapped for real S3 in AWS deployment. |

### Processing Pipeline (Python Worker)

```
MP3 --> basic-pitch (audio-to-MIDI) --> MIDI --> midi2musicxml --> MusicXML
                                         |
                              [optional: quantization,
                               key detection, time sig
                               inference, piano reduction]
```

- **basic-pitch**: Spotify's open-source neural audio-to-MIDI transcription
- **Post-processing**: Quantize note timings to grid, infer key signature and time signature, filter to piano range
- **Future**: Swap in Google MT3 for multi-instrument support

### Frontend - Interactive Sheet Music

- **OpenSheetMusicDisplay (OSMD)**: Renders MusicXML as SVG sheet music in the browser
- **Playback engine**: OSMD's built-in cursor + audio scheduling for synchronized playback
- **Features**:
  - Play/pause/seek with visual cursor tracking on the score
  - Tempo adjustment
  - Toggle between treble/bass clef layers
  - Download MusicXML / PDF export
  - Side-by-side: original audio playback vs. transcribed MIDI playback

### Go API Gateway

- **Framework**: Chi or Gin (lightweight, idiomatic)
- **Endpoints**:
  - `POST /api/upload` - Upload MP3, returns job ID
  - `GET /api/jobs/:id` - Job status + result URL
  - `GET /api/jobs/:id/sheet` - Fetch MusicXML
  - `WS /api/jobs/:id/ws` - WebSocket for real-time status updates
  - `GET /api/health` - Health check (K8s readiness/liveness)
- **Responsibilities**: Input validation (file type, size limits), rate limiting, job orchestration, presigned URL generation for object storage

## Infrastructure & Deployment

### Container Strategy

- Each service has its own Dockerfile with multi-stage builds
- Distroless/scratch base images where possible (Go binary -> scratch)
- Python worker uses slim base + pinned dependencies

### Helm Charts (Cloud-Agnostic)

```
helm/
  sheetflow/
    Chart.yaml
    values.yaml              # defaults (MinIO, in-cluster postgres)
    values-aws.yaml          # overrides for AWS (S3, RDS, ElastiCache)
    templates/
      api-deployment.yaml
      worker-deployment.yaml
      frontend-deployment.yaml
      postgres-statefulset.yaml
      redis-deployment.yaml
      minio-deployment.yaml   # excluded in AWS overlay
      ingress.yaml
      configmap.yaml
      secrets.yaml
      hpa.yaml               # horizontal pod autoscaler for workers
```

- **Local/Talos cluster**: `helm install sheetflow ./helm/sheetflow` - uses MinIO, in-cluster Postgres, in-cluster Redis
- **AWS EKS**: `helm install sheetflow ./helm/sheetflow -f values-aws.yaml` - uses S3, RDS, ElastiCache

### Terraform (AWS-Specific)

```
terraform/
  aws/
    eks.tf          # EKS cluster
    rds.tf          # PostgreSQL RDS
    elasticache.tf  # Redis
    s3.tf           # Upload/result buckets
    ecr.tf          # Container registry
    iam.tf          # IRSA (IAM Roles for Service Accounts)
    vpc.tf          # Networking
    alb.tf          # Application Load Balancer / Ingress
```

- Terraform provisions the cloud resources, Helm deploys the app
- IRSA for pod-level IAM (Go API pod gets S3 access without static credentials)

### CI/CD

- **GitHub Actions**:
  - Build + push container images to ECR (or GHCR for portability)
  - Run tests (Go unit tests, Python pipeline tests, React component tests)
  - Helm lint + template validation
  - Optional: deploy to EKS on merge to main

### Observability (Stretch Goals)

- Structured JSON logging from Go and Python services
- Prometheus metrics endpoint on Go API (`/metrics`)
- Grafana dashboards for job throughput, latency, queue depth
- OpenTelemetry tracing across API -> Queue -> Worker

## Features

### Core (MVP)
- Upload MP3 file (with drag-and-drop)
- Transcribe to piano sheet music via basic-pitch
- Render interactive sheet music in browser
- Play back the transcribed music with cursor sync
- Download MusicXML file
- Job status tracking with progress updates

### Sensible Additions
- Tempo adjustment on playback
- PDF export of sheet music
- Side-by-side original audio vs transcribed playback
- Basic user accounts (upload history)
- File size / duration limits with clear feedback

### Stretch (Post-MVP)
- MT3 model integration for higher quality transcription
- Multi-instrument detection with piano reduction
- Difficulty estimation / simplification modes
- WebSocket real-time progress (% complete during transcription)
- OAuth login (Google/GitHub)
- Rate limiting per user
- Prometheus/Grafana observability stack

## Project Structure

```
sheet-project/
  api/                    # Go API gateway
    cmd/server/
    internal/
      handler/
      middleware/
      queue/
      storage/
    Dockerfile
    go.mod
  worker/                 # Python ML worker
    src/
      transcriber/
      converter/
      pipeline.py
    Dockerfile
    pyproject.toml
  frontend/               # React + TypeScript
    src/
      components/
      pages/
      hooks/
    Dockerfile
    package.json
  helm/                   # Helm charts
    sheetflow/
  terraform/              # AWS infrastructure
    aws/
  docker-compose.yaml     # Local development
  Makefile                # Build/test/deploy shortcuts
  .github/workflows/      # CI/CD
```

## Technical Highlights (Portfolio Talking Points)

- **Microservice architecture**: Go API + Python ML worker communicating via Redis queue
- **Polyglot design**: Go (systems/API), Python (ML/audio), TypeScript (frontend)
- **Cloud-native**: Helm charts, HPA for worker scaling, health checks, graceful shutdown
- **Cloud-agnostic + AWS**: Runs on any K8s cluster (Talos homelab) with Helm, or on AWS EKS with Terraform-managed infrastructure
- **Infrastructure as Code**: Terraform for AWS resources, Helm for application deployment
- **Async processing**: Reliable queue pattern with job status tracking and WebSocket updates
- **ML pipeline**: Audio transcription with clear abstraction boundary for swapping models
