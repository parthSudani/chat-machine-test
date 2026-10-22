# Chat Backend

A production-quality Chat Backend built with Node.js LTS, TypeScript (strict mode), Express, PostgreSQL (Prisma ORM), and Google Cloud Firestore.

## 1. Architecture Overview

- **PostgreSQL**: Source of truth for `Users`, `Chats`, and `ChatMembers`. Enforces relational integrity, UUID keys, unique constraints, and canonical ordering for 1:1 chat concurrency safety.
- **Firestore**: Source of truth for `Messages`, idempotent `Receipts`, and monotonic `Last-Seen` cursors (implemented in Phase 3 & 4). Messages are never stored in PostgreSQL.

## 2. Prerequisites

- **Node.js**: `v20+` (v24 LTS recommended)
- **npm**: `v10+`
- **PostgreSQL** or **Docker**: For running PostgreSQL database container

## 3. Getting Started

### Clone and Install Dependencies
```bash
git clone <repo-url>
cd chat-machine-test
npm install
```

### Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` matches your PostgreSQL connection string:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat_backend?schema=public"
JWT_SECRET="your-secure-jwt-secret-at-least-32-characters"
```

### Database Migrations
Generate Prisma client and apply migrations:
```bash
npm run prisma:generate
npm run prisma:migrate:deploy
```

### Running Locally
```bash
# Development mode with hot-reload
npm run dev

# Production build and run
npm run build
npm start
```

## 4. Running Tests

```bash
# Run all tests (unit + API + integration)
npm test

# Run unit tests only
npm run test:unit

# Run type check and linter
npm run typecheck
npm run lint
```

## 5. API Endpoints (Phase 2)

### 1. Register User: `POST /auth/register`
**Request**:
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Smith",
    "email": "alice@example.com",
    "password": "Password123!"
  }'
```
**Response (201 Created)**:
```json
{
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Alice Smith",
    "email": "alice@example.com",
    "createdAt": "2026-10-22T08:00:00.000Z",
    "updatedAt": "2026-10-22T08:00:00.000Z"
  },
  "token": "eyJhbGciOi..."
}
```

### 2. Login: `POST /auth/login`
**Request**:
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "Password123!"
  }'
```
**Response (200 OK)**:
```json
{
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Alice Smith",
    "email": "alice@example.com"
  },
  "token": "eyJhbGciOi..."
}
```

### 3. Create or Retrieve Direct Chat: `POST /chat/create`
**Request**:
```bash
curl -X POST http://localhost:3000/chat/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "userAId": "11111111-1111-4111-8111-111111111111",
    "userBId": "22222222-2222-4222-8222-222222222222"
  }'
```
**Response (201 Created or 200 OK)**:
```json
{
  "chatId": "33333333-3333-4333-8333-333333333333"
}
```

### 4. Mark Message Read: `POST /chat/:chatId/message/:messageId/read`
**Request**:
```bash
curl -X POST http://localhost:3000/chat/33333333-3333-4333-8333-333333333333/message/msg_123/read \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "userId": "11111111-1111-4111-8111-111111111111"
  }'
```
**Response (200 OK)**:
```json
{
  "messageId": "msg_123",
  "userId": "11111111-1111-4111-8111-111111111111",
  "readAt": "2026-10-22T08:00:00.000Z",
  "status": "read"
}
```

### 5. Update Last Seen: `POST /chat/:chatId/lastseen`
**Request**:
```bash
curl -X POST http://localhost:3000/chat/33333333-3333-4333-8333-333333333333/lastseen \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "userId": "11111111-1111-4111-8111-111111111111",
    "messageId": "msg_123"
  }'
```
**Response (200 OK)**:
```json
{
  "chatId": "33333333-3333-4333-8333-333333333333",
  "userId": "11111111-1111-4111-8111-111111111111",
  "lastSeenMessageId": "msg_123",
  "lastSeenAt": "2026-10-22T08:00:00.000Z",
  "status": "updated"
}
```

### 6. List User Chats: `GET /user/:userId/chats`
**Request**:
```bash
curl -X GET "http://localhost:3000/user/11111111-1111-4111-8111-111111111111/chats?limit=20" \
  -H "Authorization: Bearer <token>"
```
**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "chats": [
      {
        "chatId": "33333333-3333-4333-8333-333333333333",
        "type": "DIRECT",
        "memberIds": [
          "11111111-1111-4111-8111-111111111111",
          "22222222-2222-4222-8222-222222222222"
        ],
        "createdAt": "2026-10-22T10:00:00.000Z"
      }
    ],
    "nextCursor": null
  }
}
```

## 6. Concurrency & Duplicate Prevention Architecture

- For every direct 1:1 chat between User A and User B, the backend deterministically sorts user IDs canonically:
  `participantOneId = min(userAId, userBId)`
  `participantTwoId = max(userAId, userBId)`
- PostgreSQL enforces uniqueness with `@@unique([participantOneId, participantTwoId])`.
- Atomic Prisma transactions catch constraint violations (`P2002`) to ensure that even simultaneous concurrent requests always resolve to the exact same conversation ID.
