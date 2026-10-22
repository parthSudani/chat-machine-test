import { ChatRepository, chatRepository } from '../repositories/chat.repository';
import {
  MessageFirestoreRepository,
  messageFirestoreRepository,
} from '../repositories/message.firestore.repository';
import { AppError } from '../utils/appError';

export interface MarkReadDTO {
  chatId: string;
  messageId: string;
  bodyUserId?: string;
  callerId: string;
}

export interface MarkReadResult {
  messageId: string;
  userId: string;
  readAt: string;
  status: 'read' | 'already_read';
}

export class ReadReceiptService {
  constructor(
    private chatRepo: ChatRepository = chatRepository,
    private firestoreRepo: MessageFirestoreRepository = messageFirestoreRepository
  ) {}

  async markMessageRead(dto: MarkReadDTO): Promise<MarkReadResult> {
    const { chatId, messageId, bodyUserId, callerId } = dto;

    // 1. If body userId is supplied, prevent identity spoofing
    if (bodyUserId && bodyUserId !== callerId) {
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

    // 3. Verify membership in PostgreSQL
    const membership = await this.chatRepo.findMembership(chatId, targetUserId);
    if (!membership) {
      throw AppError.forbidden(
        'User is not an authorized member of this chat',
        'NOT_A_CHAT_MEMBER'
      );
    }

    // 4. Verify message exists in Firestore and belongs to this chat
    const message = await this.firestoreRepo.getMessage(chatId, messageId);
    if (!message) {
      throw AppError.notFound(
        `Message '${messageId}' not found in chat '${chatId}'`,
        'MESSAGE_NOT_FOUND'
      );
    }

    // 5. Save read receipt idempotently
    const { receipt, isNew } = await this.firestoreRepo.recordReadReceiptIdempotent(
      chatId,
      messageId,
      targetUserId
    );

    const readAtIso = receipt.readAt
      ? receipt.readAt.toDate().toISOString()
      : new Date().toISOString();

    return {
      messageId,
      userId: targetUserId,
      readAt: readAtIso,
      status: isNew ? 'read' : 'already_read',
    };
  }
}

export const readReceiptService = new ReadReceiptService();
