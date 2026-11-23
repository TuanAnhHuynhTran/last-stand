/**
 * Livestock gameplay (Phase 5). The backend owns the gameplay state; the frontend animates it.
 *
 *  - Land: every farm owns a world_buildings row + building_footprints (the same land-claim
 *    system as buildings — no parallel occupancy table). Level, status and invested resources
 *    live on that row; upgrades are building_construction_jobs completed by the building settler.
 *  - Time: before any read or write the city's farms are simulated from `last_simulated_at`
 *    to "now" (shared `simulateLivestock`), so offline time counts and nothing runs per frame.
 *    Animal positions are never stored — only health / satiety / thirst / status.
 *  - Rewards: finished batches become `ready`; collecting flips each one to `collected` with a
 *    conditional UPDATE inside the per-city lock, so a batch can never be paid out twice.
 */
import { Op, UniqueConstraintError, type Transaction } from 'sequelize';
import {
  ANIMAL_TYPE_DEFINITIONS,
  CARETAKER_HIRE_COST,
  DEMOLISH_REFUND_RATE,
  FEED_RECIPE_DEFINITIONS,
  HEX_DIRECTIONS,
  LIVESTOCK_FARM_DEFINITIONS,
  LIVESTOCK_PRODUCT_CODES,
  MAX_LIVESTOCK_FARM_HEXES,
  NURSERY_BREED_FACTOR,
  addResources,
  animalPrice,
  animalProductivity,
  animalStatus,
  canBreed,
  caretakersNeeded,
  checkFarmZoneShape,
  effectiveWaterSource,
  emptyResources,
  feedCapacity,
  getAnimalBreed,
  getAnimalDefinition,
  getFeedRecipe,
  getLivestockFarmDefinition,
  getLivestockLevel,
  hexKey,
  initialTraits,
  isMountFarmType,
  isMountSpecies,
  isWithinWorldBounds,
  laborFactor,
  livestockCapacity,
  livestockCreateCost,
  livestockExpandCost,
  livestockLevel,
  livestockUpgradeCost,
  meatFromAnimal,
  planRanchTiles,
  ranchOccupant,
  simulateLivestock,
  suppliesLeft,
  waterCapacity,
  type AnimalStatus,
  type AnimalTypeCode,
  type AxialCoord,
  type BreedAnimalsInput,
  type BuyAnimalsInput,
  type CreateLivestockFarmInput,
  type ExpandLivestockFarmInput,
  type FeedLivestockInput,
  type HerdStatusDTO,
  type HerdSummaryDTO,
  type LevelChange,
  type LivestockFarmDTO,
  type LivestockMutationResultDTO,
  type LivestockProductBag,
  type LivestockProductCode,
  type LivestockSimState,
  type LivestockStateDTO,
  type PlacementWorld,
  type ProduceCode,
  type ProductAmounts,
  type RanchTile,
  type SetCaretakersInput,
  type SimAnimalState,
  type TransferAnimalInput,
  type WaterSource,
  type MountTraitsDTO,
} from '@cityverse/shared';
import type { City } from '../../database/models/City.js';
import type { BuildingConstructionJob, WorldBuilding } from '../../database/models/Building.js';
import type {
  FarmAnimal,
  LivestockFarm,
  LivestockFarmTile,
  LivestockProductionJob,
} from '../../database/models/Livestock.js';
import type { DatabaseModels } from '../../database/models/index.js';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { BuildingUpgradeService, type BuildingContext } from '../buildings/building.service.js';
import { getWorldForCity } from '../buildings/buildingSupport.js';
import { ProduceService } from '../farming/farm.service.js';
import { careRecord, loadTraits, releaseAnimals, settleAnimalTraining } from '../mounts/mountSupport.js';

const NAMES: Record<AnimalTypeCode, string[]> = {
  chicken: ['Bông', 'Mơ', 'Mít', 'Bắp', 'Na', 'Kem', 'Lúa', 'Đậu', 'Gạo', 'Xôi'],
  pig: ['Ủn', 'Mập', 'Hồng', 'Bánh Bao', 'Tròn', 'Đào'],
  cow: ['Sữa', 'Bơ', 'Mây', 'Đốm', 'Kem Dâu', 'Phô Mai'],
  sheep: ['Bông Gòn', 'Mây Trắng', 'Kẹo', 'Len', 'Tuyết', 'Xù'],
  goat: ['Râu', 'Sừng', 'Nhảy', 'Đá', 'Gạo Nếp', 'Mè'],
  horse: ['Gió', 'Xích Thố', 'Mây Bay', 'Sấm', 'Tia Chớp', 'Hạt Dẻ', 'Bạch Vân', 'Phi Long'],
  elephant: ['Núi', 'Bông Sen', 'Tượng Vàng', 'Trầm', 'Đá Xám', 'Sấm Rền'],
};

const OPEN_JOB_STATUSES = ['in_progress', 'ready'] as const;
const EPS = 1e-4;

/** Seeds animal_species and animal_feed_recipes from @cityverse/shared (outside the city transaction). */
class LivestockCatalogService {
  private ready: Promise<void> | null = null;

  constructor(private readonly models: DatabaseModels) {}

  ensureCatalog(): Promise<void> {
    this.ready ??= this.models.sequelize
      .transaction(async (transaction) => {
        for (const a of ANIMAL_TYPE_DEFINITIONS) {
          await this.models.AnimalSpecies.upsert(
            {
              code: a.code,
              name: a.name,
              farmType: a.farmType,
              price: a.price,
              growSeconds: a.growSeconds,
              lifespanSeconds: a.lifespanSeconds,
              capacityPerHex: a.capacityPerHex,
              feedPerMinute: a.feedPerMinute,
              waterPerMinute: a.waterPerMinute,
              products: { ...a.products },
              meatYield: a.meatYield,
              productionSeconds: a.productionSeconds,
              breedSeconds: a.breedSeconds,
              animalsPerCaretaker: a.animalsPerCaretaker,
              breeds: a.breeds.map((b) => ({ ...b })),
            },
            { transaction }
          );
        }
        for (const r of FEED_RECIPE_DEFINITIONS) {
          await this.models.AnimalFeedRecipe.upsert(
            {
              code: r.code,
              name: r.name,
              description: r.description,
              ingredients: { ...r.ingredients },
              nutrition: r.nutrition,
              quality: r.quality,
              species: [...r.species],
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

interface FarmBundle {
  farm: LivestockFarm;
  building: WorldBuilding;
  tiles: LivestockFarmTile[];
  animals: FarmAnimal[];
  jobs: LivestockProductionJob[];
  upgradeJob: BuildingConstructionJob | null;
  herders: number;
  traits: Map<string, MountTraitsDTO>;
}

/** Natural water: a lake / river on or next to the farm, otherwise a well. */
function detectWaterSource(world: PlacementWorld, hexes: readonly AxialCoord[]): WaterSource {
  for (const h of hexes) {
    for (const d of [{ q: 0, r: 0 }, ...HEX_DIRECTIONS]) {
      const q = h.q + d.q;
      const r = h.r + d.r;
      if (isWithinWorldBounds(q, r) && world.getHexTile(q, r).isWater) return 'lake';
    }
  }
  return 'well';
}

const ms = (d: Date | string): number => new Date(d).getTime();

export class LivestockService {
  private readonly catalog: LivestockCatalogService;
  private readonly stock: ProduceService;
  private readonly upgrades: BuildingUpgradeService;

  constructor(private readonly ctx: BuildingContext) {
    this.catalog = new LivestockCatalogService(ctx.models);
    this.stock = new ProduceService(ctx.models);
    this.upgrades = new BuildingUpgradeService(ctx);
  }

  private get models(): DatabaseModels {
    return this.ctx.models;
  }

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

  // ── Settlement (timestamp simulation) ──────────────────────────────────────
  /** Simulates every farm of the city up to now, then completes due upgrades. */
  async settleCity(cityId: string, t: Transaction): Promise<void> {
    const farms = await this.models.LivestockFarm.findAll({ where: { cityId }, transaction: t });
    for (const farm of farms) await this.settleFarm(farm, t);
    await this.upgrades.settleJobs(cityId, t);
    // Tile roles depend on the level (storage at L2, nursery / waste at L3).
    for (const farm of farms) {
      const building = await this.models.WorldBuilding.findByPk(farm.buildingId, {
        transaction: t,
      });
      const tiles = await this.models.LivestockFarmTile.findAll({
        where: { farmId: farm.id },
        transaction: t,
      });
      if (building && !sameRoles(tiles, planRanchTiles(tiles, building.level, farm.farmType)))
        await this.writeTiles(farm, tiles, building.level, t);
    }
    // Phase 9: stable training programs finish on server time (exactly once).
    await settleAnimalTraining(this.models, cityId, this.ctx.now(), t);
  }

  private async settleFarm(farm: LivestockFarm, t: Transaction): Promise<void> {
    const now = this.ctx.now().getTime();
    const from = ms(farm.lastSimulatedAt);
    if (now <= from) return;
    const building = await this.models.WorldBuilding.findByPk(farm.buildingId, { transaction: t });
    if (!building) return;
    const [tileCount, animals, jobs, upgradeJobs] = await Promise.all([
      this.models.LivestockFarmTile.count({ where: { farmId: farm.id }, transaction: t }),
      this.models.FarmAnimal.findAll({
        where: { farmId: farm.id },
        order: [['createdAt', 'ASC']],
        transaction: t,
      }),
      this.models.LivestockProductionJob.findAll({
        where: { farmId: farm.id, status: [...OPEN_JOB_STATUSES] },
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
    // Upgrades that completed in the span apply from their completion time.
    const changes: LevelChange[] = upgradeJobs.map((j) => ({
      atMs: ms(j.finishesAt),
      level: j.targetLevel,
    }));
    const startLevel = upgradeJobs.length ? upgradeJobs[0].fromLevel : building.level;
    const batchRow =
      jobs.find((j) => j.jobType === 'produce' && j.status === 'in_progress') ?? null;
    const state: LivestockSimState = {
      farmType: farm.farmType,
      level: startLevel,
      hexCount: tileCount,
      // Hired caretakers + villagers working here as herders (Phase 7).
      caretakers: farm.caretakers + (await this.herders(farm.id, t)),
      waterSource: farm.waterSource,
      feedStock: farm.feedStock,
      feedQuality: farm.feedQuality,
      waterStock: farm.waterStock,
      animals: animals.map(toSimAnimal),
      batch: batchRow
        ? {
            id: batchRow.id,
            startedAtMs: ms(batchRow.startedAt),
            finishesAtMs: ms(batchRow.finishesAt),
            progress: { ...batchRow.progress },
            work: batchRow.productiveSeconds,
            exposure: batchRow.animalSeconds,
          }
        : null,
      readyBatches: jobs.filter((j) => j.jobType === 'produce' && j.status === 'ready').length,
      breeding: jobs
        .filter((j) => j.jobType === 'breed' && j.status === 'in_progress' && j.speciesCode)
        .map((j) => ({
          id: j.id,
          species: j.speciesCode!,
          breed: j.breed,
          finishesAtMs: ms(j.finishesAt),
        })),
    };

    const res = simulateLivestock(state, from, now, changes);
    const reached = res.simulatedToMs;

    // Batches
    for (const f of res.finished) {
      const hasOutput = Object.values(f.output).some((n) => (n ?? 0) > 0);
      const values = {
        status: hasOutput ? ('ready' as const) : ('completed' as const),
        progress: f.batch.progress,
        output: f.output,
        efficiency: f.efficiency,
        productiveSeconds: f.batch.work,
        animalSeconds: f.batch.exposure,
        completedAt: new Date(f.batch.finishesAtMs),
      };
      if (f.batch.id)
        await this.models.LivestockProductionJob.update(values, {
          where: { id: f.batch.id },
          transaction: t,
        });
      else if (hasOutput) {
        await this.models.LivestockProductionJob.create(
          {
            cityId: farm.cityId,
            farmId: farm.id,
            jobType: 'produce',
            speciesCode: null,
            breed: null,
            startedAt: new Date(f.batch.startedAtMs),
            finishesAt: new Date(f.batch.finishesAtMs),
            ...values,
          },
          { transaction: t }
        );
      }
    }
    const b = res.state.batch;
    if (b) {
      const values = {
        progress: b.progress,
        productiveSeconds: b.work,
        animalSeconds: b.exposure,
        efficiency: b.exposure > 0 ? b.work / b.exposure : 0,
      };
      if (b.id)
        await this.models.LivestockProductionJob.update(values, {
          where: { id: b.id },
          transaction: t,
        });
      else {
        await this.models.LivestockProductionJob.create(
          {
            cityId: farm.cityId,
            farmId: farm.id,
            jobType: 'produce',
            speciesCode: null,
            breed: null,
            startedAt: new Date(b.startedAtMs),
            finishesAt: new Date(b.finishesAtMs),
            status: 'in_progress',
            output: {},
            ...values,
          },
          { transaction: t }
        );
      }
    }

    // Breeding → newborns
    if (res.endedBreeding.length) {
      await this.models.LivestockProductionJob.update(
        { status: 'completed', completedAt: new Date(reached) },
        { where: { id: res.endedBreeding }, transaction: t }
      );
    }
    let count = animals.length;
    for (const birth of res.births) {
      const sim = res.state.animals.find((a) => a.id === birth.tempId)!;
      await this.models.FarmAnimal.create(
        {
          cityId: farm.cityId,
          farmId: farm.id,
          speciesCode: birth.species,
          breed: getAnimalBreed(birth.species, birth.breed).code,
          name: animalName(birth.species, count),
          bornAt: new Date(birth.bornAtMs),
          growsUpAt: new Date(birth.growsUpAtMs),
          health: sim.health,
          satiety: sim.satiety,
          thirst: sim.thirst,
          status: animalStatus(sim, reached),
        },
        { transaction: t }
      );
      count += 1;
    }

    // Starvation deaths (Phase 9 species): the animal is gone, its duties / tack released.
    const dead = res.deaths.map((d) => d.id).filter((id) => animals.some((a) => a.id === id));
    if (dead.length) {
      await releaseAnimals(this.models, farm.cityId, dead, t, new Date(reached));
      for (const d of res.deaths) {
        const row = animals.find((a) => a.id === d.id);
        if (!row) continue;
        await careRecord(this.models, { cityId: farm.cityId, farmId: farm.id, animalId: row.id, kind: 'death', note: row.name, at: new Date(d.atMs) }, t);
        await row.destroy({ transaction: t });
      }
    }

    // Animal stats (no positions — the frontend animates movement).
    for (const row of animals) {
      if (dead.includes(row.id)) continue;
      const sim = res.state.animals.find((a) => a.id === row.id);
      if (!sim) continue;
      const status = animalStatus(sim, reached);
      if (
        Math.abs(sim.health - row.health) > EPS ||
        Math.abs(sim.satiety - row.satiety) > EPS ||
        Math.abs(sim.thirst - row.thirst) > EPS ||
        Math.abs((sim.starving ?? 0) - row.starvingSeconds) > EPS ||
        status !== row.status
      ) {
        await row.update(
          { health: sim.health, satiety: sim.satiety, thirst: sim.thirst, status, starvingSeconds: sim.starving ?? 0 },
          { transaction: t }
        );
      }
    }

    await farm.update(
      {
        feedStock: res.state.feedStock,
        feedQuality: res.state.feedQuality,
        waterStock: res.state.waterStock,
        lastSimulatedAt: new Date(reached),
      },
      { transaction: t }
    );
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  async getState(cityId: string, userId: string): Promise<LivestockStateDTO> {
    return this.mutate(cityId, userId, false, async (_city, t) => {
      const farms = await this.models.LivestockFarm.findAll({
        where: { cityId },
        order: [['createdAt', 'ASC']],
        transaction: t,
      });
      const dtos: LivestockFarmDTO[] = [];
      for (const farm of farms) dtos.push(toLivestockFarmDTO(await this.bundle(farm, t)));
      return {
        farms: dtos,
        ...(await this.stocks(cityId, t)),
        serverTime: this.ctx.now().toISOString(),
      };
    });
  }

  /** Herd status of one farm (synchronised to now). */
  async getHerd(cityId: string, farmId: string, userId: string): Promise<HerdStatusDTO> {
    return this.mutate(cityId, userId, false, async (_city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      const dto = toLivestockFarmDTO(await this.bundle(farm, t));
      return {
        farm: dto,
        summary: herdSummary(dto, this.ctx.now().getTime()),
        serverTime: this.ctx.now().toISOString(),
      };
    });
  }

  async getCatalog() {
    await this.catalog.ensureCatalog();
    const [species, recipes] = await Promise.all([
      this.models.AnimalSpecies.findAll({ order: [['code', 'ASC']] }),
      this.models.AnimalFeedRecipe.findAll({ order: [['code', 'ASC']] }),
    ]);
    return {
      farmTypes: LIVESTOCK_FARM_DEFINITIONS,
      animals: species.map((a) => a.get({ plain: true })),
      feedRecipes: recipes.map((r) => r.get({ plain: true })),
    };
  }

  // ── Farm land ──────────────────────────────────────────────────────────────
  async create(
    cityId: string,
    userId: string,
    input: CreateLivestockFarmInput
  ): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const def = getLivestockFarmDefinition(input.farmType);
      const world = await getWorldForCity(this.ctx.models, city, t);
      const check = checkFarmZoneShape(world, input.hexes, await this.ctx.occupiedMap(cityId, t), {
        minHexes: def.minHexes,
        maxHexes: MAX_LIVESTOCK_FARM_HEXES,
      });
      if (!check.valid) {
        throw new BadRequestError('Trang trai khong hop le', 'INVALID_LIVESTOCK_FARM', {
          issues: check.issues,
        });
      }
      const cost = livestockCreateCost(input.farmType, input.hexes.length);
      await this.ctx.resources.charge(cityId, cost, t);
      const tiles = planRanchTiles(input.hexes, 1);
      const barn = tiles.find((x) => x.role === 'barn') ?? tiles[0];
      const building = await this.models.WorldBuilding.create(
        {
          cityId,
          typeCode: input.farmType,
          level: 1,
          status: 'active',
          anchorQ: barn.q,
          anchorR: barn.r,
          rotation: 0,
          createdBy: userId,
          invested: cost,
        },
        { transaction: t }
      );
      await this.writeFootprint(cityId, building.id, input.hexes, t);
      const farm = await this.models.LivestockFarm.create(
        {
          cityId,
          buildingId: building.id,
          farmType: input.farmType,
          feedStock: 0,
          feedQuality: 0,
          waterStock: waterCapacity(input.farmType, 1, input.hexes.length),
          waterSource: detectWaterSource(world, input.hexes),
          caretakers: 1, // the first caretaker comes with the farm
          lastSimulatedAt: this.ctx.now(),
        },
        { transaction: t }
      );
      await this.writeTiles(farm, input.hexes, 1, t);
      return this.result(cityId, farm, t);
    });
  }

  /** Adds connected hexes; the new land is built up to the farm's current level. */
  async expand(
    cityId: string,
    farmId: string,
    userId: string,
    input: ExpandLivestockFarmInput
  ): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      const building = await this.loadBuildingOf(farm, t);
      if (building.status !== 'active')
        throw new ConflictError('Trang trai dang nang cap', 'LIVESTOCK_FARM_BUSY');
      const tiles = await this.models.LivestockFarmTile.findAll({
        where: { farmId: farm.id },
        transaction: t,
      });
      const world = await getWorldForCity(this.ctx.models, city, t);
      const check = checkFarmZoneShape(world, input.hexes, await this.ctx.occupiedMap(cityId, t), {
        baseHexes: tiles,
        selfOccupant: ranchOccupant(farm.id),
        minHexes: getLivestockFarmDefinition(farm.farmType).minHexes,
        maxHexes: MAX_LIVESTOCK_FARM_HEXES,
      });
      if (!check.valid) {
        throw new BadRequestError('Vung mo rong khong hop le', 'INVALID_LIVESTOCK_FARM', {
          issues: check.issues,
        });
      }
      const cost = livestockExpandCost(farm.farmType, building.level, input.hexes.length);
      await this.ctx.resources.charge(cityId, cost, t);
      await this.writeFootprint(cityId, building.id, input.hexes, t);
      await building.update(
        { invested: addResources(building.invested, cost) },
        { transaction: t }
      );
      const all = [...tiles.map((x) => ({ q: x.q, r: x.r })), ...input.hexes];
      await this.writeTiles(farm, all, building.level, t);
      await farm.update({ waterSource: detectWaterSource(world, all) }, { transaction: t });
      return this.result(cityId, farm, t);
    });
  }

  /** Timed upgrade through the shared construction queue (same id, same land). */
  async upgrade(
    cityId: string,
    farmId: string,
    userId: string
  ): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      const building = await this.loadBuildingOf(farm, t);
      if (building.status !== 'active')
        throw new ConflictError('Trang trai dang nang cap', 'LIVESTOCK_FARM_BUSY');
      const next = getLivestockLevel(farm.farmType, building.level + 1);
      if (!next) throw new BadRequestError('Trang trai da dat cap toi da', 'MAX_LEVEL_REACHED');
      await this.ctx.assertJobSlot(cityId, t);
      const hexes = await this.models.LivestockFarmTile.count({
        where: { farmId: farm.id },
        transaction: t,
      });
      const cost = livestockUpgradeCost(farm.farmType, next.level, hexes)!;
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
      return this.result(cityId, farm, t);
    });
  }

  async remove(
    cityId: string,
    farmId: string,
    userId: string
  ): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      const building = await this.loadBuildingOf(farm, t);
      const job = await this.ctx.activeJob(building.id, t);
      const pending = job ? job.cost : emptyResources();
      const refund = addResources(
        pending,
        addResources(building.invested, pending, -1),
        DEMOLISH_REFUND_RATE
      );
      await this.models.LivestockProductionJob.destroy({
        where: { farmId: farm.id },
        transaction: t,
      });
      const herd = await this.models.FarmAnimal.findAll({ where: { farmId: farm.id }, transaction: t });
      await releaseAnimals(this.models, cityId, herd.map((a) => a.id), t, this.ctx.now());
      await this.models.AnimalTrainingJob.destroy({ where: { farmId: farm.id }, transaction: t });
      await this.models.AnimalCareRecord.destroy({ where: { farmId: farm.id }, transaction: t });
      await this.models.FarmAnimal.destroy({ where: { farmId: farm.id }, transaction: t });
      await this.models.LivestockFarmTile.destroy({ where: { farmId: farm.id }, transaction: t });
      await farm.destroy({ transaction: t });
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

  // ── Animals ────────────────────────────────────────────────────────────────
  /** Buys young animals of a breed (they grow up over time). */
  async buyAnimals(
    cityId: string,
    farmId: string,
    userId: string,
    input: BuyAnimalsInput
  ): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      this.assertSpecies(farm, input.animalCode);
      const def = getAnimalDefinition(input.animalCode);
      if (input.breed && !def.breeds.some((b) => b.code === input.breed)) {
        throw new BadRequestError('Giong vat nuoi khong hop le', 'INVALID_BREED');
      }
      const breed = getAnimalBreed(input.animalCode, input.breed);
      await this.assertRoom(farm, input.count, t);
      await this.ctx.resources.charge(
        cityId,
        { coins: animalPrice(input.animalCode, breed.code) * input.count, wood: 0, stone: 0 },
        t
      );
      const now = this.ctx.now();
      const existing = await this.models.FarmAnimal.count({
        where: { farmId: farm.id },
        transaction: t,
      });
      await this.models.FarmAnimal.bulkCreate(
        Array.from({ length: input.count }, (_, i) => ({
          cityId,
          farmId: farm.id,
          speciesCode: input.animalCode,
          breed: breed.code,
          name: animalName(input.animalCode, existing + i),
          bornAt: now,
          growsUpAt: new Date(now.getTime() + def.growSeconds * 1000),
          health: 1,
          satiety: 0.8,
          thirst: 0.2,
          status: 'young' as AnimalStatus,
          // Horses / elephants arrive half-wild with breed-based stats.
          ...(isMountSpecies(input.animalCode) ? initialTraits(input.animalCode, breed.code) : {}),
        })),
        { transaction: t }
      );
      if (isMountSpecies(input.animalCode)) {
        await careRecord(this.models, { cityId, farmId: farm.id, animalId: null, kind: 'received', note: `${input.count} ${def.name} (${breed.name})`, at: now }, t);
      }
      return this.result(cityId, farm, t);
    });
  }

  /** Sells an animal: full price for adults, half for young ones. */
  async sellAnimal(
    cityId: string,
    farmId: string,
    animalId: string,
    userId: string
  ): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      const animal = await this.loadAnimal(farm, animalId, t);
      const price = animalPrice(animal.speciesCode, animal.breed);
      const adult = this.ctx.now().getTime() >= ms(animal.growsUpAt);
      await releaseAnimals(this.models, cityId, [animal.id], t, this.ctx.now());
      await animal.destroy({ transaction: t });
      await this.ctx.resources.refund(
        cityId,
        { coins: adult ? price : Math.floor(price / 2), wood: 0, stone: 0 },
        t
      );
      return this.result(cityId, farm, t);
    });
  }

  /** Takes an adult to the butcher: meat into the city stock (healthier animals give more). */
  async harvestAnimal(
    cityId: string,
    farmId: string,
    animalId: string,
    userId: string
  ): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      const animal = await this.loadAnimal(farm, animalId, t);
      if (getAnimalDefinition(animal.speciesCode).butcher === false) {
        throw new ConflictError('Thu lam viec khong mang di mo', 'ANIMAL_NOT_BUTCHERABLE');
      }
      if (this.ctx.now().getTime() < ms(animal.growsUpAt)) {
        throw new ConflictError('Vat nuoi chua truong thanh', 'ANIMAL_NOT_ADULT');
      }
      const meat = meatFromAnimal({
        species: animal.speciesCode,
        breed: animal.breed,
        health: animal.health,
      });
      await animal.destroy({ transaction: t });
      await this.stock.add(cityId, 'meat', meat, t);
      await farm.update({ totalProduced: farm.totalProduced + meat }, { transaction: t });
      return { ...(await this.result(cityId, farm, t)), collected: { meat } };
    });
  }

  /** Moves an animal to another farm of the city that keeps its species and has room. */
  async transferAnimal(
    cityId: string,
    farmId: string,
    animalId: string,
    userId: string,
    input: TransferAnimalInput
  ): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      const animal = await this.loadAnimal(farm, animalId, t);
      if (input.targetFarmId === farm.id)
        throw new BadRequestError('Vat nuoi da o trang trai nay', 'SAME_FARM');
      const target = await this.loadFarm(cityId, input.targetFarmId, t);
      this.assertSpecies(target, animal.speciesCode);
      const busy = (await loadTraits(this.models, [animal], t)).get(animal.id);
      if (busy?.use || busy?.training) throw new ConflictError('Thu dang duoc su dung / huan luyen', 'ANIMAL_IN_USE');
      await this.assertRoom(target, 1, t);
      await animal.update({ farmId: target.id }, { transaction: t });
      const res = await this.result(cityId, farm, t);
      return { ...res, otherFarm: toLivestockFarmDTO(await this.bundle(target, t)) };
    });
  }

  /** Two healthy, fed adults of a species produce a young one (nursery at level 3 is faster). */
  async breed(
    cityId: string,
    farmId: string,
    userId: string,
    input: BreedAnimalsInput
  ): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      const building = await this.loadBuildingOf(farm, t);
      this.assertSpecies(farm, input.animalCode);
      const running = await this.models.LivestockProductionJob.count({
        where: { farmId: farm.id, jobType: 'breed', status: 'in_progress' },
        transaction: t,
      });
      if (running) throw new ConflictError('Khu sinh san dang ban', 'BREEDING_IN_PROGRESS');
      const now = this.ctx.now().getTime();
      const animals = (
        await this.models.FarmAnimal.findAll({ where: { farmId: farm.id }, transaction: t })
      ).map(toSimAnimal);
      const adults = animals.filter((a) => a.species === input.animalCode && now >= a.growsUpAtMs);
      if (adults.length < 2)
        throw new ConflictError('Can it nhat 2 con truong thanh', 'NOT_ENOUGH_ADULTS');
      if (!canBreed(animals, input.animalCode, now)) {
        throw new ConflictError(
          'Vat nuoi chua du khoe hoac chua no de sinh san',
          'PARENTS_NOT_HEALTHY'
        );
      }
      await this.assertRoom(farm, 1, t);
      const def = getAnimalDefinition(input.animalCode);
      const breedFeed = def.feedPerMinute * 4;
      if (farm.feedStock < breedFeed) {
        throw new ConflictError(
          `Kho thuc an cua trai can it nhat ${breedFeed} dinh duong de sinh san`,
          'INSUFFICIENT_FARM_FEED'
        );
      }
      await farm.update({ feedStock: farm.feedStock - breedFeed }, { transaction: t });
      const lvl = livestockLevel(farm.farmType, building.level);
      const seconds =
        (def.breedSeconds * (lvl.nursery ? NURSERY_BREED_FACTOR : 1)) / lvl.productionSpeed;
      // The young one inherits the herd's most common breed.
      const counts = new Map<string, number>();
      for (const a of adults) counts.set(a.breed ?? '', (counts.get(a.breed ?? '') ?? 0) + 1);
      const breed = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] || null;
      await this.models.LivestockProductionJob.create(
        {
          cityId,
          farmId: farm.id,
          jobType: 'breed',
          speciesCode: input.animalCode,
          breed,
          startedAt: new Date(now),
          finishesAt: new Date(now + Math.round(seconds * 1000)),
          status: 'in_progress',
          progress: {},
          output: {},
        },
        { transaction: t }
      );
      return this.result(cityId, farm, t);
    });
  }

  // ── Feed, water, caretakers ────────────────────────────────────────────────
  /** Turns city produce into nutrition in the farm's feed store using a recipe. */
  async feed(
    cityId: string,
    farmId: string,
    userId: string,
    input: FeedLivestockInput
  ): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      const building = await this.loadBuildingOf(farm, t);
      const recipe = getFeedRecipe(input.recipeCode);
      if (
        !recipe.species.some((s) => getLivestockFarmDefinition(farm.farmType).animals.includes(s))
      ) {
        throw new BadRequestError(
          'Vat nuoi cua trai khong an loai thuc an nay',
          'RECIPE_NOT_SUITABLE'
        );
      }
      const hexes = await this.models.LivestockFarmTile.count({
        where: { farmId: farm.id },
        transaction: t,
      });
      const cap = feedCapacity(farm.farmType, building.level, hexes);
      const add = recipe.nutrition * input.batches;
      if (farm.feedStock + add > cap + EPS) {
        throw new AppError(409, 'FEED_STORAGE_FULL', 'Kho thuc an cua trai khong du cho', {
          maxBatches: [String(Math.max(0, Math.floor((cap - farm.feedStock) / recipe.nutrition)))],
        });
      }
      const need: Partial<Record<ProduceCode, number>> = {};
      for (const [c, n] of Object.entries(recipe.ingredients) as [ProduceCode, number][])
        need[c] = n * input.batches;
      await this.stock.consume(cityId, need, t);
      const total = farm.feedStock + add;
      await farm.update(
        {
          feedStock: total,
          feedQuality:
            total > 0
              ? (farm.feedStock * farm.feedQuality + add * recipe.quality) / total
              : recipe.quality,
        },
        { transaction: t }
      );
      if (isMountFarmType(farm.farmType)) {
        await careRecord(this.models, { cityId, farmId: farm.id, animalId: null, kind: 'feed', note: `${recipe.name} ×${input.batches}`, at: this.ctx.now() }, t);
      }
      return this.result(cityId, farm, t);
    });
  }

  /** Caretakers haul water from the well and fill the troughs to the brim. */
  async water(cityId: string, farmId: string, userId: string): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      const building = await this.loadBuildingOf(farm, t);
      const hexes = await this.models.LivestockFarmTile.count({
        where: { farmId: farm.id },
        transaction: t,
      });
      await farm.update(
        { waterStock: waterCapacity(farm.farmType, building.level, hexes) },
        { transaction: t }
      );
      if (isMountFarmType(farm.farmType)) {
        await careRecord(this.models, { cityId, farmId: farm.id, animalId: null, kind: 'water', at: this.ctx.now() }, t);
      }
      return this.result(cityId, farm, t);
    });
  }

  /** Sets the number of caretakers (hiring costs coins; letting them go is free). */
  async setCaretakers(
    cityId: string,
    farmId: string,
    userId: string,
    input: SetCaretakersInput
  ): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      const building = await this.loadBuildingOf(farm, t);
      const max = livestockLevel(farm.farmType, building.level).maxCaretakers;
      if (input.count > max)
        throw new BadRequestError(
          `Trai cap ${building.level} chi co cho cho ${max} nguoi cham soc`,
          'CARETAKER_LIMIT'
        );
      const hired = input.count - farm.caretakers;
      if (hired > 0)
        await this.ctx.resources.charge(
          cityId,
          { coins: hired * CARETAKER_HIRE_COST, wood: 0, stone: 0 },
          t
        );
      await farm.update({ caretakers: input.count }, { transaction: t });
      return this.result(cityId, farm, t);
    });
  }

  // ── Products ───────────────────────────────────────────────────────────────
  /** Collects every ready batch exactly once. */
  async collect(
    cityId: string,
    farmId: string,
    userId: string
  ): Promise<LivestockMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (_city, t) => {
      const farm = await this.loadFarm(cityId, farmId, t);
      const collected = await this.collectInTx(farm, t, true);
      return { ...(await this.result(cityId, farm, t)), collected: collected ?? {} };
    });
  }

  /** Villagers working as herders (Phase 7) count as caretakers. */
  private herders(farmId: string, t: Transaction): Promise<number> {
    return this.models.SurvivorJob.count({
      where: { workplaceKind: 'livestock_farm', workplaceId: farmId },
      transaction: t,
    });
  }

  /**
   * Automation (Phase 7): farms of level 2+ with a herder at work send their ready products to
   * storage by themselves. Runs inside the caller's transaction / city lock.
   */
  async autoCollect(
    cityId: string,
    farmIds: readonly string[],
    t: Transaction
  ): Promise<ProductAmounts> {
    await this.settleCity(cityId, t);
    const total: ProductAmounts = {};
    for (const id of farmIds) {
      const farm = await this.models.LivestockFarm.findOne({
        where: { id, cityId },
        transaction: t,
      });
      if (!farm) continue;
      const building = await this.models.WorldBuilding.findByPk(farm.buildingId, {
        transaction: t,
      });
      if (!building || building.level < 2) continue;
      const got = await this.collectInTx(farm, t, false);
      for (const [c, n] of Object.entries(got ?? {}) as [LivestockProductCode, number][])
        total[c] = (total[c] ?? 0) + n;
    }
    return total;
  }

  private async collectInTx(
    farm: LivestockFarm,
    t: Transaction,
    strict: boolean
  ): Promise<ProductAmounts | null> {
    const cityId = farm.cityId;
    const ready = await this.models.LivestockProductionJob.findAll({
      where: { farmId: farm.id, jobType: 'produce', status: 'ready' },
      order: [['finishesAt', 'ASC']],
      transaction: t,
    });
    if (!ready.length) {
      if (!strict) return null;
      const running = await this.models.LivestockProductionJob.count({
        where: { farmId: farm.id, jobType: 'produce', status: 'in_progress' },
        transaction: t,
      });
      if (running) throw new ConflictError('San pham chua san sang', 'PRODUCTION_NOT_READY');
      throw new ConflictError('Chua co dot san xuat nao', 'NO_PRODUCTION');
    }
    const now = this.ctx.now();
    const collected: ProductAmounts = {};
    let total = 0;
    for (const job of ready) {
      // Conditional flip: a batch that is no longer `ready` pays nothing.
      const [changed] = await this.models.LivestockProductionJob.update(
        { status: 'collected', collectedAt: now },
        { where: { id: job.id, status: 'ready' }, transaction: t }
      );
      if (changed !== 1) continue;
      for (const [code, n] of Object.entries(job.output) as [LivestockProductCode, number][]) {
        if (!n) continue;
        collected[code] = (collected[code] ?? 0) + n;
        total += n;
      }
    }
    for (const [code, n] of Object.entries(collected) as [LivestockProductCode, number][])
      await this.stock.add(cityId, code, n, t);
    await farm.update({ totalProduced: farm.totalProduced + total }, { transaction: t });
    return collected;
  }

  /** DTO of one farm inside the caller's transaction (used by the mount service). */
  async dtoOf(farm: LivestockFarm, t: Transaction): Promise<LivestockFarmDTO> {
    return toLivestockFarmDTO(await this.bundle(farm, t));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private async loadFarm(cityId: string, farmId: string, t: Transaction): Promise<LivestockFarm> {
    const farm = await this.models.LivestockFarm.findOne({
      where: { id: farmId, cityId },
      transaction: t,
    });
    if (!farm) throw new NotFoundError('Trang trai khong ton tai', 'LIVESTOCK_FARM_NOT_FOUND');
    return farm;
  }

  private async loadBuildingOf(farm: LivestockFarm, t: Transaction): Promise<WorldBuilding> {
    const b = await this.models.WorldBuilding.findByPk(farm.buildingId, { transaction: t });
    if (!b) throw new NotFoundError('Trang trai khong ton tai', 'LIVESTOCK_FARM_NOT_FOUND');
    return b;
  }

  private async loadAnimal(
    farm: LivestockFarm,
    animalId: string,
    t: Transaction
  ): Promise<FarmAnimal> {
    const animal = await this.models.FarmAnimal.findOne({
      where: { id: animalId, farmId: farm.id },
      transaction: t,
    });
    if (!animal) throw new NotFoundError('Vat nuoi khong ton tai', 'ANIMAL_NOT_FOUND');
    return animal;
  }

  private assertSpecies(farm: LivestockFarm, code: AnimalTypeCode): void {
    if (!getLivestockFarmDefinition(farm.farmType).animals.includes(code)) {
      throw new BadRequestError('Vat nuoi khong phu hop voi trang trai nay', 'ANIMAL_NOT_ALLOWED');
    }
  }

  /** Capacity counts animals plus young ones still being bred. */
  private async assertRoom(farm: LivestockFarm, adding: number, t: Transaction): Promise<void> {
    const building = await this.loadBuildingOf(farm, t);
    const [count, breeding, tiles] = await Promise.all([
      this.models.FarmAnimal.count({ where: { farmId: farm.id }, transaction: t }),
      this.models.LivestockProductionJob.count({
        where: { farmId: farm.id, jobType: 'breed', status: 'in_progress' },
        transaction: t,
      }),
      this.models.LivestockFarmTile.count({ where: { farmId: farm.id }, transaction: t }),
    ]);
    const cap = livestockCapacity(farm.farmType, building.level, tiles);
    if (count + breeding + adding > cap) {
      throw new ConflictError(`Trang trai chi chua duoc ${cap} con`, 'FARM_FULL');
    }
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

  private async writeTiles(
    farm: LivestockFarm,
    hexes: readonly AxialCoord[],
    level: number,
    t: Transaction
  ): Promise<void> {
    const planned = planRanchTiles(
      hexes.map((h) => ({ q: h.q, r: h.r })),
      level,
      farm.farmType
    );
    await this.models.LivestockFarmTile.destroy({ where: { farmId: farm.id }, transaction: t });
    await this.models.LivestockFarmTile.bulkCreate(
      planned.map((x) => ({ cityId: farm.cityId, farmId: farm.id, q: x.q, r: x.r, role: x.role })),
      { transaction: t }
    );
  }

  private async bundle(farm: LivestockFarm, t: Transaction): Promise<FarmBundle> {
    await farm.reload({ transaction: t });
    const building = await this.loadBuildingOf(farm, t);
    const [tiles, animals, jobs, upgradeJob] = await Promise.all([
      this.models.LivestockFarmTile.findAll({ where: { farmId: farm.id }, transaction: t }),
      this.models.FarmAnimal.findAll({
        where: { farmId: farm.id },
        order: [['createdAt', 'ASC']],
        transaction: t,
      }),
      this.models.LivestockProductionJob.findAll({
        where: { farmId: farm.id, status: [...OPEN_JOB_STATUSES] },
        order: [['startedAt', 'ASC']],
        transaction: t,
      }),
      this.ctx.activeJob(building.id, t),
    ]);
    return {
      farm,
      building,
      tiles,
      animals,
      jobs,
      upgradeJob,
      herders: await this.herders(farm.id, t),
      traits: await loadTraits(this.models, animals, t),
    };
  }

  private async stocks(cityId: string, t: Transaction) {
    return {
      products: (await this.stock.getAmounts(
        cityId,
        LIVESTOCK_PRODUCT_CODES,
        t
      )) as LivestockProductBag,
      produce: await this.stock.getBag(cityId, t),
      resources: await this.ctx.resources.getBag(cityId, t),
    };
  }

  private async result(
    cityId: string,
    farm: LivestockFarm | null,
    t: Transaction
  ): Promise<LivestockMutationResultDTO> {
    const dto = farm ? toLivestockFarmDTO(await this.bundle(farm, t)) : null;
    return {
      farm: dto,
      ...(await this.stocks(cityId, t)),
      serverTime: this.ctx.now().toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping
// ─────────────────────────────────────────────────────────────────────────────
function animalName(code: AnimalTypeCode, index: number): string {
  const names = NAMES[code];
  return `${names[index % names.length]}${index >= names.length ? ` ${Math.floor(index / names.length) + 1}` : ''}`;
}

function toSimAnimal(a: FarmAnimal): SimAnimalState {
  return {
    id: a.id,
    species: a.speciesCode,
    breed: a.breed,
    bornAtMs: ms(a.bornAt),
    growsUpAtMs: ms(a.growsUpAt),
    health: a.health,
    satiety: a.satiety,
    thirst: a.thirst,
    starving: a.starvingSeconds,
  };
}

function sameRoles(stored: readonly LivestockFarmTile[], planned: readonly RanchTile[]): boolean {
  const map = new Map(stored.map((x) => [hexKey(x.q, x.r), x.role]));
  return (
    planned.length === stored.length && planned.every((p) => map.get(hexKey(p.q, p.r)) === p.role)
  );
}

const iso = (d: Date | string | null | undefined): string | null =>
  d ? new Date(d).toISOString() : null;
const round = (v: number, k = 1000): number => Math.round(v * k) / k;

export function toLivestockFarmDTO({
  farm,
  building,
  tiles,
  animals,
  jobs,
  upgradeJob,
  herders,
  traits,
}: FarmBundle): LivestockFarmDTO {
  const level = building.level;
  const lvl = livestockLevel(farm.farmType, level);
  const simulatedMs = ms(farm.lastSimulatedAt);
  return {
    id: farm.id,
    buildingId: building.id,
    cityId: farm.cityId,
    farmType: farm.farmType,
    name: getLivestockFarmDefinition(farm.farmType).name,
    level,
    status: building.status === 'upgrading' ? 'upgrading' : 'active',
    upgradeStartedAt: upgradeJob ? iso(upgradeJob.startedAt) : null,
    upgradeFinishesAt: upgradeJob ? iso(upgradeJob.finishesAt) : null,
    hexes: tiles.map((x) => ({ q: x.q, r: x.r })),
    tiles: tiles.map((x) => ({ q: x.q, r: x.r, role: x.role })),
    capacity: livestockCapacity(farm.farmType, level, tiles.length),
    animals: animals.map((a) => ({
      id: a.id,
      animalCode: a.speciesCode,
      breed: a.breed,
      name: a.name,
      bornAt: new Date(a.bornAt).toISOString(),
      growsUpAt: new Date(a.growsUpAt).toISOString(),
      health: round(a.health),
      satiety: round(a.satiety),
      thirst: round(a.thirst),
      status: animalStatus(
        { health: a.health, satiety: a.satiety, thirst: a.thirst, growsUpAtMs: ms(a.growsUpAt) },
        simulatedMs
      ),
      traits: traits.get(a.id) ?? null,
    })),
    jobs: jobs.map((j) => ({
      id: j.id,
      jobType: j.jobType,
      animalCode: j.speciesCode,
      breed: j.breed,
      startedAt: new Date(j.startedAt).toISOString(),
      finishesAt: new Date(j.finishesAt).toISOString(),
      status: j.status,
      progress: Object.fromEntries(
        Object.entries(j.progress).map(([k, v]) => [k, round(v ?? 0, 100)])
      ),
      output: j.output,
      efficiency: round(j.efficiency),
    })),
    feedStock: round(farm.feedStock, 10),
    feedCapacity: feedCapacity(farm.farmType, level, tiles.length),
    feedQuality: round(farm.feedQuality),
    waterStock: round(farm.waterStock, 10),
    waterCapacity: waterCapacity(farm.farmType, level, tiles.length),
    waterSource: farm.waterSource,
    effectiveWaterSource: effectiveWaterSource(farm.farmType, level, farm.waterSource),
    caretakers: farm.caretakers + herders,
    maxCaretakers: lvl.maxCaretakers,
    caretakersNeeded: caretakersNeeded(animals.map((a) => a.speciesCode)),
    simulatedAt: new Date(simulatedMs).toISOString(),
    invested: building.invested,
    totalProduced: farm.totalProduced,
    createdAt: new Date(farm.createdAt).toISOString(),
    updatedAt: new Date(farm.updatedAt).toISOString(),
  };
}

export function herdSummary(f: LivestockFarmDTO, nowMs: number): HerdSummaryDTO {
  const sims = f.animals.map<SimAnimalState>((a) => ({
    id: a.id,
    species: a.animalCode,
    breed: a.breed,
    bornAtMs: ms(a.bornAt),
    growsUpAtMs: ms(a.growsUpAt),
    health: a.health,
    satiety: a.satiety,
    thirst: a.thirst,
  }));
  const bySpecies: HerdSummaryDTO['bySpecies'] = {};
  const byStatus: HerdSummaryDTO['byStatus'] = {};
  for (const a of f.animals) {
    bySpecies[a.animalCode] = (bySpecies[a.animalCode] ?? 0) + 1;
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  }
  const adults = sims.filter((a) => nowMs >= a.growsUpAtMs);
  const labor = laborFactor(f.caretakers, f.caretakersNeeded);
  const avg = (fn: (a: SimAnimalState) => number, list = sims) =>
    list.length ? round(list.reduce((s, a) => s + fn(a), 0) / list.length) : 0;
  const left = suppliesLeft(
    { animals: sims, feedStock: f.feedStock, waterStock: f.waterStock },
    nowMs
  );
  const readyOutput: ProductAmounts = {};
  for (const j of f.jobs) {
    if (j.jobType !== 'produce' || j.status !== 'ready') continue;
    for (const [c, n] of Object.entries(j.output) as [LivestockProductCode, number][])
      readyOutput[c] = (readyOutput[c] ?? 0) + n;
  }
  return {
    total: sims.length,
    adults: adults.length,
    young: sims.length - adults.length,
    bySpecies,
    byStatus,
    avgHealth: avg((a) => a.health),
    avgSatiety: avg((a) => a.satiety),
    avgThirst: avg((a) => a.thirst),
    productivity: avg((a) => animalProductivity(a, nowMs, labor, f.feedQuality), adults),
    laborFactor: round(labor),
    feedMinutesLeft: Number.isFinite(left.feedMinutes) ? round(left.feedMinutes, 10) : null,
    waterMinutesLeft: Number.isFinite(left.waterMinutes) ? round(left.waterMinutes, 10) : null,
    readyOutput,
  };
}
