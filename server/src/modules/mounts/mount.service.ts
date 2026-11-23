/**
 * Working animals (Phase 9): training, care, tack, mounts and duties for the horses / elephants
 * that live in stables / camps (which are ordinary livestock farms — the Animal Engine settles
 * feed, water, health, deaths and upgrades first; then training jobs complete exactly once).
 *
 * Rules (all on the server):
 *  - only tame animals become combat mounts or work; untamed ones can only be tamed
 *  - one horse ↔ one soldier (UNIQUE animal_id / unit_id in mount_assignments)
 *  - an animal does one thing at a time (training, a rider, or a duty)
 *  - tack and training costs come from real stock (storage, farm feed store, coins)
 */
import { UniqueConstraintError, type Transaction } from 'sequelize';
import {
  ANIMAL_EQUIPMENT_CODES,
  GROOM_COOLDOWN_SECONDS,
  GROOM_COST,
  GROOM_TAMENESS,
  MOUNT_FARM_TYPES,
  VET_COST,
  animalStatus,
  canEquipAnimal,
  getAnimalEquipment,
  getTrainingProgram,
  isMountSpecies,
  mountBlock,
  taskBlock,
  trainingBlock,
  trainingDuration,
  vetHeal,
  type AnimalEquipInput,
  type AssignMountInput,
  type AssignTaskInput,
  type CareAnimalInput,
  type MountAnimalDTO,
  type MountMutationResultDTO,
  type MountStateDTO,
  type MountTraitsDTO,
  type TrainAnimalInput,
} from '@cityverse/shared';
import type { City } from '../../database/models/City.js';
import type { WorldBuilding } from '../../database/models/Building.js';
import type { FarmAnimal, LivestockFarm } from '../../database/models/Livestock.js';
import type { DatabaseModels } from '../../database/models/index.js';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import type { BuildingContext } from '../buildings/building.service.js';
import { ProduceService } from '../farming/farm.service.js';
import type { LivestockService } from '../livestock/livestock.service.js';
import { careRecord, loadTraits, storedTraits } from './mountSupport.js';

const ms = (d: Date | string): number => new Date(d).getTime();

const BLOCK_MESSAGES: Record<string, string> = {
  WRONG_SPECIES: 'Chuong trinh khong danh cho loai thu nay',
  ANIMAL_YOUNG: 'Thu con chua truong thanh',
  ANIMAL_TOO_WEAK: 'Thu qua yeu, can cham soc truoc',
  ANIMAL_HUNGRY: 'Thu dang doi, hay cho an truoc',
  NOT_TAME: 'Thu chua duoc thuan hoa',
  STABLE_LEVEL_TOO_LOW: 'Can nang cap trai de co san huan luyen',
  MAX_TRAINED: 'Thu da dat muc toi da cua chuong trinh nay',
  ANIMAL_IN_USE: 'Thu dang duoc su dung',
  ANIMAL_TRAINING: 'Thu dang huan luyen',
  NO_SADDLE: 'Ngua chua co yen',
  NOT_A_HORSE: 'Chi ngua moi lam thu cuoi',
  RIDER_NOT_SUITABLE: 'Binh chung nay khong cuoi ngua',
  NO_HARNESS: 'Can deo dai cho hang',
  NOT_WAR_TRAINED: 'Voi can trinh do huan luyen 2 (Luyen chien)',
  NOT_AN_ELEPHANT: 'Chi voi moi vao du bi quan su',
};

interface AnimalCtx {
  animal: FarmAnimal;
  farm: LivestockFarm;
  building: WorldBuilding;
  traits: MountTraitsDTO;
  adult: boolean;
}

export class MountService {
  private readonly stock: ProduceService;

  constructor(
    private readonly ctx: BuildingContext,
    private readonly livestock: LivestockService
  ) {
    this.stock = new ProduceService(ctx.models);
  }

  private get models(): DatabaseModels {
    return this.ctx.models;
  }

  private mutate<T>(cityId: string, userId: string, edit: boolean, fn: (city: City, t: Transaction) => Promise<T>): Promise<T> {
    return this.ctx.mutate(cityId, userId, edit, async (city, t) => {
      // Animal Engine first (feed, water, health, deaths, upgrades, training completion).
      await this.livestock.settleCity(city.id, t);
      return fn(city, t);
    });
  }

  private blocked(code: string): never {
    throw new ConflictError(BLOCK_MESSAGES[code] ?? code, code);
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  async getState(cityId: string, userId: string): Promise<MountStateDTO> {
    return this.mutate(cityId, userId, false, (city, t) => this.state(city.id, t));
  }

  async getAnimal(cityId: string, userId: string, animalId: string): Promise<MountAnimalDTO> {
    return this.mutate(cityId, userId, false, async (city, t) => {
      const s = await this.state(city.id, t);
      const a = s.animals.find((x) => x.id === animalId);
      if (!a) throw new NotFoundError('Thu khong ton tai', 'ANIMAL_NOT_FOUND');
      return a;
    });
  }

  // ── Training ───────────────────────────────────────────────────────────────
  async train(cityId: string, userId: string, animalId: string, input: TrainAnimalInput): Promise<MountMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const c = await this.load(city.id, animalId, t);
      if (c.traits.training) this.blocked('ANIMAL_TRAINING');
      const program = getTrainingProgram(input.program);
      const why = trainingBlock(
        program,
        { species: c.animal.speciesCode, adult: c.adult, health: c.animal.health, satiety: c.animal.satiety, traits: storedTraits(c.animal), inUse: c.traits.use !== null },
        c.building.level
      );
      if (why) this.blocked(why);
      if (c.farm.feedStock < program.feed) {
        throw new ConflictError(`Kho thuc an cua trai can ${program.feed} dinh duong cho buoi tap`, 'INSUFFICIENT_FARM_FEED');
      }
      await this.ctx.resources.charge(city.id, { coins: program.coins, wood: 0, stone: 0 }, t);
      await c.farm.update({ feedStock: c.farm.feedStock - program.feed }, { transaction: t });
      const now = this.ctx.now();
      await this.models.AnimalTrainingJob.create(
        {
          cityId: city.id,
          farmId: c.farm.id,
          animalId: c.animal.id,
          program: program.code,
          startedAt: now,
          finishesAt: new Date(now.getTime() + trainingDuration(program, c.building.level) * 1000),
          status: 'in_progress',
        },
        { transaction: t }
      );
      return { state: await this.state(city.id, t) };
    });
  }

  // ── Care ───────────────────────────────────────────────────────────────────
  async care(cityId: string, userId: string, animalId: string, input: CareAnimalInput): Promise<MountMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const c = await this.load(city.id, animalId, t);
      const now = this.ctx.now();
      if (input.action === 'groom') {
        const last = await this.models.AnimalCareRecord.findOne({ where: { animalId: c.animal.id, kind: 'groom' }, order: [['at', 'DESC']], transaction: t });
        if (last && now.getTime() - ms(last.at) < GROOM_COOLDOWN_SECONDS * 1000) throw new ConflictError('Vua moi chai long xong', 'GROOM_COOLDOWN');
        await this.ctx.resources.charge(city.id, { coins: GROOM_COST, wood: 0, stone: 0 }, t);
        await c.animal.update({ tameness: Math.min(1, c.animal.tameness + GROOM_TAMENESS) }, { transaction: t });
      } else {
        // Care area (L2) / veterinary (L3).
        if (c.building.level < 2) throw new ConflictError('Can khu cham soc (trai cap 2)', 'VET_UNAVAILABLE');
        await this.ctx.resources.charge(city.id, { coins: VET_COST, wood: 0, stone: 0 }, t);
        const health = Math.min(1, c.animal.health + vetHeal(c.building.level));
        await c.animal.update(
          {
            health,
            starvingSeconds: 0,
            status: animalStatus({ health, satiety: c.animal.satiety, thirst: c.animal.thirst, growsUpAtMs: ms(c.animal.growsUpAt) }, now.getTime()),
          },
          { transaction: t }
        );
      }
      await careRecord(this.models, { cityId: city.id, farmId: c.farm.id, animalId: c.animal.id, kind: input.action, at: now }, t);
      return { state: await this.state(city.id, t) };
    });
  }

  // ── Tack ───────────────────────────────────────────────────────────────────
  async equip(cityId: string, userId: string, animalId: string, input: AnimalEquipInput): Promise<MountMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const c = await this.load(city.id, animalId, t);
      if (c.traits.training) this.blocked('ANIMAL_TRAINING');
      const current = await this.models.AnimalEquipment.findOne({ where: { animalId: c.animal.id, slot: input.slot }, transaction: t });
      const use = c.traits.use;
      if (!input.equipmentCode) {
        // Taking off what the current job needs is not allowed.
        if (input.slot === 'saddle' && use?.kind === 'mount') throw new ConflictError('Ngua dang co nguoi cuoi', 'ANIMAL_IN_USE');
        if (input.slot === 'harness' && use?.kind === 'transport') throw new ConflictError('Thu dang cho hang', 'ANIMAL_IN_USE');
      } else {
        if (!canEquipAnimal(c.animal.speciesCode, input.slot, input.equipmentCode)) {
          throw new BadRequestError('Trang bi khong hop voi loai thu / o nay', 'EQUIPMENT_NOT_ALLOWED');
        }
        if (current?.equipmentCode === input.equipmentCode) throw new ConflictError('Da trang bi mon nay', 'ALREADY_EQUIPPED');
        const have = (await this.stock.getAmounts(city.id, [input.equipmentCode], t))[input.equipmentCode];
        if (have < 1) throw new AppError(409, 'MISSING_EQUIPMENT', 'Kho khong con trang bi nay', { missing: [input.equipmentCode] });
        await this.stock.add(city.id, input.equipmentCode, -1, t);
      }
      if (current) {
        await this.stock.add(city.id, current.equipmentCode, 1, t);
        await current.destroy({ transaction: t });
      }
      if (input.equipmentCode) await this.models.AnimalEquipment.create({ animalId: c.animal.id, slot: input.slot, equipmentCode: input.equipmentCode }, { transaction: t });
      await careRecord(
        this.models,
        { cityId: city.id, farmId: c.farm.id, animalId: c.animal.id, kind: 'equip', note: input.equipmentCode ? getAnimalEquipment(input.equipmentCode).name : `Thao ${input.slot}`, at: this.ctx.now() },
        t
      );
      return { state: await this.state(city.id, t) };
    });
  }

  // ── Mounts ─────────────────────────────────────────────────────────────────
  async assignMount(cityId: string, userId: string, animalId: string, input: AssignMountInput): Promise<MountMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const c = await this.load(city.id, animalId, t);
      const unit = await this.models.MilitaryUnit.findOne({ where: { id: input.unitId, cityId: city.id }, transaction: t });
      if (!unit) throw new NotFoundError('Binh si khong ton tai', 'UNIT_NOT_FOUND');
      if (unit.status === 'battle') throw new ConflictError('Binh si dang tham chien', 'UNIT_ON_MISSION');
      if (unit.status === 'recruit' || !unit.trainedAt) throw new ConflictError('Tan binh chua hoan thanh huan luyen', 'UNIT_NOT_TRAINED');
      if (await this.models.MountAssignment.count({ where: { unitId: unit.id }, transaction: t })) {
        throw new ConflictError('Binh si da co thu cuoi', 'UNIT_HAS_MOUNT');
      }
      const why = mountBlock(
        {
          species: c.animal.speciesCode,
          adult: c.adult,
          health: c.animal.health,
          traits: storedTraits(c.animal),
          saddle: c.traits.equipment.saddle === 'eq_saddle',
          inUse: c.traits.use !== null,
          training: c.traits.training !== null,
        },
        unit.unitTypeCode
      );
      if (why) this.blocked(why);
      try {
        await this.models.MountAssignment.create({ cityId: city.id, animalId: c.animal.id, unitId: unit.id, assignedAt: this.ctx.now() }, { transaction: t });
      } catch (err) {
        // The database is the last word: one horse per rider, one rider per horse.
        if (err instanceof UniqueConstraintError) this.blocked('ANIMAL_IN_USE');
        throw err;
      }
      const survivor = await this.models.Survivor.findByPk(unit.survivorId, { transaction: t });
      await careRecord(this.models, { cityId: city.id, farmId: c.farm.id, animalId: c.animal.id, kind: 'mount', note: survivor?.name ?? '', at: this.ctx.now() }, t);
      return { state: await this.state(city.id, t) };
    });
  }

  async unassignMount(cityId: string, userId: string, animalId: string): Promise<MountMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const c = await this.load(city.id, animalId, t);
      const n = await this.models.MountAssignment.destroy({ where: { animalId: c.animal.id }, transaction: t });
      if (!n) throw new NotFoundError('Ngua chua duoc giao cho ai', 'NOT_MOUNTED');
      await careRecord(this.models, { cityId: city.id, farmId: c.farm.id, animalId: c.animal.id, kind: 'dismount', at: this.ctx.now() }, t);
      return { state: await this.state(city.id, t) };
    });
  }

  // ── Duties ─────────────────────────────────────────────────────────────────
  async assignTask(cityId: string, userId: string, animalId: string, input: AssignTaskInput): Promise<MountMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const c = await this.load(city.id, animalId, t);
      const why = taskBlock(input.kind, {
        species: c.animal.speciesCode,
        adult: c.adult,
        traits: storedTraits(c.animal),
        harness: c.traits.equipment.harness === 'eq_cargo_harness',
        inUse: c.traits.use !== null,
        training: c.traits.training !== null,
      });
      if (why) this.blocked(why);
      try {
        await this.models.AnimalAssignment.create({ cityId: city.id, animalId: c.animal.id, kind: input.kind, assignedAt: this.ctx.now() }, { transaction: t });
      } catch (err) {
        if (err instanceof UniqueConstraintError) this.blocked('ANIMAL_IN_USE');
        throw err;
      }
      await careRecord(this.models, { cityId: city.id, farmId: c.farm.id, animalId: c.animal.id, kind: 'task', note: input.kind, at: this.ctx.now() }, t);
      return { state: await this.state(city.id, t) };
    });
  }

  async unassignTask(cityId: string, userId: string, animalId: string): Promise<MountMutationResultDTO> {
    return this.mutate(cityId, userId, true, async (city, t) => {
      const c = await this.load(city.id, animalId, t);
      const n = await this.models.AnimalAssignment.destroy({ where: { animalId: c.animal.id }, transaction: t });
      if (!n) throw new NotFoundError('Thu khong co nhiem vu', 'NO_TASK');
      await careRecord(this.models, { cityId: city.id, farmId: c.farm.id, animalId: c.animal.id, kind: 'task', note: 'Ket thuc nhiem vu', at: this.ctx.now() }, t);
      return { state: await this.state(city.id, t) };
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private async load(cityId: string, animalId: string, t: Transaction): Promise<AnimalCtx> {
    const animal = await this.models.FarmAnimal.findOne({ where: { id: animalId, cityId }, transaction: t });
    if (!animal) throw new NotFoundError('Thu khong ton tai', 'ANIMAL_NOT_FOUND');
    if (!isMountSpecies(animal.speciesCode)) throw new BadRequestError('Day khong phai thu lam viec (ngua / voi)', 'NOT_A_WORKING_ANIMAL');
    const farm = await this.models.LivestockFarm.findByPk(animal.farmId, { transaction: t });
    const building = farm ? await this.models.WorldBuilding.findByPk(farm.buildingId, { transaction: t }) : null;
    if (!farm || !building) throw new NotFoundError('Trai khong ton tai', 'LIVESTOCK_FARM_NOT_FOUND');
    const traits = (await loadTraits(this.models, [animal], t)).get(animal.id)!;
    return { animal, farm, building, traits, adult: this.ctx.now().getTime() >= ms(animal.growsUpAt) };
  }

  private async state(cityId: string, t: Transaction): Promise<MountStateDTO> {
    const farms = await this.models.LivestockFarm.findAll({ where: { cityId, farmType: [...MOUNT_FARM_TYPES] }, order: [['createdAt', 'ASC']], transaction: t });
    const animals: MountAnimalDTO[] = [];
    for (const farm of farms) {
      const dto = await this.livestock.dtoOf(farm, t);
      for (const a of dto.animals) if (a.traits) animals.push({ ...a, farmId: dto.id, farmType: dto.farmType, farmLevel: dto.level, traits: a.traits });
    }
    const [jobs, records, duty] = await Promise.all([
      this.models.AnimalTrainingJob.findAll({ where: { cityId, status: 'in_progress' }, order: [['startedAt', 'ASC']], transaction: t }),
      this.models.AnimalCareRecord.findAll({ where: { cityId }, order: [['at', 'DESC']], limit: 40, transaction: t }),
      this.models.AnimalAssignment.findAll({ where: { cityId, kind: 'transport' }, transaction: t }),
    ]);
    const stock = await this.stock.getAmounts(cityId, ANIMAL_EQUIPMENT_CODES, t);
    // Same rule as the economy (animalHaul): healthy animals on transport duty.
    const transportBonus = duty.reduce((sum, d) => {
      const a = animals.find((x) => x.id === d.animalId);
      return a && a.health >= 0.3 ? sum + this.haulOf(a) : sum;
    }, 0);
    return {
      animals,
      jobs: jobs.map((j) => ({
        id: j.id,
        animalId: j.animalId,
        farmId: j.farmId,
        program: j.program,
        startedAt: new Date(j.startedAt).toISOString(),
        finishesAt: new Date(j.finishesAt).toISOString(),
        status: j.status,
      })),
      records: records.map((r) => ({ id: r.id, animalId: r.animalId, farmId: r.farmId, kind: r.kind, note: r.note, at: new Date(r.at).toISOString() })),
      equipment: Object.fromEntries(ANIMAL_EQUIPMENT_CODES.map((c) => [c, stock[c] ?? 0])),
      transportBonus,
      resources: await this.ctx.resources.getBag(cityId, t),
      serverTime: this.ctx.now().toISOString(),
    };
  }

  /** Haul / hour from the DTO's effective carry (same formula as the economy). */
  private haulOf(a: MountAnimalDTO): number {
    return Math.round((a.traits.carry / 20) * (0.7 + 0.3 * a.traits.stamina));
  }
}
