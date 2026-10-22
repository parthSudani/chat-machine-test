# Technical Assessment Requirements Checklist

## 1. Mandatory API Endpoints
- [ ] **POST /chat/create**
  - [ ] Accepts `userAId`, `userBId`
  - [ ] Returns existing chat ID or creates a new 1:1 chat
  - [ ] Prevents duplicate conversations (canonical pair constraint)
  - [ ] Prevents duplicate conversations under concurrent requests
- [ ] **POST /chat/:chatId/message/send**
  - [ ] Accepts `senderId`, `text`
  - [ ] Verifies chat membership
  - [ ] Saves message in Firestore with server timestamp
- [ ] **GET /chat/:chatId/messages?limit=50**
  - [ ] Returns authorized chat messages
  - [ ] Ordered chronologically (stable ordering with document ID tie-breaker)
  - [ ] Supports cursor-based pagination
- [ ] **POST /chat/:chatId/message/:messageId/read**
  - [ ] Accepts `userId`
  - [ ] Saves idempotent read receipt in Firestore under `chats/{chatId}/messages/{messageId}/receipts/{userId}`
- [ ] **POST /chat/:chatId/lastseen**
  - [ ] Accepts `userId`, `messageId`
  - [ ] Updates user's last-seen message and timestamp in `chats/{chatId}/members/{userId}`
  - [ ] Prevents last-seen pointer from moving backwards (monotonicity guarantee)
- [ ] **GET /user/:userId/chats**
  - [ ] Returns chats and member IDs from PostgreSQL
  - [ ] Includes pagination support

## 2. Bonus Features
- [ ] Group chat creation and membership management (`POST /chat/group`, `POST /chat/:chatId/members`, `DELETE /chat/:chatId/members/:userId`)
- [ ] Edit message (`PATCH /chat/:chatId/message/:messageId`)
- [ ] Soft-delete message (`DELETE /chat/:chatId/message/:messageId`)

## 3. Technology Stack & Quality Standards
- [ ] Node.js LTS with TypeScript strict mode enabled (no `any`)
- [ ] Express.js with cleanly separated routes, controllers, services, repositories
- [ ] PostgreSQL + Prisma ORM with migrations
- [ ] Google Cloud Firestore + Firebase Admin SDK
- [ ] Dual-mode Firestore: Real GCP Firestore + Firebase Emulator Suite
- [ ] Zod schema validation for all inputs and environment variables
- [ ] JWT authentication + bcrypt password hashing
- [ ] Vitest + Supertest automated testing suite
- [ ] Multi-stage Dockerfile + Docker Compose with health checks
- [ ] Structured logging with request IDs (correlation IDs)
- [ ] Centralized error handling with safe production error responses
- [ ] CORS, helmet, and rate limiting security middleware
- [ ] OpenAPI / Swagger specification & Postman collection

## 4. Architecture & Data Ownership Rules
- [ ] PostgreSQL is the source of truth for Users, Chats, and Memberships
- [ ] Firestore is the source of truth for Messages, Read Receipts, and Last-Seen state
- [ ] Messages are strictly never stored in PostgreSQL
- [ ] Firestore paths:
  - `chats/{chatId}/messages/{messageId}`
  - `chats/{chatId}/messages/{messageId}/receipts/{userId}`
  - `chats/{chatId}/members/{userId}`
- [ ] Monotonic last-seen update logic via Firestore transaction
- [ ] Canonical ordering for 1:1 chat concurrency safety (`participantOneId < participantTwoId`)
