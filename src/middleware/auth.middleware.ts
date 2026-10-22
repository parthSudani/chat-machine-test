import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/appError';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

interface JwtPayload {
  sub: string;
  email: string;
}

export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      req.user = {
        id: decoded.sub,
        email: decoded.email,
      };
      next();
      return;
    } catch {
      next(AppError.unauthorized('Invalid or expired authentication token', 'INVALID_TOKEN'));
      return;
    }
  }

  // Assessment / Dev test fallback support:
  if (env.NODE_ENV === 'test' || env.ALLOW_DEV_IMPERSONATION) {
    const devUserId = req.headers['x-user-id'] as string | undefined;
    if (devUserId) {
      req.user = {
        id: devUserId,
        email: `dev-${devUserId}@test.local`,
      };
      next();
      return;
    }
  }

  next(AppError.unauthorized('Authentication token is required', 'TOKEN_REQUIRED'));
};
