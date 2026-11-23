/**
 * Aquaculture catalogue — water body types (3 levels each), fish species, fish feeds and the
 * capacity / cost rules shared by client and server.
 *
 * Ponds, big lakes and hatcheries are DUG into the player's land (the terrain is carved, see
 * pondTerrain.ts); fish cages float on natural water next to the territory. Harvested fish
 * (kg) and hatchery fry (count) are stored per city in city_resources.
 */
import type { ResourceBag } from '../buildings/definitions.js';
import type { ProduceCode } from '../farming/definitions.js';

export type WaterBodyTypeCode = 'fish_pond' | 'fish_lake' | 'hatchery' | 'fish_cage';
export const WATER_BODY_TYPE_CODES: readonly WaterBodyTypeCode[] = ['fish_pond', 'fish_lake', 'hatchery', 'fish_cage'];
export const MAX_WATER_BODY_HEXES = 60;
export const WATER_BODY_MAX_LEVEL = 3;
/** Occupancy map value prefix for water body hexes. */
export const POND_OCCUPANT_PREFIX = 'pond:';
export const pondOccupant = (id: string): string => `${POND_OCCUPANT_PREFIX}${id}`;
/** Building category of the world_buildings row that owns a water body's land. */
export const AQUACULTURE_BUILDING_CATEGORY = 'aquaculture';
/** Fish cages may sit on natural water at most this many hexes from the territory. */
export const CAGE_MAX_REACH = 3;
/** Seconds of cleaning / liming between two farming cycles. */
export const POND_PREPARE_SECONDS = 15;

export interface WaterBodyLevelDefinition {
  level: number;
  name: string;
  description: string;
  features: string[];
  cost: ResourceBag;
  costPerHex: ResourceBag;
  upgradeSeconds: number;
  capacityMultiplier: number;
  /** Growth speed of the fish */
  growthSpeed: number;
  /** Water quality the pond settles at when not overloaded (aeration + filter raise it) */
  baseQuality: number;
  /** Inlet sluice keeps the water level up (L2+) */
  autoRefill: boolean;
  /** Stylized paddle-wheel aerators (L3) */
  aerators: number;
  /** Feed store multiplier */
  storageMultiplier: number;
  /** Harvest yield / quality bonus */
  yieldMultiplier: number;
  modelKey: string;
}

export interface WaterBodyDefinition {
  code: WaterBodyTypeCode;
  name: string;
  description: string;
  minHexes: number;
  /** Dug into land (true) or placed on natural water (false) */
  dug: boolean;
  /** Pond depth below its water surface (m) — dug types */
  depth: number;
  /** Fish per hex at level 1 */
  fishPerHex: number;
  /** Hatcheries raise fry for other ponds instead of market fish */
  hatchery: boolean;
  levels: readonly WaterBodyLevelDefinition[];
}

const bag = (coins: number, wood = 0, stone = 0): ResourceBag => ({ coins, wood, stone });

function ladder(code: WaterBodyTypeCode, base: number, names: [string, string, string]): WaterBodyLevelDefinition[] {
  const k = base;
  return [
    {
      level: 1,
      name: names[0],
      description: 'Ao đất: bờ đất, mặt nước đơn giản, chòi gỗ chibi và cầu gỗ nhỏ.',
      features: ['Bờ đất', 'Mặt nước đơn giản', 'Chòi gỗ chibi', 'Cầu gỗ nhỏ', 'Nuôi cá cơ bản'],
      cost: bag(Math.round(500 * k), Math.round(80 * k), 0),
      costPerHex: bag(60, 4, 0),
      upgradeSeconds: 0,
      capacityMultiplier: 1,
      growthSpeed: 1,
      baseQuality: 0.72,
      autoRefill: false,
      aerators: 0,
      storageMultiplier: 1,
      yieldMultiplier: 1,
      modelKey: `${code}_l1`,
    },
    {
      level: 2,
      name: names[1],
      description: 'Ao gia cố: bờ kè đá, cầu gỗ dài hơn, cống dẫn nước và máng cho ăn.',
      features: ['Bờ kè đá', 'Cầu gỗ dài hơn', 'Cống dẫn nước (tự cấp nước)', 'Máng cho ăn', 'Tăng sức chứa cá'],
      cost: bag(Math.round(2000 * k), Math.round(160 * k), Math.round(320 * k)),
      costPerHex: bag(45, 4, 12),
      upgradeSeconds: 50,
      capacityMultiplier: 1.5,
      growthSpeed: 1.2,
      baseQuality: 0.8,
      autoRefill: true,
      aerators: 0,
      storageMultiplier: 2,
      yieldMultiplier: 1.15,
      modelKey: `${code}_l2`,
    },
    {
      level: 3,
      name: names[2],
      description: 'Ao công nghệ: bờ kè đẹp, máy sục khí, hệ thống lọc, khu thu hoạch và nhà quản lý.',
      features: ['Bờ kè đá đẹp', 'Máy sục khí', 'Hệ thống lọc', 'Khu thu hoạch', 'Nhà quản lý nhỏ'],
      cost: bag(Math.round(5000 * k), Math.round(260 * k), Math.round(600 * k)),
      costPerHex: bag(70, 6, 16),
      upgradeSeconds: 100,
      capacityMultiplier: 2.2,
      growthSpeed: 1.45,
      baseQuality: 0.95,
      autoRefill: true,
      aerators: 2,
      storageMultiplier: 3,
      yieldMultiplier: 1.35,
      modelKey: `${code}_l3`,
    },
  ];
}

export const WATER_BODY_DEFINITIONS: readonly WaterBodyDefinition[] = [
  {
    code: 'fish_pond',
    name: 'Ao nước ngọt',
    description: 'Ao đào trên đất lãnh địa — tự chọn hình dạng, tối thiểu 6 ô.',
    minHexes: 6,
    dug: true,
    depth: 1.8,
    fishPerHex: 30,
    hatchery: false,
    levels: ladder('fish_pond', 1, ['Ao đất', 'Ao gia cố', 'Ao công nghệ']),
  },
  {
    code: 'fish_lake',
    name: 'Hồ nuôi lớn',
    description: 'Hồ sâu, rộng — tối thiểu 12 ô, nuôi được nhiều cá hơn.',
    minHexes: 12,
    dug: true,
    depth: 2.6,
    fishPerHex: 40,
    hatchery: false,
    levels: ladder('fish_lake', 1.6, ['Hồ đất', 'Hồ gia cố', 'Hồ công nghệ']),
  },
  {
    code: 'hatchery',
    name: 'Khu ươm cá giống',
    description: 'Ao nông ươm cá bột thành cá giống để thả các ao khác.',
    minHexes: 6,
    dug: true,
    depth: 1.1,
    fishPerHex: 120,
    hatchery: true,
    levels: ladder('hatchery', 0.9, ['Ao ươm đất', 'Khu ươm gia cố', 'Trại giống công nghệ']),
  },
  {
    code: 'fish_cage',
    name: 'Khu cá lồng',
    description: 'Lồng nổi trên sông / hồ tự nhiên cạnh lãnh địa — tối thiểu 6 ô mặt nước.',
    minHexes: 6,
    dug: false,
    depth: 0,
    fishPerHex: 45,
    hatchery: false,
    levels: ladder('fish_cage', 1.2, ['Lồng tre', 'Lồng gia cố', 'Lồng công nghệ']).map((l) => ({
      ...l,
      description: ['Lồng tre nổi, sàn gỗ và chòi canh.', 'Khung lồng chắc chắn, cầu nối dài hơn, máng cho ăn.', 'Lồng công nghệ có sục khí, lưới lọc, khu thu hoạch và nhà quản lý.'][l.level - 1],
      features: [
        ['Lồng tre nổi', 'Sàn gỗ', 'Chòi canh chibi', 'Nuôi cá cơ bản'],
        ['Khung lồng gia cố', 'Cầu nối dài hơn', 'Máng cho ăn', 'Tăng sức chứa cá'],
        ['Sục khí', 'Lưới lọc', 'Khu thu hoạch', 'Nhà quản lý nhỏ'],
      ][l.level - 1],
      baseQuality: [0.82, 0.86, 0.95][l.level - 1],
      autoRefill: true,
    })),
  },
];

const BODY_BY_CODE = new Map(WATER_BODY_DEFINITIONS.map((d) => [d.code, d]));

export function isWaterBodyTypeCode(code: string): code is WaterBodyTypeCode {
  return BODY_BY_CODE.has(code as WaterBodyTypeCode);
}

export function getWaterBodyDefinition(code: WaterBodyTypeCode): WaterBodyDefinition {
  const def = BODY_BY_CODE.get(code);
  if (!def) throw new Error(`Unknown water body type: ${code}`);
  return def;
}

export function getWaterBodyLevel(code: WaterBodyTypeCode, level: number): WaterBodyLevelDefinition | null {
  return getWaterBodyDefinition(code).levels.find((l) => l.level === level) ?? null;
}

export function waterBodyLevel(code: WaterBodyTypeCode, level: number): WaterBodyLevelDefinition {
  const levels = getWaterBodyDefinition(code).levels;
  return levels[Math.min(levels.length, Math.max(1, Math.round(level))) - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// Fish
// ─────────────────────────────────────────────────────────────────────────────
export type FishSpeciesCode = 'carp' | 'tilapia' | 'catfish' | 'snakehead';
export const FISH_SPECIES_CODES: readonly FishSpeciesCode[] = ['carp', 'tilapia', 'catfish', 'snakehead'];

export interface FishSpeciesDefinition {
  code: FishSpeciesCode;
  name: string;
  description: string;
  /** Coins per fry bought at the market */
  fryPrice: number;
  /** kg when stocked */
  fryWeight: number;
  /** kg at which the fish is ready for market */
  marketWeight: number;
  /** Fry raised in a hatchery are ready (fingerlings) at this weight */
  fingerlingWeight: number;
  /** Seconds from fry to market weight in ideal conditions (level 1) */
  growSeconds: number;
  /** Feed (kg) eaten per kg of fish per minute */
  feedRate: number;
  /** Below this water quality the fish get stressed */
  minQuality: number;
  /** Colours for the chibi model */
  colors: { body: string; belly: string; fin: string };
}

export const FISH_SPECIES_DEFINITIONS: readonly FishSpeciesDefinition[] = [
  {
    code: 'carp',
    name: 'Cá chép',
    description: 'Cá chép vàng cam may mắn, lớn đều, ưa nước sạch.',
    fryPrice: 4,
    fryWeight: 0.03,
    marketWeight: 1.5,
    fingerlingWeight: 0.1,
    growSeconds: 240,
    feedRate: 0.03,
    minQuality: 0.4,
    colors: { body: '#f0903a', belly: '#ffd27a', fin: '#e8603a' },
  },
  {
    code: 'tilapia',
    name: 'Cá rô phi',
    description: 'Lớn nhanh, dễ nuôi, chịu được nước đục.',
    fryPrice: 3,
    fryWeight: 0.02,
    marketWeight: 0.8,
    fingerlingWeight: 0.06,
    growSeconds: 170,
    feedRate: 0.028,
    minQuality: 0.25,
    colors: { body: '#8a9aa8', belly: '#e4ecf0', fin: '#e06a6a' },
  },
  {
    code: 'catfish',
    name: 'Cá trê',
    description: 'Cá trê râu dài, cực kỳ chịu đựng, ăn khỏe.',
    fryPrice: 4,
    fryWeight: 0.03,
    marketWeight: 1.0,
    fingerlingWeight: 0.08,
    growSeconds: 200,
    feedRate: 0.036,
    minQuality: 0.15,
    colors: { body: '#5b5148', belly: '#c9b9a0', fin: '#3f3830' },
  },
  {
    code: 'snakehead',
    name: 'Cá lóc',
    description: 'Cá lóc săn mồi, thịt ngon, lớn chậm nhưng nặng ký.',
    fryPrice: 6,
    fryWeight: 0.04,
    marketWeight: 1.6,
    fingerlingWeight: 0.12,
    growSeconds: 300,
    feedRate: 0.032,
    minQuality: 0.3,
    colors: { body: '#4f6a46', belly: '#d8d2a8', fin: '#2f4a2a' },
  },
];

const FISH_BY_CODE = new Map(FISH_SPECIES_DEFINITIONS.map((d) => [d.code, d]));

export function isFishSpeciesCode(code: string): code is FishSpeciesCode {
  return FISH_BY_CODE.has(code as FishSpeciesCode);
}

export function getFishSpecies(code: FishSpeciesCode): FishSpeciesDefinition {
  const def = FISH_BY_CODE.get(code);
  if (!def) throw new Error(`Unknown fish species: ${code}`);
  return def;
}

/** City stock code for harvested fish (kg) and hatchery fry (count). */
export const fishStockCode = (s: FishSpeciesCode): string => `fish_${s}`;
export const fryStockCode = (s: FishSpeciesCode): string => `fry_${s}`;

export const FISH_STOCK_CODES: readonly string[] = FISH_SPECIES_CODES.map(fishStockCode);
export const FRY_STOCK_CODES: readonly string[] = FISH_SPECIES_CODES.map(fryStockCode);

// ─────────────────────────────────────────────────────────────────────────────
// Fish feed (produce → kg of feed in the pond's feeder)
// ─────────────────────────────────────────────────────────────────────────────
export type FishFeedCode = 'rice_bran_fish' | 'corn_meal' | 'fish_pellet';
export const FISH_FEED_CODES: readonly FishFeedCode[] = ['rice_bran_fish', 'corn_meal', 'fish_pellet'];

export interface FishFeedDefinition {
  code: FishFeedCode;
  name: string;
  description: string;
  ingredients: Partial<Record<ProduceCode, number>>;
  /** kg of feed per batch */
  kg: number;
  /** 0..0.3 — faster growth, less pollution */
  quality: number;
}

export const FISH_FEED_DEFINITIONS: readonly FishFeedDefinition[] = [
  { code: 'rice_bran_fish', name: 'Cám gạo', description: 'Phụ phẩm xay lúa, rẻ.', ingredients: { rice: 1 }, kg: 4, quality: 0 },
  { code: 'corn_meal', name: 'Bột ngô', description: 'Ngô xay mịn, nhiều năng lượng.', ingredients: { corn: 1 }, kg: 5, quality: 0.05 },
  {
    code: 'fish_pellet',
    name: 'Cám viên',
    description: 'Viên nổi trộn ngô, gạo, rau — cá lớn nhanh, nước sạch hơn.',
    ingredients: { corn: 2, rice: 1, vegetables: 1 },
    kg: 24,
    quality: 0.25,
  },
];

const FEED_BY_CODE = new Map(FISH_FEED_DEFINITIONS.map((d) => [d.code, d]));

export function getFishFeed(code: FishFeedCode): FishFeedDefinition {
  const def = FEED_BY_CODE.get(code);
  if (!def) throw new Error(`Unknown fish feed: ${code}`);
  return def;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────
function scaled(b: ResourceBag, k: number): ResourceBag {
  return { coins: Math.round(b.coins * k), wood: Math.round(b.wood * k), stone: Math.round(b.stone * k) };
}
const sum = (a: ResourceBag, b: ResourceBag): ResourceBag => ({ coins: a.coins + b.coins, wood: a.wood + b.wood, stone: a.stone + b.stone });

/** Digging cost grows with the number of hexes (and with depth for dug types). */
export function waterBodyCreateCost(code: WaterBodyTypeCode, hexCount: number): ResourceBag {
  const l1 = waterBodyLevel(code, 1);
  return sum(l1.cost, scaled(l1.costPerHex, hexCount));
}

export function waterBodyUpgradeCost(code: WaterBodyTypeCode, targetLevel: number, hexCount: number): ResourceBag | null {
  const lvl = getWaterBodyLevel(code, targetLevel);
  if (!lvl || targetLevel <= 1) return null;
  return sum(lvl.cost, scaled(lvl.costPerHex, hexCount));
}

/** New hexes are dug and built up to the current level. */
export function waterBodyExpandCost(code: WaterBodyTypeCode, level: number, addedHexes: number): ResourceBag {
  let total: ResourceBag = { coins: 0, wood: 0, stone: 0 };
  for (const l of getWaterBodyDefinition(code).levels) if (l.level <= level) total = sum(total, scaled(l.costPerHex, addedHexes));
  return total;
}

/** Max fish (all batches together). */
export function waterBodyCapacity(code: WaterBodyTypeCode, level: number, hexCount: number): number {
  return Math.floor(getWaterBodyDefinition(code).fishPerHex * hexCount * waterBodyLevel(code, level).capacityMultiplier);
}

/** kg of feed the feeder holds. */
export function fishFeedCapacity(code: WaterBodyTypeCode, level: number, hexCount: number): number {
  return Math.round((60 + 10 * hexCount) * waterBodyLevel(code, level).storageMultiplier);
}

/** Seconds to fill a freshly dug pond with water. */
export function waterFillSeconds(code: WaterBodyTypeCode, hexCount: number): number {
  return getWaterBodyDefinition(code).dug ? Math.round(12 + 2 * hexCount) : 0;
}

/** Coins for pumping the water in. */
export function waterFillCost(code: WaterBodyTypeCode, hexCount: number): number {
  return getWaterBodyDefinition(code).dug ? 10 * hexCount : 0;
}
