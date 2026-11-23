import { z } from 'zod';
import type { ResourceBag } from '../buildings/definitions.js';
import type { FarmAnimalDTO } from '../livestock/api.js';
import type { LivestockFarmTypeCode } from '../livestock/definitions.js';
import type { UnitTypeCode } from '../military/definitions.js';
import type { AnimalEquipmentCode, AnimalEquipmentSlot, AnimalTaskKind, CareRecordKind, TrainingProgramCode } from './definitions.js';

export type AnimalUseDTO =
  | { kind: 'mount'; unitId: string; unitName: string; unitType: UnitTypeCode }
  | { kind: AnimalTaskKind; since: string };

/** Working-animal stats of a horse / elephant (part of FarmAnimalDTO.traits). */
export interface MountTraitsDTO {
  tameness: number;
  tame: boolean;
  stamina: number;
  /** m/s */
  speed: number;
  /** kg */
  carry: number;
  trainingLevel: number;
  trainingLabel: string;
  use: AnimalUseDTO | null;
  training: { jobId: string; program: TrainingProgramCode; startedAt: string; finishesAt: string } | null;
  equipment: Partial<Record<AnimalEquipmentSlot, AnimalEquipmentCode>>;
}

export interface MountAnimalDTO extends FarmAnimalDTO {
  farmId: string;
  farmType: LivestockFarmTypeCode;
  farmLevel: number;
  traits: MountTraitsDTO;
}

export interface AnimalTrainingJobDTO {
  id: string;
  animalId: string;
  farmId: string;
  program: TrainingProgramCode;
  startedAt: string;
  finishesAt: string;
  status: 'in_progress' | 'completed' | 'cancelled';
}

export interface AnimalCareRecordDTO {
  id: string;
  animalId: string | null;
  farmId: string;
  kind: CareRecordKind;
  note: string;
  at: string;
}

export interface MountStateDTO {
  animals: MountAnimalDTO[];
  jobs: AnimalTrainingJobDTO[];
  records: AnimalCareRecordDTO[];
  /** Animal equipment in storage */
  equipment: Record<string, number>;
  /** Goods per game hour added to transport by animals on duty */
  transportBonus: number;
  resources: ResourceBag;
  serverTime: string;
}

export interface MountMutationResultDTO {
  state: MountStateDTO;
}

const uuid = z.string().uuid('Ma khong hop le');

export const trainAnimalSchema = z.object({ program: z.enum(['taming', 'riding', 'speed', 'endurance', 'cargo', 'war']) });
export const careAnimalSchema = z.object({ action: z.enum(['groom', 'vet']) });
export const animalEquipSchema = z.object({
  slot: z.enum(['saddle', 'armor', 'harness', 'howdah']),
  equipmentCode: z.enum(['eq_saddle', 'eq_horse_barding', 'eq_cargo_harness', 'eq_howdah']).nullable(),
});
export const assignMountSchema = z.object({ unitId: uuid });
export const assignTaskSchema = z.object({ kind: z.enum(['transport', 'military']) });
export const mountAnimalParamsSchema = z.object({ cityId: uuid, animalId: uuid });

export type TrainAnimalInput = z.infer<typeof trainAnimalSchema>;
export type CareAnimalInput = z.infer<typeof careAnimalSchema>;
export type AnimalEquipInput = z.infer<typeof animalEquipSchema>;
export type AssignMountInput = z.infer<typeof assignMountSchema>;
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;
