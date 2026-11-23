import { Router, type NextFunction, type RequestHandler, type Response } from 'express';
import {
  cityIdParamSchema,
  createWaterBodySchema,
  expandWaterBodySchema,
  feedFishSchema,
  stockFishSchema,
  waterBodyParamsSchema,
  type CreateWaterBodyInput,
  type ExpandWaterBodyInput,
  type FeedFishInput,
  type StockFishInput,
} from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { AquacultureService } from './aquaculture.service.js';

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
const body = (req: AuthenticatedRequest) => String(req.params.waterBodyId);

export class AquacultureController {
  constructor(private readonly aqua: AquacultureService) {}

  catalog = handle(200, () => this.aqua.getCatalog());
  list = handle(200, (req, u) => this.aqua.getState(city(req), u));
  one = handle(200, (req, u) => this.aqua.getOne(city(req), body(req), u));
  create = handle(201, (req, u) => this.aqua.create(city(req), u, req.body as CreateWaterBodyInput));
  expand = handle(200, (req, u) => this.aqua.expand(city(req), body(req), u, req.body as ExpandWaterBodyInput));
  upgrade = handle(200, (req, u) => this.aqua.upgrade(city(req), body(req), u));
  fill = handle(200, (req, u) => this.aqua.fill(city(req), body(req), u));
  stock = handle(200, (req, u) => this.aqua.stockFish(city(req), body(req), u, req.body as StockFishInput));
  feed = handle(200, (req, u) => this.aqua.feed(city(req), body(req), u, req.body as FeedFishInput));
  harvest = handle(200, (req, u) => this.aqua.harvest(city(req), body(req), u));
  remove = handle(200, (req, u) => this.aqua.remove(city(req), body(req), u));
}

/** Mounted at /api/v1. Every route checks the city's ownership / edit rights in the service. */
export function createAquacultureRouter(controller: AquacultureController, authenticate: RequestHandler): Router {
  const router = Router();
  const params = validateParams(waterBodyParamsSchema);
  const base = '/cities/:cityId/water-bodies';
  router.get('/aquaculture/catalog', authenticate, controller.catalog);
  router.get(base, authenticate, validateParams(cityIdParamSchema), controller.list);
  router.post(base, authenticate, validateParams(cityIdParamSchema), validateBody(createWaterBodySchema), controller.create);
  router.get(`${base}/:waterBodyId`, authenticate, params, controller.one);
  router.post(`${base}/:waterBodyId/expand`, authenticate, params, validateBody(expandWaterBodySchema), controller.expand);
  router.post(`${base}/:waterBodyId/upgrade`, authenticate, params, controller.upgrade);
  router.post(`${base}/:waterBodyId/fill`, authenticate, params, controller.fill);
  router.post(`${base}/:waterBodyId/stock`, authenticate, params, validateBody(stockFishSchema), controller.stock);
  router.post(`${base}/:waterBodyId/feed`, authenticate, params, validateBody(feedFishSchema), controller.feed);
  router.post(`${base}/:waterBodyId/harvest`, authenticate, params, controller.harvest);
  router.delete(`${base}/:waterBodyId`, authenticate, params, controller.remove);
  return router;
}
