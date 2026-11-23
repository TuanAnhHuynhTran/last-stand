/**
 * Villagers, daily life & economy (Phase 7). The backend owns gameplay; the client animates.
 *
 * Before every read / write the city is settled in one transaction (per-city lock):
 *  1. game clock (world_time_states) and the 5 founders on first use
 *  2. housing: one main home per survivor (UNIQUE), homeless villagers move into free houses
 *  3. jobs: one full-time job per survivor (UNIQUE); jobs at removed / unfinished workplaces end;
 *     auto-assignment fills open slots with the most skilled free villagers (if enabled)
 *  4. the economy is simulated per game hour from the last settlement to now (shared
 *     simulateEconomy): production, transport to storage, food & water, needs, arrivals
 *  5. automation: farmers tend fields, herders collect (L2+), fishers feed & harvest (L2+)
 *  6. the ledger (resource_transactions) records every change once; the clock moves on
 * There is no 3D AI and no villager position here.
 */
import { UniqueConstraintError, type Transaction } from 'sequelize';
import {
  BASE_STORAGE,
  ECONOMY_CODES,
  ECONOMY_LABELS,
  FOOD_VALUES,
  INITIAL_SURVIVORS,
  PRODUCTION_RECIPES,
  PROFESSION_DEFINITIONS,
  RESCUE_COST,
  RESCUE_HOURS,
  activityAt,
  autoTransfers,
  gameClock,
  getBuildingLevel,
  getRecipe,
  hourSeconds,
  houseCapacity,
  isLivestockFarmTypeCode,
  isProductionBuilding,
  isWaterBodyTypeCode,
  moodOf,
  outputBufferCapacity,
  recipesFor,
  resourceGroup,
  simulateEconomy,
  supplyDays,
  survivorIdentity,
  initialSkills,
  workerEfficiency,
  workplaceProfession,
  workplaceSlots,
  type AssignJobInput,
  type AxialCoord,
  type BuildingTypeCode,
  type EconProducer,
  type EconState,
  type EconomyStatsDTO,
  type HouseDTO,
  type MoveHomeInput,
  type PopulationMutationResultDTO,
  type PopulationSettingsInput,
  type PopulationStateDTO,
  type ProductionDTO,
  type ProfessionCode,
  type ResourceGroup,
  type SetRecipeInput,
  type SurvivorDTO,
  type WarningDTO,
  type WorkplaceDTO,
  type WorkplaceKind,
} from '@cityverse/shared';
import type { City } from '../../database/models/City.js';
import type { WorldBuilding } from '../../database/models/Building.js';
import type { ProductionJob, Survivor, SurvivorHousing, SurvivorJob, WorldTimeState } from '../../database/models/Population.js';
import type { DatabaseModels } from '../../database/models/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { BuildingUpgradeService, type BuildingContext } from '../buildings/building.service.js';
import { ProduceService, type FarmService } from '../farming/farm.service.js';
import { animalHaul } from '../mounts/mountSupport.js';
import type { LivestockService } from '../livestock/livestock.service.js';
import type { AquacultureService } from '../aquaculture/aquaculture.service.js';

/** Extra storage per warehouse worker. */
const WAREHOUSE_BONUS = 500;
const DEFAULT_DAY_SECONDS = 720;

interface Workplace {
  kind: WorkplaceKind;
  id: string;
  typeCode: string;
  name: string;
  level: number;
  profession: ProfessionCode;
  slots: number;
  hexes: AxialCoord[];
  ready: boolean;
}

interface House {
  building: WorldBuilding;
  capacity: number;
  hexes: AxialCoord[];
  ready: boolean;
}

interface CityView {
  ws: WorldTimeState;
  survivors: Survivor[];
  housing: SurvivorHousing[];
  jobs: SurvivorJob[];
  houses: House[];
  workplaces: Workplace[];
  production: ProductionJob[];
  buildings: WorldBuilding[];
  /** Survivors serving in the army (no civilian job) */
  soldiers: Set<string>;
}

const seedOf = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
};
const ms = (d: Date | string): number => new Date(d).getTime();
const round = (v: number, k = 1000): number => Math.round(v * k) / k;

/** Seeds professions and production_recipes from @cityverse/shared. */
class PopulationCatalog {
  private ready: Promise<void> | null = null;
  constructor(private readonly models: DatabaseModels) {}
  ensure(): Promise<void> {
    this.ready ??= this.models.sequelize
      .transaction(async (transaction) => {
        for (const p of PROFESSION_DEFINITIONS) {
          await this.models.Profession.upsert(
            { code: p.code, name: p.name, description: p.description, outfit: { ...p.outfit }, workClips: [...p.workClips] },
            { transaction }
          );
        }
        for (const r of PRODUCTION_RECIPES) {
          await this.models.ProductionRecipe.upsert(
            {
              code: r.code,
              buildingType: r.building,
              name: r.name,
              minLevel: r.minLevel,
              inputs: { ...r.inputs } as Record<string, number>,
              outputs: { ...r.outputs } as Record<string, number>,
              seconds: r.seconds,
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

export class PopulationService {
  private readonly catalog: PopulationCatalog;
  private readonly stock: ProduceService;
  private readonly upgrades: BuildingUpgradeService;

  constructor(
    private readonly ctx: BuildingContext,
    private readonly farms: FarmService,
    private readonly livestock: LivestockService,
    private readonly aqua: AquacultureService
  ) {
    this.catalog = new PopulationCatalog(ctx.models);
    this.stock = new ProduceService(ctx.models);
    this.upgrades = new BuildingUpgradeService(ctx);
  }

  private get models(): DatabaseModels {
    return this.ctx.models;
  }

  private async mutate<T>(cityId: string, userId: string, requireEdit: boolean, fn: (city: City, view: CityView, t: Transaction) => Promise<T>): Promise<T> {
    await this.catalog.ensure();
    return this.ctx.mutate(cityId, userId, requireEdit, async (city, t) => {
      await this.settle(city, t);
      return fn(city, await this.view(city, t), t);
    });
  }

  // ── Settlement ─────────────────────────────────────────────────────────────
  async settle(city: City, t: Transaction): Promise<void> {
    const now = this.ctx.now();
    // Finished construction first: new houses / workplaces become usable.
    await this.upgrades.settleJobs(city.id, t);
    const ws = await this.timeState(city.id, t);
    if (!ws.initialized) {
      for (let i = 0; i < INITIAL_SURVIVORS; i += 1) await this.createSurvivor(city.id, 'founder', seedOf(`${city.id}:${i}`), now, t);
      await ws.update({ initialized: true }, { transaction: t });
    }
    let view = await this.view(city, t);
    await this.cleanup(view, t);
    view = await this.view(city, t);
    await this.houseHomeless(view, t);
    if (ws.autoAssign) await this.autoAssign(await this.view(city, t), t, false);
    view = await this.view(city, t);
    await this.ensureProduction(city.id, view, t);
    view = await this.view(city, t);

    // Economy, per game hour since the last settlement.
    const from = this.hours(ws, ms(ws.lastSettledAt));
    const to = this.hours(ws, now.getTime());
    if (to > from) {
      const state = await this.econState(city, view, t);
      const res = simulateEconomy(state, from, to);
      const deltas: Record<string, number> = {};
      for (const codes of Object.values(res.transactions)) for (const [c, d] of Object.entries(codes)) deltas[c] = (deltas[c] ?? 0) + d;
      for (const [c, d] of Object.entries(deltas)) if (Math.abs(d) > 1e-9) await this.stock.add(city.id, c, d, t);
      await this.ledger(city.id, res.transactions, ws.lastSettledAt, now, t);
      for (const p of res.state.producers) {
        const row = view.production.find((x) => x.buildingId === p.id);
        if (row) await row.update({ progress: p.progress, buffer: p.buffer, status: p.status, batchesTotal: row.batchesTotal + p.batches }, { transaction: t });
      }
      for (const v of res.state.survivors) {
        const row = view.survivors.find((x) => x.id === v.id);
        if (!row) continue;
        if (Math.abs(row.health - v.health) + Math.abs(row.stamina - v.stamina) + Math.abs(row.satisfaction - v.satisfaction) > 1e-4 || row.professionCode) {
          await row.update({ health: v.health, stamina: v.stamina, satisfaction: v.satisfaction, skills: v.skills }, { transaction: t });
        }
      }
      let n = view.survivors.length;
      for (const a of res.arrivals) {
        await this.createSurvivor(city.id, a.reason, seedOf(`${city.id}:${n}`), now, t);
        n += 1;
      }
      await ws.update({ rescue: res.state.rescue }, { transaction: t });
      if (res.arrivals.length) {
        view = await this.view(city, t);
        await this.houseHomeless(view, t);
        if (ws.autoAssign) await this.autoAssign(await this.view(city, t), t, false);
      }
    }

    // Automation by the villagers at work.
    view = await this.view(city, t);
    const at = (kind: WorkplaceKind) => [...new Set(view.jobs.filter((j) => j.workplaceKind === kind).map((j) => j.workplaceId))];
    const auto: Record<string, Record<string, number>> = {};
    const farmIds = at('farm_zone');
    if (farmIds.length) auto.auto_harvest = (await this.farms.autoTend(city, farmIds, t)).harvested;
    const ranchIds = at('livestock_farm');
    if (ranchIds.length) auto.auto_collect = (await this.livestock.autoCollect(city.id, ranchIds, t)) as Record<string, number>;
    const pondIds = at('water_body');
    if (pondIds.length) auto.auto_fishing = await this.aqua.autoTend(city.id, pondIds, t);
    await this.ledger(city.id, auto, ws.lastSettledAt, now, t);
    await ws.update({ lastSettledAt: now }, { transaction: t });
  }

  private hours(ws: WorldTimeState, atMs: number): number {
    return gameClock(ms(ws.epoch), ws.daySeconds, atMs).totalHours;
  }

  private async timeState(cityId: string, t: Transaction): Promise<WorldTimeState> {
    const found = await this.models.WorldTimeState.findOne({ where: { cityId }, transaction: t });
    if (found) return found;
    const now = this.ctx.now();
    return this.models.WorldTimeState.create(
      { cityId, epoch: now, daySeconds: DEFAULT_DAY_SECONDS, lastSettledAt: now, autoAssign: true, naturalGrowth: false, rescue: null, initialized: false },
      { transaction: t }
    );
  }

  private async createSurvivor(cityId: string, origin: SurvivorDTO['origin'], seed: number, at: Date, t: Transaction): Promise<Survivor> {
    const id = survivorIdentity(seed);
    return this.models.Survivor.create(
      {
        cityId,
        name: id.name,
        professionCode: null,
        skills: initialSkills(seed),
        health: origin === 'rescue' ? 0.7 : 0.95,
        stamina: 0.9,
        satisfaction: 0.65,
        appearance: id.appearance,
        origin,
        seed: seed % 2147483647,
        assignable: true,
        arrivedAt: at,
      },
      { transaction: t }
    );
  }

  /** Buildings, fields, farms and ponds that employ villagers + houses. */
  private async view(city: City, t: Transaction): Promise<CityView> {
    const cityId = city.id;
    const [ws, survivors, housing, jobs, buildings, footprints, zones, zoneTiles, ranches, ponds, pondTiles, production] = await Promise.all([
      this.timeState(cityId, t),
      this.models.Survivor.findAll({ where: { cityId }, order: [['arrivedAt', 'ASC'], ['createdAt', 'ASC']], transaction: t }),
      this.models.SurvivorHousing.findAll({ where: { cityId }, order: [['movedInAt', 'ASC']], transaction: t }),
      this.models.SurvivorJob.findAll({ where: { cityId }, order: [['assignedAt', 'ASC']], transaction: t }),
      this.models.WorldBuilding.findAll({ where: { cityId }, transaction: t }),
      this.models.BuildingFootprint.findAll({ where: { cityId }, transaction: t }),
      this.models.FarmZone.findAll({ where: { cityId }, transaction: t }),
      this.models.FarmZoneTile.findAll({ where: { cityId }, transaction: t }),
      this.models.LivestockFarm.findAll({ where: { cityId }, transaction: t }),
      this.models.WaterBody.findAll({ where: { cityId }, transaction: t }),
      this.models.WaterBodyTile.findAll({ where: { cityId }, transaction: t }),
      this.models.ProductionJob.findAll({ where: { cityId }, transaction: t }),
    ]);
    const soldiers = new Set((await this.models.MilitaryUnit.findAll({ where: { cityId }, attributes: ['survivorId'], transaction: t })).map((u) => u.survivorId));
    const hexesOf = (buildingId: string) => footprints.filter((f) => f.buildingId === buildingId).map((f) => ({ q: f.q, r: f.r }));
    const byId = new Map(buildings.map((b) => [b.id, b]));
    const workplaces: Workplace[] = [];
    const houses: House[] = [];
    for (const b of buildings) {
      if (isLivestockFarmTypeCode(b.typeCode) || isWaterBodyTypeCode(b.typeCode)) continue;
      if (b.typeCode === 'house') {
        houses.push({ building: b, capacity: houseCapacity(b.level), hexes: hexesOf(b.id), ready: b.status !== 'constructing' });
        continue;
      }
      const profession = workplaceProfession('building', b.typeCode);
      if (!profession) continue;
      workplaces.push({
        kind: 'building',
        id: b.id,
        typeCode: b.typeCode,
        name: getBuildingLevel(b.typeCode as BuildingTypeCode, b.level)?.name ?? b.typeCode,
        level: b.level,
        profession,
        slots: workplaceSlots('building', b.typeCode, b.level),
        hexes: hexesOf(b.id),
        ready: b.status !== 'constructing',
      });
    }
    for (const z of zones) {
      const hexes = zoneTiles.filter((x) => x.zoneId === z.id).map((x) => ({ q: x.q, r: x.r }));
      workplaces.push({ kind: 'farm_zone', id: z.id, typeCode: z.zoneType, name: z.zoneType, level: z.level, profession: 'farmer', slots: workplaceSlots('farm_zone', z.zoneType, z.level, hexes.length), hexes, ready: true });
    }
    for (const r of ranches) {
      const b = byId.get(r.buildingId);
      if (!b) continue;
      workplaces.push({ kind: 'livestock_farm', id: r.id, typeCode: r.farmType, name: r.farmType, level: b.level, profession: 'herder', slots: workplaceSlots('livestock_farm', r.farmType, b.level), hexes: hexesOf(b.id), ready: true });
    }
    for (const p of ponds) {
      const b = byId.get(p.buildingId);
      if (!b) continue;
      const hexes = pondTiles.filter((x) => x.waterBodyId === p.id).map((x) => ({ q: x.q, r: x.r }));
      workplaces.push({ kind: 'water_body', id: p.id, typeCode: p.type, name: p.type, level: b.level, profession: 'fisher', slots: workplaceSlots('water_body', p.type, b.level, hexes.length), hexes, ready: true });
    }
    return { ws, survivors, housing, jobs, houses, workplaces, production, buildings, soldiers };
  }

  /** Ends jobs / homes at removed or unfinished places and trims anything over capacity. */
  private async cleanup(v: CityView, t: Transaction): Promise<void> {
    const wp = new Map(v.workplaces.map((w) => [`${w.kind}:${w.id}`, w]));
    const used = new Map<string, number>();
    for (const j of v.jobs) {
      const w = wp.get(`${j.workplaceKind}:${j.workplaceId}`);
      const key = `${j.workplaceKind}:${j.workplaceId}`;
      const n = (used.get(key) ?? 0) + 1;
      used.set(key, n);
      if (!w || !w.ready || n > w.slots || !v.survivors.some((s) => s.id === j.survivorId) || v.soldiers.has(j.survivorId)) await j.destroy({ transaction: t });
    }
    const hs = new Map(v.houses.map((h) => [h.building.id, h]));
    const occ = new Map<string, number>();
    for (const h of v.housing) {
      const house = hs.get(h.buildingId);
      const n = (occ.get(h.buildingId) ?? 0) + 1;
      occ.set(h.buildingId, n);
      if (!house || !house.ready || n > house.capacity) await h.destroy({ transaction: t });
    }
  }

  private async houseHomeless(v: CityView, t: Transaction): Promise<void> {
    const homed = new Set(v.housing.map((h) => h.survivorId));
    const free = v.houses
      .filter((h) => h.ready)
      .map((h) => ({ h, left: h.capacity - v.housing.filter((x) => x.buildingId === h.building.id).length }));
    for (const s of v.survivors) {
      if (homed.has(s.id)) continue;
      const slot = free.find((f) => f.left > 0);
      if (!slot) break;
      slot.left -= 1;
      await this.models.SurvivorHousing.create({ cityId: s.cityId, survivorId: s.id, buildingId: slot.h.building.id, movedInAt: this.ctx.now() }, { transaction: t });
    }
  }

  /** Fills open slots with free villagers, best skill first. `force` also takes manually freed ones. */
  private async autoAssign(v: CityView, t: Transaction, force: boolean): Promise<number> {
    const busy = new Set(v.jobs.map((j) => j.survivorId));
    const free = v.survivors.filter((s) => !busy.has(s.id) && !v.soldiers.has(s.id) && (force || s.assignable));
    let assigned = 0;
    for (const w of v.workplaces) {
      if (!w.ready) continue;
      let open = w.slots - v.jobs.filter((j) => j.workplaceKind === w.kind && j.workplaceId === w.id).length;
      while (open > 0 && free.length) {
        free.sort((a, b) => (b.skills[w.profession] ?? 0) - (a.skills[w.profession] ?? 0));
        const s = free.shift()!;
        await this.createJob(s, w, false, t);
        open -= 1;
        assigned += 1;
      }
    }
    return assigned;
  }

  private async createJob(s: Survivor, w: Workplace, manual: boolean, t: Transaction): Promise<void> {
    await this.models.SurvivorJob.destroy({ where: { survivorId: s.id }, transaction: t });
    try {
      await this.models.SurvivorJob.create(
        { cityId: s.cityId, survivorId: s.id, workplaceKind: w.kind, workplaceId: w.id, professionCode: w.profession, manual, assignedAt: this.ctx.now() },
        { transaction: t }
      );
    } catch (err) {
      if (err instanceof UniqueConstraintError) throw new ConflictError('Cu dan da co viec', 'ALREADY_EMPLOYED');
      throw err;
    }
    await s.update({ professionCode: w.profession, assignable: true }, { transaction: t });
  }

  private async ensureProduction(cityId: string, v: CityView, t: Transaction): Promise<void> {
    for (const b of v.buildings) {
      if (!isProductionBuilding(b.typeCode)) continue;
      if (v.production.some((p) => p.buildingId === b.id)) continue;
      const recipe = recipesFor(b.typeCode as BuildingTypeCode, b.level)[0]?.code ?? null;
      await this.models.ProductionJob.create({ cityId, buildingId: b.id, recipeCode: recipe, progress: 0, buffer: {}, status: 'idle' }, { transaction: t });
    }
    // Rows of removed buildings go away (no orphan buffers).
    for (const p of v.production) if (!v.buildings.some((b) => b.id === p.buildingId)) await p.destroy({ transaction: t });
  }

  private storageCapacity(v: CityView): number {
    let cap = BASE_STORAGE;
    for (const b of v.buildings) {
      if ((b.typeCode === 'storage' || b.typeCode === 'military_depot') && b.status !== 'constructing') cap += getBuildingLevel(b.typeCode, b.level)?.stats.storage ?? 0;
    }
    const warehouseIds = new Set(v.workplaces.filter((w) => w.profession === 'warehouse').map((w) => w.id));
    cap += v.jobs.filter((j) => warehouseIds.has(j.workplaceId)).length * WAREHOUSE_BONUS;
    return cap;
  }

  private async econState(city: City, v: CityView, t: Transaction): Promise<EconState> {
    const stock = await this.stock.getAmounts(city.id, ECONOMY_CODES, t);
    const jobBy = new Map(v.jobs.map((j) => [j.survivorId, j]));
    const homeBy = new Map(v.housing.map((h) => [h.survivorId, h.buildingId]));
    const ready = new Map(v.buildings.map((b) => [b.id, b]));
    const producers: EconProducer[] = v.production
      .map((p) => {
        const b = ready.get(p.buildingId);
        if (!b || b.status === 'constructing') return null;
        return {
          id: p.buildingId,
          level: b.level,
          recipe: p.recipeCode,
          progress: p.progress,
          buffer: { ...p.buffer },
          workerIds: v.jobs.filter((j) => j.workplaceKind === 'building' && j.workplaceId === b.id).map((j) => j.survivorId),
          status: p.status,
          batches: 0,
        };
      })
      .filter((p): p is EconProducer => p !== null);
    const haulers = new Set(v.workplaces.filter((w) => w.typeCode === 'market' || w.typeCode === 'storage').map((w) => w.id));
    return {
      daySeconds: v.ws.daySeconds,
      seed: seedOf(city.id) % 100000,
      stock: { ...stock },
      storageCap: this.storageCapacity(v),
      survivors: v.survivors.map((s) => ({
        id: s.id,
        profession: jobBy.get(s.id)?.professionCode ?? s.professionCode,
        employed: jobBy.has(s.id),
        homeId: homeBy.get(s.id) ?? null,
        health: s.health,
        stamina: s.stamina,
        satisfaction: s.satisfaction,
        skills: { ...s.skills },
      })),
      producers,
      housingCapacity: v.houses.filter((h) => h.ready).reduce((a, h) => a + h.capacity, 0),
      transporters: v.jobs.filter((j) => haulers.has(j.workplaceId)).length,
      animalHaulPerHour: await animalHaul(this.models, city.id, t),
      naturalGrowth: v.ws.naturalGrowth,
      rescue: v.ws.rescue,
    };
  }

  private async ledger(cityId: string, tx: Record<string, Record<string, number>>, from: Date, to: Date, t: Transaction, refId: string | null = null): Promise<void> {
    const rows = Object.entries(tx).flatMap(([reason, codes]) =>
      Object.entries(codes)
        .filter(([, d]) => Math.abs(d) > 1e-6)
        .map(([code, d]) => ({ cityId, resourceCode: code, delta: round(d, 1000), reason, refId, periodStart: from, periodEnd: to }))
    );
    if (rows.length) await this.models.ResourceTransaction.bulkCreate(rows, { transaction: t });
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  async getState(cityId: string, userId: string): Promise<PopulationStateDTO> {
    return this.mutate(cityId, userId, false, (city, v, t) => this.toState(city, v, t));
  }

  async getEconomy(cityId: string, userId: string, days: number): Promise<EconomyStatsDTO> {
    return this.mutate(cityId, userId, false, async (city, v, t) => {
      const since = new Date(this.ctx.now().getTime() - days * v.ws.daySeconds * 1000);
      const rows = await this.models.ResourceTransaction.findAll({ where: { cityId: city.id }, transaction: t });
      const groups = new Map<ResourceGroup, { income: number; expense: number }>();
      const byReason: Record<string, number> = {};
      const byCode: Record<string, { income: number; expense: number }> = {};
      for (const r of rows) {
        if (ms(r.periodEnd) < since.getTime()) continue;
        const g = groups.get(resourceGroup(r.resourceCode)) ?? { income: 0, expense: 0 };
        const c = (byCode[r.resourceCode] ??= { income: 0, expense: 0 });
        if (r.delta >= 0) {
          g.income += r.delta;
          c.income += r.delta;
        } else {
          g.expense -= r.delta;
          c.expense -= r.delta;
        }
        groups.set(resourceGroup(r.resourceCode), g);
        byReason[r.reason] = round((byReason[r.reason] ?? 0) + r.delta, 100);
      }
      const stock = await this.stock.getAmounts(city.id, ECONOMY_CODES, t);
      const sd = supplyDays(stock, v.survivors.length);
      return {
        days,
        groups: [...groups.entries()].map(([group, x]) => ({ group, income: round(x.income, 10), expense: round(x.expense, 10) })),
        byReason,
        byCode: Object.fromEntries(Object.entries(byCode).map(([k, x]) => [k, { income: round(x.income, 10), expense: round(x.expense, 10) }])),
        foodDays: Number.isFinite(sd.food) ? round(sd.food, 10) : null,
        waterDays: Number.isFinite(sd.water) ? round(sd.water, 10) : null,
        storageCapacity: this.storageCapacity(v),
      };
    });
  }

  // ── Mutations ──────────────────────────────────────────────────────────────
  async assign(cityId: string, userId: string, input: AssignJobInput): Promise<PopulationMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const s = v.survivors.find((x) => x.id === input.survivorId);
      if (!s) throw new NotFoundError('Cu dan khong ton tai', 'SURVIVOR_NOT_FOUND');
      if (v.soldiers.has(s.id)) throw new ConflictError('Cu dan dang phuc vu trong quan doi', 'SURVIVOR_IS_SOLDIER');
      const w = v.workplaces.find((x) => x.kind === input.kind && x.id === input.workplaceId);
      if (!w) throw new NotFoundError('Noi lam viec khong ton tai', 'WORKPLACE_NOT_FOUND');
      if (!w.ready) throw new ConflictError('Cong trinh dang xay, chua lam viec duoc', 'WORKPLACE_NOT_READY');
      const current = v.jobs.find((j) => j.survivorId === s.id);
      if (current && current.workplaceKind === w.kind && current.workplaceId === w.id) throw new ConflictError('Cu dan da lam viec o day', 'ALREADY_THERE');
      const taken = v.jobs.filter((j) => j.workplaceKind === w.kind && j.workplaceId === w.id).length;
      if (taken >= w.slots) throw new ConflictError(`Noi lam viec chi co ${w.slots} cho`, 'WORKPLACE_FULL');
      // One full-time job: assigning moves the villager from the previous one.
      await this.createJob(s, w, true, t);
      return { state: await this.toState(city, await this.view(city, t), t) };
    });
  }

  async unassign(cityId: string, userId: string, survivorId: string): Promise<PopulationMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const s = v.survivors.find((x) => x.id === survivorId);
      if (!s) throw new NotFoundError('Cu dan khong ton tai', 'SURVIVOR_NOT_FOUND');
      const n = await this.models.SurvivorJob.destroy({ where: { survivorId }, transaction: t });
      if (!n) throw new ConflictError('Cu dan dang khong co viec', 'NOT_EMPLOYED');
      // Auto-assignment leaves people the player took off a job alone.
      await s.update({ assignable: false }, { transaction: t });
      return { state: await this.toState(city, await this.view(city, t), t) };
    });
  }

  async runAutoAssign(cityId: string, userId: string): Promise<PopulationMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      await this.autoAssign(v, t, true);
      return { state: await this.toState(city, await this.view(city, t), t) };
    });
  }

  async moveHome(cityId: string, userId: string, survivorId: string, input: MoveHomeInput): Promise<PopulationMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const s = v.survivors.find((x) => x.id === survivorId);
      if (!s) throw new NotFoundError('Cu dan khong ton tai', 'SURVIVOR_NOT_FOUND');
      const house = v.houses.find((h) => h.building.id === input.buildingId);
      if (!house) throw new NotFoundError('Nha khong ton tai', 'HOUSE_NOT_FOUND');
      if (!house.ready) throw new ConflictError('Nha dang xay', 'HOUSE_NOT_READY');
      const current = v.housing.find((h) => h.survivorId === s.id);
      if (current?.buildingId === house.building.id) throw new ConflictError('Cu dan da o nha nay', 'ALREADY_THERE');
      if (v.housing.filter((h) => h.buildingId === house.building.id).length >= house.capacity) {
        throw new ConflictError(`Nha chi o duoc ${house.capacity} nguoi`, 'HOUSE_FULL');
      }
      // One main home: moving replaces the old one.
      await this.models.SurvivorHousing.destroy({ where: { survivorId: s.id }, transaction: t });
      await this.models.SurvivorHousing.create({ cityId: city.id, survivorId: s.id, buildingId: house.building.id, movedInAt: this.ctx.now() }, { transaction: t });
      return { state: await this.toState(city, await this.view(city, t), t) };
    });
  }

  async setRecipe(cityId: string, userId: string, buildingId: string, input: SetRecipeInput): Promise<PopulationMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const job = v.production.find((p) => p.buildingId === buildingId);
      const b = v.buildings.find((x) => x.id === buildingId);
      if (!job || !b) throw new NotFoundError('Cong trinh khong san xuat', 'NOT_PRODUCTION_BUILDING');
      const recipe = getRecipe(input.recipeCode);
      if (!recipe || recipe.building !== b.typeCode) throw new BadRequestError('Cong thuc khong phu hop', 'RECIPE_NOT_ALLOWED');
      if (b.level < recipe.minLevel) throw new BadRequestError(`Can nang cap len cap ${recipe.minLevel}`, 'RECIPE_LOCKED');
      await job.update({ recipeCode: recipe.code, progress: 0, status: 'idle' }, { transaction: t });
      return { state: await this.toState(city, await this.view(city, t), t) };
    });
  }

  /** Moves a building's finished goods to storage (once; limited by storage capacity). */
  async collect(cityId: string, userId: string, buildingId: string): Promise<PopulationMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const job = v.production.find((p) => p.buildingId === buildingId);
      if (!job) throw new NotFoundError('Cong trinh khong san xuat', 'NOT_PRODUCTION_BUILDING');
      const cap = this.storageCapacity(v);
      const stock = await this.stock.getAmounts(city.id, ECONOMY_CODES, t);
      const buffer = { ...job.buffer };
      const collected: Record<string, number> = {};
      for (const [c, n] of Object.entries(buffer)) {
        const move = Math.max(0, Math.min(n, cap - ((stock as Record<string, number>)[c] ?? 0)));
        if (move <= 0) continue;
        collected[c] = move;
        buffer[c] = n - move;
      }
      if (!Object.keys(collected).length) throw new ConflictError('Khong co san pham de nhan', 'NOTHING_TO_COLLECT');
      await job.update({ buffer }, { transaction: t });
      for (const [c, n] of Object.entries(collected)) await this.stock.add(city.id, c, n, t);
      await this.ledger(city.id, { collect: collected }, this.ctx.now(), this.ctx.now(), t, buildingId);
      return { state: await this.toState(city, await this.view(city, t), t), collected };
    });
  }

  async updateSettings(cityId: string, userId: string, input: PopulationSettingsInput): Promise<PopulationMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const patch: Partial<{ autoAssign: boolean; naturalGrowth: boolean; daySeconds: number; epoch: Date }> = {};
      if (input.autoAssign !== undefined) patch.autoAssign = input.autoAssign;
      if (input.naturalGrowth !== undefined) patch.naturalGrowth = input.naturalGrowth;
      if (input.daySeconds !== undefined && input.daySeconds !== v.ws.daySeconds) {
        // Keep the current game time: move the epoch so the clock continues from here.
        const now = this.ctx.now().getTime();
        const elapsedHours = this.hours(v.ws, now) - gameClock(ms(v.ws.epoch), v.ws.daySeconds, ms(v.ws.epoch)).totalHours;
        patch.daySeconds = input.daySeconds;
        patch.epoch = new Date(now - (elapsedHours / 24) * input.daySeconds * 1000);
      }
      await v.ws.update(patch, { transaction: t });
      return { state: await this.toState(city, await this.view(city, t), t) };
    });
  }

  /** Sends a rescue team: costs coins and food, returns with survivors after RESCUE_HOURS. */
  async rescue(cityId: string, userId: string): Promise<PopulationMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      if (v.ws.rescue) throw new ConflictError('Doi cuu ho dang lam nhiem vu', 'RESCUE_IN_PROGRESS');
      const stock = (await this.stock.getAmounts(city.id, ECONOMY_CODES, t)) as Record<string, number>;
      let need = RESCUE_COST.food;
      const use: Record<string, number> = {};
      for (const [code, value] of FOOD_VALUES) {
        if (need <= 1e-9) break;
        const take = Math.min(stock[code] ?? 0, need / value);
        if (take > 0) {
          use[code] = take;
          need -= take * value;
        }
      }
      if (need > 1e-6) throw new ConflictError('Khong du luong thuc cho doi cuu ho', 'NOT_ENOUGH_FOOD');
      await this.ctx.resources.charge(city.id, { coins: RESCUE_COST.coins, wood: 0, stone: 0 }, t);
      for (const [c, n] of Object.entries(use)) await this.stock.add(city.id, c, -n, t);
      await this.ledger(city.id, { rescue: Object.fromEntries(Object.entries(use).map(([c, n]) => [c, -n])) }, this.ctx.now(), this.ctx.now(), t);
      const count = 2 + (seedOf(`${city.id}:${v.survivors.length}`) % 2);
      await v.ws.update({ rescue: { arrivesAtHour: this.hours(v.ws, this.ctx.now().getTime()) + RESCUE_HOURS, count } }, { transaction: t });
      return { state: await this.toState(city, await this.view(city, t), t) };
    });
  }

  // ── Mapping ────────────────────────────────────────────────────────────────
  private async toState(city: City, v: CityView, t: Transaction): Promise<PopulationStateDTO> {
    const now = this.ctx.now();
    const clock = gameClock(ms(v.ws.epoch), v.ws.daySeconds, now.getTime());
    const stock = (await this.stock.getAmounts(city.id, ECONOMY_CODES, t)) as Record<string, number>;
    const jobBy = new Map(v.jobs.map((j) => [j.survivorId, j]));
    const homeBy = new Map(v.housing.map((h) => [h.survivorId, h.buildingId]));
    const survivors: SurvivorDTO[] = v.survivors.map((s) => {
      const job = jobBy.get(s.id);
      const home = homeBy.get(s.id) ?? null;
      return {
        id: s.id,
        name: s.name,
        profession: job?.professionCode ?? s.professionCode,
        skills: s.skills,
        health: round(s.health),
        stamina: round(s.stamina),
        satisfaction: round(s.satisfaction),
        mood: moodOf(s),
        appearance: s.appearance,
        homeId: home,
        job: job ? { kind: job.workplaceKind, id: job.workplaceId } : null,
        activity: v.soldiers.has(s.id) ? 'work' : activityAt(clock.hour, Boolean(job), job?.professionCode ?? null, !home),
        arrivedAt: new Date(s.arrivedAt).toISOString(),
        origin: s.origin,
        soldier: v.soldiers.has(s.id),
      };
    });
    const houses: HouseDTO[] = v.houses.map((h) => ({
      buildingId: h.building.id,
      level: h.building.level,
      capacity: h.capacity,
      residents: v.housing.filter((x) => x.buildingId === h.building.id).map((x) => x.survivorId),
      hexes: h.hexes,
      ready: h.ready,
    }));
    const workplaces: WorkplaceDTO[] = v.workplaces.map((w) => ({
      ...w,
      workers: v.jobs.filter((j) => j.workplaceKind === w.kind && j.workplaceId === w.id).map((j) => j.survivorId),
    }));
    const byId = new Map(v.survivors.map((s) => [s.id, s]));
    const production: ProductionDTO[] = v.production.map((p) => {
      const b = v.buildings.find((x) => x.id === p.buildingId)!;
      const workers = v.jobs.filter((j) => j.workplaceKind === 'building' && j.workplaceId === p.buildingId);
      const recipe = p.recipeCode ? getRecipe(p.recipeCode) : null;
      const rate = workers.reduce((a, j) => {
        const s = byId.get(j.survivorId);
        return a + (s ? workerEfficiency(s.skills[j.professionCode] ?? 0.2, s.stamina, s.health) : 0);
      }, 0);
      // 7 work hours a day
      const perDay = recipe ? (rate * (1 + 0.25 * (Math.min(3, b.level) - 1)) * hourSeconds(v.ws.daySeconds) * 7) / recipe.seconds : 0;
      return {
        buildingId: p.buildingId,
        typeCode: b.typeCode,
        level: b.level,
        recipe: p.recipeCode,
        progress: round(Math.min(1, p.progress)),
        status: p.status,
        buffer: p.buffer,
        bufferCapacity: outputBufferCapacity(b.level),
        workers: workers.length,
        batchesPerDay: round(perDay, 10),
        autoTransfer: autoTransfers(b.level),
      };
    });
    const capacity = v.houses.filter((h) => h.ready).reduce((a, h) => a + h.capacity, 0);
    return {
      clock: { epoch: new Date(v.ws.epoch).toISOString(), daySeconds: v.ws.daySeconds, day: clock.day, hour: round(clock.hour, 100), phase: clock.phase, serverTime: now.toISOString() },
      survivors,
      houses,
      workplaces,
      production,
      warnings: this.warnings(v, survivors, production, stock, capacity),
      stock,
      resources: await this.ctx.resources.getBag(city.id, t),
      housingCapacity: capacity,
      settings: { autoAssign: v.ws.autoAssign, naturalGrowth: v.ws.naturalGrowth, daySeconds: v.ws.daySeconds },
      rescue: v.ws.rescue,
      serverTime: now.toISOString(),
    };
  }

  private warnings(v: CityView, survivors: SurvivorDTO[], production: ProductionDTO[], stock: Record<string, number>, capacity: number): WarningDTO[] {
    const out: WarningDTO[] = [];
    const days = supplyDays(stock, survivors.length);
    if (days.food < 1) out.push({ code: 'FOOD_SHORTAGE', severity: 'danger', message: `Lương thực chỉ còn ${days.food.toFixed(1)} ngày — dân sẽ đói!` });
    else if (days.food < 3) out.push({ code: 'FOOD_SHORTAGE', severity: 'warning', message: `Lương thực còn ${days.food.toFixed(1)} ngày.` });
    if (days.water < 1) out.push({ code: 'WATER_SHORTAGE', severity: 'danger', message: `Nước chỉ còn ${days.water.toFixed(1)} ngày — xây giếng và phân công người kéo nước.` });
    else if (days.water < 3) out.push({ code: 'WATER_SHORTAGE', severity: 'warning', message: `Nước còn ${days.water.toFixed(1)} ngày.` });
    const homeless = survivors.filter((s) => !s.homeId).length;
    if (homeless) out.push({ code: 'HOMELESS', severity: 'danger', message: `${homeless} cư dân chưa có nhà ở — hãy xây thêm nhà.` });
    else if (capacity <= survivors.length) out.push({ code: 'HOUSING_FULL', severity: 'info', message: 'Nhà ở đã kín chỗ — người di cư sẽ không đến được.' });
    const open = v.workplaces.filter((w) => w.ready).reduce((a, w) => a + Math.max(0, w.slots - v.jobs.filter((j) => j.workplaceId === w.id).length), 0);
    const idle = survivors.filter((s) => !s.job && !s.soldier).length;
    if (idle && open) out.push({ code: 'UNEMPLOYED', severity: 'info', message: `${idle} cư dân rảnh rỗi trong khi còn ${open} chỗ làm.` });
    for (const p of production) {
      if (p.status === 'missing_input') out.push({ code: 'MISSING_INPUT', severity: 'warning', message: `Thiếu nguyên liệu cho ${getRecipe(p.recipe ?? '')?.name ?? 'sản xuất'}.`, ref: p.buildingId });
      if (p.status === 'buffer_full') out.push({ code: 'BUFFER_FULL', severity: 'warning', message: 'Xưởng đầy hàng — cần người vận chuyển hoặc nhận sản phẩm.', ref: p.buildingId });
      if (p.status === 'no_workers') out.push({ code: 'NO_WORKERS', severity: 'info', message: `${getRecipe(p.recipe ?? '')?.name ?? 'Xưởng'} chưa có người làm.`, ref: p.buildingId });
    }
    const cap = this.storageCapacity(v);
    const full = ECONOMY_CODES.filter((c) => (stock[c] ?? 0) >= cap * 0.95);
    if (full.length) out.push({ code: 'STORAGE_FULL', severity: 'warning', message: `Kho gần đầy: ${full.map((c) => ECONOMY_LABELS[c]).join(', ')}.` });
    return out;
  }
}

