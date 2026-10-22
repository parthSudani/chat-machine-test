import { z } from 'zod';

export const registerSchema = {
  body: z.object({
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name cannot exceed 100 characters'),
    email: z.string().trim().email('Invalid email address format'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .max(100, 'Password cannot exceed 100 characters'),
  }),
};

export const loginSchema = {
  body: z.object({
    email: z.string().trim().email('Invalid email address format'),
    password: z.string().min(1, 'Password is required'),
  }),
};
