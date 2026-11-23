/**
 * Shared working-animal helpers (Phase 9), used by the livestock service (deaths, sales, farm
 * removal, DTOs) and the mount service (training, care, tack, mounts, duties).
 */
import type { Transaction } from 'sequelize';
import {
  TRAINING_LEVEL_LABELS,
  applyTraining,
  getTrainingProgram,
  isMountSpecies,
  isTame,
  mountCarry,
  mountSpeed,
  transportPerHour,
  type AnimalEquipmentCode,
  type AnimalEquipmentSlot,
  type CareRecordKind,
  type MountTraitsDTO,
  type StoredMountTraits,
} from '@cityverse/shared';
import type { FarmAnimal } from '../../database/models/Livestock.js';
import type { DatabaseModels } from '../../database/models/index.js';
import { ProduceService } from '../farming/farm.service.js';

const ms = (d: Date | string): number => new Date(d).getTime();
const round = (v: number, k = 1000): number => Math.round(v * k) / k;

export const storedTraits = (a: Pick<FarmAnimal, 'tameness' | 'stamina' | 'speedBonus' | 'carryBonus' | 'trainingLevel'>): StoredMountTraits => ({
  tameness: a.tameness,
  stamina: a.stamina,
  speedBonus: a.speedBonus,
  carryBonus: a.carryBonus,
  trainingLevel: a.trainingLevel,
});

export async function careRecord(
  models: DatabaseModels,
  v: { cityId: string; farmId: string; animalId: string | null; kind: CareRecordKind; note?: string; at: Date },
  t: Transaction
): Promise<void> {
  await models.AnimalCareRecord.create({ ...v, note: (v.note ?? '').slice(0, 200) }, { transaction: t });
}

/**
 * Frees animals that leave (sold, died, farm removed): open training is cancelled, mount /
 * duty assignments are dropped and their tack goes back to storage.
 */
export async function releaseAnimals(models: DatabaseModels, cityId: string, animalIds: readonly string[], t: Transaction, now: Date): Promise<void> {
  if (!animalIds.length) return;
  const stock = new ProduceService(models);
  await models.AnimalTrainingJob.update({ status: 'cancelled', completedAt: now }, { where: { animalId: [...animalIds], status: 'in_progress' }, transaction: t });
  await models.MountAssignment.destroy({ where: { animalId: [...animalIds] }, transaction: t });
  await models.AnimalAssignment.destroy({ where: { animalId: [...animalIds] }, transaction: t });
  const tack = await models.AnimalEquipment.findAll({ where: { animalId: [...animalIds] }, transaction: t });
  for (const e of tack) await stock.add(cityId, e.equipmentCode, 1, t);
  await models.AnimalEquipment.destroy({ where: { animalId: [...animalIds] }, transaction: t });
}

/** Completes due training programs exactly once (conditional UPDATE) and applies the gains. */
export async function settleAnimalTraining(models: DatabaseModels, cityId: string, now: Date, t: Transaction): Promise<void> {
  const open = await models.AnimalTrainingJob.findAll({ where: { cityId, status: 'in_progress' }, transaction: t });
  for (const job of open) {
    if (ms(job.finishesAt) > now.getTime()) continue;
    const [changed] = await models.AnimalTrainingJob.update(
      { status: 'completed', completedAt: job.finishesAt },
      { where: { id: job.id, status: 'in_progress' }, transaction: t }
    );
    if (changed !== 1) continue;
    const animal = await models.FarmAnimal.findOne({ where: { id: job.animalId, cityId }, transaction: t });
    if (!animal || !isMountSpecies(animal.speciesCode)) continue;
    const program = getTrainingProgram(job.program);
    const next = applyTraining(animal.speciesCode, storedTraits(animal), program, animal.health, animal.satiety);
    await animal.update({ ...next }, { transaction: t });
    await careRecord(models, { cityId, farmId: job.farmId, animalId: animal.id, kind: 'training', note: program.name, at: job.finishesAt }, t);
  }
}

/** Goods / game hour hauled by healthy animals on transport duty (adds to the city's haulers). */
export async function animalHaul(models: DatabaseModels, cityId: string, t: Transaction): Promise<number> {
  const duty = await models.AnimalAssignment.findAll({ where: { cityId, kind: 'transport' }, transaction: t });
  if (!duty.length) return 0;
  const animals = await models.FarmAnimal.findAll({ where: { id: duty.map((d) => d.animalId) }, transaction: t });
  return animals.reduce((sum, a) => (isMountSpecies(a.speciesCode) && a.health >= 0.3 ? sum + transportPerHour(a.speciesCode, a.breed, storedTraits(a)) : sum), 0);
}

/** Working-animal DTOs for a set of animals (null for ordinary livestock). */
export async function loadTraits(models: DatabaseModels, animals: readonly FarmAnimal[], t: Transaction): Promise<Map<string, MountTraitsDTO>> {
  const out = new Map<string, MountTraitsDTO>();
  const ids = animals.filter((a) => isMountSpecies(a.speciesCode)).map((a) => a.id);
  if (!ids.length) return out;
  const [jobs, tasks, tack, mounts] = await Promise.all([
    models.AnimalTrainingJob.findAll({ where: { animalId: ids, status: 'in_progress' }, transaction: t }),
    models.AnimalAssignment.findAll({ where: { animalId: ids }, transaction: t }),
    models.AnimalEquipment.findAll({ where: { animalId: ids }, transaction: t }),
    models.MountAssignment.findAll({ where: { animalId: ids }, transaction: t }),
  ]);
  const units = mounts.length ? await models.MilitaryUnit.findAll({ where: { id: mounts.map((m) => m.unitId) }, transaction: t }) : [];
  const survivors = units.length ? await models.Survivor.findAll({ where: { id: units.map((u) => u.survivorId) }, transaction: t }) : [];
  for (const a of animals) {
    if (!isMountSpecies(a.speciesCode)) continue;
    const traits = storedTraits(a);
    const job = jobs.find((j) => j.animalId === a.id);
    const task = tasks.find((x) => x.animalId === a.id);
    const mount = mounts.find((m) => m.animalId === a.id);
    const unit = mount ? units.find((u) => u.id === mount.unitId) : undefined;
    const equipment: Partial<Record<AnimalEquipmentSlot, AnimalEquipmentCode>> = {};
    for (const e of tack.filter((x) => x.animalId === a.id)) equipment[e.slot] = e.equipmentCode;
    out.set(a.id, {
      tameness: round(traits.tameness),
      tame: isTame(traits),
      stamina: round(traits.stamina),
      speed: mountSpeed(a.speciesCode, a.breed, traits),
      carry: mountCarry(a.speciesCode, a.breed, traits),
      trainingLevel: traits.trainingLevel,
      trainingLabel: TRAINING_LEVEL_LABELS[traits.trainingLevel] ?? '',
      use: unit
        ? { kind: 'mount', unitId: unit.id, unitName: survivors.find((s) => s.id === unit.survivorId)?.name ?? 'Binh sĩ', unitType: unit.unitTypeCode }
        : task
          ? { kind: task.kind, since: new Date(task.assignedAt).toISOString() }
          : null,
      training: job ? { jobId: job.id, program: job.program, startedAt: new Date(job.startedAt).toISOString(), finishesAt: new Date(job.finishesAt).toISOString() } : null,
      equipment,
    });
  }
  return out;
}
