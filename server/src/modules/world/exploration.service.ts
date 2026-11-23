import { randomInt } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import { WorldGenerator, RADAR_RANGES, explorationCost, hexDistance, hexKey, hexNeighbors, isWithinWorldBounds, type ExplorationInput, type ExplorationState, type TerritoryTile } from '@cityverse/shared';
import type { City } from '../../database/models/City.js';
import type { BuildingContext } from '../buildings/building.service.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';

export class ExplorationService {
  constructor(private readonly ctx: BuildingContext) {}

  async personalCity(userId: string): Promise<string> {
    const city = await this.ctx.models.City.findOne({ where: { ownerId: userId } });
    if (!city) throw new NotFoundError('Chưa có lãnh địa', 'WORLD_NOT_FOUND');
    return city.id;
  }

  private async settle(city: City, t: Transaction) {
    const m = this.ctx.models;
    const world = new WorldGenerator(city.worldSeed);
    for (const kind of ['scan', 'claim'] as const) {
      const Model = kind === 'scan' ? m.WorldScanJob : m.WorldClaimJob;
      const jobs = await Model.findAll({ where: { cityId: city.id, status: 'in_progress', finishesAt: { [Op.lte]: this.ctx.now() } }, transaction: t });
      for (const job of jobs) {
        for (const h of job.hexes) {
          if (kind === 'claim') {
            await m.WorldDiscovery.update({ status: 'claimed' }, { where: { cityId: city.id, ...h, status: 'claiming' }, transaction: t });
          } else {
            const tile = world.getHexTile(h.q, h.r);
            // Secret POIs are persisted server-side; public world_seed cannot predict them.
            const roll = randomInt(100);
            const rare = (JSON.parse(job.fingerprint) as { mode: string }).mode === 'rare';
            const special = roll < 3 ? 'enemy_base' : roll < 6 ? 'toxic_zone' : rare && roll < 35 && tile.type === 'forest' ? 'elephant_forest' : rare && roll < 35 && tile.type === 'grassland' ? 'wild_horses' : null;
            const kind = special ?? ({ forest: 'wood_forest', hill: 'stone_mine', low_mountain: 'stone_mine', lake: 'lake', river: 'lake', ruins: 'ruins', farmland: 'farmland' }[tile.type as string] ?? 'meadow');
            const reason = ['enemy_base', 'toxic_zone', 'ruins'].includes(kind) ? 'Cần hoàn thành PvE ở giai đoạn 11 (chưa mở khóa).' : tile.type === 'low_mountain' ? 'Địa hình núi không thể khai phá.' : null;
            await m.WorldPointOfInterest.create({ cityId: city.id, ...h, kind, reason }, { transaction: t });
            await m.WorldDiscovery.create({ cityId: city.id, ...h, status: reason ? 'blocked' : 'scanned' }, { transaction: t });
          }
        }
        await job.update({ status: 'completed' }, { transaction: t });
      }
    }
  }

  private async locked<T>(cityId: string, userId: string, fn: (city: City, t: Transaction) => Promise<T>) {
    return this.ctx.mutate(cityId, userId, true, async (city, t) => {
      // Database lock serializes scans/claims across server processes, not just this process.
      await city.reload({ transaction: t, lock: t.LOCK.UPDATE });
      await this.settle(city, t);
      return fn(city, t);
    });
  }

  async state(cityId: string, userId: string): Promise<ExplorationState> {
    return this.locked(cityId, userId, async (city, t) => {
      const world = new WorldGenerator(city.worldSeed);
      const rows = await this.ctx.models.WorldDiscovery.findAll({ where: { cityId }, transaction: t });
      const pois = await this.ctx.models.WorldPointOfInterest.findAll({ where: { cityId }, transaction: t });
      const byHex = new Map(pois.map(p => [hexKey(p.q, p.r), p]));
      const tiles: TerritoryTile[] = world.getStarterTerritory().map(h => ({ ...h, status: 'claimed', terrain: world.getHexTile(h.q, h.r).type }));
      for (const row of rows) {
        const poi = byHex.get(hexKey(row.q, row.r));
        tiles.push({ q: row.q, r: row.r, status: row.status, terrain: world.getHexTile(row.q, row.r).type, poi: poi?.kind, reason: poi?.reason ?? undefined });
      }
      const radars = await this.ctx.models.WorldBuilding.findAll({ where: { cityId, typeCode: 'radar', status: 'active' }, transaction: t });
      const jobs: ExplorationState['jobs'] = [];
      for (const kind of ['scan', 'claim'] as const) {
        const Model = kind === 'scan' ? this.ctx.models.WorldScanJob : this.ctx.models.WorldClaimJob;
        for (const j of await Model.findAll({ where: { cityId, status: 'in_progress' }, transaction: t })) jobs.push({ id: j.id, kind, hexes: j.hexes, finishesAt: j.finishesAt.toISOString(), status: j.status });
      }
      return { cityId, serverTime: this.ctx.now().toISOString(), tiles, jobs, radars: radars.map(r => ({ id: r.id, q: r.anchorQ, r: r.anchorR, level: r.level, range: RADAR_RANGES[r.level] ?? 12 })) };
    });
  }

  async start(cityId: string, userId: string, kind: 'scan' | 'claim', input: ExplorationInput) {
    return this.locked(cityId, userId, async (city, t) => {
      const m = this.ctx.models;
      const Model = kind === 'scan' ? m.WorldScanJob : m.WorldClaimJob;
      const hexes = [...input.hexes].sort((a, b) => a.q - b.q || a.r - b.r);
      const fingerprint = JSON.stringify({ hexes, radarId: input.radarId, mode: input.mode });
      const existing = await Model.findOne({ where: { cityId, idempotencyKey: input.idempotencyKey }, transaction: t });
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new ConflictError('Khóa yêu cầu đã dùng cho nội dung khác', 'IDEMPOTENCY_CONFLICT');
        return existing;
      }
      if (new Set(hexes.map(h => hexKey(h.q, h.r))).size !== hexes.length || hexes.some(h => !isWithinWorldBounds(h.q, h.r))) throw new BadRequestError('Ô trùng hoặc ngoài thế giới 1000 × 1000', 'INVALID_HEXES');
      const world = new WorldGenerator(city.worldSeed);
      const rows = await m.WorldDiscovery.findAll({ where: { cityId }, transaction: t });
      const byHex = new Map(rows.map(r => [hexKey(r.q, r.r), r]));
      world.setClaims(rows.filter(r => r.status === 'claimed'));
      if (kind === 'scan') {
        const radar = await m.WorldBuilding.findOne({ where: { id: input.radarId ?? '', cityId, typeCode: 'radar', status: 'active' }, transaction: t });
        if (!radar) throw new BadRequestError('Chọn radar đã xây xong', 'RADAR_REQUIRED');
        const required = { directional: 1, area: 2, drone: 3, rare: 3 }[input.mode];
        if (radar.level < required || (input.mode === 'directional' && hexes.length !== 1)) throw new BadRequestError('Chế độ quét chưa mở khóa', 'SCAN_MODE_LOCKED');
        const pending = await m.WorldScanJob.findAll({ where: { cityId, status: 'in_progress' }, transaction: t });
        const reserved = new Set(pending.flatMap(j => j.hexes.map(h => hexKey(h.q, h.r))));
        for (const h of hexes) {
          if (hexDistance({ q: radar.anchorQ, r: radar.anchorR }, h) > (RADAR_RANGES[radar.level] ?? 12) + (input.mode === 'drone' ? 8 : 0)) throw new BadRequestError('Ngoài tầm radar', 'SCAN_OUT_OF_RANGE');
          if (world.isOwned(h.q, h.r) || byHex.has(hexKey(h.q, h.r)) || reserved.has(hexKey(h.q, h.r))) throw new ConflictError('Ô đã quét hoặc đang quét', 'SCAN_DUPLICATE');
        }
      } else {
        for (const h of hexes) if (byHex.get(hexKey(h.q, h.r))?.status !== 'scanned') throw new BadRequestError('Chỉ khai phá đất đã quét và không bị khóa', 'CLAIM_BLOCKED');
        const connected = new Set(world.getOwnedTerritory().map(h => hexKey(h.q, h.r)));
        let remaining = [...hexes];
        while (remaining.length) {
          const next = remaining.filter(h => !hexNeighbors(h).some(n => connected.has(hexKey(n.q, n.r))) || !connected.add(hexKey(h.q, h.r)));
          if (next.length === remaining.length) throw new BadRequestError('Đất phải nối liền lãnh địa', 'CLAIM_DISCONNECTED');
          remaining = next;
        }
      }
      await this.ctx.resources.charge(cityId, explorationCost(kind, hexes.length, input.mode), t);
      const job = await Model.create({ cityId, idempotencyKey: input.idempotencyKey, fingerprint, hexes, status: 'in_progress', finishesAt: new Date(this.ctx.now().getTime() + (kind === 'scan' ? 10 : 20) * 1000) }, { transaction: t });
      if (kind === 'claim') for (const h of hexes) await byHex.get(hexKey(h.q, h.r))!.update({ status: 'claiming' }, { transaction: t });
      return job;
    });
  }
}
