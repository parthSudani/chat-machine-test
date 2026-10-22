import { z } from 'zod';

export const createChatSchema = {
  body: z.object({
    userAId: z.string().uuid('userAId must be a valid UUID'),
    userBId: z.string().uuid('userBId must be a valid UUID'),
  }),
};
