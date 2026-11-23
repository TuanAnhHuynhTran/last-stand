/**
 * Phase 12 REST API (mounted at /api/v1): friends & visits, PvP, alliances.
 * Every route is authenticated; bodies are strict Zod schemas; the server decides everything.
 */
import { Router, type NextFunction, type RequestHandler, type Response } from 'express';
import {
  allianceDonateSchema,
  allianceInviteSchema,
  allianceMemberParamsSchema,
  allianceMessageSchema,
  allianceRoleSchema,
  battleActionSchema,
  battleParamsSchema,
  cityIdParamSchema,
  createAllianceSchema,
  endTurnSchema,
  friendRequestSchema,
  idParamSchema,
  pvpQueueSchema,
  pvpRoomCreateSchema,
  pvpRosterSchema,
  respondFriendSchema,
  visibilitySchema,
  type BattleActionInput,
  type CreateAllianceInput,
  type EndTurnInput,
} from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { BadRequestError, UnauthorizedError } from '../../utils/errors.js';
import type { AllianceService } from '../alliance/alliance.service.js';
import type { PvpService } from '../pvp/pvp.service.js';
import type { SocialService } from './social.service.js';

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

const id = (req: AuthenticatedRequest, key = 'id') => String(req.params[key]);
/** Optional cursor from the query string (bounded, never trusted as SQL). */
const cursor = (req: AuthenticatedRequest): string | undefined => {
  const c = req.query.cursor;
  if (c === undefined) return undefined;
  if (typeof c !== 'string' || c.length > 80) throw new BadRequestError('Cursor khong hop le', 'VALIDATION_ERROR');
  return c;
};

export function createSocialRouter(social: SocialService, pvp: PvpService, alliances: AllianceService, authenticate: RequestHandler): Router {
  const r = Router();
  const byId = validateParams(idParamSchema);

  // ── Friends, notifications, visits ─────────────────────────────────────────
  r.get(
    '/users/search',
    authenticate,
    handle((req, u) => {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      if (q.trim().length < 2 || q.length > 24) throw new BadRequestError('Nhap 2-24 ky tu', 'VALIDATION_ERROR');
      return social.search(u, q, cursor(req));
    })
  );
  r.get('/friends', authenticate, handle((_req, u) => social.state(u)));
  r.post('/friends/requests', authenticate, validateBody(friendRequestSchema), handle((req, u) => social.request(u, (req.body as { userId: string }).userId), 201));
  r.post('/friends/requests/:id/respond', authenticate, byId, validateBody(respondFriendSchema), handle((req, u) => social.respond(u, id(req), (req.body as { accept: boolean }).accept)));
  r.delete('/friends/requests/:id', authenticate, byId, handle((req, u) => social.cancel(u, id(req))));
  r.delete('/friends/:id', authenticate, byId, handle((req, u) => social.unfriend(u, id(req))));
  r.post('/friends/:id/visit-invite', authenticate, byId, handle((req, u) => social.inviteVisit(u, id(req))));
  r.get('/notifications', authenticate, handle((req, u) => social.notifications(u, cursor(req))));
  r.post('/notifications/:id/read', authenticate, byId, handle((req, u) => social.markRead(u, id(req))));
  r.patch(
    '/cities/:cityId/visibility',
    authenticate,
    validateParams(cityIdParamSchema),
    validateBody(visibilitySchema),
    handle((req, u) => social.setVisibility(u, String(req.params.cityId), (req.body as { visibility: 'public' | 'friends' | 'private' }).visibility))
  );

  // ── PvP ────────────────────────────────────────────────────────────────────
  r.get('/pvp', authenticate, handle((_req, u) => pvp.state(u)));
  r.get('/pvp/leaderboard', authenticate, handle((req) => pvp.leaderboard(cursor(req))));
  r.get('/pvp/history', authenticate, handle((req, u) => pvp.history(u, cursor(req))));
  r.post('/pvp/queue', authenticate, validateBody(pvpQueueSchema), handle((req, u) => pvp.enqueue(u, (req.body as { unitIds: string[] }).unitIds)));
  r.delete('/pvp/queue', authenticate, handle((_req, u) => pvp.leaveQueue(u)));
  r.post('/pvp/rooms', authenticate, validateBody(pvpRoomCreateSchema), handle((req, u) => pvp.createRoom(u, (req.body as { inviteUserId?: string }).inviteUserId), 201));
  r.post('/pvp/rooms/:id/join', authenticate, byId, handle((req, u) => pvp.joinRoom(id(req), u)));
  r.post('/pvp/rooms/:id/roster', authenticate, byId, validateBody(pvpRosterSchema), handle((req, u) => pvp.setRoster(id(req), u, (req.body as { unitIds: string[] }).unitIds)));
  r.post('/pvp/rooms/:id/cancel', authenticate, byId, handle((req, u) => pvp.cancelRoom(id(req), u)));
  const battle = validateParams(battleParamsSchema);
  r.get('/pvp/battles/:battleId', authenticate, battle, handle((req, u) => pvp.get(id(req, 'battleId'), u)));
  r.post('/pvp/battles/:battleId/actions', authenticate, battle, validateBody(battleActionSchema), handle((req, u) => pvp.act(id(req, 'battleId'), u, req.body as BattleActionInput)));
  r.post(
    '/pvp/battles/:battleId/end-turn',
    authenticate,
    battle,
    validateBody(endTurnSchema),
    handle((req, u) => pvp.act(id(req, 'battleId'), u, { ...(req.body as EndTurnInput), action: { type: 'end_turn' } }))
  );

  // ── Alliances ──────────────────────────────────────────────────────────────
  r.get('/alliances', authenticate, handle((req) => alliances.list(cursor(req))));
  r.get('/alliance', authenticate, handle((_req, u) => alliances.state(u)));
  r.post('/alliances', authenticate, validateBody(createAllianceSchema), handle((req, u) => alliances.create(u, req.body as CreateAllianceInput), 201));
  r.post('/alliance/invites', authenticate, validateBody(allianceInviteSchema), handle((req, u) => alliances.invite(u, (req.body as { userId: string }).userId), 201));
  r.post('/alliance/invites/:id/respond', authenticate, byId, validateBody(respondFriendSchema), handle((req, u) => alliances.respondInvite(u, id(req), (req.body as { accept: boolean }).accept)));
  const member = validateParams(allianceMemberParamsSchema);
  r.patch('/alliance/members/:userId/role', authenticate, member, validateBody(allianceRoleSchema), handle((req, u) => alliances.setRole(u, id(req, 'userId'), (req.body as { role: 'officer' | 'member' }).role)));
  r.delete('/alliance/members/:userId', authenticate, member, handle((req, u) => alliances.kick(u, id(req, 'userId'))));
  r.post('/alliance/members/:userId/transfer', authenticate, member, handle((req, u) => alliances.transfer(u, id(req, 'userId'))));
  r.post('/alliance/leave', authenticate, handle((_req, u) => alliances.leave(u)));
  r.delete('/alliance', authenticate, handle((_req, u) => alliances.disband(u)));
  r.get('/alliance/messages', authenticate, handle((req, u) => alliances.messages(u, cursor(req))));
  r.post('/alliance/messages', authenticate, validateBody(allianceMessageSchema), handle((req, u) => alliances.post(u, (req.body as { body: string }).body), 201));
  r.post('/alliance/quests/:id/donate', authenticate, byId, validateBody(allianceDonateSchema), handle((req, u) => alliances.donate(u, id(req), (req.body as { amount: number }).amount)));
  return r;
}
