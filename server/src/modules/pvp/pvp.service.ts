/**
 * PvP duels, matchmaking, ranking and seasons (Phase 12). The rules come from the same shared
 * engine as PvE; the server stays the only authority:
 *  - squads are built from REAL soldiers of each player's city (same checks as PvE)
 *  - every action is validated by the engine for the acting side (NOT_YOUR_TURN, range, AP…)
 *    before it is stored and pushed to both players; clients only send intents
 *  - `clientActionId` makes retries / reconnects idempotent, `expectedVersion` refuses stale
 *    boards, the write is a conditional UPDATE on the version (no double apply)
 *  - turn clock: an online player who idles past PVP_TURN_SECONDS has the turn ended for them;
 *    a player who is offline past PVP_FORFEIT_SECONDS forfeits
 *  - settlement (XP / injuries for both squads, Elo, match row) runs once (settled flag +
 *    UNIQUE match per battle); duels never pay resources, so there is nothing to farm
 */
import { randomInt, randomUUID } from 'node:crypto';
import { Op, UniqueConstraintError, type Transaction } from 'sequelize';
import {
  BATTLE_ABANDON_HOURS,
  BattleRuleError,
  PVP_FORFEIT_SECONDS,
  PVP_MISSION,
  PVP_ROOM_SECONDS,
  PVP_SEASON_DAYS,
  PVP_START_RATING,
  PVP_TURN_SECONDS,
  applyBattleAction,
  battleRewards,
  createPvpBattleState,
  eloDelta,
  forfeitBattle,
  pickOpponent,
  pvpTier,
  timeoutPvpTurn,
  type BattleAction,
  type BattleActionInput,
  type BattleEvent,
  type BattleState,
  type LeaderboardEntryDTO,
  type Paged,
  type PvpBattleDTO,
  type PvpMatchDTO,
  type PvpProfileDTO,
  type PvpRoomDTO,
  type PvpStateDTO,
  type QueueEntry,
  type RosterEntry,
} from '@cityverse/shared';
import type { BattleInstance } from '../../database/models/Battle.js';
import type { DatabaseModels } from '../../database/models/index.js';
import type { PvpRating, PvpRoom, PvpSeason } from '../../database/models/Social.js';
import type { RealtimeBus } from '../../realtime/bus.js';
import { AppError, BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import type { BuildingContext } from '../buildings/building.service.js';
import { buildRoster, loadCandidates, settleSoldiers } from '../battle/roster.js';
import type { MilitaryService } from '../military/military.service.js';
import { areFriends } from '../social/access.js';
import type { SocialService } from '../social/social.service.js';

type Side = 'player' | 'enemy';
const OPEN_ROOM: PvpRoom['status'][] = ['waiting', 'selecting'];
const ms = (d: Date | string): number => new Date(d).getTime();
const iso = (d: Date | string): string => new Date(d).toISOString();
const PAGE = 20;

interface Squad {
  userId: string;
  cityId: string;
  unitIds: string[];
  roster: RosterEntry[];
  power: number;
}

export class PvpService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: BuildingContext,
    private readonly military: MilitaryService,
    private readonly social: SocialService,
    private readonly bus: RealtimeBus
  ) {}

  private get m(): DatabaseModels {
    return this.ctx.models;
  }

  private now(): Date {
    return this.ctx.now();
  }

  /** Queue / rooms share one lock (matching must never pair a player twice). */
  private lobby<T>(fn: () => Promise<T>): Promise<T> {
    return this.ctx.mutex.run('pvp:lobby', fn);
  }

  /** Both cities locked (sorted, so two duels never deadlock), then one transaction. */
  private withCities<T>(cityIds: string[], fn: (t: Transaction) => Promise<T>): Promise<T> {
    const keys = [...new Set(cityIds)].sort();
    const run = (i: number): Promise<T> => (i === keys.length ? this.m.sequelize.transaction(fn) : this.ctx.mutex.run(keys[i], () => run(i + 1)));
    return run(0);
  }

  // ── Season & rating ────────────────────────────────────────────────────────
  async season(t?: Transaction): Promise<PvpSeason> {
    const now = this.now();
    const current = await this.m.PvpSeason.findOne({ where: { startsAt: { [Op.lte]: now }, endsAt: { [Op.gt]: now } }, order: [['number', 'DESC']], transaction: t });
    if (current) return current;
    const last = await this.m.PvpSeason.findOne({ order: [['number', 'DESC']], transaction: t });
    // Seasons chain back-to-back; after a long pause a new one starts today.
    let start = last ? new Date(last.endsAt) : now;
    if (start.getTime() > now.getTime() || now.getTime() - start.getTime() > PVP_SEASON_DAYS * 86400_000) start = now;
    const number = (last?.number ?? 0) + 1;
    try {
      return await this.m.PvpSeason.create({ number, name: `Mùa ${number}`, startsAt: start, endsAt: new Date(start.getTime() + PVP_SEASON_DAYS * 86400_000) }, { transaction: t });
    } catch (err) {
      if (err instanceof UniqueConstraintError) return (await this.m.PvpSeason.findOne({ where: { number }, transaction: t }))!;
      throw err;
    }
  }

  private async rating(seasonId: string, userId: string, t?: Transaction): Promise<PvpRating> {
    const found = await this.m.PvpRating.findOne({ where: { seasonId, userId }, transaction: t });
    if (found) return found;
    try {
      return await this.m.PvpRating.create({ seasonId, userId, rating: PVP_START_RATING }, { transaction: t });
    } catch (err) {
      if (err instanceof UniqueConstraintError) return (await this.m.PvpRating.findOne({ where: { seasonId, userId }, transaction: t }))!;
      throw err;
    }
  }

  async profile(userId: string, t?: Transaction): Promise<PvpProfileDTO> {
    const season = await this.season(t);
    const r = await this.rating(season.id, userId, t);
    const user = await this.m.User.findByPk(userId, { transaction: t });
    const games = r.wins + r.losses + r.draws;
    const above = await this.m.PvpRating.count({ where: { seasonId: season.id, rating: { [Op.gt]: r.rating } }, transaction: t });
    return {
      userId,
      username: user?.username ?? '?',
      seasonId: season.id,
      seasonName: season.name,
      seasonEndsAt: iso(season.endsAt),
      rating: r.rating,
      tier: pvpTier(r.rating),
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      games,
      rank: games > 0 ? above + 1 : null,
    };
  }

  /** Current season, best first; cursor = offset (stable order rating DESC, id ASC). */
  async leaderboard(cursor?: string): Promise<Paged<LeaderboardEntryDTO>> {
    const season = await this.season();
    const offset = Math.max(0, Number.parseInt(cursor ?? '0', 10) || 0);
    const rows = await this.m.PvpRating.findAll({
      where: { seasonId: season.id, [Op.or]: [{ wins: { [Op.gt]: 0 } }, { losses: { [Op.gt]: 0 } }, { draws: { [Op.gt]: 0 } }] },
      order: [['rating', 'DESC'], ['id', 'ASC']],
      offset,
      limit: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const users = await this.m.User.findAll({ where: { id: page.map((r) => r.userId) } });
    return {
      items: page.map((r, i) => ({ rank: offset + i + 1, userId: r.userId, username: users.find((u) => u.id === r.userId)?.username ?? '?', rating: r.rating, tier: pvpTier(r.rating), wins: r.wins, losses: r.losses })),
      nextCursor: rows.length > PAGE ? String(offset + PAGE) : null,
    };
  }

  // ── State ──────────────────────────────────────────────────────────────────
  async state(userId: string): Promise<PvpStateDTO> {
    await this.sweep();
    const [profile, queued, rooms, active, history] = await Promise.all([
      this.profile(userId),
      this.m.PvpQueueEntry.findOne({ where: { userId } }),
      this.m.PvpRoom.findAll({ where: { status: OPEN_ROOM, [Op.or]: [{ hostUserId: userId }, { guestUserId: userId }, { invitedUserId: userId }] }, order: [['createdAt', 'DESC']], limit: 10 }),
      this.activeBattle(userId),
      this.history(userId),
    ]);
    return {
      profile,
      queue: { queued: Boolean(queued), since: queued ? iso(queued.enqueuedAt) : null, power: queued?.power ?? null },
      rooms: await Promise.all(rooms.map((r) => this.roomDto(userId, r))),
      activeBattleId: active?.id ?? null,
      history: history.items,
      serverTime: this.now().toISOString(),
    };
  }

  async history(userId: string, cursor?: string): Promise<Paged<PvpMatchDTO>> {
    const where: Record<string | symbol, unknown> = { [Op.or]: [{ hostUserId: userId }, { guestUserId: userId }] };
    if (cursor) where.endedAt = { [Op.lt]: new Date(cursor) };
    const rows = await this.m.PvpMatch.findAll({ where, order: [['endedAt', 'DESC']], limit: PAGE + 1 });
    const page = rows.slice(0, PAGE);
    const others = await this.m.User.findAll({ where: { id: page.map((x) => (x.hostUserId === userId ? x.guestUserId : x.hostUserId)) } });
    return {
      items: page.map((x) => {
        const host = x.hostUserId === userId;
        const oppId = host ? x.guestUserId : x.hostUserId;
        return {
          id: x.id,
          battleId: x.battleId,
          opponent: { id: oppId, username: others.find((u) => u.id === oppId)?.username ?? '?' },
          result: x.winnerUserId === null ? 'draw' : x.winnerUserId === userId ? 'win' : 'loss',
          ratingBefore: host ? x.hostRatingBefore : x.guestRatingBefore,
          ratingAfter: host ? x.hostRatingAfter : x.guestRatingAfter,
          reason: x.reason,
          endedAt: iso(x.endedAt),
        };
      }),
      nextCursor: rows.length > PAGE ? iso(page[page.length - 1].endedAt) : null,
    };
  }

  private async activeBattle(userId: string, t?: Transaction): Promise<BattleInstance | null> {
    const mine = await this.m.BattleParticipant.findAll({ where: { userId }, attributes: ['battleId'], transaction: t });
    if (!mine.length) return null;
    return this.m.BattleInstance.findOne({ where: { id: mine.map((p) => p.battleId), missionCode: 'pvp_duel', status: 'player' }, transaction: t });
  }

  // ── Squads ─────────────────────────────────────────────────────────────────
  private async cityOf(userId: string, t?: Transaction): Promise<string> {
    const city = await this.m.City.findOne({ where: { ownerId: userId }, order: [['createdAt', 'ASC']], transaction: t });
    if (!city) throw new NotFoundError('Ban chua co thanh pho', 'CITY_NOT_FOUND');
    return city.id;
  }

  /** The chosen soldiers, validated exactly like PvE (ready, equipped, healthy, not busy). */
  private async squad(userId: string, unitIds: readonly string[], t?: Transaction): Promise<Squad> {
    if (new Set(unitIds).size !== unitIds.length) throw new BadRequestError('Doi hinh co don vi trung', 'INVALID_ROSTER');
    if (unitIds.length < PVP_MISSION.minUnits || unitIds.length > PVP_MISSION.maxUnits) {
      throw new BadRequestError(`Dau truong can ${PVP_MISSION.minUnits}-${PVP_MISSION.maxUnits} binh si`, 'INVALID_ROSTER');
    }
    const cityId = await this.cityOf(userId, t);
    if (t) await this.military.settle(cityId, t);
    const cands = await loadCandidates(this.m, cityId, t);
    const { roster, power } = await buildRoster(this.m, cands, unitIds, t);
    return { userId, cityId, unitIds: [...unitIds], roster, power };
  }

  private async assertFree(userId: string, t?: Transaction): Promise<void> {
    if (await this.activeBattle(userId, t)) throw new ConflictError('Ban dang co tran PvP chua ket thuc', 'PVP_BATTLE_ACTIVE');
  }

  // ── Queue (matchmaking) ────────────────────────────────────────────────────
  async enqueue(userId: string, unitIds: string[]): Promise<PvpStateDTO> {
    await this.lobby(async () => {
      await this.assertFree(userId);
      const cityId = await this.cityOf(userId);
      const sq = await this.ctx.mutex.run(cityId, () => this.m.sequelize.transaction((t) => this.squad(userId, unitIds, t)));
      const season = await this.season();
      const r = await this.rating(season.id, userId);
      await this.m.PvpQueueEntry.destroy({ where: { userId } });
      await this.m.PvpQueueEntry.create({ userId, cityId, unitIds, rating: r.rating, games: r.wins + r.losses + r.draws, power: sq.power, enqueuedAt: this.now() });
      await this.matchQueue();
    });
    return this.state(userId);
  }

  async leaveQueue(userId: string): Promise<PvpStateDTO> {
    await this.lobby(() => this.m.PvpQueueEntry.destroy({ where: { userId } }));
    return this.state(userId);
  }

  /** Pairs waiting players, oldest first (pickOpponent: rating + squad power + newbie guard). */
  private async matchQueue(): Promise<void> {
    const rows = await this.m.PvpQueueEntry.findAll({ order: [['enqueuedAt', 'ASC']] });
    const pool: QueueEntry[] = rows.map((r) => ({ userId: r.userId, rating: r.rating, games: r.games, power: r.power, enqueuedAtMs: ms(r.enqueuedAt) }));
    const taken = new Set<string>();
    for (const me of pool) {
      if (taken.has(me.userId)) continue;
      const other = pickOpponent(me, pool.filter((e) => !taken.has(e.userId)), this.now().getTime());
      if (!other) continue;
      const a = rows.find((r) => r.userId === me.userId)!;
      const b = rows.find((r) => r.userId === other.userId)!;
      taken.add(a.userId).add(b.userId);
      await this.m.PvpQueueEntry.destroy({ where: { userId: [a.userId, b.userId] } });
      let room: PvpRoom | null = null;
      try {
        room = await this.m.PvpRoom.create({ hostUserId: a.userId, guestUserId: b.userId, invitedUserId: null, ranked: true, status: 'selecting', hostUnitIds: a.unitIds, guestUnitIds: b.unitIds, battleId: null, expiresAt: new Date(this.now().getTime() + PVP_ROOM_SECONDS * 1000) });
        await this.startBattle(room);
      } catch (err) {
        // A squad changed while waiting (soldier hurt, sent elsewhere…): nobody fights; both are told.
        if (room) await room.update({ status: 'cancelled' });
        for (const u of [a.userId, b.userId]) this.bus.emitToUser(u, 'pvp:queue', { matched: false, reason: err instanceof Error ? err.message : 'error' });
      }
    }
  }

  // ── Rooms (friendly duels / invites) ───────────────────────────────────────
  async createRoom(userId: string, inviteUserId?: string): Promise<PvpRoomDTO> {
    return this.lobby(async () => {
      await this.assertFree(userId);
      await this.cityOf(userId);
      if (inviteUserId) {
        if (inviteUserId === userId) throw new BadRequestError('Khong the moi chinh minh', 'INVALID_INVITE');
        if (!(await areFriends(this.m, userId, inviteUserId))) throw new ForbiddenError('Chi moi duoc ban be', 'NOT_FRIENDS');
      }
      if ((await this.m.PvpRoom.count({ where: { hostUserId: userId, status: OPEN_ROOM } })) >= 3) throw new ConflictError('Toi da 3 phong dang mo', 'TOO_MANY_ROOMS');
      const room = await this.m.PvpRoom.create({ hostUserId: userId, guestUserId: null, invitedUserId: inviteUserId ?? null, ranked: false, status: 'waiting', hostUnitIds: [], guestUnitIds: [], battleId: null, expiresAt: new Date(this.now().getTime() + PVP_ROOM_SECONDS * 1000) });
      if (inviteUserId) await this.social.notify(inviteUserId, userId, 'pvp_invite', { roomId: room.id, fromUserId: userId });
      return this.roomDto(userId, room);
    });
  }

  async joinRoom(roomId: string, userId: string): Promise<PvpRoomDTO> {
    return this.lobby(async () => {
      const room = await this.room(roomId);
      if (room.hostUserId === userId || room.guestUserId === userId) return this.roomDto(userId, room);
      if (room.status !== 'waiting') throw new ConflictError('Phong da du nguoi hoac da dong', 'ROOM_CLOSED');
      if (room.invitedUserId && room.invitedUserId !== userId) throw new ForbiddenError('Phong chi danh cho nguoi duoc moi', 'ROOM_FORBIDDEN');
      if (!room.invitedUserId && !(await areFriends(this.m, room.hostUserId, userId))) throw new ForbiddenError('Phong ban be: hay ket ban truoc', 'NOT_FRIENDS');
      await this.assertFree(userId);
      await this.cityOf(userId);
      const [n] = await this.m.PvpRoom.update({ guestUserId: userId, status: 'selecting' }, { where: { id: room.id, status: 'waiting' } });
      if (n !== 1) throw new ConflictError('Phong da du nguoi', 'ROOM_CLOSED');
      await room.reload();
      this.pushRoom(room);
      return this.roomDto(userId, room);
    });
  }

  async setRoster(roomId: string, userId: string, unitIds: string[]): Promise<PvpRoomDTO> {
    return this.lobby(async () => {
      const room = await this.room(roomId);
      const host = room.hostUserId === userId;
      if (!host && room.guestUserId !== userId) throw new ForbiddenError('Ban khong o trong phong nay', 'ROOM_FORBIDDEN');
      if (room.status !== 'selecting') throw new ConflictError('Phong chua san sang chon doi hinh', 'ROOM_NOT_SELECTING');
      const cityId = await this.cityOf(userId);
      await this.ctx.mutex.run(cityId, () => this.m.sequelize.transaction((t) => this.squad(userId, unitIds, t)));
      await room.update(host ? { hostUnitIds: unitIds } : { guestUnitIds: unitIds });
      if (room.hostUnitIds.length && room.guestUnitIds.length) await this.startBattle(room);
      await room.reload();
      this.pushRoom(room);
      return this.roomDto(userId, room);
    });
  }

  async cancelRoom(roomId: string, userId: string): Promise<PvpRoomDTO> {
    return this.lobby(async () => {
      const room = await this.room(roomId);
      if (room.hostUserId !== userId && room.guestUserId !== userId && room.invitedUserId !== userId) throw new ForbiddenError('Ban khong o trong phong nay', 'ROOM_FORBIDDEN');
      if (!OPEN_ROOM.includes(room.status)) throw new ConflictError('Phong da bat dau hoac da dong', 'ROOM_CLOSED');
      await room.update({ status: 'cancelled' });
      this.pushRoom(room);
      return this.roomDto(userId, room);
    });
  }

  private async room(id: string): Promise<PvpRoom> {
    const room = await this.m.PvpRoom.findByPk(id);
    if (!room) throw new NotFoundError('Phong khong ton tai', 'ROOM_NOT_FOUND');
    if (OPEN_ROOM.includes(room.status) && ms(room.expiresAt) <= this.now().getTime()) {
      await room.update({ status: 'cancelled' });
      throw new ConflictError('Phong da het han', 'ROOM_EXPIRED');
    }
    return room;
  }

  private pushRoom(room: PvpRoom): void {
    for (const u of [room.hostUserId, room.guestUserId, room.invitedUserId]) if (u) this.bus.emitToUser(u, 'pvp:room', { roomId: room.id, status: room.status, battleId: room.battleId });
  }

  private async roomDto(viewerId: string, r: PvpRoom): Promise<PvpRoomDTO> {
    const users = await this.m.User.findAll({ where: { id: [r.hostUserId, ...(r.guestUserId ? [r.guestUserId] : [])] } });
    const sums = await this.social.summaries(viewerId, users);
    return {
      id: r.id,
      status: r.status,
      ranked: r.ranked,
      host: sums.find((s) => s.id === r.hostUserId)!,
      guest: r.guestUserId ? (sums.find((s) => s.id === r.guestUserId) ?? null) : null,
      invitedUserId: r.invitedUserId,
      hostReady: r.hostUnitIds.length > 0,
      guestReady: r.guestUnitIds.length > 0,
      battleId: r.battleId,
      expiresAt: iso(r.expiresAt),
    };
  }

  // ── Battle creation ────────────────────────────────────────────────────────
  private async startBattle(room: PvpRoom): Promise<BattleInstance> {
    const hostCity = await this.cityOf(room.hostUserId);
    const guestCity = await this.cityOf(room.guestUserId!);
    const battle = await this.withCities([hostCity, guestCity], async (t) => {
      // Re-validated inside both city locks: nothing changed since the squads were chosen.
      await this.assertFree(room.hostUserId, t);
      await this.assertFree(room.guestUserId!, t);
      const host = await this.squad(room.hostUserId, room.hostUnitIds, t);
      const guest = await this.squad(room.guestUserId!, room.guestUnitIds, t);
      const seed = randomInt(1, 2_147_483_646);
      const state = createPvpBattleState(seed, host.roster, guest.roster);
      const now = this.now();
      const b = await this.m.BattleInstance.create(
        {
          cityId: host.cityId,
          userId: host.userId,
          missionCode: 'pvp_duel',
          poiId: null,
          status: state.phase,
          version: state.version,
          seed,
          state,
          requestKey: randomUUID(),
          fingerprint: JSON.stringify({ room: room.id }),
          lastActionAt: now,
          expiresAt: new Date(now.getTime() + BATTLE_ABANDON_HOURS * 3600_000),
        },
        { transaction: t }
      );
      await this.m.BattleParticipant.bulkCreate(
        [
          { battleId: b.id, userId: host.userId, side: 'player', joinedAt: now },
          { battleId: b.id, userId: guest.userId, side: 'enemy', joinedAt: now },
        ],
        { transaction: t }
      );
      await this.m.BattleUnitRecord.bulkCreate(
        state.units.map((u) => ({ battleId: b.id, unitKey: u.id, militaryUnitId: u.sourceId, side: u.side, kind: u.kind, name: u.name.slice(0, 60), startHp: u.hp, maxHp: u.maxHp })),
        { transaction: t }
      );
      await this.m.MilitaryUnit.update({ status: 'battle' }, { where: { id: [...host.unitIds, ...guest.unitIds] }, transaction: t });
      await this.m.BattleTurn.create({ battleId: b.id, turn: 1, side: 'player', startedAt: now }, { transaction: t });
      await room.update({ status: 'in_battle', battleId: b.id }, { transaction: t });
      for (const [u, other] of [[host.userId, guest.userId], [guest.userId, host.userId]]) {
        await this.social.notify(u, other, 'pvp_match', { battleId: b.id, opponentId: other }, t);
      }
      return b;
    });
    for (const u of [room.hostUserId, room.guestUserId!]) this.bus.emitToUser(u, 'pvp:matched', { battleId: battle.id, roomId: room.id });
    return battle;
  }

  // ── Battle play ────────────────────────────────────────────────────────────
  private async participant(battleId: string, userId: string, t?: Transaction): Promise<{ battle: BattleInstance; side: Side }> {
    const battle = await this.m.BattleInstance.findByPk(battleId, { transaction: t });
    if (!battle || battle.missionCode !== 'pvp_duel') throw new NotFoundError('Tran PvP khong ton tai', 'BATTLE_NOT_FOUND');
    const p = await this.m.BattleParticipant.findOne({ where: { battleId, userId }, transaction: t });
    if (!p) throw new ForbiddenError('Ban khong tham gia tran nay', 'BATTLE_FORBIDDEN');
    return { battle, side: p.side };
  }

  /** Locks: this battle, then both cities (sorted) — the same order everywhere. */
  private async locked<T>(battleId: string, fn: (battle: BattleInstance, t: Transaction) => Promise<T>): Promise<T> {
    return this.ctx.mutex.run(`pvp:battle:${battleId}`, async () => {
      const parts = await this.m.BattleParticipant.findAll({ where: { battleId } });
      const cities = await Promise.all(parts.map((p) => this.cityOf(p.userId)));
      return this.withCities(cities, async (t) => {
        const battle = (await this.m.BattleInstance.findByPk(battleId, { transaction: t }))!;
        return fn(battle, t);
      });
    });
  }

  async get(battleId: string, userId: string): Promise<PvpBattleDTO> {
    await this.participant(battleId, userId);
    const events = await this.locked(battleId, async (battle, t) => this.tick(battle, t));
    const { battle } = await this.participant(battleId, userId);
    return this.dto(battle, userId, events ?? undefined);
  }

  async act(battleId: string, userId: string, input: BattleActionInput): Promise<PvpBattleDTO> {
    const { side } = await this.participant(battleId, userId);
    const events = await this.locked(battleId, async (battle, t) => {
      const fingerprint = JSON.stringify(input.action);
      const prior = await this.m.BattleActionRecord.findOne({ where: { battleId, clientActionId: input.clientActionId }, transaction: t });
      if (prior) {
        // Reconnect / retry: the stored result, nothing applied twice.
        if (prior.fingerprint !== `${side}:${fingerprint}`) throw new ConflictError('Ma hanh dong da duoc dung cho hanh dong khac', 'IDEMPOTENCY_CONFLICT');
        return prior.events;
      }
      await this.tick(battle, t);
      if (battle.status !== 'player') throw new ConflictError('Tran da ket thuc', 'BATTLE_FINISHED');
      if (input.expectedVersion !== battle.version) throw new AppError(409, 'STALE_BATTLE', 'Trang thai tran da thay doi; tai lai', { version: [String(battle.version)] });
      let result: { state: BattleState; events: BattleEvent[] };
      try {
        result = applyBattleAction(battle.state, input.action as BattleAction, side);
      } catch (err) {
        if (err instanceof BattleRuleError) throw new AppError(409, err.code, err.message);
        throw err;
      }
      await this.persist(battle, result.state, input.action as BattleAction, result.events, input.clientActionId, `${side}:${fingerprint}`, t);
      return result.events;
    });
    const { battle } = await this.participant(battleId, userId);
    return this.dto(battle, userId, events);
  }

  /**
   * The server clock: ends an idle online player's turn, or forfeits a player who has been
   * offline too long. Returns the events it produced (null when nothing happened).
   */
  private async tick(battle: BattleInstance, t: Transaction): Promise<BattleEvent[] | null> {
    if (battle.status !== 'player' || battle.state.outcome) return null;
    const active: Side = battle.state.activeSide ?? 'player';
    const turn = await this.m.BattleTurn.findOne({ where: { battleId: battle.id, endedAt: null }, order: [['createdAt', 'DESC']], transaction: t });
    const since = this.now().getTime() - ms(turn?.startedAt ?? battle.lastActionAt);
    const owner = await this.m.BattleParticipant.findOne({ where: { battleId: battle.id, side: active }, transaction: t });
    const online = owner ? this.bus.isOnline(owner.userId) : false;
    let r: { state: BattleState; events: BattleEvent[] } | null = null;
    let tag = '';
    if (!online && since >= PVP_FORFEIT_SECONDS * 1000) {
      r = forfeitBattle(battle.state, active);
      tag = 'forfeit';
    } else if (online && since >= PVP_TURN_SECONDS * 1000) {
      r = timeoutPvpTurn(battle.state);
      tag = 'timeout';
    }
    if (!r) return null;
    await this.persist(battle, r.state, tag === 'forfeit' ? { type: 'retreat' } : { type: 'end_turn' }, r.events, `${tag}-${battle.id.slice(0, 8)}-${battle.version}`, `server:${tag}`, t);
    return r.events;
  }

  private async persist(battle: BattleInstance, state: BattleState, action: BattleAction, events: BattleEvent[], clientActionId: string, fingerprint: string, t: Transaction): Promise<void> {
    const now = this.now();
    const prevTurn = battle.state.turn;
    const prevSide: Side = battle.state.activeSide ?? 'player';
    const [changed] = await this.m.BattleInstance.update(
      { state, status: state.phase, version: state.version, lastActionAt: now, expiresAt: new Date(now.getTime() + BATTLE_ABANDON_HOURS * 3600_000), outcome: state.outcome, endedAt: state.outcome ? now : null },
      { where: { id: battle.id, version: battle.version }, transaction: t }
    );
    if (changed !== 1) throw new ConflictError('Trang thai tran da thay doi; tai lai', 'STALE_BATTLE');
    await this.m.BattleActionRecord.create({ battleId: battle.id, seq: state.version, turn: prevTurn, clientActionId, fingerprint, action, events }, { transaction: t });
    const sideChanged = state.activeSide !== prevSide || state.turn !== prevTurn;
    if (sideChanged || state.outcome) {
      await this.m.BattleTurn.update({ endedAt: now }, { where: { battleId: battle.id, endedAt: null }, transaction: t });
      if (!state.outcome) await this.m.BattleTurn.create({ battleId: battle.id, turn: state.turn, side: state.activeSide ?? 'player', startedAt: now }, { transaction: t });
    }
    for (const u of state.units) {
      await this.m.BattleUnitRecord.update({ endHp: u.hp, ko: u.ko, kills: u.kills }, { where: { battleId: battle.id, unitKey: u.id }, transaction: t });
    }
    await battle.reload({ transaction: t });
    if (state.outcome) await this.settle(battle, t);
    // Both players see the new board (each from their own side) once it is committed.
    const parts = await this.m.BattleParticipant.findAll({ where: { battleId: battle.id }, transaction: t });
    t.afterCommit(() => {
      for (const p of parts) this.bus.emitToUser(p.userId, 'battle:update', { battleId: battle.id, version: state.version, phase: state.phase });
    });
  }

  /** Once: XP / injuries for both squads, Elo (ranked), match row, room closed, notifications. */
  private async settle(battle: BattleInstance, t: Transaction): Promise<void> {
    const [claimed] = await this.m.BattleInstance.update({ settled: true }, { where: { id: battle.id, settled: false }, transaction: t });
    if (claimed !== 1) return;
    const state = battle.state;
    await settleSoldiers(this.m, battle.id, state, battleRewards(state), ['player', 'enemy'], t);
    const parts = await this.m.BattleParticipant.findAll({ where: { battleId: battle.id }, transaction: t });
    const hostId = parts.find((p) => p.side === 'player')!.userId;
    const guestId = parts.find((p) => p.side === 'enemy')!.userId;
    const room = await this.m.PvpRoom.findOne({ where: { battleId: battle.id }, transaction: t });
    const ranked = room?.ranked ?? true;
    const season = await this.season(t);
    const hr = await this.rating(season.id, hostId, t);
    const gr = await this.rating(season.id, guestId, t);
    const w = state.outcome?.winner ?? null;
    const score = w === 'player' ? 1 : w === 'enemy' ? 0 : 0.5;
    const before = { host: hr.rating, guest: gr.rating };
    if (ranked) {
      const dh = eloDelta(hr.rating, gr.rating, score, hr.wins + hr.losses + hr.draws);
      const dg = eloDelta(gr.rating, hr.rating, 1 - score, gr.wins + gr.losses + gr.draws);
      const bump = (r: PvpRating, d: number, s: number) =>
        r.update({ rating: Math.max(100, r.rating + d), wins: r.wins + (s === 1 ? 1 : 0), losses: r.losses + (s === 0 ? 1 : 0), draws: r.draws + (s === 0.5 ? 1 : 0) }, { transaction: t });
      await bump(hr, dh, score);
      await bump(gr, dg, 1 - score);
    }
    try {
      await this.m.PvpMatch.create(
        {
          battleId: battle.id,
          seasonId: season.id,
          hostUserId: hostId,
          guestUserId: guestId,
          winnerUserId: w === 'player' ? hostId : w === 'enemy' ? guestId : null,
          hostRatingBefore: before.host,
          hostRatingAfter: hr.rating,
          guestRatingBefore: before.guest,
          guestRatingAfter: gr.rating,
          reason: `${ranked ? 'ranked' : 'friendly'}:${state.outcome?.reason ?? 'unknown'}`,
          endedAt: this.now(),
        },
        { transaction: t }
      );
    } catch (err) {
      if (!(err instanceof UniqueConstraintError)) throw err;
    }
    if (room) await room.update({ status: 'finished' }, { transaction: t });
  }

  /** Periodic housekeeping: expired rooms, queue matching (wider windows), turn clocks. */
  async sweep(): Promise<void> {
    await this.lobby(async () => {
      await this.m.PvpRoom.update({ status: 'cancelled' }, { where: { status: OPEN_ROOM, expiresAt: { [Op.lte]: this.now() } } });
      await this.matchQueue();
    });
    const open = await this.m.BattleInstance.findAll({ where: { missionCode: 'pvp_duel', status: 'player' }, attributes: ['id'], limit: 200 });
    for (const b of open) {
      try {
        await this.locked(b.id, (battle, t) => this.tick(battle, t));
      } catch {
        /* next sweep */
      }
    }
  }

  start(intervalMs = 5000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep().catch(() => undefined), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async dto(b: BattleInstance, viewerId: string, events?: BattleEvent[]): Promise<PvpBattleDTO> {
    const parts = await this.m.BattleParticipant.findAll({ where: { battleId: b.id } });
    const me = parts.find((p) => p.userId === viewerId)!;
    const opp = parts.find((p) => p.userId !== viewerId)!;
    const oppUser = await this.m.User.findByPk(opp.userId);
    const last = events ?? (await this.m.BattleActionRecord.findOne({ where: { battleId: b.id }, order: [['seq', 'DESC']] }))?.events ?? [];
    const turn = b.status === 'player' ? await this.m.BattleTurn.findOne({ where: { battleId: b.id, endedAt: null }, order: [['createdAt', 'DESC']] }) : null;
    const activeOnline = this.bus.isOnline(parts.find((p) => p.side === (b.state.activeSide ?? 'player'))!.userId);
    const deadline = turn ? ms(turn.startedAt) + (activeOnline ? PVP_TURN_SECONDS : PVP_FORFEIT_SECONDS) * 1000 : null;
    return {
      id: b.id,
      cityId: b.cityId,
      mission: b.missionCode,
      phase: b.status,
      state: b.state,
      events: last,
      version: b.version,
      rewards: b.state.outcome ? battleRewards(b.state) : null,
      claimed: false,
      poiId: null,
      lastActionAt: iso(b.lastActionAt),
      expiresAt: iso(b.expiresAt),
      serverTime: this.now().toISOString(),
      mySide: me.side,
      opponent: { id: opp.userId, username: oppUser?.username ?? '?', online: this.bus.isOnline(opp.userId) },
      turnDeadline: deadline ? new Date(deadline).toISOString() : null,
    };
  }
}
