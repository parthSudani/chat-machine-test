import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserChatService } from '../../src/services/userChat.service';
import { ChatRepository } from '../../src/repositories/chat.repository';
import { UserRepository } from '../../src/repositories/user.repository';
import { AppError } from '../../src/utils/appError';
import { User } from '@prisma/client';

describe('UserChatService (Unit)', () => {
  let service: UserChatService;
  let mockChatRepo: ChatRepository;
  let mockUserRepo: UserRepository;

  const userId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    mockChatRepo = {
      findUserChats: vi.fn(),
      findById: vi.fn(),
      findMembership: vi.fn(),
      findDirectChatByCanonicalPair: vi.fn(),
      createDirectChatAtomic: vi.fn(),
    } as unknown as ChatRepository;

    mockUserRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findManyByIds: vi.fn(),
      create: vi.fn(),
    } as unknown as UserRepository;

    service = new UserChatService(mockChatRepo, mockUserRepo);
  });

  it('rejects attempt to list chats for another user with 403', async () => {
    await expect(
      service.getUserChats({
        targetUserId: otherUserId,
        callerId: userId,
        limit: 20,
      })
    ).rejects.toThrow(AppError);

    try {
      await service.getUserChats({
        targetUserId: otherUserId,
        callerId: userId,
        limit: 20,
      });
    } catch (err: unknown) {
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('UNAUTHORIZED_USER_CHATS_ACCESS');
    }
  });

  it('rejects request when target user does not exist with 404', async () => {
    vi.mocked(mockUserRepo.findById).mockResolvedValue(null);

    await expect(
      service.getUserChats({
        targetUserId: userId,
        callerId: userId,
        limit: 20,
      })
    ).rejects.toThrow(AppError);

    try {
      await service.getUserChats({
        targetUserId: userId,
        callerId: userId,
        limit: 20,
      });
    } catch (err: unknown) {
      expect((err as AppError).statusCode).toBe(404);
      expect((err as AppError).code).toBe('USER_NOT_FOUND');
    }
  });

  it('successfully returns user chats with member IDs', async () => {
    const mockUser: User = {
      id: userId,
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(mockUserRepo.findById).mockResolvedValue(mockUser);

    const now = new Date();
    vi.mocked(mockChatRepo.findUserChats).mockResolvedValue({
      chats: [
        {
          chatId: 'chat-1',
          type: 'DIRECT',
          memberIds: [userId, otherUserId],
          createdAt: now,
          updatedAt: now,
        },
      ],
      nextCursor: null,
    });

    const result = await service.getUserChats({
      targetUserId: userId,
      callerId: userId,
      limit: 20,
    });

    expect(result.chats.length).toBe(1);
    expect(result.chats[0]?.chatId).toBe('chat-1');
    expect(result.chats[0]?.memberIds).toEqual([userId, otherUserId]);
    expect(result.chats[0]?.type).toBe('DIRECT');
    expect(result.nextCursor).toBeNull();
  });

  it('returns empty list for a user with no conversations', async () => {
    const mockUser: User = {
      id: userId,
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(mockUserRepo.findById).mockResolvedValue(mockUser);

    vi.mocked(mockChatRepo.findUserChats).mockResolvedValue({
      chats: [],
      nextCursor: null,
    });

    const result = await service.getUserChats({
      targetUserId: userId,
      callerId: userId,
      limit: 20,
    });

    expect(result.chats).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('correctly passes pagination parameters and returns nextCursor when available', async () => {
    const mockUser: User = {
      id: userId,
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(mockUserRepo.findById).mockResolvedValue(mockUser);

    const now = new Date();
    vi.mocked(mockChatRepo.findUserChats).mockResolvedValue({
      chats: [
        {
          chatId: 'chat-1',
          type: 'DIRECT',
          memberIds: [userId, otherUserId],
          createdAt: now,
          updatedAt: now,
        },
      ],
      nextCursor: 'chat-1',
    });

    const result = await service.getUserChats({
      targetUserId: userId,
      callerId: userId,
      limit: 1,
      cursor: undefined,
    });

    expect(mockChatRepo.findUserChats).toHaveBeenCalledWith(userId, 1, undefined);
    expect(result.chats.length).toBe(1);
    expect(result.nextCursor).toBe('chat-1');
  });
});
