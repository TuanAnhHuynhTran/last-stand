import { z } from 'zod';
import type { ResourceBag } from '../buildings/definitions.js';
import type { PlacementWorld } from '../buildings/footprint.js';
import type { ProduceBag } from '../farming/definitions.js';
import { checkFarmZoneShape, type FarmZoneCheck, type FarmZoneIssue } from '../farming/zone.js';
import { hexDistance, hexKey, isConnectedRegion, isWithinWorldBounds, type AxialCoord } from '../hex/hexMath.js';
import {
  CAGE_MAX_REACH,
  MAX_WATER_BODY_HEXES,
  getWaterBodyDefinition,
  type FishFeedCode,
  type FishSpeciesCode,
  type WaterBodyTypeCode,
} from './definitions.js';
import { planPondLevels, type PondLevels } from './pondTerrain.js';
import type { FishStage } from './simulation.js';

export type WaterBodyStatus = 'dry' | 'filling' | 'active' | 'upgrading' | 'preparing';
export type FishBatchStatus = 'growing' | 'harvested' | 'dead';
export type AquacultureCycleStatus = 'active' | 'harvested';

export interface FishBatchDTO {
  id: string;
  species: FishSpeciesCode;
  stocked: number;
  alive: number;
  weight: number;
  health: number;
  satiety: number;
  stage: FishStage;
  stockedAt: string;
  status: FishBatchStatus;
}

export interface WaterQualityRecordDTO {
  recordedAt: string;
  quality: number;
  waterLevel: number;
  density: number;
  feedStock: number;
}

export interface AquacultureCycleDTO {
  id: string;
  status: AquacultureCycleStatus;
  startedAt: string;
  harvestedAt: string | null;
  stockedFish: number;
  harvested: Partial<Record<string, number>>;
  feedUsed: number;
}

export interface WaterBodyDTO {
  id: string;
  buildingId: string;
  cityId: string;
  type: WaterBodyTypeCode;
  name: string;
  level: number;
  status: WaterBodyStatus;
  upgradeStartedAt: string | null;
  upgradeFinishesAt: string | null;
  hexes: AxialCoord[];
  /** Height of the water surface / bed (terrain is carved between rim and bed) */
  surfaceHeight: number;
  bottomHeight: number;
  area: number;
  volume: number;
  shoreline: number;
  /** 0..1 */
  waterLevel: number;
  waterQuality: number;
  feedStock: number;
  feedCapacity: number;
  feedQuality: number;
  fillStartedAt: string | null;
  fillFinishesAt: string | null;
  /** Cleaning after a harvest — no stocking before this */
  readyAt: string | null;
  capacity: number;
  fishCount: number;
  density: number;
  batches: FishBatchDTO[];
  cycle: AquacultureCycleDTO | null;
  records: WaterQualityRecordDTO[];
  simulatedAt: string;
  totalHarvested: number;
  invested: ResourceBag;
  createdAt: string;
  updatedAt: string;
}

export interface AquacultureStateDTO {
  waterBodies: WaterBodyDTO[];
  /** fish_<species> (kg) and fry_<species> (count) */
  fish: Record<string, number>;
  produce: ProduceBag;
  resources: ResourceBag;
  serverTime: string;
}

export interface AquacultureMutationResultDTO {
  waterBody: WaterBodyDTO | null;
  fish: Record<string, number>;
  produce: ProduceBag;
  resources: ResourceBag;
  serverTime: string;
  harvested?: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape check
// ─────────────────────────────────────────────────────────────────────────────
export type WaterBodyIssue = FarmZoneIssue | 'TERRAIN_UNEVEN' | 'NOT_WATER' | 'TOO_FAR';

export const WATER_BODY_ISSUE_LABELS: Record<'TERRAIN_UNEVEN' | 'NOT_WATER' | 'TOO_FAR', string> = {
  TERRAIN_UNEVEN: 'Địa hình chênh lệch quá lớn để đào ao',
  NOT_WATER: 'Khu cá lồng phải đặt trên mặt nước tự nhiên',
  TOO_FAR: 'Mặt nước quá xa lãnh địa',
};

export interface WaterBodyCheck extends Omit<FarmZoneCheck, 'issues'> {
  issues: WaterBodyIssue[];
  /** Water surface / bed the pond would get (dug types) */
  levels: PondLevels | null;
}

/** Max height difference across a pond's border before digging is refused (m). */
export const MAX_POND_RELIEF = 3;

export interface WaterBodyShapeOptions {
  baseHexes?: readonly AxialCoord[];
  selfOccupant?: string;
  /** Seed-terrain height (no player edits) */
  baseHeight: (x: number, z: number) => number;
  ownedHexes: readonly AxialCoord[];
}

/**
 * Validates hexes for a new water body / an expansion. Dug types: owned, buildable, free land
 * with moderate relief. Fish cages: natural water within CAGE_MAX_REACH of the territory.
 */
export function checkWaterBodyShape(
  world: PlacementWorld,
  type: WaterBodyTypeCode,
  hexes: readonly AxialCoord[],
  occupied: ReadonlyMap<string, string>,
  options: WaterBodyShapeOptions
): WaterBodyCheck {
  const def = getWaterBodyDefinition(type);
  const base = options.baseHexes ?? [];
  if (def.dug) {
    const check = checkFarmZoneShape(world, hexes, occupied, {
      baseHexes: base,
      selfOccupant: options.selfOccupant,
      minHexes: def.minHexes,
      maxHexes: MAX_WATER_BODY_HEXES,
    });
    const issues: WaterBodyIssue[] = [...check.issues];
    let levels: PondLevels | null = null;
    const all = [...base, ...hexes];
    if (all.length) {
      levels = planPondLevels(options.baseHeight, all, type);
      let high = -Infinity;
      for (const h of all) {
        const t = world.getHexTile(h.q, h.r);
        high = Math.max(high, t.height);
      }
      if (high - levels.rim > MAX_POND_RELIEF) issues.push('TERRAIN_UNEVEN');
    }
    return { ...check, issues, valid: issues.length === 0, levels };
  }

  // Fish cages on natural water.
  const baseKeys = new Set(base.map((h) => hexKey(h.q, h.r)));
  const issues = new Set<WaterBodyIssue>();
  const seen = new Set<string>();
  const results = hexes.map((h) => {
    const key = hexKey(h.q, h.r);
    if (seen.has(key)) issues.add('DUPLICATE_HEX');
    seen.add(key);
    let issue: WaterBodyIssue | null = null;
    const occ = occupied.get(key);
    if (baseKeys.has(key)) issue = 'ALREADY_IN_ZONE';
    else if (!isWithinWorldBounds(h.q, h.r)) issue = 'OUT_OF_BOUNDS';
    else if (!world.getHexTile(h.q, h.r).isWater) issue = 'NOT_WATER';
    else if (!options.ownedHexes.some((o) => hexDistance(o, h) <= CAGE_MAX_REACH)) issue = 'TOO_FAR';
    else if (occ && occ !== options.selfOccupant) issue = 'OCCUPIED';
    if (issue) issues.add(issue);
    return { q: h.q, r: h.r, issue: issue as FarmZoneCheck['hexes'][number]['issue'] };
  });
  const union = [...new Set([...baseKeys, ...seen])];
  if (hexes.length === 0) issues.add('EMPTY');
  if (union.length < def.minHexes) issues.add('TOO_SMALL');
  if (union.length > MAX_WATER_BODY_HEXES) issues.add('TOO_LARGE');
  if (union.length && !isConnectedRegion(union.map((k) => ({ q: Number(k.split(',')[0]), r: Number(k.split(',')[1]) })))) issues.add('DISCONNECTED');
  return { valid: issues.size === 0, hexes: results, issues: [...issues], totalHexes: union.length, levels: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Request schemas
// ─────────────────────────────────────────────────────────────────────────────
const hexCoord = z.number().int().min(-200).max(200);
const hexList = z.array(z.object({ q: hexCoord, r: hexCoord })).min(1).max(80);
const species = z.enum(['carp', 'tilapia', 'catfish', 'snakehead']) satisfies z.ZodType<FishSpeciesCode>;

export const createWaterBodySchema = z.object({
  type: z.enum(['fish_pond', 'fish_lake', 'hatchery', 'fish_cage']),
  hexes: hexList,
});
export const expandWaterBodySchema = z.object({ hexes: hexList });
export const stockFishSchema = z.object({
  species,
  count: z.number().int().min(1).max(5000),
  source: z.enum(['market', 'hatchery']).default('market'),
});
export const feedFishSchema = z.object({
  feedCode: z.enum(['rice_bran_fish', 'corn_meal', 'fish_pellet']) satisfies z.ZodType<FishFeedCode>,
  batches: z.number().int().min(1).max(500).default(1),
});
export const waterBodyParamsSchema = z.object({
  cityId: z.string().uuid('Ma thanh pho khong hop le'),
  waterBodyId: z.string().uuid('Ma ao khong hop le'),
});

export type CreateWaterBodyInput = z.infer<typeof createWaterBodySchema>;
export type ExpandWaterBodyInput = z.infer<typeof expandWaterBodySchema>;
export type StockFishInput = z.infer<typeof stockFishSchema>;
export type FeedFishInput = z.infer<typeof feedFishSchema>;
