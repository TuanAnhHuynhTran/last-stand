import { z } from 'zod';
import type { AxialCoord } from '../hex/hexMath.js';
import type { ResourceBag } from '../buildings/definitions.js';
import type { Activity, Appearance, DayPhase, Mood, ProfessionCode, ResourceGroup, WorkplaceKind } from './definitions.js';
import type { ProducerStatus } from './simulation.js';

export interface ClockDTO {
  epoch: string;
  daySeconds: number;
  day: number;
  hour: number;
  phase: DayPhase;
  serverTime: string;
}

export interface SurvivorDTO {
  id: string;
  name: string;
  profession: ProfessionCode | null;
  skills: Partial<Record<ProfessionCode, number>>;
  health: number;
  stamina: number;
  satisfaction: number;
  mood: Mood;
  appearance: Appearance;
  homeId: string | null;
  job: { kind: WorkplaceKind; id: string } | null;
  activity: Activity;
  arrivedAt: string;
  origin: 'founder' | 'migration' | 'event' | 'birth' | 'rescue';
  /** Serves in the army (Phase 8): no civilian job, drawn by the military scene */
  soldier: boolean;
}

export interface HouseDTO {
  buildingId: string;
  level: number;
  capacity: number;
  residents: string[];
  hexes: AxialCoord[];
  /** Under construction: nobody can live there yet */
  ready: boolean;
}

export interface WorkplaceDTO {
  kind: WorkplaceKind;
  id: string;
  typeCode: string;
  name: string;
  level: number;
  profession: ProfessionCode;
  slots: number;
  workers: string[];
  hexes: AxialCoord[];
  /** Not usable (under construction / upgrading) */
  ready: boolean;
}

export interface ProductionDTO {
  buildingId: string;
  typeCode: string;
  level: number;
  recipe: string | null;
  progress: number;
  status: ProducerStatus;
  buffer: Record<string, number>;
  bufferCapacity: number;
  workers: number;
  /** Batches per game day at the current staffing (estimate) */
  batchesPerDay: number;
  autoTransfer: boolean;
}

export type WarningCode =
  | 'FOOD_SHORTAGE'
  | 'WATER_SHORTAGE'
  | 'HOUSING_FULL'
  | 'HOMELESS'
  | 'UNEMPLOYED'
  | 'MISSING_INPUT'
  | 'BUFFER_FULL'
  | 'STORAGE_FULL'
  | 'NO_WORKERS';

export interface WarningDTO {
  code: WarningCode;
  message: string;
  severity: 'info' | 'warning' | 'danger';
  ref?: string;
}

export interface EconomyGroupDTO {
  group: ResourceGroup;
  income: number;
  expense: number;
}

export interface EconomyStatsDTO {
  /** Totals over the last game days (from resource_transactions) */
  days: number;
  groups: EconomyGroupDTO[];
  byReason: Record<string, number>;
  byCode: Record<string, { income: number; expense: number }>;
  foodDays: number | null;
  waterDays: number | null;
  storageCapacity: number;
}

export interface PopulationStateDTO {
  clock: ClockDTO;
  survivors: SurvivorDTO[];
  houses: HouseDTO[];
  workplaces: WorkplaceDTO[];
  production: ProductionDTO[];
  warnings: WarningDTO[];
  stock: Record<string, number>;
  resources: ResourceBag;
  housingCapacity: number;
  settings: { autoAssign: boolean; naturalGrowth: boolean; daySeconds: number };
  rescue: { arrivesAtHour: number; count: number } | null;
  serverTime: string;
}

export interface PopulationMutationResultDTO {
  state: PopulationStateDTO;
  collected?: Record<string, number>;
}

const uuid = z.string().uuid('Ma khong hop le');

export const assignJobSchema = z.object({
  survivorId: uuid,
  kind: z.enum(['building', 'farm_zone', 'livestock_farm', 'water_body']),
  workplaceId: uuid,
});
export const moveHomeSchema = z.object({ buildingId: uuid });
export const setRecipeSchema = z.object({ recipeCode: z.string().min(1).max(32) });
export const populationSettingsSchema = z.object({
  autoAssign: z.boolean().optional(),
  naturalGrowth: z.boolean().optional(),
  daySeconds: z.number().int().min(120).max(7200).optional(),
});
export const survivorParamsSchema = z.object({ cityId: uuid, survivorId: uuid });
export const productionParamsSchema = z.object({ cityId: uuid, buildingId: uuid });

export type AssignJobInput = z.infer<typeof assignJobSchema>;
export type MoveHomeInput = z.infer<typeof moveHomeSchema>;
export type SetRecipeInput = z.infer<typeof setRecipeSchema>;
export type PopulationSettingsInput = z.infer<typeof populationSettingsSchema>;
