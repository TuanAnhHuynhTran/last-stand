/**
 * HexMath — axial (q, r) coordinates, pointy-top orientation.
 *
 * Conventions (see game's description §3.1):
 *  - Distance between centres of two adjacent hexes: HEX_SPACING = 10 world units.
 *  - Outer radius (centre → pointed vertex): s = 10 / √3 ≈ 5.7735.
 *  - Centre of (q, r):  x = 10·(q + r/2),  z = 1.5·s·r ≈ 8.6603·r
 *  - The personal world is a 1000 × 1000 square on the XZ plane, centred on the origin,
 *    so hex (0, 0) sits at world (0, 0). A hex is "in bounds" only when its whole polygon is.
 *
 * Pure functions only: shared by the client renderer and the server.
 */
import type { WorldBounds } from '../types.js';

export const HEX_SPACING = 10;
export const HEX_RADIUS = HEX_SPACING / Math.sqrt(3);
export const HEX_ROW_STEP = HEX_RADIUS * 1.5;
export const HEX_AREA = (Math.sqrt(3) / 2) * HEX_SPACING * HEX_SPACING;
export const HEX_WORLD_SIZE = 1000;

const SQRT3 = Math.sqrt(3);

export interface AxialCoord {
  q: number;
  r: number;
}

export interface HexWorldPoint {
  x: number;
  z: number;
}

/** The 6 axial neighbour directions, in the order given by the design doc. */
export const HEX_DIRECTIONS: readonly AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Normalises -0 to 0 so keys and equality checks stay stable. */
function nz(value: number): number {
  return value === 0 ? 0 : value;
}

export function hexKey(q: number, r: number): string {
  return `${nz(q)},${nz(r)}`;
}

export function parseHexKey(key: string): AxialCoord {
  const [q, r] = key.split(',');
  return { q: Number(q), r: Number(r) };
}

export function hexEquals(a: AxialCoord, b: AxialCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function axialToWorld(q: number, r: number, spacing: number = HEX_SPACING): HexWorldPoint {
  return {
    x: spacing * (q + r / 2),
    z: spacing * (SQRT3 / 2) * r,
  };
}

/** Fractional axial coordinates of a world point (no rounding). */
export function worldToFractionalAxial(
  x: number,
  z: number,
  spacing: number = HEX_SPACING
): { q: number; r: number } {
  const r = (2 / SQRT3) * (z / spacing);
  const q = x / spacing - r / 2;
  return { q, r };
}

/** World (x, z) → the hex containing that point. */
export function worldToAxial(x: number, z: number, spacing: number = HEX_SPACING): AxialCoord {
  const f = worldToFractionalAxial(x, z, spacing);
  return hexRound(f.q, f.r);
}

/** Cube rounding of fractional axial coordinates to the nearest hex. */
export function hexRound(qf: number, rf: number): AxialCoord {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);

  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);

  if (dq > dr && dq > ds) {
    q = -r - s;
  } else if (dr > ds) {
    r = -q - s;
  }
  return { q: nz(q), r: nz(r) };
}

export function hexNeighbor(hex: AxialCoord, direction: number): AxialCoord {
  const d = HEX_DIRECTIONS[((direction % 6) + 6) % 6];
  return { q: hex.q + d.q, r: hex.r + d.r };
}

export function hexNeighbors(hex: AxialCoord): AxialCoord[] {
  return HEX_DIRECTIONS.map((d) => ({ q: hex.q + d.q, r: hex.r + d.r }));
}

export function hexDistance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/** Hexes at exactly `radius` steps from `center`. Radius 0 → [center]. */
export function hexRing(center: AxialCoord, radius: number): AxialCoord[] {
  if (radius <= 0) return [{ q: center.q, r: center.r }];
  const results: AxialCoord[] = [];
  // Start `radius` steps in direction 4 (-1, +1) and walk the 6 sides.
  let cur: AxialCoord = {
    q: center.q + HEX_DIRECTIONS[4].q * radius,
    r: center.r + HEX_DIRECTIONS[4].r * radius,
  };
  for (let side = 0; side < 6; side += 1) {
    for (let step = 0; step < radius; step += 1) {
      results.push(cur);
      cur = hexNeighbor(cur, side);
    }
  }
  return results;
}

/** All hexes within `radius` of `center`, in spiral order (centre, ring 1, ring 2…). */
export function hexDisk(center: AxialCoord, radius: number): AxialCoord[] {
  const results: AxialCoord[] = [];
  for (let k = 0; k <= radius; k += 1) {
    results.push(...hexRing(center, k));
  }
  return results;
}

/**
 * All hexes whose distance to `center` lies in [minRadius, maxRadius].
 * `hexRange(c, n)` is the classic "all hexes within n" range.
 */
export function hexRange(center: AxialCoord, maxRadius: number, minRadius = 0): AxialCoord[] {
  const results: AxialCoord[] = [];
  for (let dq = -maxRadius; dq <= maxRadius; dq += 1) {
    const rMin = Math.max(-maxRadius, -dq - maxRadius);
    const rMax = Math.min(maxRadius, -dq + maxRadius);
    for (let dr = rMin; dr <= rMax; dr += 1) {
      const d = (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
      if (d >= minRadius) results.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return results;
}

/** Alias matching the design doc naming. */
export const getHexesInRange = hexRange;

/**
 * Breadth-first flood fill from `start` over hexes accepted by `isIncluded`.
 * `limit` caps the result size so the caller can never walk an unbounded area.
 */
export function getConnectedHexes(
  start: AxialCoord,
  isIncluded: (hex: AxialCoord) => boolean,
  limit = 100_000
): AxialCoord[] {
  if (!isIncluded(start)) return [];
  const visited = new Set<string>([hexKey(start.q, start.r)]);
  const queue: AxialCoord[] = [start];
  const results: AxialCoord[] = [];
  let head = 0;
  while (head < queue.length && results.length < limit) {
    const cur = queue[head];
    head += 1;
    results.push(cur);
    for (const nb of hexNeighbors(cur)) {
      const key = hexKey(nb.q, nb.r);
      if (!visited.has(key) && isIncluded(nb)) {
        visited.add(key);
        queue.push(nb);
      }
    }
  }
  return results;
}

/** Alias matching the design doc naming. */
export const getConnectedRegion = getConnectedHexes;

/** True when every hex in the list is reachable from the first via hexes of the list. */
export function isConnectedRegion(hexes: readonly AxialCoord[]): boolean {
  if (hexes.length === 0) return false;
  const set = new Set(hexes.map((h) => hexKey(h.q, h.r)));
  const reached = getConnectedHexes(hexes[0], (h) => set.has(hexKey(h.q, h.r)), set.size);
  return reached.length === set.size;
}

/** 6 world-space corners: index i sits at angle (60·i − 90)°, starting at the top (−Z) vertex. */
export function getHexPolygon(
  q: number,
  r: number,
  spacing: number = HEX_SPACING,
  scale = 1
): HexWorldPoint[] {
  const c = axialToWorld(q, r, spacing);
  const radius = (spacing / SQRT3) * scale;
  const corners: HexWorldPoint[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    corners.push({ x: c.x + Math.cos(angle) * radius, z: c.z + Math.sin(angle) * radius });
  }
  return corners;
}

/**
 * Corner indices (into getHexPolygon) of the edge shared with neighbour `direction`.
 * Used to draw borders between two hexes.
 */
export function getHexEdgeCorners(direction: number): [number, number] {
  // Direction 0 (+q) is east (+X): corners 1 (upper-right) and 2 (lower-right).
  const table: [number, number][] = [
    [1, 2], // +q        east
    [0, 1], // +q -r     north-east
    [5, 0], // -r        north-west
    [4, 5], // -q        west
    [3, 4], // -q +r     south-west
    [2, 3], // +r        south-east
  ];
  return table[((direction % 6) + 6) % 6];
}

export function getWorldBounds(size: number = HEX_WORLD_SIZE): WorldBounds {
  const half = size / 2;
  return { minX: -half, maxX: half, minZ: -half, maxZ: half };
}

/** True when the whole hex polygon (not just its centre) lies inside the world square. */
export function isWithinWorldBounds(
  q: number,
  r: number,
  bounds: WorldBounds = getWorldBounds(),
  spacing: number = HEX_SPACING
): boolean {
  const c = axialToWorld(q, r, spacing);
  const halfWidth = spacing / 2;
  const radius = spacing / SQRT3;
  const eps = 1e-9;
  return (
    c.x - halfWidth >= bounds.minX - eps &&
    c.x + halfWidth <= bounds.maxX + eps &&
    c.z - radius >= bounds.minZ - eps &&
    c.z + radius <= bounds.maxZ + eps
  );
}

/** Footprint check: every hex must be inside the world. */
export function isFootprintWithinBounds(
  hexes: readonly AxialCoord[],
  bounds: WorldBounds = getWorldBounds()
): boolean {
  return hexes.length > 0 && hexes.every((h) => isWithinWorldBounds(h.q, h.r, bounds));
}

/** Axial → odd-r offset (col, row). */
export function axialToOffset(q: number, r: number): { col: number; row: number } {
  return { col: nz(q + (r - (r & 1)) / 2), row: nz(r) };
}

/** Odd-r offset (col, row) → axial. */
export function offsetToAxial(col: number, row: number): AxialCoord {
  return { q: nz(col - (row - (row & 1)) / 2), r: nz(row) };
}

/** Enumerates every hex whose polygon is fully inside the world. */
export function forEachHexInWorld(
  visit: (q: number, r: number) => void,
  bounds: WorldBounds = getWorldBounds()
): void {
  const rMin = Math.ceil((bounds.minZ + HEX_RADIUS) / HEX_ROW_STEP);
  const rMax = Math.floor((bounds.maxZ - HEX_RADIUS) / HEX_ROW_STEP);
  for (let r = rMin; r <= rMax; r += 1) {
    const qMin = Math.ceil((bounds.minX + HEX_SPACING / 2) / HEX_SPACING - r / 2);
    const qMax = Math.floor((bounds.maxX - HEX_SPACING / 2) / HEX_SPACING - r / 2);
    for (let q = qMin; q <= qMax; q += 1) {
      if (isWithinWorldBounds(q, r, bounds)) visit(nz(q), nz(r));
    }
  }
}
