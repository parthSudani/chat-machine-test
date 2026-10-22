import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from '../../src/validation/auth.schema';
import { createChatSchema } from '../../src/validation/chat.schema';

describe('Validation Schemas (Unit)', () => {
  describe('User Registration Validation', () => {
    it('should validate valid registration input', () => {
      const valid = {
        name: 'Alice Smith',
        email: 'alice@example.com',
        password: 'Password123!',
      };
      const result = registerSchema.body.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email format', () => {
      const invalid = {
        name: 'Alice',
        email: 'not-an-email',
        password: 'Password123!',
      };
      const result = registerSchema.body.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Invalid email');
      }
    });

    it('should reject missing required fields', () => {
      const result = registerSchema.body.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map((i) => i.path[0]);
        expect(fields).toContain('name');
        expect(fields).toContain('email');
        expect(fields).toContain('password');
      }
    });

    it('should reject weak/short password (< 8 chars)', () => {
      const invalid = {
        name: 'Alice',
        email: 'alice@example.com',
        password: 'short',
      };
      const result = registerSchema.body.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('at least 8 characters');
      }
    });
  });

  describe('User Login Validation', () => {
    it('should validate valid login input', () => {
      const valid = {
        email: 'alice@example.com',
        password: 'Password123!',
      };
      const result = loginSchema.body.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject empty password', () => {
      const invalid = {
        email: 'alice@example.com',
        password: '',
      };
      const result = loginSchema.body.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Chat Creation Validation', () => {
    it('should validate valid UUIDs for userAId and userBId', () => {
      const valid = {
        userAId: '550e8400-e29b-41d4-a716-446655440000',
        userBId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      };
      const result = createChatSchema.body.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID format', () => {
      const invalid = {
        userAId: 'not-a-uuid',
        userBId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      };
      const result = createChatSchema.body.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('valid UUID');
      }
    });
  });
});
