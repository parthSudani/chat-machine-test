import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { messageService } from '../../src/services/message.service';
import { AppError } from '../../src/utils/appError';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('Messaging HTTP API (Supertest)', () => {
  const aliceId = '11111111-1111-4111-8111-111111111111';
  const bobId = '22222222-2222-4222-8222-222222222222';
  const chatId = '33333333-3333-4333-8333-333333333333';

  const aliceToken = jwt.sign(
    { sub: aliceId, email: 'alice@example.com' },
    env.JWT_SECRET
  );

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /chat/:chatId/message/send', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .send({ senderId: aliceId, text: 'Hello' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_REQUIRED');
    });

    it('rejects invalid UUID chatId with 400', async () => {
      const res = await request(app)
        .post('/chat/not-a-uuid/message/send')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: 'Hello' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects empty or whitespace-only text with 400', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects oversized text (> 4000 chars) with 400', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: 'x'.repeat(4001) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects mismatched senderId with 403', async () => {
      vi.spyOn(messageService, 'sendMessage').mockRejectedValue(
        AppError.forbidden(
          'Supplied senderId does not match the authenticated user',
          'FORBIDDEN_USER_MISMATCH'
        )
      );

      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: bobId, text: 'Spoofed message' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_USER_MISMATCH');
    });

    it('rejects non-member with 403', async () => {
      vi.spyOn(messageService, 'sendMessage').mockRejectedValue(
        AppError.forbidden(
          'User is not an authorized member of this chat',
          'NOT_A_CHAT_MEMBER'
        )
      );

      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: 'Hello' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_A_CHAT_MEMBER');
    });

    it('rejects nonexistent chat with 404', async () => {
      vi.spyOn(messageService, 'sendMessage').mockRejectedValue(
        AppError.notFound('Chat not found', 'CHAT_NOT_FOUND')
      );

      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: 'Hello' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CHAT_NOT_FOUND');
    });

    it('successfully sends message and returns 201 with message details', async () => {
      const nowIso = new Date().toISOString();
      vi.spyOn(messageService, 'sendMessage').mockResolvedValue({
        messageId: 'msg-12345',
        chatId,
        senderId: aliceId,
        text: 'Hello, Bob!',
        createdAt: nowIso,
      });

      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: 'Hello, Bob!' });

      expect(res.status).toBe(201);
      expect(res.body.messageId).toBe('msg-12345');
      expect(res.body.chatId).toBe(chatId);
      expect(res.body.senderId).toBe(aliceId);
      expect(res.body.text).toBe('Hello, Bob!');
      expect(res.body.createdAt).toBe(nowIso);
    });
  });

  describe('GET /chat/:chatId/messages', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get(`/chat/${chatId}/messages`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_REQUIRED');
    });

    it('rejects non-member with 403', async () => {
      vi.spyOn(messageService, 'getMessages').mockRejectedValue(
        AppError.forbidden(
          'User is not an authorized member of this chat',
          'NOT_A_CHAT_MEMBER'
        )
      );

      const res = await request(app)
        .get(`/chat/${chatId}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_A_CHAT_MEMBER');
    });

    it('successfully returns messages with pagination', async () => {
      const nowIso = new Date().toISOString();
      vi.spyOn(messageService, 'getMessages').mockResolvedValue({
        messages: [
          {
            id: 'msg-1',
            chatId,
            senderId: aliceId,
            text: 'First message',
            createdAt: nowIso,
          },
        ],
        pagination: {
          limit: 50,
          nextCursor: null,
          hasMore: false,
        },
      });

      const res = await request(app)
        .get(`/chat/${chatId}/messages?limit=50`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBe(1);
      expect(res.body.messages[0].id).toBe('msg-1');
      expect(res.body.pagination.limit).toBe(50);
      expect(res.body.pagination.hasMore).toBe(false);
    });
  });
});
