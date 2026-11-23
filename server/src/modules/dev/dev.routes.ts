/**
 * Development-only tools. This router is NEVER mounted when NODE_ENV = production (see app.ts),
 * so the free land below can't reach production players.
 *
 * POST /api/v1/dev/test-world — creates a test city on a `CV-DEV-` seed whose starter territory
 * is ~3× larger (enough land for stables, elephant camps and farms side by side). Normal players
 * get regular seeds; after Phase 10 new land must be surveyed and cleared before building.
 */
import crypto from 'node:crypto';
import { Router, type NextFunction, type RequestHandler, type Response } from 'express';
import { DEV_WORLD_SEED_PREFIX, createCitySchema, type CreateCityInput } from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { CityService } from '../cities/city.service.js';

export function createDevRouter(cities: CityService, authenticate: RequestHandler): Router {
  const router = Router();
  router.post('/test-world', authenticate, validateBody(createCitySchema), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const input = req.body as CreateCityInput;
      const seed = `${DEV_WORLD_SEED_PREFIX}${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      res.status(201).json({ success: true, data: await cities.createCity(req.user.id, input, { worldSeed: seed }) });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
