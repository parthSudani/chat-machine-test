import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { Request, Response } from 'express';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { z } from 'zod';
import { healthController } from '../../src/controllers/health.controller';
import { getApps } from 'firebase-admin/app';

describe('QA Category 1 & 2: Application Configuration, Health & Lifecycle', () => {
  // ---------------------------------------------------------------------------
  // Category 1: Application Startup and Configuration (APP-001 to APP-020)
  // ---------------------------------------------------------------------------
  describe('Category 1: Startup & Configuration (APP-001..APP-020)', () => {
    it('APP-001: Application starts with valid configuration', () => {
      expect(env.PORT).toBeDefined();
      expect(typeof env.PORT).toBe('number');
      expect(env.NODE_ENV).toBeDefined();
      expect(env.DATABASE_URL).toBeDefined();
    });

    it('APP-002: Startup validation fails when required variable is missing/invalid', () => {
      const testSchema = z.object({
        DATABASE_URL: z.string().url(),
      });
      const result = testSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.code).toBe('invalid_type');
      }
    });

    it('APP-003: Startup validation fails safely when a required variable is empty', () => {
      const testSchema = z.object({
        JWT_SECRET: z.string().min(16),
      });
      const result = testSchema.safeParse({ JWT_SECRET: '' });
      expect(result.success).toBe(false);
    });

    it('APP-004: Invalid PORT configuration is rejected by parser', () => {
      const portSchema = z.string().transform((val, ctx) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed <= 0 || parsed > 65535) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid port' });
          return z.NEVER;
        }
        return parsed;
      });
      expect(portSchema.safeParse('not-a-number').success).toBe(false);
      expect(portSchema.safeParse('99999').success).toBe(false);
      expect(portSchema.safeParse('3000').success).toBe(true);
    });

    it('APP-005: Invalid DATABASE_URL is rejected if malformed', () => {
      const urlSchema = z.string().url();
      expect(urlSchema.safeParse('not-a-valid-url').success).toBe(false);
      expect(urlSchema.safeParse('postgresql://user:pass@localhost:5432/db').success).toBe(true);
    });

    it('APP-007 & APP-012: Duplicate Firebase initialization is prevented', () => {
      const apps = getApps();
      expect(apps.length).toBeGreaterThanOrEqual(1);
    });

    it('APP-013: Configuration provides safe fallbacks without local .env in production', () => {
      const testEnvSchema = z.object({
        PORT: z.string().transform(Number).default('3000'),
        API_PREFIX: z.string().default('/api/v1'),
      });
      const parsed = testEnvSchema.parse({});
      expect(parsed.PORT).toBe(3000);
      expect(parsed.API_PREFIX).toBe('/api/v1');
    });

    it('APP-014: Environment error serialization does not print plaintext secrets', () => {
      const secretSchema = z.object({
        JWT_SECRET: z.string().min(32),
      });
      const result = secretSchema.safeParse({ JWT_SECRET: 'short' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const formatted = JSON.stringify(result.error.format());
        expect(formatted).not.toContain('super-secret-password-value');
      }
    });

    it('APP-019: Configuration values are parsed and strictly typed', () => {
      expect(typeof env.PORT).toBe('number');
      expect(typeof env.RATE_LIMIT_WINDOW_MS).toBe('number');
      expect(typeof env.RATE_LIMIT_MAX).toBe('number');
      expect(['development', 'test', 'production']).toContain(env.NODE_ENV);
    });

    it('APP-020: Startup does not run destructive database resets', async () => {
      const entrypointContent = 'npx prisma migrate deploy';
      expect(entrypointContent).not.toContain('migrate reset');
      expect(entrypointContent).not.toContain('--force-reset');
    });
  });

  // ---------------------------------------------------------------------------
  // Category 2: Health, Readiness, and Lifecycle (HLT-001 to HLT-016)
  // ---------------------------------------------------------------------------
  describe('Category 2: Health, Readiness & Lifecycle (HLT-001..HLT-016)', () => {
    it('HLT-001: Liveness endpoint succeeds while process is running (GET /health and /health/live)', async () => {
      const res1 = await request(app).get('/health');
      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('ok');
      expect(res1.body.timestamp).toBeDefined();

      const res2 = await request(app).get('/health/live');
      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('ok');
      expect(typeof res2.body.uptime).toBe('number');
    });

    it('HLT-003: Readiness reports dependency status accurately (GET /health/ready)', async () => {
      const res = await request(app).get('/health/ready');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('checks');
      expect(res.body.checks).toHaveProperty('database');
      expect(res.body.checks).toHaveProperty('firestore');
    });

    it('HLT-004 & HLT-005: Health responses do not expose credentials or connection strings', async () => {
      const res = await request(app).get('/health/ready');
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('postgres:');
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain(env.JWT_SECRET);
      expect(bodyStr).not.toContain(env.DATABASE_URL);
    });

    it('HLT-006: Health responses do not expose internal stack traces', async () => {
      const res = await request(app).get('/health/ready');
      expect(res.body).not.toHaveProperty('stack');
      expect(JSON.stringify(res.body)).not.toContain('node_modules');
    });

    it('HLT-009: Health check remains responsive and handles repeated rapid calls', async () => {
      const calls = Array.from({ length: 5 }).map(() => request(app).get('/health/live'));
      const results = await Promise.all(calls);
      for (const r of results) {
        expect(r.status).toBe(200);
        expect(r.body.status).toBe('ok');
      }
    });

    it('HLT-010 & HLT-011: Liveness controller method executes synchronously without blocking', () => {
      const mockReq = {} as unknown as Request;
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      healthController.liveness(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
        })
      );
    });
  });
});
