import { z } from 'zod';
import type { BuildingTypeCode, ResourceBag } from './definitions.js';
import type { HexRotation } from './footprint.js';

export type BuildingStatus = 'constructing' | 'upgrading' | 'active';
export type ConstructionJobType = 'build' | 'upgrade';
export type ConstructionJobStatus = 'in_progress' | 'completed' | 'cancelled';

export interface ConstructionJobDTO {
  id: string;
  jobType: ConstructionJobType;
  fromLevel: number;
  targetLevel: number;
  cost: ResourceBag;
  startedAt: string;
  finishesAt: string;
  status: ConstructionJobStatus;
}

export interface WorldBuildingDTO {
  id: string;
  cityId: string;
  typeCode: BuildingTypeCode;
  level: number;
  status: BuildingStatus;
  anchorQ: number;
  anchorR: number;
  rotation: HexRotation;
  footprint: { q: number; r: number }[];
  activeJob: ConstructionJobDTO | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuildingsStateDTO {
  buildings: WorldBuildingDTO[];
  resources: ResourceBag;
  /** Server clock (ISO) so the client can show construction progress without drift. */
  serverTime: string;
  maxConcurrentJobs: number;
}

export interface BuildingMutationResultDTO {
  building: WorldBuildingDTO | null;
  resources: ResourceBag;
  serverTime: string;
}

/** Parallel construction/upgrade jobs a city can run. */
export const MAX_CONCURRENT_CONSTRUCTION_JOBS = 3;
/** Share of invested resources returned when demolishing. */
export const DEMOLISH_REFUND_RATE = 0.5;

const hexCoord = z.number().int().min(-200).max(200);

export const placeBuildingSchema = z.object({
  typeCode: z.enum(['radar', 'house', 'territory_center', 'storage', 'market', 'clinic', 'carpentry', 'quarry', 'smithy', 'well', 'road', 'sword_barracks', 'spear_barracks', 'archery_range', 'crossbow_range', 'military_forge', 'training_ground', 'military_depot']),
  q: hexCoord,
  r: hexCoord,
  rotation: z.number().int().min(0).max(5).default(0),
});

export const moveBuildingSchema = z.object({
  q: hexCoord,
  r: hexCoord,
  rotation: z.number().int().min(0).max(5).default(0),
});

export const buildingParamsSchema = z.object({
  cityId: z.string().uuid('Ma thanh pho khong hop le'),
  buildingId: z.string().uuid('Ma cong trinh khong hop le'),
});

export type PlaceBuildingInput = z.infer<typeof placeBuildingSchema>;
export type MoveBuildingInput = z.infer<typeof moveBuildingSchema>;
