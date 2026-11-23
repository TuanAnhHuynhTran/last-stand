/**
 * Farm zone rules shared by the client draw tool and the server:
 *  - shape validation (≥ 6 connected owned hexes, no overlap with buildings / other zones)
 *  - expansion validation (stays connected, separate from upgrading)
 *  - water supply & irrigation network evaluation
 *  - crop outcome (duration / yield) and growth stage at a point in time
 */
import {
  axialToWorld,
  hexKey,
  hexNeighbors,
  isConnectedRegion,
  isWithinWorldBounds,
  parseHexKey,
  type AxialCoord,
} from '../hex/hexMath.js';
import { addResources, emptyResources, type ResourceBag } from '../buildings/definitions.js';
import type { PlacementWorld } from '../buildings/footprint.js';
import type { HexTerrainType } from '../worldgen/WorldGenerator.js';
import {
  MAX_FARM_ZONE_HEXES,
  MIN_FARM_ZONE_HEXES,
  getFarmZoneDefinition,
  getFarmZoneLevel,
  type CropStageDefinition,
  type CropTypeDefinition,
  type FarmZoneTypeCode,
} from './definitions.js';

/** Occupancy map values for farm hexes (building hexes hold the bare building id). */
export const FARM_OCCUPANT_PREFIX = 'farm:';
export const farmOccupant = (zoneId: string): string => `${FARM_OCCUPANT_PREFIX}${zoneId}`;
export const isFarmOccupant = (occupant: string | undefined): boolean =>
  Boolean(occupant?.startsWith(FARM_OCCUPANT_PREFIX));

// ─────────────────────────────────────────────────────────────────────────────
// Shape validation
// ─────────────────────────────────────────────────────────────────────────────
export type FarmHexIssue = 'OUT_OF_BOUNDS' | 'NOT_OWNED' | 'TERRAIN_BLOCKED' | 'OCCUPIED' | 'FARMLAND';
export type FarmZoneIssue =
  | FarmHexIssue
  | 'EMPTY'
  | 'TOO_SMALL'
  | 'TOO_LARGE'
  | 'DISCONNECTED'
  | 'DUPLICATE_HEX'
  | 'ALREADY_IN_ZONE';

export const FARM_ZONE_ISSUE_LABELS: Record<FarmZoneIssue, string> = {
  OUT_OF_BOUNDS: 'Ngoài ranh giới thế giới',
  NOT_OWNED: 'Đất chưa sở hữu',
  TERRAIN_BLOCKED: 'Địa hình không canh tác được',
  OCCUPIED: 'Đã có công trình',
  FARMLAND: 'Thuộc khu canh tác khác',
  EMPTY: 'Chưa chọn ô nào',
  TOO_SMALL: 'Chưa đủ số ô hex tối thiểu',
  TOO_LARGE: 'Vượt quá số ô hex tối đa',
  DISCONNECTED: 'Các ô phải liền nhau thành một vùng',
  DUPLICATE_HEX: 'Trùng ô hex',
  ALREADY_IN_ZONE: 'Ô đã thuộc khu này',
};

export interface FarmHexResult extends AxialCoord {
  issue: FarmHexIssue | 'ALREADY_IN_ZONE' | null;
}

export interface FarmZoneCheck {
  valid: boolean;
  hexes: FarmHexResult[];
  issues: FarmZoneIssue[];
  /** Total hexes after the operation (existing + new). */
  totalHexes: number;
}

export interface FarmShapeOptions {
  /** Zone being expanded: its hexes count as free and must stay part of the region. */
  zoneId?: string;
  baseHexes?: readonly AxialCoord[];
  /** Minimum / maximum region size (defaults: farm zones 6..60; livestock farms override). */
  minHexes?: number;
  maxHexes?: number;
  /** Occupant value of the zone itself (defaults to `farm:<zoneId>`). */
  selfOccupant?: string;
}

/**
 * Validates hexes to claim for a new zone (no `baseHexes`) or an expansion (`baseHexes` =
 * the zone's current hexes). `occupied` maps hex key → building id or `farm:<zoneId>`.
 */
export function checkFarmZoneShape(
  world: PlacementWorld,
  hexes: readonly AxialCoord[],
  occupied: ReadonlyMap<string, string>,
  options: FarmShapeOptions = {}
): FarmZoneCheck {
  const base = options.baseHexes ?? [];
  const baseKeys = new Set(base.map((h) => hexKey(h.q, h.r)));
  const self = options.selfOccupant ?? (options.zoneId ? farmOccupant(options.zoneId) : null);
  const minHexes = options.minHexes ?? MIN_FARM_ZONE_HEXES;
  const maxHexes = options.maxHexes ?? MAX_FARM_ZONE_HEXES;
  const issues = new Set<FarmZoneIssue>();
  const seen = new Set<string>();

  const results = hexes.map<FarmHexResult>((h) => {
    const key = hexKey(h.q, h.r);
    if (seen.has(key)) issues.add('DUPLICATE_HEX');
    seen.add(key);
    let issue: FarmHexResult['issue'] = null;
    const occupant = occupied.get(key);
    if (baseKeys.has(key)) issue = 'ALREADY_IN_ZONE';
    else if (!isWithinWorldBounds(h.q, h.r)) issue = 'OUT_OF_BOUNDS';
    else if (!world.isOwned(h.q, h.r)) issue = 'NOT_OWNED';
    else if (!world.getHexTile(h.q, h.r).buildable) issue = 'TERRAIN_BLOCKED';
    else if (occupant && occupant !== self) issue = isFarmOccupant(occupant) ? 'FARMLAND' : 'OCCUPIED';
    if (issue) issues.add(issue);
    return { q: h.q, r: h.r, issue };
  });

  const union = [...baseKeys, ...seen].filter((k, i, arr) => arr.indexOf(k) === i);
  if (hexes.length === 0) issues.add('EMPTY');
  if (union.length < minHexes) issues.add('TOO_SMALL');
  if (union.length > maxHexes) issues.add('TOO_LARGE');
  if (union.length > 0 && !isConnectedRegion(union.map(parseHexKey))) issues.add('DISCONNECTED');

  return { valid: issues.size === 0, hexes: results, issues: [...issues], totalHexes: union.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Costs
// ─────────────────────────────────────────────────────────────────────────────
function scaled(b: ResourceBag, k: number): ResourceBag {
  return { coins: Math.round(b.coins * k), wood: Math.round(b.wood * k), stone: Math.round(b.stone * k) };
}

/** Cost to create a level-1 zone of `hexCount` hexes. */
export function farmCreateCost(code: FarmZoneTypeCode, hexCount: number): ResourceBag {
  const l1 = getFarmZoneLevel(code, 1)!;
  return addResources(l1.cost, scaled(l1.costPerHex, hexCount));
}

/** Cost to upgrade a zone of `hexCount` hexes to `targetLevel`. */
export function farmUpgradeCost(code: FarmZoneTypeCode, targetLevel: number, hexCount: number): ResourceBag | null {
  const lvl = getFarmZoneLevel(code, targetLevel);
  if (!lvl || targetLevel <= 1) return null;
  return addResources(lvl.cost, scaled(lvl.costPerHex, hexCount));
}

/** Cost to add `addedHexes` hexes to a zone currently at `level` (better zones cost more to extend). */
export function farmExpandCost(code: FarmZoneTypeCode, level: number, addedHexes: number): ResourceBag {
  const per = getFarmZoneDefinition(code).expandCostPerHex;
  return addedHexes > 0 ? scaled(per, addedHexes * (1 + (level - 1) * 0.5)) : emptyResources();
}

// ─────────────────────────────────────────────────────────────────────────────
// Water & soil
// ─────────────────────────────────────────────────────────────────────────────
export type WaterSourceType = 'rain' | 'river' | 'lake' | 'well';
export type IrrigationKind = 'none' | 'canal' | 'pump';

export const WATER_SOURCE_LABELS: Record<WaterSourceType, string> = {
  rain: 'Nước mưa',
  river: 'Sông',
  lake: 'Hồ',
  well: 'Giếng ngầm',
};

export const IRRIGATION_LABELS: Record<IrrigationKind, string> = {
  none: 'Tưới thủ công',
  canal: 'Kênh mương',
  pump: 'Trạm bơm',
};

export interface IrrigationInfo {
  kind: IrrigationKind;
  sourceType: WaterSourceType;
  /** Nearest natural water hex used by the network (null = rain / well) */
  sourceHex: AxialCoord | null;
  /** Hex distance from the zone to the source */
  sourceDistance: number | null;
  /** Natural water from rain & adjacent river banks (0..1) */
  naturalSupply: number;
  /** Total water supply including irrigation (0..1.2) */
  supply: number;
  /** Soil fertility multiplier from terrain types */
  fertility: number;
}

/** World access needed for water evaluation (WorldGenerator satisfies it). */
export interface FarmWorld extends PlacementWorld {
  sampleAt(x: number, z: number): { moisture: number };
}

const FERTILITY: Partial<Record<HexTerrainType, number>> = {
  farmland: 1.15,
  grassland: 1,
  dirt: 0.88,
  riverbank: 1.1,
};

function isWaterish(type: HexTerrainType): boolean {
  return type === 'lake' || type === 'river' || type === 'riverbank';
}

/** Water a hex gets without irrigation (rain + nearby river/lake banks), 0..1. */
export function naturalHexWater(
  world: FarmWorld,
  h: AxialCoord
): number {
  const tile = world.getHexTile(h.q, h.r);
  if (tile.type === 'riverbank') return 1;
  if (hexNeighbors(h).some((n) => isWaterish(world.getHexTile(n.q, n.r).type))) return 0.85;
  const p = axialToWorld(h.q, h.r);
  return 0.22 + 0.4 * Math.min(1, Math.max(0, world.sampleAt(p.x, p.z).moisture));
}

/**
 * Evaluates a zone's water: natural supply averaged over its hexes plus the irrigation
 * network of its level (canal at L2, pump at L3), which taps the nearest river / lake within
 * reach or falls back to a well.
 */
export function evaluateIrrigation(
  world: FarmWorld,
  code: FarmZoneTypeCode,
  level: number,
  hexes: readonly AxialCoord[]
): IrrigationInfo {
  const lvl = getFarmZoneLevel(code, level) ?? getFarmZoneLevel(code, 1)!;
  let natural = 0;
  let fertility = 0;
  for (const h of hexes) {
    const tile = world.getHexTile(h.q, h.r);
    fertility += FERTILITY[tile.type] ?? 0.85;
    natural += naturalHexWater(world, h);
  }
  const n = Math.max(1, hexes.length);
  const naturalSupply = round3(natural / n);
  const kind: IrrigationKind = level >= 3 ? 'pump' : level === 2 ? 'canal' : 'none';

  let sourceType: WaterSourceType = 'rain';
  let sourceHex: AxialCoord | null = null;
  let sourceDistance: number | null = null;
  let bonus = 0;
  if (lvl.irrigationReach > 0) {
    const found = nearestWater(world, hexes, lvl.irrigationReach);
    if (found) {
      sourceHex = found.hex;
      sourceDistance = found.distance;
      sourceType = world.getHexTile(found.hex.q, found.hex.r).type === 'lake' ? 'lake' : 'river';
      bonus = lvl.irrigationBonus;
    } else {
      sourceType = 'well';
      bonus = lvl.irrigationBonus * 0.6;
    }
  } else {
    const adjacent = nearestWater(world, hexes, 1);
    if (adjacent) {
      sourceHex = adjacent.hex;
      sourceDistance = adjacent.distance;
      sourceType = world.getHexTile(adjacent.hex.q, adjacent.hex.r).type === 'lake' ? 'lake' : 'river';
    }
  }

  return {
    kind,
    sourceType,
    sourceHex,
    sourceDistance,
    naturalSupply,
    supply: round3(Math.min(1.2, naturalSupply + bonus)),
    fertility: round3(fertility / n),
  };
}

/** Multi-source BFS from the zone outward; first river / lake / bank hex within `reach`. */
function nearestWater(
  world: FarmWorld,
  hexes: readonly AxialCoord[],
  reach: number
): { hex: AxialCoord; distance: number } | null {
  const visited = new Set(hexes.map((h) => hexKey(h.q, h.r)));
  let frontier = [...hexes];
  for (let d = 1; d <= reach; d += 1) {
    const next: AxialCoord[] = [];
    let best: AxialCoord | null = null;
    for (const h of frontier) {
      for (const nb of hexNeighbors(h)) {
        const key = hexKey(nb.q, nb.r);
        if (visited.has(key) || !isWithinWorldBounds(nb.q, nb.r)) continue;
        visited.add(key);
        if (isWaterish(world.getHexTile(nb.q, nb.r).type)) {
          // Deterministic tie-break: smallest key at this distance.
          if (!best || key < hexKey(best.q, best.r)) best = nb;
        }
        next.push(nb);
      }
    }
    if (best) return { hex: best, distance: d };
    frontier = next;
  }
  return null;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Crops
// ─────────────────────────────────────────────────────────────────────────────
export interface CropOutcome {
  /** Growth duration (s) */
  growSeconds: number;
  /** Harvest amount of the crop's produce */
  expectedYield: number;
  /** supply / need, clamped 0.4..1 */
  waterFactor: number;
  seedCost: ResourceBag;
}

/** Deterministic duration & yield for planting `crop` in a zone (fixed at planting time). */
export function computeCropOutcome(
  crop: CropTypeDefinition,
  code: FarmZoneTypeCode,
  level: number,
  hexCount: number,
  irrigation: Pick<IrrigationInfo, 'supply' | 'fertility'>
): CropOutcome {
  const lvl = getFarmZoneLevel(code, level) ?? getFarmZoneLevel(code, 1)!;
  const waterFactor = round3(Math.min(1, Math.max(0.4, irrigation.supply / crop.waterNeed)));
  return {
    growSeconds: Math.max(5, Math.round(crop.growSeconds / lvl.growthSpeed / (0.7 + 0.3 * waterFactor))),
    expectedYield: Math.max(
      1,
      Math.round(crop.yieldPerHex * hexCount * lvl.yieldMultiplier * irrigation.fertility * waterFactor)
    ),
    waterFactor,
    seedCost: scaled(crop.seedCostPerHex, hexCount),
  };
}

/** Growth progress 0..1 between planting and ready time. */
export function cropProgress(plantedAtMs: number, readyAtMs: number, nowMs: number): number {
  if (readyAtMs <= plantedAtMs) return 1;
  return Math.min(1, Math.max(0, (nowMs - plantedAtMs) / (readyAtMs - plantedAtMs)));
}

/** Growth stage for a progress value (the last stage = ripe only at 100 %). */
export function cropStageAt(crop: CropTypeDefinition, progress: number): CropStageDefinition {
  let stage = crop.stages[0];
  for (const s of crop.stages) if (progress >= s.startsAt) stage = s;
  return stage;
}

/** Progress within the current stage (0..1) — used to grow plants smoothly between stages. */
export function cropStageFraction(crop: CropTypeDefinition, progress: number): number {
  const stage = cropStageAt(crop, progress);
  const next = crop.stages[stage.index + 1];
  if (!next) return 1;
  return Math.min(1, Math.max(0, (progress - stage.startsAt) / (next.startsAt - stage.startsAt)));
}
