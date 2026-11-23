/**
 * Socket.IO hub (Phase 12). Authenticated with the same JWT access token as the REST API.
 *  - each socket joins `user:<id>`; services push through RealtimeBus (notifications, battle
 *    updates, room changes); presence (online / offline) is sent to the user's friends
 *  - `battle:join` / `battle:action` go through PvpService exactly like REST — the server
 *    validates side, turn, version and idempotency before anything is stored or broadcast
 *  - `alliance:join` only for members; `alliance:message` uses the same flood guard as REST
 *  - per-socket token bucket against action spam
 */
import type { Server as HttpServer } from 'node:http';
import { Op } from 'sequelize';
import { Server, type Socket } from 'socket.io';
import { allianceMessageSchema, battleActionSchema, battleParamsSchema } from '@cityverse/shared';
import type { EnvConfig } from '../config/env.js';
import type { DatabaseModels } from '../database/models/index.js';
import type { AllianceService } from '../modules/alliance/alliance.service.js';
import type { PvpService } from '../modules/pvp/pvp.service.js';
import { AppError } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/jwt.js';
import type { RealtimeBus, RealtimeMessage } from './bus.js';

export interface RealtimeServices {
  bus: RealtimeBus;
  pvp: PvpService;
  alliances: AllianceService;
}

type Ack = (res: { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }) => void;

function fail(err: unknown): { ok: false; error: { code: string; message: string } } {
  if (err instanceof AppError) return { ok: false, error: { code: err.code, message: err.message } };
  return { ok: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Loi he thong' } };
}

/** 20 events burst, refills 8 per second. */
function bucket() {
  let tokens = 20;
  let last = Date.now();
  return (): boolean => {
    const now = Date.now();
    tokens = Math.min(20, tokens + ((now - last) / 1000) * 8);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

export function attachRealtime(http: HttpServer, models: DatabaseModels, config: EnvConfig, s: RealtimeServices): Server {
  const io = new Server(http, {
    path: '/socket.io',
    cors: { origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true },
    maxHttpBufferSize: 64 * 1024,
  });

  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '');
      if (!token) throw new Error('MISSING_TOKEN');
      const payload = verifyAccessToken(token, config);
      const user = await models.User.findByPk(payload.sub);
      if (!user || user.status !== 'active') throw new Error('USER_INVALID');
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  const onMessage = (m: RealtimeMessage) => {
    const room = 'user' in m.target ? `user:${m.target.user}` : m.target.room;
    io.to(room).emit(m.event, m.data);
    // Left / kicked members stop receiving the alliance room at once.
    if ((m.event === 'alliance:kicked' || m.event === 'alliance:left') && 'user' in m.target) {
      io.in(room).socketsLeave(`alliance:${(m.data as { allianceId: string }).allianceId}`);
    }
  };
  const onPresence = async ({ userId, online }: { userId: string; online: boolean }) => {
    const rows = await models.Friendship.findAll({ where: { [Op.or]: [{ userAId: userId }, { userBId: userId }] } });
    for (const f of rows) io.to(`user:${f.userAId === userId ? f.userBId : f.userAId}`).emit('presence', { userId, online });
  };
  s.bus.on('message', onMessage);
  s.bus.on('presence', (p) => void onPresence(p).catch(() => undefined));
  io.engine.on('close', () => s.bus.off('message', onMessage));

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    const allow = bucket();
    void socket.join(`user:${userId}`);
    s.bus.connected(userId);

    const guarded =
      <T>(fn: (payload: T) => Promise<unknown>) =>
      async (payload: T, ack?: Ack) => {
        const reply: Ack = typeof ack === 'function' ? ack : () => undefined;
        if (!allow()) return reply({ ok: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Thao tac qua nhanh' } });
        try {
          reply({ ok: true, data: await fn(payload) });
        } catch (err) {
          reply(fail(err));
        }
      };

    // Reconnect: (re)join a duel and get the authoritative state.
    socket.on(
      'battle:join',
      guarded(async (p: unknown) => {
        const { battleId } = battleParamsSchema.parse(p);
        const dto = await s.pvp.get(battleId, userId); // participant check inside
        await socket.join(`battle:${battleId}`);
        return dto;
      })
    );
    socket.on(
      'battle:action',
      guarded(async (p: unknown) => {
        const raw = (p ?? {}) as Record<string, unknown>;
        const { battleId } = battleParamsSchema.parse({ battleId: raw.battleId });
        const input = battleActionSchema.parse({ clientActionId: raw.clientActionId, expectedVersion: raw.expectedVersion, action: raw.action });
        return s.pvp.act(battleId, userId, input);
      })
    );
    socket.on(
      'alliance:join',
      guarded(async () => {
        const id = await s.alliances.allianceOf(userId);
        if (!id) throw new AppError(403, 'NOT_IN_ALLIANCE', 'Ban chua thuoc lien minh nao');
        await socket.join(`alliance:${id}`);
        return { allianceId: id };
      })
    );
    socket.on(
      'alliance:message',
      guarded(async (p: unknown) => {
        const { body } = allianceMessageSchema.parse(p);
        return s.alliances.post(userId, body);
      })
    );
    socket.on('disconnect', () => s.bus.disconnected(userId));
  });

  return io;
}
