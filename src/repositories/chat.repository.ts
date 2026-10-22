import { prisma } from '../config/prisma';
import { Chat, ChatMember, Prisma } from '@prisma/client';

export type ChatWithMembers = Chat & {
  members: ChatMember[];
};

export class ChatRepository {
  async findDirectChatByCanonicalPair(
    participantOneId: string,
    participantTwoId: string
  ): Promise<Chat | null> {
    return prisma.chat.findUnique({
      where: {
        participantOneId_participantTwoId: {
          participantOneId,
          participantTwoId,
        },
      },
    });
  }

  async findById(id: string): Promise<ChatWithMembers | null> {
    return prisma.chat.findUnique({
      where: { id },
      include: {
        members: true,
      },
    });
  }

  async findMembership(chatId: string, userId: string): Promise<ChatMember | null> {
    return prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
    });
  }

  async createDirectChatAtomic(
    participantOneId: string,
    participantTwoId: string
  ): Promise<{ chat: Chat; isNew: boolean }> {
    try {
      const chat = await prisma.$transaction(async (tx) => {
        // Attempt creation
        const newChat = await tx.chat.create({
          data: {
            participantOneId,
            participantTwoId,
            type: 'DIRECT',
            members: {
              create: [
                { userId: participantOneId },
                { userId: participantTwoId },
              ],
            },
          },
        });
        return newChat;
      });

      return { chat, isNew: true };
    } catch (error) {
      // Intercept PostgreSQL unique constraint violation (P2002) caused by concurrent creation
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findDirectChatByCanonicalPair(
          participantOneId,
          participantTwoId
        );
        if (existing) {
          return { chat: existing, isNew: false };
        }
      }
      throw error;
    }
  }

  async findUserChats(
    userId: string,
    limit: number,
    cursor?: string
  ): Promise<{
    chats: Array<{
      chatId: string;
      type: string;
      memberIds: string[];
      createdAt: Date;
      updatedAt: Date;
    }>;
    nextCursor: string | null;
  }> {
    const rawChats = await prisma.chat.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: {
        members: {
          select: {
            userId: true,
          },
        },
      },
    });

    let nextCursor: string | null = null;
    let resultChats = rawChats;

    if (rawChats.length > limit) {
      resultChats = rawChats.slice(0, limit);
      nextCursor = resultChats[resultChats.length - 1]?.id || null;
    }

    const chats = resultChats.map((c) => ({
      chatId: c.id,
      type: c.type,
      memberIds: c.members.map((m) => m.userId),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return { chats, nextCursor };
  }
}

export const chatRepository = new ChatRepository();
