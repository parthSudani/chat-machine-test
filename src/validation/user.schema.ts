import { z } from 'zod';

export const getUserChatsSchema = {
  params: z.object({
    userId: z.string().uuid('userId must be a valid UUID'),
  }),
  query: z.object({
    limit: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return 20;
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed < 1) return 20;
        return Math.min(parsed, 100);
      }),
    cursor: z.string().uuid('cursor must be a valid UUID').optional(),
  }),
};
