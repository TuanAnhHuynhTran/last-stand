/**
 * Working animals (Phase 9) — horses and elephants on top of the livestock Animal Engine.
 *
 * Horses / elephants are ordinary farm animals (stables / camps are livestock farms, so feed,
 * water, health, breeding and upgrades are shared). This module adds what makes them useful:
 *   traits     tameness, stamina, speed, carry capacity, training level (stored per animal)
 *   training   timed programs at the stable (taming, riding, speed, endurance, cargo, war)
 *   equipment  saddle, barding, cargo harness, howdah — real items forged and kept in storage
 *   use        a horse can be ONE soldier's mount (mount_assignments); horses / elephants can
 *              haul goods (transport) and elephants can be reserved for the army (military)
 *   care       grooming and veterinary visits (animal_care_records keeps the history)
 * An untamed animal can never be given to a soldier as a combat mount.
 */
import type { UnitStats, UnitTypeCode } from '../military/definitions.js';
import type { AnimalTypeCode } from '../livestock/definitions.js';

export type MountSpecies = Extract<AnimalTypeCode, 'horse' | 'elephant'>;
export const MOUNT_SPECIES: readonly MountSpecies[] = ['horse', 'elephant'];
export const isMountSpecies = (code: string): code is MountSpecies => (MOUNT_SPECIES as readonly string[]).includes(code);

export interface MountProfile {
  /** Base gallop / walk speed (m/s) */
  speed: number;
  /** Base load (kg) */
  carry: number;
  /** Starting stamina 0..1 and tameness 0..1 (a newly received animal is half-wild) */
  stamina: number;
  tameness: number;
  /** Training caps */
  maxSpeedBonus: number;
  maxCarryBonus: number;
}

export const MOUNT_PROFILES: Record<MountSpecies, MountProfile> = {
  horse: { speed: 9, carry: 120, stamina: 0.5, tameness: 0.2, maxSpeedBonus: 4, maxCarryBonus: 80 },
  elephant: { speed: 4, carry: 900, stamina: 0.6, tameness: 0.25, maxSpeedBonus: 1.5, maxCarryBonus: 900 },
};

/** Breed modifiers on top of the species profile. */
const BREED_MODS: Record<string, { speed?: number; carry?: number; stamina?: number; tameness?: number }> = {
  black: { speed: 1.2 },
  white: { speed: 0.4, tameness: 0.05 },
  chestnut: { stamina: 0.1 },
  dapple: { carry: 20, stamina: 0.05 },
  bay: { tameness: 0.1 },
  war: { carry: 200, tameness: -0.1 },
};

export const TAME_THRESHOLD = 0.6;
export const MAX_TRAINING_LEVEL = 5;
export const TRAINING_LEVEL_LABELS = ['Chưa huấn luyện', 'Cơ bản', 'Thành thạo', 'Tinh luyện', 'Chiến mã', 'Huyền thoại'];

/** Stored per animal (farm_animals columns). */
export interface StoredMountTraits {
  tameness: number;
  stamina: number;
  speedBonus: number;
  carryBonus: number;
  trainingLevel: number;
}

export function initialTraits(species: MountSpecies, breed: string | null): StoredMountTraits {
  const p = MOUNT_PROFILES[species];
  const m = BREED_MODS[breed ?? ''] ?? {};
  return {
    tameness: clamp01(p.tameness + (m.tameness ?? 0)),
    stamina: clamp01(p.stamina + (m.stamina ?? 0)),
    speedBonus: 0,
    carryBonus: 0,
    trainingLevel: 0,
  };
}

/** Effective speed (m/s) / carry (kg) of an animal. */
export function mountSpeed(species: MountSpecies, breed: string | null, t: Pick<StoredMountTraits, 'speedBonus' | 'stamina'>): number {
  const base = MOUNT_PROFILES[species].speed + (BREED_MODS[breed ?? '']?.speed ?? 0);
  return round2((base + t.speedBonus) * (0.85 + 0.15 * t.stamina));
}

export function mountCarry(species: MountSpecies, breed: string | null, t: Pick<StoredMountTraits, 'carryBonus'>): number {
  return Math.round(MOUNT_PROFILES[species].carry + (BREED_MODS[breed ?? '']?.carry ?? 0) + t.carryBonus);
}

export const isTame = (t: Pick<StoredMountTraits, 'tameness'>): boolean => t.tameness >= TAME_THRESHOLD - 1e-9;

// ─────────────────────────────────────────────────────────────────────────────
// Training programs
// ─────────────────────────────────────────────────────────────────────────────
export type TrainingProgramCode = 'taming' | 'riding' | 'speed' | 'endurance' | 'cargo' | 'war';
export const TRAINING_PROGRAM_CODES: readonly TrainingProgramCode[] = ['taming', 'riding', 'speed', 'endurance', 'cargo', 'war'];

export interface TrainingProgram {
  code: TrainingProgramCode;
  name: string;
  description: string;
  species: readonly MountSpecies[];
  seconds: number;
  coins: number;
  /** Nutrition taken from the stable's feed store */
  feed: number;
  /** Stable / camp level needed (the training yard comes at level 2) */
  minLevel: number;
  requiresTame: boolean;
  gains: Partial<Record<'tameness' | 'stamina' | 'speedBonus' | 'carryBonus' | 'trainingLevel', number>>;
}

export const TRAINING_PROGRAMS: readonly TrainingProgram[] = [
  { code: 'taming', name: 'Thuần hóa', description: 'Làm quen dây cương, người chăm và tiếng động.', species: ['horse', 'elephant'], seconds: 60, coins: 30, feed: 30, minLevel: 1, requiresTame: false, gains: { tameness: 0.3 } },
  { code: 'riding', name: 'Tập cưỡi', description: 'Chở người, nghe lệnh, đi đều — nâng trình độ huấn luyện.', species: ['horse'], seconds: 90, coins: 60, feed: 40, minLevel: 2, requiresTame: true, gains: { trainingLevel: 1, speedBonus: 0.3 } },
  { code: 'speed', name: 'Luyện tốc độ', description: 'Chạy nước kiệu và phi nước đại quanh sân.', species: ['horse'], seconds: 90, coins: 50, feed: 45, minLevel: 2, requiresTame: true, gains: { speedBonus: 0.8 } },
  { code: 'endurance', name: 'Luyện sức bền', description: 'Đi đường dài, mang tải nhẹ — tăng thể lực.', species: ['horse', 'elephant'], seconds: 80, coins: 40, feed: 50, minLevel: 2, requiresTame: true, gains: { stamina: 0.15 } },
  { code: 'cargo', name: 'Luyện chở hàng', description: 'Mang tải nặng, đi theo người dẫn — tăng sức chở.', species: ['horse', 'elephant'], seconds: 100, coins: 60, feed: 80, minLevel: 2, requiresTame: true, gains: { carryBonus: 150 } },
  { code: 'war', name: 'Luyện chiến', description: 'Không sợ trống trận, đẩy vật cản, theo hiệu lệnh quân sự.', species: ['elephant'], seconds: 150, coins: 120, feed: 120, minLevel: 2, requiresTame: true, gains: { trainingLevel: 1 } },
];

export function getTrainingProgram(code: TrainingProgramCode): TrainingProgram {
  const p = TRAINING_PROGRAMS.find((x) => x.code === code);
  if (!p) throw new Error(`Unknown training program: ${code}`);
  return p;
}

export const programsFor = (species: MountSpecies): TrainingProgram[] => TRAINING_PROGRAMS.filter((p) => p.species.includes(species));

/** Better facilities train faster (training yard L2, riding arena / centre L3). */
export function trainingDuration(program: TrainingProgram, stableLevel: number): number {
  return Math.round(program.seconds / (1 + 0.25 * (Math.min(3, Math.max(1, stableLevel)) - 1)));
}

export type TrainingBlock =
  | 'WRONG_SPECIES'
  | 'ANIMAL_YOUNG'
  | 'ANIMAL_TOO_WEAK'
  | 'ANIMAL_HUNGRY'
  | 'NOT_TAME'
  | 'STABLE_LEVEL_TOO_LOW'
  | 'MAX_TRAINED'
  | 'ANIMAL_IN_USE';

/** Why an animal cannot start a program (null = it can). */
export function trainingBlock(
  program: TrainingProgram,
  a: { species: AnimalTypeCode; adult: boolean; health: number; satiety: number; traits: StoredMountTraits; inUse: boolean },
  stableLevel: number
): TrainingBlock | null {
  if (!isMountSpecies(a.species) || !program.species.includes(a.species)) return 'WRONG_SPECIES';
  if (!a.adult) return 'ANIMAL_YOUNG';
  if (a.inUse) return 'ANIMAL_IN_USE';
  if (a.health < 0.5) return 'ANIMAL_TOO_WEAK';
  if (a.satiety < 0.35) return 'ANIMAL_HUNGRY';
  if (stableLevel < program.minLevel) return 'STABLE_LEVEL_TOO_LOW';
  if (program.requiresTame && !isTame(a.traits)) return 'NOT_TAME';
  const t = a.traits;
  const cap = MOUNT_PROFILES[a.species];
  const g = program.gains;
  const room =
    (g.tameness !== undefined && t.tameness < 1 - 1e-9) ||
    (g.stamina !== undefined && t.stamina < 1 - 1e-9) ||
    (g.speedBonus !== undefined && t.speedBonus < cap.maxSpeedBonus - 1e-9) ||
    (g.carryBonus !== undefined && t.carryBonus < cap.maxCarryBonus - 1e-9) ||
    (g.trainingLevel !== undefined && t.trainingLevel < MAX_TRAINING_LEVEL);
  return room ? null : 'MAX_TRAINED';
}

/** Traits after a finished program; well-kept animals learn more (health / satiety at the end). */
export function applyTraining(species: MountSpecies, t: StoredMountTraits, program: TrainingProgram, health: number, satiety: number): StoredMountTraits {
  const care = 0.6 + 0.4 * clamp01(health) * clamp01(satiety / 0.7);
  const g = program.gains;
  const cap = MOUNT_PROFILES[species];
  return {
    tameness: clamp01(t.tameness + (g.tameness ?? 0) * care),
    stamina: clamp01(t.stamina + (g.stamina ?? 0) * care),
    speedBonus: Math.min(cap.maxSpeedBonus, round2(t.speedBonus + (g.speedBonus ?? 0) * care)),
    carryBonus: Math.min(cap.maxCarryBonus, Math.round(t.carryBonus + (g.carryBonus ?? 0) * care)),
    // Levels are whole steps (a sick horse still learns the lesson, only slower stats).
    trainingLevel: Math.min(MAX_TRAINING_LEVEL, t.trainingLevel + (g.trainingLevel ?? 0)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Animal equipment (stock in city_resources, forged at the military forge)
// ─────────────────────────────────────────────────────────────────────────────
export type AnimalEquipmentSlot = 'saddle' | 'armor' | 'harness' | 'howdah';
export const ANIMAL_EQUIPMENT_SLOTS: readonly AnimalEquipmentSlot[] = ['saddle', 'armor', 'harness', 'howdah'];
export const ANIMAL_EQUIPMENT_SLOT_LABELS: Record<AnimalEquipmentSlot, string> = { saddle: 'Yên', armor: 'Giáp thú', harness: 'Đai chở hàng', howdah: 'Bành / tháp' };

export type AnimalEquipmentCode = 'eq_saddle' | 'eq_horse_barding' | 'eq_cargo_harness' | 'eq_howdah';
export const ANIMAL_EQUIPMENT_CODES: readonly AnimalEquipmentCode[] = ['eq_saddle', 'eq_horse_barding', 'eq_cargo_harness', 'eq_howdah'];

export interface AnimalEquipmentDefinition {
  code: AnimalEquipmentCode;
  name: string;
  slot: AnimalEquipmentSlot;
  species: readonly MountSpecies[];
  description: string;
}

export const ANIMAL_EQUIPMENT_DEFINITIONS: readonly AnimalEquipmentDefinition[] = [
  { code: 'eq_saddle', name: 'Yên ngựa', slot: 'saddle', species: ['horse'], description: 'Bắt buộc để binh sĩ cưỡi.' },
  { code: 'eq_horse_barding', name: 'Giáp ngựa', slot: 'armor', species: ['horse'], description: 'Che chắn cho chiến mã (+máu, +thủ cho kỵ binh).' },
  { code: 'eq_cargo_harness', name: 'Đai chở hàng', slot: 'harness', species: ['horse', 'elephant'], description: 'Bắt buộc để chở vật liệu.' },
  { code: 'eq_howdah', name: 'Bành voi', slot: 'howdah', species: ['elephant'], description: 'Chỗ cho quản tượng / tháp chiến đấu (chuẩn bị cho giai đoạn sau).' },
];

export function getAnimalEquipment(code: AnimalEquipmentCode): AnimalEquipmentDefinition {
  const d = ANIMAL_EQUIPMENT_DEFINITIONS.find((e) => e.code === code);
  if (!d) throw new Error(`Unknown animal equipment: ${code}`);
  return d;
}

export function canEquipAnimal(species: AnimalTypeCode, slot: AnimalEquipmentSlot, code: AnimalEquipmentCode): boolean {
  const d = ANIMAL_EQUIPMENT_DEFINITIONS.find((e) => e.code === code);
  return Boolean(d && d.slot === slot && isMountSpecies(species) && d.species.includes(species));
}

// ─────────────────────────────────────────────────────────────────────────────
// Use: mounts (horse ↔ soldier) and tasks (transport / military reserve)
// ─────────────────────────────────────────────────────────────────────────────
/** Soldier classes that can ride (no new base class in this phase). */
export const RIDER_CLASSES: readonly UnitTypeCode[] = ['swordsman', 'spearman', 'archer'];

export type AnimalTaskKind = 'transport' | 'military';
export const ANIMAL_TASK_LABELS: Record<AnimalTaskKind, string> = { transport: 'Chở vật liệu', military: 'Dự bị quân sự' };

export type MountBlock =
  | 'NOT_A_HORSE'
  | 'ANIMAL_YOUNG'
  | 'ANIMAL_TOO_WEAK'
  | 'NOT_TAME'
  | 'NO_SADDLE'
  | 'ANIMAL_IN_USE'
  | 'ANIMAL_TRAINING'
  | 'RIDER_NOT_SUITABLE';

export function mountBlock(
  a: { species: AnimalTypeCode; adult: boolean; health: number; traits: StoredMountTraits; saddle: boolean; inUse: boolean; training: boolean },
  riderType: UnitTypeCode
): MountBlock | null {
  if (a.species !== 'horse') return 'NOT_A_HORSE';
  if (!a.adult) return 'ANIMAL_YOUNG';
  if (a.training) return 'ANIMAL_TRAINING';
  if (a.inUse) return 'ANIMAL_IN_USE';
  if (a.health < 0.4) return 'ANIMAL_TOO_WEAK';
  if (!isTame(a.traits)) return 'NOT_TAME';
  if (!a.saddle) return 'NO_SADDLE';
  if (!RIDER_CLASSES.includes(riderType)) return 'RIDER_NOT_SUITABLE';
  return null;
}

export type TaskBlock = 'ANIMAL_YOUNG' | 'NOT_TAME' | 'NO_HARNESS' | 'NOT_WAR_TRAINED' | 'NOT_AN_ELEPHANT' | 'ANIMAL_IN_USE' | 'ANIMAL_TRAINING' | 'WRONG_SPECIES';

export function taskBlock(
  kind: AnimalTaskKind,
  a: { species: AnimalTypeCode; adult: boolean; traits: StoredMountTraits; harness: boolean; inUse: boolean; training: boolean }
): TaskBlock | null {
  if (!isMountSpecies(a.species)) return 'WRONG_SPECIES';
  if (!a.adult) return 'ANIMAL_YOUNG';
  if (a.training) return 'ANIMAL_TRAINING';
  if (a.inUse) return 'ANIMAL_IN_USE';
  if (!isTame(a.traits)) return 'NOT_TAME';
  if (kind === 'transport' && !a.harness) return 'NO_HARNESS';
  if (kind === 'military') {
    if (a.species !== 'elephant') return 'NOT_AN_ELEPHANT';
    if (a.traits.trainingLevel < 2) return 'NOT_WAR_TRAINED';
  }
  return null;
}

/** Goods per game hour an animal on transport duty adds to the haulers (from its carry). */
export function transportPerHour(species: MountSpecies, breed: string | null, t: StoredMountTraits): number {
  return Math.round((mountCarry(species, breed, t) / 20) * (0.7 + 0.3 * t.stamina));
}

/** A soldier's stats on horseback (faster, sturdier; spears and sabres gain the charge). */
export function mountedStats(
  base: UnitStats,
  rider: UnitTypeCode,
  mount: { speed: number; trainingLevel: number; armored: boolean }
): UnitStats {
  const charge = rider === 'spearman' ? 4 : rider === 'swordsman' ? 2 : 0;
  return {
    ...base,
    hp: base.hp + 8 * mount.trainingLevel + (mount.armored ? 25 : 0),
    attack: base.attack + charge + Math.floor(mount.trainingLevel / 2),
    defense: base.defense + (mount.armored ? 4 : 0),
    speed: round2(base.speed * (1 + mount.speed / 9)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Care
// ─────────────────────────────────────────────────────────────────────────────
export type CareAction = 'groom' | 'vet';
export type CareRecordKind = CareAction | 'feed' | 'water' | 'training' | 'death' | 'received' | 'mount' | 'dismount' | 'task' | 'equip';

export const CARE_LABELS: Record<CareRecordKind, string> = {
  groom: 'Chải lông',
  vet: 'Khám thú y',
  feed: 'Cho ăn',
  water: 'Cho uống',
  training: 'Huấn luyện xong',
  death: 'Chết vì thiếu ăn / nước',
  received: 'Tiếp nhận',
  mount: 'Giao cho kỵ binh',
  dismount: 'Hủy giao thú cưỡi',
  task: 'Phân công',
  equip: 'Đổi trang bị',
};

export const GROOM_COST = 5;
export const GROOM_TAMENESS = 0.04;
export const GROOM_COOLDOWN_SECONDS = 30;
export const VET_COST = 60;
/** Health restored by the care area (L2) / veterinary (L3) */
export const vetHeal = (stableLevel: number): number => (stableLevel >= 3 ? 0.55 : 0.35);

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
