import { axialToWorld, hexKey, HEX_RADIUS, worldToAxial, type AxialCoord } from '../hex/hexMath.js';

/** Roads occupy an edge, never a whole building plot. Rotation zero is the east edge. */
export const PATH_WIDTH = 1.2;
const directions: readonly AxialCoord[] = [
  { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
  { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
];
export function pathNeighbor(anchor: AxialCoord, rotation: number): AxialCoord {
  const d = directions[((rotation % 6) + 6) % 6];
  return { q: anchor.q + d.q, r: anchor.r + d.r };
}
export function pathEdgeKey(anchor: AxialCoord, rotation: number): string {
  const other = pathNeighbor(anchor, rotation);
  return `path:${[hexKey(anchor.q, anchor.r), hexKey(other.q, other.r)].sort().join('|')}`;
}
export function pathEndpoints(anchor: AxialCoord, rotation: number) {
  const a = axialToWorld(anchor.q, anchor.r);
  const n = pathNeighbor(anchor, rotation);
  const b = axialToWorld(n.q, n.r);
  const x = (a.x + b.x) / 2;
  const z = (a.z + b.z) / 2;
  const dx = (b.x - a.x) / 10;
  const dz = (b.z - a.z) / 10;
  return [
    { x: x - dz * HEX_RADIUS / 2, z: z + dx * HEX_RADIUS / 2 },
    { x: x + dz * HEX_RADIUS / 2, z: z - dx * HEX_RADIUS / 2 },
  ] as const;
}

/** Includes the small rounded joins at each end, which can touch a third plot. */
export function pathTouchedHexes(anchor: AxialCoord, rotation: number): AxialCoord[] {
  const hexes = new Map<string, AxialCoord>();
  for (const h of [anchor, pathNeighbor(anchor, rotation)]) hexes.set(hexKey(h.q, h.r), h);
  for (const p of pathEndpoints(anchor, rotation)) for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    const h = worldToAxial(p.x + Math.cos(angle) * PATH_WIDTH / 2, p.z + Math.sin(angle) * PATH_WIDTH / 2);
    hexes.set(hexKey(h.q, h.r), h);
  }
  return [...hexes.values()];
}
