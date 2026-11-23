/**
 * Turn-based hex tactical battle engine (Phase 11) — pure and deterministic.
 *
 * The SERVER runs it: every action is validated here (unit ownership, phase, action points,
 * movement budget, range, line of sight, cooldowns, ammo) and all randomness (hit, crit,
 * block, variance) comes from a seeded stream stored in the state, so the client can never
 * send its own damage or rewards. The client calls the read-only helpers (reachable tiles,
 * paths, targets, previews) to draw highlights, then replays the returned events.
 *
 * Turn state machine:
 *   deployment ──start──▶ player ──end_turn──▶ (enemy AI resolves) ──▶ player (turn+1) …
 *        any action / end of turn may end the battle ──▶ victory | defeat
 */
import { hexDisk, hexDistance, hexKey, hexNeighbors, hexRound, type AxialCoord } from '../hex/hexMath.js';
import type { UnitStats, UnitTypeCode } from '../military/definitions.js';
import {
  BATTLE_BALANCE,
  BATTLE_CLASS_RULES,
  BATTLE_MAP_RADIUS,
  BATTLE_SKILLS,
  CAPTIVE,
  ENEMY_DEFINITIONS,
  TERRAIN_DEFINITIONS,
  baseBandages,
  getMission,
  type BattleSkillCode,
  type BattleStatusCode,
  type BattleTerrain,
  type CombatCategory,
  type EnemyBehavior,
  type EnemyCode,
  type MissionCode,
  type MissionObjective,
} from './definitions.js';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
export type BattleSide = 'player' | 'enemy' | 'neutral';
export type BattlePhase = 'deployment' | 'player' | 'victory' | 'defeat';

export interface BattleTile extends AxialCoord {
  terrain: BattleTerrain;
  height: number;
}

export interface BattleStatus {
  code: BattleStatusCode;
  turns: number;
}

export interface BattleUnit extends AxialCoord {
  id: string;
  side: BattleSide;
  kind: UnitTypeCode | EnemyCode | 'captive';
  name: string;
  /** military_units.id for soldiers */
  sourceId: string | null;
  rank: number;
  category: CombatCategory;
  behavior: EnemyBehavior | 'soldier' | 'captive';
  hp: number;
  maxHp: number;
  armor: number;
  attack: number;
  pierce: number;
  minRange: number;
  maxRange: number;
  /** Movement points per turn / left this turn */
  move: number;
  mpLeft: number;
  ap: number;
  maxAp: number;
  skills: BattleSkillCode[];
  cooldowns: Partial<Record<BattleSkillCode, number>>;
  statuses: BattleStatus[];
  traits: string[];
  needsReload: boolean;
  loaded: boolean;
  hexesMoved: number;
  braceUsed: boolean;
  threat: number;
  mounted: boolean;
  ko: boolean;
  freed: boolean;
  kills: number;
  damageDealt: number;
  damageTaken: number;
}

export interface BattleObjectives {
  kind: MissionObjective;
  captives: string[];
  freed: number;
  lost: number;
  points: AxialCoord[];
  bossId: string | null;
}

export type BattleEndReason = 'objective' | 'all_enemies' | 'wiped' | 'captives_lost' | 'time' | 'retreat' | 'abandoned' | 'forfeit';

export interface BattleOutcome {
  /** From the 'player' side's point of view (PvE: you; PvP: the host) */
  result: 'victory' | 'defeat';
  reason: BattleEndReason;
  turn: number;
  stars: number;
  /** Winning side (null = draw, PvP only) */
  winner?: 'player' | 'enemy' | null;
}

export interface BattleState {
  v: 1;
  mission: MissionCode;
  seed: number;
  /** Random draws made so far (the RNG stream position) */
  draws: number;
  phase: BattlePhase;
  turn: number;
  turnLimit: number;
  radius: number;
  tiles: BattleTile[];
  units: BattleUnit[];
  objectives: BattleObjectives;
  items: { bandage: number };
  deployZone: AxialCoord[];
  outcome: BattleOutcome | null;
  version: number;
  /** Phase 12: 'pvp' = two human sides taking turns (no AI); undefined = PvE */
  mode?: 'pve' | 'pvp';
  /** PvP: whose turn it is */
  activeSide?: 'player' | 'enemy';
  /** PvP: the guest side's own bandages */
  itemsB?: { bandage: number };
}

export type BattleAction =
  | { type: 'deploy'; unitId: string; to: AxialCoord }
  | { type: 'start' }
  | { type: 'move'; unitId: string; to: AxialCoord }
  | { type: 'attack'; unitId: string; targetId: string }
  | { type: 'skill'; unitId: string; skill: BattleSkillCode; targetId?: string; at?: AxialCoord }
  | { type: 'defend'; unitId: string }
  | { type: 'item'; unitId: string; item: 'bandage'; targetId?: string }
  | { type: 'reload'; unitId: string }
  | { type: 'interact'; unitId: string; targetId: string }
  | { type: 'end_turn' }
  | { type: 'retreat' };

export type BattleEvent =
  | { type: 'deploy'; unitId: string; to: AxialCoord }
  | { type: 'start'; turn: number }
  | { type: 'move'; unitId: string; path: AxialCoord[] }
  | {
      type: 'attack';
      unitId: string;
      targetId: string;
      skill: BattleSkillCode | null;
      hit: boolean;
      crit: boolean;
      blocked: boolean;
      damage: number;
      ko: boolean;
      /** counter = shield-wall riposte, reaction = brace strike */
      counter: boolean;
      reaction: boolean;
    }
  | { type: 'skill'; unitId: string; skill: BattleSkillCode; at: AxialCoord | null; targetId: string | null }
  | { type: 'status'; unitId: string; status: BattleStatusCode; turns: number }
  | { type: 'poison'; unitId: string; damage: number; ko: boolean }
  | { type: 'heal'; unitId: string; by: string; amount: number }
  | { type: 'defend'; unitId: string }
  | { type: 'reload'; unitId: string }
  | { type: 'free'; unitId: string; captiveId: string }
  | { type: 'stunned'; unitId: string }
  | { type: 'turn'; side: 'player' | 'enemy'; turn: number }
  | { type: 'outcome'; result: 'victory' | 'defeat'; reason: BattleEndReason; stars: number };

export class BattleRuleError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function fail(code: string, message: string): never {
  throw new BattleRuleError(code, message);
}

const key = (h: AxialCoord): string => hexKey(h.q, h.r);
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic randomness
// ─────────────────────────────────────────────────────────────────────────────
function mulberry(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Next value of the battle's random stream (stored in the state → reproducible on the server). */
function draw(s: BattleState): number {
  s.draws += 1;
  return mulberry(s.seed ^ Math.imul(s.draws, 0x9e3779b1));
}

function streamRng(seed: number): () => number {
  let i = 0;
  return () => mulberry(seed ^ Math.imul((i += 1), 0x85ebca6b));
}

// ─────────────────────────────────────────────────────────────────────────────
// Map
// ─────────────────────────────────────────────────────────────────────────────
export interface GeneratedMap {
  tiles: BattleTile[];
  deployZone: AxialCoord[];
  enemySpawns: AxialCoord[];
  captiveTiles: AxialCoord[];
  points: AxialCoord[];
}

const tile = (q: number, r: number, terrain: BattleTerrain): BattleTile => ({ q, r, terrain, height: TERRAIN_DEFINITIONS[terrain].height });

/**
 * Mission battlefield on a radius-7 hex disk: player deployment in the south rows, enemies in
 * the north; mission features (captive camp, capture forts, toxic boss arena) plus forests,
 * rocks, hills, a pond and a winding road. Every passable tile is reachable from the
 * deployment zone (pockets become rock), so no unit — player or AI — can be stranded.
 */
export function generateBattleMap(mission: MissionCode, seed: number, enemyCount = 7, captives = 0): GeneratedMap {
  const R = BATTLE_MAP_RADIUS;
  const rng = streamRng(seed);
  const map = new Map<string, BattleTile>();
  for (const h of hexDisk({ q: 0, r: 0 }, R)) map.set(key(h), tile(h.q, h.r, 'ground'));
  const set = (h: AxialCoord, t: BattleTerrain): void => {
    const cur = map.get(key(h));
    if (cur) map.set(key(h), tile(h.q, h.r, t));
  };
  const randHex = (rMin: number, rMax: number): AxialCoord => {
    for (let i = 0; i < 50; i += 1) {
      const r = rMin + Math.floor(rng() * (rMax - rMin + 1));
      const q = -R + Math.floor(rng() * (2 * R + 1));
      if (map.has(key({ q, r }))) return { q, r };
    }
    return { q: 0, r: 0 };
  };
  const cluster = (c: AxialCoord, radius: number, t: BattleTerrain, p: number): void => {
    for (const h of hexDisk(c, radius)) if (rng() < (hexDistance(c, h) === 0 ? 1 : p)) set(h, t);
  };

  // Scenery
  for (let i = 0; i < 3; i += 1) cluster(randHex(-4, 4), 1 + Math.floor(rng() * 2), 'forest', 0.65);
  for (let i = 0; i < 2; i += 1) cluster(randHex(-3, 3), 1, 'hill', 0.6);
  for (let i = 0; i < 5; i += 1) set(randHex(-5, 4), 'rock');
  if (mission !== 'mutant_boss') cluster(randHex(-2, 2), 1, 'water', 0.5);
  // Winding road from the south edge to the north edge.
  let cur: AxialCoord = { q: -Math.floor(R / 2), r: R };
  for (let guard = 0; guard < 40 && cur.r > -R; guard += 1) {
    set(cur, 'road');
    const next = hexNeighbors(cur)
      .filter((n) => map.has(key(n)) && n.r < cur.r)
      .sort((a, b) => a.q + a.r * 0.1 + (rng() - 0.5) * 2.5 - (b.q + b.r * 0.1 + (rng() - 0.5) * 2.5));
    if (!next.length) break;
    cur = next[0];
  }

  // Mission features
  const captiveTiles: AxialCoord[] = [];
  const points: AxialCoord[] = [];
  if (mission === 'rescue_survivors') {
    const camp = [{ q: 0, r: -4 }, { q: -2, r: -3 }, { q: 3, r: -5 }];
    for (const c of camp.slice(0, Math.max(1, captives))) {
      for (const n of hexNeighbors(c)) if (rng() < 0.45) set(n, 'ruins');
      set(c, 'ground');
      captiveTiles.push(c);
    }
  } else if (mission === 'reclaim_ruins') {
    for (const p of [{ q: -3, r: 0 }, { q: 3, r: -1 }]) {
      for (const n of hexNeighbors(p)) if (rng() < 0.5) set(n, rng() < 0.6 ? 'ruins' : 'fort');
      set(p, 'fort');
      points.push(p);
    }
    for (let i = 0; i < 2; i += 1) cluster(randHex(-3, 2), 1, 'toxic', 0.5);
  } else if (mission === 'mutant_boss') {
    for (let i = 0; i < 4; i += 1) cluster(randHex(-5, 3), 1, 'toxic', 0.55);
    for (const q of [-3, -2, 2, 3]) set({ q, r: -5 }, 'rock');
  } else {
    // PvP arena: clear lanes, a fort on each flank, then mirror the south half onto the north
    // (point symmetry) so neither side gets a better battlefield.
    for (const t of map.values()) if (t.terrain === 'water' || t.terrain === 'road') set(t, 'ground');
    set({ q: -4, r: 2 }, 'fort');
    set({ q: 4, r: -2 }, 'fort');
    for (const t of [...map.values()]) {
      if (t.r < 0 || (t.r === 0 && t.q < 0)) {
        const m = map.get(key({ q: -t.q, r: -t.r }));
        if (m) set(t, m.terrain);
      }
    }
  }

  // Deployment rows (south) are clear; enemy spawns in the north rows.
  const deployZone: AxialCoord[] = [];
  for (const t of map.values()) {
    if (t.r >= R - 1) {
      set(t, t.terrain === 'road' ? 'road' : 'ground');
      deployZone.push({ q: t.q, r: t.r });
    }
  }
  const blocked = new Set([...captiveTiles, ...points].map(key));
  const spawnPool = [...map.values()]
    .filter((t) => t.r <= -2 && !blocked.has(key(t)) && !captiveTiles.some((c) => hexDistance(c, t) === 0))
    .sort((a, b) => a.r - b.r || a.q - b.q);
  const enemySpawns: AxialCoord[] = [];
  if (mission === 'pvp_duel') {
    // The guest deploys in the mirrored north rows.
    for (const t of map.values()) {
      if (t.r <= -(R - 1)) {
        set(t, 'ground');
        enemySpawns.push({ q: t.q, r: t.r });
      }
    }
    enemySpawns.sort((a, b) => b.r - a.r || Math.abs(a.q + a.r / 2) - Math.abs(b.q + b.r / 2));
  }
  const preferred = mission === 'mutant_boss' ? [{ q: 0, r: -4 }] : mission === 'reclaim_ruins' ? points.flatMap((p) => hexNeighbors(p)) : captiveTiles.flatMap((c) => hexNeighbors(c));
  for (const p of mission === 'pvp_duel' ? [] : [...preferred, ...spawnPool.sort(() => rng() - 0.5)]) {
    if (enemySpawns.length >= enemyCount) break;
    if (!map.has(key(p)) || blocked.has(key(p)) || enemySpawns.some((e) => key(e) === key(p))) continue;
    if (p.r > 0) continue;
    set(p, map.get(key(p))!.terrain === 'fort' ? 'fort' : map.get(key(p))!.terrain === 'ruins' ? 'ground' : passableOr(map.get(key(p))!.terrain));
    enemySpawns.push({ q: p.q, r: p.r });
  }

  // Connectivity: carve corridors to every important tile, then fill unreachable pockets.
  const reachable = (): Set<string> => {
    const seen = new Set<string>(deployZone.map(key));
    const queue = [...deployZone];
    while (queue.length) {
      const c = queue.shift()!;
      for (const n of hexNeighbors(c)) {
        const t = map.get(key(n));
        if (!t || seen.has(key(n)) || !TERRAIN_DEFINITIONS[t.terrain].passable) continue;
        seen.add(key(n));
        queue.push(n);
      }
    }
    return seen;
  };
  for (const target of [...enemySpawns, ...captiveTiles, ...points]) {
    let seen = reachable();
    if (seen.has(key(target))) continue;
    let c = target;
    for (let guard = 0; guard < 30 && !seen.has(key(c)); guard += 1) {
      set(c, map.get(key(c))!.terrain === 'fort' ? 'fort' : 'ground');
      const next = hexNeighbors(c)
        .filter((n) => map.has(key(n)))
        .sort((a, b) => hexDistance(a, { q: 0, r: R }) - hexDistance(b, { q: 0, r: R }))[0];
      if (!next) break;
      c = next;
      seen = reachable();
      if (!TERRAIN_DEFINITIONS[map.get(key(c))!.terrain].passable) set(c, 'ground');
    }
  }
  const seen = reachable();
  for (const t of map.values()) if (TERRAIN_DEFINITIONS[t.terrain].passable && !seen.has(key(t))) set(t, 'rock');

  const tiles = [...map.values()].sort((a, b) => a.r - b.r || a.q - b.q);
  return { tiles, deployZone, enemySpawns, captiveTiles, points };
}

function passableOr(t: BattleTerrain): BattleTerrain {
  return TERRAIN_DEFINITIONS[t].passable ? t : 'ground';
}

// ─────────────────────────────────────────────────────────────────────────────
// Creation
// ─────────────────────────────────────────────────────────────────────────────
export interface RosterEntry {
  sourceId: string;
  name: string;
  type: UnitTypeCode;
  rank: number;
  /** Phase 8 stats (already including equipment, rank and the horse) */
  stats: UnitStats;
  /** Survivor health 0..1 → starting HP share */
  health: number;
  mounted: boolean;
}

function soldierUnit(r: RosterEntry, id: string, side: 'player' | 'enemy', spot: AxialCoord): BattleUnit {
  const rule = BATTLE_CLASS_RULES[r.type];
  const move = clamp(Math.round(r.stats.speed * BATTLE_BALANCE.movePerSpeed), BATTLE_BALANCE.minMove, BATTLE_BALANCE.maxMove);
  const maxHp = Math.round(r.stats.hp);
  return {
      id,
      side,
      kind: r.type,
      name: r.name,
      sourceId: r.sourceId,
      rank: r.rank,
      category: 'human',
      behavior: 'soldier',
      q: spot.q,
      r: spot.r,
      hp: Math.max(1, Math.round(maxHp * clamp(r.health, 0.3, 1))),
      maxHp,
      armor: r.stats.defense,
      attack: r.stats.attack,
      pierce: r.stats.armorPierce,
      minRange: rule.minRange,
      maxRange: rule.maxRange,
      move,
      mpLeft: move,
      ap: BATTLE_BALANCE.apPerTurn,
      maxAp: BATTLE_BALANCE.apPerTurn,
      skills: [...rule.skills],
      cooldowns: {},
      statuses: [],
      traits: [],
      needsReload: rule.needsReload,
      loaded: true,
      hexesMoved: 0,
      braceUsed: false,
      threat: Math.round(r.stats.attack / 4 + (rule.maxRange > 1 ? 2 : 0)),
      mounted: r.mounted,
      ko: false,
      freed: false,
      kills: 0,
      damageDealt: 0,
      damageTaken: 0,
  };
}

export function createBattleState(mission: MissionCode, seed: number, roster: readonly RosterEntry[]): BattleState {
  const def = getMission(mission);
  const map = generateBattleMap(mission, seed, def.enemies.length, def.captives);
  const units: BattleUnit[] = [];
  // Soldiers: spread over the deployment rows, front row first.
  const deploy = [...map.deployZone].sort((a, b) => a.r - b.r || Math.abs(a.q + a.r / 2) - Math.abs(b.q + b.r / 2));
  roster.forEach((r, i) => units.push(soldierUnit(r, `p${i + 1}`, 'player', deploy[i * 2 < deploy.length ? i * 2 : i])));
  def.enemies.forEach((code, i) => {
    const e = ENEMY_DEFINITIONS[code];
    const spot = map.enemySpawns[i] ?? map.enemySpawns[map.enemySpawns.length - 1];
    units.push({
      id: `e${i + 1}`,
      side: 'enemy',
      kind: code,
      name: e.name,
      sourceId: null,
      rank: 1,
      category: e.category,
      behavior: e.behavior,
      q: spot.q,
      r: spot.r,
      hp: Math.round(e.hp * def.difficulty.hp),
      maxHp: Math.round(e.hp * def.difficulty.hp),
      armor: e.armor,
      attack: Math.round(e.attack * def.difficulty.attack),
      pierce: e.pierce,
      minRange: e.minRange,
      maxRange: e.maxRange,
      move: e.move,
      mpLeft: e.move,
      ap: e.ap,
      maxAp: e.ap,
      skills: [...e.skills],
      cooldowns: {},
      statuses: [],
      traits: [...e.traits],
      needsReload: false,
      loaded: true,
      hexesMoved: 0,
      braceUsed: false,
      threat: e.threat,
      mounted: false,
      ko: false,
      freed: false,
      kills: 0,
      damageDealt: 0,
      damageTaken: 0,
    });
  });
  const captiveIds: string[] = [];
  map.captiveTiles.forEach((c, i) => {
    const id = `c${i + 1}`;
    captiveIds.push(id);
    units.push({
      id,
      side: 'neutral',
      kind: 'captive',
      name: `${CAPTIVE.name} ${i + 1}`,
      sourceId: null,
      rank: 0,
      category: 'civilian',
      behavior: 'captive',
      q: c.q,
      r: c.r,
      hp: CAPTIVE.hp,
      maxHp: CAPTIVE.hp,
      armor: 0,
      attack: 0,
      pierce: 0,
      minRange: 0,
      maxRange: 0,
      move: 0,
      mpLeft: 0,
      ap: 0,
      maxAp: 0,
      skills: [],
      cooldowns: {},
      statuses: [],
      traits: [],
      needsReload: false,
      loaded: false,
      hexesMoved: 0,
      braceUsed: false,
      threat: 0,
      mounted: false,
      ko: false,
      freed: false,
      kills: 0,
      damageDealt: 0,
      damageTaken: 0,
    });
  });
  return {
    v: 1,
    mission,
    seed,
    draws: 0,
    phase: 'deployment',
    turn: 0,
    turnLimit: def.turnLimit,
    radius: BATTLE_MAP_RADIUS,
    tiles: map.tiles,
    units,
    objectives: {
      kind: def.objective,
      captives: captiveIds,
      freed: 0,
      lost: 0,
      points: map.points,
      bossId: def.objective === 'boss' ? (units.find((u) => u.kind === 'behemoth')?.id ?? null) : null,
    },
    items: { bandage: baseBandages(roster.length) },
    deployZone: map.deployZone,
    outcome: null,
    version: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only queries (used by the client for highlights and by the AI)
// ─────────────────────────────────────────────────────────────────────────────
const tileIndex = new WeakMap<BattleTile[], Map<string, BattleTile>>();

export function tileAt(s: BattleState, h: AxialCoord): BattleTile | undefined {
  let idx = tileIndex.get(s.tiles);
  if (!idx) {
    idx = new Map(s.tiles.map((t) => [key(t), t]));
    tileIndex.set(s.tiles, idx);
  }
  return idx.get(key(h));
}

/** A unit standing on the hex (KO'd and freed units no longer occupy the battlefield). */
export function unitAt(s: BattleState, h: AxialCoord): BattleUnit | undefined {
  return s.units.find((u) => !u.ko && !u.freed && u.q === h.q && u.r === h.r);
}

export const isActive = (u: BattleUnit): boolean => !u.ko && !u.freed;
export const hasStatus = (u: BattleUnit, code: BattleStatusCode): boolean => u.statuses.some((x) => x.code === code);

export function getUnit(s: BattleState, id: string): BattleUnit | undefined {
  return s.units.find((u) => u.id === id);
}

/** Opponents of a side (neutral captives are targets for enemies only). */
export function areFoes(a: BattleUnit, b: BattleUnit): boolean {
  if (a.side === b.side) return false;
  if (a.side === 'neutral') return false;
  if (b.side === 'neutral') return a.side === 'enemy';
  return true;
}

export interface Reach {
  cost: number;
  prev: string | null;
}

/** Dijkstra over movement points: terrain cost (+1 climbing a hill); units and obstacles block. */
export function reachable(s: BattleState, u: BattleUnit, budget = u.mpLeft): Map<string, Reach> {
  const out = new Map<string, Reach>([[key(u), { cost: 0, prev: null }]]);
  const open: { k: string; h: AxialCoord; c: number }[] = [{ k: key(u), h: { q: u.q, r: u.r }, c: 0 }];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i].c < open[bi].c) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.c > (out.get(cur.k)?.cost ?? Infinity)) continue;
    const from = tileAt(s, cur.h)!;
    for (const n of hexNeighbors(cur.h)) {
      const t = tileAt(s, n);
      if (!t) continue;
      const def = TERRAIN_DEFINITIONS[t.terrain];
      if (!def.passable) continue;
      const other = unitAt(s, n);
      if (other && other.id !== u.id) continue;
      const c = cur.c + def.cost + Math.max(0, t.height - from.height);
      if (c > budget) continue;
      const nk = key(n);
      if (c >= (out.get(nk)?.cost ?? Infinity)) continue;
      out.set(nk, { cost: c, prev: cur.k });
      open.push({ k: nk, h: n, c });
    }
  }
  return out;
}

/** Hexes the unit can move to this turn (excluding where it stands). */
export function reachableTiles(s: BattleState, unitId: string): (AxialCoord & { cost: number })[] {
  const u = getUnit(s, unitId);
  if (!u || !isActive(u) || u.ap < 1 || u.mpLeft <= 0) return [];
  return [...reachable(s, u)].filter(([k]) => k !== key(u)).map(([k, r]) => ({ ...parse(k), cost: r.cost }));
}

/** Shortest path (start → end) inside this turn's budget, or null. */
export function pathTo(s: BattleState, u: BattleUnit, to: AxialCoord): AxialCoord[] | null {
  const reach = reachable(s, u);
  if (!reach.has(key(to))) return null;
  const path: AxialCoord[] = [];
  let k: string | null = key(to);
  while (k) {
    path.unshift(parse(k));
    k = reach.get(k)!.prev;
  }
  return path;
}

function parse(k: string): AxialCoord {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
}

function lineHexes(a: AxialCoord, b: AxialCoord, nudge: number): AxialCoord[] {
  const n = hexDistance(a, b);
  const out: AxialCoord[] = [];
  for (let i = 1; i < n; i += 1) {
    const t = i / n;
    out.push(hexRound(a.q + (b.q - a.q) * t + nudge, a.r + (b.r - a.r) * t + nudge));
  }
  return out;
}

/**
 * Line of sight: rocks always block; forest / ruins block unless the shooter stands on a hill;
 * a hill in between blocks when neither end is on high ground. Both nudged rays must be clear
 * (no shooting through the corner where two walls touch). Units never block sight.
 */
export function lineOfSight(s: BattleState, a: AxialCoord, b: AxialCoord): boolean {
  if (hexDistance(a, b) <= 1) return true;
  const ha = tileAt(s, a)?.height ?? 0;
  const hb = tileAt(s, b)?.height ?? 0;
  for (const nudge of [1e-4, -1e-4]) {
    for (const h of lineHexes(a, b, nudge)) {
      const t = tileAt(s, h);
      if (!t) return false;
      const def = TERRAIN_DEFINITIONS[t.terrain];
      if (t.terrain === 'rock') return false;
      if (def.blocksSight && ha < 1) return false;
      if (t.terrain === 'hill' && ha < 1 && hb < 1) return false;
    }
  }
  return true;
}

/** Archers, crossbows, spitters, robots — spears reaching 2 hexes are still melee. */
export const isRanged = (u: Pick<BattleUnit, 'minRange'>): boolean => u.minRange >= 2;

/** Max range from a tile (ranged units gain +1 on a hill). */
export function rangeFrom(s: BattleState, u: BattleUnit, from: AxialCoord = u): number {
  const hill = (tileAt(s, from)?.height ?? 0) >= 1 && isRanged(u);
  return u.maxRange + (hill ? BATTLE_BALANCE.hillRangeBonus : 0);
}

export function inAttackRange(s: BattleState, a: BattleUnit, b: AxialCoord, from: AxialCoord = a): boolean {
  const d = hexDistance(from, b);
  return d >= a.minRange && d <= rangeFrom(s, a, from) && (d <= 1 || lineOfSight(s, from, b));
}

export interface AttackPreview {
  hitChance: number;
  /** Expected damage on a hit (no crit / variance) */
  damage: number;
  blockChance: number;
}

interface AttackOpts {
  skill?: BattleSkillCode | null;
  multiplier?: number;
  ignoreArmor?: boolean;
  from?: AxialCoord;
  counter?: boolean;
  reaction?: boolean;
}

/** Damage / hit chance before randomness — the same formula the server rolls with. */
export function previewAttack(s: BattleState, a: BattleUnit, b: BattleUnit, opts: AttackOpts = {}): AttackPreview {
  const B = BATTLE_BALANCE;
  const from = opts.from ?? a;
  const d = hexDistance(from, b);
  const ranged = d > 1 && isRanged(a);
  const ta = tileAt(s, from);
  const tb = tileAt(s, b);
  let base = a.attack * (opts.multiplier ?? 1);
  if (a.kind in BATTLE_CLASS_RULES) base *= B.classVs[a.kind as UnitTypeCode][b.category] ?? 1;
  if ((ta?.height ?? 0) > (tb?.height ?? 0)) base *= B.highGround;
  else if (ranged && (ta?.height ?? 0) < (tb?.height ?? 0)) base *= B.lowGroundRanged;
  if (hasStatus(a, 'overcharged') && !opts.counter && !opts.reaction) base *= B.overchargeMultiplier;
  if (hasStatus(a, 'enraged')) base *= B.enrageAttack;
  if (a.traits.includes('charge') && a.hexesMoved >= 2 && !ranged) base *= 1 + B.chargeBonus;
  // Armour: shield wall / brace (own or a bracing spearman next to it), minus piercing.
  let armorMult = 1;
  if (hasStatus(b, 'shield_wall')) armorMult += B.shieldWallArmor;
  if (hasStatus(b, 'braced') || s.units.some((x) => x.id !== b.id && isActive(x) && x.side === b.side && hasStatus(x, 'braced') && hexDistance(x, b) === 1)) armorMult += B.braceArmor;
  const armor = opts.ignoreArmor ? 0 : b.armor * armorMult * (1 - a.pierce);
  let dmg = base * (1 - armor / (armor + B.armorK));
  const cover = tb ? TERRAIN_DEFINITIONS[tb.terrain].cover : 0;
  if (ranged) dmg *= 1 - cover * B.coverDamage;
  if (hasStatus(b, 'defending')) dmg *= B.defendMultiplier;
  let hit = ranged ? B.hitRanged - Math.max(0, d - 2) * B.hitPerHexBeyondTwo - cover * B.coverHit : B.hitMelee;
  if (opts.skill === 'aimed_shot') hit += 0.15;
  if (opts.counter || opts.reaction) hit = Math.max(hit, 0.9);
  const shield = b.kind === 'swordsman' && (hasStatus(b, 'defending') || hasStatus(b, 'shield_wall'));
  return { hitChance: clamp(hit, B.minHit, B.maxHit), damage: Math.max(1, Math.round(dmg)), blockChance: shield ? B.shieldBlockChance : 0 };
}

/** Valid attack targets of a unit from where it stands (with previews). */
export function attackTargets(s: BattleState, unitId: string): { unit: BattleUnit; preview: AttackPreview }[] {
  const a = getUnit(s, unitId);
  if (!a || !isActive(a) || a.ap < 1 || (a.needsReload && !a.loaded)) return [];
  return s.units.filter((b) => isActive(b) && areFoes(a, b) && inAttackRange(s, a, b)).map((b) => ({ unit: b, preview: previewAttack(s, a, b) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────
function addStatus(u: BattleUnit, code: BattleStatusCode, turns: number, ev: BattleEvent[]): void {
  if (code === 'poison' && (u.category === 'undead' || u.category === 'machine' || u.category === 'mutant' || u.category === 'boss')) return; // immune
  const cur = u.statuses.find((x) => x.code === code);
  if (cur) cur.turns = Math.max(cur.turns, turns);
  else u.statuses.push({ code, turns });
  ev.push({ type: 'status', unitId: u.id, status: code, turns });
}

function damage(s: BattleState, by: BattleUnit | null, u: BattleUnit, amount: number): boolean {
  const dealt = Math.min(u.hp, amount);
  u.hp -= dealt;
  u.damageTaken += dealt;
  if (by) by.damageDealt += dealt;
  if (u.hp <= 0) {
    u.hp = 0;
    u.ko = true;
    if (by) by.kills += 1;
    if (u.kind === 'captive') s.objectives.lost += 1;
    return true;
  }
  return false;
}

/** One resolved strike (rolls hit / crit / block / variance from the battle stream). */
function strike(s: BattleState, a: BattleUnit, b: BattleUnit, ev: BattleEvent[], opts: AttackOpts = {}): void {
  const p = previewAttack(s, a, b, opts);
  const B = BATTLE_BALANCE;
  const hit = draw(s) < p.hitChance;
  let dmg = 0;
  let crit = false;
  let blocked = false;
  let ko = false;
  if (hit) {
    crit = draw(s) < B.critChance;
    blocked = p.blockChance > 0 && draw(s) < p.blockChance;
    const variance = 1 + (draw(s) - 0.5) * 2 * B.variance;
    dmg = Math.max(1, Math.round(p.damage * variance * (crit ? B.critMultiplier : 1) * (blocked ? B.blockMultiplier : 1)));
    ko = damage(s, a, b, dmg);
  }
  ev.push({ type: 'attack', unitId: a.id, targetId: b.id, skill: opts.skill ?? null, hit, crit, blocked, damage: dmg, ko, counter: Boolean(opts.counter), reaction: Boolean(opts.reaction) });
  if (!opts.counter && !opts.reaction && hasStatus(a, 'overcharged')) a.statuses = a.statuses.filter((x) => x.code !== 'overcharged');
  if (hit && !ko && a.traits.includes('bite') && draw(s) < 0.5) addStatus(b, 'poison', B.poisonTurns, ev);
  if (hit && !ko && opts.skill === 'acid_spit') addStatus(b, 'poison', B.poisonTurns, ev);
  if (hit && !ko && opts.skill === 'ground_slam') addStatus(b, 'stun', 1, ev);
  if (hit && b.traits.includes('enrage') && !b.ko && b.hp < b.maxHp * B.enrageThreshold && !hasStatus(b, 'enraged')) {
    addStatus(b, 'enraged', 99, ev);
    b.maxAp = 3;
  }
  // Shield-wall riposte against melee attackers.
  if (!opts.counter && !opts.reaction && !b.ko && hasStatus(b, 'shield_wall') && hexDistance(a, b) === 1 && !a.ko) {
    strike(s, b, a, ev, { counter: true, multiplier: B.counterMultiplier });
  }
}

function needAp(u: BattleUnit, n: number): void {
  if (u.ap < n) fail('NO_AP', 'Không đủ điểm hành động.');
}

function controlled(s: BattleState, unitId: string | undefined, side: 'player' | 'enemy'): BattleUnit {
  const u = unitId ? getUnit(s, unitId) : undefined;
  if (!u || u.side !== side) fail('NOT_YOUR_UNIT', 'Không thể điều khiển đơn vị này.');
  if (!isActive(u)) fail('UNIT_DOWN', 'Đơn vị đã gục.');
  return u;
}

function doMove(s: BattleState, u: BattleUnit, to: AxialCoord, ev: BattleEvent[]): void {
  needAp(u, 1);
  if (u.mpLeft <= 0) fail('NO_MOVE', 'Đã hết điểm di chuyển lượt này.');
  const t = tileAt(s, to);
  if (!t) fail('OUT_OF_MAP', 'Ô ngoài chiến trường.');
  if (!TERRAIN_DEFINITIONS[t.terrain].passable) fail('BLOCKED', 'Không thể đi vào ô này.');
  if (unitAt(s, to) && !(to.q === u.q && to.r === u.r)) fail('OCCUPIED', 'Ô đã có đơn vị.');
  const path = pathTo(s, u, to);
  if (!path || path.length < 2) fail('TOO_FAR', 'Không thể đến ô này trong lượt.');
  const cost = reachable(s, u).get(key(to))!.cost;
  u.ap -= 1;
  u.mpLeft -= cost;
  // Step by step: toxic ground and bracing spearmen react as the unit passes.
  let seg: AxialCoord[] = [path[0]];
  for (const step of path.slice(1)) {
    u.q = step.q;
    u.r = step.r;
    u.hexesMoved += 1;
    seg.push(step);
    if (TERRAIN_DEFINITIONS[tileAt(s, step)!.terrain].effect === 'poison') addStatus(u, 'poison', BATTLE_BALANCE.poisonTurns, ev);
    const bracer = s.units.find((x) => isActive(x) && areFoes(x, u) && hasStatus(x, 'braced') && !x.braceUsed && hexDistance(x, u) === 1);
    if (bracer) {
      // The walk is split where the spearman strikes (the client animates both parts).
      ev.push({ type: 'move', unitId: u.id, path: seg });
      seg = [step];
      bracer.braceUsed = true;
      strike(s, bracer, u, ev, { reaction: true, multiplier: BATTLE_BALANCE.braceReaction * (u.category === 'beast' || u.mounted ? 1.5 : 1) });
      if (u.ko) break;
    }
  }
  if (seg.length > 1) ev.push({ type: 'move', unitId: u.id, path: seg });
}

function doAttack(s: BattleState, u: BattleUnit, targetId: string | undefined, ev: BattleEvent[]): void {
  const b = targetId ? getUnit(s, targetId) : undefined;
  if (!b || !isActive(b) || !areFoes(u, b)) fail('INVALID_TARGET', 'Mục tiêu không hợp lệ.');
  needAp(u, 1);
  if (u.needsReload && !u.loaded) fail('NOT_LOADED', 'Nỏ chưa nạp tên.');
  const d = hexDistance(u, b);
  if (d < u.minRange || d > rangeFrom(s, u)) fail('OUT_OF_RANGE', 'Mục tiêu ngoài tầm đánh.');
  if (!lineOfSight(s, u, b)) fail('NO_LINE_OF_SIGHT', 'Không nhìn thấy mục tiêu.');
  u.ap -= 1;
  if (u.needsReload) u.loaded = false;
  strike(s, u, b, ev);
}

function doSkill(s: BattleState, u: BattleUnit, a: Extract<BattleAction, { type: 'skill' }>, ev: BattleEvent[]): void {
  const sk = BATTLE_SKILLS[a.skill];
  if (!sk || !u.skills.includes(a.skill)) fail('UNKNOWN_SKILL', 'Đơn vị không có kỹ năng này.');
  if ((u.cooldowns[a.skill] ?? 0) > 0) fail('COOLDOWN', 'Kỹ năng chưa hồi.');
  needAp(u, sk.ap);
  const start = (at: AxialCoord | null, targetId: string | null) => {
    u.ap -= sk.ap;
    u.cooldowns[a.skill] = sk.cooldown + 1; // ticks down at the start of the unit's next turn
    ev.push({ type: 'skill', unitId: u.id, skill: a.skill, at, targetId });
  };
  switch (sk.target) {
    case 'self': {
      if (a.skill === 'ground_slam') {
        const victims = s.units.filter((x) => isActive(x) && areFoes(u, x) && hexDistance(x, u) === 1);
        if (!victims.length) fail('NO_TARGETS', 'Không có kẻ địch kề bên.');
        start({ q: u.q, r: u.r }, null);
        for (const v of victims) strike(s, u, v, ev, { skill: a.skill, multiplier: sk.multiplier });
        return;
      }
      start(null, null);
      if (a.skill === 'shield_wall') addStatus(u, 'shield_wall', 1, ev);
      if (a.skill === 'brace') {
        u.braceUsed = false;
        addStatus(u, 'braced', 1, ev);
      }
      if (a.skill === 'overcharge') addStatus(u, 'overcharged', 99, ev);
      return;
    }
    case 'enemy': {
      const b = a.targetId ? getUnit(s, a.targetId) : undefined;
      if (!b || !isActive(b) || !areFoes(u, b)) fail('INVALID_TARGET', 'Mục tiêu không hợp lệ.');
      if (u.needsReload && !u.loaded) fail('NOT_LOADED', 'Nỏ chưa nạp tên.');
      const d = hexDistance(u, b);
      if (d < u.minRange || d > rangeFrom(s, u)) fail('OUT_OF_RANGE', 'Mục tiêu ngoài tầm đánh.');
      if (!lineOfSight(s, u, b)) fail('NO_LINE_OF_SIGHT', 'Không nhìn thấy mục tiêu.');
      start({ q: b.q, r: b.r }, b.id);
      if (u.needsReload) u.loaded = false;
      const pierce = a.skill === 'piercing_bolt';
      strike(s, u, b, ev, { skill: a.skill, multiplier: sk.multiplier, ignoreArmor: pierce });
      if (pierce) {
        // The bolt carries on to the enemy right behind the target.
        const n = hexDistance(u, b);
        const behind = hexRound(u.q + ((b.q - u.q) * (n + 1)) / n, u.r + ((b.r - u.r) * (n + 1)) / n);
        const next = unitAt(s, behind);
        if (next && areFoes(u, next)) strike(s, u, next, ev, { skill: a.skill, multiplier: sk.multiplier, ignoreArmor: true });
      }
      return;
    }
    case 'area': {
      if (!a.at || !tileAt(s, a.at)) fail('INVALID_TARGET', 'Chọn vùng mục tiêu.');
      const [mn, mx] = sk.range ?? [u.minRange, rangeFrom(s, u)];
      const d = hexDistance(u, a.at);
      if (d < mn || d > mx) fail('OUT_OF_RANGE', 'Vùng ngoài tầm.');
      if (!lineOfSight(s, u, a.at)) fail('NO_LINE_OF_SIGHT', 'Không nhìn thấy vùng mục tiêu.');
      const victims = s.units.filter((x) => isActive(x) && areFoes(u, x) && x.side !== 'neutral' && hexDistance(x, a.at!) <= sk.radius);
      if (!victims.length) fail('NO_TARGETS', 'Không có kẻ địch trong vùng.');
      start(a.at, null);
      for (const v of victims) strike(s, u, v, ev, { skill: a.skill, multiplier: sk.multiplier });
      return;
    }
  }
}

function doDefend(u: BattleUnit, ev: BattleEvent[]): void {
  needAp(u, 1);
  u.ap = 0;
  addStatus(u, 'defending', 1, ev);
  ev.push({ type: 'defend', unitId: u.id });
}

function doItem(s: BattleState, u: BattleUnit, targetId: string | undefined, ev: BattleEvent[]): void {
  needAp(u, 1);
  const items = itemsOf(s, u.side);
  if (items.bandage <= 0) fail('NO_ITEMS', 'Hết băng cứu thương.');
  const t = targetId ? getUnit(s, targetId) : u;
  if (!t || !isActive(t) || t.side !== u.side || hexDistance(t, u) > 1) fail('INVALID_TARGET', 'Chỉ băng cho mình hoặc đồng đội kề bên.');
  if (t.hp >= t.maxHp && !hasStatus(t, 'poison')) fail('FULL_HP', 'Đơn vị không bị thương.');
  const amount = Math.min(t.maxHp - t.hp, Math.round(t.maxHp * BATTLE_BALANCE.bandageHeal));
  t.hp += amount;
  t.statuses = t.statuses.filter((x) => x.code !== 'poison');
  items.bandage -= 1;
  u.ap -= 1;
  ev.push({ type: 'heal', unitId: t.id, by: u.id, amount });
}

/** The bandage pouch of a side (PvP guests carry their own). */
export function itemsOf(s: BattleState, side: BattleSide): { bandage: number } {
  if (s.mode === 'pvp' && side === 'enemy') {
    s.itemsB ??= { bandage: 0 };
    return s.itemsB;
  }
  return s.items;
}

function doReload(u: BattleUnit, ev: BattleEvent[]): void {
  if (!u.needsReload) fail('NO_RELOAD', 'Vũ khí này không cần nạp.');
  if (u.loaded) fail('ALREADY_LOADED', 'Nỏ đã nạp sẵn.');
  needAp(u, 1);
  u.ap -= 1;
  u.loaded = true;
  ev.push({ type: 'reload', unitId: u.id });
}

function doInteract(s: BattleState, u: BattleUnit, targetId: string, ev: BattleEvent[]): void {
  const c = getUnit(s, targetId);
  if (!c || c.kind !== 'captive' || !isActive(c)) fail('INVALID_TARGET', 'Không có người cần giải cứu.');
  if (hexDistance(u, c) > 1) fail('OUT_OF_RANGE', 'Cần đứng cạnh người sống sót.');
  needAp(u, 1);
  u.ap -= 1;
  c.freed = true;
  s.objectives.freed += 1;
  ev.push({ type: 'free', unitId: u.id, captiveId: c.id });
}

/** Start of a side's turn: AP / movement refill, cooldowns, poison, stun, status expiry. */
function beginSide(s: BattleState, side: 'player' | 'enemy', ev: BattleEvent[]): void {
  ev.push({ type: 'turn', side, turn: s.turn });
  for (const u of s.units.filter((x) => x.side === side && isActive(x))) {
    u.ap = u.maxAp;
    u.mpLeft = u.move;
    u.hexesMoved = 0;
    for (const k of Object.keys(u.cooldowns) as BattleSkillCode[]) u.cooldowns[k] = Math.max(0, (u.cooldowns[k] ?? 0) - 1);
    if (hasStatus(u, 'poison')) {
      const ko = damage(s, null, u, BATTLE_BALANCE.poisonDamage);
      ev.push({ type: 'poison', unitId: u.id, damage: BATTLE_BALANCE.poisonDamage, ko });
      if (ko) continue;
    }
    if (hasStatus(u, 'stun')) {
      u.ap = 0;
      u.mpLeft = 0;
      ev.push({ type: 'stunned', unitId: u.id });
    }
    for (const st of u.statuses) if (st.turns < 90) st.turns -= 1;
    u.statuses = u.statuses.filter((st) => st.turns > 0);
    if (TERRAIN_DEFINITIONS[tileAt(s, u)!.terrain].effect === 'poison') addStatus(u, 'poison', BATTLE_BALANCE.poisonTurns, ev);
  }
}

function stars(s: BattleState): number {
  if (s.mode === 'pvp') return 0;
  const def = getMission(s.mission);
  const lostNone = !s.units.some((u) => u.side === 'player' && u.ko);
  return 1 + (lostNone ? 1 : 0) + (s.turn <= Math.ceil(def.turnLimit / 2) ? 1 : 0);
}

function finish(s: BattleState, result: 'victory' | 'defeat', reason: BattleEndReason, ev: BattleEvent[], winner?: 'player' | 'enemy' | null): void {
  if (s.outcome) return;
  s.phase = result;
  const w = winner === undefined ? (result === 'victory' ? 'player' : 'enemy') : winner;
  s.outcome = { result, reason, turn: s.turn, stars: result === 'victory' ? stars(s) : 0, winner: w };
  ev.push({ type: 'outcome', result, reason, stars: s.outcome.stars });
}

/** PvP: the winner when the turn limit is reached — larger share of HP left (draw if equal). */
function hpShareWinner(s: BattleState): 'player' | 'enemy' | null {
  const share = (side: BattleSide) => {
    const us = s.units.filter((u) => u.side === side);
    return us.reduce((a, u) => a + (u.ko ? 0 : u.hp / u.maxHp), 0) / Math.max(1, us.length);
  };
  const a = share('player');
  const b = share('enemy');
  if (Math.abs(a - b) < 1e-9) return null;
  return a > b ? 'player' : 'enemy';
}

function finishPvp(s: BattleState, winner: 'player' | 'enemy' | null, reason: BattleEndReason, ev: BattleEvent[]): void {
  finish(s, winner === 'player' ? 'victory' : 'defeat', reason, ev, winner);
}

/** Victory / defeat after anything that changes HP or objectives. */
export function checkOutcome(s: BattleState, ev: BattleEvent[]): void {
  if (s.outcome) return;
  const players = s.units.filter((u) => u.side === 'player' && isActive(u));
  const enemies = s.units.filter((u) => u.side === 'enemy' && isActive(u));
  const o = s.objectives;
  if (s.mode === 'pvp') {
    if (!players.length) return finishPvp(s, 'enemy', 'wiped', ev);
    if (!enemies.length) return finishPvp(s, 'player', 'all_enemies', ev);
    return;
  }
  if (!players.length) return finish(s, 'defeat', 'wiped', ev);
  if (o.kind === 'rescue') {
    if (o.lost >= 2) return finish(s, 'defeat', 'captives_lost', ev);
    if (o.freed + o.lost >= o.captives.length) return finish(s, 'victory', 'objective', ev);
  }
  if (o.kind === 'boss' && o.bossId && getUnit(s, o.bossId)?.ko) return finish(s, 'victory', 'objective', ev);
  if (!enemies.length) return finish(s, 'victory', 'all_enemies', ev);
}

/** Capture points are held when a soldier stands on each and no enemy is next to any. */
export function pointsHeld(s: BattleState): boolean {
  const pts = s.objectives.points;
  if (!pts.length) return false;
  return pts.every((p) => {
    const on = unitAt(s, p);
    return on?.side === 'player' && !s.units.some((e) => e.side === 'enemy' && isActive(e) && hexDistance(e, p) <= 1);
  });
}

// AI hook (set by ai.ts to avoid an import cycle).
let enemyPhase: ((s: BattleState, ev: BattleEvent[]) => void) | null = null;
export function registerEnemyAI(fn: (s: BattleState, ev: BattleEvent[]) => void): void {
  enemyPhase = fn;
}

/** Executes one unit action for a side (validated). Used by the player API and by the AI. */
export function executeUnitAction(s: BattleState, side: 'player' | 'enemy', a: Exclude<BattleAction, { type: 'start' | 'end_turn' | 'retreat' | 'deploy' }>, ev: BattleEvent[]): void {
  const u = controlled(s, a.unitId, side);
  switch (a.type) {
    case 'move':
      doMove(s, u, a.to, ev);
      break;
    case 'attack':
      doAttack(s, u, a.targetId, ev);
      break;
    case 'skill':
      doSkill(s, u, a, ev);
      break;
    case 'defend':
      doDefend(u, ev);
      break;
    case 'item':
      doItem(s, u, a.targetId, ev);
      break;
    case 'reload':
      doReload(u, ev);
      break;
    case 'interact':
      doInteract(s, u, a.targetId, ev);
      break;
  }
  checkOutcome(s, ev);
}

/**
 * Applies a player action and returns the NEW state plus the events to animate.
 * `end_turn` also runs the whole enemy turn (server-side AI) before the next player turn.
 */
export function applyBattleAction(original: BattleState, action: BattleAction, actor: 'player' | 'enemy' = 'player'): { state: BattleState; events: BattleEvent[] } {
  const s: BattleState = JSON.parse(JSON.stringify(original));
  const ev: BattleEvent[] = [];
  if (s.outcome || s.phase === 'victory' || s.phase === 'defeat') fail('BATTLE_FINISHED', 'Trận đã kết thúc.');
  if (s.mode === 'pvp') {
    applyPvp(s, action, actor, ev);
    s.version += 1;
    return { state: s, events: ev };
  }
  if (actor !== 'player') fail('NOT_YOUR_UNIT', 'Không thể điều khiển phe này.');
  switch (action.type) {
    case 'retreat':
      finish(s, 'defeat', 'retreat', ev);
      break;
    case 'deploy': {
      if (s.phase !== 'deployment') fail('WRONG_PHASE', 'Chỉ triển khai trước khi trận bắt đầu.');
      const u = controlled(s, action.unitId, 'player');
      if (!s.deployZone.some((h) => h.q === action.to.q && h.r === action.to.r)) fail('OUTSIDE_DEPLOY_ZONE', 'Chỉ đặt quân trong vùng triển khai.');
      const other = unitAt(s, action.to);
      if (other && other.id !== u.id) fail('OCCUPIED', 'Ô đã có đơn vị.');
      u.q = action.to.q;
      u.r = action.to.r;
      ev.push({ type: 'deploy', unitId: u.id, to: action.to });
      break;
    }
    case 'start':
      if (s.phase !== 'deployment') fail('WRONG_PHASE', 'Trận đã bắt đầu.');
      s.phase = 'player';
      s.turn = 1;
      ev.push({ type: 'start', turn: 1 });
      beginSide(s, 'player', ev);
      checkOutcome(s, ev);
      break;
    case 'end_turn': {
      if (s.phase !== 'player') fail('WRONG_PHASE', 'Chưa đến lượt của bạn.');
      if (s.objectives.kind === 'hold' && pointsHeld(s)) {
        finish(s, 'victory', 'objective', ev);
        break;
      }
      beginSide(s, 'enemy', ev);
      checkOutcome(s, ev);
      if (!s.outcome && enemyPhase) enemyPhase(s, ev);
      if (s.outcome) break;
      s.turn += 1;
      if (s.turn > s.turnLimit) {
        finish(s, 'defeat', 'time', ev);
        break;
      }
      beginSide(s, 'player', ev);
      checkOutcome(s, ev);
      break;
    }
    default:
      if (s.phase !== 'player') fail('WRONG_PHASE', s.phase === 'deployment' ? 'Bắt đầu trận trước khi hành động.' : 'Chưa đến lượt của bạn.');
      executeUnitAction(s, 'player', action, ev);
  }
  s.version += 1;
  return { state: s, events: ev };
}

/**
 * PvP turn state machine: the active side acts, then ends its turn; the other side begins.
 * A full round (host + guest) advances the turn counter. No AI runs.
 */
function applyPvp(s: BattleState, action: BattleAction, actor: 'player' | 'enemy', ev: BattleEvent[]): void {
  const other = actor === 'player' ? 'enemy' : 'player';
  switch (action.type) {
    case 'retreat':
      return finishPvp(s, other, 'retreat', ev);
    case 'deploy':
    case 'start':
      fail('WRONG_PHASE', 'Đấu trường PvP bắt đầu ngay khi ghép trận.');
      break;
    case 'end_turn': {
      if (s.activeSide !== actor) fail('NOT_YOUR_TURN', 'Chưa đến lượt của bạn.');
      endPvpTurn(s, ev);
      return;
    }
    default:
      if (s.activeSide !== actor) fail('NOT_YOUR_TURN', 'Chưa đến lượt của bạn.');
      executeUnitAction(s, actor, action, ev);
  }
}

function endPvpTurn(s: BattleState, ev: BattleEvent[]): void {
  const next = s.activeSide === 'player' ? 'enemy' : 'player';
  if (next === 'player') {
    s.turn += 1;
    if (s.turn > s.turnLimit) {
      s.turn = s.turnLimit;
      return finishPvp(s, hpShareWinner(s), 'time', ev);
    }
  }
  s.activeSide = next;
  beginSide(s, next, ev);
  checkOutcome(s, ev);
}

/** Server-side clock: the active PvP player ran out of time — their turn ends for them. */
export function timeoutPvpTurn(original: BattleState): { state: BattleState; events: BattleEvent[] } {
  const s: BattleState = JSON.parse(JSON.stringify(original));
  const ev: BattleEvent[] = [];
  if (s.outcome || s.mode !== 'pvp') return { state: s, events: ev };
  endPvpTurn(s, ev);
  s.version += 1;
  return { state: s, events: ev };
}

/** A PvP side left (disconnected too long): the other side wins. */
export function forfeitBattle(original: BattleState, loser: 'player' | 'enemy'): { state: BattleState; events: BattleEvent[] } {
  const s: BattleState = JSON.parse(JSON.stringify(original));
  const ev: BattleEvent[] = [];
  if (s.outcome) return { state: s, events: ev };
  finishPvp(s, loser === 'player' ? 'enemy' : 'player', 'forfeit', ev);
  s.version += 1;
  return { state: s, events: ev };
}

/** A started PvP battle: host = 'player' (south), guest = 'enemy' (north, mirrored arena). */
export function createPvpBattleState(seed: number, host: readonly RosterEntry[], guest: readonly RosterEntry[]): BattleState {
  const s = createBattleState('pvp_duel', seed, host);
  const map = generateBattleMap('pvp_duel', seed, 0, 0);
  guest.forEach((r, i) => {
    const spot = map.enemySpawns[i * 2 < map.enemySpawns.length ? i * 2 : i];
    s.units.push(soldierUnit(r, `q${i + 1}`, 'enemy', spot));
  });
  s.mode = 'pvp';
  s.items = { bandage: baseBandages(host.length) };
  s.itemsB = { bandage: baseBandages(guest.length) };
  s.phase = 'player';
  s.turn = 1;
  s.activeSide = 'player';
  const ev: BattleEvent[] = [];
  beginSide(s, 'player', ev);
  return s;
}

/** Marks an untouched battle as abandoned (defeat, no rewards). */
export function abandonBattle(original: BattleState): { state: BattleState; events: BattleEvent[] } {
  const s: BattleState = JSON.parse(JSON.stringify(original));
  const ev: BattleEvent[] = [];
  finish(s, 'defeat', 'abandoned', ev);
  s.version += 1;
  return { state: s, events: ev };
}

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
export interface BattleRewards {
  resources: { coins: number; wood: number; stone: number };
  goods: Record<string, number>;
  survivors: number;
  /** XP per soldier (military unit id) */
  xp: Record<string, number>;
  stars: number;
}

/** Rewards of a finished battle — computed only from the server state. */
export function battleRewards(s: BattleState): BattleRewards {
  const def = getMission(s.mission);
  const won = s.outcome?.result === 'victory';
  const k = won ? 1 + 0.25 * ((s.outcome?.stars ?? 1) - 1) : 0;
  const scale = (n: number) => Math.round(n * k);
  const xp: Record<string, number> = {};
  if (s.mode === 'pvp') {
    const w = s.outcome?.winner ?? null;
    for (const u of s.units) {
      if (!u.sourceId) continue;
      const base = (w === null ? 30 : w === u.side ? 50 : 20) + u.kills * 10;
      xp[u.sourceId] = u.ko ? Math.round(base / 2) : base;
    }
    return { resources: { coins: 0, wood: 0, stone: 0 }, goods: {}, survivors: 0, xp, stars: 0 };
  }
  for (const u of s.units) {
    if (u.side !== 'player' || !u.sourceId) continue;
    const base = (won ? def.reward.xp : 10) + u.kills * 10;
    xp[u.sourceId] = u.ko ? Math.round(base / 2) : base;
  }
  return {
    resources: { coins: scale(def.reward.resources.coins), wood: scale(def.reward.resources.wood), stone: scale(def.reward.resources.stone) },
    goods: Object.fromEntries(Object.entries(def.reward.goods).map(([c, n]) => [c, scale(n)])),
    // Rescue: every captive still alive at the victory joins the city.
    survivors: won ? Math.min(def.reward.survivors, s.units.filter((u) => u.kind === 'captive' && !u.ko).length) : 0,
    xp,
    stars: s.outcome?.stars ?? 0,
  };
}
