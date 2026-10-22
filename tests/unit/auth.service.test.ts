import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../../src/services/auth.service';
import { UserRepository } from '../../src/repositories/user.repository';
import { AppError } from '../../src/utils/appError';
import bcrypt from 'bcryptjs';
import { User } from '@prisma/client';

describe('AuthService (Unit)', () => {
  let authService: AuthService;
  let mockUserRepo: UserRepository;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      findManyByIds: vi.fn(),
      create: vi.fn(),
    } as unknown as UserRepository;

    authService = new AuthService(mockUserRepo);
  });

  describe('register', () => {
    it('should successfully register a user and return safe user with token', async () => {
      const mockUser: User = {
        id: 'user-uuid-1',
        name: 'Alice Smith',
        email: 'alice@example.com',
        passwordHash: 'hashed_password_123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockUserRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(mockUserRepo.create).mockResolvedValue(mockUser);

      const result = await authService.register({
        name: 'Alice Smith',
        email: 'ALICE@EXAMPLE.COM', // Test email normalization
        password: 'Password123!',
      });

      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('alice@example.com');
      expect(mockUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Alice Smith',
          email: 'alice@example.com',
        })
      );
      expect(result.token).toBeDefined();
      expect(result.user.id).toBe('user-uuid-1');
      expect(result.user.name).toBe('Alice Smith');
      expect(result.user.email).toBe('alice@example.com');
      // Verify passwordHash is never returned
      expect((result.user as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('should reject registration if email already exists', async () => {
      const existingUser: User = {
        id: 'user-uuid-2',
        name: 'Existing Alice',
        email: 'alice@example.com',
        passwordHash: 'hashed_password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockUserRepo.findByEmail).mockResolvedValue(existingUser);

      await expect(
        authService.register({
          name: 'Alice',
          email: 'alice@example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow(AppError);

      try {
        await authService.register({
          name: 'Alice',
          email: 'alice@example.com',
          password: 'Password123!',
        });
      } catch (err: unknown) {
        expect((err as AppError).statusCode).toBe(409);
        expect((err as AppError).code).toBe('DUPLICATE_EMAIL');
      }
    });
  });

  describe('login', () => {
    it('should successfully log in and return safe user and token', async () => {
      const password = 'Password123!';
      const passwordHash = await bcrypt.hash(password, 10);
      const user: User = {
        id: 'user-uuid-1',
        name: 'Alice Smith',
        email: 'alice@example.com',
        passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockUserRepo.findByEmail).mockResolvedValue(user);

      const result = await authService.login({
        email: 'alice@example.com',
        password,
      });

      expect(result.token).toBeDefined();
      expect(result.user.id).toBe('user-uuid-1');
      expect((result.user as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('should reject login with nonexistent email', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'unknown@example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow(AppError);

      try {
        await authService.login({
          email: 'unknown@example.com',
          password: 'Password123!',
        });
      } catch (err: unknown) {
        expect((err as AppError).statusCode).toBe(401);
        expect((err as AppError).code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('should reject login with incorrect password', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword123!', 10);
      const user: User = {
        id: 'user-uuid-1',
        name: 'Alice Smith',
        email: 'alice@example.com',
        passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockUserRepo.findByEmail).mockResolvedValue(user);

      await expect(
        authService.login({
          email: 'alice@example.com',
          password: 'WrongPassword!',
        })
      ).rejects.toThrow(AppError);

      try {
        await authService.login({
          email: 'alice@example.com',
          password: 'WrongPassword!',
        });
      } catch (err: unknown) {
        expect((err as AppError).statusCode).toBe(401);
        expect((err as AppError).code).toBe('INVALID_CREDENTIALS');
      }
    });
  });

  describe('getUserById', () => {
    it('should return safe user when found', async () => {
      const user: User = {
        id: 'user-uuid-1',
        name: 'Alice Smith',
        email: 'alice@example.com',
        passwordHash: 'secret_hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockUserRepo.findById).mockResolvedValue(user);

      const result = await authService.getUserById('user-uuid-1');
      expect(result.id).toBe('user-uuid-1');
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('should throw 404 when user not found', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValue(null);

      await expect(authService.getUserById('nonexistent')).rejects.toThrow(AppError);
    });
  });
});
