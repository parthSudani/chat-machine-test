# Technical Assessment Requirements Checklist

## 1. Mandatory API Endpoints
- [x] **POST /chat/create**
  - [x] Accepts `userAId`, `userBId`
  - [x] Returns existing chat ID or creates a new 1:1 chat
  - [x] Prevents duplicate conversations (canonical pair constraint)
  - [x] Prevents duplicate conversations under concurrent requests
- [x] **POST /chat/:chatId/message/send**
  - [x] Accepts `senderId`, `text`
  - [x] Verifies chat membership
  - [x] Saves message in Firestore with server timestamp
- [x] **GET /chat/:chatId/messages?limit=50**
  - [x] Returns authorized chat messages
  - [x] Ordered chronologically (stable ordering with document ID tie-breaker)
  - [x] Supports cursor-based pagination
- [x] **POST /chat/:chatId/message/:messageId/read**
  - [x] Accepts `userId`
  - [x] Saves idempotent read receipt in Firestore under `chats/{chatId}/messages/{messageId}/receipts/{userId}`
- [x] **POST /chat/:chatId/lastseen**
  - [x] Accepts `userId`, `messageId`
  - [x] Updates user's last-seen message and timestamp in `chats/{chatId}/members/{userId}`
  - [x] Prevents last-seen pointer from moving backwards (monotonicity guarantee)
- [x] **GET /user/:userId/chats**
  - [x] Returns chats and member IDs from PostgreSQL
  - [x] Includes pagination support

## 2. Bonus Features
- [ ] Group chat creation and membership management (`POST /chat/group`, `POST /chat/:chatId/members`, `DELETE /chat/:chatId/members/:userId`)
- [ ] Edit message (`PATCH /chat/:chatId/message/:messageId`)
- [ ] Soft-delete message (`DELETE /chat/:chatId/message/:messageId`)

## 3. Technology Stack & Quality Standards
- [x] Node.js LTS with TypeScript strict mode enabled (no `any`)
- [x] Express.js with cleanly separated routes, controllers, services, repositories
- [x] PostgreSQL + Prisma ORM with migrations
- [x] Google Cloud Firestore + Firebase Admin SDK
- [x] Dual-mode Firestore: Real GCP Firestore + Firebase Emulator Suite
- [x] Zod schema validation for all inputs and environment variables
- [x] JWT authentication + bcrypt password hashing
- [x] Vitest + Supertest automated testing suite
- [x] Multi-stage Dockerfile + Docker Compose with health checks
- [x] Structured logging and centralized error handling with safe production error responses
- [x] CORS, helmet, and input size limits
- [x] OpenAPI / Swagger specification

## 4. Architecture & Data Ownership Rules
- [x] PostgreSQL is the source of truth for Users, Chats, and Memberships
- [x] Firestore is the source of truth for Messages, Read Receipts, and Last-Seen state
- [x] Messages are strictly never stored in PostgreSQL
- [x] Firestore paths:
  - `chats/{chatId}/messages/{messageId}`
  - `chats/{chatId}/messages/{messageId}/receipts/{userId}`
  - `chats/{chatId}/members/{userId}`
- [x] Monotonic last-seen update logic via Firestore transaction
- [x] Canonical ordering for 1:1 chat concurrency safety (`participantOneId < participantTwoId`)
