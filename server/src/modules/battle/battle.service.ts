/**
 * PvE tactical battles (Phase 11). The server is the only authority:
 *  - it builds the battlefield and roster from REAL trained soldiers (stats, equipment,
 *    horses, health) and runs the shared engine for every action; the client only sends
 *    intents (move here, attack that) — never damage, results or rewards
 *  - each action carries `clientActionId` (retries after a reconnect replay the stored result)
 *    and `expectedVersion` (acting on a stale board is refused); the write is a conditional
 *    UPDATE on the version inside the per-city lock
 *  - the state is saved after every action, so a dropped connection loses nothing; a battle
 *    untouched for BATTLE_ABANDON_HOURS is abandoned (defeat, no rewards, soldiers come home)
 *  - at the end the server settles XP / injuries, frees the soldiers and stores the rewards;
 *    claiming flips claimed_at with a conditional UPDATE, so rewards are paid exactly once
 *  - battles never touch the player's buildings, fields or territory
 */
import { randomInt } from 'node:crypto';
import { Op, UniqueConstraintError, type Transaction } from 'sequelize';
import {
  BATTLE_ABANDON_HOURS,
  BattleRuleError,
  MISSIONS,
  abandonBattle,
  applyBattleAction,
  battleRewards,
  createBattleState,
  getMission,
  initialSkills,
  survivorIdentity,
  type BattleAction,
  type BattleActionInput,
  type BattleCandidateDTO,
  type BattleClaimDTO,
  type BattleDTO,
  type BattleEvent,
  type BattleLobbyDTO,
  type BattleRewards,
  type BattleState,
  type CreateBattleInput,
  type MissionAvailabilityDTO,
  type MissionCode,
} from '@cityverse/shared';
import type { BattleInstance } from '../../database/models/Battle.js';
import type { DatabaseModels } from '../../database/models/index.js';
import { AppError, BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import type { BuildingContext } from '../buildings/building.service.js';
import { ProduceService } from '../farming/farm.service.js';
import type { MilitaryService } from '../military/military.service.js';
import { buildRoster, loadCandidates, settleSoldiers } from './roster.js';

export { MIN_BATTLE_HEALTH } from './roster.js';

const OPEN: BattleState['phase'][] = ['deployment', 'player'];
const ms = (d: Date | string): number => new Date(d).getTime();
/** PvP duels live in the same tables but belong to PvpService. */
const PVE = { [Op.ne]: 'pvp_duel' };

/** Called once per settled PvE victory (Phase 12 alliance quests). */
export type VictoryHook = (cityId: string, userId: string, t: Transaction) => Promise<void>;

export class BattleService {
  private readonly stock: ProduceService;
  private readonly victoryHooks: VictoryHook[] = [];

  constructor(
    private readonly ctx: BuildingContext,
    private readonly military: MilitaryService
  ) {
    this.stock = new ProduceService(ctx.models);
  }

  onVictory(hook: VictoryHook): void {
    this.victoryHooks.push(hook);
  }

  private get m(): DatabaseModels {
    return this.ctx.models;
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────
  async lobby(cityId: string, userId: string): Promise<BattleLobbyDTO> {
    return this.ctx.mutate(cityId, userId, false, async (city, t) => {
      await this.expireStale(city.id, t);
      await this.military.settle(city.id, t);
      const battles = await this.m.BattleInstance.findAll({ where: { cityId: city.id, missionCode: PVE }, order: [['createdAt', 'DESC']], limit: 30, transaction: t });
      const active = battles.find((b) => OPEN.includes(b.status)) ?? null;
      const rewards = await this.m.BattleReward.findAll({ where: { battleId: battles.map((b) => b.id) }, transaction: t });
      const candidates = await this.candidates(city.id, t);
      const ready = candidates.filter((c) => c.available).length;
      const missions: MissionAvailabilityDTO[] = [];
      for (const def of MISSIONS) missions.push(await this.availability(city.id, def.code, Boolean(active), ready, t));
      return {
        missions,
        active: active ? { id: active.id, mission: active.missionCode, phase: active.status, turn: active.state.turn } : null,
        history: battles
          .filter((b) => !OPEN.includes(b.status))
          .slice(0, 10)
          .map((b) => ({
            id: b.id,
            mission: b.missionCode,
            phase: b.status,
            stars: b.outcome?.stars ?? 0,
            claimed: Boolean(rewards.find((r) => r.battleId === b.id)?.claimedAt),
            endedAt: b.endedAt ? new Date(b.endedAt).toISOString() : null,
          })),
        candidates,
        squads: await this.squads(city.id, t),
        serverTime: this.ctx.now().toISOString(),
      };
    });
  }

  private async availability(cityId: string, code: MissionCode, busy: boolean, ready: number, t: Transaction): Promise<MissionAvailabilityDTO> {
    const def = getMission(code);
    const reasons: string[] = [];
    const wins = await this.m.BattleInstance.findAll({ where: { cityId, missionCode: code, status: 'victory' }, order: [['endedAt', 'DESC']], transaction: t });
    if (def.requires && !(await this.m.BattleInstance.count({ where: { cityId, missionCode: def.requires, status: 'victory' }, transaction: t }))) {
      reasons.push(`Cần chiến thắng "${getMission(def.requires).name}" trước`);
    }
    let cooldownUntil: string | null = null;
    const last = wins[0]?.endedAt;
    if (last && ms(last) + def.cooldownMinutes * 60_000 > this.ctx.now().getTime()) {
      cooldownUntil = new Date(ms(last) + def.cooldownMinutes * 60_000).toISOString();
      reasons.push('Đang hồi nhiệm vụ');
    }
    if (busy) reasons.push('Đang có trận chưa kết thúc');
    if (ready < def.minUnits) reasons.push(`Cần ít nhất ${def.minUnits} binh sĩ sẵn sàng (có ${ready})`);
    return { mission: def, available: reasons.length === 0, reasons, cooldownUntil, victories: wins.length, pois: await this.pois(cityId, def.poiKinds, t) };
  }

  /** Phase 10 points of interest (still blocked) that a mission can clear. */
  private async pois(cityId: string, kinds: readonly string[], t: Transaction) {
    const pois = await this.m.WorldPointOfInterest.findAll({ where: { cityId, kind: [...kinds] }, transaction: t });
    if (!pois.length) return [];
    const blocked = await this.m.WorldDiscovery.findAll({ where: { cityId, status: 'blocked' }, transaction: t });
    return pois.filter((p) => blocked.some((d) => d.q === p.q && d.r === p.r)).map((p) => ({ id: p.id, kind: p.kind, q: p.q, r: p.r }));
  }

  private async squads(cityId: string, t: Transaction) {
    const squads = await this.m.MilitarySquad.findAll({ where: { cityId }, order: [['createdAt', 'ASC']], transaction: t });
    const members = squads.length ? await this.m.MilitarySquadMember.findAll({ where: { squadId: squads.map((s) => s.id) }, order: [['position', 'ASC']], transaction: t }) : [];
    return squads.map((s) => ({ id: s.id, name: s.name, members: members.filter((x) => x.squadId === s.id).map((x) => x.unitId) }));
  }

  /** Soldiers and why they can / cannot march out. */
  private candidates(cityId: string, t: Transaction): Promise<BattleCandidateDTO[]> {
    return loadCandidates(this.m, cityId, t);
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  async create(cityId: string, userId: string, input: CreateBattleInput): Promise<BattleDTO> {
    return this.ctx.mutate(cityId, userId, true, async (city, t) => {
      const fingerprint = JSON.stringify({ mission: input.mission, unitIds: [...input.unitIds].sort(), poiId: input.poiId ?? null });
      const prior = await this.m.BattleInstance.findOne({ where: { cityId: city.id, requestKey: input.idempotencyKey }, transaction: t });
      if (prior) {
        // The same request again (double click / retry): the same battle.
        if (prior.fingerprint !== fingerprint || prior.userId !== userId) throw new ConflictError('Khoa yeu cau da duoc dung cho tran khac', 'IDEMPOTENCY_CONFLICT');
        return this.dto(prior, t);
      }
      await this.expireStale(city.id, t);
      if (await this.m.BattleInstance.count({ where: { cityId: city.id, status: OPEN, missionCode: PVE }, transaction: t })) {
        throw new ConflictError('Hay tiep tuc hoac rut lui khoi tran dang mo', 'BATTLE_ACTIVE');
      }
      await this.military.settle(city.id, t);
      const def = getMission(input.mission);
      const cands = await this.candidates(city.id, t);
      const avail = await this.availability(city.id, def.code, false, cands.filter((c) => c.available).length, t);
      const blocking = avail.reasons.filter((r) => !r.startsWith('Cần ít nhất'));
      if (blocking.length) throw new AppError(409, 'MISSION_LOCKED', blocking.join('; '), { reasons: blocking });
      if (new Set(input.unitIds).size !== input.unitIds.length) throw new BadRequestError('Doi hinh co don vi trung', 'INVALID_ROSTER');
      if (input.unitIds.length < def.minUnits || input.unitIds.length > def.maxUnits) {
        throw new BadRequestError(`Nhiem vu can ${def.minUnits}-${def.maxUnits} binh si`, 'INVALID_ROSTER');
      }
      if (input.poiId && !avail.pois.some((p) => p.id === input.poiId)) throw new BadRequestError('Dia diem chua kham pha hoac khong hop nhiem vu', 'POI_INVALID');

      // Roster from real soldiers (validated one by one).
      const { roster } = await buildRoster(this.m, cands, input.unitIds, t);
      const seed = randomInt(1, 2_147_483_646);
      const state = createBattleState(def.code, seed, roster);
      const now = this.ctx.now();
      let battle: BattleInstance;
      try {
        battle = await this.m.BattleInstance.create(
          {
            cityId: city.id,
            userId,
            missionCode: def.code,
            poiId: input.poiId ?? null,
            status: state.phase,
            version: state.version,
            seed,
            state,
            requestKey: input.idempotencyKey,
            fingerprint,
            lastActionAt: now,
            expiresAt: new Date(now.getTime() + BATTLE_ABANDON_HOURS * 3600_000),
          },
          { transaction: t }
        );
      } catch (err) {
        if (err instanceof UniqueConstraintError) throw new ConflictError('Khoa yeu cau da duoc dung', 'IDEMPOTENCY_CONFLICT');
        throw err;
      }
      await this.m.BattleParticipant.create({ battleId: battle.id, userId, side: 'player', joinedAt: now }, { transaction: t });
      await this.m.BattleUnitRecord.bulkCreate(
        state.units.map((u) => ({ battleId: battle.id, unitKey: u.id, militaryUnitId: u.sourceId, side: u.side, kind: u.kind, name: u.name.slice(0, 60), startHp: u.hp, maxHp: u.maxHp })),
        { transaction: t }
      );
      // The soldiers march out (no training / drills / discharge while they fight).
      await this.m.MilitaryUnit.update({ status: 'battle' }, { where: { id: input.unitIds }, transaction: t });
      return this.dto(battle, t);
    });
  }

  // ── Read / reconnect ───────────────────────────────────────────────────────
  async get(battleId: string, userId: string): Promise<BattleDTO> {
    const b = await this.owned(battleId, userId);
    return this.ctx.mutate(b.cityId, userId, false, async (_city, t) => {
      const fresh = await this.owned(battleId, userId, t);
      await this.expireOne(fresh, t);
      return this.dto(fresh, t);
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async act(battleId: string, userId: string, input: BattleActionInput): Promise<BattleDTO> {
    const b = await this.owned(battleId, userId);
    return this.ctx.mutate(b.cityId, userId, true, async (_city, t) => {
      const battle = await this.owned(battleId, userId, t);
      const fingerprint = JSON.stringify(input.action);
      // Reconnect / retry: the same clientActionId returns the stored result, nothing is applied twice.
      const prior = await this.m.BattleActionRecord.findOne({ where: { battleId, clientActionId: input.clientActionId }, transaction: t });
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new ConflictError('Ma hanh dong da duoc dung cho hanh dong khac', 'IDEMPOTENCY_CONFLICT');
        return this.dto(battle, t, prior.events);
      }
      await this.expireOne(battle, t);
      if (!OPEN.includes(battle.status)) throw new ConflictError('Tran da ket thuc', 'BATTLE_FINISHED');
      if (input.expectedVersion !== battle.version) {
        throw new AppError(409, 'STALE_BATTLE', 'Trang thai tran da thay doi; tai lai', { version: [String(battle.version)] });
      }
      let result: { state: BattleState; events: BattleEvent[] };
      try {
        result = applyBattleAction(battle.state, input.action as BattleAction);
      } catch (err) {
        if (err instanceof BattleRuleError) throw new AppError(409, err.code, err.message);
        throw err;
      }
      await this.persist(battle, result.state, input.action as BattleAction, result.events, input.clientActionId, fingerprint, t);
      return this.dto(battle, t, result.events);
    });
  }

  private async persist(battle: BattleInstance, state: BattleState, action: BattleAction, events: BattleEvent[], clientActionId: string, fingerprint: string, t: Transaction): Promise<void> {
    const now = this.ctx.now();
    const prevTurn = battle.state.turn;
    // Optimistic concurrency: only the version we validated may be replaced.
    const [changed] = await this.m.BattleInstance.update(
      {
        state,
        status: state.phase,
        version: state.version,
        lastActionAt: now,
        expiresAt: new Date(now.getTime() + BATTLE_ABANDON_HOURS * 3600_000),
        outcome: state.outcome,
        endedAt: state.outcome ? now : null,
      },
      { where: { id: battle.id, version: battle.version }, transaction: t }
    );
    if (changed !== 1) throw new ConflictError('Trang thai tran da thay doi; tai lai', 'STALE_BATTLE');
    await this.m.BattleActionRecord.create({ battleId: battle.id, seq: state.version, turn: prevTurn, clientActionId, fingerprint, action, events }, { transaction: t });
    // Turn log
    if (action.type === 'start') await this.m.BattleTurn.create({ battleId: battle.id, turn: 1, side: 'player', startedAt: now }, { transaction: t });
    if (action.type === 'end_turn' || state.outcome) {
      await this.m.BattleTurn.update({ endedAt: now }, { where: { battleId: battle.id, turn: prevTurn, side: 'player', endedAt: null }, transaction: t });
    }
    if (action.type === 'end_turn' && events.some((e) => e.type === 'turn' && e.side === 'enemy')) {
      await this.m.BattleTurn.create({ battleId: battle.id, turn: prevTurn, side: 'enemy', startedAt: now, endedAt: now }, { transaction: t });
      if (!state.outcome) await this.m.BattleTurn.create({ battleId: battle.id, turn: state.turn, side: 'player', startedAt: now }, { transaction: t });
    }
    // Live roster snapshot
    for (const u of state.units) {
      await this.m.BattleUnitRecord.update({ endHp: u.hp, ko: u.ko, kills: u.kills }, { where: { battleId: battle.id, unitKey: u.id }, transaction: t });
    }
    await battle.reload({ transaction: t });
    if (state.outcome) await this.settle(battle, t);
  }

  // ── End of battle ──────────────────────────────────────────────────────────
  /** XP, injuries, soldiers home, rewards stored (once). */
  private async settle(battle: BattleInstance, t: Transaction): Promise<void> {
    const [claimed] = await this.m.BattleInstance.update({ settled: true }, { where: { id: battle.id, settled: false }, transaction: t });
    if (claimed !== 1) return;
    const state = battle.state;
    const rewards = battleRewards(state);
    await settleSoldiers(this.m, battle.id, state, rewards, ['player'], t);
    if (state.outcome?.result === 'victory') {
      await this.m.BattleReward.create({ battleId: battle.id, cityId: battle.cityId, rewards, stars: rewards.stars }, { transaction: t });
      for (const hook of this.victoryHooks) await hook(battle.cityId, battle.userId, t);
    }
  }

  private async expireStale(cityId: string, t: Transaction): Promise<void> {
    const open = await this.m.BattleInstance.findAll({ where: { cityId, status: OPEN, missionCode: PVE, expiresAt: { [Op.lte]: this.ctx.now() } }, transaction: t });
    for (const b of open) await this.expireOne(b, t);
  }

  /** Untouched for too long → abandoned (defeat, no rewards, soldiers released). */
  private async expireOne(b: BattleInstance, t: Transaction): Promise<void> {
    if (!OPEN.includes(b.status) || ms(b.expiresAt) > this.ctx.now().getTime()) return;
    const r = abandonBattle(b.state);
    await this.persist(b, r.state, { type: 'retreat' }, r.events, `abandon-${b.id}`.slice(0, 36), 'abandon', t);
  }

  // ── Rewards ────────────────────────────────────────────────────────────────
  async claim(battleId: string, userId: string): Promise<BattleClaimDTO> {
    const b = await this.owned(battleId, userId);
    return this.ctx.mutate(b.cityId, userId, true, async (_city, t) => {
      const battle = await this.owned(battleId, userId, t);
      if (battle.status !== 'victory') throw new ConflictError('Chi nhan thuong khi server xac nhan chien thang', 'NOT_WON');
      const reward = await this.m.BattleReward.findOne({ where: { battleId }, transaction: t });
      if (!reward) throw new NotFoundError('Khong co phan thuong', 'NO_REWARDS');
      // Exactly once: only the request that flips claimed_at from NULL pays.
      const [changed] = await this.m.BattleReward.update({ claimedAt: this.ctx.now() }, { where: { id: reward.id, claimedAt: null }, transaction: t });
      if (changed !== 1) return { battle: await this.dto(battle, t), granted: null };
      await this.grant(battle, reward.rewards, t);
      return { battle: await this.dto(battle, t), granted: reward.rewards };
    });
  }

  private async grant(battle: BattleInstance, r: BattleRewards, t: Transaction): Promise<void> {
    const cityId = battle.cityId;
    await this.ctx.resources.refund(cityId, r.resources, t);
    for (const [code, n] of Object.entries(r.goods)) if (n > 0) await this.stock.add(cityId, code, n, t);
    const now = this.ctx.now();
    for (let i = 0; i < r.survivors; i += 1) {
      const seed = (battle.seed + i * 7919) % 2_147_483_647;
      const who = survivorIdentity(seed);
      await this.m.Survivor.create(
        { cityId, name: who.name, professionCode: null, skills: initialSkills(seed), health: 0.7, stamina: 0.8, satisfaction: 0.65, appearance: who.appearance, origin: 'rescue', seed, assignable: true, arrivedAt: now },
        { transaction: t }
      );
    }
    // Phase 10 link: the cleared point of interest opens for scanning / claiming.
    if (battle.poiId) {
      const poi = await this.m.WorldPointOfInterest.findOne({ where: { id: battle.poiId, cityId }, transaction: t });
      if (poi) {
        await poi.update({ reason: null }, { transaction: t });
        await this.m.WorldDiscovery.update({ status: 'scanned' }, { where: { cityId, q: poi.q, r: poi.r, status: 'blocked' }, transaction: t });
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private async owned(battleId: string, userId: string, t?: Transaction): Promise<BattleInstance> {
    const b = await this.m.BattleInstance.findByPk(battleId, { transaction: t });
    if (!b) throw new NotFoundError('Tran dau khong ton tai', 'BATTLE_NOT_FOUND');
    if (b.userId !== userId) throw new ForbiddenError('Tran dau thuoc nguoi choi khac', 'BATTLE_FORBIDDEN');
    // PvP duels are only reachable through PvpService (both sides, turn checks, Elo).
    if (b.missionCode === 'pvp_duel') throw new ForbiddenError('Tran PvP dung API PvP', 'BATTLE_FORBIDDEN');
    return b;
  }

  private async dto(b: BattleInstance, t: Transaction, events?: BattleEvent[]): Promise<BattleDTO> {
    const reward = await this.m.BattleReward.findOne({ where: { battleId: b.id }, transaction: t });
    const last = events ?? (await this.m.BattleActionRecord.findOne({ where: { battleId: b.id }, order: [['seq', 'DESC']], transaction: t }))?.events ?? [];
    const state = b.state;
    return {
      id: b.id,
      cityId: b.cityId,
      mission: b.missionCode,
      phase: b.status,
      state,
      events: last,
      version: b.version,
      rewards: state.outcome ? (reward?.rewards ?? (state.outcome.result === 'victory' ? battleRewards(state) : null)) : null,
      claimed: Boolean(reward?.claimedAt),
      poiId: b.poiId,
      lastActionAt: new Date(b.lastActionAt).toISOString(),
      expiresAt: new Date(b.expiresAt).toISOString(),
      serverTime: this.ctx.now().toISOString(),
    };
  }
}

