import { Router, type NextFunction, type RequestHandler, type Response } from 'express';
import {
  assignJobSchema,
  cityIdParamSchema,
  moveHomeSchema,
  populationSettingsSchema,
  productionParamsSchema,
  setRecipeSchema,
  survivorParamsSchema,
  type AssignJobInput,
  type MoveHomeInput,
  type PopulationSettingsInput,
  type SetRecipeInput,
} from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { PopulationService } from './population.service.js';

type Handler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;

function handle(fn: (req: AuthenticatedRequest, userId: string) => Promise<unknown>): Handler {
  return async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      res.status(200).json({ success: true, data: await fn(req, req.user.id) });
    } catch (error) {
      next(error);
    }
  };
}

const city = (req: AuthenticatedRequest) => String(req.params.cityId);

export class PopulationController {
  constructor(private readonly population: PopulationService) {}

  state = handle((req, u) => this.population.getState(city(req), u));
  economy = handle((req, u) => this.population.getEconomy(city(req), u, Math.min(30, Math.max(1, Number(req.query.days) || 3))));
  assign = handle((req, u) => this.population.assign(city(req), u, req.body as AssignJobInput));
  unassign = handle((req, u) => this.population.unassign(city(req), u, String(req.params.survivorId)));
  autoAssign = handle((req, u) => this.population.runAutoAssign(city(req), u));
  moveHome = handle((req, u) => this.population.moveHome(city(req), u, String(req.params.survivorId), req.body as MoveHomeInput));
  recipe = handle((req, u) => this.population.setRecipe(city(req), u, String(req.params.buildingId), req.body as SetRecipeInput));
  collect = handle((req, u) => this.population.collect(city(req), u, String(req.params.buildingId)));
  settings = handle((req, u) => this.population.updateSettings(city(req), u, req.body as PopulationSettingsInput));
  rescue = handle((req, u) => this.population.rescue(city(req), u));
}

/** Mounted at /api/v1. Ownership / edit rights are checked in the service for every call. */
export function createPopulationRouter(c: PopulationController, authenticate: RequestHandler): Router {
  const router = Router();
  const base = '/cities/:cityId/population';
  const cityParams = validateParams(cityIdParamSchema);
  router.get(base, authenticate, cityParams, c.state);
  router.get(`${base}/economy`, authenticate, cityParams, c.economy);
  router.post(`${base}/assign`, authenticate, cityParams, validateBody(assignJobSchema), c.assign);
  router.post(`${base}/auto-assign`, authenticate, cityParams, c.autoAssign);
  router.delete(`${base}/assign/:survivorId`, authenticate, validateParams(survivorParamsSchema), c.unassign);
  router.post(`${base}/survivors/:survivorId/home`, authenticate, validateParams(survivorParamsSchema), validateBody(moveHomeSchema), c.moveHome);
  router.get(`${base}/production`, authenticate, cityParams, c.state);
  router.post(`${base}/production/:buildingId/recipe`, authenticate, validateParams(productionParamsSchema), validateBody(setRecipeSchema), c.recipe);
  router.post(`${base}/production/:buildingId/collect`, authenticate, validateParams(productionParamsSchema), c.collect);
  router.patch(`${base}/settings`, authenticate, cityParams, validateBody(populationSettingsSchema), c.settings);
  router.post(`${base}/rescue`, authenticate, cityParams, c.rescue);
  return router;
}
