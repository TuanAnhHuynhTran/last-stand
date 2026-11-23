import { describe, expect, it } from 'vitest';
import { getConnectedHexes, hexKey, type AxialCoord } from '../src/hex/hexMath.js';
import { WorldGenerator } from '../src/worldgen/WorldGenerator.js';
import { checkPlacement } from '../src/buildings/footprint.js';
import { checkFarmZoneShape } from '../src/farming/zone.js';
import {
  ANIMAL_TYPE_DEFINITIONS,
  FEED_RECIPE_DEFINITIONS,
  LIVESTOCK_FARM_DEFINITIONS,
  MAX_LIVESTOCK_FARM_HEXES,
  animalAgeFactor,
  animalGrowth,
  animalPrice,
  caretakersNeeded,
  feedCapacity,
  getAnimalDefinition,
  getLivestockFarmDefinition,
  laborFactor,
  livestockCapacity,
  livestockCreateCost,
  livestockCycleSeconds,
  livestockExpandCost,
  livestockUpgradeCost,
  planRanchTiles,
  ranchOccupant,
  recipesForFarm,
} from '../src/livestock/definitions.js';
import {
  animalStatus,
  canBreed,
  meatFromAnimal,
  simulateLivestock,
  type LivestockSimState,
  type SimAnimalState,
} from '../src/livestock/simulation.js';

const world = new WorldGenerator('CV-COA-AABBCC112233');
const farmable = (h: AxialCoord) => world.isOwned(h.q, h.r) && world.getHexTile(h.q, h.r).buildable;
const region = (n: number) => getConnectedHexes({ q: world.spawn.q, r: world.spawn.r }, farmable, n);
const MIN = 60_000;

function adult(id: string, species: SimAnimalState['species'] = 'chicken', over: Partial<SimAnimalState> = {}): SimAnimalState {
  return { id, species, breed: null, bornAtMs: -10 * MIN, growsUpAtMs: -1, health: 1, satiety: 1, thirst: 0, ...over };
}

function farm(over: Partial<LivestockSimState> = {}): LivestockSimState {
  return {
    farmType: 'chicken_farm',
    level: 1,
    hexCount: 6,
    caretakers: 1,
    waterSource: 'lake',
    feedStock: 640,
    feedQuality: 0,
    waterStock: 480,
    animals: [adult('a'), adult('b'), adult('c'), adult('d')],
    batch: null,
    readyBatches: 0,
    breeding: [],
    ...over,
  };
}

describe('Livestock catalogue', () => {
  it('has chicken, pig, cattle and goat/sheep farms with the required minimum sizes and 3 levels', () => {
    const min = Object.fromEntries(LIVESTOCK_FARM_DEFINITIONS.map((d) => [d.code, d.minHexes]));
    expect(min).toEqual({ chicken_farm: 6, pig_farm: 6, cattle_farm: 9, sheep_farm: 6, horse_stable: 9, elephant_camp: 12 });
    for (const def of LIVESTOCK_FARM_DEFINITIONS) {
      expect(def.levels.map((l) => l.level)).toEqual([1, 2, 3]);
      expect(def.levels.map((l) => l.nursery)).toEqual([false, false, true]);
      expect(def.levels.map((l) => l.pipedWater)).toEqual([false, false, true]);
      for (let i = 1; i < 3; i += 1) {
        expect(def.levels[i].capacityMultiplier).toBeGreaterThan(def.levels[i - 1].capacityMultiplier);
        expect(def.levels[i].yieldMultiplier).toBeGreaterThan(def.levels[i - 1].yieldMultiplier);
        expect(def.levels[i].features.length).toBeGreaterThanOrEqual(def.levels[i - 1].features.length);
      }
      for (const a of def.animals) expect(ANIMAL_TYPE_DEFINITIONS.find((x) => x.code === a)?.farmType).toBe(def.code);
      expect(recipesForFarm(def.code).length).toBeGreaterThanOrEqual(2);
    }
    expect(getLivestockFarmDefinition('sheep_farm').animals).toEqual(['sheep', 'goat']);
  });

  it('products match the design: chicken eggs+meat, pig meat+manure, cattle milk+meat+draft, sheep/goat milk+meat+wool', () => {
    const products = (code: Parameters<typeof getLivestockFarmDefinition>[0]) => {
      const def = getLivestockFarmDefinition(code);
      const periodic = def.animals.flatMap((a) => Object.keys(getAnimalDefinition(a).products));
      return [...new Set([...periodic, 'meat'])].sort();
    };
    expect(products('chicken_farm')).toEqual(['eggs', 'meat']);
    expect(products('pig_farm')).toEqual(['manure', 'meat']);
    expect(products('cattle_farm')).toEqual(['draft', 'meat', 'milk']);
    expect(products('sheep_farm')).toEqual(['meat', 'milk', 'wool']);
  });

  it('feed recipes turn corn, grass, rice by-products and vegetables into nutrition; processed feed is best', () => {
    const used = new Set(FEED_RECIPE_DEFINITIONS.flatMap((r) => Object.keys(r.ingredients)));
    for (const p of ['corn', 'hay', 'rice', 'vegetables']) expect(used).toContain(p);
    const processed = FEED_RECIPE_DEFINITIONS.find((r) => r.code === 'processed_feed')!;
    expect(processed.quality).toBe(Math.max(...FEED_RECIPE_DEFINITIONS.map((r) => r.quality)));
    for (const a of ANIMAL_TYPE_DEFINITIONS) expect(FEED_RECIPE_DEFINITIONS.some((r) => r.species.includes(a.code))).toBe(true);
  });

  it('breeds change price and yields', () => {
    expect(animalPrice('chicken', 'leghorn')).toBeGreaterThan(animalPrice('chicken', 'ri'));
    expect(animalPrice('chicken', null)).toBe(getAnimalDefinition('chicken').price);
    expect(meatFromAnimal({ species: 'pig', breed: 'yorkshire', health: 1 })).toBeGreaterThan(meatFromAnimal({ species: 'pig', breed: 'mong_cai', health: 1 }));
    expect(meatFromAnimal({ species: 'pig', breed: null, health: 0.2 })).toBeLessThan(meatFromAnimal({ species: 'pig', breed: null, health: 1 }));
  });
});

describe('Livestock farm shape & tiles', () => {
  it('enforces the per-type minimum (cattle needs 9 hexes)', () => {
    const none = new Map<string, string>();
    const opts = (code: 'chicken_farm' | 'cattle_farm') => ({ minHexes: getLivestockFarmDefinition(code).minHexes, maxHexes: MAX_LIVESTOCK_FARM_HEXES });
    expect(checkFarmZoneShape(world, region(5), none, opts('chicken_farm')).issues).toContain('TOO_SMALL');
    expect(checkFarmZoneShape(world, region(6), none, opts('chicken_farm')).valid).toBe(true);
    expect(checkFarmZoneShape(world, region(8), none, opts('cattle_farm')).issues).toContain('TOO_SMALL');
    expect(checkFarmZoneShape(world, region(9), none, opts('cattle_farm')).valid).toBe(true);
  });

  it('farms, fields and buildings block each other', () => {
    const hexes = region(6);
    const occ = new Map([[hexKey(hexes[0].q, hexes[0].r), ranchOccupant('r1')]]);
    expect(checkPlacement(world, 'house', hexes[0], 0, occ).issues).toEqual(['OCCUPIED']);
    expect(checkFarmZoneShape(world, hexes, occ).issues).toContain('OCCUPIED');
  });

  it('plans a barn, feeder, water trough and caretaker spot on every farm; storage at L2; nursery & waste at L3', () => {
    const roles = (n: number, level: number) => planRanchTiles(region(n), level).map((t) => t.role);
    for (const r of ['barn', 'feeder', 'water', 'caretaker']) expect(roles(6, 1)).toContain(r);
    expect(roles(6, 1)).not.toContain('storage');
    expect(roles(9, 2)).toContain('storage');
    const l3 = roles(12, 3);
    for (const r of ['storage', 'nursery', 'waste']) expect(l3).toContain(r);
    // One role per hex, deterministic, same hexes back.
    const tiles = planRanchTiles(region(12), 3);
    expect(tiles).toHaveLength(12);
    expect(planRanchTiles(region(12), 3)).toEqual(tiles);
    expect(tiles.filter((t) => t.role === 'barn')).toHaveLength(1);
  });
});

describe('Capacity, costs and growth', () => {
  it('capacity grows with size and level', () => {
    expect(livestockCapacity('chicken_farm', 1, 6)).toBe(12);
    expect(livestockCapacity('chicken_farm', 3, 6)).toBe(24);
    expect(livestockCapacity('cattle_farm', 1, 9)).toBe(4);
    expect(livestockCapacity('cattle_farm', 2, 12)).toBeGreaterThan(livestockCapacity('cattle_farm', 1, 12));
    expect(feedCapacity('pig_farm', 3, 6)).toBe(3 * feedCapacity('pig_farm', 1, 6));
  });

  it('upgrade / expand costs increase; cycles get shorter at higher levels', () => {
    expect(livestockUpgradeCost('pig_farm', 1, 6)).toBeNull();
    expect(livestockUpgradeCost('pig_farm', 3, 6)!.coins).toBeGreaterThan(livestockUpgradeCost('pig_farm', 2, 6)!.coins);
    expect(livestockCreateCost('cattle_farm', 9).coins).toBeGreaterThan(livestockCreateCost('cattle_farm', 6).coins);
    expect(livestockExpandCost('pig_farm', 3, 2).coins).toBeGreaterThan(livestockExpandCost('pig_farm', 1, 2).coins);
    expect(livestockCycleSeconds('chicken_farm', 3, ['chicken'])).toBeLessThan(livestockCycleSeconds('chicken_farm', 1, ['chicken']));
    expect(livestockCycleSeconds('sheep_farm', 1, ['sheep', 'goat'])).toBe(getAnimalDefinition('sheep').productionSeconds);
  });

  it('growth 0 → 1; age factor: young 0, prime 1, old declines', () => {
    expect(animalGrowth(0, 1000, 500)).toBe(0.5);
    expect(animalGrowth(0, 1000, 5000)).toBe(1);
    const life = getAnimalDefinition('chicken').lifespanSeconds * 1000;
    expect(animalAgeFactor('chicken', 0, 1000, 500)).toBe(0);
    expect(animalAgeFactor('chicken', 0, 1000, life * 0.5)).toBe(1);
    expect(animalAgeFactor('chicken', 0, 1000, life)).toBe(0.5);
  });

  it('labour: caretakers needed per herd size', () => {
    expect(caretakersNeeded([])).toBe(0);
    expect(caretakersNeeded(Array(12).fill('chicken'))).toBe(1);
    expect(caretakersNeeded(Array(13).fill('chicken'))).toBe(2);
    expect(laborFactor(0, 2)).toBeCloseTo(0.6);
    expect(laborFactor(2, 2)).toBe(1);
  });
});

describe('Timestamp simulation', () => {
  const cycle = livestockCycleSeconds('chicken_farm', 1, ['chicken']) * 1000;

  it('well-fed adults produce a full batch per cycle and eat from the feed store', () => {
    const res = simulateLivestock(farm(), 0, cycle);
    expect(res.finished).toHaveLength(1);
    expect(res.finished[0].output.eggs).toBe(12); // 4 hens × 3 eggs
    expect(res.finished[0].efficiency).toBeGreaterThan(0.95);
    expect(res.state.readyBatches).toBe(1);
    expect(res.state.feedStock).toBeLessThan(640);
    expect(res.feedUsed).toBeCloseTo(4 * 15 * (cycle / MIN), 0);
  });

  it('production pauses once the ready batches fill the storage (no infinite production)', () => {
    const res = simulateLivestock(farm({ feedStock: 99999 }), 0, 50 * cycle);
    expect(res.state.readyBatches).toBe(1); // level 1 holds one batch
    expect(res.finished).toHaveLength(1);
    expect(res.state.batch).toBeNull();
    const l3 = simulateLivestock(farm({ level: 3, feedStock: 99999 }), 0, 50 * cycle);
    expect(l3.state.readyBatches).toBe(3);
  });

  it('missing feed lowers satiety, health and output; nothing to eat means no new batch', () => {
    const fed = simulateLivestock(farm({ feedStock: 99999 }), 0, cycle).finished[0].output.eggs!;
    const starving = simulateLivestock(farm({ feedStock: 0, animals: ['a', 'b', 'c', 'd'].map((id) => adult(id, 'chicken', { satiety: 0.5 })) }), 0, cycle);
    const out = starving.finished[0]?.output.eggs ?? 0;
    expect(out).toBeLessThan(fed);
    expect(starving.state.animals[0].satiety).toBeLessThan(0.5);
    // After a long hunger, no batch even starts and health has dropped.
    const long = simulateLivestock(farm({ feedStock: 0 }), 0, 60 * MIN);
    expect(long.state.animals.every((a) => a.health < 0.5)).toBe(true);
    expect(long.state.animals.every((a) => animalStatus(a, 60 * MIN) !== 'healthy')).toBe(true);
    const later = simulateLivestock(long.state, 60 * MIN, 60 * MIN + 3 * cycle);
    expect(later.finished.reduce((s, f) => s + (f.output.eggs ?? 0), 0)).toBe(0);
  });

  it('a well without caretakers runs dry → thirst; a lake keeps the troughs full', () => {
    const dry = simulateLivestock(farm({ waterSource: 'well', caretakers: 0, waterStock: 20, feedStock: 99999 }), 0, 30 * MIN);
    expect(dry.state.waterStock).toBeCloseTo(0, 1);
    expect(dry.state.animals[0].thirst).toBeGreaterThan(0.9);
    const lake = simulateLivestock(farm({ waterSource: 'lake', caretakers: 0, waterStock: 20, feedStock: 99999 }), 0, 30 * MIN);
    expect(lake.state.animals[0].thirst).toBeLessThan(0.1);
    // Level 3 has piped water even on a well.
    const piped = simulateLivestock(farm({ level: 3, waterSource: 'well', caretakers: 0, waterStock: 0, feedStock: 99999 }), 0, 30 * MIN);
    expect(piped.state.animals[0].thirst).toBeLessThan(0.1);
  });

  it('young animals do not produce; level and feed quality raise output', () => {
    const young = simulateLivestock(farm({ animals: [adult('y', 'chicken', { growsUpAtMs: 10 * cycle })] }), 0, cycle);
    expect(young.finished).toHaveLength(0);
    const base = simulateLivestock(farm({ feedStock: 99999 }), 0, cycle).finished[0].output.eggs!;
    const lvl3 = simulateLivestock(farm({ level: 3, feedStock: 99999 }), 0, livestockCycleSeconds('chicken_farm', 3, ['chicken']) * 1000).finished[0].output.eggs!;
    const rich = simulateLivestock(farm({ feedStock: 99999, feedQuality: 0.25 }), 0, cycle).finished[0].output.eggs!;
    expect(lvl3).toBeGreaterThan(base);
    expect(rich).toBeGreaterThan(base);
  });

  it('breeding ends in a newborn only while there is room', () => {
    const job = { id: 'b1', species: 'chicken' as const, breed: null, finishesAtMs: 1000 };
    const ok = simulateLivestock(farm({ breeding: [job] }), 0, 2000);
    expect(ok.births).toHaveLength(1);
    expect(ok.state.animals).toHaveLength(5);
    expect(ok.endedBreeding).toEqual(['b1']);
    const full = simulateLivestock(farm({ animals: Array.from({ length: 12 }, (_, i) => adult(`a${i}`)), breeding: [job] }), 0, 2000);
    expect(full.births).toHaveLength(0);
    expect(full.state.animals).toHaveLength(12);
    // Nursery (L3) shortens growth of the newborn.
    const l3 = simulateLivestock(farm({ level: 3, breeding: [job] }), 0, 2000).births[0];
    expect(l3.growsUpAtMs - l3.bornAtMs).toBeLessThan(ok.births[0].growsUpAtMs - ok.births[0].bornAtMs);
  });

  it('breeding needs two healthy, fed adults of the species', () => {
    expect(canBreed([adult('a'), adult('b')], 'chicken', 0)).toBe(true);
    expect(canBreed([adult('a'), adult('b', 'chicken', { health: 0.3 })], 'chicken', 0)).toBe(false);
    expect(canBreed([adult('a'), adult('b', 'chicken', { growsUpAtMs: 5 })], 'chicken', 0)).toBe(false);
  });

  it('long offline spans stay bounded and deterministic', () => {
    const a = simulateLivestock(farm({ feedStock: 400 }), 0, 7 * 24 * 60 * MIN);
    const b = simulateLivestock(farm({ feedStock: 400 }), 0, 7 * 24 * 60 * MIN);
    expect(a.simulatedToMs).toBe(7 * 24 * 60 * MIN);
    expect(a.state).toEqual(b.state);
    expect(a.state.feedStock).toBe(0);
  });

  it('applies upgrades that completed during the span from their completion time', () => {
    const res = simulateLivestock(farm({ feedStock: 99999 }), 0, cycle, [{ atMs: cycle / 2, level: 2 }]);
    expect(res.state.level).toBe(2);
    expect(res.finished[0].output.eggs).toBeGreaterThan(12);
  });
});
