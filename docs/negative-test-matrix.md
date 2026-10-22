# Exhaustive Negative Test Matrix & Security Resilience Guide

**Project**: Chat Backend (Node.js LTS, Express, PostgreSQL + Prisma, Google Cloud Firestore)  
**Document**: Negative Test Matrix & Threat Surface Mapping  
**Author**: Principal QA Engineer & Backend Security Tester  
**Date**: 2026-10-22  

---

## 1. Overview & Threat Modeling

This document maps all negative test scenarios, boundary violations, malicious inputs, unauthorized access attempts, and distributed race condition attacks against the Chat Backend. Every test scenario specifies the attack vector, input payload, expected HTTP status, expected error code, and security invariants.

---

## 2. Negative Test Matrix by Functional Area

### 2.1 Category 3 & 4: Registration, Login & Authentication Negative Cases

| Test ID | Scenario Description | Malicious / Negative Input Payload | Expected Status | Expected Error Code / Behavior |
|---|---|---|---|---|
| **USR-002** | Missing Name Field | `{"email": "valid@example.com", "password": "Password123!"}` | `400 Bad Request` | `VALIDATION_ERROR` (Required name) |
| **USR-003** | Missing Email Field | `{"name": "Alice", "password": "Password123!"}` | `400 Bad Request` | `VALIDATION_ERROR` (Required email) |
| **USR-004** | Missing Password Field | `{"name": "Alice", "email": "valid@example.com"}` | `400 Bad Request` | `VALIDATION_ERROR` (Required password) |
| **USR-005** | Empty String Name | `{"name": "", "email": "valid@example.com", "password": "Password123!"}` | `400 Bad Request` | `VALIDATION_ERROR` (Min length 1) |
| **USR-006** | Whitespace-Only Name | `{"name": "   ", "email": "valid@example.com", "password": "Password123!"}` | `400 Bad Request` | `VALIDATION_ERROR` (Trimmed length 1) |
| **USR-007** | Invalid Email Syntax | `{"name": "Alice", "email": "invalid-email-address", "password": "Password123!"}` | `400 Bad Request` | `VALIDATION_ERROR` (Invalid email) |
| **USR-010** | Duplicate Email Conflict | Register `alice@example.com` twice | `409 Conflict` | `USER_ALREADY_EXISTS` |
| **USR-013** | Short Password (<8 chars) | `{"name": "Alice", "email": "a@ex.com", "password": "123"}` | `400 Bad Request` | `VALIDATION_ERROR` (Password min 8) |
| **USR-016** | Null Primitive Injection | `{"name": null, "email": null, "password": null}` | `400 Bad Request` | `VALIDATION_ERROR` (Expected string) |
| **USR-018** | Malformed JSON Syntax | Raw body: `{"name": "Alice", email: incomplete` | `400 Bad Request` | Express JSON parser rejection |
| **USR-019** | Oversized Registration Payload | Payload body exceeding 100kb | `413 Payload Too Large` | Body parser size threshold rejection |
| **AUTH-002** | Incorrect Password | `{"email": "alice@example.com", "password": "WrongPassword!"}` | `401 Unauthorized` | `INVALID_CREDENTIALS` |
| **AUTH-003** | Nonexistent User Login | `{"email": "ghost@example.com", "password": "Password123!"}` | `401 Unauthorized` | `INVALID_CREDENTIALS` (Timing safe) |
| **AUTH-013** | Missing Authorization Header | Header omitted on protected endpoint | `401 Unauthorized` | `UNAUTHORIZED` (Missing token) |
| **AUTH-014** | Empty Bearer Token | `Authorization: Bearer ` | `401 Unauthorized` | `UNAUTHORIZED` (Missing bearer token) |
| **AUTH-015** | Malformed JWT String | `Authorization: Bearer not-a-jwt` | `401 Unauthorized` | `INVALID_TOKEN` (Malformed token) |
| **AUTH-017** | Invalid JWT Signature | Tampered header/payload with untouched signature | `401 Unauthorized` | `INVALID_TOKEN` (Signature invalid) |
| **AUTH-018** | Incorrect Signing Secret | Token signed with random third-party secret | `401 Unauthorized` | `INVALID_TOKEN` (Verification failed) |
| **AUTH-019** | Expired JWT Token | Token with `exp` in the past | `401 Unauthorized` | `TOKEN_EXPIRED` (Expired token) |
| **AUTH-025** | Unsigned Alg None Token | Header: `{"alg": "none"}` | `401 Unauthorized` | `INVALID_TOKEN` (Algorithm unsupported) |

---

### 2.2 Category 5: Chat Creation (`POST /chat/create`) Negative Cases

| Test ID | Scenario Description | Negative Input Payload | Expected Status | Expected Error Code / Invariant |
|---|---|---|---|---|
| **CHAT-006** | Invalid userAId UUID | `{"userAId": "not-a-uuid", "userBId": "22222222-2222-4222-8222-222222222222"}` | `400 Bad Request` | `VALIDATION_ERROR` (Invalid UUID) |
| **CHAT-007** | Invalid userBId UUID | `{"userAId": "11111111-1111-4111-8111-111111111111", "userBId": "bad-id"}` | `400 Bad Request` | `VALIDATION_ERROR` (Invalid UUID) |
| **CHAT-008** | Missing userAId | `{"userBId": "22222222-2222-4222-8222-222222222222"}` | `400 Bad Request` | `VALIDATION_ERROR` (Missing userAId) |
| **CHAT-012** | Self-Chat Attempt | `{"userAId": "11111111-...", "userBId": "11111111-..."}` | `400 Bad Request` | `CANNOT_CHAT_WITH_SELF` |
| **CHAT-013** | Nonexistent userAId | Nonexistent UUID for userA in PostgreSQL | `404 Not Found` | `USER_NOT_FOUND` |
| **CHAT-014** | Nonexistent userBId | Nonexistent UUID for userB in PostgreSQL | `404 Not Found` | `USER_NOT_FOUND` |
| **CHAT-016** | Third-Party Impersonation | Caller Charlie creates chat between Alice & Bob | `403 Forbidden` | `FORBIDDEN` (Caller not in pair) |
| **CHAT-020** | Concurrent Pair Collision | 20 parallel requests for same pair | `200/201 OK` | Exactly 1 chat created in DB; no duplicates |

---

### 2.3 Category 6: Send Message (`POST /chat/:chatId/message/send`) Negative Cases

| Test ID | Scenario Description | Negative Input Payload | Expected Status | Expected Error Code / Invariant |
|---|---|---|---|---|
| **MSG-004** | Nonexistent Chat ID | Valid UUID not existing in PostgreSQL | `404 Not Found` | `CHAT_NOT_FOUND` |
| **MSG-005** | Malformed Chat UUID | `POST /chat/not-a-uuid/message/send` | `400 Bad Request` | `VALIDATION_ERROR` (Invalid UUID param) |
| **MSG-006** | Non-Member Send Attempt | Caller Eve (not member) attempts to send message | `403 Forbidden` | `NOT_CHAT_MEMBER` |
| **MSG-008** | Sender ID Spoofing | Caller Alice passes `senderId: Bob` in body | `403 Forbidden` | `FORBIDDEN_SENDER_SPOOFING` |
| **MSG-009** | Empty Message Text | `{"senderId": "Alice", "text": ""}` | `400 Bad Request` | `VALIDATION_ERROR` (Min length 1) |
| **MSG-010** | Whitespace-Only Text | `{"senderId": "Alice", "text": "    "}` | `400 Bad Request` | `VALIDATION_ERROR` (Trimmed length 1) |
| **MSG-015** | Oversized Text (>5000 chars)| `{"senderId": "Alice", "text": "a".repeat(5001)}` | `400 Bad Request` | `VALIDATION_ERROR` (Max length 5000) |
| **MSG-020** | Client Timestamp Override | Body contains `createdAt: "2020-01-01"` | `201 Created` | Ignored; server timestamp strictly enforced |

---

### 2.4 Category 7: Message Retrieval (`GET /chat/:chatId/messages`) Negative Cases

| Test ID | Scenario Description | Negative Query Parameters | Expected Status | Expected Error Code / Invariant |
|---|---|---|---|---|
| **GET-003** | Nonexistent Chat | Nonexistent chat UUID | `404 Not Found` | `CHAT_NOT_FOUND` |
| **GET-006** | Non-Member Read Attempt | Caller Eve requests messages for Alice-Bob chat | `403 Forbidden` | `NOT_CHAT_MEMBER` |
| **GET-009** | Zero Limit Parameter | `?limit=0` | `400 Bad Request` | `VALIDATION_ERROR` (Limit min 1) |
| **GET-010** | Negative Limit Parameter | `?limit=-10` | `400 Bad Request` | `VALIDATION_ERROR` (Limit min 1) |
| **GET-011** | Non-Numeric Limit String | `?limit=fifty` | `400 Bad Request` | `VALIDATION_ERROR` (Limit must be integer) |
| **GET-013** | Excessive Limit (>100) | `?limit=1000` | `400 Bad Request` | `VALIDATION_ERROR` (Limit max 100) |
| **GET-016** | Cross-Chat Cursor Spoofing | Cursor doc ID belonging to different chat | `200 OK` | Cursor ignored or safe empty slice; no leakage |

---

### 2.5 Category 8: Read Receipts (`POST /chat/:chatId/message/:messageId/read`) Negative Cases

| Test ID | Scenario Description | Negative Input Payload | Expected Status | Expected Error Code / Invariant |
|---|---|---|---|---|
| **READ-005** | Nonexistent Chat | Nonexistent chat UUID | `404 Not Found` | `CHAT_NOT_FOUND` |
| **READ-006** | Nonexistent Message | Valid chat, but message ID does not exist | `404 Not Found` | `MESSAGE_NOT_FOUND` |
| **READ-008** | Non-Member Reader | Caller Eve attempts to mark message as read | `403 Forbidden` | `NOT_CHAT_MEMBER` |
| **READ-010** | Body User ID Mismatch | Caller Alice passes `userId: Bob` in body | `403 Forbidden` | `FORBIDDEN_USER_MISMATCH` |
| **READ-014** | Repeat Read Request | Second identical read request from Bob | `200 OK` | Idempotent: `isNew: false`, `readAt` identical |

---

### 2.6 Category 9: Last-Seen Tracking (`POST /chat/:chatId/lastseen`) Negative Cases

| Test ID | Scenario Description | Negative Input Payload | Expected Status | Expected Error Code / Invariant |
|---|---|---|---|---|
| **SEEN-003** | Nonexistent Chat | Nonexistent chat UUID | `404 Not Found` | `CHAT_NOT_FOUND` |
| **SEEN-004** | Nonexistent Message | Message ID not found in chat | `404 Not Found` | `MESSAGE_NOT_FOUND` |
| **SEEN-006** | Non-Member Update | Caller Eve attempts to update last-seen cursor | `403 Forbidden` | `NOT_CHAT_MEMBER` |
| **SEEN-008** | Body User ID Mismatch | Caller Alice passes `userId: Bob` in body | `403 Forbidden` | `FORBIDDEN_USER_MISMATCH` |
| **SEEN-011** | Backwards Pointer Regress | Message ID older than current `lastSeenMessageId` | `200 OK` | Monotonic guard: `status: 'ignored_older_than_current'` |
| **SEEN-012** | Repeated Current Pointer | Same message ID as current | `200 OK` | Idempotent: `status: 'already_current'` |

---

### 2.7 Category 10: List User Chats (`GET /user/:userId/chats`) Negative Cases

| Test ID | Scenario Description | Negative Query Parameters | Expected Status | Expected Error Code / Invariant |
|---|---|---|---|---|
| **LIST-005** | Malformed User ID | `GET /user/invalid-uuid/chats` | `400 Bad Request` | `VALIDATION_ERROR` (Invalid UUID) |
| **LIST-007** | Unauthenticated Request | Request omitted `Authorization` header | `401 Unauthorized` | `UNAUTHORIZED` |
| **LIST-008** | Anti-Spoofing Violation | Caller Alice attempts to list chats of Bob | `403 Forbidden` | `FORBIDDEN_CROSS_USER_ACCESS` |
| **LIST-011** | Invalid Limit Boundary | `?limit=0` or `?limit=101` | `400 Bad Request` | `VALIDATION_ERROR` (Limit 1..100) |

---

### 2.8 Category 11–14: Injection, Headers, Rate Limiting & DoS Protection

| Test ID | Scenario Description | Malicious Input Payload | Expected Status | Security Invariant |
|---|---|---|---|---|
| **INJ-001** | SQL Injection in User Name | `' OR 1=1; DROP TABLE users; --` | `201 Created` / `400` | Safely parameterized via Prisma; inert string |
| **INJ-003** | SQL Injection in Message Text| `UNION SELECT * FROM users --` | `201 Created` | Stored as inert text in Firestore; no SQL executed |
| **INJ-005** | NoSQL Operator Injection | `{"senderId": {"$ne": null}, "text": "hello"}` | `400 Bad Request` | Zod rejects non-string primitive with type error |
| **INJ-009** | XSS Script Tag in Message | `<script>alert('xss')</script>` | `201 Created` | Stored as plain string; no HTML evaluation |
| **INJ-011** | Unicode Overflow / Bomb | 10,000 multi-byte Unicode runes | `400 Bad Request` | Rejected by string length boundary validator |
| **RATE-001** | Login Rate Limit Flooding | >30 requests per minute to `/auth/login` | `429 Too Many Requests` | IP throttled; RFC error structure returned |
| **HTTP-004** | Missing Helmet Headers Check| Inspect response headers | `200/400/404` | `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` present |
| **HTTP-005** | Unsupported HTTP Method | `TRACE /chat/create` or `PUT /auth/login` | `404/405` | Blocked safely without server crash |

---

## 3. Summary of Negative Security Rules

1. **Authentication Invariant**: Zero endpoints allow unauthorized callers to read, write, or list data.
2. **Authorization Invariant**: Identity is derived exclusively from verified JWT cryptographic signature (`req.user.id`). Any caller-provided body/param identifier that deviates from `req.user.id` is rejected with `403 Forbidden`.
3. **Data Immutability Invariant**: Messages cannot be edited or deleted once appended; server timestamps override any client-supplied time.
4. **Concurrency Invariant**: Canonical user ordering (`min < max`) ensures dual simultaneous requests collapse into a single database row.
5. **Monotonicity Invariant**: Backward last-seen movements are ignored transactionally without throwing false errors.
