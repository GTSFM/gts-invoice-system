import { Request, Response, NextFunction } from 'express';
import { logger } from '../index';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err.statusCode || 500;
  const isDev = process.env.NODE_ENV === 'development';

  logger.error({
    message: err.message,
    statusCode,
    path: req.path,
    method: req.method,
    stack: isDev ? err.stack : undefined,
  });

  // Prisma error handling
  if (err.code === 'P2002') {
    res.status(409).json({
      error: 'A record with this unique value already exists.',
      field: (err as any).meta?.target,
    });
    return;
  }

  if (err.code === 'P2025') {
    res.status(404).json({ error: 'Record not found.' });
    return;
  }

  if (err.code === 'P2003') {
    res.status(400).json({ error: 'Foreign key constraint violation. Referenced record not found.' });
    return;
  }

  res.status(statusCode).json({
    error: statusCode === 500 && !isDev ? 'Internal server error.' : err.message,
    ...(isDev && { stack: err.stack }),
  });
}

export function createError(arg1: string | number, arg2: string | number): AppError {
  let message: string;
  let statusCode: number;

  if (typeof arg1 === 'number') {
    statusCode = arg1;
    message = String(arg2);
  } else {
    message = arg1;
    statusCode = Number(arg2);
  }

  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  return err;
}
