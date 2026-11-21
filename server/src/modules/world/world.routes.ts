import { Router } from 'express';
import type { RequestHandler } from 'express';
import {
  chunkCoordParamsSchema,
  chunkRangeQuerySchema,
  cityIdParamSchema,
  saveChunkDeltaBodySchema,
  saveTerrainDeltaSchema,
  seedTerrainSchema,
} from '@cityverse/shared';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import type { WorldController } from './world.controller.js';

export function createWorldRouter(
  controller: WorldController,
  authenticate: RequestHandler
): Router {
  const router = Router();

  router.get(
    '/:cityId/terrain',
    authenticate,
    validateParams(cityIdParamSchema),
    controller.getTerrainMetadata
  );

  router.get(
    '/:cityId/chunks',
    authenticate,
    validateParams(cityIdParamSchema),
    validateQuery(chunkRangeQuerySchema),
    controller.getChunksInRange
  );

  router.patch(
    '/:cityId/chunks/:chunkX/:chunkZ/delta',
    authenticate,
    validateParams(chunkCoordParamsSchema),
    validateBody(saveChunkDeltaBodySchema),
    controller.saveChunkDelta
  );

  router.post(
    '/:cityId/terrain/delta',
    authenticate,
    validateParams(cityIdParamSchema),
    validateBody(saveTerrainDeltaSchema),
    controller.saveTerrainDelta
  );

  router.post(
    '/:cityId/terrain/seed',
    authenticate,
    validateParams(cityIdParamSchema),
    validateBody(seedTerrainSchema),
    controller.seedTerrain
  );

  return router;
}
