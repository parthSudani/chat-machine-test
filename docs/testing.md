# Testing Strategy and Test Plan

## 1. Overview
The testing architecture employs a multi-tiered test suite powered by **Vitest** and **Supertest**:
- **Unit Tests**: Test business logic, domain algorithms (monotonicity comparison, canonical pair sorting), authentication helpers, and validation schemas in total isolation.
- **Integration Tests**: Test real HTTP routes using Supertest against a live PostgreSQL test database and the Google Cloud Firestore Emulator.
- **Concurrency Tests**: Specifically verify the absence of race conditions in 1:1 chat creation and last-seen updating.

---

## 2. Test Environments

### Environment Matrix
| Layer | Environment | Tools |
|---|---|---|
| **Unit** | Node.js (Vitest) | Vitest, In-Memory Mocks |
| **Integration** | Supertest + Local PostgreSQL + Firestore Emulator | Supertest, Prisma Client, Firebase Admin SDK |
| **E2E / Docker** | Multi-container Docker Compose | PostgreSQL container, Firestore Emulator container, API container |

---

## 3. Test Suites and Scenarios

### Suite 1: Authentication & Authorization
- `POST /auth/register`:
  - Registers new user with hashed password.
  - Rejects duplicate email (409 Conflict).
  - Rejects invalid password (short / missing characters).
- `POST /auth/login`:
  - Issues valid JWT on valid credentials.
  - Rejects incorrect password (401 Unauthorized).
- `Security & Authorization`:
  - Protected routes reject missing token (401 Unauthorized).
  - Protected routes reject forged / expired tokens (401 Unauthorized).
  - User cannot act on behalf of another user (403 Forbidden).

### Suite 2: Chat Creation & Concurrency
- `POST /chat/create`:
  - Creates 1:1 chat when none exists (201 Created).
  - Returns existing chat when called again with identical users (200 OK).
  - Returns existing chat when called with inverted order: `(userB, userA)` returns the same chat as `(userA, userB)`.
  - Rejects self-chat attempt: `userAId === userBId` (400 Bad Request).
  - **Concurrency Stress Test**:
    - Fire 20 parallel `Promise.all` requests creating a chat between user A and user B.
    - Assert that exactly **one** chat is created in PostgreSQL and all 20 requests resolve successfully returning the exact same chat ID.

### Suite 3: Message Persistence & Ordering
- `POST /chat/:chatId/message/send`:
  - Saves message to Firestore with server timestamp.
  - Non-members are forbidden from sending messages (403 Forbidden).
  - Non-existent chat returns 404 Not Found.
  - Rejects empty or oversized messages (400 Bad Request).
- `GET /chat/:chatId/messages`:
  - Returns messages in chronological order (`createdAt ASC`, stable tie-break with doc ID).
  - Cursor pagination correctly navigates through message history without gaps or duplicates.
  - Non-members cannot read messages (403 Forbidden).

### Suite 4: Read Receipts & Idempotency
- `POST /chat/:chatId/message/:messageId/read`:
  - Saves read receipt under `chats/{chatId}/messages/{messageId}/receipts/{userId}`.
  - Multiple calls from the same user are strictly idempotent.
  - Non-members cannot record read receipts (403 Forbidden).

### Suite 5: Last-Seen Monotonicity
- `POST /chat/:chatId/lastseen`:
  - Advances last seen pointer when given a newer message (status: `updated`).
  - Ignores update when given an older message than current pointer (status: `ignored_older_than_current`).
  - Does not allow pointer to regress backward in time.
  - Rejects nonexistent message ID (404 Not Found).

### Suite 6: User Chats Listing
- `GET /user/:userId/chats`:
  - Returns all chats that the user is a member of.
  - Includes participant member IDs and roles.
  - Supports page & limit pagination.
  - User cannot view another user's chat list without authorization (403 Forbidden).

---

## 4. Test Execution Commands

```bash
# Run unit tests only
npm.cmd run test:unit

# Run integration tests (requires PostgreSQL & Firestore Emulator)
npm.cmd run test:integration

# Run full test suite with coverage
npm.cmd run test:coverage
```
