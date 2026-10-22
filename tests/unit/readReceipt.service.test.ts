import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReadReceiptService } from '../../src/services/readReceipt.service';
import { ChatRepository } from '../../src/repositories/chat.repository';
import {
  MessageFirestoreRepository,
  FirestoreMessage,
} from '../../src/repositories/message.firestore.repository';
import { AppError } from '../../src/utils/appError';
import { Timestamp } from '../../src/config/firebase';
import { ChatWithMembers } from '../../src/repositories/chat.repository';
import { ChatMember } from '@prisma/client';

describe('ReadReceiptService (Unit)', () => {
  let service: ReadReceiptService;
  let mockChatRepo: ChatRepository;
  let mockFirestoreRepo: MessageFirestoreRepository;

  const chatId = '11111111-1111-4111-8111-111111111111';
  const callerId = '22222222-2222-4222-8222-222222222222';
  const otherUserId = '33333333-3333-4333-8333-333333333333';
  const messageId = 'msg-firestore-123';

  beforeEach(() => {
    mockChatRepo = {
      findById: vi.fn(),
      findMembership: vi.fn(),
      findDirectChatByCanonicalPair: vi.fn(),
      createDirectChatAtomic: vi.fn(),
    } as unknown as ChatRepository;

    mockFirestoreRepo = {
      getMessage: vi.fn(),
      recordReadReceiptIdempotent: vi.fn(),
      createMessage: vi.fn(),
      updateLastSeenMonotonic: vi.fn(),
      getMemberLastSeen: vi.fn(),
    } as unknown as MessageFirestoreRepository;

    service = new ReadReceiptService(mockChatRepo, mockFirestoreRepo);
  });

  it('rejects request when body userId does not match authenticated caller', async () => {
    await expect(
      service.markMessageRead({
        chatId,
        messageId,
        bodyUserId: otherUserId,
        callerId,
      })
    ).rejects.toThrow(AppError);

    try {
      await service.markMessageRead({
        chatId,
        messageId,
        bodyUserId: otherUserId,
        callerId,
      });
    } catch (err: unknown) {
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('FORBIDDEN_USER_MISMATCH');
    }
  });

  it('rejects request when chat does not exist in PostgreSQL', async () => {
    vi.mocked(mockChatRepo.findById).mockResolvedValue(null);

    await expect(
      service.markMessageRead({
        chatId,
        messageId,
        callerId,
      })
    ).rejects.toThrow(AppError);

    try {
      await service.markMessageRead({
        chatId,
        messageId,
        callerId,
      });
    } catch (err: unknown) {
      expect((err as AppError).statusCode).toBe(404);
      expect((err as AppError).code).toBe('CHAT_NOT_FOUND');
    }
  });

  it('rejects request when user is not a member of the chat', async () => {
    vi.mocked(mockChatRepo.findById).mockResolvedValue({
      id: chatId,
    } as unknown as ChatWithMembers);
    vi.mocked(mockChatRepo.findMembership).mockResolvedValue(null);

    await expect(
      service.markMessageRead({
        chatId,
        messageId,
        callerId,
      })
    ).rejects.toThrow(AppError);

    try {
      await service.markMessageRead({
        chatId,
        messageId,
        callerId,
      });
    } catch (err: unknown) {
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('NOT_A_CHAT_MEMBER');
    }
  });

  it('rejects request when message does not exist in Firestore', async () => {
    vi.mocked(mockChatRepo.findById).mockResolvedValue({
      id: chatId,
    } as unknown as ChatWithMembers);
    vi.mocked(mockChatRepo.findMembership).mockResolvedValue({
      chatId,
      userId: callerId,
      joinedAt: new Date(),
    } as ChatMember);
    vi.mocked(mockFirestoreRepo.getMessage).mockResolvedValue(null);

    await expect(
      service.markMessageRead({
        chatId,
        messageId,
        callerId,
      })
    ).rejects.toThrow(AppError);

    try {
      await service.markMessageRead({
        chatId,
        messageId,
        callerId,
      });
    } catch (err: unknown) {
      expect((err as AppError).statusCode).toBe(404);
      expect((err as AppError).code).toBe('MESSAGE_NOT_FOUND');
    }
  });

  it('successfully marks message read for the first time', async () => {
    vi.mocked(mockChatRepo.findById).mockResolvedValue({
      id: chatId,
    } as unknown as ChatWithMembers);
    vi.mocked(mockChatRepo.findMembership).mockResolvedValue({
      chatId,
      userId: callerId,
      joinedAt: new Date(),
    } as ChatMember);

    const mockMessage: FirestoreMessage = {
      id: messageId,
      chatId,
      senderId: otherUserId,
      text: 'Hello world',
      createdAt: Timestamp.now(),
    };
    vi.mocked(mockFirestoreRepo.getMessage).mockResolvedValue(mockMessage);

    const readTimestamp = Timestamp.now();
    vi.mocked(mockFirestoreRepo.recordReadReceiptIdempotent).mockResolvedValue({
      receipt: {
        userId: callerId,
        messageId,
        readAt: readTimestamp,
      },
      isNew: true,
    });

    const result = await service.markMessageRead({
      chatId,
      messageId,
      callerId,
    });

    expect(result.messageId).toBe(messageId);
    expect(result.userId).toBe(callerId);
    expect(result.status).toBe('read');
    expect(result.readAt).toBe(readTimestamp.toDate().toISOString());
  });

  it('idempotently returns existing read receipt without overwriting timestamp', async () => {
    vi.mocked(mockChatRepo.findById).mockResolvedValue({
      id: chatId,
    } as unknown as ChatWithMembers);
    vi.mocked(mockChatRepo.findMembership).mockResolvedValue({
      chatId,
      userId: callerId,
      joinedAt: new Date(),
    } as ChatMember);

    const mockMessage: FirestoreMessage = {
      id: messageId,
      chatId,
      senderId: otherUserId,
      text: 'Hello world',
      createdAt: Timestamp.now(),
    };
    vi.mocked(mockFirestoreRepo.getMessage).mockResolvedValue(mockMessage);

    const initialReadTimestamp = Timestamp.fromMillis(100000);
    vi.mocked(mockFirestoreRepo.recordReadReceiptIdempotent).mockResolvedValue({
      receipt: {
        userId: callerId,
        messageId,
        readAt: initialReadTimestamp,
      },
      isNew: false,
    });

    const result = await service.markMessageRead({
      chatId,
      messageId,
      callerId,
    });

    expect(result.status).toBe('already_read');
    expect(result.readAt).toBe(initialReadTimestamp.toDate().toISOString());
  });
});
