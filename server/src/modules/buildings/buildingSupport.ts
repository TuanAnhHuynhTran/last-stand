import type { Transaction } from 'sequelize';
import {
  BUILDING_DEFINITIONS,
  LIVESTOCK_BUILDING_CATEGORY,
  LIVESTOCK_FARM_DEFINITIONS,
  AQUACULTURE_BUILDING_CATEGORY,
  WATER_BODY_DEFINITIONS,
  RESOURCE_CODES,
  STARTING_MATERIALS,
  WorldGenerator,
  missingResources,
  normalizeRotation,
  type BuildingTypeCode,
  type CityMemberRole,
  type ResourceBag,
  type WorldBuildingDTO,
} from '@cityverse/shared';
import type { City } from '../../database/models/City.js';
import type { BuildingConstructionJob, WorldBuilding } from '../../database/models/Building.js';
import type { DatabaseModels } from '../../database/models/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { cityRole } from '../social/access.js';

export type Clock = () => Date;

// ─────────────────────────────────────────────────────────────────────────────
// Per-city mutex: serialises building mutations inside this process. The UNIQUE
// (city_id, q, r) footprint index is still the authority across processes.
// ─────────────────────────────────────────────────────────────────────────────
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.tails.set(key, tail);
    try {
      return await next;
    } finally {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic world per seed (ownership + terrain buildability), small LRU.
// ─────────────────────────────────────────────────────────────────────────────
const worldCache = new Map<string, WorldGenerator>();
export function getWorldForSeed(seed: string): WorldGenerator {
  let world = worldCache.get(seed);
  if (world) {
    worldCache.delete(seed);
  } else {
    world = new WorldGenerator(seed);
  }
  worldCache.set(seed, world);
  while (worldCache.size > 16) worldCache.delete(worldCache.keys().next().value as string);
  return world;
}

// ─────────────────────────────────────────────────────────────────────────────
// City access
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveCityAccess(
  models: DatabaseModels,
  cityId: string,
  userId: string,
  requireEdit: boolean
): Promise<{ city: City; role: CityMemberRole }> {
  const city = await models.City.findByPk(cityId);
  if (!city) throw new NotFoundError('Thanh pho khong ton tai', 'CITY_NOT_FOUND');
  // Phase 12: one access rule (public / friends-only / private) for every gameplay API.
  const role: CityMemberRole | null = await cityRole(models, city, userId);
  if (!role) throw new ForbiddenError('Ban khong du quyen truy cap thanh pho rieng tu nay', 'CITY_ACCESS_DENIED');
  if (requireEdit && role !== 'owner' && role !== 'co_mayor') {
    throw new ForbiddenError('Chi chu lanh dia moi duoc xay dung', 'BUILD_FORBIDDEN');
  }
  return { city, role };
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue seeding (building_types / building_levels from @cityverse/shared)
// ─────────────────────────────────────────────────────────────────────────────
export class BuildingCatalogService {
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
      for (const def of BUILDING_DEFINITIONS) {
        await this.models.BuildingType.upsert(
          {
            code: def.code,
            name: def.name,
            category: def.category,
            description: def.description,
            footprint: def.footprint.map((h) => ({ q: h.q, r: h.r })),
            maxPerCity: def.maxPerCity,
            maxLevel: def.levels.length,
          },
          { transaction }
        );
        for (const lvl of def.levels) {
          const existing = await this.models.BuildingLevel.findOne({
            where: { typeCode: def.code, level: lvl.level },
            transaction,
          });
          const values = {
            typeCode: def.code,
            level: lvl.level,
            name: lvl.name,
            description: lvl.description,
            cost: lvl.cost,
            buildSeconds: lvl.buildSeconds,
            stats: lvl.stats,
            modelKey: lvl.modelKey,
          };
          if (existing) await existing.update(values, { transaction });
          else await this.models.BuildingLevel.create(values, { transaction });
        }
      }
      // Livestock farms own a world_buildings row (their land + level); register their types too.
      // Water bodies (Phase 6) own world_buildings rows the same way.
      const managed = [
        ...LIVESTOCK_FARM_DEFINITIONS.map((d) => ({ ...d, category: LIVESTOCK_BUILDING_CATEGORY })),
        ...WATER_BODY_DEFINITIONS.map((d) => ({ ...d, category: AQUACULTURE_BUILDING_CATEGORY })),
      ];
      for (const def of managed) {
        await this.models.BuildingType.upsert(
          {
            code: def.code,
            name: def.name,
            category: def.category,
            description: def.description,
            footprint: [],
            maxPerCity: null,
            maxLevel: def.levels.length,
          },
          { transaction }
        );
        for (const lvl of def.levels) {
          const existing = await this.models.BuildingLevel.findOne({ where: { typeCode: def.code, level: lvl.level }, transaction });
          const values = {
            typeCode: def.code,
            level: lvl.level,
            name: lvl.name,
            description: lvl.description,
            cost: lvl.cost,
            buildSeconds: lvl.upgradeSeconds,
            stats: {},
            modelKey: lvl.modelKey,
          };
          if (existing) await existing.update(values, { transaction });
          else await this.models.BuildingLevel.create(values, { transaction });
        }
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resources: coins in city_economies, materials in city_resources.
// ─────────────────────────────────────────────────────────────────────────────
export class ResourceService {
  constructor(private readonly models: DatabaseModels) {}

  private lock(t: Transaction): Transaction['LOCK'][keyof Transaction['LOCK']] | undefined {
    return this.models.sequelize.getDialect() === 'mysql' ? t.LOCK.UPDATE : undefined;
  }

  async getBag(cityId: string, t: Transaction): Promise<ResourceBag> {
    const economy = await this.models.CityEconomy.findOne({ where: { cityId }, transaction: t, lock: this.lock(t) });
    if (!economy) throw new NotFoundError('Khong tim thay kinh te thanh pho', 'ECONOMY_NOT_FOUND');
    const rows = await this.ensureMaterialRows(cityId, t);
    const bag: ResourceBag = { coins: economy.cityCoins, wood: 0, stone: 0 };
    for (const row of rows) {
      if (row.resourceCode === 'wood' || row.resourceCode === 'stone') bag[row.resourceCode] = row.amount;
    }
    return bag;
  }

  /** Deducts `cost` or throws INSUFFICIENT_RESOURCES without changing anything. */
  async charge(cityId: string, cost: ResourceBag, t: Transaction): Promise<ResourceBag> {
    const have = await this.getBag(cityId, t);
    const missing = missingResources(have, cost);
    if (missing.length > 0) {
      throw new BadRequestError('Khong du tai nguyen', 'INSUFFICIENT_RESOURCES', {
        missing,
        need: RESOURCE_CODES.map((c) => `${c}:${cost[c]}`),
        have: RESOURCE_CODES.map((c) => `${c}:${have[c]}`),
      });
    }
    return this.apply(cityId, have, cost, -1, t);
  }

  async refund(cityId: string, amount: ResourceBag, t: Transaction): Promise<ResourceBag> {
    const have = await this.getBag(cityId, t);
    return this.apply(cityId, have, amount, 1, t);
  }

  private async apply(cityId: string, have: ResourceBag, delta: ResourceBag, sign: 1 | -1, t: Transaction): Promise<ResourceBag> {
    const next: ResourceBag = {
      coins: have.coins + sign * delta.coins,
      wood: have.wood + sign * delta.wood,
      stone: have.stone + sign * delta.stone,
    };
    await this.models.CityEconomy.update({ cityCoins: next.coins }, { where: { cityId }, transaction: t });
    for (const code of ['wood', 'stone'] as const) {
      await this.models.CityResource.update({ amount: next[code] }, { where: { cityId, resourceCode: code }, transaction: t });
    }
    return next;
  }

  private async ensureMaterialRows(cityId: string, t: Transaction) {
    const rows = await this.models.CityResource.findAll({ where: { cityId }, transaction: t, lock: this.lock(t) });
    const have = new Set(rows.map((r) => r.resourceCode));
    for (const code of ['wood', 'stone'] as const) {
      if (!have.has(code)) {
        rows.push(
          await this.models.CityResource.create(
            { cityId, resourceCode: code, amount: STARTING_MATERIALS[code] },
            { transaction: t }
          )
        );
      }
    }
    return rows;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping
// ─────────────────────────────────────────────────────────────────────────────
export function toBuildingDTO(
  b: WorldBuilding & { typeCode: BuildingTypeCode },
  footprint: { q: number; r: number }[],
  job: BuildingConstructionJob | null
): WorldBuildingDTO {
  return {
    id: b.id,
    cityId: b.cityId,
    typeCode: b.typeCode,
    level: b.level,
    status: b.status,
    anchorQ: b.anchorQ,
    anchorR: b.anchorR,
    rotation: normalizeRotation(b.rotation),
    footprint: b.typeCode === 'road' ? [{ q: b.anchorQ, r: b.anchorR }] : footprint.map((f) => ({ q: f.q, r: f.r })),
    activeJob: job
      ? {
          id: job.id,
          jobType: job.jobType,
          fromLevel: job.fromLevel,
          targetLevel: job.targetLevel,
          cost: job.cost,
          startedAt: new Date(job.startedAt).toISOString(),
          finishesAt: new Date(job.finishesAt).toISOString(),
          status: job.status,
        }
      : null,
    createdAt: new Date(b.createdAt).toISOString(),
    updatedAt: new Date(b.updatedAt).toISOString(),
  };
}

/** Ownership belongs to the city, never to the cached seed instance. */
export async function getWorldForCity(models: DatabaseModels, city: City, t: Transaction): Promise<WorldGenerator> {
  const world = new WorldGenerator(city.worldSeed);
  const rows = await models.WorldDiscovery.findAll({ where: { cityId: city.id, status: 'claimed' }, transaction: t });
  world.setClaims(rows);
  return world;
}
