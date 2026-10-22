import { ChatRepository, chatRepository } from '../repositories/chat.repository';
import {
  MessageFirestoreRepository,
  messageFirestoreRepository,
} from '../repositories/message.firestore.repository';
import { AppError } from '../utils/appError';

export interface SendMessageDTO {
  chatId: string;
  senderId: string;
  text: string;
  callerId: string;
}

export interface SendMessageResult {
  id?: string;
  messageId: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string;
}

export interface GetMessagesDTO {
  chatId: string;
  limit: number;
  cursor?: string;
  callerId: string;
}

export interface GetMessagesResult {
  messages: Array<{
    id: string;
    chatId: string;
    senderId: string;
    text: string;
    createdAt: string;
  }>;
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export class MessageService {
  constructor(
    private chatRepo: ChatRepository = chatRepository,
    private firestoreRepo: MessageFirestoreRepository = messageFirestoreRepository
  ) {}

  async sendMessage(dto: SendMessageDTO): Promise<SendMessageResult> {
    const { chatId, senderId, text, callerId } = dto;

    // 1. Prevent identity spoofing
    if (callerId !== senderId) {
      throw AppError.forbidden(
        'Supplied senderId does not match the authenticated user',
        'FORBIDDEN_USER_MISMATCH'
      );
    }

    // 2. Verify chat exists in PostgreSQL
    const chat = await this.chatRepo.findById(chatId);
    if (!chat) {
      throw AppError.notFound(`Chat with id '${chatId}' not found`, 'CHAT_NOT_FOUND');
    }

    // 3. Verify membership in PostgreSQL
    const membership = await this.chatRepo.findMembership(chatId, callerId);
    if (!membership) {
      throw AppError.forbidden(
        'User is not an authorized member of this chat',
        'NOT_A_CHAT_MEMBER'
      );
    }

    // 4. Persist in Firestore
    const msg = await this.firestoreRepo.createMessage(chatId, senderId, text);

    const createdAtIso = msg.createdAt
      ? msg.createdAt.toDate().toISOString()
      : new Date().toISOString();

    return {
      id: msg.id,
      messageId: msg.id,
      chatId,
      senderId,
      text,
      createdAt: createdAtIso,
    };
  }

  async getMessages(dto: GetMessagesDTO): Promise<GetMessagesResult> {
    const { chatId, limit, cursor, callerId } = dto;

    // 1. Verify chat exists in PostgreSQL
    const chat = await this.chatRepo.findById(chatId);
    if (!chat) {
      throw AppError.notFound(`Chat with id '${chatId}' not found`, 'CHAT_NOT_FOUND');
    }

    // 2. Verify membership in PostgreSQL
    const membership = await this.chatRepo.findMembership(chatId, callerId);
    if (!membership) {
      throw AppError.forbidden(
        'User is not an authorized member of this chat',
        'NOT_A_CHAT_MEMBER'
      );
    }

    // 3. Fetch from Firestore with cursor-based pagination and stable ordering
    const { messages, nextCursor } = await this.firestoreRepo.getChatMessages(
      chatId,
      limit,
      cursor
    );

    return {
      messages: messages.map((m) => ({
        id: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        text: m.text,
        createdAt: m.createdAt ? m.createdAt.toDate().toISOString() : new Date().toISOString(),
      })),
      pagination: {
        limit,
        nextCursor,
        hasMore: nextCursor !== null,
      },
    };
  }
}

export const messageService = new MessageService();
