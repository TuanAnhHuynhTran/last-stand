import { z } from 'zod';
import type { ResourceBag } from '../buildings/definitions.js';
import type { EquipmentCode, EquipmentSlot, Formation, SquadStatus, UnitStats, UnitTypeCode } from './definitions.js';

export type UnitStatus = 'recruit' | 'training' | 'ready' | 'drilling' | 'battle';
export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  battle: 'Đang tham chiến',
  recruit: 'Tân binh chờ huấn luyện',
  training: 'Đang huấn luyện',
  ready: 'Sẵn sàng',
  drilling: 'Đang thao luyện',
};
export type TrainingKind = 'recruit' | 'drill';
export type TrainingStatus = 'in_progress' | 'completed';

export interface MilitaryUnitDTO {
  id: string;
  survivorId: string;
  name: string;
  type: UnitTypeCode;
  rank: number;
  rankName: string;
  xp: number;
  nextRankXp: number | null;
  status: UnitStatus;
  /** Barracks / training ground the soldier belongs to */
  buildingId: string;
  equipment: Partial<Record<EquipmentSlot, EquipmentCode>>;
  stats: UnitStats;
  power: number;
  /** Fully equipped and not busy */
  ready: boolean;
  missing: EquipmentSlot[];
  squadIds: string[];
  /** Villager look (same chibi rig as civilians) */
  appearance: { skin: string; hair: string; hairStyle: number; height: number };
  /** Phase 9: the horse this soldier rides (stats above already include the mount) */
  mount: { animalId: string; farmId: string; name: string; breed: string; speed: number; trainingLevel: number; armored: boolean } | null;
}

export interface TrainingJobDTO {
  id: string;
  buildingId: string;
  kind: TrainingKind;
  unitType: UnitTypeCode | null;
  unitIds: string[];
  startedAt: string;
  finishesAt: string;
  status: TrainingStatus;
}

export interface BarracksDTO {
  buildingId: string;
  typeCode: string;
  level: number;
  /** Under construction / upgrading — upgrading barracks keep training */
  ready: boolean;
  unitType: UnitTypeCode | null;
  slots: number;
  training: number;
  free: number;
  trainSeconds: number | null;
  soldiers: string[];
  hexes: { q: number; r: number }[];
  anchor: { q: number; r: number };
  rotation: number;
}

export interface SquadDTO {
  id: string;
  name: string;
  formation: Formation;
  status: SquadStatus;
  members: string[];
  power: number;
  readiness: number;
  xp: number;
}

export interface MilitaryStateDTO {
  units: MilitaryUnitDTO[];
  jobs: TrainingJobDTO[];
  barracks: BarracksDTO[];
  squads: SquadDTO[];
  /** eq_* stock */
  equipment: Record<string, number>;
  /** Survivors that could be recruited now */
  recruitable: number;
  food: number;
  resources: ResourceBag;
  serverTime: string;
}

export interface MilitaryMutationResultDTO {
  state: MilitaryStateDTO;
}

const uuid = z.string().uuid('Ma khong hop le');
const unitType = z.enum(['swordsman', 'spearman', 'archer', 'crossbowman']);

export const recruitSchema = z.object({
  buildingId: uuid,
  unitType,
  count: z.number().int().min(1).max(12),
  /** Start the training job right away (default) */
  startTraining: z.boolean().default(true),
});
export const startTrainingSchema = z.object({
  buildingId: uuid,
  kind: z.enum(['recruit', 'drill']),
  unitIds: z.array(uuid).min(1).max(12).optional(),
});
export const createSquadSchema = z.object({
  name: z.string().trim().min(1).max(40),
  formation: z.enum(['line', 'column', 'wedge', 'square']).default('line'),
});
export const updateSquadSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  formation: z.enum(['line', 'column', 'wedge', 'square']).optional(),
  status: z.enum(['standby', 'deployed']).optional(),
});
export const squadMembersSchema = z.object({ unitIds: z.array(uuid).min(1).max(12) });
export const equipSchema = z.object({
  slot: z.enum(['weapon', 'offhand', 'armor', 'helmet', 'ammo']),
  equipmentCode: z
    .enum(['eq_saber', 'eq_shield', 'eq_spear', 'eq_bow', 'eq_arrows', 'eq_crossbow', 'eq_bolts', 'eq_leather_armor', 'eq_iron_armor', 'eq_helmet', 'eq_iron_helmet'])
    .nullable(),
});
export const squadParamsSchema = z.object({ cityId: uuid, squadId: uuid });
export const squadMemberParamsSchema = squadParamsSchema.extend({ unitId: uuid });
export const unitParamsSchema = z.object({ cityId: uuid, unitId: uuid });

export type RecruitInput = z.infer<typeof recruitSchema>;
export type StartTrainingInput = z.infer<typeof startTrainingSchema>;
export type CreateSquadInput = z.infer<typeof createSquadSchema>;
export type UpdateSquadInput = z.infer<typeof updateSquadSchema>;
export type SquadMembersInput = z.infer<typeof squadMembersSchema>;
export type EquipInput = z.infer<typeof equipSchema>;
