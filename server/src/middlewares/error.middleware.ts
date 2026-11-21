import type { NextFunction, Request, Response } from 'express';
import { UniqueConstraintError, ValidationError as SequelizeValidationError } from 'sequelize';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'Duong dan API khong ton tai',
    },
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || 'root';
      details[key] = details[key] ? [...details[key], issue.message] : [issue.message];
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Du lieu dau vao khong hop le',
        details,
      },
    });
    return;
  }

  if (err instanceof UniqueConstraintError) {
    res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_RESOURCE',
        message: 'Tai nguyen da ton tai trong he thong',
      },
    });
    return;
  }

  if (err instanceof SequelizeValidationError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'DB_VALIDATION_ERROR',
        message: 'Du lieu khong hop le voi rang buoc co so du lieu',
      },
    });
    return;
  }

  console.error('[CITYVERSE ERROR]', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Da xay ra loi he thong. Vui long thu lai sau.',
    },
  });
}
