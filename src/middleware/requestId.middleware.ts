import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const incomingId = req.headers['x-request-id'] as string | undefined;
  const requestId = incomingId || uuidv4();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
};
