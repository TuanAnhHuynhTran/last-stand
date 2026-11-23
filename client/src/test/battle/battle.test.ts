import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BATTLE_TERRAINS,
  TERRAIN_DEFINITIONS,
  applyBattleAction,
  attackTargets,
  autoPlayerTurn,
  createBattleState,
  reachableTiles,
  unitStats,
  type BattleState,
  type BattleTerrain,
  type RosterEntry,
  type UnitTypeCode,
} from '@cityverse/shared';
import { BattleCamera } from '../../game/battle/BattleCamera';
import { BATTLE_TEXT, BattleRenderer } from '../../game/battle/BattleRenderer';
import { standPoint, tileMap } from '../../game/battle/battleLayout';

BATTLE_TEXT.enabled = false;
import { clickIntent, computeHighlights } from '../../game/battle/battleInput';
import { describeEvents } from '../../game/battle/battleLog';
import { buildBattlefield } from '../../game/battle/battleModels';
import { planTimeline } from '../../game/battle/battlePlayback';
import { COMBAT_CLIPS, creatureFrame, humanoidFrame } from '../../game/battle/combatAnimation';
import { clipPose } from '../../game/military/soldierAnimation';

const KIT: Record<UnitTypeCode, string[]> = {
  swordsman: ['eq_saber', 'eq_shield', 'eq_leather_armor'],
  spearman: ['eq_spear', 'eq_leather_armor'],
  archer: ['eq_bow', 'eq_arrows'],
  crossbowman: ['eq_crossbow', 'eq_bolts', 'eq_leather_armor'],
};
const roster = (types: UnitTypeCode[]): RosterEntry[] =>
  types.map((type, i) => ({ sourceId: `00000000-0000-4000-8000-00000000000${i}`, name: `Lính ${i}`, type, rank: 2, stats: unitStats(type, 2, KIT[type] as never), health: 1, mounted: false }));
const SQUAD: UnitTypeCode[] = ['swordsman', 'spearman', 'archer', 'crossbowman', 'swordsman', 'archer'];

function started(mission: 'rescue_survivors' | 'reclaim_ruins' | 'mutant_boss' = 'reclaim_ruins', seed = 11): BattleState {
  return applyBattleAction(createBattleState(mission, seed, roster(SQUAD)), { type: 'start' }).state;
}

function flat(): BattleState {
  const s = started();
  s.tiles = s.tiles.map((t) => ({ ...t, terrain: 'ground' as BattleTerrain, height: 0 }));
  s.units.forEach((u, i) => Object.assign(u, u.side === 'enemy' ? { q: i - 6, r: -7 } : { q: -7 + i, r: 7 }));
  return s;
}

const cam = () => {
  const c = new THREE.PerspectiveCamera(42, 1.6, 0.5, 600);
  new BattleCamera().update(1, c);
  return c;
};

describe('Phase 11 – battlefield art', () => {
  it('builds a chibi tile for every terrain type: props, water and glowing toxic puddles', () => {
    const base = flat();
    const verts = (s: BattleState) => buildBattlefield(s).solid.getAttribute('position').count;
    const ground = verts(base);
    const sizes = new Map<BattleTerrain, number>();
    for (const terrain of BATTLE_TERRAINS) {
      const s = { ...base, tiles: base.tiles.map((t, i) => (i < 20 ? { ...t, terrain, height: TERRAIN_DEFINITIONS[terrain].height } : t)) };
      const g = buildBattlefield(s);
      sizes.set(terrain, g.solid.getAttribute('position').count);
      if (terrain === 'water') expect(g.water.getAttribute('position')?.count ?? 0).toBeGreaterThan(0);
      if (terrain === 'toxic') expect(g.toxic.getAttribute('position')?.count ?? 0).toBeGreaterThan(0);
      expect(g.solid.getAttribute('color')).toBeDefined(); // vertex-coloured chibi palette
    }
    for (const t of ['forest', 'rock', 'fort', 'ruins'] as BattleTerrain[]) expect(sizes.get(t)!).toBeGreaterThan(ground); // readable props
    const rocky = buildBattlefield({ ...base, tiles: base.tiles.map((t) => ({ ...t, terrain: 'rock' as BattleTerrain, height: 2 })) }).solid;
    rocky.computeBoundingBox();
    expect(rocky.boundingBox!.max.y).toBeGreaterThan(2); // boulders stand out
  });
});

describe('Phase 11 – combat animation', () => {
  it('each class attacks its own way (drills reused) and every clip is defined', () => {
    expect(humanoidFrame('swordsman', 'attack', 0, 0.6).pose).toEqual(clipPose('swordsman', 'swing', 0.6));
    expect(humanoidFrame('spearman', 'attack', 0, 0.3).pose).toEqual(clipPose('spearman', 'thrust', 0.3 / 0.55));
    expect(humanoidFrame('archer', 'attack', 0, 0.4).pose.draw).toBeGreaterThan(0.5); // drawing the bow
    expect(humanoidFrame('crossbowman', 'reload', 0, 0.3).pose.weapon).toBeGreaterThan(0.5); // spanning: crossbow points down
    for (const style of ['swordsman', 'spearman', 'archer', 'crossbowman', 'zombie', 'captive'] as const) {
      for (const clip of COMBAT_CLIPS) {
        const f = humanoidFrame(style, clip, 1.3, 0.5);
        for (const v of Object.values(f.pose)) expect(Number.isFinite(v)).toBe(true);
      }
    }
    expect(humanoidFrame('swordsman', 'knockout', 0, 1).fall).toBe(1);
    expect(humanoidFrame('archer', 'victory', 0.3, 0.5).pose.armLPitch).toBeLessThan(-2.5); // arms up
    expect(creatureFrame('wolf', 'attack', 0, 0.5).lunge).toBeGreaterThan(0.8); // pounce
    expect(creatureFrame('behemoth', 'knockout', 0, 1).fall).toBe(1);
  });
});

describe('Phase 11 – playback follows the server', () => {
  it('plans moves, ranged shots (projectile before the impact) and area strikes in order', () => {
    const s = flat();
    const archer = s.units.find((u) => u.kind === 'archer')!;
    const robot = s.units.find((u) => u.kind === 'robot')!;
    Object.assign(archer, { q: 0, r: 3 });
    Object.assign(robot, { q: 0, r: -1 });
    const r = applyBattleAction(s, { type: 'attack', unitId: archer.id, targetId: robot.id });
    const { cues, total } = planTimeline(r.events, s);
    const attack = cues.find((c) => c.type === 'attack')!;
    const shot = cues.find((c) => c.type === 'projectile')!;
    const impact = cues.find((c) => c.type === 'impact')!;
    expect(attack.type === 'attack' && attack.ranged).toBe(true);
    expect(shot.start).toBeGreaterThan(attack.start);
    expect(impact.start).toBeCloseTo(shot.start + shot.duration, 5);
    expect(total).toBeGreaterThanOrEqual(impact.start + impact.duration);
    // Area skill: all strikes land together.
    const z = s.units.filter((u) => u.kind === 'zombie');
    Object.assign(z[0], { q: 0, r: -1 });
    Object.assign(z[1], { q: 1, r: -1 });
    Object.assign(robot, { q: -6, r: -1 });
    const v = applyBattleAction(s, { type: 'skill', unitId: archer.id, skill: 'volley', at: { q: 0, r: -1 } });
    const strikes = planTimeline(v.events, s).cues.filter((c) => c.type === 'attack');
    expect(strikes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(strikes.map((c) => c.start)).size).toBe(1);
    // A move takes time proportional to its path.
    const mv = applyBattleAction(s, { type: 'move', unitId: 'p1', to: { q: -6, r: 5 } });
    const m = planTimeline(mv.events, s).cues.find((c) => c.type === 'move')!;
    expect(m.type === 'move' && m.duration).toBeCloseTo(0.26 * (m.type === 'move' ? m.path.length - 1 : 0), 5);
  });

  it('the renderer animates a whole enemy turn and ends exactly on the server state', () => {
    let s = started('rescue_survivors', 4);
    const r = new BattleRenderer();
    r.load('b1', s);
    const c = cam();
    for (let turn = 0; turn < 3 && !s.outcome; turn += 1) {
      autoPlayerTurn(s);
      if (s.outcome) break;
      const before = s;
      const res = applyBattleAction(before, { type: 'end_turn' });
      let done = false;
      r.play(res.events, before, res.state, () => (done = true));
      const clips = new Set<string>();
      for (let i = 0; i < 2000 && !done; i += 1) {
        r.update(1 / 30, c);
        for (const u of res.state.units) clips.add(r.clipOf(u.id) ?? '');
      }
      expect(done).toBe(true);
      const tiles = tileMap(res.state);
      for (const u of res.state.units) {
        expect(r.displayedHp(u.id)).toBe(u.hp);
        const p = r.actorPosition(u.id)!;
        const want = standPoint(tiles, u);
        expect(p.x).toBeCloseTo(want.x, 6);
        expect(p.z).toBeCloseTo(want.z, 6);
      }
      if (res.events.some((e) => e.type === 'move')) expect([...clips].some((x) => x === 'walk' || x === 'run')).toBe(true);
      if (res.events.some((e) => e.type === 'attack')) expect(clips.has('attack')).toBe(true);
      s = res.state;
    }
    expect(r.partCount('torso')).toBeGreaterThan(0); // chibi humanoids drawn
    expect(r.popups.length).toBeGreaterThan(0); // damage numbers / statuses were shown
    r.dispose();
  });

  it('writes a readable battle log from the events', () => {
    const s = flat();
    const archer = s.units.find((u) => u.kind === 'archer')!;
    const robot = s.units.find((u) => u.kind === 'robot')!;
    Object.assign(archer, { q: 0, r: 3 });
    Object.assign(robot, { q: 0, r: -1 });
    const r = applyBattleAction(s, { type: 'attack', unitId: archer.id, targetId: robot.id });
    const lines = describeEvents(r.events, r.state);
    expect(lines[0]).toMatch(new RegExp(`${archer.name}.*${robot.name}`));
  });
});

describe('Phase 11 – highlights & clicks', () => {
  it('highlights exactly the reachable hexes and valid targets the server accepts', () => {
    const s = flat();
    const archer = s.units.find((u) => u.kind === 'archer')!;
    const robot = s.units.find((u) => u.kind === 'robot')!;
    Object.assign(archer, { q: 0, r: 3 });
    Object.assign(robot, { q: 0, r: -1 });
    const h = computeHighlights(s, archer.id, { kind: 'move' }, { q: 1, r: 2 }, false);
    expect(h.move).toEqual(reachableTiles(s, archer.id));
    expect(h.targets).toEqual(attackTargets(s, archer.id).map((t) => t.unit.id));
    expect(h.path[h.path.length - 1]).toEqual({ q: 1, r: 2 });
    // Nothing to do while an animation plays.
    expect(computeHighlights(s, archer.id, { kind: 'move' }, null, true).move).toEqual([]);
    // Clicks: enemy → attack, free hex → move, own soldier → select.
    expect(clickIntent(s, archer.id, { kind: 'move' }, robot)).toEqual({ action: { type: 'attack', unitId: archer.id, targetId: robot.id } });
    expect(clickIntent(s, archer.id, { kind: 'move' }, { q: 1, r: 2 })).toEqual({ action: { type: 'move', unitId: archer.id, to: { q: 1, r: 2 } } });
    const other = s.units.find((u) => u.side === 'player' && u.id !== archer.id)!;
    expect(clickIntent(s, archer.id, { kind: 'move' }, other)).toEqual({ select: other.id });
    // Area skill shows the radius-1 area around the hovered hex.
    const area = computeHighlights(s, archer.id, { kind: 'skill', skill: 'volley' }, { q: 0, r: -1 }, false).area;
    expect(area).toHaveLength(7);
    // Deployment: only the deployment zone.
    const d = createBattleState('rescue_survivors', 3, roster(['swordsman', 'spearman', 'archer']));
    expect(computeHighlights(d, 'p1', { kind: 'move' }, null, false).deploy).toEqual(d.deployZone);
  });
});
