# Docker and Containerization Architecture

## 1. Overview
The application is designed to run in a fully reproducible containerized environment using Docker and Docker Compose. It provisions:
1. **API Service (`api`)**: Express TypeScript server built via a secure multi-stage Dockerfile.
2. **PostgreSQL Database (`postgres`)**: PostgreSQL 16 Alpine with persistent volume storage and automated health check.
3. **Firestore Emulator (`firestore-emulator`)**: Local Google Cloud Firestore emulator exposing port 8080.

---

## 2. Multi-Stage Dockerfile Strategy

To ensure small image size, minimal attack surface, and security:
- **Stage 1 (Builder)**:
  - Base: `node:20-alpine` (or current LTS)
  - Installs all dependencies (including devDependencies).
  - Generates Prisma client.
  - Builds TypeScript source code into `dist/`.
  - Prunes devDependencies.
- **Stage 2 (Runner / Production)**:
  - Base: `node:20-alpine`
  - Runs as non-root user (`USER node`).
  - Copies compiled `dist/`, production `node_modules/`, and Prisma schema.
  - Exposes port 3000.
  - Implements container health checks via `/health` endpoint.

---

## 3. Docker Compose Orchestration

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: chat-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-chat_backend}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 5

  firestore-emulator:
    image: google/cloud-sdk:alpine
    container_name: chat-firestore-emulator
    restart: unless-stopped
    command: gcloud beta emulators firestore start --host-port=0.0.0.0:8080
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD", "nc", "-z", "localhost", "8080"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: chat-api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      firestore-emulator:
        condition: service_healthy
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@postgres:5432/${POSTGRES_DB:-chat_backend}?schema=public
      FIRESTORE_EMULATOR_HOST: firestore-emulator:8080
      FIREBASE_PROJECT_ID: ${FIREBASE_PROJECT_ID:-chat-backend-dev}
      JWT_SECRET: ${JWT_SECRET:-super-secret-jwt-key}
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  postgres_data:
```

---

## 4. Dual Firestore Connection Modes
1. **Local Emulator Mode (Default for Dev & Test)**:
   - Configured automatically when `FIRESTORE_EMULATOR_HOST=localhost:8080` (or `firestore-emulator:8080`).
   - Does not require GCP credentials or service account keys.
2. **Production Mode (GCP / Live Firestore)**:
   - When `FIRESTORE_EMULATOR_HOST` is unset.
   - Uses `GOOGLE_APPLICATION_CREDENTIALS` path pointing to mounted service-account JSON, or Google Application Default Credentials (ADC).
   - Never bakes credential files into the Docker image.
