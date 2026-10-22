import { ChatRepository, chatRepository } from '../repositories/chat.repository';
import { UserRepository, userRepository } from '../repositories/user.repository';
import { AppError } from '../utils/appError';

export interface GetUserChatsDTO {
  targetUserId: string;
  callerId: string;
  limit: number;
  cursor?: string;
}

export interface UserChatSummary {
  chatId: string;
  type: string;
  memberIds: string[];
  createdAt: string;
}

export interface GetUserChatsResult {
  chats: UserChatSummary[];
  nextCursor: string | null;
}

export class UserChatService {
  constructor(
    private chatRepo: ChatRepository = chatRepository,
    private userRepo: UserRepository = userRepository
  ) {}

  async getUserChats(dto: GetUserChatsDTO): Promise<GetUserChatsResult> {
    const { targetUserId, callerId, limit, cursor } = dto;

    // 1. Enforce that authenticated caller can only list their own chats
    if (callerId !== targetUserId) {
      throw AppError.forbidden(
        'Caller is not authorized to list chats for another user',
        'UNAUTHORIZED_USER_CHATS_ACCESS'
      );
    }

    // 2. Verify target user exists in PostgreSQL
    const user = await this.userRepo.findById(targetUserId);
    if (!user) {
      throw AppError.notFound(
        `User with id '${targetUserId}' does not exist`,
        'USER_NOT_FOUND'
      );
    }

    // 3. Query chats and memberships from PostgreSQL (avoids N+1)
    const { chats, nextCursor } = await this.chatRepo.findUserChats(
      targetUserId,
      limit,
      cursor
    );

    const formattedChats: UserChatSummary[] = chats.map((c) => ({
      chatId: c.chatId,
      type: c.type,
      memberIds: c.memberIds,
      createdAt: c.createdAt.toISOString(),
    }));

    return {
      chats: formattedChats,
      nextCursor,
    };
  }
}

export const userChatService = new UserChatService();
