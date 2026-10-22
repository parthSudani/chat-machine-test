import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageService } from '../../src/services/message.service';
import { ChatRepository, ChatWithMembers } from '../../src/repositories/chat.repository';
import {
  MessageFirestoreRepository,
  FirestoreMessage,
} from '../../src/repositories/message.firestore.repository';
import { AppError } from '../../src/utils/appError';
import { Timestamp } from '../../src/config/firebase';
import { ChatMember } from '@prisma/client';

describe('MessageService (Unit)', () => {
  let service: MessageService;
  let mockChatRepo: ChatRepository;
  let mockFirestoreRepo: MessageFirestoreRepository;

  const chatId = '11111111-1111-4111-8111-111111111111';
  const callerId = '22222222-2222-4222-8222-222222222222';
  const otherUserId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    mockChatRepo = {
      findById: vi.fn(),
      findMembership: vi.fn(),
      findDirectChatByCanonicalPair: vi.fn(),
      createDirectChatAtomic: vi.fn(),
      findUserChats: vi.fn(),
    } as unknown as ChatRepository;

    mockFirestoreRepo = {
      createMessage: vi.fn(),
      getMessage: vi.fn(),
      getChatMessages: vi.fn(),
      recordReadReceiptIdempotent: vi.fn(),
      updateLastSeenMonotonic: vi.fn(),
      getMemberLastSeen: vi.fn(),
    } as unknown as MessageFirestoreRepository;

    service = new MessageService(mockChatRepo, mockFirestoreRepo);
  });

  describe('sendMessage', () => {
    it('rejects attempt when senderId does not match callerId', async () => {
      await expect(
        service.sendMessage({
          chatId,
          senderId: otherUserId,
          text: 'Hello',
          callerId,
        })
      ).rejects.toThrow(AppError);

      try {
        await service.sendMessage({
          chatId,
          senderId: otherUserId,
          text: 'Hello',
          callerId,
        });
      } catch (err: unknown) {
        expect((err as AppError).statusCode).toBe(403);
        expect((err as AppError).code).toBe('FORBIDDEN_USER_MISMATCH');
      }
    });

    it('rejects attempt when caller is not a member of the chat', async () => {
      vi.mocked(mockChatRepo.findById).mockResolvedValue({
        id: chatId,
      } as unknown as ChatWithMembers);
      vi.mocked(mockChatRepo.findMembership).mockResolvedValue(null);

      await expect(
        service.sendMessage({
          chatId,
          senderId: callerId,
          text: 'Hello',
          callerId,
        })
      ).rejects.toThrow(AppError);

      try {
        await service.sendMessage({
          chatId,
          senderId: callerId,
          text: 'Hello',
          callerId,
        });
      } catch (err: unknown) {
        expect((err as AppError).statusCode).toBe(403);
        expect((err as AppError).code).toBe('NOT_A_CHAT_MEMBER');
      }
    });

    it('successfully sends message to Firestore', async () => {
      vi.mocked(mockChatRepo.findById).mockResolvedValue({
        id: chatId,
      } as unknown as ChatWithMembers);
      vi.mocked(mockChatRepo.findMembership).mockResolvedValue({
        chatId,
        userId: callerId,
        joinedAt: new Date(),
      } as ChatMember);

      const now = Timestamp.now();
      vi.mocked(mockFirestoreRepo.createMessage).mockResolvedValue({
        id: 'msg-abc-123',
        chatId,
        senderId: callerId,
        text: 'Hello assessment!',
        createdAt: now,
      });

      const result = await service.sendMessage({
        chatId,
        senderId: callerId,
        text: 'Hello assessment!',
        callerId,
      });

      expect(result.messageId).toBe('msg-abc-123');
      expect(result.chatId).toBe(chatId);
      expect(result.senderId).toBe(callerId);
      expect(result.text).toBe('Hello assessment!');
      expect(result.createdAt).toBe(now.toDate().toISOString());
    });
  });

  describe('getMessages', () => {
    it('rejects attempt when caller is not a member of the chat', async () => {
      vi.mocked(mockChatRepo.findById).mockResolvedValue({
        id: chatId,
      } as unknown as ChatWithMembers);
      vi.mocked(mockChatRepo.findMembership).mockResolvedValue(null);

      await expect(
        service.getMessages({
          chatId,
          limit: 50,
          callerId,
        })
      ).rejects.toThrow(AppError);
    });

    it('returns chronologically ordered messages with pagination', async () => {
      vi.mocked(mockChatRepo.findById).mockResolvedValue({
        id: chatId,
      } as unknown as ChatWithMembers);
      vi.mocked(mockChatRepo.findMembership).mockResolvedValue({
        chatId,
        userId: callerId,
        joinedAt: new Date(),
      } as ChatMember);

      const msg1: FirestoreMessage = {
        id: 'msg-1',
        chatId,
        senderId: callerId,
        text: 'First message',
        createdAt: Timestamp.fromMillis(1000),
      };

      vi.mocked(mockFirestoreRepo.getChatMessages).mockResolvedValue({
        messages: [msg1],
        nextCursor: null,
      });

      const result = await service.getMessages({
        chatId,
        limit: 50,
        callerId,
      });

      expect(result.messages.length).toBe(1);
      expect(result.messages[0]?.id).toBe('msg-1');
      expect(result.pagination.limit).toBe(50);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
    });
  });
});
