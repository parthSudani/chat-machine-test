import { z } from 'zod';

export const sendMessageSchema = {
  params: z.object({
    chatId: z.string().uuid('chatId must be a valid UUID'),
  }),
  body: z.object({
    senderId: z.string().uuid('senderId must be a valid UUID'),
    text: z
      .string()
      .trim()
      .min(1, 'Message text cannot be empty')
      .max(4000, 'Message text cannot exceed 4000 characters'),
  }),
};

export const getMessagesSchema = {
  params: z.object({
    chatId: z.string().uuid('chatId must be a valid UUID'),
  }),
  query: z.object({
    limit: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return 50;
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed < 1) return 50;
        return Math.min(parsed, 100);
      }),
    cursor: z.string().min(1).optional(),
  }),
};

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
