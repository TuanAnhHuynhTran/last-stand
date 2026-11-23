/**
 * Aquaculture gameplay (Phase 6): dig ponds / lakes / hatcheries into the land or anchor fish
 * cages on natural water, fill them, stock fry, feed, follow growth and water quality, harvest.
 *
 *  - Land: each water body owns a world_buildings row + building_footprints (one land-claim
 *    system); its level and upgrades go through the shared construction queue.
 *  - Terrain: the water surface / bed heights are planned from the SEED terrain (shared
 *    planPondLevels) and stored with every hex's seed and dug height, so the client re-applies
 *    exactly the same carve on top of the world seed.
 *  - Time: water bodies are simulated from `last_simulated_at` to now before any read / write.
 *  - Harvest: each batch flips growing → harvested with a conditional UPDATE inside the city
 *    lock, so a harvest is paid once.
 */
import { Op, UniqueConstraintError, type Transaction } from 'sequelize';
import {
  DEMOLISH_REFUND_RATE,
  FISH_FEED_DEFINITIONS,
  FISH_SPECIES_DEFINITIONS,
  FISH_STOCK_CODES,
  FRY_STOCK_CODES,
  HEX_DIRECTIONS,
  MIN_STOCKING_WATER,
  POND_PREPARE_SECONDS,
  addFishFeed,
  addResources,
  axialToWorld,
  checkWaterBodyShape,
  carveHeight,
  emptyResources,
  fishCount,
  fishFeedCapacity,
  fishStage,
  fishStockCode,
  fryStockCode,
  getFishFeed,
  getFishSpecies,
  getWaterBodyDefinition,
  getWaterBodyLevel,
  harvestYield,
  hexKey,
  measurePond,
  planPondLevels,
  pondDensity,
  pondOccupant,
  simulateAquaculture,
  waterBodyCapacity,
  waterBodyCreateCost,
  waterBodyExpandCost,
  waterBodyLevel,
  waterBodyUpgradeCost,
  waterFillCost,
  waterFillSeconds,
  PondEditLayer,
  type AquaSimState,
  type AquacultureMutationResultDTO,
  type AquacultureStateDTO,
  type AxialCoord,
  type CreateWaterBodyInput,
  type ExpandWaterBodyInput,
  type FeedFishInput,
  type ProduceCode,
  type StockFishInput,
  type WaterBodyDTO,
  type WaterBodyStatus,
} from '@cityverse/shared';
import type { City } from '../../database/models/City.js';
import type { BuildingConstructionJob, WorldBuilding } from '../../database/models/Building.js';
import type {
  AquacultureCycle,
  FishStockBatch,
  WaterBody,
  WaterBodyTile,
  WaterQualityRecord,
} from '../../database/models/Aquaculture.js';
import type { DatabaseModels } from '../../database/models/index.js';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { BuildingUpgradeService, type BuildingContext } from '../buildings/building.service.js';
import { getWorldForCity } from '../buildings/buildingSupport.js';
import { ProduceService } from '../farming/farm.service.js';

/** Quality history kept per water body. */
const MAX_RECORDS = 48;
const ms = (d: Date | string): number => new Date(d).getTime();
const round = (v: number, k = 1000): number => Math.round(v * k) / k;

/** Seeds fish_species from @cityverse/shared (outside the city transaction). */
class FishCatalogService {
  private ready: Promise<void> | null = null;

  constructor(private readonly models: DatabaseModels) {}

  ensureCatalog(): Promise<void> {
    this.ready ??= this.models.sequelize
      .transaction(async (transaction) => {
        for (const f of FISH_SPECIES_DEFINITIONS) {
          await this.models.FishSpecies.upsert(
            {
              code: f.code,
              name: f.name,
              description: f.description,
              fryPrice: f.fryPrice,
              fryWeight: f.fryWeight,
              marketWeight: f.marketWeight,
              fingerlingWeight: f.fingerlingWeight,
              growSeconds: f.growSeconds,
              feedRate: f.feedRate,
              minQuality: f.minQuality,
              colors: { ...f.colors },
            },
            { transaction }
          );
        }
      })
      .catch((err: unknown) => {
        this.ready = null;
        throw err;
      });
    return this.ready;
  }
}

interface Bundle {
  body: WaterBody;
  building: WorldBuilding;
  tiles: WaterBodyTile[];
  batches: FishStockBatch[];
  cycle: AquacultureCycle | null;
  records: WaterQualityRecord[];
  upgradeJob: BuildingConstructionJob | null;
}

export class AquacultureService {
  private readonly catalog: FishCatalogService;
  private readonly stock: ProduceService;
  private readonly upgrades: BuildingUpgradeService;

  constructor(private readonly ctx: BuildingContext) {
    this.catalog = new FishCatalogService(ctx.models);
    this.stock = new ProduceService(ctx.models);
    this.upgrades = new BuildingUpgradeService(ctx);
  }

  private get models(): DatabaseModels {
    return this.ctx.models;
  }

  /** Access check (owner / editor) + per-city lock + transaction + settlement. */
  private async mutate<T>(
    cityId: string,
    userId: string,
    requireEdit: boolean,
    fn: (city: City, t: Transaction) => Promise<T>
  ): Promise<T> {
    await this.catalog.ensureCatalog();
    return this.ctx.mutate(cityId, userId, requireEdit, async (city, t) => {
      await this.settleCity(cityId, t);
      return fn(city, t);
    });
  }

  // ── Settlement ─────────────────────────────────────────────────────────────
  async settleCity(cityId: string, t: Transaction): Promise<void> {
    const bodies = await this.models.WaterBody.findAll({ where: { cityId }, transaction: t });
    for (const body of bodies) await this.settleBody(body, t);
    await this.upgrades.settleJobs(cityId, t);
  }

  private async settleBody(body: WaterBody, t: Transaction): Promise<void> {
    const now = this.ctx.now().getTime();
    const from = ms(body.lastSimulatedAt);
    if (now <= from) return;
    const building = await this.models.WorldBuilding.findByPk(body.buildingId, { transaction: t });
    if (!building) return;
    const [hexCount, batches, upgradeJobs] = await Promise.all([
      this.models.WaterBodyTile.count({ where: { waterBodyId: body.id }, transaction: t }),
      this.models.FishStockBatch.findAll({
        where: { waterBodyId: body.id, status: 'growing' },
        transaction: t,
      }),
      this.models.BuildingConstructionJob.findAll({
        where: {
          buildingId: building.id,
          jobType: 'upgrade',
          status: ['in_progress', 'completed'],
          finishesAt: { [Op.gt]: new Date(from), [Op.lte]: new Date(now) },
        },
        order: [['finishesAt', 'ASC']],
        transaction: t,
      }),
    ]);
    const state: AquaSimState = {
      type: body.type,
      level: upgradeJobs.length ? upgradeJobs[0].fromLevel : building.level,
      hexCount,
      waterLevel: body.waterLevel,
      quality: body.waterQuality,
      feedStock: body.feedStock,
      feedQuality: body.feedQuality,
      fill:
        body.fillStartedAt && body.fillFinishesAt
          ? { startedAtMs: ms(body.fillStartedAt), finishesAtMs: ms(body.fillFinishesAt) }
          : null,
      batches: batches.map((b) => ({
        id: b.id,
        species: b.speciesCode,
        alive: b.alive,
        weight: b.weight,
        health: b.health,
        satiety: b.satiety,
      })),
    };
    const res = simulateAquaculture(
      state,
      from,
      now,
      upgradeJobs.map((j) => ({ atMs: ms(j.finishesAt), level: j.targetLevel }))
    );
    for (const row of batches) {
      const b = res.state.batches.find((x) => x.id === row.id);
      if (!b) continue;
      await row.update(
        {
          alive: b.alive,
          weight: b.weight,
          health: b.health,
          satiety: b.satiety,
          status: b.alive < 0.5 ? 'dead' : 'growing',
        },
        { transaction: t }
      );
    }
    if (res.feedUsed > 0) {
      const cycle = await this.activeCycle(body.id, t);
      if (cycle)
        await cycle.update({ feedUsed: cycle.feedUsed + res.feedUsed }, { transaction: t });
    }
    // Short spans between requests: still sample once the last record is a minute old.
    if (!res.records.length) {
      const last = await this.models.WaterQualityRecord.findOne({
        where: { waterBodyId: body.id },
        order: [['recordedAt', 'DESC']],
        transaction: t,
      });
      if (!last || res.simulatedToMs - ms(last.recordedAt) >= 60_000) {
        const s = res.state;
        res.records.push({
          atMs: res.simulatedToMs,
          quality: round(s.quality),
          waterLevel: round(s.waterLevel),
          density: round(pondDensity(s)),
          feedStock: round(s.feedStock, 10),
        });
      }
    }
    if (res.records.length) {
      await this.models.WaterQualityRecord.bulkCreate(
        res.records.map((r) => ({
          cityId: body.cityId,
          waterBodyId: body.id,
          recordedAt: new Date(r.atMs),
          quality: r.quality,
          waterLevel: r.waterLevel,
          density: r.density,
          feedStock: r.feedStock,
        })),
        { transaction: t }
      );
      await this.trimRecords(body.id, t);
    }
    await body.update(
      {
        waterLevel: res.state.waterLevel,
        waterQuality: res.state.quality,
        feedStock: res.state.feedStock,
        feedQuality: res.state.feedQuality,
        fillStartedAt: res.state.fill ? body.fillStartedAt : null,
        fillFinishesAt: res.state.fill ? body.fillFinishesAt : null,
        lastSimulatedAt: new Date(res.simulatedToMs),
      },
      { transaction: t }
    );
  }

  private async trimRecords(waterBodyId: string, t: Transaction): Promise<void> {
    const old = await this.models.WaterQualityRecord.findAll({
      where: { waterBodyId },
      order: [['recordedAt', 'DESC']],
      offset: MAX_RECORDS,
      attributes: ['id'],
      transaction: t,
    });
    if (old.length)
      await this.models.WaterQualityRecord.destroy({
        where: { id: old.map((r) => r.id) },
        transaction: t,
      });
  }

  private async record(body: WaterBody, t: Transaction): Promise<void> {
    const [batches, hexCount, building] = await Promise.all([
      this.models.FishStockBatch.findAll({
        where: { waterBodyId: body.id, status: 'growing' },
        transaction: t,
      }),
      this.models.WaterBodyTile.count({ where: { waterBodyId: body.id }, transaction: t }),
      this.loadBuildingOf(body, t),
    ]);
    await this.models.WaterQualityRecord.create(
      {
        cityId: body.cityId,
        waterBodyId: body.id,
        recordedAt: this.ctx.now(),
        quality: round(body.waterQuality),
        waterLevel: round(body.waterLevel),
        density: round(
          pondDensity({
            type: body.type,
            level: building.level,
            hexCount,
            batches: batches.map((b) => ({
              id: b.id,
              species: b.speciesCode,
              alive: b.alive,
              weight: b.weight,
              health: b.health,
              satiety: b.satiety,
            })),
          })
        ),
        feedStock: round(body.feedStock, 10),
      },
      { transaction: t }
    );
    await this.trimRecords(body.id, t);
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  async getState(cityId: string, userId: string): Promise<AquacultureStateDTO> {
    return this.mutate(cityId, userId, false, async (_city, t) => {
      const bodies = await this.models.WaterBody.findAll({
        where: { cityId },
        order: [['createdAt', 'ASC']],
        transaction: t,
      });
      const list: WaterBodyDTO[] = [];
      for (const b of bodies) list.push(this.toDTO(await this.bundle(b, t)));
      return {
        waterBodies: list,
        ...(await this.stocks(cityId, t)),
        serverTime: this.ctx.now().toISOString(),
      };
    });
  }

  async getOne(
    cityId: string,
    waterBodyId: string,
    userId: string
  ): Promise<AquacultureMutationResultDTO> {
    return this.mutate(cityId, userId, false, async (_city, t) =>
      this.result(cityId, await this.loadBody(cityId, waterBodyId, t), t)
    );
  }

  async getCatalog() {
    await this.catalog.ensureCatalog();
    const species = await this.models.FishSpecies.findAll({ order: [['code', 'ASC']] });
    return { species: species.map((s) => s.get({ plain: true })) };
  }

  // ── Land / terrain ─────────────────────────────────────────────────────────
  async create(
    cityId: string,
    userId: string,
    input: CreateWaterBodyInput
  ): Promise<AquacultureMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const world = await getWorldForCity(this.ctx.models, city, t);
      const check = checkWaterBodyShape(
        world,
        input.type,
        input.hexes,
        await this.ctx.occupiedMap(cityId, t),
        {
          baseHeight: (x, z) => world.terrain.heightAt(x, z),
          ownedHexes: world.getStarterTerritory(),
        }
      );
      if (!check.valid)
        throw new BadRequestError('Vung dao ao khong hop le', 'INVALID_WATER_BODY', {
          issues: check.issues,
        });
      const cost = waterBodyCreateCost(input.type, input.hexes.length);
      await this.ctx.resources.charge(cityId, cost, t);
      const def = getWaterBodyDefinition(input.type);
      const building = await this.models.WorldBuilding.create(
        {
          cityId,
          typeCode: input.type,
          level: 1,
          status: 'active',
          anchorQ: input.hexes[0].q,
          anchorR: input.hexes[0].r,
          rotation: 0,
          createdBy: userId,
          invested: cost,
        },
        { transaction: t }
      );
      await this.writeFootprint(cityId, building.id, input.hexes, t);
      const body = await this.models.WaterBody.create(
        {
          cityId,
          buildingId: building.id,
          type: input.type,
          surfaceHeight: 0,
          bottomHeight: 0,
          area: 0,
          volume: 0,
          shoreline: 0,
          // A freshly dug pond is dry; cages float on water that is already there.
          waterLevel: def.dug ? 0 : 1,
          waterQuality: waterBodyLevel(input.type, 1).baseQuality,
          lastSimulatedAt: this.ctx.now(),
        },
        { transaction: t }
      );
      await this.reshape(body, input.hexes, city, t);
      await this.record(body, t);
      return this.result(cityId, body, t);
    });
  }

  /** Adds connected hexes: water merges, the shoreline is rebuilt for the whole shape. */
  async expand(
    cityId: string,
    waterBodyId: string,
    userId: string,
    input: ExpandWaterBodyInput
  ): Promise<AquacultureMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const body = await this.loadBody(cityId, waterBodyId, t);
      const building = await this.loadBuildingOf(body, t);
      if (building.status !== 'active')
        throw new ConflictError('Ao dang nang cap', 'WATER_BODY_BUSY');
      const tiles = await this.models.WaterBodyTile.findAll({
        where: { waterBodyId: body.id },
        transaction: t,
      });
      const world = await getWorldForCity(this.ctx.models, city, t);
      const check = checkWaterBodyShape(
        world,
        body.type,
        input.hexes,
        await this.ctx.occupiedMap(cityId, t),
        {
          baseHexes: tiles,
          selfOccupant: pondOccupant(body.id),
          baseHeight: (x, z) => world.terrain.heightAt(x, z),
          ownedHexes: world.getStarterTerritory(),
        }
      );
      if (!check.valid)
        throw new BadRequestError('Vung mo rong khong hop le', 'INVALID_WATER_BODY', {
          issues: check.issues,
        });
      const cost = waterBodyExpandCost(body.type, building.level, input.hexes.length);
      await this.ctx.resources.charge(cityId, cost, t);
      await this.writeFootprint(cityId, building.id, input.hexes, t);
      await building.update(
        { invested: addResources(building.invested, cost) },
        { transaction: t }
      );
      // The new part is dry: the stored water spreads over the bigger volume.
      const oldVolume = body.volume * body.waterLevel;
      await this.reshape(
        body,
        [...tiles.map((x) => ({ q: x.q, r: x.r })), ...input.hexes],
        city,
        t
      );
      if (getWaterBodyDefinition(body.type).dug) {
        await body.update(
          { waterLevel: body.volume > 0 ? Math.min(1, oldVolume / body.volume) : 0 },
          { transaction: t }
        );
      }
      return this.result(cityId, body, t);
    });
  }

  /** Levels, metrics and tiles for the (whole) shape — upgrades never call this, so the shape is kept. */
  private async reshape(
    body: WaterBody,
    hexes: readonly AxialCoord[],
    city: City,
    t: Transaction
  ): Promise<void> {
    const world = await getWorldForCity(this.ctx.models, city, t);
    const baseHeight = (x: number, z: number) => world.terrain.heightAt(x, z);
    const def = getWaterBodyDefinition(body.type);
    const levels = planPondLevels(baseHeight, hexes, body.type);
    const spec = {
      id: body.id,
      hexes,
      surface: levels.surface,
      bottom: levels.bottom,
      dug: def.dug,
    };
    const m = measurePond(baseHeight, spec);
    const layer = new PondEditLayer();
    layer.setPonds([spec]);
    const keys = new Set(hexes.map((h) => hexKey(h.q, h.r)));
    await this.models.WaterBodyTile.destroy({ where: { waterBodyId: body.id }, transaction: t });
    await this.models.WaterBodyTile.bulkCreate(
      hexes.map((h) => {
        const c = axialToWorld(h.q, h.r);
        const original = baseHeight(c.x, c.z);
        const d = Math.min(4.5, layer.borderDistance(c.x, c.z));
        return {
          cityId: body.cityId,
          waterBodyId: body.id,
          q: h.q,
          r: h.r,
          originalHeight: round(original, 1000),
          bedHeight: round(
            def.dug ? carveHeight(original, d, levels.bottom, c.x, c.z) : original,
            1000
          ),
          shore: HEX_DIRECTIONS.some((dir) => !keys.has(hexKey(h.q + dir.q, h.r + dir.r))),
        };
      }),
      { transaction: t }
    );
    await body.update(
      {
        surfaceHeight: levels.surface,
        bottomHeight: levels.bottom,
        area: m.area,
        volume: m.volume,
        shoreline: m.shoreline,
      },
      { transaction: t }
    );
  }

  async upgrade(
    cityId: string,
    waterBodyId: string,
    userId: string
  ): Promise<AquacultureMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const body = await this.loadBody(cityId, waterBodyId, t);
      const building = await this.loadBuildingOf(body, t);
      if (building.status !== 'active')
        throw new ConflictError('Ao dang nang cap', 'WATER_BODY_BUSY');
      const next = getWaterBodyLevel(body.type, building.level + 1);
      if (!next) throw new BadRequestError('Ao da dat cap toi da', 'MAX_LEVEL_REACHED');
      await this.ctx.assertJobSlot(cityId, t);
      const hexes = await this.models.WaterBodyTile.count({
        where: { waterBodyId: body.id },
        transaction: t,
      });
      const cost = waterBodyUpgradeCost(body.type, next.level, hexes)!;
      await this.ctx.resources.charge(cityId, cost, t);
      const now = this.ctx.now();
      await building.update(
        { status: 'upgrading', invested: addResources(building.invested, cost) },
        { transaction: t }
      );
      await this.models.BuildingConstructionJob.create(
        {
          cityId,
          buildingId: building.id,
          jobType: 'upgrade',
          fromLevel: building.level,
          targetLevel: next.level,
          cost,
          startedAt: now,
          finishesAt: new Date(now.getTime() + next.upgradeSeconds * 1000),
          status: 'in_progress',
        },
        { transaction: t }
      );
      return this.result(cityId, body, t);
    });
  }

  async remove(
    cityId: string,
    waterBodyId: string,
    userId: string
  ): Promise<AquacultureMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const body = await this.loadBody(cityId, waterBodyId, t);
      const building = await this.loadBuildingOf(body, t);
      const job = await this.ctx.activeJob(building.id, t);
      const pending = job ? job.cost : emptyResources();
      const refund = addResources(
        pending,
        addResources(building.invested, pending, -1),
        DEMOLISH_REFUND_RATE
      );
      const where = { waterBodyId: body.id };
      await this.models.WaterQualityRecord.destroy({ where, transaction: t });
      await this.models.FishStockBatch.destroy({ where, transaction: t });
      await this.models.AquacultureCycle.destroy({ where, transaction: t });
      await this.models.WaterBodyTile.destroy({ where, transaction: t });
      await body.destroy({ transaction: t });
      await this.models.BuildingConstructionJob.destroy({
        where: { buildingId: building.id },
        transaction: t,
      });
      await this.models.BuildingFootprint.destroy({
        where: { buildingId: building.id },
        transaction: t,
      });
      await building.destroy({ transaction: t });
      await this.ctx.resources.refund(cityId, refund, t);
      return this.result(cityId, null, t);
    });
  }

  // ── Water, fish, feed ──────────────────────────────────────────────────────
  /** Pumps water into a dug pond (timed). */
  async fill(
    cityId: string,
    waterBodyId: string,
    userId: string
  ): Promise<AquacultureMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const body = await this.loadBody(cityId, waterBodyId, t);
      if (!getWaterBodyDefinition(body.type).dug)
        throw new BadRequestError('Long ca dung tren mat nuoc tu nhien', 'NATURAL_WATER');
      if (body.fillFinishesAt) throw new ConflictError('Ao dang duoc cap nuoc', 'ALREADY_FILLING');
      if (body.waterLevel >= 0.99) throw new ConflictError('Ao da day nuoc', 'WATER_FULL');
      const hexes = await this.models.WaterBodyTile.count({
        where: { waterBodyId: body.id },
        transaction: t,
      });
      await this.ctx.resources.charge(
        cityId,
        {
          coins: Math.ceil(waterFillCost(body.type, hexes) * (1 - body.waterLevel)),
          wood: 0,
          stone: 0,
        },
        t
      );
      const now = this.ctx.now().getTime();
      const seconds = Math.max(3, waterFillSeconds(body.type, hexes) * (1 - body.waterLevel));
      // Fill from the current level: start is shifted back so the linear ramp continues smoothly.
      const total = waterFillSeconds(body.type, hexes) * 1000;
      await body.update(
        {
          fillStartedAt: new Date(now - body.waterLevel * total),
          fillFinishesAt: new Date(now + seconds * 1000),
        },
        { transaction: t }
      );
      return this.result(cityId, body, t);
    });
  }

  /** Releases fry bought at the market or raised in the city's hatcheries. */
  async stockFish(
    cityId: string,
    waterBodyId: string,
    userId: string,
    input: StockFishInput
  ): Promise<AquacultureMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const body = await this.loadBody(cityId, waterBodyId, t);
      const building = await this.loadBuildingOf(body, t);
      const now = this.ctx.now();
      if (body.waterLevel < MIN_STOCKING_WATER)
        throw new ConflictError('Ao chua du nuoc de tha ca', 'NOT_ENOUGH_WATER');
      if (body.readyAt && ms(body.readyAt) > now.getTime())
        throw new ConflictError('Ao dang duoc ve sinh cho vu moi', 'POND_PREPARING');
      const [hexes, batches] = await Promise.all([
        this.models.WaterBodyTile.count({ where: { waterBodyId: body.id }, transaction: t }),
        this.models.FishStockBatch.findAll({
          where: { waterBodyId: body.id, status: 'growing' },
          transaction: t,
        }),
      ]);
      const cap = waterBodyCapacity(body.type, building.level, hexes);
      if (Math.floor(fishCount(batches)) + input.count > cap)
        throw new ConflictError(`Ao chi chua duoc ${cap} con`, 'POND_FULL');
      const species = getFishSpecies(input.species);
      if (input.source === 'hatchery') {
        const code = fryStockCode(input.species);
        const have = (await this.stock.getAmounts(cityId, [code], t))[code];
        if (have < input.count)
          throw new ConflictError('Khong du ca giong tu khu uom', 'NOT_ENOUGH_FRY');
        await this.stock.add(cityId, code, -input.count, t);
      } else {
        await this.ctx.resources.charge(
          cityId,
          { coins: species.fryPrice * input.count, wood: 0, stone: 0 },
          t
        );
      }
      let cycle = await this.activeCycle(body.id, t);
      cycle ??= await this.models.AquacultureCycle.create(
        { cityId, waterBodyId: body.id, status: 'active', startedAt: now, harvested: {} },
        { transaction: t }
      );
      await cycle.update({ stockedFish: cycle.stockedFish + input.count }, { transaction: t });
      await this.models.FishStockBatch.create(
        {
          cityId,
          waterBodyId: body.id,
          cycleId: cycle.id,
          speciesCode: input.species,
          source: input.source,
          stocked: input.count,
          alive: input.count,
          // Hatchery fingerlings start bigger than market fry.
          weight: input.source === 'hatchery' ? species.fingerlingWeight : species.fryWeight,
          health: 1,
          satiety: 0.7,
          status: 'growing',
          stockedAt: now,
        },
        { transaction: t }
      );
      await this.record(body, t);
      return this.result(cityId, body, t);
    });
  }

  /** Pours fish feed made from city produce into the pond's feeder. */
  async feed(
    cityId: string,
    waterBodyId: string,
    userId: string,
    input: FeedFishInput
  ): Promise<AquacultureMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const body = await this.loadBody(cityId, waterBodyId, t);
      const building = await this.loadBuildingOf(body, t);
      const hexes = await this.models.WaterBodyTile.count({
        where: { waterBodyId: body.id },
        transaction: t,
      });
      const cap = fishFeedCapacity(body.type, building.level, hexes);
      const feed = getFishFeed(input.feedCode);
      if (body.feedStock + feed.kg * input.batches > cap + 1e-6) {
        throw new AppError(409, 'FEED_STORAGE_FULL', 'May cho an khong du cho', {
          maxBatches: [String(Math.max(0, Math.floor((cap - body.feedStock) / feed.kg)))],
        });
      }
      const need: Partial<Record<ProduceCode, number>> = {};
      for (const [c, n] of Object.entries(feed.ingredients) as [ProduceCode, number][])
        need[c] = n * input.batches;
      await this.stock.consume(cityId, need, t);
      const next = addFishFeed(body.feedStock, body.feedQuality, input.feedCode, input.batches);
      await body.update({ feedStock: next.stock, feedQuality: next.quality }, { transaction: t });
      return this.result(cityId, body, t);
    });
  }

  /** Harvests every batch that reached its target weight — each batch exactly once. */
  async harvest(
    cityId: string,
    waterBodyId: string,
    userId: string
  ): Promise<AquacultureMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const body = await this.loadBody(cityId, waterBodyId, t);
      const harvested = (await this.harvestInTx(body, t, true)) ?? {};
      return { ...(await this.result(cityId, body, t)), harvested };
    });
  }

  /**
   * Fishers at work (Phase 7): keep the feeder topped up from city produce (cheapest feed that
   * is in stock) and, at level 2+, harvest grown batches into storage. Inside the caller's lock.
   */
  async autoTend(
    cityId: string,
    bodyIds: readonly string[],
    t: Transaction
  ): Promise<Record<string, number>> {
    await this.settleCity(cityId, t);
    const total: Record<string, number> = {};
    for (const id of bodyIds) {
      const body = await this.models.WaterBody.findOne({ where: { id, cityId }, transaction: t });
      if (!body) continue;
      const building = await this.loadBuildingOf(body, t);
      const hexes = await this.models.WaterBodyTile.count({
        where: { waterBodyId: body.id },
        transaction: t,
      });
      const cap = fishFeedCapacity(body.type, building.level, hexes);
      const fish = await this.models.FishStockBatch.count({
        where: { waterBodyId: body.id, status: 'growing' },
        transaction: t,
      });
      if (fish && body.feedStock < cap * 0.25) {
        const produce = await this.stock.getBag(cityId, t);
        for (const feed of FISH_FEED_DEFINITIONS) {
          const byStock = Math.min(
            ...(Object.entries(feed.ingredients) as [ProduceCode, number][]).map(([c, n]) =>
              Math.floor(produce[c] / n)
            )
          );
          const batches = Math.min(byStock, Math.floor((cap * 0.8 - body.feedStock) / feed.kg));
          if (batches < 1) continue;
          const need: Partial<Record<ProduceCode, number>> = {};
          for (const [c, n] of Object.entries(feed.ingredients) as [ProduceCode, number][])
            need[c] = n * batches;
          await this.stock.consume(cityId, need, t);
          const next = addFishFeed(body.feedStock, body.feedQuality, feed.code, batches);
          await body.update(
            { feedStock: next.stock, feedQuality: next.quality },
            { transaction: t }
          );
          break;
        }
      }
      if (building.level >= 2) {
        for (const [c, n] of Object.entries((await this.harvestInTx(body, t, false)) ?? {}))
          total[c] = (total[c] ?? 0) + n;
      }
    }
    return total;
  }

  private async harvestInTx(
    body: WaterBody,
    t: Transaction,
    strict: boolean
  ): Promise<Record<string, number> | null> {
    const cityId = body.cityId;
    const building = await this.loadBuildingOf(body, t);
    const batches = await this.models.FishStockBatch.findAll({
      where: { waterBodyId: body.id, status: 'growing' },
      transaction: t,
    });
    const ready = batches.filter(
      (b) => fishStage(body.type, { species: b.speciesCode, weight: b.weight }) === 'harvestable'
    );
    if (!ready.length) {
      if (!strict) return null;
      if (batches.length) throw new ConflictError('Ca chua du lon de thu hoach', 'FISH_NOT_READY');
      throw new ConflictError('Ao chua co ca', 'NO_FISH');
    }
    const now = this.ctx.now();
    const hatchery = getWaterBodyDefinition(body.type).hatchery;
    const harvested: Record<string, number> = {};
    for (const b of ready) {
      const amount = harvestYield(body.type, building.level, body.waterQuality, {
        species: b.speciesCode,
        alive: b.alive,
        weight: b.weight,
      });
      const [changed] = await this.models.FishStockBatch.update(
        { status: 'harvested', harvestedAt: now, harvestYield: amount },
        { where: { id: b.id, status: 'growing' }, transaction: t }
      );
      if (changed !== 1) continue;
      const code = hatchery ? fryStockCode(b.speciesCode) : fishStockCode(b.speciesCode);
      harvested[code] = (harvested[code] ?? 0) + amount;
    }
    for (const [code, n] of Object.entries(harvested)) await this.stock.add(cityId, code, n, t);
    const total = Object.values(harvested).reduce((s, n) => s + n, 0);
    await body.update({ totalHarvested: body.totalHarvested + total }, { transaction: t });
    const cycle = await this.activeCycle(body.id, t);
    if (cycle) {
      const sum = { ...cycle.harvested };
      for (const [c, n] of Object.entries(harvested)) sum[c] = (sum[c] ?? 0) + n;
      const left = await this.models.FishStockBatch.count({
        where: { waterBodyId: body.id, status: 'growing' },
        transaction: t,
      });
      await cycle.update(
        left ? { harvested: sum } : { harvested: sum, status: 'harvested', harvestedAt: now },
        { transaction: t }
      );
      // Pond is drained, cleaned and limed before the next cycle.
      if (!left)
        await body.update(
          { readyAt: new Date(now.getTime() + POND_PREPARE_SECONDS * 1000) },
          { transaction: t }
        );
    }
    await this.record(body, t);
    return harvested;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private async loadBody(cityId: string, id: string, t: Transaction): Promise<WaterBody> {
    const body = await this.models.WaterBody.findOne({ where: { id, cityId }, transaction: t });
    if (!body) throw new NotFoundError('Ao khong ton tai', 'WATER_BODY_NOT_FOUND');
    return body;
  }

  private async loadBuildingOf(body: WaterBody, t: Transaction): Promise<WorldBuilding> {
    const b = await this.models.WorldBuilding.findByPk(body.buildingId, { transaction: t });
    if (!b) throw new NotFoundError('Ao khong ton tai', 'WATER_BODY_NOT_FOUND');
    return b;
  }

  private activeCycle(waterBodyId: string, t: Transaction): Promise<AquacultureCycle | null> {
    return this.models.AquacultureCycle.findOne({
      where: { waterBodyId, status: 'active' },
      transaction: t,
    });
  }

  private async writeFootprint(
    cityId: string,
    buildingId: string,
    hexes: readonly AxialCoord[],
    t: Transaction
  ): Promise<void> {
    try {
      await this.models.BuildingFootprint.bulkCreate(
        hexes.map((h) => ({ cityId, buildingId, q: h.q, r: h.r })),
        { transaction: t }
      );
    } catch (err) {
      if (err instanceof UniqueConstraintError)
        throw new ConflictError('O hex da co cong trinh khac', 'HEX_OCCUPIED');
      throw err;
    }
  }

  private async bundle(body: WaterBody, t: Transaction): Promise<Bundle> {
    await body.reload({ transaction: t });
    const building = await this.loadBuildingOf(body, t);
    const cycle = await this.activeCycle(body.id, t);
    const [tiles, batches, records, upgradeJob] = await Promise.all([
      this.models.WaterBodyTile.findAll({
        where: { waterBodyId: body.id },
        order: [
          ['q', 'ASC'],
          ['r', 'ASC'],
        ],
        transaction: t,
      }),
      this.models.FishStockBatch.findAll({
        where: { waterBodyId: body.id, status: 'growing' },
        order: [['stockedAt', 'ASC']],
        transaction: t,
      }),
      this.models.WaterQualityRecord.findAll({
        where: { waterBodyId: body.id },
        order: [['recordedAt', 'DESC']],
        limit: 12,
        transaction: t,
      }),
      this.ctx.activeJob(building.id, t),
    ]);
    return { body, building, tiles, batches, cycle, records, upgradeJob };
  }

  private toDTO({
    body,
    building,
    tiles,
    batches,
    cycle,
    records,
    upgradeJob,
  }: Bundle): WaterBodyDTO {
    const level = building.level;
    const def = getWaterBodyDefinition(body.type);
    const now = this.ctx.now().getTime();
    const sims = batches.map((b) => ({
      id: b.id,
      species: b.speciesCode,
      alive: b.alive,
      weight: b.weight,
      health: b.health,
      satiety: b.satiety,
    }));
    let status: WaterBodyStatus = 'active';
    if (building.status === 'upgrading') status = 'upgrading';
    else if (body.fillFinishesAt) status = 'filling';
    else if (def.dug && body.waterLevel < 0.05) status = 'dry';
    else if (body.readyAt && ms(body.readyAt) > now) status = 'preparing';
    const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
    return {
      id: body.id,
      buildingId: building.id,
      cityId: body.cityId,
      type: body.type,
      name: def.name,
      level,
      status,
      upgradeStartedAt: iso(upgradeJob?.startedAt),
      upgradeFinishesAt: iso(upgradeJob?.finishesAt),
      hexes: tiles.map((x) => ({ q: x.q, r: x.r })),
      surfaceHeight: body.surfaceHeight,
      bottomHeight: body.bottomHeight,
      area: body.area,
      volume: body.volume,
      shoreline: body.shoreline,
      waterLevel: round(body.waterLevel),
      waterQuality: round(body.waterQuality),
      feedStock: round(body.feedStock, 10),
      feedCapacity: fishFeedCapacity(body.type, level, tiles.length),
      feedQuality: round(body.feedQuality),
      fillStartedAt: iso(body.fillStartedAt),
      fillFinishesAt: iso(body.fillFinishesAt),
      readyAt: iso(body.readyAt),
      capacity: waterBodyCapacity(body.type, level, tiles.length),
      fishCount: Math.floor(fishCount(sims) + 1e-6),
      density: round(
        pondDensity({ type: body.type, level, hexCount: tiles.length, batches: sims })
      ),
      batches: batches.map((b) => ({
        id: b.id,
        species: b.speciesCode,
        stocked: b.stocked,
        alive: Math.floor(b.alive + 1e-6),
        weight: round(b.weight),
        health: round(b.health),
        satiety: round(b.satiety),
        stage: fishStage(body.type, { species: b.speciesCode, weight: b.weight }),
        stockedAt: new Date(b.stockedAt).toISOString(),
        status: b.status,
      })),
      cycle: cycle
        ? {
            id: cycle.id,
            status: cycle.status,
            startedAt: new Date(cycle.startedAt).toISOString(),
            harvestedAt: iso(cycle.harvestedAt),
            stockedFish: cycle.stockedFish,
            harvested: cycle.harvested,
            feedUsed: round(cycle.feedUsed, 10),
          }
        : null,
      records: records
        .map((r) => ({
          recordedAt: new Date(r.recordedAt).toISOString(),
          quality: r.quality,
          waterLevel: r.waterLevel,
          density: r.density,
          feedStock: r.feedStock,
        }))
        .reverse(),
      simulatedAt: new Date(body.lastSimulatedAt).toISOString(),
      totalHarvested: body.totalHarvested,
      invested: building.invested,
      createdAt: new Date(body.createdAt).toISOString(),
      updatedAt: new Date(body.updatedAt).toISOString(),
    };
  }

  private async stocks(cityId: string, t: Transaction) {
    return {
      fish: await this.stock.getAmounts(cityId, [...FISH_STOCK_CODES, ...FRY_STOCK_CODES], t),
      produce: await this.stock.getBag(cityId, t),
      resources: await this.ctx.resources.getBag(cityId, t),
    };
  }

  private async result(
    cityId: string,
    body: WaterBody | null,
    t: Transaction
  ): Promise<AquacultureMutationResultDTO> {
    const dto = body ? this.toDTO(await this.bundle(body, t)) : null;
    return {
      waterBody: dto,
      ...(await this.stocks(cityId, t)),
      serverTime: this.ctx.now().toISOString(),
    };
  }
}
