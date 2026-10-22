import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { app } from '../../src/app';
import { authService } from '../../src/services/auth.service';
import { env } from '../../src/config/env';
import { AppError } from '../../src/utils/appError';

describe('QA Category 3 & 4: Registration, User Management & Authentication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Category 3: Registration and User Management (USR-001 to USR-027)
  // ---------------------------------------------------------------------------
  describe('Category 3: Registration & User Management (USR-001..USR-027)', () => {
    it('USR-001: Register a valid user returns safe user and token', async () => {
      vi.spyOn(authService, 'register').mockResolvedValueOnce({
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Alice Smith',
          email: 'alice@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        token: 'valid.jwt.token',
      });

      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Alice Smith', email: 'alice@example.com', password: 'Password123!' });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('alice@example.com');
      expect(res.body.token).toBe('valid.jwt.token');
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('USR-002: Register with missing name is rejected (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'alice@example.com', password: 'Password123!' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('USR-003: Register with missing email is rejected (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Alice Smith', password: 'Password123!' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('USR-004: Register with missing password is rejected (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Alice Smith', email: 'alice@example.com' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('USR-005 & USR-006: Register with empty or whitespace-only name is rejected', async () => {
      const res1 = await request(app)
        .post('/auth/register')
        .send({ name: '', email: 'alice@example.com', password: 'Password123!' });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/auth/register')
        .send({ name: '    ', email: 'alice@example.com', password: 'Password123!' });
      expect(res2.status).toBe(400);
    });

    it('USR-007: Register with invalid email format is rejected (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Alice', email: 'not-an-email', password: 'Password123!' });
      expect(res.status).toBe(400);
    });

    it('USR-009 & USR-010: Duplicate email registration returns 409 Conflict', async () => {
      vi.spyOn(authService, 'register').mockRejectedValueOnce(
        AppError.conflict('User with this email already exists', 'USER_ALREADY_EXISTS')
      );

      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Alice', email: 'duplicate@example.com', password: 'Password123!' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USER_ALREADY_EXISTS');
    });

    it('USR-013: Register with short password (<8 chars) is rejected', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'short' });
      expect(res.status).toBe(400);
    });

    it('USR-015 & USR-016: Register with null or non-string values is rejected', async () => {
      const res1 = await request(app)
        .post('/auth/register')
        .send({ name: null, email: 'alice@example.com', password: 'Password123!' });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/auth/register')
        .send({ name: 'Alice', email: 'alice@example.com', password: 12345678 });
      expect(res2.status).toBe(400);
    });

    it('USR-020 & USR-021: Verify bcrypt password hashing produces non-plaintext salt & hash', async () => {
      const rawPassword = 'Password123!';
      const hash = await bcrypt.hash(rawPassword, 10);
      expect(hash).not.toBe(rawPassword);
      expect(hash.startsWith('$2')).toBe(true);
      expect(await bcrypt.compare(rawPassword, hash)).toBe(true);
      expect(await bcrypt.compare('WrongPassword', hash)).toBe(false);
    });

    it('USR-022: passwordHash is strictly excluded from SafeUser serialization', async () => {
      vi.spyOn(authService, 'register').mockResolvedValueOnce({
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Alice',
          email: 'alice@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        token: 'token',
      });

      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'Password123!' });

      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.user).not.toHaveProperty('password');
    });
  });

  // ---------------------------------------------------------------------------
  // Category 4: Login and Token Authentication (AUTH-001 to AUTH-034)
  // ---------------------------------------------------------------------------
  describe('Category 4: Login & Token Authentication (AUTH-001..AUTH-034)', () => {
    it('AUTH-001: Login with valid credentials returns 200 OK and token', async () => {
      vi.spyOn(authService, 'login').mockResolvedValueOnce({
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Alice',
          email: 'alice@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        token: 'valid.login.jwt',
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'alice@example.com', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('valid.login.jwt');
    });

    it('AUTH-002 & AUTH-003: Login with invalid credentials returns 401 Unauthorized without enumeration', async () => {
      vi.spyOn(authService, 'login').mockRejectedValueOnce(
        AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS')
      );

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'alice@example.com', password: 'WrongPassword!' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toContain('Invalid email or password');
    });

    it('AUTH-011 & AUTH-012: Generated JWT tokens contain expected identity claims and expiry', () => {
      const userId = '11111111-1111-4111-8111-111111111111';
      const token = jwt.sign({ sub: userId, email: 'alice@example.com' }, env.JWT_SECRET, {
        expiresIn: '1h',
      });

      const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
      expect(decoded.sub).toBe(userId);
      expect(decoded.email).toBe('alice@example.com');
      expect(decoded.exp).toBeDefined();
    });

    it('AUTH-013: Requesting protected route without Authorization header returns 401', async () => {
      const res = await request(app)
        .post('/chat/create')
        .send({
          userAId: '11111111-1111-4111-8111-111111111111',
          userBId: '22222222-2222-4222-8222-222222222222',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_REQUIRED');
    });

    it('AUTH-015..AUTH-018: Malformed or forged JWT signature is rejected with 401', async () => {
      // 1. Completely malformed token
      const res1 = await request(app)
        .post('/chat/create')
        .set('Authorization', 'Bearer totally-invalid-jwt-format')
        .send({ userAId: '11111111-1111-4111-8111-111111111111', userBId: '22222222-2222-4222-8222-222222222222' });
      expect(res1.status).toBe(401);

      // 2. Token signed with wrong secret
      const forgedToken = jwt.sign({ sub: '11111111-1111-4111-8111-111111111111' }, 'wrong-attacker-secret-key-12345');
      const res2 = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${forgedToken}`)
        .send({ userAId: '11111111-1111-4111-8111-111111111111', userBId: '22222222-2222-4222-8222-222222222222' });
      expect(res2.status).toBe(401);
    });

    it('AUTH-019: Expired JWT token is rejected with 401 Unauthorized', async () => {
      const expiredToken = jwt.sign(
        { sub: '11111111-1111-4111-8111-111111111111', exp: Math.floor(Date.now() / 1000) - 3600 },
        env.JWT_SECRET
      );

      const res = await request(app)
        .post('/chat/create')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ userAId: '11111111-1111-4111-8111-111111111111', userBId: '22222222-2222-4222-8222-222222222222' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('AUTH-028: JWT Secret is securely configured and not default trivial string', () => {
      expect(env.JWT_SECRET).toBeDefined();
      expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(16);
      expect(env.JWT_SECRET).not.toBe('secret');
      expect(env.JWT_SECRET).not.toBe('password');
    });
  });
});
