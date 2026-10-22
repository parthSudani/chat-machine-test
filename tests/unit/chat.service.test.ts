import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from '../../src/services/chat.service';
import { ChatRepository } from '../../src/repositories/chat.repository';
import { UserRepository } from '../../src/repositories/user.repository';
import { AppError } from '../../src/utils/appError';
import { Chat, User } from '@prisma/client';

describe('ChatService (Unit)', () => {
  let chatService: ChatService;
  let mockChatRepo: ChatRepository;
  let mockUserRepo: UserRepository;

  const userA: User = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Alice',
    email: 'alice@example.com',
    passwordHash: 'hash',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userB: User = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Bob',
    email: 'bob@example.com',
    passwordHash: 'hash',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockChatRepo = {
      findDirectChatByCanonicalPair: vi.fn(),
      findById: vi.fn(),
      findMembership: vi.fn(),
      createDirectChatAtomic: vi.fn(),
    } as unknown as ChatRepository;

    mockUserRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      findManyByIds: vi.fn(),
      create: vi.fn(),
    } as unknown as UserRepository;

    chatService = new ChatService(mockChatRepo, mockUserRepo);
  });

  describe('Deterministic Canonical Ordering', () => {
    it('should sort user IDs lexicographically regardless of input order', () => {
      const id1 = 'aaa';
      const id2 = 'zzz';
      expect(chatService.getCanonicalPair(id1, id2)).toEqual(['aaa', 'zzz']);
      expect(chatService.getCanonicalPair(id2, id1)).toEqual(['aaa', 'zzz']);
    });
  });

  describe('createDirectChat', () => {
    it('should reject self-chat attempt (userAId === userBId)', async () => {
      await expect(
        chatService.createDirectChat(
          { userAId: userA.id, userBId: userA.id },
          userA.id
        )
      ).rejects.toThrow(AppError);

      try {
        await chatService.createDirectChat(
          { userAId: userA.id, userBId: userA.id },
          userA.id
        );
      } catch (err: unknown) {
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).code).toBe('SELF_CHAT_NOT_ALLOWED');
      }
    });

    it('should reject unauthorized creation attempt when caller is neither userA nor userB', async () => {
      const imposterId = '33333333-3333-4333-8333-333333333333';

      await expect(
        chatService.createDirectChat(
          { userAId: userA.id, userBId: userB.id },
          imposterId
        )
      ).rejects.toThrow(AppError);

      try {
        await chatService.createDirectChat(
          { userAId: userA.id, userBId: userB.id },
          imposterId
        );
      } catch (err: unknown) {
        expect((err as AppError).statusCode).toBe(403);
        expect((err as AppError).code).toBe('UNAUTHORIZED_CHAT_CREATION');
      }
    });

    it('should reject request when userA or userB does not exist', async () => {
      vi.mocked(mockUserRepo.findById).mockImplementation(async (id) => {
        if (id === userA.id) return userA;
        return null;
      });

      await expect(
        chatService.createDirectChat(
          { userAId: userA.id, userBId: 'nonexistent-uuid' },
          userA.id
        )
      ).rejects.toThrow(AppError);

      try {
        await chatService.createDirectChat(
          { userAId: userA.id, userBId: 'nonexistent-uuid' },
          userA.id
        );
      } catch (err: unknown) {
        expect((err as AppError).statusCode).toBe(404);
        expect((err as AppError).code).toBe('USER_NOT_FOUND');
      }
    });

    it('should successfully create a new direct chat when none exists', async () => {
      vi.mocked(mockUserRepo.findById).mockImplementation(async (id) => {
        if (id === userA.id) return userA;
        if (id === userB.id) return userB;
        return null;
      });

      vi.mocked(mockChatRepo.findDirectChatByCanonicalPair).mockResolvedValue(null);

      const createdChat: Chat = {
        id: 'chat-uuid-1',
        type: 'DIRECT',
        participantOneId: userA.id < userB.id ? userA.id : userB.id,
        participantTwoId: userA.id < userB.id ? userB.id : userA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockChatRepo.createDirectChatAtomic).mockResolvedValue({
        chat: createdChat,
        isNew: true,
      });

      const result = await chatService.createDirectChat(
        { userAId: userA.id, userBId: userB.id },
        userA.id
      );

      expect(result.chatId).toBe('chat-uuid-1');
      expect(result.isNew).toBe(true);
      expect(mockChatRepo.createDirectChatAtomic).toHaveBeenCalledWith(
        createdChat.participantOneId,
        createdChat.participantTwoId
      );
    });

    it('should return existing chat ID if conversation already exists', async () => {
      vi.mocked(mockUserRepo.findById).mockImplementation(async (id) => {
        if (id === userA.id) return userA;
        if (id === userB.id) return userB;
        return null;
      });

      const existingChat: Chat = {
        id: 'existing-chat-uuid',
        type: 'DIRECT',
        participantOneId: userA.id < userB.id ? userA.id : userB.id,
        participantTwoId: userA.id < userB.id ? userB.id : userA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockChatRepo.findDirectChatByCanonicalPair).mockResolvedValue(existingChat);

      const result = await chatService.createDirectChat(
        { userAId: userA.id, userBId: userB.id },
        userA.id
      );

      expect(result.chatId).toBe('existing-chat-uuid');
      expect(result.isNew).toBe(false);
      expect(mockChatRepo.createDirectChatAtomic).not.toHaveBeenCalled();
    });

    it('should return the same chat ID when called with reversed user order', async () => {
      vi.mocked(mockUserRepo.findById).mockImplementation(async (id) => {
        if (id === userA.id) return userA;
        if (id === userB.id) return userB;
        return null;
      });

      const existingChat: Chat = {
        id: 'canonical-chat-uuid',
        type: 'DIRECT',
        participantOneId: userA.id < userB.id ? userA.id : userB.id,
        participantTwoId: userA.id < userB.id ? userB.id : userA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockChatRepo.findDirectChatByCanonicalPair).mockResolvedValue(existingChat);

      // Call with reversed order (userB first, called by userB)
      const result = await chatService.createDirectChat(
        { userAId: userB.id, userBId: userA.id },
        userB.id
      );

      expect(result.chatId).toBe('canonical-chat-uuid');
      expect(result.isNew).toBe(false);
      expect(mockChatRepo.findDirectChatByCanonicalPair).toHaveBeenCalledWith(
        existingChat.participantOneId,
        existingChat.participantTwoId
      );
    });

    it('should handle concurrency race condition where another request creates the chat first', async () => {
      vi.mocked(mockUserRepo.findById).mockImplementation(async (id) => {
        if (id === userA.id) return userA;
        if (id === userB.id) return userB;
        return null;
      });

      // Initially find returns null (simulating concurrent read before commit)
      vi.mocked(mockChatRepo.findDirectChatByCanonicalPair).mockResolvedValue(null);

      const existingChat: Chat = {
        id: 'race-winner-chat-uuid',
        type: 'DIRECT',
        participantOneId: userA.id < userB.id ? userA.id : userB.id,
        participantTwoId: userA.id < userB.id ? userB.id : userA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Atomic create intercepts the race conflict and returns existing
      vi.mocked(mockChatRepo.createDirectChatAtomic).mockResolvedValue({
        chat: existingChat,
        isNew: false,
      });

      const result = await chatService.createDirectChat(
        { userAId: userA.id, userBId: userB.id },
        userA.id
      );

      expect(result.chatId).toBe('race-winner-chat-uuid');
      expect(result.isNew).toBe(false);
    });
  });
});
