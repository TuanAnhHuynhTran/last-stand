import { describe, expect, it } from 'vitest';
import {
  HEX_DIRECTIONS,
  HEX_RADIUS,
  HEX_SPACING,
  axialToOffset,
  axialToWorld,
  forEachHexInWorld,
  getConnectedHexes,
  getHexEdgeCorners,
  getHexPolygon,
  getWorldBounds,
  hexDisk,
  hexDistance,
  hexKey,
  hexNeighbor,
  hexNeighbors,
  hexRange,
  hexRing,
  hexRound,
  isConnectedRegion,
  isFootprintWithinBounds,
  isWithinWorldBounds,
  offsetToAxial,
  worldToAxial,
} from '../src/hex/hexMath.js';
import {
  WORLD_CHUNKS_PER_SIDE,
  WORLD_TOTAL_CHUNKS,
  distanceToWorldChunk,
  getChunkHexes,
  getWorldChunksInRadius,
  hexToChunk,
} from '../src/hex/hexChunks.js';

const SAMPLE_HEXES = [
  { q: 0, r: 0 },
  { q: 3, r: -2 },
  { q: -7, r: 11 },
  { q: 25, r: -40 },
  { q: -48, r: 57 },
];

describe('HexMath – coordinate conversion', () => {
  it('places hex centres per the design formula (spacing 10, pointy-top)', () => {
    expect(axialToWorld(0, 0)).toEqual({ x: 0, z: 0 });
    expect(axialToWorld(1, 0)).toEqual({ x: 10, z: 0 });
    const p = axialToWorld(0, 1);
    expect(p.x).toBeCloseTo(5, 10);
    expect(p.z).toBeCloseTo(8.660254, 5);
    expect(HEX_RADIUS).toBeCloseTo(5.7735, 4);
  });

  it('adjacent hex centres are exactly 10 units apart in all 6 directions', () => {
    for (const d of HEX_DIRECTIONS) {
      const a = axialToWorld(4, -3);
      const b = axialToWorld(4 + d.q, -3 + d.r);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(HEX_SPACING, 10);
    }
  });

  it('worldToAxial inverts axialToWorld for every in-world hex', () => {
    let count = 0;
    forEachHexInWorld((q, r) => {
      const w = axialToWorld(q, r);
      expect(worldToAxial(w.x, w.z)).toEqual({ q, r });
      count += 1;
    });
    expect(count).toBeGreaterThan(11_000);
  });

  it('points inside a hex resolve to it; points just past an edge resolve to that neighbour', () => {
    for (const h of SAMPLE_HEXES) {
      const c = axialToWorld(h.q, h.r);
      const poly = getHexPolygon(h.q, h.r);
      for (let i = 0; i < 6; i += 1) {
        for (const frac of [0.2, 0.6, 0.97]) {
          const x = c.x + (poly[i].x - c.x) * frac;
          const z = c.z + (poly[i].z - c.z) * frac;
          expect(worldToAxial(x, z)).toEqual(h);
        }
        const [a, b] = getHexEdgeCorners(i);
        const mx = (poly[a].x + poly[b].x) / 2;
        const mz = (poly[a].z + poly[b].z) / 2;
        const out = worldToAxial(c.x + (mx - c.x) * 1.03, c.z + (mz - c.z) * 1.03);
        expect(out).toEqual(hexNeighbor(h, i));
      }
    }
  });

  it('hexRound picks the nearest cube coordinate and never returns -0', () => {
    expect(hexRound(0.4, 0.4)).toEqual({ q: 0, r: 1 });
    expect(hexRound(-0.2, 0.1)).toEqual({ q: 0, r: 0 });
    expect(Object.is(hexRound(-0.1, -0.1).q, -0)).toBe(false);
    expect(hexRound(2.6, -1.1)).toEqual({ q: 3, r: -1 });
  });

  it('axial ↔ odd-r offset round-trips', () => {
    for (const h of SAMPLE_HEXES) {
      const o = axialToOffset(h.q, h.r);
      expect(offsetToAxial(o.col, o.row)).toEqual(h);
    }
  });
});

describe('HexMath – distance, neighbours, rings', () => {
  it('neighbours are the 6 doc directions at distance 1', () => {
    const center = { q: 2, r: 5 };
    const nbs = hexNeighbors(center);
    expect(nbs).toEqual([
      { q: 3, r: 5 },
      { q: 3, r: 4 },
      { q: 2, r: 4 },
      { q: 1, r: 5 },
      { q: 1, r: 6 },
      { q: 2, r: 6 },
    ]);
    for (const n of nbs) expect(hexDistance(center, n)).toBe(1);
  });

  it('hexDistance matches known values and is symmetric', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -3 })).toBe(3);
    expect(hexDistance({ q: -2, r: 1 }, { q: 4, r: -1 })).toBe(6);
    expect(hexDistance({ q: 4, r: -1 }, { q: -2, r: 1 })).toBe(6);
    expect(hexDistance({ q: 1, r: 2 }, { q: -3, r: 5 })).toBe(4);
  });

  it('hexDistance agrees with BFS step counts on the hex graph', () => {
    const origin = { q: 0, r: 0 };
    const depth = new Map<string, number>([[hexKey(0, 0), 0]]);
    const queue = [origin];
    while (queue.length) {
      const cur = queue.shift()!;
      const d = depth.get(hexKey(cur.q, cur.r))!;
      if (d === 6) continue;
      for (const n of hexNeighbors(cur)) {
        if (!depth.has(hexKey(n.q, n.r))) {
          depth.set(hexKey(n.q, n.r), d + 1);
          queue.push(n);
        }
      }
    }
    expect(depth.size).toBe(127);
    for (const [key, d] of depth) {
      const [q, r] = key.split(',').map(Number);
      expect(hexDistance(origin, { q, r })).toBe(d);
    }
  });

  it('rings, disks and ranges have the right sizes and distances', () => {
    const c = { q: 5, r: -2 };
    expect(hexRing(c, 0)).toEqual([c]);
    for (let k = 1; k <= 6; k += 1) {
      const ring = hexRing(c, k);
      expect(ring).toHaveLength(6 * k);
      expect(new Set(ring.map((h) => hexKey(h.q, h.r))).size).toBe(6 * k);
      for (const h of ring) expect(hexDistance(c, h)).toBe(k);
    }
    expect(hexDisk(c, 6)).toHaveLength(127);
    expect(hexRange(c, 6)).toHaveLength(127);
    const band = hexRange(c, 4, 2);
    expect(band).toHaveLength(61 - 7);
    for (const h of band) {
      const d = hexDistance(c, h);
      expect(d >= 2 && d <= 4).toBe(true);
    }
  });

  it('getConnectedHexes flood-fills only through allowed hexes', () => {
    const allowed = new Set(hexDisk({ q: 0, r: 0 }, 2).map((h) => hexKey(h.q, h.r)));
    allowed.add(hexKey(10, 10)); // isolated island
    const region = getConnectedHexes({ q: 0, r: 0 }, (h) => allowed.has(hexKey(h.q, h.r)));
    expect(region).toHaveLength(19);
    expect(isConnectedRegion(region)).toBe(true);
    expect(isConnectedRegion([...region, { q: 10, r: 10 }])).toBe(false);
    expect(getConnectedHexes({ q: 0, r: 0 }, () => true, 50)).toHaveLength(50);
  });
});

describe('HexMath – world bounds', () => {
  it('world is a 1000 × 1000 square centred on the origin', () => {
    expect(getWorldBounds()).toEqual({ minX: -500, maxX: 500, minZ: -500, maxZ: 500 });
  });

  it('a hex is in bounds only if its whole polygon is', () => {
    expect(isWithinWorldBounds(0, 0)).toBe(true);
    expect(isWithinWorldBounds(49, 0)).toBe(true); // x = 495, right edge exactly 500
    expect(isWithinWorldBounds(50, 0)).toBe(false); // centre on the border
    expect(isWithinWorldBounds(-28, 57)).toBe(true); // z ≈ 493.6 + 5.77 < 500
    expect(isWithinWorldBounds(-29, 58)).toBe(false);

    forEachHexInWorld((q, r) => {
      for (const p of getHexPolygon(q, r)) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(500 + 1e-9);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(500 + 1e-9);
      }
    });
  });

  it('footprint check rejects a footprint with any hex outside', () => {
    expect(isFootprintWithinBounds([{ q: 48, r: 0 }, { q: 49, r: 0 }])).toBe(true);
    expect(isFootprintWithinBounds([{ q: 49, r: 0 }, { q: 50, r: 0 }])).toBe(false);
    expect(isFootprintWithinBounds([])).toBe(false);
  });
});

describe('Hex chunks', () => {
  it('every in-world hex belongs to exactly one chunk', () => {
    const owner = new Map<string, string>();
    for (let cz = 0; cz < WORLD_CHUNKS_PER_SIDE; cz += 1) {
      for (let cx = 0; cx < WORLD_CHUNKS_PER_SIDE; cx += 1) {
        for (const h of getChunkHexes(cx, cz)) {
          const k = hexKey(h.q, h.r);
          expect(owner.has(k)).toBe(false);
          owner.set(k, `${cx}:${cz}`);
          expect(hexToChunk(h.q, h.r)).toEqual({ cx, cz });
        }
      }
    }
    let total = 0;
    forEachHexInWorld((q, r) => {
      total += 1;
      expect(owner.has(hexKey(q, r))).toBe(true);
    });
    expect(owner.size).toBe(total);
  });

  it('radius query returns a nearby subset sorted nearest first', () => {
    const list = getWorldChunksInRadius(0, 0, 150);
    expect(list.length).toBeGreaterThan(4);
    expect(list.length).toBeLessThan(WORLD_TOTAL_CHUNKS);
    const d = list.map((c) => distanceToWorldChunk(c.cx, c.cz, 0, 0));
    for (let i = 1; i < d.length; i += 1) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
  });
});
