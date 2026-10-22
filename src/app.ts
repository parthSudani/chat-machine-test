import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRoutes } from './routes/auth.routes';
import { chatRoutes } from './routes/chat.routes';
import { errorHandler } from './middleware/error.middleware';

export function createApp(): Application {
  const app = express();

  // Security and utilities middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Assessment & standard API routes
  app.use('/auth', authRoutes);
  app.use('/chat', chatRoutes);

  // Also support /api/v1 prefix aliases for enterprise API clients
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/chat', chatRoutes);

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export const app = createApp();
