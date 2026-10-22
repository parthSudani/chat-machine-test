import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthHelper } from '../../src/utils/authHelper';
import { ChatRepository, ChatWithMembers } from '../../src/repositories/chat.repository';
import { AppError } from '../../src/utils/appError';
import { ChatMember } from '@prisma/client';

describe('AuthHelper (Unit)', () => {
  let helper: AuthHelper;
  let mockChatRepo: ChatRepository;

  const chatId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const otherUserId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    mockChatRepo = {
      findById: vi.fn(),
      findMembership: vi.fn(),
      findDirectChatByCanonicalPair: vi.fn(),
      createDirectChatAtomic: vi.fn(),
      findUserChats: vi.fn(),
    } as unknown as ChatRepository;

    helper = new AuthHelper(mockChatRepo);
  });

  describe('assertCallerMatches', () => {
    it('passes when callerId matches targetUserId', () => {
      expect(() => helper.assertCallerMatches(userId, userId)).not.toThrow();
    });

    it('throws 403 when callerId does not match targetUserId', () => {
      expect(() => helper.assertCallerMatches(userId, otherUserId)).toThrow(AppError);
    });
  });

  describe('assertChatExists', () => {
    it('returns chat when found', async () => {
      vi.mocked(mockChatRepo.findById).mockResolvedValue({ id: chatId } as ChatWithMembers);
      const res = await helper.assertChatExists(chatId);
      expect(res.id).toBe(chatId);
    });

    it('throws 404 when chat is not found', async () => {
      vi.mocked(mockChatRepo.findById).mockResolvedValue(null);
      await expect(helper.assertChatExists(chatId)).rejects.toThrow(AppError);
    });
  });

  describe('assertChatMembership', () => {
    it('returns membership when user is a member', async () => {
      vi.mocked(mockChatRepo.findMembership).mockResolvedValue({
        chatId,
        userId,
        joinedAt: new Date(),
      } as ChatMember);

      const res = await helper.assertChatMembership(chatId, userId);
      expect(res.chatId).toBe(chatId);
      expect(res.userId).toBe(userId);
    });

    it('throws 403 when user is not a member', async () => {
      vi.mocked(mockChatRepo.findMembership).mockResolvedValue(null);
      await expect(helper.assertChatMembership(chatId, userId)).rejects.toThrow(AppError);
    });
  });
});
