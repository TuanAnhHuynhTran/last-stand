import type { NextFunction, Response } from 'express';
import type {
  ChunkRangeQueryInput,
  SaveChunkDeltaBodyInput,
  SaveTerrainDeltaInput,
  SeedTerrainInput,
} from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { WorldService } from './world.service.js';

export class WorldController {
  constructor(private readonly worldService: WorldService) {}

  getTerrainMetadata = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const data = await this.worldService.getTerrainMetadata(
        String(req.params.cityId),
        req.user.id
      );
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  getChunksInRange = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const query = req.query as unknown as ChunkRangeQueryInput;
      const data = await this.worldService.getChunksInRange(
        String(req.params.cityId),
        req.user.id,
        query
      );
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  saveChunkDelta = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const chunkX = Number(req.params.chunkX);
      const chunkZ = Number(req.params.chunkZ);
      const data = await this.worldService.saveChunkDelta(
        String(req.params.cityId),
        req.user.id,
        chunkX,
        chunkZ,
        req.body as SaveChunkDeltaBodyInput
      );
      res.status(200).json({
        success: true,
        data,
        message: 'Da luu thay doi dia hinh chunk',
      });
    } catch (error) {
      next(error);
    }
  };

  saveTerrainDelta = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const data = await this.worldService.saveTerrainDelta(
        String(req.params.cityId),
        req.user.id,
        req.body as SaveTerrainDeltaInput
      );
      res.status(200).json({
        success: true,
        data,
        message: 'Da luu thay doi dia hinh',
      });
    } catch (error) {
      next(error);
    }
  };

  seedTerrain = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const data = await this.worldService.seedTerrain(
        String(req.params.cityId),
        req.user.id,
        req.body as SeedTerrainInput
      );
      res.status(200).json({
        success: true,
        data,
        message: 'Da khoi tao / dong bo du lieu chunk thanh cong',
      });
    } catch (error) {
      next(error);
    }
  };
}
