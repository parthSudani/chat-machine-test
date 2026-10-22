# API Specification and Contracts

## 1. Authentication and Identity Model

To satisfy both the strict production security requirements and the assessment-specified body parameters:
1. **Production Mode (Default)**: Protected endpoints require a valid JWT passed in the `Authorization: Bearer <token>` header. The authenticated user identity (`req.user.id`) is enforced as the principal.
2. **Assessment Compatibility**: When a request body specifies `userId` or `senderId`, the backend validates that it matches `req.user.id`. In test / evaluation environments where `ALLOW_DEV_IMPERSONATION=true`, requests without tokens can pass an `X-User-Id` header or body parameters for convenience.
3. **Response Envelope**: All endpoints return structured JSON envelopes:
   - Success: `{ "success": true, "data": ... }`
   - Error: `{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }`

---

## 2. Authentication Endpoints

### POST `/auth/register`
Creates a new user account.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "Password123!",
  "displayName": "Alice Smith"
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "cuid_user_1",
      "email": "user@example.com",
      "displayName": "Alice Smith",
      "createdAt": "2026-10-22T08:00:00.000Z"
    },
    "token": "eyJhbGciOi..."
  }
}
```

### POST `/auth/login`
Authenticates an existing user.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "cuid_user_1",
      "email": "user@example.com",
      "displayName": "Alice Smith"
    },
    "token": "eyJhbGciOi..."
  }
}
```

---

## 3. Mandatory Chat Endpoints

### 1. POST `/chat/create`
Creates or returns an existing 1:1 chat between two users.

- **Idempotency / Concurrency**: Handled atomically via canonical participant IDs and PostgreSQL unique constraints.
- **Request Body**:
```json
{
  "userAId": "cuid_user_1",
  "userBId": "cuid_user_2"
}
```
- **Validation Rules**:
  - `userAId` and `userBId` must be valid, existing user IDs.
  - `userAId` cannot equal `userBId` (cannot create 1:1 chat with oneself).
  - Authenticated user must be either `userAId` or `userBId`.

- **Response (201 Created or 200 OK)**:
```json
{
  "chatId": "33333333-3333-4333-8333-333333333333"
}
```

---

### 2. POST `/chat/:chatId/message/send`
Sends a message to an authorized chat, persisted in Firestore.

- **Authorization**: Sender must be an active member of `chatId`.
- **Request Body**:
```json
{
  "senderId": "cuid_user_1",
  "text": "Hello, this is a test message!"
}
```
- **Validation Rules**:
  - `text`: Non-empty string, max length 4000 characters.
  - `senderId`: Must match the authenticated user.

- **Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "messageId": "msg_firestore_abc123",
    "chatId": "cuid_chat_1",
    "senderId": "cuid_user_1",
    "text": "Hello, this is a test message!",
    "createdAt": "2026-10-22T08:06:12.345Z"
  }
}
```

---

### 3. GET `/chat/:chatId/messages`
Fetches chronologically ordered messages from Firestore for an authorized chat.

- **Query Parameters**:
  - `limit` (integer, default: 50, min: 1, max: 100): Page size.
  - `cursor` (string, optional): Message ID to paginate from (cursor-based pagination).
  - `order` (string, optional, default: `asc`): Order direction (`asc` or `desc`).
- **Authorization**: Requester must be a member of `chatId`.

- **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg_firestore_abc123",
        "chatId": "cuid_chat_1",
        "senderId": "cuid_user_1",
        "text": "Hello, this is a test message!",
        "createdAt": "2026-10-22T08:06:12.345Z",
        "isEdited": false,
        "isDeleted": false
      }
    ],
    "pagination": {
      "limit": 50,
      "nextCursor": "msg_firestore_abc123",
      "hasMore": false
    }
  }
}
```

---

### 4. POST `/chat/:chatId/message/:messageId/read`
Marks a message as read by the specified user (idempotent).

- **Authorization**: User must be a member of `chatId`.
- **Request Body**:
```json
{
  "userId": "cuid_user_2"
}
```

- **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "chatId": "cuid_chat_1",
    "messageId": "msg_firestore_abc123",
    "userId": "cuid_user_2",
    "readAt": "2026-10-22T08:07:00.000Z",
    "status": "recorded"
  }
}
```

---

### 5. POST `/chat/:chatId/lastseen`
Updates the user's last-seen pointer in Firestore, enforcing monotonicity.

- **Authorization**: User must be a member of `chatId`.
- **Request Body**:
```json
{
  "userId": "cuid_user_2",
  "messageId": "msg_firestore_abc123"
}
```

- **Monotonicity Behavior**:
  - If `messageId` points to a message newer than current pointer: **Updated** (200 OK).
  - If `messageId` points to the same or older message: **No-op / Ignored** (200 OK with `status: "ignored_older_than_current"`).
  - If `messageId` does not exist in `chatId`: **404 Not Found**.

- **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "chatId": "cuid_chat_1",
    "userId": "cuid_user_2",
    "lastSeenMessageId": "msg_firestore_abc123",
    "lastSeenAt": "2026-10-22T08:07:05.123Z",
    "status": "updated"
  }
}
```

---

### 6. GET `/user/:userId/chats`
Returns the list of chats and member IDs for the authenticated user from PostgreSQL.

- **Query Parameters**:
  - `limit` (integer, default: 20, min: 1, max: 100): Page size.
  - `cursor` (UUID, optional): Chat ID to paginate from (cursor-based pagination).
- **Authorization**: Caller must be authenticated, and `req.user.id` must match `userId`.

- **Response (200 OK)**:
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

---

## 4. Bonus Endpoints (Architecture Ready)

1. `POST /chat/group`: Creates a group conversation (`title`, `memberIds`).
2. `POST /chat/:chatId/members`: Adds members to a group chat (`userIds`).
3. `DELETE /chat/:chatId/members/:userId`: Removes a member or allows leaving.
4. `PATCH /chat/:chatId/message/:messageId`: Edits message content in Firestore (`newText`).
5. `DELETE /chat/:chatId/message/:messageId`: Soft-deletes a message (`isDeleted: true`).

---

## 5. Error Response Format

Standard RFC 7807 compliant error format:
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation error",
    "details": [
      {
        "field": "userBId",
        "issue": "Required"
      }
    ]
  }
}
```

Standard Error Codes:
- `BAD_REQUEST` (400)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `CONFLICT` (409)
- `TOO_MANY_REQUESTS` (429)
- `INTERNAL_SERVER_ERROR` (500)
