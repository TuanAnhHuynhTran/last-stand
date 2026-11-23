/**
 * Tactical battle catalogue (Phase 11) — every balance number lives here so the engine, the
 * server and the client agree. Battles happen on a separate hex battlefield (never the
 * player's own map) against PvE enemies; the server runs the engine and is the only source
 * of damage, results and rewards.
 */
import type { ResourceBag } from '../buildings/definitions.js';
import type { UnitTypeCode } from '../military/definitions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Terrain
// ─────────────────────────────────────────────────────────────────────────────
export type BattleTerrain = 'ground' | 'road' | 'forest' | 'rock' | 'fort' | 'ruins' | 'hill' | 'water' | 'toxic';
export const BATTLE_TERRAINS: readonly BattleTerrain[] = ['ground', 'road', 'forest', 'rock', 'fort', 'ruins', 'hill', 'water', 'toxic'];

export interface TerrainDefinition {
  code: BattleTerrain;
  name: string;
  passable: boolean;
  /** Movement points to enter (ground = 2, road = 1) */
  cost: number;
  /** 0..0.5 — less ranged damage / hit chance against a unit standing here */
  cover: number;
  /** Blocks line of sight when it lies between attacker and target */
  blocksSight: boolean;
  /** Height level (hills give range / damage, the attacker on a hill sees over forest / ruins) */
  height: number;
  effect: 'poison' | null;
  description: string;
}

export const TERRAIN_DEFINITIONS: Record<BattleTerrain, TerrainDefinition> = {
  ground: { code: 'ground', name: 'Đất thường', passable: true, cost: 2, cover: 0, blocksSight: false, height: 0, effect: null, description: 'Không có gì đặc biệt.' },
  road: { code: 'road', name: 'Đường', passable: true, cost: 1, cover: 0, blocksSight: false, height: 0, effect: null, description: 'Đi nhanh gấp đôi.' },
  forest: { code: 'forest', name: 'Rừng', passable: true, cost: 3, cover: 0.25, blocksSight: true, height: 0, effect: null, description: 'Che chắn vừa, che tầm nhìn.' },
  rock: { code: 'rock', name: 'Đá', passable: false, cost: 99, cover: 0, blocksSight: true, height: 2, effect: null, description: 'Không đi qua, chắn tầm nhìn.' },
  fort: { code: 'fort', name: 'Công sự', passable: true, cost: 2, cover: 0.5, blocksSight: false, height: 0, effect: null, description: 'Bao cát: che chắn tốt nhất.' },
  ruins: { code: 'ruins', name: 'Nhà đổ nát', passable: true, cost: 3, cover: 0.35, blocksSight: true, height: 0, effect: null, description: 'Tường đổ: che chắn và chắn tầm nhìn.' },
  hill: { code: 'hill', name: 'Đồi cao', passable: true, cost: 3, cover: 0.1, blocksSight: false, height: 1, effect: null, description: 'Bắn xa thêm 1 ô, đánh mạnh hơn từ trên cao.' },
  water: { code: 'water', name: 'Nước', passable: false, cost: 99, cover: 0, blocksSight: false, height: 0, effect: null, description: 'Không lội qua được.' },
  toxic: { code: 'toxic', name: 'Khu nhiễm độc', passable: true, cost: 2, cover: 0, blocksSight: false, height: 0, effect: 'poison', description: 'Đứng / đi qua bị nhiễm độc.' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Balance
// ─────────────────────────────────────────────────────────────────────────────
export type CombatCategory = 'human' | 'beast' | 'undead' | 'mutant' | 'machine' | 'boss' | 'civilian';

export const BATTLE_BALANCE = {
  /** Armour reduction = armor / (armor + armorK) */
  armorK: 18,
  /** Ranged damage × (1 − cover × coverDamage); hit chance − cover × coverHit */
  coverDamage: 0.6,
  coverHit: 0.4,
  defendMultiplier: 0.6,
  /** Swordsman block chance while defending */
  shieldBlockChance: 0.35,
  blockMultiplier: 0.3,
  highGround: 1.15,
  lowGroundRanged: 0.9,
  hillRangeBonus: 1,
  hitMelee: 0.95,
  hitRanged: 0.92,
  hitPerHexBeyondTwo: 0.04,
  minHit: 0.35,
  maxHit: 0.98,
  critChance: 0.07,
  critMultiplier: 1.5,
  variance: 0.1,
  poisonDamage: 5,
  poisonTurns: 2,
  counterMultiplier: 0.6,
  braceArmor: 0.3,
  shieldWallArmor: 0.6,
  braceReaction: 1.0,
  chargeBonus: 0.4,
  enrageThreshold: 0.5,
  enrageAttack: 1.3,
  overchargeMultiplier: 1.8,
  bandageHeal: 0.35,
  apPerTurn: 2,
  /** Movement points from the Phase 8 speed stat (mounted soldiers move further) */
  movePerSpeed: 8,
  minMove: 6,
  maxMove: 14,
  /** Damage multipliers: attacker class → target category */
  classVs: {
    swordsman: { undead: 1.2, human: 1.05 },
    spearman: { beast: 1.4, boss: 1.15 },
    archer: { beast: 1.15, mutant: 1.1 },
    crossbowman: { machine: 1.3, boss: 1.1 },
  } as Record<UnitTypeCode, Partial<Record<CombatCategory, number>>>,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Skills
// ─────────────────────────────────────────────────────────────────────────────
export type BattleSkillCode = 'shield_wall' | 'brace' | 'aimed_shot' | 'volley' | 'piercing_bolt' | 'acid_spit' | 'overcharge' | 'ground_slam';
export type SkillTarget = 'self' | 'enemy' | 'area';

export interface BattleSkillDefinition {
  code: BattleSkillCode;
  name: string;
  description: string;
  ap: number;
  cooldown: number;
  target: SkillTarget;
  /** Damage multiplier (attack skills) */
  multiplier: number;
  /** Area radius (area skills) */
  radius: number;
  /** Uses the unit's range unless set */
  range?: [number, number];
  /** Cinematic close-up on the client */
  cinematic: boolean;
}

export const BATTLE_SKILLS: Record<BattleSkillCode, BattleSkillDefinition> = {
  shield_wall: { code: 'shield_wall', name: 'Tường khiên', description: 'Giáp +60% đến lượt sau và phản đòn mọi đòn cận chiến (60%).', ap: 1, cooldown: 3, target: 'self', multiplier: 0, radius: 0, cinematic: false },
  brace: { code: 'brace', name: 'Giữ đội hình', description: 'Chống thương: giáp +30% cho mình và đồng đội kề bên; đâm ngay kẻ đầu tiên áp sát (thú hoang ×1.5).', ap: 1, cooldown: 2, target: 'self', multiplier: 1, radius: 1, cinematic: false },
  aimed_shot: { code: 'aimed_shot', name: 'Bắn tập trung', description: 'Một mũi tên ngắm kỹ: sát thương ×1.6, dễ trúng hơn.', ap: 2, cooldown: 2, target: 'enemy', multiplier: 1.6, radius: 0, cinematic: true },
  volley: { code: 'volley', name: 'Mưa tên', description: 'Bắn vào một vùng bán kính 1: mọi kẻ địch trong vùng nhận 65% sát thương.', ap: 2, cooldown: 3, target: 'area', multiplier: 0.65, radius: 1, cinematic: true },
  piercing_bolt: { code: 'piercing_bolt', name: 'Nỏ xuyên giáp', description: 'Bỏ qua toàn bộ giáp (×1.25) và xuyên tiếp kẻ đứng sau.', ap: 1, cooldown: 3, target: 'enemy', multiplier: 1.25, radius: 0, cinematic: true },
  acid_spit: { code: 'acid_spit', name: 'Phun axit', description: 'Vùng bán kính 1: 70% sát thương và nhiễm độc.', ap: 2, cooldown: 2, target: 'area', multiplier: 0.7, radius: 1, cinematic: false },
  overcharge: { code: 'overcharge', name: 'Quá tải', description: 'Đòn kế tiếp ×1.8.', ap: 1, cooldown: 3, target: 'self', multiplier: 0, radius: 0, cinematic: false },
  ground_slam: { code: 'ground_slam', name: 'Dậm đất', description: 'Mọi kẻ kề bên nhận 90% sát thương và bị choáng 1 lượt.', ap: 2, cooldown: 2, target: 'self', multiplier: 0.9, radius: 1, cinematic: true },
};

export type BattleStatusCode = 'poison' | 'stun' | 'defending' | 'shield_wall' | 'braced' | 'overcharged' | 'enraged';
export const BATTLE_STATUS_LABELS: Record<BattleStatusCode, string> = {
  poison: 'Nhiễm độc',
  stun: 'Choáng',
  defending: 'Phòng thủ',
  shield_wall: 'Tường khiên',
  braced: 'Giữ đội hình',
  overcharged: 'Quá tải',
  enraged: 'Cuồng nộ',
};

// ─────────────────────────────────────────────────────────────────────────────
// Player classes on the battlefield (stats come from Phase 8 unitStats)
// ─────────────────────────────────────────────────────────────────────────────
export interface BattleClassRule {
  minRange: number;
  maxRange: number;
  /** Crossbows: a shot needs a loaded bolt; reloading costs an action point */
  needsReload: boolean;
  skills: readonly BattleSkillCode[];
  role: string;
}

export const BATTLE_CLASS_RULES: Record<UnitTypeCode, BattleClassRule> = {
  swordsman: { minRange: 1, maxRange: 1, needsReload: false, skills: ['shield_wall'], role: 'Cận chiến, khiên, chống chịu, phản công' },
  spearman: { minRange: 1, maxRange: 2, needsReload: false, skills: ['brace'], role: 'Thương dài (2 ô), chống kỵ / thú, giữ đội hình' },
  archer: { minRange: 2, maxRange: 6, needsReload: false, skills: ['aimed_shot', 'volley'], role: 'Bắn xa linh hoạt, bắn tập trung / mưa tên' },
  crossbowman: { minRange: 2, maxRange: 5, needsReload: true, skills: ['piercing_bolt'], role: 'Xuyên giáp mạnh, phải nạp lại sau mỗi phát' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Enemies
// ─────────────────────────────────────────────────────────────────────────────
export type EnemyGroup = 'wildlife' | 'zombie' | 'mutant' | 'bandit' | 'robot' | 'boss';
export type EnemyCode = 'wolf' | 'zombie' | 'spitter' | 'bandit' | 'bandit_archer' | 'robot' | 'behemoth';
/** Utility-AI personality */
export type EnemyBehavior = 'hunter' | 'swarm' | 'ranged' | 'cautious' | 'heavy' | 'boss';

export interface EnemyDefinition {
  code: EnemyCode;
  group: EnemyGroup;
  name: string;
  category: CombatCategory;
  hp: number;
  armor: number;
  attack: number;
  minRange: number;
  maxRange: number;
  move: number;
  ap: number;
  pierce: number;
  skills: readonly BattleSkillCode[];
  /** Passive traits */
  traits: readonly ('charge' | 'bite' | 'enrage')[];
  behavior: EnemyBehavior;
  /** Danger rating for the player HUD and for player-side autopilot target choice */
  threat: number;
}

export const ENEMY_DEFINITIONS: Record<EnemyCode, EnemyDefinition> = {
  wolf: { code: 'wolf', group: 'wildlife', name: 'Sói hoang', category: 'beast', hp: 48, armor: 2, attack: 13, minRange: 1, maxRange: 1, move: 12, ap: 2, pierce: 0, skills: [], traits: ['charge'], behavior: 'hunter', threat: 3 },
  zombie: { code: 'zombie', group: 'zombie', name: 'Zombie chibi', category: 'undead', hp: 62, armor: 1, attack: 11, minRange: 1, maxRange: 1, move: 5, ap: 2, pierce: 0, skills: [], traits: ['bite'], behavior: 'swarm', threat: 2 },
  spitter: { code: 'spitter', group: 'mutant', name: 'Sinh vật phun axit', category: 'mutant', hp: 52, armor: 3, attack: 12, minRange: 2, maxRange: 4, move: 7, ap: 2, pierce: 0, skills: ['acid_spit'], traits: [], behavior: 'ranged', threat: 4 },
  bandit: { code: 'bandit', group: 'bandit', name: 'Kẻ cướp', category: 'human', hp: 58, armor: 5, attack: 14, minRange: 1, maxRange: 1, move: 8, ap: 2, pierce: 0, skills: [], traits: [], behavior: 'cautious', threat: 3 },
  bandit_archer: { code: 'bandit_archer', group: 'bandit', name: 'Cung thủ cướp', category: 'human', hp: 46, armor: 3, attack: 13, minRange: 2, maxRange: 5, move: 8, ap: 2, pierce: 0, skills: [], traits: [], behavior: 'cautious', threat: 4 },
  robot: { code: 'robot', group: 'robot', name: 'Robot tàn dư', category: 'machine', hp: 85, armor: 12, attack: 16, minRange: 2, maxRange: 5, move: 6, ap: 2, pierce: 0.3, skills: ['overcharge'], traits: [], behavior: 'heavy', threat: 6 },
  behemoth: { code: 'behemoth', group: 'boss', name: 'Vua đột biến', category: 'boss', hp: 380, armor: 9, attack: 24, minRange: 1, maxRange: 1, move: 7, ap: 2, pierce: 0.1, skills: ['ground_slam'], traits: ['enrage'], behavior: 'boss', threat: 10 },
};

export const ENEMY_GROUP_LABELS: Record<EnemyGroup, string> = {
  wildlife: 'Sinh vật hoang dã',
  zombie: 'Zombie chibi',
  mutant: 'Sinh vật đột biến',
  bandit: 'Kẻ cướp',
  robot: 'Robot / tàn dư quân sự',
  boss: 'Boss',
};

export const CAPTIVE = { hp: 45, name: 'Người sống sót' } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Missions
// ─────────────────────────────────────────────────────────────────────────────
export type MissionCode = 'rescue_survivors' | 'reclaim_ruins' | 'mutant_boss' | 'pvp_duel';
export type MissionObjective = 'rescue' | 'hold' | 'boss' | 'duel';

export interface MissionReward {
  /** coins / wood / stone */
  resources: ResourceBag;
  /** Other goods into city storage (tools, planks, eq_* …) */
  goods: Record<string, number>;
  /** Rescued people who join the city */
  survivors: number;
  xp: number;
}

export interface MissionDefinition {
  code: MissionCode;
  name: string;
  description: string;
  objective: MissionObjective;
  objectiveText: string;
  minUnits: number;
  maxUnits: number;
  /** Mission that must have been won before */
  requires: MissionCode | null;
  /** Exploration (Phase 10) points of interest this mission clears */
  poiKinds: readonly string[];
  enemies: readonly EnemyCode[];
  captives: number;
  capturePoints: number;
  turnLimit: number;
  /** Real-time minutes before the same mission can be played again after a victory */
  cooldownMinutes: number;
  /** Enemy scaling for this mission (balance knob) */
  difficulty: { hp: number; attack: number };
  reward: MissionReward;
}

export const MISSIONS: readonly MissionDefinition[] = [
  {
    code: 'rescue_survivors',
    name: 'Giải cứu người sống sót',
    description: 'Một nhóm kẻ cướp và sói hoang đang vây những người sống sót trong làng đổ nát.',
    objective: 'rescue',
    objectiveText: 'Đến cạnh từng người sống sót và giải cứu họ (3 người). Thua nếu cả đội gục hoặc 2 người bị hạ.',
    minUnits: 3,
    maxUnits: 6,
    requires: null,
    poiKinds: ['enemy_base'],
    enemies: ['bandit', 'bandit', 'bandit_archer', 'bandit_archer', 'wolf', 'wolf'],
    captives: 3,
    capturePoints: 0,
    turnLimit: 14,
    cooldownMinutes: 10,
    difficulty: { hp: 1.15, attack: 1.45 },
    reward: { resources: { coins: 300, wood: 80, stone: 40 }, goods: { tools: 4 }, survivors: 3, xp: 40 },
  },
  {
    code: 'reclaim_ruins',
    name: 'Chiếm lại phế tích',
    description: 'Phế tích kho quân sự cũ bị zombie, sinh vật đột biến và một robot tàn dư chiếm giữ.',
    objective: 'hold',
    objectiveText: 'Đứng giữ cả 2 công sự (không địch kề bên) khi kết thúc lượt, hoặc hạ hết địch.',
    minUnits: 4,
    maxUnits: 6,
    requires: null,
    poiKinds: ['ruins'],
    enemies: ['zombie', 'zombie', 'zombie', 'zombie', 'spitter', 'spitter', 'robot'],
    captives: 0,
    capturePoints: 2,
    turnLimit: 16,
    cooldownMinutes: 10,
    difficulty: { hp: 1.25, attack: 1.55 },
    reward: { resources: { coins: 400, wood: 0, stone: 220 }, goods: { planks: 60, tools: 8, eq_leather_armor: 2 }, survivors: 0, xp: 60 },
  },
  {
    code: 'mutant_boss',
    name: 'Vua đột biến trong sương độc',
    description: 'Sinh vật đột biến khổng lồ và bầy hộ vệ ẩn trong khu nhiễm độc.',
    objective: 'boss',
    objectiveText: 'Hạ Vua đột biến. Cẩn thận đòn dậm đất và cơn cuồng nộ khi nó yếu máu.',
    minUnits: 5,
    maxUnits: 6,
    requires: 'reclaim_ruins',
    poiKinds: ['toxic_zone'],
    enemies: ['behemoth', 'spitter', 'spitter', 'zombie', 'zombie', 'wolf', 'wolf'],
    captives: 0,
    capturePoints: 0,
    turnLimit: 18,
    cooldownMinutes: 15,
    difficulty: { hp: 1.2, attack: 1.45 },
    reward: { resources: { coins: 1200, wood: 0, stone: 300 }, goods: { tools: 15, eq_iron_armor: 2, eq_crossbow: 2, eq_bolts: 4 }, survivors: 0, xp: 100 },
  },
];

/** Phase 12: the symmetric PvP arena (not a PvE mission, not listed in MISSIONS). */
export const PVP_MISSION: MissionDefinition = {
  code: 'pvp_duel',
  name: 'Đấu trường PvP',
  description: 'Hai đội lính của hai người chơi trên đấu trường đối xứng.',
  objective: 'duel',
  objectiveText: 'Hạ toàn bộ đội đối thủ. Hết lượt: bên còn nhiều máu hơn (tỉ lệ) thắng.',
  minUnits: 3,
  maxUnits: 6,
  requires: null,
  poiKinds: [],
  enemies: [],
  captives: 0,
  capturePoints: 0,
  turnLimit: 20,
  cooldownMinutes: 0,
  difficulty: { hp: 1, attack: 1 },
  reward: { resources: { coins: 0, wood: 0, stone: 0 }, goods: {}, survivors: 0, xp: 50 },
};
/** Seconds a PvP player has for a turn before the server ends it for them. */
export const PVP_TURN_SECONDS = 90;
/** A PvP player disconnected this long during their own turn forfeits. */
export const PVP_FORFEIT_SECONDS = 180;

export function getMission(code: MissionCode): MissionDefinition {
  if (code === 'pvp_duel') return PVP_MISSION;
  const m = MISSIONS.find((x) => x.code === code);
  if (!m) throw new Error(`Unknown mission: ${code}`);
  return m;
}

/** Real-time hours after which an untouched battle counts as abandoned (defeat, no rewards). */
export const BATTLE_ABANDON_HOURS = 24;
export const BATTLE_MAP_RADIUS = 7;
/** Bandages issued per battle (+1 per 3 soldiers) */
export const baseBandages = (units: number): number => 2 + Math.floor(units / 3);
