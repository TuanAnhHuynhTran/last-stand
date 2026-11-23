import { Router, type NextFunction, type RequestHandler, type Response } from 'express';
import {
  cityIdParamSchema,
  createFarmZoneSchema,
  expandFarmZoneSchema,
  farmZoneParamsSchema,
  plantCropSchema,
  type CreateFarmZoneInput,
  type ExpandFarmZoneInput,
  type PlantCropInput,
} from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { FarmService } from './farm.service.js';

type Handler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;

function handle(status: number, fn: (req: AuthenticatedRequest, userId: string) => Promise<unknown>): Handler {
  return async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      res.status(status).json({ success: true, data: await fn(req, req.user.id) });
    } catch (error) {
      next(error);
    }
  };
}

const city = (req: AuthenticatedRequest) => String(req.params.cityId);
const zone = (req: AuthenticatedRequest) => String(req.params.zoneId);

export class FarmController {
  constructor(private readonly farms: FarmService) {}

  catalog = handle(200, () => this.farms.getCatalog());
  list = handle(200, (req, userId) => this.farms.getState(city(req), userId));
  create = handle(201, (req, userId) => this.farms.create(city(req), userId, req.body as CreateFarmZoneInput));
  expand = handle(200, (req, userId) => this.farms.expand(city(req), zone(req), userId, req.body as ExpandFarmZoneInput));
  upgrade = handle(200, (req, userId) => this.farms.upgrade(city(req), zone(req), userId));
  plant = handle(200, (req, userId) => this.farms.plant(city(req), zone(req), userId, req.body as PlantCropInput));
  harvest = handle(200, (req, userId) => this.farms.harvest(city(req), zone(req), userId));
  remove = handle(200, (req, userId) => this.farms.remove(city(req), zone(req), userId));
}

/** Mounted at /api/v1. */
export function createFarmRouter(controller: FarmController, authenticate: RequestHandler): Router {
  const router = Router();
  const zoneParams = validateParams(farmZoneParamsSchema);
  router.get('/farms/catalog', authenticate, controller.catalog);
  router.get('/cities/:cityId/farms', authenticate, validateParams(cityIdParamSchema), controller.list);
  router.post(
    '/cities/:cityId/farms',
    authenticate,
    validateParams(cityIdParamSchema),
    validateBody(createFarmZoneSchema),
    controller.create
  );
  router.post('/cities/:cityId/farms/:zoneId/expand', authenticate, zoneParams, validateBody(expandFarmZoneSchema), controller.expand);
  router.post('/cities/:cityId/farms/:zoneId/upgrade', authenticate, zoneParams, controller.upgrade);
  router.post('/cities/:cityId/farms/:zoneId/plant', authenticate, zoneParams, validateBody(plantCropSchema), controller.plant);
  router.post('/cities/:cityId/farms/:zoneId/harvest', authenticate, zoneParams, controller.harvest);
  router.delete('/cities/:cityId/farms/:zoneId', authenticate, zoneParams, controller.remove);
  return router;
}
