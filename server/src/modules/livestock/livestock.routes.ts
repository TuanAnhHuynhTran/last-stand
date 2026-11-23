import { Router, type NextFunction, type RequestHandler, type Response } from 'express';
import {
  breedAnimalsSchema,
  buyAnimalsSchema,
  cityIdParamSchema,
  createLivestockFarmSchema,
  expandLivestockFarmSchema,
  feedLivestockSchema,
  livestockAnimalParamsSchema,
  livestockFarmParamsSchema,
  setCaretakersSchema,
  transferAnimalSchema,
  type BreedAnimalsInput,
  type BuyAnimalsInput,
  type CreateLivestockFarmInput,
  type ExpandLivestockFarmInput,
  type FeedLivestockInput,
  type SetCaretakersInput,
  type TransferAnimalInput,
} from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { LivestockService } from './livestock.service.js';

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
const farm = (req: AuthenticatedRequest) => String(req.params.farmId);
const animal = (req: AuthenticatedRequest) => String(req.params.animalId);

export class LivestockController {
  constructor(private readonly livestock: LivestockService) {}

  catalog = handle(200, () => this.livestock.getCatalog());
  list = handle(200, (req, u) => this.livestock.getState(city(req), u));
  herd = handle(200, (req, u) => this.livestock.getHerd(city(req), farm(req), u));
  create = handle(201, (req, u) => this.livestock.create(city(req), u, req.body as CreateLivestockFarmInput));
  expand = handle(200, (req, u) => this.livestock.expand(city(req), farm(req), u, req.body as ExpandLivestockFarmInput));
  upgrade = handle(200, (req, u) => this.livestock.upgrade(city(req), farm(req), u));
  buy = handle(200, (req, u) => this.livestock.buyAnimals(city(req), farm(req), u, req.body as BuyAnimalsInput));
  sell = handle(200, (req, u) => this.livestock.sellAnimal(city(req), farm(req), animal(req), u));
  harvest = handle(200, (req, u) => this.livestock.harvestAnimal(city(req), farm(req), animal(req), u));
  transfer = handle(200, (req, u) => this.livestock.transferAnimal(city(req), farm(req), animal(req), u, req.body as TransferAnimalInput));
  feed = handle(200, (req, u) => this.livestock.feed(city(req), farm(req), u, req.body as FeedLivestockInput));
  water = handle(200, (req, u) => this.livestock.water(city(req), farm(req), u));
  caretakers = handle(200, (req, u) => this.livestock.setCaretakers(city(req), farm(req), u, req.body as SetCaretakersInput));
  collect = handle(200, (req, u) => this.livestock.collect(city(req), farm(req), u));
  breed = handle(200, (req, u) => this.livestock.breed(city(req), farm(req), u, req.body as BreedAnimalsInput));
  remove = handle(200, (req, u) => this.livestock.remove(city(req), farm(req), u));
}

/** Mounted at /api/v1. */
export function createLivestockRouter(controller: LivestockController, authenticate: RequestHandler): Router {
  const router = Router();
  const farmParams = validateParams(livestockFarmParamsSchema);
  const animalParams = validateParams(livestockAnimalParamsSchema);
  const base = '/cities/:cityId/livestock';
  router.get('/livestock/catalog', authenticate, controller.catalog);
  router.get(base, authenticate, validateParams(cityIdParamSchema), controller.list);
  router.post(base, authenticate, validateParams(cityIdParamSchema), validateBody(createLivestockFarmSchema), controller.create);
  router.get(`${base}/:farmId`, authenticate, farmParams, controller.herd);
  router.post(`${base}/:farmId/expand`, authenticate, farmParams, validateBody(expandLivestockFarmSchema), controller.expand);
  router.post(`${base}/:farmId/upgrade`, authenticate, farmParams, controller.upgrade);
  router.post(`${base}/:farmId/animals`, authenticate, farmParams, validateBody(buyAnimalsSchema), controller.buy);
  router.delete(`${base}/:farmId/animals/:animalId`, authenticate, animalParams, controller.sell);
  router.post(`${base}/:farmId/animals/:animalId/harvest`, authenticate, animalParams, controller.harvest);
  router.post(`${base}/:farmId/animals/:animalId/transfer`, authenticate, animalParams, validateBody(transferAnimalSchema), controller.transfer);
  router.post(`${base}/:farmId/feed`, authenticate, farmParams, validateBody(feedLivestockSchema), controller.feed);
  router.post(`${base}/:farmId/water`, authenticate, farmParams, controller.water);
  router.put(`${base}/:farmId/caretakers`, authenticate, farmParams, validateBody(setCaretakersSchema), controller.caretakers);
  router.post(`${base}/:farmId/collect`, authenticate, farmParams, controller.collect);
  router.post(`${base}/:farmId/breed`, authenticate, farmParams, validateBody(breedAnimalsSchema), controller.breed);
  router.delete(`${base}/:farmId`, authenticate, farmParams, controller.remove);
  return router;
}
