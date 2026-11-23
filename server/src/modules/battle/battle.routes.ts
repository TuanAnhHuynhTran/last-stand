import { Router, type NextFunction, type RequestHandler, type Response } from 'express';
import { battleActionSchema, battleParamsSchema, cityIdParamSchema, createBattleSchema, endTurnSchema, type BattleActionInput, type CreateBattleInput, type EndTurnInput } from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { BadRequestError, UnauthorizedError } from '../../utils/errors.js';
import type { BattleService } from './battle.service.js';

type Handler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;

function handle(fn: (req: AuthenticatedRequest, userId: string) => Promise<unknown>, status = 200): Handler {
  return async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      res.set('Cache-Control', 'private, no-store').status(status).json({ success: true, data: await fn(req, req.user.id) });
    } catch (error) {
      next(error);
    }
  };
}

const battle = (req: AuthenticatedRequest) => String(req.params.battleId);

/** Mounted at /api/v1. The client sends intents; damage, results and rewards are server-side only. */
export function createBattleRouter(service: BattleService, authenticate: RequestHandler): Router {
  const router = Router();
  const params = validateParams(battleParamsSchema);
  router.get('/cities/:cityId/battles', authenticate, validateParams(cityIdParamSchema), handle((req, u) => service.lobby(String(req.params.cityId), u)));
  router.post('/cities/:cityId/battles', authenticate, validateParams(cityIdParamSchema), validateBody(createBattleSchema), handle((req, u) => service.create(String(req.params.cityId), u, req.body as CreateBattleInput), 201));
  router.get('/battles/:battleId', authenticate, params, handle((req, u) => service.get(battle(req), u)));
  router.get('/battles/:battleId/result', authenticate, params, handle((req, u) => service.get(battle(req), u)));
  router.post('/battles/:battleId/actions', authenticate, params, validateBody(battleActionSchema), handle((req, u) => service.act(battle(req), u, req.body as BattleActionInput)));
  router.post(
    '/battles/:battleId/end-turn',
    authenticate,
    params,
    validateBody(endTurnSchema),
    handle((req, u) => {
      const body = req.body as EndTurnInput;
      return service.act(battle(req), u, { ...body, action: { type: 'end_turn' } });
    })
  );
  router.post(
    '/battles/:battleId/rewards',
    authenticate,
    params,
    handle((req, u) => {
      // Rewards are computed by the server from the stored result; nothing is accepted from the body.
      if (req.body && Object.keys(req.body as object).length) throw new BadRequestError('Server tu tinh phan thuong', 'INVALID_INPUT');
      return service.claim(battle(req), u);
    })
  );
  return router;
}
