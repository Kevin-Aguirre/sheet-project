.PHONY: dev dev-down build test lint helm-lint helm-template push clean

# Local development
dev:
	docker compose up --build

dev-down:
	docker compose down -v

# Build all images
build:
	docker compose build

build-api:
	docker build -t sheetflow/api:latest ./api

build-worker:
	docker build -t sheetflow/worker:latest ./worker

build-frontend:
	docker build -t sheetflow/frontend:latest ./frontend

# Tests
test: test-api test-worker test-frontend

test-api:
	cd api && go test ./...

test-worker:
	cd worker && python -m pytest tests/ -v

test-frontend:
	cd frontend && npm run build

# Linting
lint: lint-api lint-worker

lint-api:
	cd api && go vet ./...

lint-worker:
	cd worker && ruff check src/

# Helm
helm-lint:
	helm lint ./helm/sheetflow

helm-template:
	helm template sheetflow ./helm/sheetflow

helm-install:
	helm install sheetflow ./helm/sheetflow

helm-install-aws:
	helm install sheetflow ./helm/sheetflow -f ./helm/sheetflow/values-aws.yaml

helm-upgrade:
	helm upgrade sheetflow ./helm/sheetflow

# Terraform
tf-init:
	cd terraform/aws && terraform init

tf-plan:
	cd terraform/aws && terraform plan

tf-apply:
	cd terraform/aws && terraform apply

# Docker push (override REGISTRY env var)
REGISTRY ?= ghcr.io/yourusername
TAG ?= latest

push:
	docker tag sheetflow/api:latest $(REGISTRY)/sheetflow-api:$(TAG)
	docker tag sheetflow/worker:latest $(REGISTRY)/sheetflow-worker:$(TAG)
	docker tag sheetflow/frontend:latest $(REGISTRY)/sheetflow-frontend:$(TAG)
	docker push $(REGISTRY)/sheetflow-api:$(TAG)
	docker push $(REGISTRY)/sheetflow-worker:$(TAG)
	docker push $(REGISTRY)/sheetflow-frontend:$(TAG)

# Clean
clean:
	docker compose down -v --rmi local
