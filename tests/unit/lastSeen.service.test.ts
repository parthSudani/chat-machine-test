import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LastSeenService } from '../../src/services/lastSeen.service';
import { ChatRepository, ChatWithMembers } from '../../src/repositories/chat.repository';
import {
  MessageFirestoreRepository,
  FirestoreMessage,
} from '../../src/repositories/message.firestore.repository';
import { AppError } from '../../src/utils/appError';
import { Timestamp } from '../../src/config/firebase';
import { ChatMember } from '@prisma/client';

describe('LastSeenService (Unit)', () => {
  let service: LastSeenService;
  let mockChatRepo: ChatRepository;
  let mockFirestoreRepo: MessageFirestoreRepository;

  const chatId = '11111111-1111-4111-8111-111111111111';
  const callerId = '22222222-2222-4222-8222-222222222222';
  const otherUserId = '33333333-3333-4333-8333-333333333333';
  const messageId = 'msg-firestore-100';

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

    service = new LastSeenService(mockChatRepo, mockFirestoreRepo);
  });

  it('rejects update when body userId does not match authenticated caller', async () => {
    await expect(
      service.updateLastSeen({
        chatId,
        messageId,
        bodyUserId: otherUserId,
        callerId,
      })
    ).rejects.toThrow(AppError);

    try {
      await service.updateLastSeen({
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

  it('rejects update when chat is not found', async () => {
    vi.mocked(mockChatRepo.findById).mockResolvedValue(null);

    await expect(
      service.updateLastSeen({
        chatId,
        messageId,
        bodyUserId: callerId,
        callerId,
      })
    ).rejects.toThrow(AppError);

    try {
      await service.updateLastSeen({
        chatId,
        messageId,
        bodyUserId: callerId,
        callerId,
      });
    } catch (err: unknown) {
      expect((err as AppError).statusCode).toBe(404);
      expect((err as AppError).code).toBe('CHAT_NOT_FOUND');
    }
  });

  it('rejects update when caller is not a member of the chat', async () => {
    vi.mocked(mockChatRepo.findById).mockResolvedValue({
      id: chatId,
    } as unknown as ChatWithMembers);
    vi.mocked(mockChatRepo.findMembership).mockResolvedValue(null);

    await expect(
      service.updateLastSeen({
        chatId,
        messageId,
        bodyUserId: callerId,
        callerId,
      })
    ).rejects.toThrow(AppError);

    try {
      await service.updateLastSeen({
        chatId,
        messageId,
        bodyUserId: callerId,
        callerId,
      });
    } catch (err: unknown) {
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('NOT_A_CHAT_MEMBER');
    }
  });

  it('rejects update when message is not found in Firestore', async () => {
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
      service.updateLastSeen({
        chatId,
        messageId,
        bodyUserId: callerId,
        callerId,
      })
    ).rejects.toThrow(AppError);

    try {
      await service.updateLastSeen({
        chatId,
        messageId,
        bodyUserId: callerId,
        callerId,
      });
    } catch (err: unknown) {
      expect((err as AppError).statusCode).toBe(404);
      expect((err as AppError).code).toBe('MESSAGE_NOT_FOUND');
    }
  });

  it('successfully advances last-seen pointer for newer message', async () => {
    vi.mocked(mockChatRepo.findById).mockResolvedValue({
      id: chatId,
    } as unknown as ChatWithMembers);
    vi.mocked(mockChatRepo.findMembership).mockResolvedValue({
      chatId,
      userId: callerId,
      joinedAt: new Date(),
    } as ChatMember);

    const targetMessage: FirestoreMessage = {
      id: messageId,
      chatId,
      senderId: otherUserId,
      text: 'Newest message',
      createdAt: Timestamp.fromMillis(2000),
    };
    vi.mocked(mockFirestoreRepo.getMessage).mockResolvedValue(targetMessage);

    const now = Timestamp.now();
    vi.mocked(mockFirestoreRepo.updateLastSeenMonotonic).mockResolvedValue({
      status: 'updated',
      lastSeenMessageId: messageId,
      lastSeenAt: now,
    });

    const result = await service.updateLastSeen({
      chatId,
      messageId,
      bodyUserId: callerId,
      callerId,
    });

    expect(result.status).toBe('updated');
    expect(result.lastSeenMessageId).toBe(messageId);
    expect(result.userId).toBe(callerId);
    expect(result.chatId).toBe(chatId);
  });

  it('returns already_current when updating with identical message', async () => {
    vi.mocked(mockChatRepo.findById).mockResolvedValue({
      id: chatId,
    } as unknown as ChatWithMembers);
    vi.mocked(mockChatRepo.findMembership).mockResolvedValue({
      chatId,
      userId: callerId,
      joinedAt: new Date(),
    } as ChatMember);

    const targetMessage: FirestoreMessage = {
      id: messageId,
      chatId,
      senderId: otherUserId,
      text: 'Current message',
      createdAt: Timestamp.fromMillis(2000),
    };
    vi.mocked(mockFirestoreRepo.getMessage).mockResolvedValue(targetMessage);

    const now = Timestamp.now();
    vi.mocked(mockFirestoreRepo.updateLastSeenMonotonic).mockResolvedValue({
      status: 'already_current',
      lastSeenMessageId: messageId,
      lastSeenAt: now,
    });

    const result = await service.updateLastSeen({
      chatId,
      messageId,
      bodyUserId: callerId,
      callerId,
    });

    expect(result.status).toBe('already_current');
    expect(result.lastSeenMessageId).toBe(messageId);
  });

  it('safely ignores update when message is older than current pointer (monotonicity)', async () => {
    vi.mocked(mockChatRepo.findById).mockResolvedValue({
      id: chatId,
    } as unknown as ChatWithMembers);
    vi.mocked(mockChatRepo.findMembership).mockResolvedValue({
      chatId,
      userId: callerId,
      joinedAt: new Date(),
    } as ChatMember);

    const oldMessage: FirestoreMessage = {
      id: 'old-msg-50',
      chatId,
      senderId: otherUserId,
      text: 'Older message',
      createdAt: Timestamp.fromMillis(500),
    };
    vi.mocked(mockFirestoreRepo.getMessage).mockResolvedValue(oldMessage);

    const now = Timestamp.now();
    vi.mocked(mockFirestoreRepo.updateLastSeenMonotonic).mockResolvedValue({
      status: 'ignored_older_than_current',
      lastSeenMessageId: 'new-msg-100',
      lastSeenAt: now,
    });

    const result = await service.updateLastSeen({
      chatId,
      messageId: 'old-msg-50',
      bodyUserId: callerId,
      callerId,
    });

    expect(result.status).toBe('ignored_older_than_current');
    expect(result.lastSeenMessageId).toBe('new-msg-100'); // Remains at newer message
  });
});
