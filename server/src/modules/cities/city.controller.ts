import type { NextFunction, Request, Response } from 'express';
import type { CreateCityInput } from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { CityService } from './city.service.js';

export class CityController {
  constructor(private readonly cityService: CityService) {}

  getTerrains = (_req: Request, res: Response): void => {
    const data = this.cityService.getTerrains();
    res.status(200).json({
      success: true,
      data,
    });
  };

  getMyCity = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const city = await this.cityService.getMyCity(req.user.id);
      res.status(200).json({
        success: true,
        data: city,
      });
    } catch (error) {
      next(error);
    }
  };

  createCity = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const city = await this.cityService.createCity(req.user.id, req.body as CreateCityInput);
      res.status(201).json({
        success: true,
        data: city,
        message: 'Khoi tao thanh pho thanh cong',
      });
    } catch (error) {
      next(error);
    }
  };

  getCityById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const cityId = String(req.params.cityId);
      const city = await this.cityService.getCityById(cityId, req.user.id);
      res.status(200).json({
        success: true,
        data: city,
      });
    } catch (error) {
      next(error);
    }
  };
}
