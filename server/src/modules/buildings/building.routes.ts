import { Router, type NextFunction, type RequestHandler, type Response } from 'express';
import {
  buildingParamsSchema,
  cityIdParamSchema,
  moveBuildingSchema,
  placeBuildingSchema,
  type MoveBuildingInput,
  type PlaceBuildingInput,
} from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type {
  BuildingPlacementService,
  BuildingQueryService,
  BuildingUpgradeService,
} from './building.service.js';

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

export class BuildingController {
  constructor(
    private readonly query: BuildingQueryService,
    private readonly placement: BuildingPlacementService,
    private readonly upgrades: BuildingUpgradeService
  ) {}

  catalog = handle(200, () => this.query.getCatalog());

  list = handle(200, (req, userId) => this.query.getState(String(req.params.cityId), userId));

  place = handle(201, (req, userId) =>
    this.placement.place(String(req.params.cityId), userId, req.body as PlaceBuildingInput)
  );

  upgrade = handle(200, (req, userId) =>
    this.upgrades.upgrade(String(req.params.cityId), String(req.params.buildingId), userId)
  );

  move = handle(200, (req, userId) =>
    this.placement.move(String(req.params.cityId), String(req.params.buildingId), userId, req.body as MoveBuildingInput)
  );

  demolish = handle(200, (req, userId) =>
    this.placement.demolish(String(req.params.cityId), String(req.params.buildingId), userId)
  );
}

/** Mounted at /api/v1. */
export function createBuildingRouter(controller: BuildingController, authenticate: RequestHandler): Router {
  const router = Router();
  router.get('/buildings/catalog', authenticate, controller.catalog);
  router.get('/cities/:cityId/buildings', authenticate, validateParams(cityIdParamSchema), controller.list);
  router.post(
    '/cities/:cityId/buildings',
    authenticate,
    validateParams(cityIdParamSchema),
    validateBody(placeBuildingSchema),
    controller.place
  );
  router.post(
    '/cities/:cityId/buildings/:buildingId/upgrade',
    authenticate,
    validateParams(buildingParamsSchema),
    controller.upgrade
  );
  router.post(
    '/cities/:cityId/buildings/:buildingId/move',
    authenticate,
    validateParams(buildingParamsSchema),
    validateBody(moveBuildingSchema),
    controller.move
  );
  router.delete(
    '/cities/:cityId/buildings/:buildingId',
    authenticate,
    validateParams(buildingParamsSchema),
    controller.demolish
  );
  return router;
}
