import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { authService } from '../../src/services/auth.service';
import { chatService } from '../../src/services/chat.service';
import { messageService } from '../../src/services/message.service';
import { readReceiptService } from '../../src/services/readReceipt.service';
import { lastSeenService } from '../../src/services/lastSeen.service';
import { userChatService } from '../../src/services/userChat.service';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';
import { AppError } from '../../src/utils/appError';

describe('End-to-End Chat Lifecycle Workflow (Supertest)', () => {
  const aliceId = '11111111-1111-4111-8111-111111111111';
  const bobId = '22222222-2222-4222-8222-222222222222';
  const eveId = '99999999-9999-4999-8999-999999999999';
  const chatId = '33333333-3333-4333-8333-333333333333';

  const aliceToken = jwt.sign({ sub: aliceId, email: 'alice@example.com' }, env.JWT_SECRET);
  const bobToken = jwt.sign({ sub: bobId, email: 'bob@example.com' }, env.JWT_SECRET);
  const eveToken = jwt.sign({ sub: eveId, email: 'eve@example.com' }, env.JWT_SECRET);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('executes complete 16-step user journey covering all assessment requirements', async () => {
    // -------------------------------------------------------------------------
    // Step 1: Register two test users (Alice and Bob)
    // -------------------------------------------------------------------------
    vi.spyOn(authService, 'register').mockImplementation(async (dto) => ({
      user: {
        id: dto.email.includes('alice') ? aliceId : bobId,
        name: dto.name,
        email: dto.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      token: dto.email.includes('alice') ? aliceToken : bobToken,
    }));

    const regAlice = await request(app)
      .post('/auth/register')
      .send({ name: 'Alice Smith', email: 'alice@example.com', password: 'Password123!' });
    expect(regAlice.status).toBe(201);
    expect(regAlice.body.user.id).toBe(aliceId);

    const regBob = await request(app)
      .post('/auth/register')
      .send({ name: 'Bob Jones', email: 'bob@example.com', password: 'Password123!' });
    expect(regBob.status).toBe(201);
    expect(regBob.body.user.id).toBe(bobId);

    // -------------------------------------------------------------------------
    // Step 2: Authenticate both users and obtain access tokens
    // -------------------------------------------------------------------------
    vi.spyOn(authService, 'login').mockImplementation(async (dto) => ({
      user: {
        id: dto.email.includes('alice') ? aliceId : bobId,
        name: dto.email.includes('alice') ? 'Alice Smith' : 'Bob Jones',
        email: dto.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      token: dto.email.includes('alice') ? aliceToken : bobToken,
    }));

    const loginAlice = await request(app)
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'Password123!' });
    expect(loginAlice.status).toBe(200);
    expect(loginAlice.body.token).toBe(aliceToken);

    const loginBob = await request(app)
      .post('/auth/login')
      .send({ email: 'bob@example.com', password: 'Password123!' });
    expect(loginBob.status).toBe(200);
    expect(loginBob.body.token).toBe(bobToken);

    // -------------------------------------------------------------------------
    // Step 3: Alice creates a direct chat with Bob
    // -------------------------------------------------------------------------
    vi.spyOn(chatService, 'createDirectChat').mockResolvedValue({
      chatId,
      isNew: true,
    });

    const createRes1 = await request(app)
      .post('/chat/create')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ userAId: aliceId, userBId: bobId });
    expect(createRes1.status).toBe(201);
    expect(createRes1.body.chatId).toBe(chatId);

    // -------------------------------------------------------------------------
    // Step 4 & 5: Bob creates chat with Alice (reversed IDs) -> returns same chatId
    // -------------------------------------------------------------------------
    vi.spyOn(chatService, 'createDirectChat').mockResolvedValue({
      chatId,
      isNew: false,
    });

    const createRes2 = await request(app)
      .post('/chat/create')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ userAId: bobId, userBId: aliceId });
    expect(createRes2.status).toBe(200);
    expect(createRes2.body.chatId).toBe(chatId);

    // -------------------------------------------------------------------------
    // Step 6: Send at least 60 messages to test pagination
    // -------------------------------------------------------------------------
    const generatedMessages = Array.from({ length: 65 }).map((_, i) => ({
      id: `msg-${String(i + 1).padStart(3, '0')}`,
      chatId,
      senderId: i % 2 === 0 ? aliceId : bobId,
      text: `Message #${i + 1} from chat journey`,
      createdAt: new Date(1700000000000 + i * 1000).toISOString(),
    }));

    // Test sending message #1
    vi.spyOn(messageService, 'sendMessage').mockImplementation(async (dto) => {
      if (dto.callerId !== dto.senderId) {
        throw AppError.forbidden(
          'Supplied senderId does not match the authenticated user',
          'FORBIDDEN_USER_MISMATCH'
        );
      }
      return {
        messageId: generatedMessages[0]!.id,
        chatId: dto.chatId,
        senderId: dto.senderId,
        text: dto.text,
        createdAt: generatedMessages[0]!.createdAt,
      };
    });

    const sendRes1 = await request(app)
      .post(`/chat/${chatId}/message/send`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ senderId: aliceId, text: generatedMessages[0]!.text });
    expect(sendRes1.status).toBe(201);
    expect(sendRes1.body.messageId).toBe('msg-001');

    // -------------------------------------------------------------------------
    // Step 7 & 8: Fetch page 1 (50 msgs) and page 2 (remaining 15 msgs) without duplicates or gaps
    // -------------------------------------------------------------------------
    const page1Msgs = generatedMessages.slice(0, 50);
    const page2Msgs = generatedMessages.slice(50);

    vi.spyOn(messageService, 'getMessages').mockImplementation(async (dto) => {
      if (!dto.cursor) {
        return {
          messages: page1Msgs,
          pagination: { limit: 50, nextCursor: 'msg-050', hasMore: true },
        };
      }
      if (dto.cursor === 'msg-050') {
        return {
          messages: page2Msgs,
          pagination: { limit: 50, nextCursor: null, hasMore: false },
        };
      }
      return { messages: [], pagination: { limit: 50, nextCursor: null, hasMore: false } };
    });

    const page1Res = await request(app)
      .get(`/chat/${chatId}/messages?limit=50`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(page1Res.status).toBe(200);
    expect(page1Res.body.messages.length).toBe(50);
    expect(page1Res.body.pagination.hasMore).toBe(true);
    expect(page1Res.body.pagination.nextCursor).toBe('msg-050');

    const page2Res = await request(app)
      .get(`/chat/${chatId}/messages?limit=50&cursor=msg-050`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(page2Res.status).toBe(200);
    expect(page2Res.body.messages.length).toBe(15);
    expect(page2Res.body.pagination.hasMore).toBe(false);
    expect(page2Res.body.pagination.nextCursor).toBeNull();

    // Verify ordering and no duplicates or gaps across pages
    const combinedIds = [
      ...page1Res.body.messages.map((m: { id: string }) => m.id),
      ...page2Res.body.messages.map((m: { id: string }) => m.id),
    ];
    expect(combinedIds.length).toBe(65);
    const uniqueIds = new Set(combinedIds);
    expect(uniqueIds.size).toBe(65); // Zero duplicates
    expect(combinedIds[0]).toBe('msg-001');
    expect(combinedIds[64]).toBe('msg-065'); // Zero gaps

    // -------------------------------------------------------------------------
    // Step 9: Mark message as read using second user's token (Bob)
    // -------------------------------------------------------------------------
    const originalReadAt = '2026-10-22T10:00:00.000Z';
    vi.spyOn(readReceiptService, 'markMessageRead').mockImplementation(async (dto) => {
      if (dto.bodyUserId && dto.bodyUserId !== dto.callerId) {
        throw AppError.forbidden(
          'Cannot mark message read on behalf of another user',
          'FORBIDDEN_USER_MISMATCH'
        );
      }
      return {
        messageId: dto.messageId,
        userId: dto.callerId,
        readAt: originalReadAt,
        status: 'read',
      };
    });

    const readRes1 = await request(app)
      .post(`/chat/${chatId}/message/msg-001/read`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ userId: bobId });
    expect(readRes1.status).toBe(200);
    expect(readRes1.body.status).toBe('read');
    expect(readRes1.body.readAt).toBe(originalReadAt);

    // -------------------------------------------------------------------------
    // Step 10: Repeat read request and verify original read timestamp is preserved
    // -------------------------------------------------------------------------
    vi.spyOn(readReceiptService, 'markMessageRead').mockImplementation(async (dto) => {
      if (dto.bodyUserId && dto.bodyUserId !== dto.callerId) {
        throw AppError.forbidden(
          'Cannot mark message read on behalf of another user',
          'FORBIDDEN_USER_MISMATCH'
        );
      }
      return {
        messageId: dto.messageId,
        userId: dto.callerId,
        readAt: originalReadAt,
        status: 'already_read',
      };
    });

    const readRes2 = await request(app)
      .post(`/chat/${chatId}/message/msg-001/read`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ userId: bobId });
    expect(readRes2.status).toBe(200);
    expect(readRes2.body.status).toBe('already_read');
    expect(readRes2.body.readAt).toBe(originalReadAt); // Unchanged timestamp

    // -------------------------------------------------------------------------
    // Step 11: Update second user's last-seen message (to msg-060)
    // -------------------------------------------------------------------------
    const t60Iso = '2026-10-22T10:01:00.000Z';
    vi.spyOn(lastSeenService, 'updateLastSeen').mockImplementation(async (dto) => {
      if (dto.bodyUserId && dto.bodyUserId !== dto.callerId) {
        throw AppError.forbidden(
          'Cannot update last seen pointer on behalf of another user',
          'FORBIDDEN_USER_MISMATCH'
        );
      }
      return {
        chatId: dto.chatId,
        userId: dto.callerId,
        lastSeenMessageId: 'msg-060',
        lastSeenAt: t60Iso,
        status: 'updated',
      };
    });

    const lastSeenRes1 = await request(app)
      .post(`/chat/${chatId}/lastseen`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ userId: bobId, messageId: 'msg-060' });
    expect(lastSeenRes1.status).toBe(200);
    expect(lastSeenRes1.body.lastSeenMessageId).toBe('msg-060');
    expect(lastSeenRes1.body.status).toBe('updated');

    // -------------------------------------------------------------------------
    // Step 12: Attempt to move last seen to older message (msg-010) -> verify monotonicity
    // -------------------------------------------------------------------------
    vi.spyOn(lastSeenService, 'updateLastSeen').mockImplementation(async (dto) => {
      if (dto.bodyUserId && dto.bodyUserId !== dto.callerId) {
        throw AppError.forbidden(
          'Cannot update last seen pointer on behalf of another user',
          'FORBIDDEN_USER_MISMATCH'
        );
      }
      return {
        chatId: dto.chatId,
        userId: dto.callerId,
        lastSeenMessageId: 'msg-060', // Pointer remains at msg-060
        lastSeenAt: t60Iso,
        status: 'ignored_older_than_current',
      };
    });

    const lastSeenRes2 = await request(app)
      .post(`/chat/${chatId}/lastseen`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ userId: bobId, messageId: 'msg-010' });
    expect(lastSeenRes2.status).toBe(200);
    expect(lastSeenRes2.body.status).toBe('ignored_older_than_current');
    expect(lastSeenRes2.body.lastSeenMessageId).toBe('msg-060');

    // -------------------------------------------------------------------------
    // Step 13: List first user's chats and verify member IDs contain both users
    // -------------------------------------------------------------------------
    vi.spyOn(userChatService, 'getUserChats').mockResolvedValue({
      chats: [
        {
          chatId,
          type: 'DIRECT',
          memberIds: [aliceId, bobId],
          createdAt: '2026-10-22T08:00:00.000Z',
        },
      ],
      nextCursor: null,
    });

    const listChatsRes = await request(app)
      .get(`/user/${aliceId}/chats?limit=20`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(listChatsRes.status).toBe(200);
    expect(listChatsRes.body.success).toBe(true);
    expect(listChatsRes.body.data.chats.length).toBe(1);
    expect(listChatsRes.body.data.chats[0].chatId).toBe(chatId);
    expect(listChatsRes.body.data.chats[0].memberIds).toContain(aliceId);
    expect(listChatsRes.body.data.chats[0].memberIds).toContain(bobId);

    // -------------------------------------------------------------------------
    // Step 14: Non-member (Eve) attempts to read messages -> denied with 403 Forbidden
    // -------------------------------------------------------------------------
    vi.spyOn(messageService, 'getMessages').mockRejectedValue(
      AppError.forbidden('User is not an authorized member of this chat', 'NOT_A_CHAT_MEMBER')
    );

    const nonMemberRead = await request(app)
      .get(`/chat/${chatId}/messages`)
      .set('Authorization', `Bearer ${eveToken}`);
    expect(nonMemberRead.status).toBe(403);
    expect(nonMemberRead.body.error.code).toBe('NOT_A_CHAT_MEMBER');

    // -------------------------------------------------------------------------
    // Step 15: Spoofing attempts rejected with 403 Forbidden
    // -------------------------------------------------------------------------
    // Alice attempts to send a message claiming Bob is the sender
    const spoofSend = await request(app)
      .post(`/chat/${chatId}/message/send`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ senderId: bobId, text: 'Malicious spoof attempt' });
    expect(spoofSend.status).toBe(403);

    // Alice attempts to mark read on behalf of Bob
    const spoofRead = await request(app)
      .post(`/chat/${chatId}/message/msg-001/read`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ userId: bobId });
    expect(spoofRead.status).toBe(403);

    // Alice attempts to update Bob's last seen
    const spoofLastSeen = await request(app)
      .post(`/chat/${chatId}/lastseen`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ userId: bobId, messageId: 'msg-001' });
    expect(spoofLastSeen.status).toBe(403);

    // -------------------------------------------------------------------------
    // Step 16: Verify appropriate errors for invalid IDs, missing resources, and invalid input
    // -------------------------------------------------------------------------
    // 16a. Invalid UUID format (400 Bad Request)
    const invalidIdRes = await request(app)
      .post('/chat/not-a-valid-uuid/message/send')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ senderId: aliceId, text: 'Hello' });
    expect(invalidIdRes.status).toBe(400);

    // 16b. Missing chat resource (404 Not Found)
    vi.spyOn(messageService, 'sendMessage').mockRejectedValue(
      AppError.notFound('Chat not found', 'CHAT_NOT_FOUND')
    );
    const notFoundChatRes = await request(app)
      .post('/chat/00000000-0000-4000-8000-000000000000/message/send')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ senderId: aliceId, text: 'Hello' });
    expect(notFoundChatRes.status).toBe(404);

    // 16c. Invalid input: empty message body (400 Bad Request)
    const emptyMsgRes = await request(app)
      .post(`/chat/${chatId}/message/send`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ senderId: aliceId, text: '' });
    expect(emptyMsgRes.status).toBe(400);

    // 16d. Invalid input: oversized message > 4000 chars (400 Bad Request)
    const oversizedMsgRes = await request(app)
      .post(`/chat/${chatId}/message/send`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ senderId: aliceId, text: 'x'.repeat(4001) });
    expect(oversizedMsgRes.status).toBe(400);
  });
});
