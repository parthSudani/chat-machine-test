import { chatRepository, ChatRepository } from '../repositories/chat.repository';
import { userRepository, UserRepository } from '../repositories/user.repository';
import { AppError } from '../utils/appError';

export interface CreateChatDTO {
  userAId: string;
  userBId: string;
}

export interface CreateChatResult {
  chatId: string;
  isNew: boolean;
}

export class ChatService {
  constructor(
    private chatRepo: ChatRepository = chatRepository,
    private userRepo: UserRepository = userRepository
  ) {}

  /**
   * Deterministically orders two user IDs to guarantee canonical 1:1 chat uniqueness.
   */
  getCanonicalPair(userAId: string, userBId: string): [string, string] {
    return userAId < userBId ? [userAId, userBId] : [userBId, userAId];
  }

  async createDirectChat(
    dto: CreateChatDTO,
    callerId: string
  ): Promise<CreateChatResult> {
    const { userAId, userBId } = dto;

    // 1. Self-chat rejection
    if (userAId === userBId) {
      throw AppError.badRequest('Cannot create a 1:1 conversation with oneself', 'SELF_CHAT_NOT_ALLOWED');
    }

    // 2. Caller authorization check: caller must be a participant
    if (callerId !== userAId && callerId !== userBId) {
      throw AppError.forbidden(
        'Caller is not authorized to create a conversation between other users',
        'UNAUTHORIZED_CHAT_CREATION'
      );
    }

    // 3. Verify both users exist in PostgreSQL
    const [userA, userB] = await Promise.all([
      this.userRepo.findById(userAId),
      this.userRepo.findById(userBId),
    ]);

    if (!userA) {
      throw AppError.notFound(`User with id '${userAId}' does not exist`, 'USER_NOT_FOUND');
    }
    if (!userB) {
      throw AppError.notFound(`User with id '${userBId}' does not exist`, 'USER_NOT_FOUND');
    }

    // 4. Sort user IDs canonically
    const [p1, p2] = this.getCanonicalPair(userAId, userBId);

    // 5. Check if chat already exists
    const existing = await this.chatRepo.findDirectChatByCanonicalPair(p1, p2);
    if (existing) {
      return {
        chatId: existing.id,
        isNew: false,
      };
    }

    // 6. Create atomically with concurrency conflict handling
    const result = await this.chatRepo.createDirectChatAtomic(p1, p2);

    return {
      chatId: result.chat.id,
      isNew: result.isNew,
    };
  }
}

export const chatService = new ChatService();
