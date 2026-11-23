import { Op, UniqueConstraintError, type Transaction } from 'sequelize';
import {
  DEMOLISH_REFUND_RATE,
  MAX_CONCURRENT_CONSTRUCTION_JOBS,
  addResources,
  checkPlacement,
  farmOccupant,
  ranchOccupant,
  emptyResources,
  getBuildingDefinition,
  getBuildingLevel,
  getMaxLevel,
  hexKey,
  pathEdgeKey,
  isLivestockFarmTypeCode,
  isWaterBodyTypeCode,
  pondOccupant,
  AQUACULTURE_BUILDING_CATEGORY,
  LIVESTOCK_BUILDING_CATEGORY,
  normalizeRotation,
  type BuildingMutationResultDTO,
  type BuildingTypeCode,
  type BuildingsStateDTO,
  type MoveBuildingInput,
  type PlaceBuildingInput,
  type ResourceBag,
  type WorldBuildingDTO,
} from '@cityverse/shared';
import type { City } from '../../database/models/City.js';
import type { BuildingConstructionJob, WorldBuilding } from '../../database/models/Building.js';

/** A world_buildings row of a regular (catalogue) building — not a livestock farm's land. */
export type CatalogBuilding = WorldBuilding & { typeCode: BuildingTypeCode };
import type { DatabaseModels } from '../../database/models/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import {
  BuildingCatalogService,
  KeyedMutex,
  ResourceService,
  getWorldForCity,
  resolveCityAccess,
  toBuildingDTO,
  type Clock,
} from './buildingSupport.js';

/** Shared plumbing for the building services. */
export class BuildingContext {
  readonly catalog: BuildingCatalogService;
  readonly resources: ResourceService;
  readonly mutex = new KeyedMutex();

  constructor(
    readonly models: DatabaseModels,
    readonly now: Clock = () => new Date()
  ) {
    this.catalog = new BuildingCatalogService(models);
    this.resources = new ResourceService(models);
  }

  /** Access check + catalogue + per-city lock + transaction. */
  async mutate<T>(
    cityId: string,
    userId: string,
    requireEdit: boolean,
    fn: (city: City, t: Transaction) => Promise<T>
  ): Promise<T> {
    const { city } = await resolveCityAccess(this.models, cityId, userId, requireEdit);
    await this.catalog.ensureCatalog();
    return this.mutex.run(cityId, () => this.models.sequelize.transaction(async (t) => {
      await city.reload({ transaction: t, lock: t.LOCK.UPDATE });
      return fn(city, t);
    }));
  }

  /**
   * Loads a regular building. Livestock farms also own a world_buildings row (their land),
   * but they are managed through the livestock API only.
   */
  async loadBuilding(cityId: string, buildingId: string, t: Transaction): Promise<CatalogBuilding> {
    const b = await this.models.WorldBuilding.findOne({ where: { id: buildingId, cityId }, transaction: t });
    if (!b) throw new NotFoundError('Cong trinh khong ton tai', 'BUILDING_NOT_FOUND');
    if (isLivestockFarmTypeCode(b.typeCode)) {
      throw new BadRequestError('Trang trai chan nuoi duoc quan ly qua API chan nuoi', 'MANAGED_BY_LIVESTOCK');
    }
    if (isWaterBodyTypeCode(b.typeCode)) {
      throw new BadRequestError('Ao / ho ca duoc quan ly qua API thuy san', 'MANAGED_BY_AQUACULTURE');
    }
    return b as CatalogBuilding;
  }

  async activeJob(buildingId: string, t: Transaction): Promise<BuildingConstructionJob | null> {
    return this.models.BuildingConstructionJob.findOne({
      where: { buildingId, status: 'in_progress' },
      transaction: t,
    });
  }

  async assertJobSlot(cityId: string, t: Transaction): Promise<void> {
    const running = await this.models.BuildingConstructionJob.count({
      where: { cityId, status: 'in_progress' },
      transaction: t,
    });
    if (running >= MAX_CONCURRENT_CONSTRUCTION_JOBS) {
      throw new ConflictError(
        `Toi da ${MAX_CONCURRENT_CONSTRUCTION_JOBS} cong trinh thi cong cung luc`,
        'CONSTRUCTION_QUEUE_FULL'
      );
    }
  }

  /**
   * Hex key → building id, `farm:<zoneId>` (fields) or `ranch:<farmId>` (livestock) — all block each other.
   * Livestock farms claim land through building_footprints like any building; their hexes are
   * reported as `ranch:<farmId>` so client and server speak the same occupant ids.
   */
  async occupiedMap(cityId: string, t: Transaction): Promise<Map<string, string>> {
    const [rows, farms, ranches] = await Promise.all([
      this.models.BuildingFootprint.findAll({ where: { cityId }, transaction: t }),
      this.models.FarmZoneTile.findAll({ where: { cityId }, transaction: t }),
      this.models.LivestockFarm.findAll({ where: { cityId }, attributes: ['id', 'buildingId'], transaction: t }),
    ]);
    const ponds = await this.models.WaterBody.findAll({ where: { cityId }, attributes: ['id', 'buildingId'], transaction: t });
    const pondByBuilding = new Map(ponds.map((p) => [p.buildingId, p.id]));
    const ranchByBuilding = new Map(ranches.map((r) => [r.buildingId, r.id]));
    const roads = await this.models.WorldBuilding.findAll({ where: { cityId, typeCode: 'road' }, transaction: t });
    const roadIds = new Set(roads.map(r => r.id));
    const map = new Map<string, string>();
    for (const road of roads) map.set(pathEdgeKey({ q: road.anchorQ, r: road.anchorR }, road.rotation), road.id);
    for (const f of rows) {
      if (roadIds.has(f.buildingId)) continue;
      const ranch = ranchByBuilding.get(f.buildingId);
      const pond = pondByBuilding.get(f.buildingId);
      map.set(hexKey(f.q, f.r), ranch ? ranchOccupant(ranch) : pond ? pondOccupant(pond) : f.buildingId);
    }
    for (const f of farms) map.set(hexKey(f.q, f.r), farmOccupant(f.zoneId));
    return map;
  }

  async toDTO(b: CatalogBuilding, t: Transaction): Promise<WorldBuildingDTO> {
    const fp = await this.models.BuildingFootprint.findAll({ where: { buildingId: b.id }, transaction: t });
    return toBuildingDTO(b, fp, await this.activeJob(b.id, t));
  }

  async result(cityId: string, b: CatalogBuilding | null, t: Transaction): Promise<BuildingMutationResultDTO> {
    return {
      building: b ? await this.toDTO(b, t) : null,
      resources: await this.resources.getBag(cityId, t),
      serverTime: this.now().toISOString(),
    };
  }
}

export class BuildingUpgradeService {
  constructor(private readonly ctx: BuildingContext) {}

  /** Completes every job whose finish time has passed (idempotent, runs before reads/writes). */
  async settleJobs(cityId: string, t: Transaction): Promise<number> {
    const due = await this.ctx.models.BuildingConstructionJob.findAll({
      where: { cityId, status: 'in_progress', finishesAt: { [Op.lte]: this.ctx.now() } },
      transaction: t,
    });
    for (const job of due) {
      await job.update({ status: 'completed', completedAt: job.finishesAt }, { transaction: t });
      await this.ctx.models.WorldBuilding.update(
        { level: job.targetLevel, status: 'active' },
        { where: { id: job.buildingId }, transaction: t }
      );
    }
    return due.length;
  }

  /**
   * Starts an upgrade. The building keeps its id and position; its level only changes when
   * the job completes, so the old model stays (with scaffolding) while work is in progress.
   */
  async upgrade(cityId: string, buildingId: string, userId: string): Promise<BuildingMutationResultDTO> {
    return this.ctx.mutate(cityId, userId, true, async (_city, t) => {
      await this.settleJobs(cityId, t);
      const b = await this.ctx.loadBuilding(cityId, buildingId, t);
      if (b.status !== 'active') {
        throw new ConflictError('Cong trinh dang thi cong, chua the nang cap', 'BUILDING_BUSY');
      }
      const next = getBuildingLevel(b.typeCode, b.level + 1);
      if (!next || b.level >= getMaxLevel(b.typeCode)) {
        throw new BadRequestError('Cong trinh da dat cap toi da', 'MAX_LEVEL_REACHED');
      }
      await this.ctx.assertJobSlot(cityId, t);
      await this.ctx.resources.charge(cityId, next.cost, t);

      const now = this.ctx.now();
      await b.update({ status: 'upgrading', invested: addResources(b.invested, next.cost) }, { transaction: t });
      await this.ctx.models.BuildingConstructionJob.create(
        {
          cityId,
          buildingId: b.id,
          jobType: 'upgrade',
          fromLevel: b.level,
          targetLevel: next.level,
          cost: next.cost,
          startedAt: now,
          finishesAt: new Date(now.getTime() + next.buildSeconds * 1000),
          status: 'in_progress',
        },
        { transaction: t }
      );
      return this.ctx.result(cityId, b, t);
    });
  }
}

export class BuildingPlacementService {
  constructor(
    private readonly ctx: BuildingContext,
    private readonly upgrades: BuildingUpgradeService
  ) {}

  async place(cityId: string, userId: string, input: PlaceBuildingInput): Promise<BuildingMutationResultDTO> {
    return this.ctx.mutate(cityId, userId, true, async (city, t) => {
      await this.upgrades.settleJobs(cityId, t);
      const def = getBuildingDefinition(input.typeCode);
      const first = def.levels[0];
      const rotation = normalizeRotation(input.rotation);

      if (def.maxPerCity !== null) {
        const count = await this.ctx.models.WorldBuilding.count({
          where: { cityId, typeCode: def.code },
          transaction: t,
        });
        if (count >= def.maxPerCity) {
          throw new ConflictError(`${def.name} chi duoc xay ${def.maxPerCity} cong trinh`, 'BUILDING_LIMIT_REACHED');
        }
      }

      const placement = checkPlacement(
        await getWorldForCity(this.ctx.models, city, t),
        def.code,
        { q: input.q, r: input.r },
        rotation,
        await this.ctx.occupiedMap(cityId, t)
      );
      if (!placement.valid) {
        throw new BadRequestError('Vi tri dat cong trinh khong hop le', 'INVALID_PLACEMENT', {
          issues: placement.issues,
        });
      }
      await this.ctx.assertJobSlot(cityId, t);
      await this.ctx.resources.charge(cityId, first.cost, t);

      const building = await this.ctx.models.WorldBuilding.create(
        {
          cityId,
          typeCode: def.code,
          level: 1,
          status: 'constructing',
          anchorQ: input.q,
          anchorR: input.r,
          rotation,
          createdBy: userId,
          invested: { ...first.cost },
        },
        { transaction: t }
      );
      if (def.code !== 'road') await this.writeFootprint(cityId, building.id, placement.hexes, t);

      const now = this.ctx.now();
      await this.ctx.models.BuildingConstructionJob.create(
        {
          cityId,
          buildingId: building.id,
          jobType: 'build',
          fromLevel: 0,
          targetLevel: 1,
          cost: first.cost,
          startedAt: now,
          finishesAt: new Date(now.getTime() + first.buildSeconds * 1000),
          status: 'in_progress',
        },
        { transaction: t }
      );
      return this.ctx.result(cityId, building as CatalogBuilding, t);
    });
  }

  /** Moves a finished building; it keeps its id, level and invested resources. */
  async move(cityId: string, buildingId: string, userId: string, input: MoveBuildingInput): Promise<BuildingMutationResultDTO> {
    return this.ctx.mutate(cityId, userId, true, async (city, t) => {
      await this.upgrades.settleJobs(cityId, t);
      const b = await this.ctx.loadBuilding(cityId, buildingId, t);
      if (b.status !== 'active') {
        throw new ConflictError('Khong the di chuyen cong trinh dang thi cong', 'BUILDING_BUSY');
      }
      const rotation = normalizeRotation(input.rotation);
      const placement = checkPlacement(
        await getWorldForCity(this.ctx.models, city, t),
        b.typeCode,
        { q: input.q, r: input.r },
        rotation,
        await this.ctx.occupiedMap(cityId, t),
        b.id
      );
      if (!placement.valid) {
        throw new BadRequestError('Vi tri moi khong hop le', 'INVALID_PLACEMENT', { issues: placement.issues });
      }
      await this.ctx.models.BuildingFootprint.destroy({ where: { buildingId: b.id }, transaction: t });
      if (b.typeCode !== 'road') await this.writeFootprint(cityId, b.id, placement.hexes, t);
      await b.update({ anchorQ: input.q, anchorR: input.r, rotation }, { transaction: t });
      return this.ctx.result(cityId, b, t);
    });
  }

  /**
   * Removes a building. Refund: the cost of an unfinished job in full, plus
   * DEMOLISH_REFUND_RATE of everything already built.
   */
  async demolish(cityId: string, buildingId: string, userId: string): Promise<BuildingMutationResultDTO & { refunded: ResourceBag }> {
    return this.ctx.mutate(cityId, userId, true, async (_city, t) => {
      await this.upgrades.settleJobs(cityId, t);
      const b = await this.ctx.loadBuilding(cityId, buildingId, t);
      const job = await this.ctx.activeJob(b.id, t);
      const pending = job ? job.cost : emptyResources();
      const built = addResources(b.invested, pending, -1);
      const refunded = addResources(pending, built, DEMOLISH_REFUND_RATE);

      await this.ctx.models.BuildingConstructionJob.destroy({ where: { buildingId: b.id }, transaction: t });
      await this.ctx.models.BuildingFootprint.destroy({ where: { buildingId: b.id }, transaction: t });
      await b.destroy({ transaction: t });
      await this.ctx.resources.refund(cityId, refunded, t);
      return { ...(await this.ctx.result(cityId, null, t)), refunded };
    });
  }

  private async writeFootprint(cityId: string, buildingId: string, hexes: { q: number; r: number }[], t: Transaction): Promise<void> {
    try {
      await this.ctx.models.BuildingFootprint.bulkCreate(
        hexes.map((h) => ({ cityId, buildingId, q: h.q, r: h.r })),
        { transaction: t }
      );
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new ConflictError('O hex da co cong trinh khac', 'HEX_OCCUPIED');
      }
      throw err;
    }
  }
}

export class BuildingQueryService {
  constructor(
    private readonly ctx: BuildingContext,
    private readonly upgrades: BuildingUpgradeService
  ) {}

  async getState(cityId: string, userId: string): Promise<BuildingsStateDTO> {
    return this.ctx.mutate(cityId, userId, false, async (_city, t) => {
      await this.upgrades.settleJobs(cityId, t);
      // Livestock farms' land rows are served by the livestock API.
      const buildings = (
        await this.ctx.models.WorldBuilding.findAll({
          where: { cityId },
          order: [['createdAt', 'ASC']],
          transaction: t,
        })
      ).filter((b): b is CatalogBuilding => !isLivestockFarmTypeCode(b.typeCode) && !isWaterBodyTypeCode(b.typeCode));
      const ids = buildings.map((b) => b.id);
      const [footprints, jobs] = ids.length
        ? await Promise.all([
            this.ctx.models.BuildingFootprint.findAll({ where: { buildingId: ids }, transaction: t }),
            this.ctx.models.BuildingConstructionJob.findAll({
              where: { buildingId: ids, status: 'in_progress' },
              transaction: t,
            }),
          ])
        : [[], []];
      return {
        buildings: buildings.map((b) =>
          toBuildingDTO(
            b,
            footprints.filter((f) => f.buildingId === b.id),
            jobs.find((j) => j.buildingId === b.id) ?? null
          )
        ),
        resources: await this.ctx.resources.getBag(cityId, t),
        serverTime: this.ctx.now().toISOString(),
        maxConcurrentJobs: MAX_CONCURRENT_CONSTRUCTION_JOBS,
      };
    });
  }

  async getCatalog() {
    await this.ctx.catalog.ensureCatalog();
    const types = await this.ctx.models.BuildingType.findAll({ order: [['code', 'ASC']] });
    const levels = await this.ctx.models.BuildingLevel.findAll({ order: [['level', 'ASC']] });
    return types.filter((type) => type.category !== LIVESTOCK_BUILDING_CATEGORY && type.category !== AQUACULTURE_BUILDING_CATEGORY).map((type) => ({
      code: type.code,
      name: type.name,
      category: type.category,
      description: type.description,
      footprint: type.footprint,
      maxPerCity: type.maxPerCity,
      maxLevel: type.maxLevel,
      levels: levels
        .filter((l) => l.typeCode === type.code)
        .map((l) => ({
          level: l.level,
          name: l.name,
          description: l.description,
          cost: l.cost,
          buildSeconds: l.buildSeconds,
          stats: l.stats,
          modelKey: l.modelKey,
        })),
    }));
  }
}
