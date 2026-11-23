import { Router, type NextFunction, type RequestHandler, type Response } from 'express';
import {
  cityIdParamSchema,
  createSquadSchema,
  equipSchema,
  recruitSchema,
  squadMemberParamsSchema,
  squadMembersSchema,
  squadParamsSchema,
  startTrainingSchema,
  unitParamsSchema,
  updateSquadSchema,
  type CreateSquadInput,
  type EquipInput,
  type RecruitInput,
  type SquadMembersInput,
  type StartTrainingInput,
  type UpdateSquadInput,
} from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { MilitaryService } from './military.service.js';

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

export class MilitaryController {
  constructor(private readonly military: MilitaryService) {}

  state = handle((req, u) => this.military.getState(city(req), u));
  recruit = handle((req, u) => this.military.recruit(city(req), u, req.body as RecruitInput), 201);
  train = handle((req, u) => this.military.startTraining(city(req), u, req.body as StartTrainingInput), 201);
  equip = handle((req, u) => this.military.equip(city(req), u, String(req.params.unitId), req.body as EquipInput));
  discharge = handle((req, u) => this.military.discharge(city(req), u, String(req.params.unitId)));
  createSquad = handle((req, u) => this.military.createSquad(city(req), u, req.body as CreateSquadInput), 201);
  updateSquad = handle((req, u) => this.military.updateSquad(city(req), u, String(req.params.squadId), req.body as UpdateSquadInput));
  deleteSquad = handle((req, u) => this.military.deleteSquad(city(req), u, String(req.params.squadId)));
  addMembers = handle((req, u) => this.military.addMembers(city(req), u, String(req.params.squadId), req.body as SquadMembersInput));
  removeMember = handle((req, u) => this.military.removeMember(city(req), u, String(req.params.squadId), String(req.params.unitId)));
}

/** Mounted at /api/v1. Ownership / edit rights are checked in the service for every call. */
export function createMilitaryRouter(c: MilitaryController, authenticate: RequestHandler): Router {
  const router = Router();
  const base = '/cities/:cityId/military';
  const cityParams = validateParams(cityIdParamSchema);
  router.get(base, authenticate, cityParams, c.state);
  router.get(`${base}/training`, authenticate, cityParams, c.state);
  router.post(`${base}/recruit`, authenticate, cityParams, validateBody(recruitSchema), c.recruit);
  router.post(`${base}/training`, authenticate, cityParams, validateBody(startTrainingSchema), c.train);
  router.put(`${base}/units/:unitId/equipment`, authenticate, validateParams(unitParamsSchema), validateBody(equipSchema), c.equip);
  router.delete(`${base}/units/:unitId`, authenticate, validateParams(unitParamsSchema), c.discharge);
  router.get(`${base}/squads`, authenticate, cityParams, c.state);
  router.post(`${base}/squads`, authenticate, cityParams, validateBody(createSquadSchema), c.createSquad);
  router.patch(`${base}/squads/:squadId`, authenticate, validateParams(squadParamsSchema), validateBody(updateSquadSchema), c.updateSquad);
  router.delete(`${base}/squads/:squadId`, authenticate, validateParams(squadParamsSchema), c.deleteSquad);
  router.post(`${base}/squads/:squadId/members`, authenticate, validateParams(squadParamsSchema), validateBody(squadMembersSchema), c.addMembers);
  router.delete(`${base}/squads/:squadId/members/:unitId`, authenticate, validateParams(squadMemberParamsSchema), c.removeMember);
  return router;
}
