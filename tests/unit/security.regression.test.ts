import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('Security & Authorization Regression Suite', () => {
  const aliceId = '11111111-1111-4111-8111-111111111111';
  const bobId = '22222222-2222-4222-8222-222222222222';
  const chatId = '33333333-3333-4333-8333-333333333333';
  const messageId = 'msg-123';

  const aliceToken = jwt.sign({ sub: aliceId, email: 'alice@example.com' }, env.JWT_SECRET);
  const expiredToken = jwt.sign(
    { sub: aliceId, email: 'alice@example.com' },
    env.JWT_SECRET,
    { expiresIn: '0s' }
  );
  const forgedToken = jwt.sign(
    { sub: aliceId, email: 'alice@example.com' },
    'wrong-forged-secret-key-1234567890'
  );

  describe('JWT Verification across all protected endpoints', () => {
    const endpoints = [
      { method: 'post', path: '/chat/create', body: { userAId: aliceId, userBId: bobId } },
      { method: 'post', path: `/chat/${chatId}/message/send`, body: { senderId: aliceId, text: 'hi' } },
      { method: 'get', path: `/chat/${chatId}/messages` },
      { method: 'post', path: `/chat/${chatId}/message/${messageId}/read`, body: { userId: aliceId } },
      { method: 'post', path: `/chat/${chatId}/lastseen`, body: { userId: aliceId, messageId } },
      { method: 'get', path: `/user/${aliceId}/chats` },
    ];

    endpoints.forEach(({ method, path, body }) => {
      it(`rejects missing token with 401 on ${method.toUpperCase()} ${path}`, async () => {
        const req = method === 'post' ? request(app).post(path).send(body) : request(app).get(path);
        const res = await req;
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('TOKEN_REQUIRED');
      });

      it(`rejects expired token with 401 on ${method.toUpperCase()} ${path}`, async () => {
        const req = (method === 'post' ? request(app).post(path).send(body) : request(app).get(path))
          .set('Authorization', `Bearer ${expiredToken}`);
        const res = await req;
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_TOKEN');
      });

      it(`rejects forged token with 401 on ${method.toUpperCase()} ${path}`, async () => {
        const req = (method === 'post' ? request(app).post(path).send(body) : request(app).get(path))
          .set('Authorization', `Bearer ${forgedToken}`);
        const res = await req;
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_TOKEN');
      });
    });
  });

  describe('Input sanitization and limits', () => {
    it('rejects oversized message bodies (> 4000 chars) with 400', async () => {
      const oversizedText = 'a'.repeat(4001);
      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          senderId: aliceId,
          text: oversizedText,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects empty message text with 400', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          senderId: aliceId,
          text: '   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Information Disclosure Protections', () => {
    it('ensures stack trace is never returned in error responses', async () => {
      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userAId: 'not-a-uuid', userBId: 'not-a-uuid' });

      expect(res.body.stack).toBeUndefined();
      expect(res.body.error.stack).toBeUndefined();
    });

    it('returns standardized X-Request-Id header on all requests', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-request-id']).toBeDefined();
    });
  });
});
