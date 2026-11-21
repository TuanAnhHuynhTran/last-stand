import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { DashboardService } from './dashboard.service.js';

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  getDashboard = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const data = await this.dashboardService.getDashboard(req.user.id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  };
}
