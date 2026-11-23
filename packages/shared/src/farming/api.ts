import { z } from 'zod';
import type { AxialCoord } from '../hex/hexMath.js';
import type { ResourceBag } from '../buildings/definitions.js';
import type { CropTypeCode, FarmZoneTypeCode, ProduceBag } from './definitions.js';
import type { IrrigationKind, WaterSourceType } from './zone.js';

export type FarmZoneStatus = 'active' | 'upgrading';
export type CropCycleStatus = 'growing' | 'harvested' | 'cleared';

export interface CropCycleDTO {
  id: string;
  cropCode: CropTypeCode;
  plantedAt: string;
  readyAt: string;
  /** Produce amount harvested when ready */
  expectedYield: number;
  waterFactor: number;
  status: CropCycleStatus;
}

export interface IrrigationNetworkDTO {
  kind: IrrigationKind;
  sourceType: WaterSourceType;
  sourceHex: AxialCoord | null;
  sourceDistance: number | null;
  naturalSupply: number;
  supply: number;
  fertility: number;
}

export interface FarmZoneDTO {
  id: string;
  cityId: string;
  zoneType: FarmZoneTypeCode;
  name: string;
  level: number;
  status: FarmZoneStatus;
  /** Set while upgrading */
  upgradeStartedAt: string | null;
  upgradeFinishesAt: string | null;
  hexes: AxialCoord[];
  irrigation: IrrigationNetworkDTO;
  crop: CropCycleDTO | null;
  totalHarvested: number;
  /** Resources spent so far (creation + expansions + upgrades); removal refunds a share. */
  invested: ResourceBag;
  createdAt: string;
  updatedAt: string;
}

export interface FarmStateDTO {
  zones: FarmZoneDTO[];
  produce: ProduceBag;
  resources: ResourceBag;
  serverTime: string;
}

export interface FarmMutationResultDTO {
  zone: FarmZoneDTO | null;
  produce: ProduceBag;
  resources: ResourceBag;
  serverTime: string;
  /** Harvested amount (harvest only) */
  harvested?: number;
}

const hexCoord = z.number().int().min(-200).max(200);
const hexList = z.array(z.object({ q: hexCoord, r: hexCoord })).min(1).max(120);

export const createFarmZoneSchema = z.object({
  zoneType: z.enum(['rice_paddy', 'corn_field', 'vegetable_garden', 'orchard', 'pasture']),
  hexes: hexList,
});

export const expandFarmZoneSchema = z.object({ hexes: hexList });

export const plantCropSchema = z.object({
  cropCode: z.enum(['rice', 'corn', 'cabbage', 'carrot', 'orange', 'clover']).optional(),
});

export const farmZoneParamsSchema = z.object({
  cityId: z.string().uuid('Ma thanh pho khong hop le'),
  zoneId: z.string().uuid('Ma khu canh tac khong hop le'),
});

export type CreateFarmZoneInput = z.infer<typeof createFarmZoneSchema>;
export type ExpandFarmZoneInput = z.infer<typeof expandFarmZoneSchema>;
export type PlantCropInput = z.infer<typeof plantCropSchema>;
