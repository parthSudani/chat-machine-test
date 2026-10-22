import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { authService } from '../../src/services/auth.service';
import { chatService } from '../../src/services/chat.service';
import { AppError } from '../../src/utils/appError';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('HTTP API Endpoints (Supertest)', () => {
  const userAId = '11111111-1111-4111-8111-111111111111';
  const userBId = '22222222-2222-4222-8222-222222222222';

  const userAToken = jwt.sign(
    { sub: userAId, email: 'alice@example.com' },
    env.JWT_SECRET
  );

  const imposterToken = jwt.sign(
    { sub: '99999999-9999-4999-8999-999999999999', email: 'imposter@example.com' },
    env.JWT_SECRET
  );

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 OK with health status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('POST /auth/register', () => {
    it('should successfully register user and return 201 with safe user and token', async () => {
      vi.spyOn(authService, 'register').mockResolvedValue({
        user: {
          id: userAId,
          name: 'Alice',
          email: 'alice@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        token: 'jwt-token-123',
      });

      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Alice',
          email: 'alice@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe(userAId);
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.token).toBe('jwt-token-123');
    });

    it('should return 400 when body fails Zod validation (invalid email)', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Alice',
          email: 'not-an-email',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when password is too short', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Alice',
          email: 'alice@example.com',
          password: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 409 when email already exists', async () => {
      vi.spyOn(authService, 'register').mockRejectedValue(
        AppError.conflict('An account with this email already exists', 'DUPLICATE_EMAIL')
      );

      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Alice',
          email: 'alice@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE_EMAIL');
    });
  });

  describe('POST /auth/login', () => {
    it('should return 200 with token on valid login', async () => {
      vi.spyOn(authService, 'login').mockResolvedValue({
        user: {
          id: userAId,
          name: 'Alice',
          email: 'alice@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        token: 'jwt-token-abc',
      });

      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('jwt-token-abc');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('should return 401 on invalid credentials', async () => {
      vi.spyOn(authService, 'login').mockRejectedValue(
        AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS')
      );

      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /chat/create', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/chat/create')
        .send({
          userAId,
          userBId,
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_REQUIRED');
    });

    it('should reject request with invalid UUIDs with 400', async () => {
      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          userAId: 'not-a-uuid',
          userBId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject self-chat attempt with 400', async () => {
      vi.spyOn(chatService, 'createDirectChat').mockRejectedValue(
        AppError.badRequest('Cannot create a 1:1 conversation with oneself', 'SELF_CHAT_NOT_ALLOWED')
      );

      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          userAId,
          userBId: userAId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SELF_CHAT_NOT_ALLOWED');
    });

    it('should reject unauthorized creation attempt with 403', async () => {
      vi.spyOn(chatService, 'createDirectChat').mockRejectedValue(
        AppError.forbidden(
          'Caller is not authorized to create a conversation between other users',
          'UNAUTHORIZED_CHAT_CREATION'
        )
      );

      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${imposterToken}`)
        .send({
          userAId,
          userBId,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED_CHAT_CREATION');
    });

    it('should return 404 if a user does not exist', async () => {
      vi.spyOn(chatService, 'createDirectChat').mockRejectedValue(
        AppError.notFound("User with id '...' does not exist", 'USER_NOT_FOUND')
      );

      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          userAId,
          userBId,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should successfully create new chat and return 201 with chatId', async () => {
      vi.spyOn(chatService, 'createDirectChat').mockResolvedValue({
        chatId: 'new-chat-uuid-123',
        isNew: true,
      });

      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          userAId,
          userBId,
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ chatId: 'new-chat-uuid-123' });
    });

    it('should return 200 with existing chatId when conversation already exists', async () => {
      vi.spyOn(chatService, 'createDirectChat').mockResolvedValue({
        chatId: 'existing-chat-uuid-456',
        isNew: false,
      });

      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          userAId,
          userBId,
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ chatId: 'existing-chat-uuid-456' });
    });
  });
});
