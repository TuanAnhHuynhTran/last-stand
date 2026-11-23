/**
 * Military catalogue (Phase 8): four soldier classes with clearly different stats and drills,
 * equipment (made at the military forge, stored in city_resources as eq_*), five ranks, training
 * rules and squad formations. No combat yet — strength is a planning number.
 *
 * Soldiers are villagers: recruiting takes real survivors out of civilian life and needs real
 * equipment + food from storage (never "wood and stone in, soldier out").
 */
import { getBuildingLevel, type BuildingTypeCode } from '../buildings/definitions.js';

export type UnitTypeCode = 'swordsman' | 'spearman' | 'archer' | 'crossbowman';
export const UNIT_TYPE_CODES: readonly UnitTypeCode[] = ['swordsman', 'spearman', 'archer', 'crossbowman'];

export type EquipmentSlot = 'weapon' | 'offhand' | 'armor' | 'helmet' | 'ammo';
export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['weapon', 'offhand', 'armor', 'helmet', 'ammo'];
export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = { weapon: 'Vũ khí', offhand: 'Tay trái', armor: 'Giáp', helmet: 'Mũ', ammo: 'Đạn' };

export type EquipmentCode =
  | 'eq_saber'
  | 'eq_shield'
  | 'eq_spear'
  | 'eq_bow'
  | 'eq_arrows'
  | 'eq_crossbow'
  | 'eq_bolts'
  | 'eq_leather_armor'
  | 'eq_iron_armor'
  | 'eq_helmet'
  | 'eq_iron_helmet';

export interface UnitStats {
  hp: number;
  attack: number;
  defense: number;
  /** Reach in metres (melee 1–2.5, ranged 30+) */
  range: number;
  /** Movement speed multiplier */
  speed: number;
  /** 0..1 share of the target's armour ignored */
  armorPierce: number;
  /** Seconds between attacks */
  reload: number;
  /** Bonus against charging enemies (spears) */
  antiCharge: number;
  /** Chance to block (shields) */
  block: number;
}

export interface UnitTypeDefinition {
  code: UnitTypeCode;
  name: string;
  role: string;
  description: string;
  /** Building that trains this class */
  building: BuildingTypeCode;
  base: UnitStats;
  trainSeconds: number;
  /** Per recruit, taken from storage */
  food: number;
  coins: number;
  /** Equipment a recruit must receive (one of each) */
  required: Partial<Record<EquipmentSlot, EquipmentCode>>;
  /** Uniform colours (chibi model) */
  look: { tunic: string; trim: string };
  /** Drill animations, in order */
  drills: readonly string[];
}

export const UNIT_TYPE_DEFINITIONS: readonly UnitTypeDefinition[] = [
  {
    code: 'swordsman',
    name: 'Đao binh',
    role: 'Bảo vệ đội hình',
    description: 'Đao và khiên lớn, chống chịu tốt, giữ tuyến đầu.',
    building: 'sword_barracks',
    base: { hp: 130, attack: 14, defense: 13, range: 1.2, speed: 1, armorPierce: 0.1, reload: 1.1, antiCharge: 0.1, block: 0.35 },
    trainSeconds: 90,
    food: 4,
    coins: 25,
    required: { weapon: 'eq_saber', offhand: 'eq_shield', armor: 'eq_leather_armor' },
    look: { tunic: '#b8463a', trim: '#f2c14e' },
    drills: ['draw', 'swing', 'block', 'strike'],
  },
  {
    code: 'spearman',
    name: 'Thương binh',
    role: 'Chặn kẻ lao vào',
    description: 'Thương dài hơn người, tầm với tốt, giữ đội hình chống kỵ.',
    building: 'spear_barracks',
    base: { hp: 105, attack: 12, defense: 9, range: 2.6, speed: 0.92, armorPierce: 0.2, reload: 1.3, antiCharge: 0.65, block: 0.05 },
    trainSeconds: 80,
    food: 4,
    coins: 20,
    required: { weapon: 'eq_spear', armor: 'eq_leather_armor' },
    look: { tunic: '#3f6fa8', trim: '#e8e2d6' },
    drills: ['thrust', 'retract', 'formation', 'guard'],
  },
  {
    code: 'archer',
    name: 'Cung binh',
    role: 'Bắn xa, cơ động',
    description: 'Cung cong và ống tên, bắn nhanh từ xa nhưng phòng thủ yếu.',
    building: 'archery_range',
    base: { hp: 70, attack: 10, defense: 4, range: 32, speed: 1.2, armorPierce: 0.15, reload: 1.6, antiCharge: 0, block: 0 },
    trainSeconds: 100,
    food: 3,
    coins: 25,
    required: { weapon: 'eq_bow', ammo: 'eq_arrows' },
    look: { tunic: '#4f8a3a', trim: '#c9a43c' },
    drills: ['nock', 'raise', 'aim', 'shoot', 'lower'],
  },
  {
    code: 'crossbowman',
    name: 'Nỏ binh',
    role: 'Xuyên giáp',
    description: 'Nỏ có cơ cấu lên dây, sức xuyên giáp cao, nạp tên lâu hơn cung.',
    building: 'crossbow_range',
    base: { hp: 90, attack: 19, defense: 7, range: 28, speed: 0.85, armorPierce: 0.6, reload: 3.6, antiCharge: 0.05, block: 0 },
    trainSeconds: 120,
    food: 4,
    coins: 35,
    required: { weapon: 'eq_crossbow', ammo: 'eq_bolts', armor: 'eq_leather_armor' },
    look: { tunic: '#6a4a8a', trim: '#b9bec7' },
    drills: ['span', 'load', 'aim', 'shoot', 'reload'],
  },
];

const UNIT_BY_CODE = new Map(UNIT_TYPE_DEFINITIONS.map((u) => [u.code, u]));
export function getUnitType(code: UnitTypeCode): UnitTypeDefinition {
  const u = UNIT_BY_CODE.get(code);
  if (!u) throw new Error(`Unknown unit type: ${code}`);
  return u;
}
export function isUnitTypeCode(code: string): code is UnitTypeCode {
  return UNIT_BY_CODE.has(code as UnitTypeCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// Equipment
// ─────────────────────────────────────────────────────────────────────────────
export interface EquipmentDefinition {
  code: EquipmentCode;
  name: string;
  slot: EquipmentSlot;
  bonus: Partial<UnitStats>;
  /** Classes that can use it */
  units: readonly UnitTypeCode[];
}

const ALL: readonly UnitTypeCode[] = UNIT_TYPE_CODES;

export const EQUIPMENT_DEFINITIONS: readonly EquipmentDefinition[] = [
  { code: 'eq_saber', name: 'Đao', slot: 'weapon', bonus: { attack: 4 }, units: ['swordsman'] },
  { code: 'eq_shield', name: 'Khiên', slot: 'offhand', bonus: { defense: 6, block: 0.15 }, units: ['swordsman'] },
  { code: 'eq_spear', name: 'Thương', slot: 'weapon', bonus: { attack: 4, antiCharge: 0.2 }, units: ['spearman'] },
  { code: 'eq_bow', name: 'Cung', slot: 'weapon', bonus: { attack: 3, range: 4 }, units: ['archer'] },
  { code: 'eq_arrows', name: 'Ống tên', slot: 'ammo', bonus: { attack: 1 }, units: ['archer'] },
  { code: 'eq_crossbow', name: 'Nỏ', slot: 'weapon', bonus: { attack: 5, armorPierce: 0.1 }, units: ['crossbowman'] },
  { code: 'eq_bolts', name: 'Hộp tên nỏ', slot: 'ammo', bonus: { armorPierce: 0.1 }, units: ['crossbowman'] },
  { code: 'eq_leather_armor', name: 'Giáp da', slot: 'armor', bonus: { defense: 4, hp: 10 }, units: ALL },
  { code: 'eq_iron_armor', name: 'Giáp sắt', slot: 'armor', bonus: { defense: 9, hp: 20, speed: -0.08 }, units: ['swordsman', 'spearman', 'crossbowman'] },
  { code: 'eq_helmet', name: 'Mũ da', slot: 'helmet', bonus: { defense: 2 }, units: ALL },
  { code: 'eq_iron_helmet', name: 'Mũ sắt', slot: 'helmet', bonus: { defense: 4, hp: 5 }, units: ALL },
];

const EQ_BY_CODE = new Map(EQUIPMENT_DEFINITIONS.map((e) => [e.code, e]));
export function getEquipment(code: EquipmentCode): EquipmentDefinition {
  const e = EQ_BY_CODE.get(code);
  if (!e) throw new Error(`Unknown equipment: ${code}`);
  return e;
}
export function isEquipmentCode(code: string): code is EquipmentCode {
  return EQ_BY_CODE.has(code as EquipmentCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranks
// ─────────────────────────────────────────────────────────────────────────────
export type RankAccessory = 'none' | 'scarf' | 'plume' | 'pauldrons' | 'cape';
export interface RankDefinition {
  rank: number;
  name: string;
  xp: number;
  mult: number;
  /** Visual accessory added on the same model (no model swap) */
  accessory: RankAccessory;
}
export const RANKS: readonly RankDefinition[] = [
  { rank: 1, name: 'Tân binh', xp: 0, mult: 1, accessory: 'none' },
  { rank: 2, name: 'Binh sĩ', xp: 100, mult: 1.08, accessory: 'scarf' },
  { rank: 3, name: 'Tinh binh', xp: 250, mult: 1.17, accessory: 'plume' },
  { rank: 4, name: 'Cận vệ', xp: 500, mult: 1.27, accessory: 'pauldrons' },
  { rank: 5, name: 'Tinh nhuệ', xp: 900, mult: 1.4, accessory: 'cape' },
];
export const MAX_RANK = 5;

export function rankForXp(xp: number): number {
  let r = 1;
  for (const d of RANKS) if (xp >= d.xp) r = d.rank;
  return r;
}
export function getRank(rank: number): RankDefinition {
  return RANKS[Math.min(MAX_RANK, Math.max(1, rank)) - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// Training
// ─────────────────────────────────────────────────────────────────────────────
export const BARRACKS_TYPES: readonly BuildingTypeCode[] = ['sword_barracks', 'spear_barracks', 'archery_range', 'crossbow_range'];
export const MILITARY_BUILDING_TYPES: readonly BuildingTypeCode[] = [...BARRACKS_TYPES, 'military_forge', 'training_ground', 'military_depot'];
export function isMilitaryBuilding(code: string): boolean {
  return MILITARY_BUILDING_TYPES.includes(code as BuildingTypeCode);
}
/** Unit class trained by a barracks (null for forge / depot / training ground). */
export function unitForBuilding(code: string): UnitTypeCode | null {
  return UNIT_TYPE_DEFINITIONS.find((u) => u.building === code)?.code ?? null;
}

/** Soldiers per training batch (2 / 4 / 6 at barracks; 4 / 8 / 12 at the training ground). */
export function trainingSlots(code: BuildingTypeCode, level: number): number {
  return getBuildingLevel(code, Math.min(3, Math.max(1, level)))?.stats.training ?? 0;
}

/** Recruit training time (s) — faster at higher levels. */
export function trainingSeconds(unit: UnitTypeCode, level: number): number {
  return Math.round(getUnitType(unit).trainSeconds / (1 + 0.15 * (Math.min(3, Math.max(1, level)) - 1)));
}

export const DRILL_SECONDS = 90;
/** XP for one drill: more at the combined training ground and higher levels. */
export function drillXp(buildingCode: BuildingTypeCode, level: number): number {
  const base = buildingCode === 'training_ground' ? 60 : 40;
  return Math.round(base * (1 + 0.25 * (Math.min(3, Math.max(1, level)) - 1)));
}
/** XP for finishing recruit training. */
export const GRADUATION_XP = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Stats, strength, readiness
// ─────────────────────────────────────────────────────────────────────────────
export function unitStats(type: UnitTypeCode, rank: number, equipment: readonly EquipmentCode[]): UnitStats {
  const s: UnitStats = { ...getUnitType(type).base };
  for (const code of equipment) {
    for (const [k, v] of Object.entries(getEquipment(code).bonus) as [keyof UnitStats, number][]) s[k] += v;
  }
  const m = getRank(rank).mult;
  return {
    ...s,
    hp: Math.round(s.hp * m),
    attack: Math.round(s.attack * m * 10) / 10,
    defense: Math.round(s.defense * m * 10) / 10,
    armorPierce: Math.min(0.95, s.armorPierce),
    block: Math.min(0.75, s.block),
    speed: Math.round(s.speed * 100) / 100,
    reload: Math.round((s.reload / (1 + 0.04 * (rank - 1))) * 100) / 100,
  };
}

/** One number for planning: damage per second (with pierce, reach) + toughness. */
export function combatPower(s: UnitStats): number {
  const dps = (s.attack * (1 + s.armorPierce)) / s.reload;
  const reach = s.range > 5 ? 1.35 : 1 + s.range * 0.08;
  const toughness = s.hp / 12 + s.defense * (1 + s.block);
  return Math.round(dps * reach * 6 + toughness + s.antiCharge * 8);
}

/** Required equipment the unit is missing (empty = fully equipped for its class). */
export function missingEquipment(type: UnitTypeCode, equipped: Partial<Record<EquipmentSlot, EquipmentCode>>): EquipmentSlot[] {
  return (Object.keys(getUnitType(type).required) as EquipmentSlot[]).filter((slot) => !equipped[slot]);
}

/** Can this item go into this slot for this class? */
export function canEquip(type: UnitTypeCode, slot: EquipmentSlot, code: EquipmentCode): boolean {
  const e = getEquipment(code);
  return e.slot === slot && e.units.includes(type);
}

// ─────────────────────────────────────────────────────────────────────────────
// Squads
// ─────────────────────────────────────────────────────────────────────────────
export type Formation = 'line' | 'column' | 'wedge' | 'square';
export const FORMATION_LABELS: Record<Formation, string> = { line: 'Hàng ngang', column: 'Hàng dọc', wedge: 'Mũi nhọn', square: 'Thế vuông' };
export const MAX_SQUAD_SIZE = 12;
export type SquadStatus = 'standby' | 'deployed';
export const SQUAD_STATUS_LABELS: Record<SquadStatus, string> = { standby: 'Sẵn sàng tại doanh trại', deployed: 'Đang làm nhiệm vụ' };
