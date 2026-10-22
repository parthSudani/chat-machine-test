import { z } from 'zod';

export const markMessageReadSchema = {
  params: z.object({
    chatId: z.string().uuid('chatId must be a valid UUID'),
    messageId: z.string().min(1, 'messageId is required'),
  }),
  body: z.object({
    userId: z.string().uuid('userId must be a valid UUID').optional(),
  }),
};

export const updateLastSeenSchema = {
  params: z.object({
    chatId: z.string().uuid('chatId must be a valid UUID'),
  }),
  body: z.object({
    userId: z.string().uuid('userId must be a valid UUID'),
    messageId: z.string().min(1, 'messageId is required'),
  }),
};
