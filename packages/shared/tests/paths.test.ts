import { describe, expect, it } from 'vitest';
import { WorldGenerator, checkPlacement, hexKey, pathEdgeKey, pathNeighbor, pathEndpoints, pathTouchedHexes } from '../src/index.js';

const world = new WorldGenerator('CV-COA-AABBCC112233');
const anchor = { q: world.spawn.q, r: world.spawn.r };
describe('Narrow edge paths', () => {
  it('uses the same identity from either side, for all rotations', () => {
    for (let r = 0; r < 6; r++) {
      const other = pathNeighbor(anchor, r);
      expect(pathEdgeKey(anchor, r)).toBe(pathEdgeKey(other, (r + 3) % 6));
      const a = pathEndpoints(anchor, r), b = pathEndpoints(other, (r + 3) % 6);
      expect(a[0].x).toBeCloseTo(b[1].x); expect(a[0].z).toBeCloseTo(b[1].z);
    }
  });
  it('permits side paths alongside a house but blocks duplicates and internal compound edges', () => {
    const occupied = new Map([[hexKey(anchor.q, anchor.r), 'house']]);
    expect(checkPlacement(world, 'road', anchor, 0, occupied).valid).toBe(true);
    occupied.set(pathEdgeKey(anchor, 0), 'road');
    expect(checkPlacement(world, 'road', pathNeighbor(anchor, 0), 3, occupied).valid).toBe(false);
    expect(checkPlacement(world, 'road', anchor, 1, occupied).valid).toBe(true);
    expect(checkPlacement(world, 'road', anchor, 0, occupied, 'road').valid).toBe(true);
    occupied.delete(pathEdgeKey(anchor, 0));
    const n = pathNeighbor(anchor, 0); occupied.set(hexKey(n.q, n.r), 'house');
    expect(checkPlacement(world, 'road', anchor, 0, occupied).valid).toBe(false);
  });
  it('checks ownership at rounded joins too, and blocks water, fields and world bounds', () => {
    const touched = pathTouchedHexes(anchor, 0);
    expect(touched.length).toBeGreaterThan(2);
    const corner = touched[2];
    const restricted = { getHexTile: world.getHexTile.bind(world), isOwned: (q: number, r: number) => q !== corner.q || r !== corner.r };
    expect(checkPlacement(restricted, 'road', anchor, 0, new Map()).issues).toContain('NOT_OWNED');
    const water = { isOwned: () => true, getHexTile: (q: number, r: number) => ({ ...world.getHexTile(q, r), buildable: false }) };
    expect(checkPlacement(water, 'road', anchor, 0, new Map()).issues).toContain('TERRAIN_BLOCKED');
    expect(checkPlacement(world, 'road', anchor, 0, new Map([[hexKey(anchor.q, anchor.r), 'farm:f']])).issues).toContain('FARMLAND');
    expect(checkPlacement(world, 'road', { q: 1000, r: 0 }, 0, new Map()).issues).toContain('OUT_OF_BOUNDS');
  });
  it('leaves a plot buildable but prevents a building from swallowing an existing path', () => {
    const occupied = new Map([[pathEdgeKey(anchor, 0), 'road']]);
    expect(checkPlacement(world, 'house', anchor, 0, occupied).valid).toBe(true);
    expect(checkPlacement(world, 'storage', anchor, 0, occupied).valid).toBe(false);
  });
});
