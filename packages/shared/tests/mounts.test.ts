import { describe, expect, it } from 'vitest';
import {
  RIDER_CLASSES,
  TAME_THRESHOLD,
  applyTraining,
  getLivestockFarmDefinition,
  getTrainingProgram,
  initialTraits,
  livestockCapacity,
  mountBlock,
  mountSpeed,
  mountedStats,
  planRanchTiles,
  recipesForFarm,
  simulateLivestock,
  taskBlock,
  trainingBlock,
  trainingDuration,
  unitStats,
  type AxialCoord,
  type LivestockSimState,
} from '../src/index.js';

const block = (n: number): AxialCoord[] => Array.from({ length: n }, (_, i) => ({ q: i % 4, r: Math.floor(i / 4) }));

describe('Phase 9 – stables & camps (Animal Engine)', () => {
  it('stables need ≥ 9 hexes, camps ≥ 12; capacity 4/8/12 and 2/4/6, extra land adds grazing room', () => {
    expect(getLivestockFarmDefinition('horse_stable').minHexes).toBe(9);
    expect(getLivestockFarmDefinition('elephant_camp').minHexes).toBe(12);
    expect([1, 2, 3].map((l) => livestockCapacity('horse_stable', l, 9))).toEqual([4, 8, 12]);
    expect([1, 2, 3].map((l) => livestockCapacity('elephant_camp', l, 12))).toEqual([2, 4, 6]);
    expect(livestockCapacity('horse_stable', 1, 15)).toBe(6);
    expect(livestockCapacity('elephant_camp', 1, 18)).toBe(3);
    // Horses eat grass + feed, elephants grass + plants.
    expect(recipesForFarm('horse_stable').map((r) => r.code)).toEqual(expect.arrayContaining(['fresh_grass', 'corn_grain', 'processed_feed']));
    expect(recipesForFarm('elephant_camp').map((r) => r.code)).toEqual(expect.arrayContaining(['fresh_grass', 'vegetable_scraps']));
  });

  it('plans a training yard, care area and manager house / tower by level', () => {
    const hexes = block(12);
    const roles = (l: number) => planRanchTiles(hexes, l, 'elephant_camp').map((t) => t.role);
    expect(roles(1)).not.toContain('arena');
    expect(roles(2)).toEqual(expect.arrayContaining(['arena', 'vet', 'storage']));
    expect(roles(3)).toEqual(expect.arrayContaining(['arena', 'vet', 'office', 'storage', 'barn', 'water', 'feeder']));
    // Same hexes at every level.
    expect(planRanchTiles(hexes, 3, 'elephant_camp').map((t) => `${t.q},${t.r}`)).toEqual(planRanchTiles(hexes, 1, 'elephant_camp').map((t) => `${t.q},${t.r}`));
  });

  it('elephants eat and drink far more than horses; feed and water are consumed', () => {
    const state = (species: 'horse' | 'elephant'): LivestockSimState => ({
      farmType: species === 'horse' ? 'horse_stable' : 'elephant_camp',
      level: 1,
      hexCount: species === 'horse' ? 9 : 12,
      caretakers: 2,
      waterSource: 'well',
      feedStock: 400,
      feedQuality: 0,
      waterStock: 400,
      animals: [{ id: 'a', species, breed: null, bornAtMs: 0, growsUpAtMs: 0, health: 1, satiety: 0.9, thirst: 0.1 }],
      batch: null,
      readyBatches: 0,
      breeding: [],
    });
    const h = simulateLivestock(state('horse'), 0, 120_000);
    const e = simulateLivestock(state('elephant'), 0, 120_000);
    expect(h.feedUsed).toBeGreaterThan(0);
    expect(h.waterUsed).toBeGreaterThan(0);
    expect(e.feedUsed).toBeGreaterThan(h.feedUsed * 2);
    expect(e.waterUsed).toBeGreaterThan(h.waterUsed * 2);
    expect(h.state.feedStock).toBeLessThan(400);
  });

  it('a horse left without food and water eventually dies (no infinite survival)', () => {
    const s: LivestockSimState = {
      farmType: 'horse_stable',
      level: 1,
      hexCount: 9,
      caretakers: 0,
      waterSource: 'well',
      feedStock: 0,
      feedQuality: 0,
      waterStock: 0,
      animals: [{ id: 'h', species: 'horse', breed: null, bornAtMs: 0, growsUpAtMs: 0, health: 0.8, satiety: 0.5, thirst: 0.5 }],
      batch: null,
      readyBatches: 0,
      breeding: [],
    };
    const day = simulateLivestock(s, 0, 15 * 60_000);
    expect(day.state.animals).toHaveLength(1); // still alive after 15 min
    const later = simulateLivestock(day.state, 15 * 60_000, 4 * 3600_000);
    expect(later.deaths.map((d) => d.id)).toEqual(['h']);
    expect(later.state.animals).toHaveLength(0);
  });
});

describe('Phase 9 – training & mounts', () => {
  const adult = (traits = initialTraits('horse', 'bay')) => ({ species: 'horse' as const, adult: true, health: 1, satiety: 0.9, traits, inUse: false });

  it('untamed horses can be tamed but not ridden, and need the training yard (L2) for riding', () => {
    const wild = initialTraits('horse', 'black');
    expect(wild.tameness).toBeLessThan(TAME_THRESHOLD);
    expect(trainingBlock(getTrainingProgram('taming'), adult(wild), 1)).toBeNull();
    expect(trainingBlock(getTrainingProgram('riding'), adult(wild), 2)).toBe('NOT_TAME');
    const tame = { ...wild, tameness: 0.7 };
    expect(trainingBlock(getTrainingProgram('riding'), adult(tame), 1)).toBe('STABLE_LEVEL_TOO_LOW');
    expect(trainingBlock(getTrainingProgram('riding'), adult(tame), 2)).toBeNull();
    expect(trainingBlock(getTrainingProgram('war'), adult(tame), 3)).toBe('WRONG_SPECIES');
    expect(trainingBlock(getTrainingProgram('taming'), { ...adult(wild), adult: false }, 1)).toBe('ANIMAL_YOUNG');
    expect(trainingBlock(getTrainingProgram('taming'), { ...adult(wild), inUse: true }, 1)).toBe('ANIMAL_IN_USE');
    expect(trainingDuration(getTrainingProgram('riding'), 3)).toBeLessThan(trainingDuration(getTrainingProgram('riding'), 2));
  });

  it('training improves stats (more for well-kept animals) and respects caps', () => {
    const t = initialTraits('horse', 'bay');
    const good = applyTraining('horse', t, getTrainingProgram('taming'), 1, 0.9);
    const poor = applyTraining('horse', t, getTrainingProgram('taming'), 0.3, 0.2);
    expect(good.tameness).toBeGreaterThan(poor.tameness);
    expect(poor.tameness).toBeGreaterThan(t.tameness);
    let x = { ...good, tameness: 1 };
    for (let i = 0; i < 20; i += 1) x = applyTraining('horse', x, getTrainingProgram('speed'), 1, 1);
    expect(x.speedBonus).toBe(4);
    expect(mountSpeed('horse', 'black', x)).toBeGreaterThan(mountSpeed('horse', 'bay', t));
  });

  it('only tame, saddled, adult horses carry suitable riders', () => {
    const tame = { ...initialTraits('horse', 'bay'), tameness: 0.8 };
    const base = { species: 'horse' as const, adult: true, health: 1, traits: tame, saddle: true, inUse: false, training: false };
    expect(mountBlock(base, 'spearman')).toBeNull();
    expect(mountBlock(base, 'archer')).toBeNull();
    expect(RIDER_CLASSES).not.toContain('crossbowman');
    expect(mountBlock(base, 'crossbowman')).toBe('RIDER_NOT_SUITABLE');
    expect(mountBlock({ ...base, traits: initialTraits('horse', 'bay') }, 'spearman')).toBe('NOT_TAME');
    expect(mountBlock({ ...base, saddle: false }, 'spearman')).toBe('NO_SADDLE');
    expect(mountBlock({ ...base, inUse: true }, 'spearman')).toBe('ANIMAL_IN_USE');
    expect(mountBlock({ ...base, species: 'elephant' }, 'spearman')).toBe('NOT_A_HORSE');
    const stats = unitStats('spearman', 1, ['eq_spear', 'eq_leather_armor']);
    const mounted = mountedStats(stats, 'spearman', { speed: 9, trainingLevel: 2, armored: true });
    expect(mounted.speed).toBeGreaterThan(stats.speed * 1.5);
    expect(mounted.hp).toBeGreaterThan(stats.hp);
  });

  it('elephants haul cargo with a harness and join the army reserve once war-trained', () => {
    const t = { ...initialTraits('elephant', 'asian'), tameness: 0.9 };
    const e = { species: 'elephant' as const, adult: true, traits: t, harness: false, inUse: false, training: false };
    expect(taskBlock('transport', e)).toBe('NO_HARNESS');
    expect(taskBlock('transport', { ...e, harness: true })).toBeNull();
    expect(taskBlock('military', e)).toBe('NOT_WAR_TRAINED');
    expect(taskBlock('military', { ...e, traits: { ...t, trainingLevel: 2 } })).toBeNull();
    expect(taskBlock('military', { ...e, species: 'horse' as never, traits: { ...t, trainingLevel: 2 } })).toBe('NOT_AN_ELEPHANT');
  });
});
