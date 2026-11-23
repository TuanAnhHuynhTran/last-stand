/**
 * Villagers & economy catalogue — professions, workplaces and job slots, production recipes,
 * resource groups, needs, the game clock and the daily schedule. Shared by server (gameplay)
 * and client (visuals): gameplay is simulated per game hour from server timestamps, the client
 * only animates.
 */
import { getBuildingLevel, type BuildingTypeCode } from '../buildings/definitions.js';
import { livestockLevel, type LivestockFarmTypeCode } from '../livestock/definitions.js';
import { waterBodyLevel, type WaterBodyTypeCode } from '../aquaculture/definitions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Professions
// ─────────────────────────────────────────────────────────────────────────────
export type ProfessionCode = 'farmer' | 'herder' | 'fisher' | 'carpenter' | 'mason' | 'blacksmith' | 'transporter' | 'warehouse';
export const PROFESSION_CODES: readonly ProfessionCode[] = ['farmer', 'herder', 'fisher', 'carpenter', 'mason', 'blacksmith', 'transporter', 'warehouse'];

export type HatStyle = 'non_la' | 'cap' | 'bucket' | 'headband' | 'helmet' | 'bandana' | 'straw' | 'beret' | 'none';
export type ToolStyle = 'hoe' | 'pitchfork' | 'net' | 'saw' | 'trowel' | 'hammer' | 'cart' | 'clipboard' | 'none';
/** Profession work animations */
export type WorkClip = 'hoe' | 'sow' | 'harvest' | 'feed' | 'net' | 'saw' | 'build' | 'hammer' | 'push' | 'stack';

export interface ProfessionDefinition {
  code: ProfessionCode;
  name: string;
  description: string;
  outfit: { shirt: string; pants: string; hat: HatStyle; hatColor: string; tool: ToolStyle; apron: string | null };
  /** Work clips cycled while working (sow → hoe → harvest …) */
  workClips: readonly WorkClip[];
}

export const PROFESSION_DEFINITIONS: readonly ProfessionDefinition[] = [
  {
    code: 'farmer',
    name: 'Nông dân',
    description: 'Gieo hạt, cuốc đất và thu hoạch trên ruộng.',
    outfit: { shirt: '#3f5fa8', pants: '#2b3550', hat: 'non_la', hatColor: '#e6cf8a', tool: 'hoe', apron: null },
    workClips: ['sow', 'hoe', 'harvest'],
  },
  {
    code: 'herder',
    name: 'Người chăn nuôi',
    description: 'Cho vật nuôi ăn uống và chăm sóc đàn.',
    outfit: { shirt: '#7aa64a', pants: '#5b4636', hat: 'straw', hatColor: '#d9b45e', tool: 'pitchfork', apron: null },
    workClips: ['feed'],
  },
  {
    code: 'fisher',
    name: 'Ngư dân',
    description: 'Thả thức ăn, kéo lưới và thu cá.',
    outfit: { shirt: '#3fa0b8', pants: '#2b4a5a', hat: 'bucket', hatColor: '#f2c14e', tool: 'net', apron: null },
    workClips: ['feed', 'net'],
  },
  {
    code: 'carpenter',
    name: 'Thợ mộc',
    description: 'Đốn gỗ và cưa ván ở xưởng mộc.',
    outfit: { shirt: '#c9773a', pants: '#5b4636', hat: 'headband', hatColor: '#d9603b', tool: 'saw', apron: '#a8743f' },
    workClips: ['saw'],
  },
  {
    code: 'mason',
    name: 'Thợ xây',
    description: 'Khai thác đá, nung gạch ở mỏ đá.',
    outfit: { shirt: '#e0a93a', pants: '#4a4f5a', hat: 'helmet', hatColor: '#f2c14e', tool: 'trowel', apron: null },
    workClips: ['build', 'hammer'],
  },
  {
    code: 'blacksmith',
    name: 'Thợ rèn',
    description: 'Rèn công cụ và trang bị ở lò rèn.',
    outfit: { shirt: '#8a4a3a', pants: '#3b3030', hat: 'bandana', hatColor: '#3b3030', tool: 'hammer', apron: '#4a3a2a' },
    workClips: ['hammer'],
  },
  {
    code: 'transporter',
    name: 'Người vận chuyển',
    description: 'Đẩy xe chở hàng từ nơi sản xuất về kho, gánh nước từ giếng.',
    outfit: { shirt: '#b84a6a', pants: '#3f3f5a', hat: 'cap', hatColor: '#3f7fb0', tool: 'cart', apron: null },
    workClips: ['push'],
  },
  {
    code: 'warehouse',
    name: 'Nhân viên kho',
    description: 'Sắp xếp hàng trong kho, tăng sức chứa và tốc độ nhập kho.',
    outfit: { shirt: '#6a5aa8', pants: '#3b3550', hat: 'beret', hatColor: '#4a3a7a', tool: 'clipboard', apron: '#c9a43c' },
    workClips: ['stack'],
  },
];

const PROF_BY_CODE = new Map(PROFESSION_DEFINITIONS.map((p) => [p.code, p]));
export function getProfession(code: ProfessionCode): ProfessionDefinition {
  const p = PROF_BY_CODE.get(code);
  if (!p) throw new Error(`Unknown profession: ${code}`);
  return p;
}
export function isProfessionCode(code: string): code is ProfessionCode {
  return PROF_BY_CODE.has(code as ProfessionCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// Workplaces
// ─────────────────────────────────────────────────────────────────────────────
export type WorkplaceKind = 'building' | 'farm_zone' | 'livestock_farm' | 'water_body';

export interface WorkplaceRef {
  kind: WorkplaceKind;
  id: string;
}

/** Which profession a workplace employs. */
export function workplaceProfession(kind: WorkplaceKind, typeCode: string): ProfessionCode | null {
  if (kind === 'farm_zone') return 'farmer';
  if (kind === 'livestock_farm') return 'herder';
  if (kind === 'water_body') return 'fisher';
  switch (typeCode as BuildingTypeCode) {
    case 'carpentry':
      return 'carpenter';
    case 'quarry':
      return 'mason';
    case 'smithy':
    case 'military_forge':
      return 'blacksmith';
    case 'market':
    case 'well':
      return 'transporter';
    case 'storage':
    case 'military_depot':
      return 'warehouse';
    default:
      return null;
  }
}

/** Full-time job slots of a workplace. */
export function workplaceSlots(kind: WorkplaceKind, typeCode: string, level: number, hexCount = 1): number {
  const l = Math.min(3, Math.max(1, level));
  if (kind === 'farm_zone') return Math.max(1, Math.ceil(hexCount / 6)) + (l - 1);
  if (kind === 'livestock_farm') return livestockLevel(typeCode as LivestockFarmTypeCode, l).maxCaretakers;
  if (kind === 'water_body') return Math.min(3, waterBodyLevel(typeCode as WaterBodyTypeCode, l).level) + (hexCount >= 12 ? 1 : 0);
  const table: Partial<Record<BuildingTypeCode, [number, number, number]>> = {
    carpentry: [2, 3, 4],
    quarry: [2, 3, 4],
    smithy: [1, 2, 3],
    market: [2, 3, 4],
    well: [1, 1, 2],
    storage: [1, 2, 3],
    military_forge: [2, 3, 4],
    military_depot: [1, 2, 2],
  };
  return table[typeCode as BuildingTypeCode]?.[l - 1] ?? 0;
}

/** Residents a house holds (level 1/2/3 → 4/6/10). */
export function houseCapacity(level: number): number {
  return getBuildingLevel('house', Math.min(3, Math.max(1, level)))?.stats.residents ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resources
// ─────────────────────────────────────────────────────────────────────────────
export type ResourceGroup = 'materials' | 'food' | 'water' | 'livestock' | 'aquaculture' | 'military';
export const RESOURCE_GROUP_LABELS: Record<ResourceGroup, string> = {
  materials: 'Vật liệu xây dựng',
  food: 'Lương thực',
  water: 'Nước',
  livestock: 'Sản phẩm chăn nuôi',
  aquaculture: 'Thủy sản',
  military: 'Trang bị quân sự',
};

/** Economy stock codes (city_resources), besides coins. */
export const ECONOMY_CODES = [
  'wood',
  'stone',
  'planks',
  'bricks',
  'rice',
  'corn',
  'vegetables',
  'fruit',
  'hay',
  'water',
  'eggs',
  'meat',
  'milk',
  'wool',
  'manure',
  'draft',
  'fish_carp',
  'fish_tilapia',
  'fish_catfish',
  'fish_snakehead',
  'tools',
  'weapons',
  // Military equipment (Phase 8)
  'eq_saber',
  'eq_shield',
  'eq_spear',
  'eq_bow',
  'eq_arrows',
  'eq_crossbow',
  'eq_bolts',
  'eq_leather_armor',
  'eq_iron_armor',
  'eq_helmet',
  'eq_iron_helmet',
  // Phase 9 — animal equipment
  'eq_saddle',
  'eq_horse_barding',
  'eq_cargo_harness',
  'eq_howdah',
] as const;
export type EconomyCode = (typeof ECONOMY_CODES)[number];

export const ECONOMY_LABELS: Record<EconomyCode, string> = {
  wood: 'Gỗ',
  stone: 'Đá',
  planks: 'Ván gỗ',
  bricks: 'Gạch',
  rice: 'Lúa gạo',
  corn: 'Ngô',
  vegetables: 'Rau củ',
  fruit: 'Trái cây',
  hay: 'Cỏ khô',
  water: 'Nước',
  eggs: 'Trứng',
  meat: 'Thịt',
  milk: 'Sữa',
  wool: 'Lông',
  manure: 'Phân bón',
  draft: 'Sức kéo',
  fish_carp: 'Cá chép',
  fish_tilapia: 'Cá rô phi',
  fish_catfish: 'Cá trê',
  fish_snakehead: 'Cá lóc',
  tools: 'Công cụ',
  weapons: 'Trang bị',
  eq_saber: 'Đao',
  eq_shield: 'Khiên',
  eq_spear: 'Thương',
  eq_bow: 'Cung',
  eq_arrows: 'Ống tên',
  eq_crossbow: 'Nỏ',
  eq_bolts: 'Hộp tên nỏ',
  eq_leather_armor: 'Giáp da',
  eq_iron_armor: 'Giáp sắt',
  eq_helmet: 'Mũ da',
  eq_iron_helmet: 'Mũ sắt',
  eq_saddle: 'Yên ngựa',
  eq_horse_barding: 'Giáp ngựa',
  eq_cargo_harness: 'Đai chở hàng',
  eq_howdah: 'Bành voi',
};

export function resourceGroup(code: string): ResourceGroup {
  if (['wood', 'stone', 'planks', 'bricks'].includes(code)) return 'materials';
  if (code === 'water') return 'water';
  if (code.startsWith('fish_') || code.startsWith('fry_')) return 'aquaculture';
  if (['eggs', 'meat', 'milk', 'wool', 'manure', 'draft'].includes(code)) return 'livestock';
  if (['tools', 'weapons'].includes(code) || code.startsWith('eq_')) return 'military';
  return 'food';
}

/** Food value of one unit (people eat any of these). Order = eating priority. */
export const FOOD_VALUES: readonly [string, number][] = [
  ['vegetables', 1],
  ['fruit', 1],
  ['rice', 1],
  ['corn', 1],
  ['eggs', 0.5],
  ['milk', 1],
  ['fish_tilapia', 2],
  ['fish_carp', 2],
  ['fish_catfish', 2],
  ['fish_snakehead', 2],
  ['meat', 2],
];

/** Per survivor per game day. */
export const FOOD_PER_DAY = 1.5;
export const WATER_PER_DAY = 2;
/** Water the territory centre's rain barrels give every game day. */
export const BASE_WATER_PER_DAY = 12;
/** Max of each material / produce kept in storage (plus storage buildings). */
export const BASE_STORAGE = 3000;

// ─────────────────────────────────────────────────────────────────────────────
// Production recipes
// ─────────────────────────────────────────────────────────────────────────────
export interface ProductionRecipeDefinition {
  code: string;
  building: BuildingTypeCode;
  name: string;
  minLevel: number;
  inputs: Partial<Record<EconomyCode, number>>;
  outputs: Partial<Record<EconomyCode, number>>;
  /** Work seconds for one batch by one worker of skill 0.5 (in real seconds of work hours) */
  seconds: number;
}

export const PRODUCTION_RECIPES: readonly ProductionRecipeDefinition[] = [
  { code: 'logging', building: 'carpentry', name: 'Đốn gỗ', minLevel: 1, inputs: {}, outputs: { wood: 12 }, seconds: 40 },
  { code: 'planks', building: 'carpentry', name: 'Cưa ván', minLevel: 1, inputs: { wood: 6 }, outputs: { planks: 4 }, seconds: 30 },
  { code: 'quarrying', building: 'quarry', name: 'Khai thác đá', minLevel: 1, inputs: {}, outputs: { stone: 10 }, seconds: 45 },
  { code: 'bricks', building: 'quarry', name: 'Nung gạch', minLevel: 2, inputs: { stone: 6, wood: 2 }, outputs: { bricks: 5 }, seconds: 40 },
  { code: 'tools', building: 'smithy', name: 'Rèn công cụ', minLevel: 1, inputs: { stone: 4, wood: 3 }, outputs: { tools: 2 }, seconds: 50 },
  { code: 'weapons', building: 'smithy', name: 'Rèn trang bị', minLevel: 2, inputs: { tools: 2, planks: 2 }, outputs: { weapons: 1 }, seconds: 70 },
  { code: 'armory', building: 'smithy', name: 'Bộ giáp lãnh địa', minLevel: 3, inputs: { tools: 3, bricks: 2 }, outputs: { weapons: 3 }, seconds: 110 },
  { code: 'draw_water', building: 'well', name: 'Kéo nước', minLevel: 1, inputs: {}, outputs: { water: 20 }, seconds: 30 },
  // Military forge (Phase 8): weapons, ammunition and armour for the four soldier classes.
  { code: 'forge_saber', building: 'military_forge', name: 'Rèn đao', minLevel: 1, inputs: { tools: 1, wood: 1 }, outputs: { eq_saber: 2 }, seconds: 40 },
  { code: 'forge_shield', building: 'military_forge', name: 'Đóng khiên', minLevel: 1, inputs: { planks: 2, tools: 1 }, outputs: { eq_shield: 2 }, seconds: 35 },
  { code: 'forge_spear', building: 'military_forge', name: 'Rèn thương', minLevel: 1, inputs: { wood: 3, tools: 1 }, outputs: { eq_spear: 3 }, seconds: 35 },
  { code: 'craft_bow', building: 'military_forge', name: 'Làm cung', minLevel: 1, inputs: { wood: 3, planks: 1 }, outputs: { eq_bow: 2 }, seconds: 45 },
  { code: 'craft_arrows', building: 'military_forge', name: 'Vót tên', minLevel: 1, inputs: { wood: 2, stone: 1 }, outputs: { eq_arrows: 3 }, seconds: 25 },
  { code: 'leather_armor', building: 'military_forge', name: 'May giáp da', minLevel: 1, inputs: { planks: 2, tools: 1 }, outputs: { eq_leather_armor: 2 }, seconds: 40 },
  { code: 'helmet', building: 'military_forge', name: 'Làm mũ da', minLevel: 1, inputs: { stone: 2, tools: 1 }, outputs: { eq_helmet: 2 }, seconds: 30 },
  { code: 'craft_crossbow', building: 'military_forge', name: 'Chế nỏ', minLevel: 2, inputs: { planks: 2, tools: 2 }, outputs: { eq_crossbow: 1 }, seconds: 60 },
  { code: 'craft_bolts', building: 'military_forge', name: 'Làm tên nỏ', minLevel: 2, inputs: { wood: 1, tools: 1 }, outputs: { eq_bolts: 2 }, seconds: 30 },
  { code: 'iron_armor', building: 'military_forge', name: 'Rèn giáp sắt', minLevel: 2, inputs: { stone: 4, tools: 2 }, outputs: { eq_iron_armor: 1 }, seconds: 70 },
  { code: 'iron_helmet', building: 'military_forge', name: 'Rèn mũ sắt', minLevel: 3, inputs: { stone: 3, tools: 2 }, outputs: { eq_iron_helmet: 1 }, seconds: 60 },
  // Phase 9 — tack for horses and elephants
  { code: 'saddle', building: 'military_forge', name: 'Làm yên ngựa', minLevel: 1, inputs: { planks: 2, tools: 1 }, outputs: { eq_saddle: 1 }, seconds: 45 },
  { code: 'cargo_harness', building: 'military_forge', name: 'Làm đai chở hàng', minLevel: 1, inputs: { wood: 2, planks: 1 }, outputs: { eq_cargo_harness: 1 }, seconds: 40 },
  { code: 'horse_barding', building: 'military_forge', name: 'Rèn giáp ngựa', minLevel: 2, inputs: { stone: 4, tools: 2 }, outputs: { eq_horse_barding: 1 }, seconds: 80 },
  { code: 'howdah', building: 'military_forge', name: 'Đóng bành voi', minLevel: 3, inputs: { planks: 4, tools: 2 }, outputs: { eq_howdah: 1 }, seconds: 90 },
];

const RECIPE_BY_CODE = new Map(PRODUCTION_RECIPES.map((r) => [r.code, r]));
export function getRecipe(code: string): ProductionRecipeDefinition | null {
  return RECIPE_BY_CODE.get(code) ?? null;
}
export function recipesFor(building: BuildingTypeCode, level = 3): ProductionRecipeDefinition[] {
  return PRODUCTION_RECIPES.filter((r) => r.building === building && r.minLevel <= level);
}
export function isProductionBuilding(code: string): boolean {
  return PRODUCTION_RECIPES.some((r) => r.building === code);
}
/** Finished goods a building can hold before it needs transporting. */
export function outputBufferCapacity(level: number): number {
  return 60 * Math.min(3, Math.max(1, level));
}
/** Level 2+ buildings move their goods to storage by themselves (automation unlock). */
export function autoTransfers(level: number): boolean {
  return level >= 2;
}
/** Units one transporter moves per game hour. */
export const TRANSPORT_PER_HOUR = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Game clock & schedule
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_DAY_SECONDS = 720;
export const MIN_DAY_SECONDS = 120;
export const MAX_DAY_SECONDS = 7200;
/** Day starts at this hour when a city is created. */
export const START_HOUR = 7;

export type DayPhase = 'night' | 'morning' | 'work' | 'lunch' | 'afternoon' | 'evening';
export const DAY_PHASE_LABELS: Record<DayPhase, string> = {
  night: 'Ban đêm — nghỉ ngơi',
  morning: 'Buổi sáng — đi làm',
  work: 'Ban ngày — làm việc',
  lunch: 'Nghỉ trưa',
  afternoon: 'Buổi chiều — vận chuyển',
  evening: 'Buổi tối — về nhà',
};

export interface GameClock {
  /** Total game hours since the city's epoch */
  totalHours: number;
  day: number;
  /** 0..24 */
  hour: number;
  phase: DayPhase;
}

export function gameClock(epochMs: number, daySeconds: number, nowMs: number): GameClock {
  const totalHours = START_HOUR + ((nowMs - epochMs) / 1000 / daySeconds) * 24;
  const day = Math.floor(totalHours / 24);
  const hour = totalHours - day * 24;
  return { totalHours, day, hour, phase: phaseAt(hour) };
}

export function phaseAt(hour: number): DayPhase {
  if (hour < 6 || hour >= 21) return 'night';
  if (hour < 8) return 'morning';
  if (hour < 12) return 'work';
  if (hour < 13) return 'lunch';
  if (hour < 16) return 'work';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** Hours in which production runs (transporters also haul in the afternoon). */
export function isWorkHour(hour: number, profession: ProfessionCode | null = null): boolean {
  const p = phaseAt(hour);
  return p === 'work' || (p === 'afternoon' && (profession === 'transporter' || profession === 'warehouse'));
}

export type Activity = 'sleep' | 'wake' | 'commute' | 'work' | 'lunch' | 'haul' | 'leisure' | 'return_home' | 'idle';

/**
 * What a villager does at a given hour — the client turns this into behaviour; the server uses
 * it for the "current state" shown in lists.
 */
export function activityAt(hour: number, employed: boolean, profession: ProfessionCode | null, homeless: boolean): Activity {
  if (hour >= 21.5 || hour < 6) return homeless ? 'idle' : 'sleep';
  if (hour < 7) return 'wake';
  if (hour < 8) return employed ? 'commute' : 'leisure';
  if (hour < 12) return employed ? 'work' : 'idle';
  if (hour < 13) return 'lunch';
  if (hour < 16) return employed ? 'work' : 'idle';
  if (hour < 18) return employed ? (profession === 'transporter' ? 'haul' : 'work') : 'leisure';
  if (hour < 20.5) return 'leisure';
  return homeless ? 'idle' : 'return_home';
}

export const ACTIVITY_LABELS: Record<Activity, string> = {
  sleep: 'Đang ngủ',
  wake: 'Thức dậy, ăn sáng',
  commute: 'Đi làm',
  work: 'Đang làm việc',
  lunch: 'Ăn trưa',
  haul: 'Vận chuyển hàng',
  leisure: 'Trò chuyện, nghỉ ngơi',
  return_home: 'Về nhà',
  idle: 'Nhàn rỗi',
};

// ─────────────────────────────────────────────────────────────────────────────
// Survivors
// ─────────────────────────────────────────────────────────────────────────────
export const INITIAL_SURVIVORS = 5;
export const RESCUE_COST = { coins: 400, food: 10 };
/** Game hours a rescue mission takes. */
export const RESCUE_HOURS = 18;

export type Mood = 'happy' | 'content' | 'tired' | 'sad';
export const MOOD_ICONS: Record<Mood, string> = { happy: '😄', content: '🙂', tired: '😪', sad: '😢' };
export const MOOD_LABELS: Record<Mood, string> = { happy: 'Vui vẻ', content: 'Hài lòng', tired: 'Mệt mỏi', sad: 'Buồn' };

export function moodOf(s: { satisfaction: number; stamina: number; health: number }): Mood {
  if (s.stamina < 0.3 || s.health < 0.35) return 'tired';
  if (s.satisfaction < 0.35) return 'sad';
  if (s.satisfaction >= 0.72) return 'happy';
  return 'content';
}

/** Work efficiency of one worker (skill, stamina, health). 0.35 .. ~1.3 */
export function workerEfficiency(skill: number, stamina: number, health: number): number {
  return (0.55 + 0.75 * Math.min(1, Math.max(0, skill))) * (0.5 + 0.5 * Math.min(1, stamina)) * (0.6 + 0.4 * Math.min(1, health));
}

const GIVEN = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hoa', 'Hùng', 'Khánh', 'Lan', 'Linh', 'Long', 'Mai', 'Minh', 'Nam', 'Ngọc', 'Phúc', 'Quân', 'Sơn', 'Tâm', 'Thảo', 'Trang', 'Tú', 'Tuấn', 'Vân', 'Việt', 'Yến'];
const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô'];

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: 0 | 1 | 2 | 3;
  /** 0.94 .. 1.06 — tiny variety on the normalised skeleton */
  height: number;
}

const SKINS = ['#f6d2b4', '#eebf98', '#d9a57a', '#c48a60', '#a86f4a'];
const HAIRS = ['#2b2116', '#4a3020', '#6b4a2a', '#1f1a1a', '#8a5a32', '#b88a4a'];

/** Deterministic name + look from a seed number. */
export function survivorIdentity(seed: number): { name: string; appearance: Appearance } {
  const r = (k: number) => {
    let x = (seed * 2654435761 + k * 40503) >>> 0;
    x ^= x >>> 13;
    x = Math.imul(x, 0x5bd1e995) >>> 0;
    x ^= x >>> 15;
    return (x >>> 0) / 4294967296;
  };
  return {
    name: `${FAMILY[Math.floor(r(1) * FAMILY.length)]} ${GIVEN[Math.floor(r(2) * GIVEN.length)]}`,
    appearance: {
      skin: SKINS[Math.floor(r(3) * SKINS.length)],
      hair: HAIRS[Math.floor(r(4) * HAIRS.length)],
      hairStyle: Math.floor(r(5) * 4) as Appearance['hairStyle'],
      height: 0.94 + r(6) * 0.12,
    },
  };
}

/** Starting skills: one strong profession, the rest low. */
export function initialSkills(seed: number): Record<ProfessionCode, number> {
  const out = {} as Record<ProfessionCode, number>;
  PROFESSION_CODES.forEach((p, i) => {
    out[p] = 0.1 + (((seed * 31 + i * 17) % 23) / 23) * 0.25;
  });
  out[PROFESSION_CODES[seed % PROFESSION_CODES.length]] = 0.55;
  return out;
}

