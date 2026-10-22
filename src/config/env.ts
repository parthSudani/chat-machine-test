import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@localhost:5432/chat_backend?schema=public'),
  JWT_SECRET: z.string().min(16).default('development-jwt-super-secret-key-at-least-32-chars!'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ALLOW_DEV_IMPERSONATION: z.enum(['true', 'false']).transform((v) => v === 'true').default('false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
