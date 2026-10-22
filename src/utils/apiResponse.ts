import { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): Response {
  return res.status(statusCode).json(data);
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  code: string = 'ERROR',
  details?: unknown
): Response {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
}
