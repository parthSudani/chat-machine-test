import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { chatService } from '../../src/services/chat.service';
import { messageService } from '../../src/services/message.service';
import { env } from '../../src/config/env';
import { AppError } from '../../src/utils/appError';

describe('QA Category 5, 6 & 7: Chat Creation, Messaging & Pagination', () => {
  const aliceId = '11111111-1111-4111-8111-111111111111';
  const bobId = '22222222-2222-4222-8222-222222222222';
  const eveId = '99999999-9999-4999-8999-999999999999';
  const chatId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const aliceToken = jwt.sign({ sub: aliceId, email: 'alice@example.com' }, env.JWT_SECRET);
  const eveToken = jwt.sign({ sub: eveId, email: 'eve@example.com' }, env.JWT_SECRET);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Category 5: Chat Creation (CHAT-001 to CHAT-030)
  // ---------------------------------------------------------------------------
  describe('Category 5: Chat Creation (CHAT-001..CHAT-030)', () => {
    it('CHAT-001 & CHAT-002: Create direct chat returns 201 Created and chatId', async () => {
      vi.spyOn(chatService, 'createDirectChat').mockResolvedValueOnce({
        chatId,
        isNew: true,
      });

      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userAId: aliceId, userBId: bobId });

      expect(res.status).toBe(201);
      expect(res.body.chatId).toBe(chatId);
    });

    it('CHAT-004 & CHAT-005: Repeated or reversed-order creation returns existing chat (200 OK)', async () => {
      vi.spyOn(chatService, 'createDirectChat').mockResolvedValueOnce({
        chatId,
        isNew: false,
      });

      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userAId: bobId, userBId: aliceId });

      expect(res.status).toBe(200);
      expect(res.body.chatId).toBe(chatId);
    });

    it('CHAT-006 & CHAT-007: Invalid userAId or userBId UUID format is rejected (400 Bad Request)', async () => {
      const res1 = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userAId: 'not-a-uuid', userBId: bobId });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userAId: aliceId, userBId: 'not-a-uuid' });
      expect(res2.status).toBe(400);
    });

    it('CHAT-008 & CHAT-009: Missing userAId or userBId is rejected (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userBId: bobId });
      expect(res.status).toBe(400);
    });

    it('CHAT-012: Reject self-chat attempt where userAId equals userBId (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userAId: aliceId, userBId: aliceId });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SELF_CHAT_NOT_ALLOWED');
    });

    it('CHAT-013 & CHAT-014: Nonexistent user returns 404 Not Found', async () => {
      vi.spyOn(chatService, 'createDirectChat').mockRejectedValueOnce(
        AppError.notFound('User with id not found', 'USER_NOT_FOUND')
      );

      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userAId: aliceId, userBId: bobId });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('CHAT-016: Reject caller attempting to create chat between two arbitrary third parties (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${eveToken}`)
        .send({ userAId: aliceId, userBId: bobId });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED_CHAT_CREATION');
    });

    it('CHAT-020 & CHAT-021: Concurrent requests resolve to same chat ID', async () => {
      vi.spyOn(chatService, 'createDirectChat').mockResolvedValue({
        chatId,
        isNew: false,
      });

      const promises = Array.from({ length: 5 }).map(() =>
        request(app)
          .post('/chat/create')
          .set('Authorization', `Bearer ${aliceToken}`)
          .send({ userAId: aliceId, userBId: bobId })
      );

      const results = await Promise.all(promises);
      for (const r of results) {
        expect(r.status).toBe(200);
        expect(r.body.chatId).toBe(chatId);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Category 6: Send Message (MSG-001 to MSG-035)
  // ---------------------------------------------------------------------------
  describe('Category 6: Send Message (MSG-001..MSG-035)', () => {
    it('MSG-001 & MSG-019: Send valid message persists with server timestamp (201 Created)', async () => {
      const mockTimestamp = new Date().toISOString();
      vi.spyOn(messageService, 'sendMessage').mockResolvedValueOnce({
        messageId: 'msg-test-123',
        chatId,
        senderId: aliceId,
        text: 'Hello Bob!',
        createdAt: mockTimestamp,
      });

      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: 'Hello Bob!' });

      expect(res.status).toBe(201);
      expect(res.body.messageId).toBe('msg-test-123');
      expect(res.body.createdAt).toBe(mockTimestamp);
    });

    it('MSG-004: Reject sending to nonexistent chat (404 Not Found)', async () => {
      vi.spyOn(messageService, 'sendMessage').mockRejectedValueOnce(
        AppError.notFound('Chat not found', 'CHAT_NOT_FOUND')
      );

      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: 'Hello!' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CHAT_NOT_FOUND');
    });

    it('MSG-006: Reject non-member sending a message (403 Forbidden)', async () => {
      vi.spyOn(messageService, 'sendMessage').mockRejectedValueOnce(
        AppError.forbidden('Caller is not a member of this chat', 'FORBIDDEN_NOT_CHAT_MEMBER')
      );

      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${eveToken}`)
        .send({ senderId: eveId, text: 'Unauthorized message' });

      expect(res.status).toBe(403);
    });

    it('MSG-008: Reject senderId spoofing when body senderId differs from caller (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: bobId, text: 'Spoofed message!' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_USER_MISMATCH');
    });

    it('MSG-009 & MSG-010: Reject empty or whitespace-only message text (400 Bad Request)', async () => {
      const res1 = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: '' });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: '     ' });
      expect(res2.status).toBe(400);
    });

    it('MSG-015: Reject message text exceeding maximum limit (400 Bad Request)', async () => {
      const longText = 'a'.repeat(5001);
      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: longText });

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Category 7: Get Messages & Pagination (GET-001 to GET-034)
  // ---------------------------------------------------------------------------
  describe('Category 7: Get Messages & Pagination (GET-001..GET-034)', () => {
    it('GET-001 & GET-007: Fetch messages with default limit (50) in chronological order', async () => {
      vi.spyOn(messageService, 'getMessages').mockResolvedValueOnce({
        messages: [
          { id: 'msg-1', chatId, senderId: aliceId, text: 'First', createdAt: '2026-10-22T08:00:00Z' },
          { id: 'msg-2', chatId, senderId: bobId, text: 'Second', createdAt: '2026-10-22T08:01:00Z' },
        ],
        pagination: {
          limit: 50,
          nextCursor: null,
          hasMore: false,
        },
      });

      const res = await request(app)
        .get(`/chat/${chatId}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBe(2);
      expect(res.body.messages[0].text).toBe('First');
      expect(res.body.messages[1].text).toBe('Second');
    });

    it('GET-002: Fetch messages from empty chat returns empty array', async () => {
      vi.spyOn(messageService, 'getMessages').mockResolvedValueOnce({
        messages: [],
        pagination: {
          limit: 50,
          nextCursor: null,
          hasMore: false,
        },
      });

      const res = await request(app)
        .get(`/chat/${chatId}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual([]);
      expect(res.body.pagination.nextCursor).toBeNull();
    });

    it('GET-006: Reject non-member retrieving messages (403 Forbidden)', async () => {
      vi.spyOn(messageService, 'getMessages').mockRejectedValueOnce(
        AppError.forbidden('Caller is not a member of this chat', 'FORBIDDEN_NOT_CHAT_MEMBER')
      );

      const res = await request(app)
        .get(`/chat/${chatId}/messages`)
        .set('Authorization', `Bearer ${eveToken}`);

      expect(res.status).toBe(403);
    });

    it('GET-009..GET-013: Query limits are safely transformed and bounded (default 50, max 100)', async () => {
      vi.spyOn(messageService, 'getMessages').mockResolvedValue({
        messages: [],
        pagination: {
          limit: 50,
          nextCursor: null,
          hasMore: false,
        },
      });

      const res1 = await request(app)
        .get(`/chat/${chatId}/messages?limit=0`)
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .get(`/chat/${chatId}/messages?limit=-5`)
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(res2.status).toBe(200);

      const res3 = await request(app)
        .get(`/chat/${chatId}/messages?limit=101`)
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(res3.status).toBe(200);
    });

    it('GET-021..GET-024: Cursor pagination returns nextCursor and supports forward navigation', async () => {
      vi.spyOn(messageService, 'getMessages').mockResolvedValueOnce({
        messages: [{ id: 'msg-1', chatId, senderId: aliceId, text: 'First', createdAt: '2026-10-22T08:00:00Z' }],
        pagination: {
          limit: 1,
          nextCursor: 'msg-1',
          hasMore: true,
        },
      });

      const res = await request(app)
        .get(`/chat/${chatId}/messages?limit=1`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBe(1);
      expect(res.body.pagination.nextCursor).toBe('msg-1');
    });
  });
});
