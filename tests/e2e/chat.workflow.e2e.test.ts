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

describe('End-to-End Chat Lifecycle Workflow (Supertest)', () => {
  const aliceId = '11111111-1111-4111-8111-111111111111';
  const bobId = '22222222-2222-4222-8222-222222222222';
  const chatId = '33333333-3333-4333-8333-333333333333';
  const msg1Id = 'msg-e2e-1';
  const msg2Id = 'msg-e2e-2';

  const aliceToken = jwt.sign({ sub: aliceId, email: 'alice@example.com' }, env.JWT_SECRET);
  const bobToken = jwt.sign({ sub: bobId, email: 'bob@example.com' }, env.JWT_SECRET);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('executes complete chat lifecycle: registration -> login -> create chat -> send message -> read receipt -> lastseen -> list chats', async () => {
    // 1. User Registration (Alice)
    vi.spyOn(authService, 'register').mockResolvedValue({
      user: {
        id: aliceId,
        name: 'Alice',
        email: 'alice@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      token: aliceToken,
    });

    const regRes = await request(app)
      .post('/auth/register')
      .send({ name: 'Alice', email: 'alice@example.com', password: 'Password123!' });
    expect(regRes.status).toBe(201);
    expect(regRes.body.user.id).toBe(aliceId);

    // 2. User Login (Bob)
    vi.spyOn(authService, 'login').mockResolvedValue({
      user: {
        id: bobId,
        name: 'Bob',
        email: 'bob@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      token: bobToken,
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'bob@example.com', password: 'Password123!' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBe(bobToken);

    // 3. Alice creates 1:1 chat with Bob
    vi.spyOn(chatService, 'createDirectChat').mockResolvedValue({
      chatId,
      isNew: true,
    });

    const createChatRes = await request(app)
      .post('/chat/create')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ userAId: aliceId, userBId: bobId });
    expect(createChatRes.status).toBe(201);
    expect(createChatRes.body.chatId).toBe(chatId);

    // 4. Bob creates 1:1 chat with Alice -> returns identical chat ID
    vi.spyOn(chatService, 'createDirectChat').mockResolvedValue({
      chatId,
      isNew: false,
    });

    const repeatChatRes = await request(app)
      .post('/chat/create')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ userAId: bobId, userBId: aliceId });
    expect(repeatChatRes.status).toBe(200);
    expect(repeatChatRes.body.chatId).toBe(chatId);

    // 5. Alice sends Message 1
    const t1Iso = new Date('2026-10-22T10:00:00Z').toISOString();
    vi.spyOn(messageService, 'sendMessage').mockResolvedValue({
      messageId: msg1Id,
      chatId,
      senderId: aliceId,
      text: 'Hi Bob, how are you?',
      createdAt: t1Iso,
    });

    const sendRes1 = await request(app)
      .post(`/chat/${chatId}/message/send`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ senderId: aliceId, text: 'Hi Bob, how are you?' });
    expect(sendRes1.status).toBe(201);
    expect(sendRes1.body.messageId).toBe(msg1Id);

    // 6. Bob reads messages from chat
    vi.spyOn(messageService, 'getMessages').mockResolvedValue({
      messages: [
        {
          id: msg1Id,
          chatId,
          senderId: aliceId,
          text: 'Hi Bob, how are you?',
          createdAt: t1Iso,
        },
      ],
      pagination: { limit: 50, nextCursor: null, hasMore: false },
    });

    const getMsgsRes = await request(app)
      .get(`/chat/${chatId}/messages?limit=50`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(getMsgsRes.status).toBe(200);
    expect(getMsgsRes.body.messages.length).toBe(1);

    // 7. Bob marks Message 1 as read
    const readAtIso = new Date('2026-10-22T10:01:00Z').toISOString();
    vi.spyOn(readReceiptService, 'markMessageRead').mockResolvedValue({
      messageId: msg1Id,
      userId: bobId,
      readAt: readAtIso,
      status: 'read',
    });

    const readRes1 = await request(app)
      .post(`/chat/${chatId}/message/${msg1Id}/read`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ userId: bobId });
    expect(readRes1.status).toBe(200);
    expect(readRes1.body.status).toBe('read');

    // 8. Bob marks Message 1 as read again (idempotent repeat)
    vi.spyOn(readReceiptService, 'markMessageRead').mockResolvedValue({
      messageId: msg1Id,
      userId: bobId,
      readAt: readAtIso,
      status: 'already_read',
    });

    const readRes2 = await request(app)
      .post(`/chat/${chatId}/message/${msg1Id}/read`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ userId: bobId });
    expect(readRes2.status).toBe(200);
    expect(readRes2.body.status).toBe('already_read');
    expect(readRes2.body.readAt).toBe(readAtIso);

    // 9. Alice sends Message 2
    const t2Iso = new Date('2026-10-22T10:05:00Z').toISOString();
    vi.spyOn(messageService, 'sendMessage').mockResolvedValue({
      messageId: msg2Id,
      chatId,
      senderId: aliceId,
      text: 'Following up!',
      createdAt: t2Iso,
    });

    const sendRes2 = await request(app)
      .post(`/chat/${chatId}/message/send`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ senderId: aliceId, text: 'Following up!' });
    expect(sendRes2.status).toBe(201);
    expect(sendRes2.body.messageId).toBe(msg2Id);

    // 10. Bob updates last-seen to Message 2
    vi.spyOn(lastSeenService, 'updateLastSeen').mockResolvedValue({
      chatId,
      userId: bobId,
      lastSeenMessageId: msg2Id,
      lastSeenAt: t2Iso,
      status: 'updated',
    });

    const lastSeenRes1 = await request(app)
      .post(`/chat/${chatId}/lastseen`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ userId: bobId, messageId: msg2Id });
    expect(lastSeenRes1.status).toBe(200);
    expect(lastSeenRes1.body.lastSeenMessageId).toBe(msg2Id);
    expect(lastSeenRes1.body.status).toBe('updated');

    // 11. Bob attempts to move last-seen back to Message 1 (monotonicity guarantee)
    vi.spyOn(lastSeenService, 'updateLastSeen').mockResolvedValue({
      chatId,
      userId: bobId,
      lastSeenMessageId: msg2Id, // remains pointing to newer msg2
      lastSeenAt: t2Iso,
      status: 'ignored_older_than_current',
    });

    const lastSeenRes2 = await request(app)
      .post(`/chat/${chatId}/lastseen`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ userId: bobId, messageId: msg1Id });
    expect(lastSeenRes2.status).toBe(200);
    expect(lastSeenRes2.body.status).toBe('ignored_older_than_current');
    expect(lastSeenRes2.body.lastSeenMessageId).toBe(msg2Id);

    // 12. Alice lists her chats
    vi.spyOn(userChatService, 'getUserChats').mockResolvedValue({
      chats: [
        {
          chatId,
          type: 'DIRECT',
          memberIds: [aliceId, bobId],
          createdAt: t1Iso,
        },
      ],
      nextCursor: null,
    });

    const userChatsRes = await request(app)
      .get(`/user/${aliceId}/chats?limit=20`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(userChatsRes.status).toBe(200);
    expect(userChatsRes.body.success).toBe(true);
    expect(userChatsRes.body.data.chats.length).toBe(1);
    expect(userChatsRes.body.data.chats[0].chatId).toBe(chatId);
    expect(userChatsRes.body.data.chats[0].memberIds).toContain(aliceId);
    expect(userChatsRes.body.data.chats[0].memberIds).toContain(bobId);
  });
});
