import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../../domain/errors';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Error inesperado' } });
}
