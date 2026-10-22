import { ChatRepository, chatRepository } from '../repositories/chat.repository';
import {
  MessageFirestoreRepository,
  messageFirestoreRepository,
} from '../repositories/message.firestore.repository';
import { AppError } from '../utils/appError';

export interface UpdateLastSeenDTO {
  chatId: string;
  messageId: string;
  bodyUserId: string;
  callerId: string;
}

export interface UpdateLastSeenResult {
  chatId: string;
  userId: string;
  lastSeenMessageId: string;
  lastSeenAt: string;
  status: 'updated' | 'already_current' | 'ignored_older_than_current';
}

export class LastSeenService {
  constructor(
    private chatRepo: ChatRepository = chatRepository,
    private firestoreRepo: MessageFirestoreRepository = messageFirestoreRepository
  ) {}

  async updateLastSeen(dto: UpdateLastSeenDTO): Promise<UpdateLastSeenResult> {
    const { chatId, messageId, bodyUserId, callerId } = dto;

    // 1. Verify caller matches requested userId
    if (bodyUserId !== callerId) {
      throw AppError.forbidden(
        'Supplied userId does not match the authenticated user',
        'FORBIDDEN_USER_MISMATCH'
      );
    }

    const targetUserId = callerId;

    // 2. Verify chat exists in PostgreSQL
    const chat = await this.chatRepo.findById(chatId);
    if (!chat) {
      throw AppError.notFound(`Chat with id '${chatId}' not found`, 'CHAT_NOT_FOUND');
    }

    // 3. Verify user membership in PostgreSQL
    const membership = await this.chatRepo.findMembership(chatId, targetUserId);
    if (!membership) {
      throw AppError.forbidden(
        'User is not an authorized member of this chat',
        'NOT_A_CHAT_MEMBER'
      );
    }

    // 4. Verify target message exists in Firestore and belongs to this chat
    const targetMessage = await this.firestoreRepo.getMessage(chatId, messageId);
    if (!targetMessage) {
      throw AppError.notFound(
        `Target message '${messageId}' not found in chat '${chatId}'`,
        'MESSAGE_NOT_FOUND'
      );
    }

    // 5. Update last-seen state transactionally with monotonicity guarantee
    const result = await this.firestoreRepo.updateLastSeenMonotonic(
      chatId,
      targetUserId,
      targetMessage
    );

    const lastSeenAtIso = result.lastSeenAt
      ? result.lastSeenAt.toDate().toISOString()
      : new Date().toISOString();

    return {
      chatId,
      userId: targetUserId,
      lastSeenMessageId: result.lastSeenMessageId,
      lastSeenAt: lastSeenAtIso,
      status: result.status,
    };
  }
}

export const lastSeenService = new LastSeenService();
