/**
 * What the player sees and what a click means (pure). Uses the shared engine's read-only rules
 * so the highlights are exactly what the server will accept.
 */
import {
  BATTLE_SKILLS,
  areFoes,
  attackTargets,
  getUnit,
  hexDistance,
  inAttackRange,
  isActive,
  lineOfSight,
  pathTo,
  rangeFrom,
  reachableTiles,
  unitAt,
  type AxialCoord,
  type BattleAction,
  type BattleState,
} from '@cityverse/shared';
import type { BattleMode } from './battleStore';
import { EMPTY_HIGHLIGHTS, type Highlights } from './BattleRenderer';

const same = (a: AxialCoord | null, b: AxialCoord) => Boolean(a && a.q === b.q && a.r === b.r);

export function objectivesOf(s: BattleState): AxialCoord[] {
  const caps = s.units.filter((u) => u.kind === 'captive' && isActive(u)).map((u) => ({ q: u.q, r: u.r }));
  return [...caps, ...s.objectives.points];
}

export function computeHighlights(s: BattleState | null, selectedId: string | null, mode: BattleMode, hover: AxialCoord | null, busy: boolean): Highlights {
  if (!s) return EMPTY_HIGHLIGHTS;
  const base: Highlights = { ...EMPTY_HIGHLIGHTS, objectives: objectivesOf(s), hover, selected: selectedId };
  if (s.phase === 'deployment') return { ...base, deploy: s.deployZone };
  if (s.phase !== 'player' || busy) return base;
  const u = selectedId ? getUnit(s, selectedId) : undefined;
  if (!u || u.side !== 'player' || !isActive(u)) return base;
  if (mode.kind === 'skill') {
    const sk = BATTLE_SKILLS[mode.skill];
    if (sk.target === 'enemy') return { ...base, targets: s.units.filter((b) => isActive(b) && areFoes(u, b) && inAttackRange(s, u, b)).map((b) => b.id) };
    if (sk.target === 'area') {
      const area = hover && hexDistance(u, hover) >= u.minRange && hexDistance(u, hover) <= rangeFrom(s, u) && lineOfSight(s, u, hover) ? s.tiles.filter((t) => hexDistance(t, hover) <= sk.radius) : [];
      return { ...base, area, targets: s.units.filter((b) => isActive(b) && areFoes(u, b) && b.side !== 'neutral' && area.some((h) => h.q === b.q && h.r === b.r)).map((b) => b.id) };
    }
    return base;
  }
  if (mode.kind === 'item') return { ...base, targets: [], move: s.units.filter((b) => b.side === 'player' && isActive(b) && hexDistance(b, u) <= 1).map((b) => ({ q: b.q, r: b.r })) };
  if (mode.kind === 'interact') return { ...base, targets: s.units.filter((c) => c.kind === 'captive' && isActive(c) && hexDistance(c, u) <= 1).map((c) => c.id) };
  const move = reachableTiles(s, u.id);
  const path = hover && move.some((h) => same(hover, h)) ? (pathTo(s, u, hover) ?? []) : [];
  return { ...base, move, path, targets: attackTargets(s, u.id).map((t) => t.unit.id) };
}

/** The action a click on `hex` sends (or a selection change), given the current mode. */
export function clickIntent(s: BattleState, selectedId: string | null, mode: BattleMode, hex: AxialCoord): { action: BattleAction } | { select: string | null } | null {
  const there = unitAt(s, hex);
  if (s.phase === 'deployment') {
    if (there?.side === 'player') return { select: there.id };
    if (selectedId && s.deployZone.some((h) => same(hex, h))) return { action: { type: 'deploy', unitId: selectedId, to: hex } };
    return null;
  }
  if (s.phase !== 'player') return there ? { select: there.id } : null;
  const u = selectedId ? getUnit(s, selectedId) : undefined;
  if (!u || u.side !== 'player' || !isActive(u)) return there?.side === 'player' ? { select: there.id } : null;
  if (mode.kind === 'skill') {
    const sk = BATTLE_SKILLS[mode.skill];
    if (sk.target === 'enemy' && there && areFoes(u, there)) return { action: { type: 'skill', unitId: u.id, skill: mode.skill, targetId: there.id } };
    if (sk.target === 'area') return { action: { type: 'skill', unitId: u.id, skill: mode.skill, at: hex } };
    return null;
  }
  if (mode.kind === 'item') {
    if (there && there.side === 'player') return { action: { type: 'item', unitId: u.id, item: 'bandage', targetId: there.id } };
    return null;
  }
  if (mode.kind === 'interact') {
    if (there?.kind === 'captive') return { action: { type: 'interact', unitId: u.id, targetId: there.id } };
    return null;
  }
  if (there?.side === 'player') return { select: there.id };
  if (there && areFoes(u, there)) return { action: { type: 'attack', unitId: u.id, targetId: there.id } };
  if (there?.kind === 'captive' && hexDistance(u, there) <= 1) return { action: { type: 'interact', unitId: u.id, targetId: there.id } };
  if (!there) return { action: { type: 'move', unitId: u.id, to: hex } };
  return null;
}
