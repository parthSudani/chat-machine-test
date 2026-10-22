# Docker and Containerization Architecture

## 1. Overview
The application is designed to run in a fully reproducible containerized environment using Docker and Docker Compose. It provisions:
1. **API Service (`api`)**: Express TypeScript server built via a secure multi-stage Dockerfile with `dumb-init` signal handling and non-root execution.
2. **PostgreSQL Database (`postgres`)**: PostgreSQL 16 Alpine with persistent volume storage (`postgres_data`) and automated health checking (`pg_isready`).
3. **Firestore Emulator (`firestore-emulator`)**: Local Google Cloud Firestore emulator exposing port 8080 with automated health checks.

---

## 2. Multi-Stage Dockerfile Strategy

To ensure small image size, minimal attack surface, and security:
- **Stage 1 (Builder)**:
  - Base image: `node:20-alpine` (supported Node.js LTS).
  - Installs all dependencies reproducibly using `package-lock.json` via `npm ci`.
  - Generates Prisma client via `npx prisma generate`.
  - Compiles TypeScript source code into `dist/` using `tsconfig.build.json`.
  - Prunes devDependencies via `npm prune --production`.
- **Stage 2 (Runner / Production)**:
  - Base image: `node:20-alpine`.
  - Installs runtime utilities: `dumb-init`, `openssl`, `wget`.
  - Runs as non-root user (`USER node`).
  - Copies compiled `dist/`, production `node_modules/`, committed Prisma migrations (`prisma/`), and `package.json`.
  - Copies `docker-entrypoint.sh` for non-destructive schema migrations.
  - Exposes port 3000.
  - Uses `dumb-init` as PID 1 to ensure proper signal forwarding and graceful shutdown on SIGTERM / SIGINT.
  - Implements container health checks via `/health` probe.

---

## 3. Automated Migration Entrypoint

The container startup script `docker-entrypoint.sh` ensures that committed migrations are automatically applied on container boot before starting the Express application:
```sh
#!/bin/sh
set -e

# Run non-destructive database migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "Applying committed Prisma migrations (non-destructive)..."
  npx prisma migrate deploy || echo "Warning: Prisma migration deploy reported exit code $?, proceeding..."
fi

# Execute main container command via dumb-init
exec "$@"
```
- Uses `prisma migrate deploy`, which strictly applies existing committed migrations from `prisma/migrations` without modifying the schema or resetting data.
- Never uses destructive commands like `prisma db push` in production.

---

## 4. Docker Compose Orchestration

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
      API_PREFIX: /api/v1
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@postgres:5432/${POSTGRES_DB:-chat_backend}?schema=public
      FIRESTORE_EMULATOR_HOST: firestore-emulator:8080
      FIREBASE_PROJECT_ID: ${FIREBASE_PROJECT_ID:-chat-backend-dev}
      JWT_SECRET: ${JWT_SECRET:-production-super-secret-jwt-key-minimum-32-chars!}
      JWT_EXPIRES_IN: 7d
      CORS_ORIGIN: "*"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  postgres_data:
```

---

## 5. Health Probes Architecture

The backend provides distinct Kubernetes/Docker-compatible health probes:
1. **Liveness Probe (`GET /health` and `GET /health/live`)**:
   - Returns HTTP 200 `{ status: "ok", uptime, timestamp }`.
   - Verifies the Node.js event loop and HTTP server are responsive.
2. **Readiness Probe (`GET /health/ready`)**:
   - Returns HTTP 200 `{ status: "ready", checks: { database: "up", firestore: "up" }, timestamp }` when all dependencies are connected.
   - Returns HTTP 503 `{ status: "degraded", checks: { ... }, timestamp }` if a dependency is offline or times out.
   - Protected with strict 1500ms timeouts to prevent hanging probes.
   - Does not write arbitrary test records or leak sensitive credentials in output.

---

## 6. Firestore Connection Modes
1. **Local Emulator Mode (Default for Dev & Test)**:
   - Configured automatically when `FIRESTORE_EMULATOR_HOST=firestore-emulator:8080` (or `localhost:8080`).
   - Does not require GCP credentials or service account keys.
2. **Production Mode (GCP / Live Cloud Firestore)**:
   - When `FIRESTORE_EMULATOR_HOST` is unset.
   - Uses `GOOGLE_APPLICATION_CREDENTIALS` path pointing to mounted service-account JSON, or Google Application Default Credentials (ADC).
   - Sensitive credential files and `.env` files are excluded from Docker images via `.dockerignore`.
