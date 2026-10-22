import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { readReceiptService } from '../../src/services/readReceipt.service';
import { lastSeenService } from '../../src/services/lastSeen.service';
import { AppError } from '../../src/utils/appError';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('Phase 4 HTTP Endpoints (Supertest)', () => {
  const userAId = '11111111-1111-4111-8111-111111111111';
  const userBId = '22222222-2222-4222-8222-222222222222';
  const chatId = '33333333-3333-4333-8333-333333333333';
  const messageId = 'msg-firestore-123';

  const userAToken = jwt.sign(
    { sub: userAId, email: 'alice@example.com' },
    env.JWT_SECRET
  );

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /chat/:chatId/message/:messageId/read', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/message/${messageId}/read`)
        .send({ userId: userAId });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_REQUIRED');
    });

    it('rejects invalid UUID chatId with 400', async () => {
      const res = await request(app)
        .post(`/chat/invalid-chat-id/message/${messageId}/read`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ userId: userAId });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects mismatched body userId with 403', async () => {
      vi.spyOn(readReceiptService, 'markMessageRead').mockRejectedValue(
        AppError.forbidden(
          'Supplied userId does not match the authenticated user',
          'FORBIDDEN_USER_MISMATCH'
        )
      );

      const res = await request(app)
        .post(`/chat/${chatId}/message/${messageId}/read`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ userId: userBId });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_USER_MISMATCH');
    });

    it('rejects nonexistent message with 404', async () => {
      vi.spyOn(readReceiptService, 'markMessageRead').mockRejectedValue(
        AppError.notFound('Message not found in chat', 'MESSAGE_NOT_FOUND')
      );

      const res = await request(app)
        .post(`/chat/${chatId}/message/${messageId}/read`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ userId: userAId });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('MESSAGE_NOT_FOUND');
    });

    it('successfully marks message read and returns 200 with receipt data', async () => {
      const nowIso = new Date().toISOString();
      vi.spyOn(readReceiptService, 'markMessageRead').mockResolvedValue({
        messageId,
        userId: userAId,
        readAt: nowIso,
        status: 'read',
      });

      const res = await request(app)
        .post(`/chat/${chatId}/message/${messageId}/read`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ userId: userAId });

      expect(res.status).toBe(200);
      expect(res.body.messageId).toBe(messageId);
      expect(res.body.userId).toBe(userAId);
      expect(res.body.readAt).toBe(nowIso);
      expect(res.body.status).toBe('read');
    });
  });

  describe('POST /chat/:chatId/lastseen', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/lastseen`)
        .send({ userId: userAId, messageId });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_REQUIRED');
    });

    it('rejects mismatched body userId with 403', async () => {
      vi.spyOn(lastSeenService, 'updateLastSeen').mockRejectedValue(
        AppError.forbidden(
          'Supplied userId does not match the authenticated user',
          'FORBIDDEN_USER_MISMATCH'
        )
      );

      const res = await request(app)
        .post(`/chat/${chatId}/lastseen`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ userId: userBId, messageId });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_USER_MISMATCH');
    });

    it('rejects nonexistent chat with 404', async () => {
      vi.spyOn(lastSeenService, 'updateLastSeen').mockRejectedValue(
        AppError.notFound('Chat not found', 'CHAT_NOT_FOUND')
      );

      const res = await request(app)
        .post(`/chat/${chatId}/lastseen`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ userId: userAId, messageId });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CHAT_NOT_FOUND');
    });

    it('successfully updates last seen and returns 200', async () => {
      const nowIso = new Date().toISOString();
      vi.spyOn(lastSeenService, 'updateLastSeen').mockResolvedValue({
        chatId,
        userId: userAId,
        lastSeenMessageId: messageId,
        lastSeenAt: nowIso,
        status: 'updated',
      });

      const res = await request(app)
        .post(`/chat/${chatId}/lastseen`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ userId: userAId, messageId });

      expect(res.status).toBe(200);
      expect(res.body.chatId).toBe(chatId);
      expect(res.body.userId).toBe(userAId);
      expect(res.body.lastSeenMessageId).toBe(messageId);
      expect(res.body.status).toBe('updated');
    });

    it('handles monotonicity correctly by returning ignored_older_than_current without error', async () => {
      const nowIso = new Date().toISOString();
      vi.spyOn(lastSeenService, 'updateLastSeen').mockResolvedValue({
        chatId,
        userId: userAId,
        lastSeenMessageId: 'newer-msg-999',
        lastSeenAt: nowIso,
        status: 'ignored_older_than_current',
      });

      const res = await request(app)
        .post(`/chat/${chatId}/lastseen`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ userId: userAId, messageId });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ignored_older_than_current');
      expect(res.body.lastSeenMessageId).toBe('newer-msg-999');
    });
  });
});
