import { Router, type NextFunction, type RequestHandler, type Response } from 'express';
import {
  animalEquipSchema,
  assignMountSchema,
  assignTaskSchema,
  careAnimalSchema,
  cityIdParamSchema,
  mountAnimalParamsSchema,
  trainAnimalSchema,
  type AnimalEquipInput,
  type AssignMountInput,
  type AssignTaskInput,
  type CareAnimalInput,
  type TrainAnimalInput,
} from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { MountService } from './mount.service.js';

type Handler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;

function handle(fn: (req: AuthenticatedRequest, userId: string) => Promise<unknown>, status = 200): Handler {
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
const animal = (req: AuthenticatedRequest) => String(req.params.animalId);

export class MountController {
  constructor(private readonly mounts: MountService) {}

  state = handle((req, u) => this.mounts.getState(city(req), u));
  animal = handle((req, u) => this.mounts.getAnimal(city(req), u, animal(req)));
  train = handle((req, u) => this.mounts.train(city(req), u, animal(req), req.body as TrainAnimalInput), 201);
  care = handle((req, u) => this.mounts.care(city(req), u, animal(req), req.body as CareAnimalInput));
  equip = handle((req, u) => this.mounts.equip(city(req), u, animal(req), req.body as AnimalEquipInput));
  mount = handle((req, u) => this.mounts.assignMount(city(req), u, animal(req), req.body as AssignMountInput), 201);
  dismount = handle((req, u) => this.mounts.unassignMount(city(req), u, animal(req)));
  task = handle((req, u) => this.mounts.assignTask(city(req), u, animal(req), req.body as AssignTaskInput), 201);
  endTask = handle((req, u) => this.mounts.unassignTask(city(req), u, animal(req)));
}

/**
 * Mounted at /api/v1. Stables / camps themselves (build, expand, upgrade, receive animals,
 * feed, water) use the livestock API with farmType horse_stable / elephant_camp.
 */
export function createMountRouter(c: MountController, authenticate: RequestHandler): Router {
  const router = Router();
  const base = '/cities/:cityId/mounts';
  const params = validateParams(mountAnimalParamsSchema);
  router.get(base, authenticate, validateParams(cityIdParamSchema), c.state);
  router.get(`${base}/animals/:animalId`, authenticate, params, c.animal);
  router.post(`${base}/animals/:animalId/training`, authenticate, params, validateBody(trainAnimalSchema), c.train);
  router.post(`${base}/animals/:animalId/care`, authenticate, params, validateBody(careAnimalSchema), c.care);
  router.put(`${base}/animals/:animalId/equipment`, authenticate, params, validateBody(animalEquipSchema), c.equip);
  router.post(`${base}/animals/:animalId/mount`, authenticate, params, validateBody(assignMountSchema), c.mount);
  router.delete(`${base}/animals/:animalId/mount`, authenticate, params, c.dismount);
  router.post(`${base}/animals/:animalId/task`, authenticate, params, validateBody(assignTaskSchema), c.task);
  router.delete(`${base}/animals/:animalId/task`, authenticate, params, c.endTask);
  return router;
}
