# Comprehensive Test Plan and Traceability Matrix

## 1. Traceability Matrix

| Requirement / Endpoint | Category | Test File | Test Cases & Scenarios |
|---|---|---|---|
| **User Registration** (`POST /auth/register`) | Unit / API | `tests/unit/auth.service.test.ts`<br>`tests/unit/api.test.ts`<br>`tests/unit/validation.test.ts` | • Registers user with hashed password<br>• Normalizes email to lowercase<br>• Rejects duplicate email (409)<br>• Rejects invalid email format (400)<br>• Rejects weak password (<8 chars)<br>• Never exposes `passwordHash` |
| **User Login** (`POST /auth/login`) | Unit / API | `tests/unit/auth.service.test.ts`<br>`tests/unit/api.test.ts`<br>`tests/unit/validation.test.ts` | • Issues valid JWT on valid credentials<br>• Rejects nonexistent email (401)<br>• Rejects incorrect password (401)<br>• Rejects empty password (400)<br>• Never exposes `passwordHash` |
| **Mandatory 1: Create 1:1 Chat** (`POST /chat/create`) | Unit / API / DB Integration | `tests/unit/chat.service.test.ts`<br>`tests/unit/api.test.ts`<br>`tests/integration/chat.postgres.test.ts` | • Creates direct chat with both members (201)<br>• Deterministically sorts user IDs canonically (`min < max`)<br>• Idempotently returns existing chat (200)<br>• Reversed user order returns same chat ID (200)<br>• Rejects self-chat attempt (400)<br>• Rejects caller unauthorized for pair (403)<br>• Rejects unknown user (404)<br>• Rejects invalid UUID (400)<br>• **Concurrency**: Parallel requests create exactly 1 chat |
| **Mandatory 2: Send Message** (`POST /chat/:chatId/message/send`) | Unit / API | `tests/unit/message.service.test.ts`<br>`tests/unit/api.messages.test.ts`<br>`tests/unit/security.regression.test.ts` | • Persists message in Firestore with server timestamp (201)<br>• Rejects unauthenticated caller (401)<br>• Rejects mismatched `senderId` (403)<br>• Rejects non-member attempt (403)<br>• Rejects nonexistent chat (404)<br>• Rejects empty / whitespace-only text (400)<br>• Rejects oversized text (>4000 chars) (400) |
| **Mandatory 3: Get Messages** (`GET /chat/:chatId/messages`) | Unit / API | `tests/unit/message.service.test.ts`<br>`tests/unit/api.messages.test.ts` | • Retrieves chronologically ordered messages (`createdAt ASC`)<br>• Stable tie-break using document ID<br>• Cursor-based pagination (`startAfter`)<br>• Limit validation (default 50, max 100)<br>• Empty chat returns empty array<br>• Rejects non-member attempt (403) |
| **Mandatory 4: Mark Read** (`POST /chat/:chatId/message/:messageId/read`) | Unit / API / Firestore Integration | `tests/unit/readReceipt.service.test.ts`<br>`tests/unit/api.phase4.test.ts`<br>`tests/integration/phase4.emulator.test.ts` | • Persists receipt at `chats/{chatId}/messages/{messageId}/receipts/{userId}`<br>• Uses Firestore server timestamp<br>• **Idempotency**: Repeat request preserves original `readAt`<br>• Rejects non-member (403)<br>• Rejects mismatched body `userId` (403)<br>• Rejects unknown chat/message (404) |
| **Mandatory 5: Last-Seen Tracking** (`POST /chat/:chatId/lastseen`) | Unit / API / Firestore Integration | `tests/unit/lastSeen.service.test.ts`<br>`tests/unit/api.phase4.test.ts`<br>`tests/integration/phase4.emulator.test.ts` | • Updates state at `chats/{chatId}/members/{userId}` (200)<br>• Newer message advances pointer (`updated`)<br>• **Monotonicity**: Older message ignored (`ignored_older_than_current`)<br>• Equal timestamp tie-break via document ID<br>• Rejects non-member (403)<br>• Rejects mismatched body `userId` (403)<br>• Rejects unknown chat/message (404) |
| **Mandatory 6: List User Chats** (`GET /user/:userId/chats`) | Unit / API | `tests/unit/userChat.service.test.ts`<br>`tests/unit/api.userChat.test.ts` | • Returns user's conversations and `memberIds`<br>• Single query eager-load (Zero N+1)<br>• Stable ordering (`updatedAt desc, id desc`)<br>• Empty list for user with no conversations<br>• Pagination (limit, nextCursor)<br>• Rejects attempt to view another user's chats (403)<br>• Rejects unauthenticated request (401) |
| **Security & Reliability** | Unit / Regression / E2E | `tests/unit/security.regression.test.ts`<br>`tests/unit/reliability.test.ts`<br>`tests/e2e/chat.workflow.e2e.test.ts` | • Missing JWT rejected on all 6 endpoints (401)<br>• Expired / forged JWT rejected (401)<br>• Malformed JSON returns 400<br>• Payload > 100kb rejected (413)<br>• Rate limiting active<br>• No stack trace exposure in error responses<br>• Request ID tracking with `X-Request-Id`<br>• Full end-to-end user lifecycle test |

---

## 2. Test Execution Commands

```bash
# Run all tests (unit, API, security, e2e, integration)
npm test

# Run tests with code coverage report
npm run test:coverage

# Run unit tests only
npm run test:unit

# Run type check and lint
npm run typecheck
npm run lint
```
