import type { Request, Response, NextFunction } from 'express';
import { DomainError } from '@cookout-ai/domain';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof DomainError) {
    return res.status(400).json({
      error: err.name,
      message: err.message,
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({
      error: 'NotFound',
      message: err.message,
    });
  }

  // Generic 500 error handler (preventing internal stack trace leakage)
  return res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected error occurred.',
  });
}
