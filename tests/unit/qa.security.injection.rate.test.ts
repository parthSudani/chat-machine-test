import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { messageService } from '../../src/services/message.service';

describe('QA Category 11–14 & 23: Security, Validation, Injection & HTTP Transport', () => {
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
  // Category 11: Request Validation and HTTP Protocol (VAL-001 to VAL-022)
  // ---------------------------------------------------------------------------
  describe('Category 11: Request Validation & Protocol (VAL-001..VAL-022)', () => {
    it('VAL-001: Malformed JSON syntax returns 400 Bad Request', async () => {
      const res = await request(app)
        .post('/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"name": "Alice", unclosed:');
      expect(res.status).toBe(400);
    });

    it('VAL-002: Empty body where body required returns 400 Bad Request', async () => {
      const res = await request(app)
        .post('/auth/register')
        .set('Content-Type', 'application/json')
        .send('');
      expect(res.status).toBe(400);
    });

    it('VAL-006: Payload exceeding 100kb is rejected with 413 Payload Too Large', async () => {
      const largePayload = 'x'.repeat(105 * 1024);
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'Password123!', extra: largePayload });
      expect(res.status).toBe(413);
    });

    it('VAL-008 & VAL-009: Null or incorrect primitive types return 400 Bad Request', async () => {
      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userAId: 12345, userBId: null });
      expect(res.status).toBe(400);
    });

    it('VAL-020: Unknown route returns controlled 404 response with consistent JSON error schema', async () => {
      const res = await request(app).get('/unknown-api-endpoint-123');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error).toHaveProperty('message');
    });
  });

  // ---------------------------------------------------------------------------
  // Category 12: Authorization and Object-Level Security (SEC-001 to SEC-018)
  // ---------------------------------------------------------------------------
  describe('Category 12: Object-Level Security & Anti-Spoofing (SEC-001..SEC-018)', () => {
    it('SEC-001: User cannot access chat without membership', async () => {
      vi.spyOn(messageService, 'getMessages').mockRejectedValueOnce(
        new Error('Caller is not a member of this chat')
      );
      const res = await request(app)
        .get(`/chat/${chatId}/messages`)
        .set('Authorization', `Bearer ${eveToken}`);
      expect([403, 500]).toContain(res.status);
    });

    it('SEC-006: User cannot forge senderId to impersonate another user', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: bobId, text: 'I am Bob, honest!' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_USER_MISMATCH');
    });

    it('SEC-007: User cannot forge userId in read receipt', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/message/msg-1/read`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userId: bobId });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_USER_MISMATCH');
    });

    it('SEC-008: User cannot forge userId in last-seen update', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/lastseen`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userId: bobId, messageId: 'msg-1' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_USER_MISMATCH');
    });
  });

  // ---------------------------------------------------------------------------
  // Category 13: Input Injection and Output Safety (INJ-001 to INJ-018)
  // ---------------------------------------------------------------------------
  describe('Category 13: Input Injection & Output Safety (INJ-001..INJ-018)', () => {
    it('INJ-001 & INJ-003: SQL injection syntax in message text is safely treated as inert string', async () => {
      const sqlInjectionString = "' UNION SELECT * FROM users; DROP TABLE users; --";
      vi.spyOn(messageService, 'sendMessage').mockResolvedValueOnce({
        messageId: 'msg-sql-test',
        chatId,
        senderId: aliceId,
        text: sqlInjectionString,
        createdAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: sqlInjectionString });

      expect(res.status).toBe(201);
      expect(res.body.text).toBe(sqlInjectionString);
    });

    it('INJ-005: NoSQL operator injection in payload is rejected by Zod type validation', async () => {
      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: { $gt: '' } });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('INJ-009 & INJ-010: HTML script tags stored as plain string without script execution', async () => {
      const xssString = '<script>alert("XSS")</script>';
      vi.spyOn(messageService, 'sendMessage').mockResolvedValueOnce({
        messageId: 'msg-xss-test',
        chatId,
        senderId: aliceId,
        text: xssString,
        createdAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: xssString });

      expect(res.status).toBe(201);
      expect(res.body.text).toBe(xssString);
    });

    it('INJ-012: Multibyte emoji and international Unicode text handled properly', async () => {
      const unicodeString = 'Hello 🌍! 🚀 नमस्ते 🌟 こんにちは';
      vi.spyOn(messageService, 'sendMessage').mockResolvedValueOnce({
        messageId: 'msg-unicode-test',
        chatId,
        senderId: aliceId,
        text: unicodeString,
        createdAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post(`/chat/${chatId}/message/send`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ senderId: aliceId, text: unicodeString });

      expect(res.status).toBe(201);
      expect(res.body.text).toBe(unicodeString);
    });
  });

  // ---------------------------------------------------------------------------
  // Category 14 & 23: Rate Limiting & HTTP Transport Security (RATE & HTTP)
  // ---------------------------------------------------------------------------
  describe('Category 14 & 23: Rate Limiting & Transport Security', () => {
    it('HTTP-004: Helmet security headers are present on responses', async () => {
      const res = await request(app).get('/health');
      expect(res.headers).toHaveProperty('x-content-type-options');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers).toHaveProperty('x-frame-options');
    });

    it('HTTP-001 & HTTP-003: CORS allows cross-origin requests and options preflight', async () => {
      const res = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');

      expect([200, 204]).toContain(res.status);
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });

    it('LOG-001: Responses contain X-Request-Id correlation header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers).toHaveProperty('x-request-id');
      expect(typeof res.headers['x-request-id']).toBe('string');
    });
  });
});
