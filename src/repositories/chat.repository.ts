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
}

export const chatRepository = new ChatRepository();
