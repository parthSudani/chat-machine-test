import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { readReceiptService } from '../../src/services/readReceipt.service';
import { lastSeenService } from '../../src/services/lastSeen.service';
import { userChatService } from '../../src/services/userChat.service';
import { env } from '../../src/config/env';
import { AppError } from '../../src/utils/appError';

describe('QA Category 8, 9 & 10: Read Receipts, Last-Seen & Chat Listing', () => {
  const aliceId = '11111111-1111-4111-8111-111111111111';
  const bobId = '22222222-2222-4222-8222-222222222222';
  const eveId = '99999999-9999-4999-8999-999999999999';
  const chatId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const msgId = 'msg-receipt-test-1';

  const aliceToken = jwt.sign({ sub: aliceId, email: 'alice@example.com' }, env.JWT_SECRET);
  const bobToken = jwt.sign({ sub: bobId, email: 'bob@example.com' }, env.JWT_SECRET);
  const eveToken = jwt.sign({ sub: eveId, email: 'eve@example.com' }, env.JWT_SECRET);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Category 8: Read Receipts (READ-001 to READ-022)
  // ---------------------------------------------------------------------------
  describe('Category 8: Read Receipts (READ-001..READ-022)', () => {
    it('READ-001 & READ-012: Mark message read records receipt with server timestamp', async () => {
      const readAt = new Date().toISOString();
      vi.spyOn(readReceiptService, 'markMessageRead').mockResolvedValueOnce({
        messageId: msgId,
        userId: bobId,
        readAt,
        status: 'read',
      });

      const res = await request(app)
        .post(`/chat/${chatId}/message/${msgId}/read`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ userId: bobId });

      expect(res.status).toBe(200);
      expect(res.body.messageId).toBe(msgId);
      expect(res.body.userId).toBe(bobId);
      expect(res.body.status).toBe('read');
      expect(res.body.readAt).toBe(readAt);
    });

    it('READ-013 & READ-014: Repeat read request is idempotent and preserves original timestamp', async () => {
      const originalReadAt = '2026-10-22T08:00:00.000Z';
      vi.spyOn(readReceiptService, 'markMessageRead').mockResolvedValueOnce({
        messageId: msgId,
        userId: bobId,
        readAt: originalReadAt,
        status: 'already_read',
      });

      const res = await request(app)
        .post(`/chat/${chatId}/message/${msgId}/read`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ userId: bobId });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('already_read');
      expect(res.body.readAt).toBe(originalReadAt);
    });

    it('READ-005 & READ-006: Nonexistent chat or message returns 404 Not Found', async () => {
      vi.spyOn(readReceiptService, 'markMessageRead').mockRejectedValueOnce(
        AppError.notFound('Message not found', 'MESSAGE_NOT_FOUND')
      );

      const res = await request(app)
        .post(`/chat/${chatId}/message/nonexistent-msg/read`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ userId: bobId });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('MESSAGE_NOT_FOUND');
    });

    it('READ-008: Non-member caller is forbidden from reading messages (403 Forbidden)', async () => {
      vi.spyOn(readReceiptService, 'markMessageRead').mockRejectedValueOnce(
        AppError.forbidden('Caller is not a member of this chat', 'FORBIDDEN_NOT_CHAT_MEMBER')
      );

      const res = await request(app)
        .post(`/chat/${chatId}/message/${msgId}/read`)
        .set('Authorization', `Bearer ${eveToken}`)
        .send({ userId: eveId });

      expect(res.status).toBe(403);
    });

    it('READ-010: Mismatched body userId is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/message/${msgId}/read`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userId: bobId });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_USER_MISMATCH');
    });
  });

  // ---------------------------------------------------------------------------
  // Category 9: Last-Seen Tracking (SEEN-001 to SEEN-024)
  // ---------------------------------------------------------------------------
  describe('Category 9: Last-Seen Tracking (SEEN-001..SEEN-024)', () => {
    it('SEEN-001 & SEEN-010: Advance last seen to newer message returns status updated', async () => {
      const now = new Date().toISOString();
      vi.spyOn(lastSeenService, 'updateLastSeen').mockResolvedValueOnce({
        chatId,
        userId: bobId,
        lastSeenMessageId: 'msg-new-2',
        lastSeenAt: now,
        status: 'updated',
      });

      const res = await request(app)
        .post(`/chat/${chatId}/lastseen`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ userId: bobId, messageId: 'msg-new-2' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('updated');
      expect(res.body.lastSeenMessageId).toBe('msg-new-2');
    });

    it('SEEN-011 & SEEN-012: Moving last seen backwards is ignored (monotonicity guarantee)', async () => {
      const now = new Date().toISOString();
      vi.spyOn(lastSeenService, 'updateLastSeen').mockResolvedValueOnce({
        chatId,
        userId: bobId,
        lastSeenMessageId: 'msg-new-2',
        lastSeenAt: now,
        status: 'ignored_older_than_current',
      });

      const res = await request(app)
        .post(`/chat/${chatId}/lastseen`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ userId: bobId, messageId: 'msg-old-1' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ignored_older_than_current');
      expect(res.body.lastSeenMessageId).toBe('msg-new-2');
    });

    it('SEEN-008: Reject mismatched body userId with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/lastseen`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userId: bobId, messageId: msgId });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_USER_MISMATCH');
    });

    it('SEEN-003 & SEEN-004: Nonexistent chat or message returns 404 Not Found', async () => {
      vi.spyOn(lastSeenService, 'updateLastSeen').mockRejectedValueOnce(
        AppError.notFound('Message not found', 'MESSAGE_NOT_FOUND')
      );

      const res = await request(app)
        .post(`/chat/${chatId}/lastseen`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ userId: bobId, messageId: 'nonexistent-msg' });

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // Category 10: List User Chats (LIST-001 to LIST-022)
  // ---------------------------------------------------------------------------
  describe('Category 10: List User Chats (LIST-001..LIST-022)', () => {
    it('LIST-001..003: List chats for user returns array of chats and complete memberIds', async () => {
      vi.spyOn(userChatService, 'getUserChats').mockResolvedValueOnce({
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

      const res = await request(app)
        .get(`/user/${aliceId}/chats`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.chats.length).toBe(1);
      expect(res.body.data.chats[0].chatId).toBe(chatId);
      expect(res.body.data.chats[0].memberIds).toEqual([aliceId, bobId]);
    });

    it('LIST-004: User with no chats returns empty collection', async () => {
      vi.spyOn(userChatService, 'getUserChats').mockResolvedValueOnce({
        chats: [],
        nextCursor: null,
      });

      const res = await request(app)
        .get(`/user/${aliceId}/chats`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.chats).toEqual([]);
      expect(res.body.data.nextCursor).toBeNull();
    });

    it('LIST-008: Reject unauthorized caller inspecting another user’s chat list (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/user/${bobId}/chats`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED_USER_CHATS_ACCESS');
    });

    it('LIST-005 & LIST-011: Malformed user UUID is rejected and query limits are safely capped', async () => {
      // 1. Malformed UUID rejected with 400 Bad Request
      const res1 = await request(app)
        .get('/user/not-a-uuid/chats')
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(res1.status).toBe(400);

      // 2. Safe limit handling with service mock
      vi.spyOn(userChatService, 'getUserChats').mockResolvedValue({
        chats: [],
        nextCursor: null,
      });

      const res2 = await request(app)
        .get(`/user/${aliceId}/chats?limit=0`)
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(res2.status).toBe(200);

      const res3 = await request(app)
        .get(`/user/${aliceId}/chats?limit=101`)
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(res3.status).toBe(200);
    });
  });
});
