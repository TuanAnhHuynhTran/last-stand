/**
 * Pond layout (pure, deterministic): where the stilted hut, the jetty, the sluice, the feeding
 * ring, aerators, filter, harvest dock and office go, the shoreline sample points used for the
 * banks, and the swimmable area for the fish.
 *
 * Swimmable = inside the water body AND deep enough above the (carved) bed, or inside a cage net
 * for fish cages — fish can never leave the water or cross the bank.
 */
import {
  HEX_RADIUS,
  SWIM_MIN_DEPTH,
  WATER_LEVEL,
  axialToWorld,
  createRng,
  getWaterBodyDefinition,
  hashSeed,
  type AxialCoord,
  type WaterBodyTypeCode,
} from '@cityverse/shared';
import { computeZoneFrame, type EdgeSeg, type Spot, type XZ, type ZoneFrame } from '../farming/farmLayout';

/** Half side of a square cage net (m). */
export const CAGE_HALF = 3.1;

export interface ShorePoint extends XZ {
  /** Unit vector pointing into the pond */
  nx: number;
  nz: number;
  edge: EdgeSeg;
}

export interface PondLayout {
  id: string;
  type: WaterBodyTypeCode;
  level: number;
  dug: boolean;
  frame: ZoneFrame;
  surface: number;
  bottom: number;
  hut: Spot;
  jetty: { from: XZ; to: XZ; width: number };
  sluice: Spot | null;
  feeder: XZ;
  aerators: XZ[];
  filter: Spot | null;
  harvest: Spot | null;
  office: Spot | null;
  cages: XZ[];
  /** Points on the shoreline (spaced ~1.2 m) */
  shore: ShorePoint[];
  /** Deep points — wander targets / spawn points for fish */
  swimPoints: XZ[];
  swimmable: (x: number, z: number) => boolean;
  /** Current water surface (drops when the pond is not full) — swimmable / depth follow it. */
  setSurface: (y: number) => void;
  /** Water depth at (x, z) (0 outside) */
  depthAt: (x: number, z: number) => number;
}

export interface PondLayoutInput {
  id: string;
  type: WaterBodyTypeCode;
  level: number;
  hexes: readonly AxialCoord[];
  surface: number;
  bottom: number;
}

/**
 * `ground(x, z)` = terrain height (already carved for dug ponds); `inBody(x, z)` = the point is
 * inside one of the water body's hexes.
 */
export function computePondLayout(input: PondLayoutInput, ground: (x: number, z: number) => number, inBody: (x: number, z: number) => boolean): PondLayout {
  const def = getWaterBodyDefinition(input.type);
  const frame = computeZoneFrame(input.hexes);
  const rng = createRng(hashSeed(`pond:${input.id}`));
  const surface = def.dug ? input.surface : WATER_LEVEL;
  const water = { surface };
  const pick = (i: number): AxialCoord => frame.boundary[i % frame.boundary.length];

  const cages = def.dug ? [] : frame.sorted.map((h) => axialToWorld(h.q, h.r));
  const inCage = (x: number, z: number): boolean => cages.some((c) => Math.abs(x - c.x) < CAGE_HALF - 0.35 && Math.abs(z - c.z) < CAGE_HALF - 0.35);
  const depthAt = (x: number, z: number): number => (inBody(x, z) ? Math.max(0, water.surface - ground(x, z)) : 0);
  const swimmable = def.dug ? (x: number, z: number) => depthAt(x, z) >= SWIM_MIN_DEPTH : inCage;

  // Structures: hut on stilts over the water near the most exposed shore, jetty beside it.
  const hut = frame.spotOn(pick(0), 2.6);
  const jettyHex = pick(Math.min(1, frame.boundary.length - 1));
  const len = input.level >= 2 ? 7 : 4;
  const root = frame.spotOn(jettyHex, 4.6);
  // spotOn() faces back into the zone: its forward vector points into the pond.
  const inward = { x: Math.sin(root.ry), z: Math.cos(root.ry) };
  const jetty = { from: { x: root.x, z: root.z }, to: { x: root.x + inward.x * len, z: root.z + inward.z * len }, width: input.level >= 2 ? 1.5 : 1.1 };
  const far = [...frame.boundary].sort((a, b) => dist(frame.spotOn(b, 0), hut) - dist(frame.spotOn(a, 0), hut));
  const sluice = input.level >= 2 && def.dug ? frame.spotOn(far[0], 4.7) : null;
  const feeder = nearestSwim(frame.centroid);
  const aerators =
    input.level >= 3
      ? [0.35, -0.35].map((k) => nearestSwim({ x: frame.centroid.x + Math.cos(k * 4 + 1) * HEX_RADIUS * 1.2, z: frame.centroid.z + Math.sin(k * 4 + 1) * HEX_RADIUS * 1.2 }))
      : [];
  const filter = input.level >= 3 ? frame.spotOn(far[Math.min(1, far.length - 1)], 4.4) : null;
  const harvest = input.level >= 3 ? frame.spotOn(pick(2), 3.4) : null;
  const office = input.level >= 3 ? frame.spotOn(pick(3), 4.2) : null;

  // Shoreline points: along each border edge, at the waterline (dug) or the cage edge.
  const shore: ShorePoint[] = [];
  for (const e of frame.borderEdges) {
    const len2 = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z);
    const n = Math.max(2, Math.round(len2 / 1.2));
    const mx = (e.a.x + e.b.x) / 2;
    const mz = (e.a.z + e.b.z) / 2;
    const il = Math.hypot(e.center.x - mx, e.center.z - mz) || 1;
    const nx = (e.center.x - mx) / il;
    const nz = (e.center.z - mz) / il;
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n;
      let x = e.a.x + (e.b.x - e.a.x) * t;
      let z = e.a.z + (e.b.z - e.a.z) * t;
      if (def.dug) {
        // Walk inward until the bank meets the water surface.
        for (let k = 0; k < 20 && ground(x, z) > surface; k += 1) {
          x += nx * 0.15;
          z += nz * 0.15;
        }
      }
      shore.push({ x, z, nx, nz, edge: e });
    }
  }

  // Deep points (fish targets), sampled on a jittered grid.
  const swimPoints: XZ[] = [];
  for (const c of frame.centers) {
    for (let k = 0; k < 14; k += 1) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * HEX_RADIUS * 0.95;
      const p = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
      if (swimmable(p.x, p.z)) swimPoints.push(p);
    }
  }
  if (!swimPoints.length) swimPoints.push(feeder);

  return {
    id: input.id,
    type: input.type,
    level: input.level,
    dug: def.dug,
    frame,
    surface,
    bottom: input.bottom,
    hut,
    jetty,
    sluice,
    feeder,
    aerators,
    filter,
    harvest,
    office,
    cages,
    shore,
    swimPoints,
    swimmable,
    setSurface: (y: number) => {
      water.surface = def.dug ? y : WATER_LEVEL;
    },
    depthAt,
  };

  function nearestSwim(p: XZ): XZ {
    if (swimmable(p.x, p.z)) return p;
    let best: XZ | null = null;
    let bd = Infinity;
    for (const c of frame.centers) {
      for (let k = 0; k < 24; k += 1) {
        const a = (k / 24) * Math.PI * 2;
        for (const r of [0, 1.5, 3]) {
          const q = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
          const d = dist(q, p);
          if (d < bd && swimmable(q.x, q.z)) {
            bd = d;
            best = q;
          }
        }
      }
    }
    return best ?? p;
  }
}

const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
