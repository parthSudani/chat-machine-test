import { chatRepository, ChatRepository } from '../repositories/chat.repository';
import { AppError } from './appError';

export class AuthHelper {
  constructor(private chatRepo: ChatRepository = chatRepository) {}

  /**
   * Enforces that the authenticated caller matches the target resource owner
   */
  assertCallerMatches(
    callerId: string,
    targetUserId: string,
    message: string = 'Caller is not authorized to access this user resource'
  ): void {
    if (callerId !== targetUserId) {
      throw AppError.forbidden(message, 'FORBIDDEN_USER_MISMATCH');
    }
  }

  /**
   * Enforces that the chat exists in PostgreSQL
   */
  async assertChatExists(chatId: string) {
    const chat = await this.chatRepo.findById(chatId);
    if (!chat) {
      throw AppError.notFound(`Chat with id '${chatId}' not found`, 'CHAT_NOT_FOUND');
    }
    return chat;
  }

  /**
   * Enforces that the user is an active member of the specified chat
   */
  async assertChatMembership(chatId: string, userId: string) {
    const membership = await this.chatRepo.findMembership(chatId, userId);
    if (!membership) {
      throw AppError.forbidden(
        'Caller is not an authorized member of this chat',
        'NOT_A_CHAT_MEMBER'
      );
    }
    return membership;
  }
}

export const authHelper = new AuthHelper();
