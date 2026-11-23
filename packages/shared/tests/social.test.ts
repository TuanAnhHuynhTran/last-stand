import { describe, expect, it } from 'vitest';
import {
  TERRAIN_DEFINITIONS,
  applyBattleAction,
  battleRewards,
  canManage,
  createPvpBattleState,
  eloDelta,
  eloExpected,
  forfeitBattle,
  matchWindows,
  pickOpponent,
  planNextAction,
  timeoutPvpTurn,
  unitStats,
  type BattleState,
  type QueueEntry,
  type RosterEntry,
  type UnitTypeCode,
} from '../src/index.js';

const KIT: Record<UnitTypeCode, string[]> = {
  swordsman: ['eq_saber', 'eq_shield', 'eq_leather_armor'],
  spearman: ['eq_spear', 'eq_leather_armor'],
  archer: ['eq_bow', 'eq_arrows'],
  crossbowman: ['eq_crossbow', 'eq_bolts', 'eq_leather_armor'],
};
const roster = (prefix: string, types: UnitTypeCode[]): RosterEntry[] =>
  types.map((type, i) => ({ sourceId: `${prefix}-${i}`, name: `${prefix}${i}`, type, rank: 2, stats: unitStats(type, 2, KIT[type] as never), health: 1, mounted: false }));
const A: UnitTypeCode[] = ['swordsman', 'spearman', 'archer', 'crossbowman'];

/** Both sides play with the shared planner until the battle ends (bounded). */
function playOut(s: BattleState): BattleState {
  for (let i = 0; i < 2000 && !s.outcome; i += 1) {
    const side = s.activeSide!;
    const next = planNextAction(s, side);
    s = applyBattleAction(s, next ?? { type: 'end_turn' }, side).state;
  }
  return s;
}

describe('Phase 12 – PvP on the battle engine', () => {
  it('builds a mirrored arena with both armies deployed, host to move first', () => {
    const s = createPvpBattleState(77, roster('a', A), roster('b', A));
    expect(s.mode).toBe('pvp');
    expect(s.phase).toBe('player');
    expect(s.activeSide).toBe('player');
    const terrain = new Map(s.tiles.map((t) => [`${t.q},${t.r}`, t.terrain]));
    for (const t of s.tiles) expect(TERRAIN_DEFINITIONS[terrain.get(`${-t.q},${-t.r}`)!].passable).toBe(TERRAIN_DEFINITIONS[t.terrain].passable);
    expect(s.units.filter((u) => u.side === 'player')).toHaveLength(4);
    expect(s.units.filter((u) => u.side === 'enemy')).toHaveLength(4);
    expect(s.units.filter((u) => u.side === 'enemy').every((u) => u.r <= -6)).toBe(true);
    expect(s.itemsB?.bandage).toBe(s.items.bandage);
  });

  it('only the side whose turn it is may act; turns alternate; no AI acts for anyone', () => {
    let s = createPvpBattleState(5, roster('a', A), roster('b', A));
    expect(() => applyBattleAction(s, { type: 'defend', unitId: 'q1' }, 'enemy')).toThrow(/lượt/);
    expect(() => applyBattleAction(s, { type: 'defend', unitId: 'q1' }, 'player')).toThrow(/điều khiển/);
    s = applyBattleAction(s, { type: 'end_turn' }, 'player').state;
    expect(s.activeSide).toBe('enemy');
    expect(s.turn).toBe(1);
    expect(s.units.filter((u) => u.side === 'player').every((u) => u.hp === u.maxHp)).toBe(true); // nobody moved for the guest
    expect(() => applyBattleAction(s, { type: 'end_turn' }, 'player')).toThrow(/lượt/);
    s = applyBattleAction(s, { type: 'end_turn' }, 'enemy').state;
    expect(s.activeSide).toBe('player');
    expect(s.turn).toBe(2);
  });

  it('always finishes: by elimination, forfeit, retreat or the turn limit (HP share)', () => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const end = playOut(createPvpBattleState(seed, roster('a', A), roster('b', A)));
      expect(end.outcome).not.toBeNull();
      expect(['player', 'enemy', null]).toContain(end.outcome!.winner);
      const xp = battleRewards(end).xp;
      expect(Object.keys(xp)).toHaveLength(8); // both sides earn XP
    }
    let s = createPvpBattleState(9, roster('a', A), roster('b', A));
    expect(forfeitBattle(s, 'enemy').state.outcome).toMatchObject({ winner: 'player', reason: 'forfeit' });
    expect(applyBattleAction(s, { type: 'retreat' }, 'enemy').state.outcome).toMatchObject({ winner: 'player', reason: 'retreat' });
    // Server clock ends a slow player's turn.
    s = timeoutPvpTurn(s).state;
    expect(s.activeSide).toBe('enemy');
    // Turn limit with no fighting → equal HP → draw.
    for (let i = 0; i < 40 && !s.outcome; i += 1) s = applyBattleAction(s, { type: 'end_turn' }, s.activeSide!).state;
    expect(s.outcome).toMatchObject({ reason: 'time', winner: null });
  });
});

describe('Phase 12 – rating & matchmaking', () => {
  it('Elo: favourites gain little, upsets gain a lot; provisional players move faster', () => {
    expect(eloExpected(1000, 1000)).toBeCloseTo(0.5);
    expect(eloDelta(1400, 1000, 1, 50)).toBeLessThan(eloDelta(1000, 1400, 1, 50));
    expect(eloDelta(1000, 1000, 1, 2)).toBeGreaterThan(eloDelta(1000, 1000, 1, 50));
    expect(eloDelta(1000, 1000, 0.5, 50)).toBe(0);
  });

  it('matches close rating and squad power; protects newcomers from much stronger squads', () => {
    const now = 1_000_000;
    const me: QueueEntry = { userId: 'me', rating: 1000, games: 2, power: 300, enqueuedAtMs: now - 5000 };
    const strong: QueueEntry = { userId: 'strong', rating: 1010, games: 40, power: 600, enqueuedAtMs: now - 60_000 };
    const fair: QueueEntry = { userId: 'fair', rating: 1080, games: 3, power: 320, enqueuedAtMs: now - 3000 };
    expect(pickOpponent(me, [strong, fair], now)?.userId).toBe('fair');
    expect(pickOpponent(me, [strong], now)).toBeNull(); // too strong for a newcomer right now
    expect(pickOpponent({ ...me, rating: 1900 }, [fair], now)).toBeNull(); // rating window
    expect(matchWindows(600).rating).toBe(600); // windows widen but stay bounded
    expect(matchWindows(600).powerRatio).toBe(2);
  });

  it('alliance roles: officers manage members but never officers or the leader', () => {
    expect(canManage('leader', 'officer', 'kick')).toBe(true);
    expect(canManage('officer', 'member', 'kick')).toBe(true);
    expect(canManage('officer', 'officer', 'kick')).toBe(false);
    expect(canManage('officer', 'leader', 'kick')).toBe(false);
    expect(canManage('member', 'member', 'invite')).toBe(false);
    expect(canManage('officer', 'member', 'promote')).toBe(false);
  });
});
