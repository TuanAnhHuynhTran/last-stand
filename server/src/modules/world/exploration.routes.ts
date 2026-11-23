import { Router, type RequestHandler } from 'express';
import { explorationInput } from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { BadRequestError, UnauthorizedError } from '../../utils/errors.js';
import type { ExplorationService } from './exploration.service.js';
export function createExplorationRouter(service: ExplorationService, authenticate: RequestHandler) {
  const router = Router();

  for (const base of ['/world/me', '/cities/:cityId/exploration']) {
    for (const path of ['map', 'tiles', 'discoveries']) router.get(`${base}/${path}`, authenticate, async (req: AuthenticatedRequest, res, next) => {
      try {
        if (!req.user) throw new UnauthorizedError();
        const cityId = req.params.cityId ? String(req.params.cityId) : await service.personalCity(req.user.id);
        const state = await service.state(cityId, req.user.id);
        if (path === 'tiles') {
          const values = ['minQ', 'maxQ', 'minR', 'maxR'].map(k => Number(req.query[k]));
          if (values.some(v => !Number.isInteger(v)) || values[1] < values[0] || values[3] < values[2] || values[1] - values[0] > 32 || values[3] - values[2] > 32) throw new BadRequestError('Phạm vi tối đa 32 × 32 hex', 'INVALID_RANGE');
          state.tiles = state.tiles.filter(h => h.q >= values[0] && h.q <= values[1] && h.r >= values[2] && h.r <= values[3]);
        }
        res.set('Cache-Control', 'private, no-store').json({ success: true, data: path === 'discoveries' ? state.tiles.filter(h => h.poi) : state });
      } catch (e) { next(e); }
    });
    for (const kind of ['scan', 'claim'] as const) router.post(`${base}/${kind}s`, authenticate, async (req: AuthenticatedRequest, res, next) => {
      try {
        if (!req.user) throw new UnauthorizedError();
        const parsed = explorationInput.safeParse(req.body);
        if (!parsed.success) throw new BadRequestError('Yêu cầu không hợp lệ', 'INVALID_INPUT');
        const cityId = req.params.cityId ? String(req.params.cityId) : await service.personalCity(req.user.id);
        res.status(201).json({ success: true, data: await service.start(cityId, req.user.id, kind, parsed.data) });
      } catch (e) { next(e); }
    });
  }
  return router;
}
