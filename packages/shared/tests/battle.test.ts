import { describe, expect, it } from 'vitest';
import {
  BATTLE_BALANCE,
  BATTLE_TERRAINS,
  MAX_DECISIONS,
  MISSIONS,
  TERRAIN_DEFINITIONS,
  applyBattleAction,
  autoPlayerTurn,
  battleRewards,
  createBattleState,
  generateBattleMap,
  hexDistance,
  hexKey,
  hexNeighbors,
  lineOfSight,
  pathTo,
  previewAttack,
  reachable,
  reachableTiles,
  unitStats,
  type BattleState,
  type BattleTerrain,
  type BattleUnit,
  type MissionCode,
  type RosterEntry,
  type UnitTypeCode,
} from '../src/index.js';

const KIT: Record<UnitTypeCode, string[]> = {
  swordsman: ['eq_saber', 'eq_shield', 'eq_leather_armor'],
  spearman: ['eq_spear', 'eq_leather_armor'],
  archer: ['eq_bow', 'eq_arrows'],
  crossbowman: ['eq_crossbow', 'eq_bolts', 'eq_leather_armor'],
};

function roster(types: UnitTypeCode[]): RosterEntry[] {
  return types.map((type, i) => ({
    sourceId: `00000000-0000-4000-8000-00000000000${i}`,
    name: `Lính ${i}`,
    type,
    rank: 2,
    stats: unitStats(type, 2, KIT[type] as never),
    health: 1,
    mounted: false,
  }));
}

const SQUAD: UnitTypeCode[] = ['swordsman', 'spearman', 'archer', 'crossbowman', 'swordsman', 'archer'];

/** A started battle on a flat empty field (for precise geometry tests). */
function flatBattle(): BattleState {
  const s = applyBattleAction(createBattleState('reclaim_ruins', 7, roster(SQUAD)), { type: 'start' }).state;
  s.tiles = s.tiles.map((t) => ({ ...t, terrain: 'ground', height: 0 }));
  // Park everyone far away, then tests place what they need.
  s.units.forEach((u, i) => {
    u.q = -7 + (i % 8);
    u.r = 7 - Math.floor(i / 8);
    if (u.side === 'enemy') u.r = -7 + Math.floor(i / 8) + 0 * i;
  });
  s.units.filter((u) => u.side === 'enemy').forEach((u, i) => {
    u.q = i;
    u.r = -7;
  });
  return s;
}

const setTerrain = (s: BattleState, q: number, r: number, terrain: BattleTerrain) => {
  const t = s.tiles.find((x) => x.q === q && x.r === r)!;
  t.terrain = terrain;
  t.height = TERRAIN_DEFINITIONS[terrain].height;
  s.tiles = [...s.tiles]; // fresh array → fresh tile index
};
const unit = (s: BattleState, id: string): BattleUnit => s.units.find((u) => u.id === id)!;
const place = (s: BattleState, id: string, q: number, r: number) => Object.assign(unit(s, id), { q, r });

describe('Phase 11 – battlefield', () => {
  it('generates a radius-7 hex map, deterministic per seed, using every terrain type', () => {
    const a = generateBattleMap('reclaim_ruins', 42);
    const b = generateBattleMap('reclaim_ruins', 42);
    expect(a.tiles).toHaveLength(169);
    expect(a.tiles).toEqual(b.tiles);
    const seen = new Set<BattleTerrain>();
    for (const m of MISSIONS) for (let seed = 1; seed <= 12; seed += 1) for (const t of generateBattleMap(m.code, seed).tiles) seen.add(t.terrain);
    expect([...seen].sort()).toEqual([...BATTLE_TERRAINS].sort());
  });

  it('every passable tile, spawn, captive and capture point is reachable from the deployment zone', () => {
    for (const m of MISSIONS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const map = generateBattleMap(m.code, seed, m.enemies.length, m.captives);
        const pass = new Map(map.tiles.map((t) => [hexKey(t.q, t.r), TERRAIN_DEFINITIONS[t.terrain].passable]));
        const seen = new Set(map.deployZone.map((h) => hexKey(h.q, h.r)));
        const queue = [...map.deployZone];
        while (queue.length) {
          const c = queue.shift()!;
          for (const n of hexNeighbors(c)) {
            const k = hexKey(n.q, n.r);
            if (pass.get(k) && !seen.has(k)) {
              seen.add(k);
              queue.push(n);
            }
          }
        }
        for (const [k, p] of pass) if (p) expect(seen.has(k), `${m.code}#${seed} ${k}`).toBe(true);
        for (const h of [...map.enemySpawns, ...map.captiveTiles, ...map.points]) expect(seen.has(hexKey(h.q, h.r))).toBe(true);
        expect(map.enemySpawns).toHaveLength(m.enemies.length);
        expect(map.captiveTiles).toHaveLength(m.captives);
        expect(map.points).toHaveLength(m.capturePoints);
      }
    }
  });
});

describe('Phase 11 – movement on hexes', () => {
  it('moves along hex paths within the movement budget; roads are cheaper', () => {
    const s = flatBattle();
    const sw = unit(s, 'p1'); // swordsman, 8 MP = 4 ground hexes
    place(s, 'p1', 0, 3);
    expect(sw.move).toBe(8);
    const reach = reachableTiles(s, 'p1');
    expect(Math.max(...reach.map((h) => hexDistance(h, sw)))).toBe(4);
    for (const h of reach) expect(h.cost).toBeLessThanOrEqual(sw.mpLeft);
    expect(() => applyBattleAction(s, { type: 'move', unitId: 'p1', to: { q: 0, r: -2 } })).toThrow(/đến ô này/); // 5 hexes > 4
    // A road doubles the distance.
    for (let r = 2; r >= -5; r -= 1) setTerrain(s, 0, r, 'road');
    expect(reachable(s, sw).has(hexKey(0, -5))).toBe(true); // 8 road hexes
    const far = applyBattleAction(s, { type: 'move', unitId: 'p1', to: { q: 0, r: -5 } });
    expect(unit(far.state, 'p1')).toMatchObject({ q: 0, r: -5, ap: 1, mpLeft: 0 });
    const ev = far.events.find((e) => e.type === 'move')!;
    expect(ev.type === 'move' && ev.path).toHaveLength(9);
  });

  it('never walks through rocks, water or other units', () => {
    const s = flatBattle();
    place(s, 'p1', 0, 3);
    // Wall of rock / water across the way, one gap blocked by a unit.
    for (let q = -3; q <= 3; q += 1) setTerrain(s, q, 1, q === 2 ? 'water' : 'rock');
    place(s, 'p2', 4, 1);
    for (const h of reachableTiles(s, 'p1')) expect(h.r).toBeGreaterThan(1);
    const path = pathTo(s, unit(s, 'p1'), { q: 0, r: 2 })!;
    for (const h of path) expect(TERRAIN_DEFINITIONS[s.tiles.find((t) => t.q === h.q && t.r === h.r)!.terrain].passable).toBe(true);
    expect(() => applyBattleAction(s, { type: 'move', unitId: 'p1', to: { q: 0, r: 1 } })).toThrow(/BLOCKED|Không thể đi/);
    expect(() => applyBattleAction(s, { type: 'move', unitId: 'p1', to: { q: 4, r: 1 } })).toThrow(/OCCUPIED|Ô đã có/);
  });
});

describe('Phase 11 – attacks', () => {
  it('respects min / max range, hills (+1) and line of sight', () => {
    const s = flatBattle();
    const archer = unit(s, 'p3');
    const z = s.units.find((u) => u.side === 'enemy')!;
    place(s, 'p3', 0, 3);
    place(s, z.id, 0, -4); // distance 7 > 6
    expect(() => applyBattleAction(s, { type: 'attack', unitId: 'p3', targetId: z.id })).toThrow(/ngoài tầm/);
    setTerrain(s, 0, 3, 'hill'); // +1 range on a hill
    expect(applyBattleAction(s, { type: 'attack', unitId: 'p3', targetId: z.id }).events.some((e) => e.type === 'attack')).toBe(true);
    setTerrain(s, 0, 3, 'ground');
    place(s, z.id, 0, -1); // distance 4, rock between
    setTerrain(s, 0, 1, 'rock');
    expect(lineOfSight(s, archer, z)).toBe(false);
    expect(() => applyBattleAction(s, { type: 'attack', unitId: 'p3', targetId: z.id })).toThrow(/nhìn thấy/);
    // Archers can't shoot point-blank; swords only hit adjacent; spears reach 2.
    place(s, z.id, 0, 2);
    expect(() => applyBattleAction(s, { type: 'attack', unitId: 'p3', targetId: z.id })).toThrow(/ngoài tầm/);
    place(s, 'p1', 1, 3);
    place(s, z.id, 1, 1);
    expect(() => applyBattleAction(s, { type: 'attack', unitId: 'p1', targetId: z.id })).toThrow(/ngoài tầm/);
    place(s, 'p2', 1, 3);
    place(s, 'p1', 2, 3);
    expect(applyBattleAction(s, { type: 'attack', unitId: 'p2', targetId: z.id }).events.some((e) => e.type === 'attack')).toBe(true);
  });

  it('computes damage from attack, armour, piercing, cover, class bonuses and defence', () => {
    const s = flatBattle();
    const sw = unit(s, 'p1');
    const cross = unit(s, 'p4');
    const robot = s.units.find((u) => u.kind === 'robot')!;
    place(s, 'p1', 0, 0);
    place(s, robot.id, 0, -1);
    const B = BATTLE_BALANCE;
    const armor = robot.armor * (1 - sw.pierce);
    const expected = Math.round(sw.attack * (1 - armor / (armor + B.armorK)));
    expect(previewAttack(s, sw, robot).damage).toBe(expected);
    // Crossbows pierce armour and are good against machines.
    place(s, 'p4', 0, 3);
    const cArmor = robot.armor * (1 - cross.pierce);
    expect(previewAttack(s, cross, robot).damage).toBe(Math.round(cross.attack * 1.3 * (1 - cArmor / (cArmor + B.armorK))));
    // Cover only reduces ranged damage.
    setTerrain(s, 0, -1, 'fort');
    expect(previewAttack(s, cross, robot).damage).toBeLessThan(Math.round(cross.attack * 1.3 * (1 - cArmor / (cArmor + B.armorK))));
    expect(previewAttack(s, sw, robot).damage).toBe(expected);
    expect(previewAttack(s, cross, robot).hitChance).toBeLessThan(B.hitRanged);
    // Defending halves-ish the damage; spears hit beasts harder.
    robot.statuses.push({ code: 'defending', turns: 1 });
    expect(previewAttack(s, sw, robot).damage).toBe(Math.round(expected * B.defendMultiplier));
    const wolf = { ...robot, kind: 'wolf' as const, category: 'beast' as const, armor: 0, statuses: [] };
    expect(previewAttack(s, unit(s, 'p2'), wolf).damage).toBe(Math.round(unit(s, 'p2').attack * 1.4));
  });

  it('crossbows reload, skills cool down, AP is limited and only your own units obey', () => {
    let s = flatBattle();
    const robot = s.units.find((u) => u.kind === 'robot')!;
    place(s, 'p4', 0, 3);
    place(s, robot.id, 0, -1);
    s = applyBattleAction(s, { type: 'attack', unitId: 'p4', targetId: robot.id }).state;
    expect(unit(s, 'p4').loaded).toBe(false);
    expect(() => applyBattleAction(s, { type: 'attack', unitId: 'p4', targetId: robot.id })).toThrow(/nạp/);
    s = applyBattleAction(s, { type: 'reload', unitId: 'p4' }).state;
    expect(unit(s, 'p4')).toMatchObject({ loaded: true, ap: 0 });
    expect(() => applyBattleAction(s, { type: 'attack', unitId: 'p4', targetId: robot.id })).toThrow(/điểm hành động/);
    expect(() => applyBattleAction(s, { type: 'move', unitId: robot.id, to: { q: 1, r: -1 } })).toThrow(/điều khiển/);
    s = applyBattleAction(s, { type: 'skill', unitId: 'p1', skill: 'shield_wall' }).state;
    expect(() => applyBattleAction(s, { type: 'skill', unitId: 'p1', skill: 'shield_wall' })).toThrow(/hồi/);
    expect(() => applyBattleAction(s, { type: 'skill', unitId: 'p1', skill: 'volley' })).toThrow(/kỹ năng/);
  });

  it('is deterministic: the same actions give the same results (server-side rolls)', () => {
    const run = () => {
      let s = applyBattleAction(createBattleState('rescue_survivors', 99, roster(SQUAD)), { type: 'start' }).state;
      const log: string[] = [];
      for (let i = 0; i < 6 && !s.outcome; i += 1) {
        autoPlayerTurn(s);
        if (s.outcome) break;
        const r = applyBattleAction(s, { type: 'end_turn' });
        s = r.state;
        log.push(JSON.stringify(r.events));
      }
      return { log, units: s.units.map((u) => [u.id, u.hp, u.q, u.r]) };
    };
    expect(run()).toEqual(run());
  });
});

describe('Phase 11 – AI and full battles', () => {
  it('enemy turns always end (bounded decisions) and every mission finishes before its turn limit', () => {
    for (const m of MISSIONS) {
      for (let seed = 1; seed <= 6; seed += 1) {
        let s = applyBattleAction(createBattleState(m.code as MissionCode, seed, roster(SQUAD)), { type: 'start' }).state;
        const enemies = s.units.filter((u) => u.side === 'enemy').length;
        let guard = 0;
        while (!s.outcome && guard < 60) {
          guard += 1;
          autoPlayerTurn(s);
          if (s.outcome) break;
          const r = applyBattleAction(s, { type: 'end_turn' });
          const enemyActions = r.events.filter((e) => (e.type === 'move' || e.type === 'attack' || e.type === 'skill' || e.type === 'defend') && r.state.units.find((u) => u.id === e.unitId)?.side === 'enemy');
          expect(enemyActions.length).toBeLessThanOrEqual(enemies * MAX_DECISIONS * 2);
          s = r.state;
        }
        expect(s.outcome, `${m.code}#${seed}`).not.toBeNull();
        expect(s.turn).toBeLessThanOrEqual(m.turnLimit + 1);
      }
    }
  });

  it('enemies do act: they close in, attack and use their skills', () => {
    let s = applyBattleAction(createBattleState('reclaim_ruins', 3, roster(SQUAD)), { type: 'start' }).state;
    const kinds = new Set<string>();
    for (let i = 0; i < 8 && !s.outcome; i += 1) {
      const r = applyBattleAction(s, { type: 'end_turn' }); // players just wait
      for (const e of r.events) if (e.type === 'attack' || e.type === 'skill' || e.type === 'move') kinds.add(e.type);
      s = r.state;
    }
    expect(kinds.has('move')).toBe(true);
    expect(kinds.has('attack')).toBe(true);
  });

  it('rewards: only a victory pays, scaled by stars; XP for every soldier', () => {
    const s = applyBattleAction(createBattleState('reclaim_ruins', 5, roster(SQUAD)), { type: 'start' }).state;
    for (const u of s.units) if (u.side === 'enemy') u.ko = true;
    const won = applyBattleAction(s, { type: 'defend', unitId: 'p1' }).state;
    expect(won.outcome).toMatchObject({ result: 'victory', reason: 'all_enemies', stars: 3 });
    const r = battleRewards(won);
    expect(r.resources.stone).toBe(Math.round(220 * 1.5));
    expect(Object.keys(r.xp)).toHaveLength(SQUAD.length);
    const lost = applyBattleAction(createBattleState('reclaim_ruins', 5, roster(SQUAD)), { type: 'retreat' }).state;
    expect(lost.outcome).toMatchObject({ result: 'defeat', reason: 'retreat' });
    expect(battleRewards(lost).resources).toEqual({ coins: 0, wood: 0, stone: 0 });
  });
});
