import { describe, expect, it } from 'vitest';
import { forEachHexInWorld, hexDistance, hexKey, isConnectedRegion } from '../src/hex/hexMath.js';
import {
  STARTER_TERRITORY_SIZE,
  WorldGenerator,
  type HexTerrainType,
} from '../src/worldgen/WorldGenerator.js';
import { SimplexNoise2D, createRng, hashSeed } from '../src/worldgen/noise.js';

const SEED_A = 'CV-COA-AABBCC112233';
const SEED_B = 'LH-SEED-0002';

function fingerprint(gen: WorldGenerator): string {
  const parts: string[] = [];
  for (let x = -480; x <= 480; x += 60) {
    for (let z = -480; z <= 480; z += 60) {
      parts.push(gen.terrain.heightAt(x, z).toFixed(4));
    }
  }
  return parts.join('|');
}

describe('Seeded noise', () => {
  it('is deterministic per seed', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 20; i += 1) expect(a()).toBe(b());
    expect(new SimplexNoise2D(7).fbm(1.3, -4.2, 4)).toBe(new SimplexNoise2D(7).fbm(1.3, -4.2, 4));
  });

  it('stays within [-1, 1]', () => {
    const n = new SimplexNoise2D(3);
    for (let i = 0; i < 2000; i += 1) {
      expect(Math.abs(n.noise(i * 0.137, i * -0.291))).toBeLessThanOrEqual(1);
    }
  });
});

describe('WorldGenerator – determinism', () => {
  it('the same world_seed always produces the same terrain and starter land', () => {
    const a = new WorldGenerator(SEED_A);
    const b = new WorldGenerator(SEED_A);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(a.spawn).toEqual(b.spawn);
    expect(a.getStarterTerritory()).toEqual(b.getStarterTerritory());
    for (const [q, r] of [
      [0, 0],
      [12, -30],
      [-40, 44],
    ]) {
      expect(a.getHexTile(q, r)).toEqual(b.getHexTile(q, r));
    }
  });

  it('two different seeds produce different layouts', () => {
    const a = new WorldGenerator(SEED_A);
    const b = new WorldGenerator(SEED_B);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
    let differentTypes = 0;
    let total = 0;
    forEachHexInWorld((q, r) => {
      if ((q + r) % 7 !== 0) return;
      total += 1;
      if (a.getHexTile(q, r).type !== b.getHexTile(q, r).type) differentTypes += 1;
    });
    expect(differentTypes / total).toBeGreaterThan(0.3);
  });
});

describe('WorldGenerator – terrain content', () => {
  const gen = new WorldGenerator(SEED_A);
  const counts = new Map<HexTerrainType, number>();
  let sameAsNeighbour = 0;
  let neighbourPairs = 0;
  forEachHexInWorld((q, r) => {
    const t = gen.getHexTile(q, r);
    counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
    if ((q + 2 * r) % 3 === 0) {
      neighbourPairs += 1;
      if (gen.getHexTile(q + 1, r).type === t.type) sameAsNeighbour += 1;
    }
  });

  it('generates every terrain type', () => {
    const required: HexTerrainType[] = [
      'dirt',
      'grassland',
      'farmland',
      'forest',
      'hill',
      'low_mountain',
      'lake',
      'river',
      'riverbank',
      'ruins',
    ];
    for (const type of required) expect(counts.get(type) ?? 0, type).toBeGreaterThan(0);
  });

  it('biomes form continuous regions rather than per-hex noise', () => {
    // Independent random assignment over 10 types would give roughly 10–20 % agreement.
    expect(sameAsNeighbour / neighbourPairs).toBeGreaterThan(0.55);
  });

  it('builds a connected starter territory of ~115 flat, buildable hexes', () => {
    const territory = gen.getStarterTerritory();
    expect(territory).toHaveLength(STARTER_TERRITORY_SIZE);
    expect(isConnectedRegion(territory)).toBe(true);
    const spawn = { q: gen.spawn.q, r: gen.spawn.r };
    for (const h of territory) {
      const tile = gen.getHexTile(h.q, h.r);
      expect(tile.buildable).toBe(true);
      expect(tile.isWater).toBe(false);
      expect(tile.slope).toBeLessThan(1.6);
      expect(hexDistance(spawn, h)).toBeLessThanOrEqual(7);
      expect(gen.isOwned(h.q, h.r)).toBe(true);
    }
    // 115 × 86.6 m² ≈ 10 000 m² (≈ 100 × 100).
    expect(territory.length * 86.6).toBeGreaterThan(9_500);
    expect(territory.length * 86.6).toBeLessThan(10_500);
  });

  it('border edges belong to owned hexes facing unowned ones', () => {
    const owned = new Set(gen.getStarterTerritory().map((h) => hexKey(h.q, h.r)));
    const edges = gen.getTerritoryBorderEdges();
    expect(edges.length).toBeGreaterThan(30);
    for (const e of edges) expect(owned.has(hexKey(e.q, e.r))).toBe(true);
  });

  it('produces a valid starter territory for many seeds', () => {
    for (const seed of ['a', 'b', 'c', 'world-42', 'LH-777']) {
      const g = new WorldGenerator(seed);
      expect(g.getStarterTerritory()).toHaveLength(STARTER_TERRITORY_SIZE);
      expect(isConnectedRegion(g.getStarterTerritory())).toBe(true);
    }
  });
});
