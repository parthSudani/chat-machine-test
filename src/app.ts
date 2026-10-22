import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { authRoutes } from './routes/auth.routes';
import { chatRoutes } from './routes/chat.routes';
import { userRoutes } from './routes/user.routes';
import { errorHandler } from './middleware/error.middleware';
import { requestIdMiddleware } from './middleware/requestId.middleware';
import { standardRateLimiter, authRateLimiter } from './middleware/rateLimiter.middleware';

import { healthController } from './controllers/health.controller';

export function createApp(): Application {
  const app = express();

  // Security headers & Request Tracking
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    })
  );
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: '100kb' }));

  // Global rate limiter
  app.use(standardRateLimiter);

  // Health and Readiness probes
  app.get('/health', (req: Request, res: Response) => healthController.liveness(req, res));
  app.get('/health/live', (req: Request, res: Response) => healthController.liveness(req, res));
  app.get('/health/ready', (req: Request, res: Response) => healthController.readiness(req, res));

  // Auth routes with dedicated rate limiter
  app.use('/auth', authRateLimiter, authRoutes);
  app.use('/api/v1/auth', authRateLimiter, authRoutes);

  // Assessment & standard API routes
  app.use('/chat', chatRoutes);
  app.use('/api/v1/chat', chatRoutes);

  app.use('/user', userRoutes);
  app.use('/api/v1/user', userRoutes);

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export const app = createApp();
