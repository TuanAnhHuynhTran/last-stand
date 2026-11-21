import type { NextFunction, Request, Response } from 'express';
import type { EnvConfig } from '../config/env.js';
import type { DatabaseModels } from '../database/models/index.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/jwt.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function createAuthMiddleware(models: DatabaseModels, config: EnvConfig) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Thieu token xac thuc', 'MISSING_TOKEN');
      }

      const token = authHeader.slice('Bearer '.length).trim();
      if (!token) {
        throw new UnauthorizedError('Token xac thuc khong hop le', 'INVALID_TOKEN');
      }

      const payload = verifyAccessToken(token, config);
      const user = await models.User.findByPk(payload.sub);

      if (!user) {
        throw new UnauthorizedError('Tai khoan khong ton tai', 'USER_NOT_FOUND');
      }
      if (user.status !== 'active') {
        throw new ForbiddenError('Tai khoan da bi tam khoa', 'ACCOUNT_SUSPENDED');
      }

      req.user = {
        id: user.id,
        email: user.email,
        username: user.username,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
