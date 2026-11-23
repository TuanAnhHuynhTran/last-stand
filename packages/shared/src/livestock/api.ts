import { z } from 'zod';
import type { AxialCoord } from '../hex/hexMath.js';
import type { ResourceBag } from '../buildings/definitions.js';
import type { ProduceBag } from '../farming/definitions.js';
import type {
  AnimalTypeCode,
  FeedRecipeCode,
  LivestockFarmTypeCode,
  LivestockProductBag,
  ProductAmounts,
  RanchTile,
  WaterSource,
} from './definitions.js';
import type { AnimalStatus } from './simulation.js';
import type { MountTraitsDTO } from '../mounts/api.js';

export type LivestockFarmStatus = 'active' | 'upgrading';
export type LivestockJobType = 'produce' | 'breed';
/** in_progress → ready → collected (produce) · in_progress → completed (breed / empty batch) */
export type LivestockJobStatus = 'in_progress' | 'ready' | 'collected' | 'completed';

export interface FarmAnimalDTO {
  id: string;
  animalCode: AnimalTypeCode;
  breed: string;
  name: string;
  bornAt: string;
  growsUpAt: string;
  /** 0..1 */
  health: number;
  /** 0..1 (1 = full) */
  satiety: number;
  /** 0..1 (1 = very thirsty) */
  thirst: number;
  status: AnimalStatus;
  /** Horses / elephants (Phase 9): training stats, equipment, what it is used for */
  traits?: MountTraitsDTO | null;
}

export interface LivestockJobDTO {
  id: string;
  jobType: LivestockJobType;
  animalCode: AnimalTypeCode | null;
  breed: string | null;
  startedAt: string;
  finishesAt: string;
  status: LivestockJobStatus;
  /** Fractional products accrued so far (running batch) */
  progress: ProductAmounts;
  /** Final products (ready batch) */
  output: ProductAmounts;
  /** 0..1 average productivity during the batch */
  efficiency: number;
}

export interface LivestockFarmDTO {
  id: string;
  /** world_buildings row that owns the farm's land (footprint) */
  buildingId: string;
  cityId: string;
  farmType: LivestockFarmTypeCode;
  name: string;
  level: number;
  status: LivestockFarmStatus;
  upgradeStartedAt: string | null;
  upgradeFinishesAt: string | null;
  hexes: AxialCoord[];
  tiles: RanchTile[];
  capacity: number;
  animals: FarmAnimalDTO[];
  /** Running or collectable production / breeding jobs */
  jobs: LivestockJobDTO[];
  feedStock: number;
  feedCapacity: number;
  feedQuality: number;
  waterStock: number;
  waterCapacity: number;
  /** Natural source (well / lake); `effectiveWaterSource` is piped at level 3 */
  waterSource: WaterSource;
  effectiveWaterSource: WaterSource;
  caretakers: number;
  maxCaretakers: number;
  caretakersNeeded: number;
  /** Server time the stats above were simulated to */
  simulatedAt: string;
  invested: ResourceBag;
  totalProduced: number;
  createdAt: string;
  updatedAt: string;
}

export interface HerdSummaryDTO {
  total: number;
  adults: number;
  young: number;
  bySpecies: Partial<Record<AnimalTypeCode, number>>;
  byStatus: Partial<Record<AnimalStatus, number>>;
  avgHealth: number;
  avgSatiety: number;
  avgThirst: number;
  /** Average productivity of the adults right now (0..~1.3) */
  productivity: number;
  laborFactor: number;
  feedMinutesLeft: number | null;
  waterMinutesLeft: number | null;
  readyOutput: ProductAmounts;
}

export interface HerdStatusDTO {
  farm: LivestockFarmDTO;
  summary: HerdSummaryDTO;
  serverTime: string;
}

export interface LivestockStateDTO {
  farms: LivestockFarmDTO[];
  products: LivestockProductBag;
  produce: ProduceBag;
  resources: ResourceBag;
  serverTime: string;
}

export interface LivestockMutationResultDTO {
  farm: LivestockFarmDTO | null;
  /** Second farm touched by the call (transfer target) */
  otherFarm?: LivestockFarmDTO | null;
  products: LivestockProductBag;
  produce: ProduceBag;
  resources: ResourceBag;
  serverTime: string;
  collected?: ProductAmounts;
}

const hexCoord = z.number().int().min(-200).max(200);
const hexList = z.array(z.object({ q: hexCoord, r: hexCoord })).min(1).max(80);
const animalCode = z.enum(['chicken', 'pig', 'cow', 'sheep', 'goat', 'horse', 'elephant']);
const recipeCode = z.enum(['corn_grain', 'fresh_grass', 'rice_bran', 'vegetable_scraps', 'processed_feed']) satisfies z.ZodType<FeedRecipeCode>;

export const createLivestockFarmSchema = z.object({
  farmType: z.enum(['chicken_farm', 'pig_farm', 'cattle_farm', 'sheep_farm', 'horse_stable', 'elephant_camp']),
  hexes: hexList,
});

export const expandLivestockFarmSchema = z.object({ hexes: hexList });

export const buyAnimalsSchema = z.object({
  animalCode,
  breed: z.string().min(1).max(32).optional(),
  count: z.number().int().min(1).max(20).default(1),
});

export const breedAnimalsSchema = z.object({ animalCode });

export const feedLivestockSchema = z.object({
  recipeCode,
  batches: z.number().int().min(1).max(500).default(1),
});

export const setCaretakersSchema = z.object({ count: z.number().int().min(0).max(10) });

export const transferAnimalSchema = z.object({ targetFarmId: z.string().uuid('Ma trang trai khong hop le') });

export const livestockFarmParamsSchema = z.object({
  cityId: z.string().uuid('Ma thanh pho khong hop le'),
  farmId: z.string().uuid('Ma trang trai khong hop le'),
});

export const livestockAnimalParamsSchema = livestockFarmParamsSchema.extend({
  animalId: z.string().uuid('Ma vat nuoi khong hop le'),
});

export type CreateLivestockFarmInput = z.infer<typeof createLivestockFarmSchema>;
export type ExpandLivestockFarmInput = z.infer<typeof expandLivestockFarmSchema>;
export type BuyAnimalsInput = z.infer<typeof buyAnimalsSchema>;
export type BreedAnimalsInput = z.infer<typeof breedAnimalsSchema>;
export type FeedLivestockInput = z.infer<typeof feedLivestockSchema>;
export type SetCaretakersInput = z.infer<typeof setCaretakersSchema>;
export type TransferAnimalInput = z.infer<typeof transferAnimalSchema>;
