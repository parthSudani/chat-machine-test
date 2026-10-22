import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { userChatService } from '../../src/services/userChat.service';
import { AppError } from '../../src/utils/appError';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('User Chat Listing API (Supertest)', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';

  const userToken = jwt.sign(
    { sub: userId, email: 'alice@example.com' },
    env.JWT_SECRET
  );

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(app).get(`/user/${userId}/chats`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_REQUIRED');
  });

  it('rejects invalid UUID format with 400', async () => {
    const res = await request(app)
      .get('/user/not-a-valid-uuid/chats')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects attempt to list chats for another user with 403', async () => {
    vi.spyOn(userChatService, 'getUserChats').mockRejectedValue(
      AppError.forbidden(
        'Caller is not authorized to list chats for another user',
        'UNAUTHORIZED_USER_CHATS_ACCESS'
      )
    );

    const res = await request(app)
      .get(`/user/${otherUserId}/chats`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('UNAUTHORIZED_USER_CHATS_ACCESS');
  });

  it('rejects request when target user does not exist with 404', async () => {
    vi.spyOn(userChatService, 'getUserChats').mockRejectedValue(
      AppError.notFound('User does not exist', 'USER_NOT_FOUND')
    );

    const res = await request(app)
      .get(`/user/${userId}/chats`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('successfully returns chats list and conforms to assessment format', async () => {
    const nowIso = new Date().toISOString();
    vi.spyOn(userChatService, 'getUserChats').mockResolvedValue({
      chats: [
        {
          chatId: 'chat-uuid-1',
          type: 'DIRECT',
          memberIds: [userId, otherUserId],
          createdAt: nowIso,
        },
      ],
      nextCursor: null,
    });

    const res = await request(app)
      .get(`/user/${userId}/chats?limit=20`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.chats.length).toBe(1);
    expect(res.body.data.chats[0].chatId).toBe('chat-uuid-1');
    expect(res.body.data.chats[0].type).toBe('DIRECT');
    expect(res.body.data.chats[0].memberIds).toEqual([userId, otherUserId]);
    expect(res.body.data.nextCursor).toBeNull();
  });
});
