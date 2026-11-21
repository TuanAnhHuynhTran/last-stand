import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { BadRequestError } from '../utils/errors.js';

function formatZodIssues(issues: { path: (string | number)[]; message: string }[]): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : 'root';
    if (!details[key]) {
      details[key] = [];
    }
    details[key].push(issue.message);
  }
  return details;
}

export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        new BadRequestError(
          'Du lieu dau vao khong hop le',
          'VALIDATION_ERROR',
          formatZodIssues(result.error.issues)
        )
      );
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateParams<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(
        new BadRequestError(
          'Tham so duong dan khong hop le',
          'VALIDATION_ERROR',
          formatZodIssues(result.error.issues)
        )
      );
      return;
    }
    req.params = result.data as Request['params'];
    next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(
        new BadRequestError(
          'Tham so truy van khong hop le',
          'VALIDATION_ERROR',
          formatZodIssues(result.error.issues)
        )
      );
      return;
    }
    req.query = result.data as Request['query'];
    next();
  };
}
