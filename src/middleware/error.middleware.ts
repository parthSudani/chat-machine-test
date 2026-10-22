import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/appError';
import { sendError } from '../utils/apiResponse';
import { env } from '../config/env';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.message, err.code, err.details);
    return;
  }

  // Handle body-parser / express syntax or payload limit errors (e.g. malformed JSON 400, payload too large 413)
  const httpStatus =
    (err as { status?: number; statusCode?: number }).status ||
    (err as { status?: number; statusCode?: number }).statusCode;

  if (httpStatus && typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
    const code = httpStatus === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST';
    sendError(res, httpStatus, err.message, code);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      sendError(res, 409, `A resource with this ${target} already exists`, 'DUPLICATE_RESOURCE');
      return;
    }
    if (err.code === 'P2025') {
      sendError(res, 404, 'Record not found', 'NOT_FOUND');
      return;
    }
  }

  if (env.NODE_ENV !== 'test') {
    console.error('Unhandled Server Error:', err);
  }

  sendError(
    res,
    500,
    env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    'INTERNAL_SERVER_ERROR'
  );
};
