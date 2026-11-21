import type { NextFunction, Request, Response } from 'express';
import type { LoginInput, RefreshTokenInput, RegisterInput } from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { AuthService } from './auth.service.js';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.register(req.body as RegisterInput, {
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
      });
      res.status(201).json({
        success: true,
        data: result,
        message: 'Dang ky tai khoan thanh cong',
      });
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.login(req.body as LoginInput, {
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
      });
      res.status(200).json({
        success: true,
        data: result,
        message: 'Dang nhap thanh cong',
      });
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as RefreshTokenInput;
      const result = await this.authService.refresh(refreshToken, {
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
      });
      res.status(200).json({
        success: true,
        data: result,
        message: 'Lam moi phien dang nhap thanh cong',
      });
    } catch (error) {
      next(error);
    }
  };

  logout = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const { refreshToken } = req.body as { refreshToken?: string };
      await this.authService.logout(req.user.id, refreshToken);
      res.status(200).json({
        success: true,
        data: { loggedOut: true },
        message: 'Dang xuat thanh cong',
      });
    } catch (error) {
      next(error);
    }
  };

  me = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const result = await this.authService.getMe(req.user.id);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  devAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.devAdminLogin({
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
      });
      res.status(200).json({
        success: true,
        data: result,
        message: 'Dang nhap nhanh tai khoan Admin thanh cong',
      });
    } catch (error) {
      next(error);
    }
  };
}
