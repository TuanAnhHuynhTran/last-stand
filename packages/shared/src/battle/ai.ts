/**
 * Utility AI for the enemy side (and a player-side autopilot used by tests / simulations).
 *
 * Every decision scores the options available right now and takes the best one:
 *   attack / skill from here · move to a tile (scored by what it can hit from there, cover,
 *   danger, distance to targets / objectives) · defend · stop
 * Personalities (EnemyBehavior) weight those terms differently:
 *   swarm (zombies)   march at the nearest target, never retreat, ignore danger
 *   hunter (wolves)   chase wounded targets, love long charges
 *   ranged (spitters) keep at the edge of their range, use acid on groups
 *   cautious (bandits) prefer cover, avoid danger, defend when hurt, weigh threat & armour
 *   heavy (robots)    pick the most dangerous target, overcharge before firing
 *   boss              slams when several foes are adjacent, hunts the biggest threat
 * Each unit makes at most MAX_DECISIONS decisions per turn and every executed decision
 * spends action points, so a turn always terminates (no "retry until reachable" loops).
 */
import { hexDistance, type AxialCoord } from '../hex/hexMath.js';
import { BATTLE_SKILLS, TERRAIN_DEFINITIONS, type BattleSkillCode } from './definitions.js';
import {
  areFoes,
  executeUnitAction,
  getUnit,
  hasStatus,
  inAttackRange,
  isActive,
  isRanged,
  itemsOf,
  lineOfSight,
  previewAttack,
  rangeFrom,
  reachable,
  registerEnemyAI,
  tileAt,
  type BattleAction,
  type BattleEvent,
  type BattleState,
  type BattleUnit,
} from './engine.js';

export const MAX_DECISIONS = 5;

type UnitAction = Exclude<BattleAction, { type: 'start' | 'end_turn' | 'retreat' | 'deploy' }>;

interface Weights {
  approach: number;
  danger: number;
  cover: number;
  /** Keep distance near max range (ranged units) */
  kite: boolean;
  defendBelow: number;
}

const WEIGHTS: Record<string, Weights> = {
  swarm: { approach: 6, danger: 0, cover: 0, kite: false, defendBelow: 0 },
  hunter: { approach: 5, danger: 0.1, cover: 0, kite: false, defendBelow: 0 },
  ranged: { approach: 2, danger: 0.6, cover: 25, kite: true, defendBelow: 0.2 },
  cautious: { approach: 3, danger: 0.9, cover: 40, kite: false, defendBelow: 0.35 },
  heavy: { approach: 2.5, danger: 0.3, cover: 20, kite: true, defendBelow: 0.25 },
  boss: { approach: 5, danger: 0.05, cover: 0, kite: false, defendBelow: 0 },
  soldier: { approach: 3.5, danger: 0.4, cover: 25, kite: true, defendBelow: 0.3 },
};

const foesOf = (s: BattleState, u: BattleUnit): BattleUnit[] =>
  s.units.filter((b) => isActive(b) && areFoes(u, b) && (b.side !== 'neutral' || u.behavior === 'cautious'));

/** How much the target is worth hitting for this personality. */
function targetWeight(u: BattleUnit, b: BattleUnit): number {
  if (b.side === 'neutral') return -35; // bandits threaten captives only when nothing better is around
  const hurt = 1 - b.hp / b.maxHp;
  switch (u.behavior) {
    case 'hunter':
      return hurt * 30;
    case 'ranged':
      return b.threat * 2;
    case 'cautious':
      return b.threat * 1.5 + (1 - Math.min(1, b.armor / 15)) * 10;
    case 'heavy':
    case 'boss':
      return b.threat * 3;
    case 'soldier':
      return b.threat * 2 + (b.kind === 'behemoth' ? 15 : 0) + hurt * 10;
    default:
      return 0;
  }
}

function strikeValue(s: BattleState, u: BattleUnit, b: BattleUnit, from: AxialCoord, multiplier = 1, ignoreArmor = false): number {
  const p = previewAttack(s, u, b, { from, multiplier, ignoreArmor });
  const exp = p.damage * p.hitChance * (1 - p.blockChance * 0.7);
  return (exp / Math.max(1, b.hp)) * 60 + (exp >= b.hp ? 45 : 0) + targetWeight(u, b);
}

/** Expected damage the foes of `u` could deal to a unit on `h` next turn. */
function danger(s: BattleState, u: BattleUnit, h: AxialCoord): number {
  let d = 0;
  for (const f of s.units) {
    if (!isActive(f) || !areFoes(u, f) || f.side === 'neutral') continue;
    const reach = Math.floor(f.move / 2) + rangeFrom(s, f);
    if (hexDistance(f, h) <= reach) d += f.attack;
  }
  return d;
}

function goalDistance(s: BattleState, u: BattleUnit, h: AxialCoord): number {
  if (u.side === 'player') {
    const o = s.objectives;
    if (o.kind === 'rescue') {
      const cs = s.units.filter((c) => c.kind === 'captive' && isActive(c));
      if (cs.length) return Math.min(...cs.map((c) => hexDistance(c, h)));
    }
    if (o.kind === 'hold' && o.points.length) {
      const free = o.points.filter((p) => !s.units.some((x) => x.side === 'player' && isActive(x) && x.id !== u.id && x.q === p.q && x.r === p.r));
      if (free.length) return Math.min(...free.map((p) => hexDistance(p, h)));
    }
  }
  const foes = foesOf(s, u).filter((f) => f.side !== 'neutral');
  return foes.length ? Math.min(...foes.map((f) => hexDistance(f, h))) : 0;
}

function positionValue(s: BattleState, u: BattleUnit, h: AxialCoord): number {
  const w = WEIGHTS[u.behavior] ?? WEIGHTS.soldier;
  const t = tileAt(s, h)!;
  const def = TERRAIN_DEFINITIONS[t.terrain];
  let v = 0;
  const g = goalDistance(s, u, h);
  // Ranged units keep at their best range — unless a soldier is heading for a mission objective.
  if (w.kite && isRanged(u) && !goalIsObjective(s, u)) {
    v -= Math.abs(g - rangeFrom(s, u, h)) * w.approach;
  } else v -= g * w.approach;
  v += def.cover * w.cover;
  v -= danger(s, u, h) * w.danger * 0.6;
  if (def.effect === 'poison' && (u.category === 'human' || u.category === 'beast')) v -= 25;
  if (t.height >= 1 && isRanged(u)) v += 6;
  return v;
}

function goalIsObjective(s: BattleState, u: BattleUnit): boolean {
  if (u.side !== 'player') return false;
  if (s.objectives.kind === 'rescue') return s.units.some((c) => c.kind === 'captive' && isActive(c));
  return s.objectives.kind === 'hold';
}

interface Option {
  score: number;
  action: UnitAction;
}

function bestStrikeFrom(s: BattleState, u: BattleUnit, from: AxialCoord): number {
  if (u.needsReload && !u.loaded) return 0;
  let best = 0;
  for (const b of foesOf(s, u)) if (inAttackRange(s, u, b, from)) best = Math.max(best, strikeValue(s, u, b, from));
  return best;
}

function options(s: BattleState, u: BattleUnit): Option[] {
  const out: Option[] = [];
  const here = { q: u.q, r: u.r };
  const loadedOk = !u.needsReload || u.loaded;
  const foes = foesOf(s, u);
  // Attacks from here
  if (u.ap >= 1 && loadedOk) for (const b of foes) if (inAttackRange(s, u, b)) out.push({ score: strikeValue(s, u, b, here), action: { type: 'attack', unitId: u.id, targetId: b.id } });
  // Skills
  for (const code of u.skills) {
    const sk = BATTLE_SKILLS[code];
    if ((u.cooldowns[code] ?? 0) > 0 || u.ap < sk.ap) continue;
    const opt = skillOption(s, u, code, foes);
    if (opt) out.push(opt);
  }
  // Player-side extras: free captives, bandage, reload
  if (u.behavior === 'soldier' && u.ap >= 1) {
    for (const c of s.units) if (c.kind === 'captive' && isActive(c) && hexDistance(c, u) <= 1) out.push({ score: 200, action: { type: 'interact', unitId: u.id, targetId: c.id } });
    if (itemsOf(s, u.side).bandage > 0 && u.hp < u.maxHp * 0.4) out.push({ score: 55, action: { type: 'item', unitId: u.id, item: 'bandage' } });
  }
  if (u.needsReload && !u.loaded && u.ap >= 1) out.push({ score: 30, action: { type: 'reload', unitId: u.id } });
  // Movement
  if (u.ap >= 1 && u.mpLeft > 0) {
    const stay = positionValue(s, u, here);
    let best: Option | null = null;
    for (const [k, r] of reachable(s, u)) {
      if (r.cost === 0) continue;
      const [q, rr] = k.split(',').map(Number);
      const h = { q, r: rr };
      const pos = positionValue(s, u, h) - stay;
      const follow = u.ap >= 2 ? bestStrikeFrom(s, u, h) * 0.9 : 0;
      const score = pos + follow;
      if (!best || score > best.score) best = { score, action: { type: 'move', unitId: u.id, to: h } };
    }
    if (best && best.score > 1) out.push(best);
  }
  // Defend when hurt and threatened (cautious personalities) or with nothing better to do.
  const w = WEIGHTS[u.behavior] ?? WEIGHTS.soldier;
  if (u.ap >= 1) {
    const threatened = danger(s, u, here) > 0;
    const hurt = u.hp / u.maxHp;
    let score = threatened ? 4 : 0;
    if (hurt < w.defendBelow) score += 40;
    out.push({ score, action: { type: 'defend', unitId: u.id } });
  }
  return out;
}

function skillOption(s: BattleState, u: BattleUnit, code: BattleSkillCode, foes: BattleUnit[]): Option | null {
  const sk = BATTLE_SKILLS[code];
  const loadedOk = !u.needsReload || u.loaded;
  const near = foes.filter((f) => f.side !== 'neutral' && hexDistance(f, u) <= 2);
  switch (code) {
    case 'shield_wall':
    case 'brace':
      return near.length ? { score: 18 + near.length * 6, action: { type: 'skill', unitId: u.id, skill: code } } : null;
    case 'overcharge':
      return u.ap >= 2 && foes.some((f) => inAttackRange(s, u, f)) && !hasStatus(u, 'overcharged') ? { score: 35, action: { type: 'skill', unitId: u.id, skill: code } } : null;
    case 'ground_slam': {
      const adj = foes.filter((f) => f.side !== 'neutral' && hexDistance(f, u) === 1);
      if (!adj.length) return null;
      const v = adj.reduce((a, f) => a + strikeValue(s, u, f, u, sk.multiplier), 0) + 10;
      return { score: adj.length >= 2 ? v : v * 0.7, action: { type: 'skill', unitId: u.id, skill: code } };
    }
    case 'aimed_shot':
    case 'piercing_bolt': {
      if (!loadedOk) return null;
      let best: Option | null = null;
      for (const b of foes) {
        if (!inAttackRange(s, u, b)) continue;
        const v = strikeValue(s, u, b, u, sk.multiplier, code === 'piercing_bolt') + (b.armor > 8 ? 10 : 0) - (sk.ap > 1 ? 8 : 0);
        if (!best || v > best.score) best = { score: v, action: { type: 'skill', unitId: u.id, skill: code, targetId: b.id } };
      }
      return best;
    }
    case 'volley':
    case 'acid_spit': {
      let best: Option | null = null;
      for (const c of foes) {
        if (c.side === 'neutral') continue;
        const d = hexDistance(u, c);
        if (d < u.minRange || d > rangeFrom(s, u) || !lineOfSight(s, u, c)) continue;
        const hit = foes.filter((f) => f.side !== 'neutral' && hexDistance(f, c) <= sk.radius);
        if (hit.length < 2) continue;
        const v = hit.reduce((a, f) => a + strikeValue(s, u, f, u, sk.multiplier), 0);
        if (!best || v > best.score) best = { score: v, action: { type: 'skill', unitId: u.id, skill: code, at: { q: c.q, r: c.r } } };
      }
      return best;
    }
  }
}

/** Plays every unit of a side until it stops (bounded). Invalid choices are skipped, never retried. */
export function runSideAI(s: BattleState, side: 'player' | 'enemy', ev: BattleEvent[]): number {
  let executed = 0;
  const order = s.units.filter((u) => u.side === side && isActive(u)).sort((a, b) => b.threat - a.threat || a.id.localeCompare(b.id));
  for (const unit of order) {
    for (let i = 0; i < MAX_DECISIONS; i += 1) {
      if (s.outcome) return executed;
      const u = getUnit(s, unit.id)!;
      if (!isActive(u) || u.ap <= 0) break;
      const best = options(s, u).sort((a, b) => b.score - a.score)[0];
      if (!best || best.score <= 0.5) break;
      const before = u.ap;
      try {
        executeUnitAction(s, side, best.action, ev);
        executed += 1;
      } catch {
        break; // a rule refused it: stop this unit (never loop on the same choice)
      }
      if (getUnit(s, unit.id)!.ap >= before) break;
    }
  }
  return executed;
}

registerEnemyAI((s, ev) => {
  runSideAI(s, 'enemy', ev);
});

/**
 * The next intent the side's AI would send (not executed) — lets a client-side autopilot or an
 * API test play through the server exactly like a human: one validated action at a time.
 */
export function planNextAction(s: BattleState, side: 'player' | 'enemy' = 'player'): UnitAction | null {
  const order = s.units.filter((u) => u.side === side && isActive(u) && u.ap > 0).sort((a, b) => b.threat - a.threat || a.id.localeCompare(b.id));
  for (const u of order) {
    const best = options(s, u).sort((a, b) => b.score - a.score)[0];
    if (best && best.score > 0.5) return best.action;
  }
  return null;
}

/** Player-side autopilot: the actions the soldiers would take this turn (for tests / auto play). */
export function autoPlayerTurn(s: BattleState): BattleEvent[] {
  const ev: BattleEvent[] = [];
  runSideAI(s, 'player', ev);
  return ev;
}
