/**
 * Military (Phase 8) — recruiting, training, ranks, equipment and squads. No combat yet.
 *
 *  - Barracks are ordinary buildings (Building Engine: footprint, placement, upgrades).
 *  - Soldiers are survivors (Citizen System): recruiting needs free citizens and takes them out
 *    of civilian work; it consumes REAL equipment (eq_* made at the military forge), food and
 *    coins from storage (Resource System) — never a soldier out of wood and stone.
 *  - Training jobs run on server timestamps and are completed exactly once (conditional UPDATE
 *    in_progress → completed inside the per-city lock). The economy is settled first so the
 *    forge's latest output is in stock.
 */
import type { Transaction } from 'sequelize';
import {
  DRILL_SECONDS,
  EQUIPMENT_DEFINITIONS,
  FOOD_VALUES,
  GRADUATION_XP,
  MAX_SQUAD_SIZE,
  RANKS,
  UNIT_TYPE_DEFINITIONS,
  canEquip,
  combatPower,
  drillXp,
  getRank,
  getUnitType,
  isMilitaryBuilding,
  missingEquipment,
  rankForXp,
  trainingSeconds,
  trainingSlots,
  unitForBuilding,
  unitStats,
  mountSpeed,
  mountedStats,
  type BarracksDTO,
  type BuildingTypeCode,
  type CreateSquadInput,
  type EquipInput,
  type EquipmentCode,
  type EquipmentSlot,
  type MilitaryMutationResultDTO,
  type MilitaryStateDTO,
  type MilitaryUnitDTO,
  type RecruitInput,
  type SquadDTO,
  type SquadMembersInput,
  type StartTrainingInput,
  type UnitTypeCode,
  type UpdateSquadInput,
} from '@cityverse/shared';
import type { City } from '../../database/models/City.js';
import type { WorldBuilding } from '../../database/models/Building.js';
import type { MilitarySquad, MilitarySquadMember, MilitaryTrainingJob, MilitaryUnit, UnitEquipment } from '../../database/models/Military.js';
import type { Survivor, SurvivorJob } from '../../database/models/Population.js';
import type { DatabaseModels } from '../../database/models/index.js';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import type { BuildingContext } from '../buildings/building.service.js';
import { ProduceService } from '../farming/farm.service.js';
import { careRecord, storedTraits } from '../mounts/mountSupport.js';
import type { PopulationService } from '../population/population.service.js';

const EQ_CODES = EQUIPMENT_DEFINITIONS.map((e) => e.code);
const FOOD_CODES = FOOD_VALUES.map(([c]) => c);
const ms = (d: Date | string): number => new Date(d).getTime();

class MilitaryCatalog {
  private ready: Promise<void> | null = null;
  constructor(private readonly models: DatabaseModels) {}
  ensure(): Promise<void> {
    this.ready ??= this.models.sequelize
      .transaction(async (transaction) => {
        for (const u of UNIT_TYPE_DEFINITIONS) {
          await this.models.UnitType.upsert(
            {
              code: u.code,
              name: u.name,
              role: u.role,
              buildingType: u.building,
              base: { ...u.base },
              trainSeconds: u.trainSeconds,
              food: u.food,
              coins: u.coins,
              required: { ...u.required } as Record<string, string>,
              drills: [...u.drills],
            },
            { transaction }
          );
        }
        for (const e of EQUIPMENT_DEFINITIONS) {
          await this.models.EquipmentType.upsert({ code: e.code, name: e.name, slot: e.slot, bonus: { ...e.bonus } as Record<string, number>, units: [...e.units] }, { transaction });
        }
      })
      .catch((err: unknown) => {
        this.ready = null;
        throw err;
      });
    return this.ready;
  }
}

interface View {
  buildings: WorldBuilding[];
  units: MilitaryUnit[];
  equipment: UnitEquipment[];
  jobs: MilitaryTrainingJob[];
  squads: MilitarySquad[];
  members: MilitarySquadMember[];
  survivors: Survivor[];
  civilianJobs: SurvivorJob[];
}

export class MilitaryService {
  private readonly catalog: MilitaryCatalog;
  private readonly stock: ProduceService;

  constructor(
    private readonly ctx: BuildingContext,
    private readonly population: PopulationService
  ) {
    this.catalog = new MilitaryCatalog(ctx.models);
    this.stock = new ProduceService(ctx.models);
  }

  private get models(): DatabaseModels {
    return this.ctx.models;
  }

  private async mutate<T>(cityId: string, userId: string, edit: boolean, fn: (city: City, v: View, t: Transaction) => Promise<T>): Promise<T> {
    await this.catalog.ensure();
    return this.ctx.mutate(cityId, userId, edit, async (city, t) => {
      if (edit && await this.models.MilitaryUnit.count({ where: { cityId, status: 'battle' }, transaction: t })) throw new ConflictError('Doi quan dang tham chien; ket thuc hoac rut lui truoc khi thay doi quan doi', 'BATTLE_ACTIVE');
      // Economy first (forge output, construction) — then the military clock.
      await this.population.settle(city, t);
      await this.settle(city.id, t);
      return fn(city, await this.view(city.id, t), t);
    });
  }

  // ── Settlement ─────────────────────────────────────────────────────────────
  /** Completes due training jobs exactly once; frees soldiers of removed buildings. */
  async settle(cityId: string, t: Transaction): Promise<void> {
    const now = this.ctx.now();
    const due = await this.models.MilitaryTrainingJob.findAll({ where: { cityId, status: 'in_progress' }, transaction: t });
    for (const job of due) {
      if (ms(job.finishesAt) > now.getTime()) continue;
      const [changed] = await this.models.MilitaryTrainingJob.update(
        { status: 'completed', completedAt: job.finishesAt },
        { where: { id: job.id, status: 'in_progress' }, transaction: t }
      );
      if (changed !== 1) continue; // already completed elsewhere
      const building = await this.models.WorldBuilding.findByPk(job.buildingId, { transaction: t });
      const gain = job.kind === 'recruit' ? GRADUATION_XP : drillXp((building?.typeCode ?? 'sword_barracks') as BuildingTypeCode, building?.level ?? 1);
      for (const id of job.unitIds) {
        const unit = await this.models.MilitaryUnit.findOne({ where: { id, cityId }, transaction: t });
        if (!unit) continue;
        const xp = unit.xp + gain;
        await unit.update({ status: 'ready', xp, rank: rankForXp(xp), trainedAt: unit.trainedAt ?? job.finishesAt }, { transaction: t });
      }
    }
    // Soldiers whose job vanished (building demolished) become ready again.
    const open = new Set((await this.models.MilitaryTrainingJob.findAll({ where: { cityId, status: 'in_progress' }, transaction: t })).flatMap((j) => j.unitIds));
    const busy = await this.models.MilitaryUnit.findAll({ where: { cityId, status: ['training', 'drilling'] }, transaction: t });
    for (const u of busy) if (!open.has(u.id)) await u.update({ status: u.trainedAt ? 'ready' : 'recruit' }, { transaction: t });
  }

  private async view(cityId: string, t: Transaction): Promise<View> {
    const [buildings, units, jobs, squads, survivors, civilianJobs] = await Promise.all([
      this.models.WorldBuilding.findAll({ where: { cityId }, transaction: t }),
      this.models.MilitaryUnit.findAll({ where: { cityId }, order: [['recruitedAt', 'ASC'], ['createdAt', 'ASC']], transaction: t }),
      this.models.MilitaryTrainingJob.findAll({ where: { cityId, status: 'in_progress' }, order: [['startedAt', 'ASC']], transaction: t }),
      this.models.MilitarySquad.findAll({ where: { cityId }, order: [['createdAt', 'ASC']], transaction: t }),
      this.models.Survivor.findAll({ where: { cityId }, order: [['arrivedAt', 'ASC']], transaction: t }),
      this.models.SurvivorJob.findAll({ where: { cityId }, transaction: t }),
    ]);
    const unitIds = units.map((u) => u.id);
    const [equipment, members] = await Promise.all([
      unitIds.length ? this.models.UnitEquipment.findAll({ where: { unitId: unitIds }, transaction: t }) : Promise.resolve([]),
      squads.length ? this.models.MilitarySquadMember.findAll({ where: { squadId: squads.map((s) => s.id) }, order: [['position', 'ASC']], transaction: t }) : Promise.resolve([]),
    ]);
    return { buildings, units, equipment, jobs, squads, members, survivors, civilianJobs };
  }

  private training(v: View, buildingId: string): number {
    return v.jobs.filter((j) => j.buildingId === buildingId).reduce((a, j) => a + j.unitIds.length, 0);
  }

  private barracks(v: View, buildingId: string): WorldBuilding {
    const b = v.buildings.find((x) => x.id === buildingId);
    if (!b || !isMilitaryBuilding(b.typeCode) || trainingSlots(b.typeCode as BuildingTypeCode, b.level) <= 0) {
      throw new NotFoundError('Doanh trai khong ton tai', 'BARRACKS_NOT_FOUND');
    }
    // A barracks being upgraded keeps training; one still under construction cannot.
    if (b.status === 'constructing') throw new ConflictError('Doanh trai dang xay', 'BARRACKS_NOT_READY');
    return b;
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  async getState(cityId: string, userId: string): Promise<MilitaryStateDTO> {
    return this.mutate(cityId, userId, false, (city, v, t) => this.toState(city.id, v, t));
  }

  // ── Recruiting & training ──────────────────────────────────────────────────
  async recruit(cityId: string, userId: string, input: RecruitInput): Promise<MilitaryMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const b = this.barracks(v, input.buildingId);
      if (unitForBuilding(b.typeCode) !== input.unitType) throw new BadRequestError('Doanh trai nay khong huan luyen binh chung do', 'WRONG_BARRACKS');
      const free = trainingSlots(b.typeCode as BuildingTypeCode, b.level) - this.training(v, b.id) - v.units.filter((u) => u.buildingId === b.id && u.status === 'recruit').length;
      if (input.count > free) throw new ConflictError(`Doanh trai chi con ${Math.max(0, free)} cho huan luyen`, 'BARRACKS_FULL');

      // 1. Citizens: never more than the people who are not soldiers yet.
      const soldiers = new Set(v.units.map((u) => u.survivorId));
      const employed = new Set(v.civilianJobs.map((j) => j.survivorId));
      const candidates = v.survivors
        .filter((s) => !soldiers.has(s.id))
        // Idle people first, then the least skilled workers.
        .sort((a, b) => Number(employed.has(a.id)) - Number(employed.has(b.id)) || Math.max(0, ...Object.values(a.skills)) - Math.max(0, ...Object.values(b.skills)));
      if (candidates.length < input.count) {
        throw new AppError(409, 'NOT_ENOUGH_CITIZENS', `Chi con ${candidates.length} cu dan co the tuyen`, { available: [String(candidates.length)] });
      }
      // 2. Equipment, food and coins from storage.
      const def = getUnitType(input.unitType);
      const need: Record<string, number> = {};
      for (const code of Object.values(def.required) as EquipmentCode[]) need[code] = (need[code] ?? 0) + input.count;
      const have = await this.stock.getAmounts(city.id, [...EQ_CODES, ...FOOD_CODES], t);
      const missing = Object.entries(need).filter(([c, n]) => (have[c as EquipmentCode] ?? 0) < n).map(([c]) => c);
      if (missing.length) throw new AppError(409, 'MISSING_EQUIPMENT', 'Thieu vu khi / giap cho tan binh', { missing });
      const food = this.planFood(have as Record<string, number>, def.food * input.count);
      if (!food) throw new ConflictError('Khong du luong thuc cho tan binh', 'NOT_ENOUGH_FOOD');
      await this.ctx.resources.charge(city.id, { coins: def.coins * input.count, wood: 0, stone: 0 }, t);
      const spent: Record<string, number> = { ...food };
      for (const [c, n] of Object.entries(need)) spent[c] = (spent[c] ?? 0) + n;
      for (const [c, n] of Object.entries(spent)) await this.stock.add(city.id, c, -n, t);
      await this.ledger(city.id, 'recruit', spent, t);

      // 3. Citizens become recruits (out of civilian work), each issued their kit.
      const now = this.ctx.now();
      const recruits: MilitaryUnit[] = [];
      for (const s of candidates.slice(0, input.count)) {
        await this.models.SurvivorJob.destroy({ where: { survivorId: s.id }, transaction: t });
        const unit = await this.models.MilitaryUnit.create(
          { cityId: city.id, survivorId: s.id, unitTypeCode: input.unitType, buildingId: b.id, status: input.startTraining ? 'training' : 'recruit', recruitedAt: now },
          { transaction: t }
        );
        for (const [slot, code] of Object.entries(def.required) as [EquipmentSlot, EquipmentCode][]) {
          await this.models.UnitEquipment.create({ unitId: unit.id, slot, equipmentCode: code }, { transaction: t });
        }
        recruits.push(unit);
      }
      if (input.startTraining) await this.createJob(city.id, b, 'recruit', input.unitType, recruits.map((u) => u.id), t);
      return { state: await this.toState(city.id, await this.view(city.id, t), t) };
    });
  }

  /** Starts recruit training (waiting recruits) or a drill (ready soldiers gain XP). */
  async startTraining(cityId: string, userId: string, input: StartTrainingInput): Promise<MilitaryMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const b = this.barracks(v, input.buildingId);
      const free = trainingSlots(b.typeCode as BuildingTypeCode, b.level) - this.training(v, b.id);
      if (free <= 0) throw new ConflictError('Doanh trai da kin cho huan luyen', 'BARRACKS_FULL');
      const deployed = this.deployedUnits(v);
      const ground = b.typeCode === 'training_ground';
      const pool = v.units.filter((u) => {
        if (input.unitIds && !input.unitIds.includes(u.id)) return false;
        if (input.kind === 'recruit') return u.status === 'recruit' && u.buildingId === b.id;
        // Drills: ready soldiers of this barracks' class (any class at the training ground), not on a mission.
        return u.status === 'ready' && !deployed.has(u.id) && (ground || (unitForBuilding(b.typeCode) === u.unitTypeCode && u.buildingId === b.id));
      });
      if (input.unitIds && pool.length !== input.unitIds.length) throw new ConflictError('Co binh si khong the tap luc nay', 'UNITS_UNAVAILABLE');
      if (!pool.length) throw new ConflictError('Khong co binh si nao de huan luyen', 'NO_UNITS');
      const picked = pool.slice(0, free);
      // Not fully equipped → no training (no making soldiers without weapons).
      const eq = this.equipmentMap(v);
      const unarmed = picked.filter((u) => missingEquipment(u.unitTypeCode, eq.get(u.id) ?? {}).length);
      if (unarmed.length) throw new AppError(409, 'MISSING_EQUIPMENT', 'Binh si chua du trang bi', { missing: unarmed.map((u) => u.id) });
      for (const u of picked) await u.update({ status: input.kind === 'recruit' ? 'training' : 'drilling' }, { transaction: t });
      await this.createJob(city.id, b, input.kind, input.kind === 'recruit' ? picked[0].unitTypeCode : null, picked.map((u) => u.id), t);
      return { state: await this.toState(city.id, await this.view(city.id, t), t) };
    });
  }

  private async createJob(cityId: string, b: WorldBuilding, kind: 'recruit' | 'drill', type: UnitTypeCode | null, unitIds: string[], t: Transaction): Promise<void> {
    const now = this.ctx.now();
    const seconds = kind === 'recruit' && type ? trainingSeconds(type, b.level) : Math.round(DRILL_SECONDS / (1 + 0.15 * (Math.min(3, b.level) - 1)));
    await this.models.MilitaryTrainingJob.create(
      { cityId, buildingId: b.id, kind, unitTypeCode: type, unitIds, startedAt: now, finishesAt: new Date(now.getTime() + seconds * 1000), status: 'in_progress' },
      { transaction: t }
    );
  }

  private planFood(stock: Record<string, number>, need: number): Record<string, number> | null {
    let left = need;
    const use: Record<string, number> = {};
    for (const [code, value] of FOOD_VALUES) {
      if (left <= 1e-9) break;
      const take = Math.min(stock[code] ?? 0, left / value);
      if (take > 0) {
        use[code] = take;
        left -= take * value;
      }
    }
    return left > 1e-6 ? null : use;
  }

  private async ledger(cityId: string, reason: string, spent: Record<string, number>, t: Transaction): Promise<void> {
    const now = this.ctx.now();
    const rows = Object.entries(spent).filter(([, n]) => n > 0).map(([code, n]) => ({ cityId, resourceCode: code, delta: -n, reason, refId: null, periodStart: now, periodEnd: now }));
    if (rows.length) await this.models.ResourceTransaction.bulkCreate(rows, { transaction: t });
  }

  // ── Equipment ──────────────────────────────────────────────────────────────
  async equip(cityId: string, userId: string, unitId: string, input: EquipInput): Promise<MilitaryMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const unit = v.units.find((u) => u.id === unitId);
      if (!unit) throw new NotFoundError('Binh si khong ton tai', 'UNIT_NOT_FOUND');
      if (unit.status === 'training' || unit.status === 'drilling') throw new ConflictError('Binh si dang tap', 'UNIT_BUSY');
      const current = v.equipment.find((e) => e.unitId === unit.id && e.slot === input.slot);
      if (input.equipmentCode) {
        if (!canEquip(unit.unitTypeCode, input.slot, input.equipmentCode)) throw new BadRequestError('Trang bi khong hop voi binh chung / o', 'EQUIPMENT_NOT_ALLOWED');
        if (current?.equipmentCode === input.equipmentCode) throw new ConflictError('Da trang bi mon nay', 'ALREADY_EQUIPPED');
        const have = (await this.stock.getAmounts(city.id, [input.equipmentCode], t))[input.equipmentCode];
        if (have < 1) throw new AppError(409, 'MISSING_EQUIPMENT', 'Kho khong con trang bi nay', { missing: [input.equipmentCode] });
        await this.stock.add(city.id, input.equipmentCode, -1, t);
      }
      // The old item goes back to storage.
      if (current) {
        await this.stock.add(city.id, current.equipmentCode, 1, t);
        await current.destroy({ transaction: t });
      }
      if (input.equipmentCode) await this.models.UnitEquipment.create({ unitId: unit.id, slot: input.slot, equipmentCode: input.equipmentCode }, { transaction: t });
      return { state: await this.toState(city.id, await this.view(city.id, t), t) };
    });
  }

  /** Back to civilian life: equipment returns to storage. Not while training or on a mission. */
  async discharge(cityId: string, userId: string, unitId: string): Promise<MilitaryMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const unit = v.units.find((u) => u.id === unitId);
      if (!unit) throw new NotFoundError('Binh si khong ton tai', 'UNIT_NOT_FOUND');
      if (unit.status === 'training' || unit.status === 'drilling') throw new ConflictError('Binh si dang tap', 'UNIT_BUSY');
      if (this.deployedUnits(v).has(unit.id)) throw new ConflictError('Binh si dang lam nhiem vu', 'UNIT_ON_MISSION');
      for (const e of v.equipment.filter((x) => x.unitId === unit.id)) await this.stock.add(city.id, e.equipmentCode, 1, t);
      await this.models.UnitEquipment.destroy({ where: { unitId: unit.id }, transaction: t });
      await this.models.MilitarySquadMember.destroy({ where: { unitId: unit.id }, transaction: t });
      // The horse goes back to its stable (free for another rider).
      const ride = await this.models.MountAssignment.findOne({ where: { unitId: unit.id }, transaction: t });
      if (ride) {
        const horse = await this.models.FarmAnimal.findByPk(ride.animalId, { transaction: t });
        await ride.destroy({ transaction: t });
        if (horse) await careRecord(this.models, { cityId: city.id, farmId: horse.farmId, animalId: horse.id, kind: 'dismount', note: 'Giải ngũ', at: this.ctx.now() }, t);
      }
      await unit.destroy({ transaction: t });
      await this.models.Survivor.update({ assignable: true }, { where: { id: unit.survivorId }, transaction: t });
      return { state: await this.toState(city.id, await this.view(city.id, t), t) };
    });
  }

  // ── Squads ─────────────────────────────────────────────────────────────────
  async createSquad(cityId: string, userId: string, input: CreateSquadInput): Promise<MilitaryMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, _v, t) => {
      await this.models.MilitarySquad.create({ cityId: city.id, name: input.name, formation: input.formation, status: 'standby' }, { transaction: t });
      return { state: await this.toState(city.id, await this.view(city.id, t), t) };
    });
  }

  async updateSquad(cityId: string, userId: string, squadId: string, input: UpdateSquadInput): Promise<MilitaryMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const squad = this.squad(v, squadId);
      if (input.status === 'deployed' && squad.status !== 'deployed') {
        const members = v.members.filter((m) => m.squadId === squad.id).map((m) => m.unitId);
        if (!members.length) throw new ConflictError('Doi chua co binh si', 'SQUAD_EMPTY');
        const others = this.deployedUnits(v, squad.id);
        if (members.some((id) => others.has(id))) throw new ConflictError('Co binh si dang o doi khac lam nhiem vu', 'UNIT_ON_MISSION');
        if (members.some((id) => v.units.find((u) => u.id === id)?.status !== 'ready')) throw new ConflictError('Co binh si chua san sang', 'SQUAD_NOT_READY');
      }
      await squad.update({ name: input.name ?? squad.name, formation: input.formation ?? squad.formation, status: input.status ?? squad.status }, { transaction: t });
      return { state: await this.toState(city.id, await this.view(city.id, t), t) };
    });
  }

  async addMembers(cityId: string, userId: string, squadId: string, input: SquadMembersInput): Promise<MilitaryMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const squad = this.squad(v, squadId);
      const current = v.members.filter((m) => m.squadId === squad.id);
      const adding = input.unitIds.filter((id) => !current.some((m) => m.unitId === id));
      if (current.length + adding.length > MAX_SQUAD_SIZE) throw new ConflictError(`Moi doi toi da ${MAX_SQUAD_SIZE} binh si`, 'SQUAD_FULL');
      const others = this.deployedUnits(v, squad.id);
      for (const id of adding) {
        const unit = v.units.find((u) => u.id === id);
        if (!unit) throw new NotFoundError('Binh si khong ton tai', 'UNIT_NOT_FOUND');
        // A soldier cannot be in two squads on a mission at the same time.
        if (squad.status === 'deployed' && others.has(id)) throw new ConflictError('Binh si dang o doi khac lam nhiem vu', 'UNIT_ON_MISSION');
        if (squad.status === 'deployed' && unit.status !== 'ready') throw new ConflictError('Binh si chua san sang', 'SQUAD_NOT_READY');
      }
      let pos = current.length;
      for (const id of adding) await this.models.MilitarySquadMember.create({ squadId: squad.id, unitId: id, position: pos++ }, { transaction: t });
      return { state: await this.toState(city.id, await this.view(city.id, t), t) };
    });
  }

  async removeMember(cityId: string, userId: string, squadId: string, unitId: string): Promise<MilitaryMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const squad = this.squad(v, squadId);
      const n = await this.models.MilitarySquadMember.destroy({ where: { squadId: squad.id, unitId }, transaction: t });
      if (!n) throw new NotFoundError('Binh si khong o doi nay', 'NOT_A_MEMBER');
      return { state: await this.toState(city.id, await this.view(city.id, t), t) };
    });
  }

  async deleteSquad(cityId: string, userId: string, squadId: string): Promise<MilitaryMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, v, t) => {
      const squad = this.squad(v, squadId);
      if (squad.status === 'deployed') throw new ConflictError('Doi dang lam nhiem vu', 'SQUAD_DEPLOYED');
      await this.models.MilitarySquadMember.destroy({ where: { squadId: squad.id }, transaction: t });
      await squad.destroy({ transaction: t });
      return { state: await this.toState(city.id, await this.view(city.id, t), t) };
    });
  }

  private squad(v: View, id: string): MilitarySquad {
    const s = v.squads.find((x) => x.id === id);
    if (!s) throw new NotFoundError('Doi khong ton tai', 'SQUAD_NOT_FOUND');
    return s;
  }

  /** Units in deployed squads (optionally ignoring one squad). */
  private deployedUnits(v: View, exceptSquad?: string): Set<string> {
    const deployed = new Set(v.squads.filter((s) => s.status === 'deployed' && s.id !== exceptSquad).map((s) => s.id));
    return new Set(v.members.filter((m) => deployed.has(m.squadId)).map((m) => m.unitId));
  }

  private equipmentMap(v: View): Map<string, Partial<Record<EquipmentSlot, EquipmentCode>>> {
    const out = new Map<string, Partial<Record<EquipmentSlot, EquipmentCode>>>();
    for (const e of v.equipment) {
      const m = out.get(e.unitId) ?? {};
      m[e.slot] = e.equipmentCode;
      out.set(e.unitId, m);
    }
    return out;
  }

  // ── Mapping ────────────────────────────────────────────────────────────────
  private async toState(cityId: string, v: View, t: Transaction): Promise<MilitaryStateDTO> {
    const eq = this.equipmentMap(v);
    // Phase 9: mounted soldiers (horse stats + barding).
    const rides = v.units.length ? await this.models.MountAssignment.findAll({ where: { unitId: v.units.map((u) => u.id) }, transaction: t }) : [];
    const horses = rides.length ? await this.models.FarmAnimal.findAll({ where: { id: rides.map((r) => r.animalId) }, transaction: t }) : [];
    const barding = rides.length
      ? new Set((await this.models.AnimalEquipment.findAll({ where: { animalId: rides.map((r) => r.animalId), slot: 'armor' }, transaction: t })).map((e) => e.animalId))
      : new Set<string>();
    const survivorBy = new Map(v.survivors.map((s) => [s.id, s]));
    const units: MilitaryUnitDTO[] = v.units.map((u) => {
      const equipment = eq.get(u.id) ?? {};
      const ride = rides.find((r) => r.unitId === u.id);
      const horse = ride ? horses.find((h) => h.id === ride.animalId) : undefined;
      const mount = horse
        ? {
            animalId: horse.id,
            farmId: horse.farmId,
            name: horse.name,
            breed: horse.breed,
            speed: mountSpeed('horse', horse.breed, storedTraits(horse)),
            trainingLevel: horse.trainingLevel,
            armored: barding.has(horse.id),
          }
        : null;
      const base = unitStats(u.unitTypeCode, u.rank, Object.values(equipment) as EquipmentCode[]);
      const stats = mount ? mountedStats(base, u.unitTypeCode, mount) : base;
      const missing = missingEquipment(u.unitTypeCode, equipment);
      const s = survivorBy.get(u.survivorId);
      const next = RANKS.find((r) => r.rank === u.rank + 1);
      return {
        id: u.id,
        survivorId: u.survivorId,
        name: s?.name ?? 'Binh sĩ',
        type: u.unitTypeCode,
        rank: u.rank,
        rankName: getRank(u.rank).name,
        xp: u.xp,
        nextRankXp: next?.xp ?? null,
        status: u.status,
        buildingId: u.buildingId ?? '',
        equipment,
        stats,
        power: combatPower(stats),
        ready: u.status === 'ready' && missing.length === 0,
        missing,
        squadIds: v.members.filter((m) => m.unitId === u.id).map((m) => m.squadId),
        appearance: s?.appearance ?? { skin: '#f6d2b4', hair: '#2b2116', hairStyle: 0, height: 1 },
        mount,
      };
    });
    const byId = new Map(units.map((u) => [u.id, u]));
    const barracks: BarracksDTO[] = [];
    const footprints = await this.models.BuildingFootprint.findAll({ where: { cityId }, transaction: t });
    for (const b of v.buildings) {
      if (!isMilitaryBuilding(b.typeCode)) continue;
      const slots = trainingSlots(b.typeCode as BuildingTypeCode, b.level);
      if (slots <= 0) continue;
      const training = this.training(v, b.id);
      const type = unitForBuilding(b.typeCode);
      barracks.push({
        buildingId: b.id,
        typeCode: b.typeCode,
        level: b.level,
        ready: b.status !== 'constructing',
        unitType: type,
        slots,
        training,
        free: Math.max(0, slots - training),
        trainSeconds: type ? trainingSeconds(type, b.level) : Math.round(DRILL_SECONDS / (1 + 0.15 * (Math.min(3, b.level) - 1))),
        soldiers: v.units.filter((u) => u.buildingId === b.id).map((u) => u.id),
        hexes: footprints.filter((f) => f.buildingId === b.id).map((f) => ({ q: f.q, r: f.r })),
        anchor: { q: b.anchorQ, r: b.anchorR },
        rotation: b.rotation,
      });
    }
    const squads: SquadDTO[] = v.squads.map((s) => {
      const members = v.members.filter((m) => m.squadId === s.id).map((m) => m.unitId);
      const list = members.map((id) => byId.get(id)).filter((u): u is MilitaryUnitDTO => Boolean(u));
      return {
        id: s.id,
        name: s.name,
        formation: s.formation,
        status: s.status,
        members,
        power: list.reduce((a, u) => a + u.power, 0),
        readiness: list.length ? list.filter((u) => u.ready).length / list.length : 0,
        xp: list.reduce((a, u) => a + u.xp, 0),
      };
    });
    const stock = await this.stock.getAmounts(cityId, [...EQ_CODES, ...FOOD_CODES], t);
    const soldiers = new Set(v.units.map((u) => u.survivorId));
    return {
      units,
      jobs: v.jobs.map((j) => ({
        id: j.id,
        buildingId: j.buildingId,
        kind: j.kind,
        unitType: j.unitTypeCode,
        unitIds: j.unitIds,
        startedAt: new Date(j.startedAt).toISOString(),
        finishesAt: new Date(j.finishesAt).toISOString(),
        status: j.status,
      })),
      barracks,
      squads,
      equipment: Object.fromEntries(EQ_CODES.map((c) => [c, stock[c] ?? 0])),
      recruitable: v.survivors.filter((s) => !soldiers.has(s.id)).length,
      food: FOOD_VALUES.reduce((a, [c, val]) => a + (stock[c as keyof typeof stock] ?? 0) * val, 0),
      resources: await this.ctx.resources.getBag(cityId, t),
      serverTime: this.ctx.now().toISOString(),
    };
  }
}
