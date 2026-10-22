export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, code: string = 'ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code: string = 'BAD_REQUEST', details?: unknown): AppError {
    return new AppError(400, message, code, details);
  }

  static unauthorized(message: string = 'Unauthorized', code: string = 'UNAUTHORIZED'): AppError {
    return new AppError(401, message, code);
  }

  static forbidden(message: string = 'Forbidden', code: string = 'FORBIDDEN'): AppError {
    return new AppError(403, message, code);
  }

  static notFound(message: string = 'Resource not found', code: string = 'NOT_FOUND'): AppError {
    return new AppError(404, message, code);
  }

  static conflict(message: string, code: string = 'CONFLICT'): AppError {
    return new AppError(409, message, code);
  }

  static internal(message: string = 'Internal server error', code: string = 'INTERNAL_ERROR'): AppError {
    return new AppError(500, message, code);
  }
}
