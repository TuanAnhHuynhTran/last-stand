import { Op, UniqueConstraintError, type Transaction } from 'sequelize';
import {
  CROP_TYPE_DEFINITIONS,
  DEMOLISH_REFUND_RATE,
  FARM_MAX_LEVEL,
  FARM_ZONE_DEFINITIONS,
  PRODUCE_CODES,
  addResources,
  checkFarmZoneShape,
  computeCropOutcome,
  emptyProduce,
  evaluateIrrigation,
  farmCreateCost,
  farmExpandCost,
  farmUpgradeCost,
  getCropDefinition,
  getFarmZoneDefinition,
  getFarmZoneLevel,
  type AxialCoord,
  type CreateFarmZoneInput,
  type ExpandFarmZoneInput,
  type FarmMutationResultDTO,
  type FarmStateDTO,
  type FarmZoneDTO,
  type PlantCropInput,
  type ProduceBag,
  type ProduceCode,
} from '@cityverse/shared';
import type { City } from '../../database/models/City.js';
import type {
  CropCycle,
  FarmZone,
  FarmZoneTile,
  IrrigationNetwork,
} from '../../database/models/Farm.js';
import type { DatabaseModels } from '../../database/models/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import type { BuildingContext } from '../buildings/building.service.js';
import { getWorldForCity } from '../buildings/buildingSupport.js';

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue seeding (crop_types from @cityverse/shared)
// ─────────────────────────────────────────────────────────────────────────────
export class FarmCatalogService {
  private ready: Promise<void> | null = null;

  constructor(private readonly models: DatabaseModels) {}

  ensureCatalog(): Promise<void> {
    this.ready ??= this.sync().catch((err: unknown) => {
      this.ready = null;
      throw err;
    });
    return this.ready;
  }

  private async sync(): Promise<void> {
    await this.models.sequelize.transaction(async (transaction) => {
      for (const crop of CROP_TYPE_DEFINITIONS) {
        await this.models.CropType.upsert(
          {
            code: crop.code,
            name: crop.name,
            zoneType: crop.zoneType,
            produce: crop.produce,
            growSeconds: crop.growSeconds,
            yieldPerHex: crop.yieldPerHex,
            waterNeed: crop.waterNeed,
            seedCostPerHex: crop.seedCostPerHex,
            stages: crop.stages.map((s) => ({ ...s })),
          },
          { transaction }
        );
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Produce (rice, corn, … rows in city_resources)
// ─────────────────────────────────────────────────────────────────────────────
export class ProduceService {
  constructor(private readonly models: DatabaseModels) {}

  async getBag(cityId: string, t: Transaction): Promise<ProduceBag> {
    const rows = await this.models.CityResource.findAll({
      where: { cityId, resourceCode: [...PRODUCE_CODES] },
      transaction: t,
    });
    const bag = emptyProduce();
    for (const row of rows) bag[row.resourceCode as ProduceCode] = row.amount;
    return bag;
  }

  /** Adds to any city stock row (produce or livestock products). */
  async add(cityId: string, code: string, amount: number, t: Transaction): Promise<void> {
    const row = await this.models.CityResource.findOne({
      where: { cityId, resourceCode: code },
      transaction: t,
    });
    if (row) await row.update({ amount: row.amount + amount }, { transaction: t });
    else
      await this.models.CityResource.create(
        { cityId, resourceCode: code, amount },
        { transaction: t }
      );
  }

  /** Amounts of arbitrary stock codes (missing rows = 0). */
  async getAmounts<K extends string>(
    cityId: string,
    codes: readonly K[],
    t: Transaction
  ): Promise<Record<K, number>> {
    const rows = await this.models.CityResource.findAll({
      where: { cityId, resourceCode: [...codes] },
      transaction: t,
    });
    const out = Object.fromEntries(codes.map((c) => [c, 0])) as Record<K, number>;
    for (const row of rows) out[row.resourceCode as K] = row.amount;
    return out;
  }

  /** Deducts produce (e.g. animal feed) or throws INSUFFICIENT_FEED without changing anything. */
  async consume(
    cityId: string,
    need: Partial<Record<ProduceCode, number>>,
    t: Transaction
  ): Promise<void> {
    const have = await this.getBag(cityId, t);
    const missing = (Object.keys(need) as ProduceCode[]).filter((c) => have[c] < (need[c] ?? 0));
    if (missing.length) {
      throw new BadRequestError('Khong du thuc an cho vat nuoi', 'INSUFFICIENT_FEED', {
        missing,
        need: Object.entries(need).map(([c, n]) => `${c}:${n}`),
        have: missing.map((c) => `${c}:${have[c]}`),
      });
    }
    for (const c of Object.keys(need) as ProduceCode[]) {
      if (need[c]) await this.add(cityId, c, -need[c]!, t);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Farm zones
// ─────────────────────────────────────────────────────────────────────────────
interface ZoneBundle {
  zone: FarmZone;
  tiles: FarmZoneTile[];
  irrigation: IrrigationNetwork | null;
  crop: CropCycle | null;
}

export class FarmService {
  readonly catalog: FarmCatalogService;
  readonly produce: ProduceService;

  constructor(private readonly ctx: BuildingContext) {
    this.catalog = new FarmCatalogService(ctx.models);
    this.produce = new ProduceService(ctx.models);
  }

  private get models(): DatabaseModels {
    return this.ctx.models;
  }

  /** Same per-city lock as buildings: farm tiles and building footprints never race. */
  private async mutate<T>(
    cityId: string,
    userId: string,
    requireEdit: boolean,
    fn: (city: City, t: Transaction) => Promise<T>
  ): Promise<T> {
    // Seed outside the city transaction (SQLite has a single connection).
    await this.catalog.ensureCatalog();
    return this.ctx.mutate(cityId, userId, requireEdit, async (city, t) => {
      await this.settleUpgrades(cityId, city, t);
      return fn(city, t);
    });
  }

  /** Completes every zone upgrade whose finish time has passed (idempotent). */
  async settleUpgrades(cityId: string, city: City, t: Transaction): Promise<number> {
    const due = await this.models.FarmZone.findAll({
      where: { cityId, status: 'upgrading', upgradeFinishesAt: { [Op.lte]: this.ctx.now() } },
      transaction: t,
    });
    for (const zone of due) {
      await zone.update(
        {
          level: Math.min(FARM_MAX_LEVEL, zone.level + 1),
          status: 'active',
          upgradeStartedAt: null,
          upgradeFinishesAt: null,
        },
        { transaction: t }
      );
      await this.writeIrrigation(city, zone, await this.tilesOf(zone.id, t), t);
    }
    return due.length;
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  async getState(cityId: string, userId: string): Promise<FarmStateDTO> {
    return this.mutate(cityId, userId, false, async (_city, t) => {
      const zones = await this.models.FarmZone.findAll({
        where: { cityId },
        order: [['createdAt', 'ASC']],
        transaction: t,
      });
      const ids = zones.map((z) => z.id);
      const [tiles, networks, crops] = ids.length
        ? await Promise.all([
            this.models.FarmZoneTile.findAll({
              where: { zoneId: ids },
              order: [['createdAt', 'ASC']],
              transaction: t,
            }),
            this.models.IrrigationNetwork.findAll({ where: { zoneId: ids }, transaction: t }),
            this.models.CropCycle.findAll({
              where: { zoneId: ids, status: 'growing' },
              transaction: t,
            }),
          ])
        : [[], [], []];
      return {
        zones: zones.map((zone) =>
          toFarmZoneDTO({
            zone,
            tiles: tiles.filter((x) => x.zoneId === zone.id),
            irrigation: networks.find((n) => n.zoneId === zone.id) ?? null,
            crop: crops.find((c) => c.zoneId === zone.id) ?? null,
          })
        ),
        produce: await this.produce.getBag(cityId, t),
        resources: await this.ctx.resources.getBag(cityId, t),
        serverTime: this.ctx.now().toISOString(),
      };
    });
  }

  async getCatalog() {
    await this.catalog.ensureCatalog();
    const crops = await this.models.CropType.findAll({ order: [['code', 'ASC']] });
    return {
      zoneTypes: FARM_ZONE_DEFINITIONS,
      crops: crops.map((c) => ({
        code: c.code,
        name: c.name,
        zoneType: c.zoneType,
        produce: c.produce,
        growSeconds: c.growSeconds,
        yieldPerHex: c.yieldPerHex,
        waterNeed: c.waterNeed,
        seedCostPerHex: c.seedCostPerHex,
        stages: c.stages,
      })),
    };
  }

  // ── Mutations ──────────────────────────────────────────────────────────────
  /** Draws a new zone: ≥ 6 connected owned hexes, free of buildings and other zones. */
  async create(
    cityId: string,
    userId: string,
    input: CreateFarmZoneInput
  ): Promise<FarmMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const check = checkFarmZoneShape(
        await getWorldForCity(this.ctx.models, city, t),
        input.hexes,
        await this.ctx.occupiedMap(cityId, t)
      );
      if (!check.valid) {
        throw new BadRequestError('Khu canh tac khong hop le', 'INVALID_FARM_ZONE', {
          issues: check.issues,
        });
      }
      const cost = farmCreateCost(input.zoneType, input.hexes.length);
      await this.ctx.resources.charge(cityId, cost, t);
      const zone = await this.models.FarmZone.create(
        {
          cityId,
          zoneType: input.zoneType,
          level: 1,
          status: 'active',
          createdBy: userId,
          invested: cost,
        },
        { transaction: t }
      );
      const tiles = await this.writeTiles(cityId, zone.id, input.hexes, t);
      await this.writeIrrigation(city, zone, tiles, t);
      return this.result(cityId, zone, t);
    });
  }

  /** Adds hexes to a zone (separate from upgrading): the zone must stay one connected region. */
  async expand(
    cityId: string,
    zoneId: string,
    userId: string,
    input: ExpandFarmZoneInput
  ): Promise<FarmMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const zone = await this.loadZone(cityId, zoneId, t);
      if (zone.status !== 'active')
        throw new ConflictError('Khu dang nang cap, chua the mo rong', 'FARM_ZONE_BUSY');
      if (await this.activeCrop(zone.id, t)) {
        throw new ConflictError('Hay thu hoach truoc khi mo rong khu', 'FARM_ZONE_HAS_CROP');
      }
      const existing = await this.tilesOf(zone.id, t);
      const check = checkFarmZoneShape(
        await getWorldForCity(this.ctx.models, city, t),
        input.hexes,
        await this.ctx.occupiedMap(cityId, t),
        {
          zoneId: zone.id,
          baseHexes: existing,
        }
      );
      if (!check.valid) {
        throw new BadRequestError('Vung mo rong khong hop le', 'INVALID_FARM_ZONE', {
          issues: check.issues,
        });
      }
      const cost = farmExpandCost(zone.zoneType, zone.level, input.hexes.length);
      await this.ctx.resources.charge(cityId, cost, t);
      await zone.update({ invested: addResources(zone.invested, cost) }, { transaction: t });
      const added = await this.writeTiles(cityId, zone.id, input.hexes, t);
      await this.writeIrrigation(city, zone, [...existing, ...added], t);
      return this.result(cityId, zone, t);
    });
  }

  /** Starts a timed upgrade to the next level; the zone keeps its id and hexes. */
  async upgrade(cityId: string, zoneId: string, userId: string): Promise<FarmMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const zone = await this.loadZone(cityId, zoneId, t);
      if (zone.status !== 'active') throw new ConflictError('Khu dang nang cap', 'FARM_ZONE_BUSY');
      const next = getFarmZoneLevel(zone.zoneType, zone.level + 1);
      if (!next) throw new BadRequestError('Khu da dat cap toi da', 'MAX_LEVEL_REACHED');
      const tiles = await this.tilesOf(zone.id, t);
      const cost = farmUpgradeCost(zone.zoneType, next.level, tiles.length)!;
      await this.ctx.resources.charge(cityId, cost, t);
      const now = this.ctx.now();
      await zone.update(
        {
          status: 'upgrading',
          upgradeStartedAt: now,
          upgradeFinishesAt: new Date(now.getTime() + next.upgradeSeconds * 1000),
          invested: addResources(zone.invested, cost),
        },
        { transaction: t }
      );
      return this.result(cityId, zone, t);
    });
  }

  /** Plants a crop over the whole zone; duration and yield are fixed now from level + water. */
  async plant(
    cityId: string,
    zoneId: string,
    userId: string,
    input: PlantCropInput
  ): Promise<FarmMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const zone = await this.loadZone(cityId, zoneId, t);
      await this.plantInTx(city, zone, input.cropCode, t);
      return this.result(cityId, zone, t);
    });
  }

  /** Plants a crop inside an open transaction (used by the API and by farmers' automation). */
  private async plantInTx(
    city: City,
    zone: FarmZone,
    requested: PlantCropInput['cropCode'],
    t: Transaction
  ): Promise<void> {
    const cityId = city.id;
    const def = getFarmZoneDefinition(zone.zoneType);
    const cropCode = requested ?? def.crops[0];
    if (!def.crops.includes(cropCode)) {
      throw new BadRequestError('Cay trong khong phu hop voi khu nay', 'CROP_NOT_ALLOWED');
    }
    if (await this.activeCrop(zone.id, t))
      throw new ConflictError('Khu dang co vu mua', 'FARM_ZONE_HAS_CROP');
    const tiles = await this.tilesOf(zone.id, t);
    const irrigation =
      (await this.models.IrrigationNetwork.findOne({
        where: { zoneId: zone.id },
        transaction: t,
      })) ?? (await this.writeIrrigation(city, zone, tiles, t));
    const crop = getCropDefinition(cropCode);
    const outcome = computeCropOutcome(crop, zone.zoneType, zone.level, tiles.length, irrigation);
    await this.ctx.resources.charge(cityId, outcome.seedCost, t);
    const now = this.ctx.now();
    await this.models.CropCycle.create(
      {
        cityId,
        zoneId: zone.id,
        cropCode,
        zoneLevel: zone.level,
        hexCount: tiles.length,
        plantedAt: now,
        readyAt: new Date(now.getTime() + outcome.growSeconds * 1000),
        expectedYield: outcome.expectedYield,
        waterFactor: outcome.waterFactor,
        seedCost: outcome.seedCost,
        status: 'growing',
      },
      { transaction: t }
    );
  }

  /** Harvests a ripe crop into the city's produce stock. */
  async harvest(cityId: string, zoneId: string, userId: string): Promise<FarmMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const zone = await this.loadZone(cityId, zoneId, t);
      const amount = await this.harvestInTx(cityId, zone, t);
      return { ...(await this.result(cityId, zone, t)), harvested: amount };
    });
  }

  /**
   * Farmers at work (Phase 7): ripe crops are harvested and the zone is replanted with the same
   * crop when the seeds are affordable. Runs inside the caller's transaction / city lock.
   */
  async autoTend(
    city: City,
    zoneIds: readonly string[],
    t: Transaction
  ): Promise<{ harvested: Record<string, number>; planted: number }> {
    const out = { harvested: {} as Record<string, number>, planted: 0 };
    await this.settleUpgrades(city.id, city, t);
    for (const id of zoneIds) {
      const zone = await this.models.FarmZone.findOne({
        where: { id, cityId: city.id },
        transaction: t,
      });
      if (!zone || zone.status !== 'active') continue;
      const crop = await this.activeCrop(zone.id, t);
      let last = crop?.cropCode ?? null;
      if (crop && new Date(crop.readyAt).getTime() <= this.ctx.now().getTime()) {
        const amount = await this.harvestInTx(city.id, zone, t);
        const produce = getCropDefinition(crop.cropCode).produce;
        out.harvested[produce] = (out.harvested[produce] ?? 0) + amount;
      } else if (crop) continue;
      if (!last) {
        const prev = await this.models.CropCycle.findOne({
          where: { zoneId: zone.id },
          order: [['plantedAt', 'DESC']],
          transaction: t,
        });
        last = prev?.cropCode ?? null;
      }
      try {
        await this.plantInTx(city, zone, last ?? undefined, t);
        out.planted += 1;
      } catch {
        // Not enough coins for seeds: leave the field fallow (the HUD warns).
      }
    }
    return out;
  }

  private async harvestInTx(cityId: string, zone: FarmZone, t: Transaction): Promise<number> {
    const cycle = await this.activeCrop(zone.id, t);
    if (!cycle) throw new ConflictError('Khu chua gieo trong', 'NO_CROP');
    const now = this.ctx.now();
    if (new Date(cycle.readyAt).getTime() > now.getTime()) {
      throw new ConflictError('Cay chua chin', 'CROP_NOT_READY');
    }
    const amount = cycle.expectedYield;
    await cycle.update(
      { status: 'harvested', harvestedAt: now, harvestedAmount: amount },
      { transaction: t }
    );
    await this.produce.add(cityId, getCropDefinition(cycle.cropCode).produce, amount, t);
    await zone.update({ totalHarvested: zone.totalHarvested + amount }, { transaction: t });
    return amount;
  }

  /** Removes a zone: refunds DEMOLISH_REFUND_RATE of what was invested; an unharvested crop is lost. */
  async remove(cityId: string, zoneId: string, userId: string): Promise<FarmMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const zone = await this.loadZone(cityId, zoneId, t);
      const refund = addResources(
        { coins: 0, wood: 0, stone: 0 },
        zone.invested,
        DEMOLISH_REFUND_RATE
      );
      await this.models.CropCycle.destroy({ where: { zoneId: zone.id }, transaction: t });
      await this.models.IrrigationNetwork.destroy({ where: { zoneId: zone.id }, transaction: t });
      await this.models.FarmZoneTile.destroy({ where: { zoneId: zone.id }, transaction: t });
      await zone.destroy({ transaction: t });
      await this.ctx.resources.refund(cityId, refund, t);
      return this.result(cityId, null, t);
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private async loadZone(cityId: string, zoneId: string, t: Transaction): Promise<FarmZone> {
    const zone = await this.models.FarmZone.findOne({
      where: { id: zoneId, cityId },
      transaction: t,
    });
    if (!zone) throw new NotFoundError('Khu canh tac khong ton tai', 'FARM_ZONE_NOT_FOUND');
    return zone;
  }

  private tilesOf(zoneId: string, t: Transaction): Promise<FarmZoneTile[]> {
    return this.models.FarmZoneTile.findAll({
      where: { zoneId },
      order: [['createdAt', 'ASC']],
      transaction: t,
    });
  }

  private activeCrop(zoneId: string, t: Transaction): Promise<CropCycle | null> {
    return this.models.CropCycle.findOne({ where: { zoneId, status: 'growing' }, transaction: t });
  }

  private async writeTiles(
    cityId: string,
    zoneId: string,
    hexes: readonly AxialCoord[],
    t: Transaction
  ): Promise<FarmZoneTile[]> {
    try {
      return await this.models.FarmZoneTile.bulkCreate(
        hexes.map((h) => ({ cityId, zoneId, q: h.q, r: h.r })),
        { transaction: t }
      );
    } catch (err) {
      if (err instanceof UniqueConstraintError)
        throw new ConflictError('O hex da thuoc khu canh tac khac', 'HEX_OCCUPIED');
      throw err;
    }
  }

  /** (Re)computes the zone's irrigation network row from its level, hexes and the terrain. */
  private async writeIrrigation(
    city: City,
    zone: FarmZone,
    tiles: readonly AxialCoord[],
    t: Transaction
  ): Promise<IrrigationNetwork> {
    const info = evaluateIrrigation(
      await getWorldForCity(this.ctx.models, city, t),
      zone.zoneType,
      zone.level,
      tiles
    );
    const values = {
      cityId: zone.cityId,
      zoneId: zone.id,
      kind: info.kind,
      sourceType: info.sourceType,
      sourceQ: info.sourceHex?.q ?? null,
      sourceR: info.sourceHex?.r ?? null,
      sourceDistance: info.sourceDistance,
      naturalSupply: info.naturalSupply,
      supply: info.supply,
      fertility: info.fertility,
    };
    const existing = await this.models.IrrigationNetwork.findOne({
      where: { zoneId: zone.id },
      transaction: t,
    });
    if (existing) return existing.update(values, { transaction: t });
    return this.models.IrrigationNetwork.create(values, { transaction: t });
  }

  private async result(
    cityId: string,
    zone: FarmZone | null,
    t: Transaction
  ): Promise<FarmMutationResultDTO> {
    let dto: FarmZoneDTO | null = null;
    if (zone) {
      await zone.reload({ transaction: t });
      dto = toFarmZoneDTO({
        zone,
        tiles: await this.tilesOf(zone.id, t),
        irrigation: await this.models.IrrigationNetwork.findOne({
          where: { zoneId: zone.id },
          transaction: t,
        }),
        crop: await this.activeCrop(zone.id, t),
      });
    }
    return {
      zone: dto,
      produce: await this.produce.getBag(cityId, t),
      resources: await this.ctx.resources.getBag(cityId, t),
      serverTime: this.ctx.now().toISOString(),
    };
  }
}

const iso = (d: Date | string | null | undefined): string | null =>
  d ? new Date(d).toISOString() : null;

export function toFarmZoneDTO({ zone, tiles, irrigation, crop }: ZoneBundle): FarmZoneDTO {
  return {
    id: zone.id,
    cityId: zone.cityId,
    zoneType: zone.zoneType,
    name: getFarmZoneDefinition(zone.zoneType).name,
    level: zone.level,
    status: zone.status,
    upgradeStartedAt: iso(zone.upgradeStartedAt),
    upgradeFinishesAt: iso(zone.upgradeFinishesAt),
    hexes: tiles.map((x) => ({ q: x.q, r: x.r })),
    irrigation: irrigation
      ? {
          kind: irrigation.kind,
          sourceType: irrigation.sourceType,
          sourceHex:
            irrigation.sourceQ !== null && irrigation.sourceR !== null
              ? { q: irrigation.sourceQ, r: irrigation.sourceR }
              : null,
          sourceDistance: irrigation.sourceDistance,
          naturalSupply: irrigation.naturalSupply,
          supply: irrigation.supply,
          fertility: irrigation.fertility,
        }
      : {
          kind: 'none',
          sourceType: 'rain',
          sourceHex: null,
          sourceDistance: null,
          naturalSupply: 0,
          supply: 0,
          fertility: 1,
        },
    crop: crop
      ? {
          id: crop.id,
          cropCode: crop.cropCode,
          plantedAt: new Date(crop.plantedAt).toISOString(),
          readyAt: new Date(crop.readyAt).toISOString(),
          expectedYield: crop.expectedYield,
          waterFactor: crop.waterFactor,
          status: crop.status,
        }
      : null,
    totalHarvested: zone.totalHarvested,
    invested: zone.invested,
    createdAt: new Date(zone.createdAt).toISOString(),
    updatedAt: new Date(zone.updatedAt).toISOString(),
  };
}
