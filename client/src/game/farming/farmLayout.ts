/**
 * Pure, deterministic layout of a farm zone (no Three.js):
 *  - crop slots on a GLOBAL grid so rows / furrows line up across neighbouring hexes
 *  - border edges (bunds, canal) vs interior edges (bunds at L1, farm roads from L2)
 *  - spots for the hut (L2+), pump / windmill (L3), scarecrow & flags (L3)
 *  - farmer waypoints
 */
import {
  HEX_DIRECTIONS,
  axialToWorld,
  getHexEdgeCorners,
  getHexPolygon,
  hashSeed,
  createRng,
  hexKey,
  hexDistance,
  worldToAxial,
  type AxialCoord,
  type FarmZoneTypeCode,
} from '@cityverse/shared';

export interface XZ {
  x: number;
  z: number;
}

export interface EdgeSeg {
  a: XZ;
  b: XZ;
  /** Centre of the zone hex this edge belongs to */
  center: XZ;
  hex: AxialCoord;
  dir: number;
}

export interface Spot extends XZ {
  /** Yaw so the structure faces into the zone */
  ry: number;
  hex: AxialCoord;
}

export interface CropSlot extends XZ {
  ry: number;
  scale: number;
  /** Bed / furrow row index (global) */
  row: number;
  hexKey: string;
}

export interface BedSeg {
  x0: number;
  x1: number;
  z: number;
  hexKey: string;
}

export interface ZoneLayoutInput {
  id: string;
  zoneType: FarmZoneTypeCode;
  level: number;
  hexes: readonly AxialCoord[];
  sourceHex?: AxialCoord | null;
}

export interface ZoneLayout {
  keys: ReadonlySet<string>;
  centers: XZ[];
  centroid: XZ;
  borderEdges: EdgeSeg[];
  interiorEdges: EdgeSeg[];
  hut: Spot | null;
  pump: Spot | null;
  scarecrow: Spot | null;
  flags: Spot[];
  slots: CropSlot[];
  beds: BedSeg[];
  waypoints: XZ[];
}

/** Hex apothem (centre → edge) for spacing 10. */
const APOTHEM = 5;

interface GridSpec {
  dx: number;
  dz: number;
  /** Offset every other row by half a step */
  stagger: boolean;
  jitter: number;
}

const GRID: Record<FarmZoneTypeCode, GridSpec> = {
  rice_paddy: { dx: 1.15, dz: 1.15, stagger: true, jitter: 0.08 },
  corn_field: { dx: 1.25, dz: 1.6, stagger: false, jitter: 0.08 },
  vegetable_garden: { dx: 1.05, dz: 2.2, stagger: false, jitter: 0.05 },
  orchard: { dx: 0, dz: 0, stagger: false, jitter: 0.3 },
  pasture: { dx: 1.15, dz: 1.05, stagger: true, jitter: 0.35 },
};

/** Margins (m) crops keep from border edges / interior edges by level. */
function margins(zoneType: FarmZoneTypeCode, level: number): { border: number; interior: number } {
  const border = level >= 2 ? 2.05 : 0.95;
  const interior = level >= 2 ? 1.05 : 0.6;
  if (zoneType === 'vegetable_garden') return { border: border + 0.2, interior: interior + 0.2 };
  return { border, interior };
}

/** Distance from p to edge `dir` of the hex centred at c (positive inside). */
export function edgeDistance(p: XZ, c: XZ, dir: number): number {
  // Outward normal of edge `dir` points at the neighbour's centre.
  const d = HEX_DIRECTIONS[dir];
  const n = axialToWorld(d.q, d.r);
  const len = Math.hypot(n.x, n.z);
  return APOTHEM - ((p.x - c.x) * n.x + (p.z - c.z) * n.z) / len;
}

export interface ZoneFrame {
  keys: ReadonlySet<string>;
  /** Zone hexes sorted by (q, r) */
  sorted: AxialCoord[];
  centers: XZ[];
  centroid: XZ;
  borderEdges: EdgeSeg[];
  interiorEdges: EdgeSeg[];
  /** Hex key → directions (0..5) whose neighbour is outside the zone */
  outsideDirs: Map<string, number[]>;
  /** Boundary hexes, most exposed first */
  boundary: AxialCoord[];
  /** Spot on a boundary hex pushed `push` m toward the outside, facing into the zone. */
  spotOn: (h: AxialCoord, push: number) => Spot;
}

/** Edges, boundary and placement helpers shared by crop fields and livestock farms. */
export function computeZoneFrame(hexes: readonly AxialCoord[]): ZoneFrame {
  const keys = new Set(hexes.map((h) => hexKey(h.q, h.r)));
  const sorted = [...hexes].sort((a, b) => (a.q - b.q) || (a.r - b.r));
  const centers = sorted.map((h) => axialToWorld(h.q, h.r));
  const centroid = {
    x: centers.reduce((s, c) => s + c.x, 0) / Math.max(1, centers.length),
    z: centers.reduce((s, c) => s + c.z, 0) / Math.max(1, centers.length),
  };
  const inZone = (h: AxialCoord): boolean => keys.has(hexKey(h.q, h.r));

  // ── Edges ──
  const borderEdges: EdgeSeg[] = [];
  const interiorEdges: EdgeSeg[] = [];
  const outsideDirs = new Map<string, number[]>();
  for (const h of sorted) {
    const poly = getHexPolygon(h.q, h.r);
    const center = axialToWorld(h.q, h.r);
    const out: number[] = [];
    for (let dir = 0; dir < 6; dir += 1) {
      const d = HEX_DIRECTIONS[dir];
      const nb = { q: h.q + d.q, r: h.r + d.r };
      const [i, j] = getHexEdgeCorners(dir);
      const seg: EdgeSeg = { a: poly[i], b: poly[j], center, hex: h, dir };
      if (!inZone(nb)) {
        borderEdges.push(seg);
        out.push(dir);
      } else if (hexKey(h.q, h.r) < hexKey(nb.q, nb.r)) {
        interiorEdges.push(seg);
      }
    }
    outsideDirs.set(hexKey(h.q, h.r), out);
  }

  // ── Structure spots: on boundary hexes, pushed toward the outside ──
  const boundary = sorted
    .filter((h) => (outsideDirs.get(hexKey(h.q, h.r))?.length ?? 0) > 0)
    .sort((a, b) => (outsideDirs.get(hexKey(b.q, b.r))!.length - outsideDirs.get(hexKey(a.q, a.r))!.length) || (a.q - b.q) || (a.r - b.r));

  const spotOn = (h: AxialCoord, push: number): Spot => {
    const c = axialToWorld(h.q, h.r);
    const dirs = outsideDirs.get(hexKey(h.q, h.r))!;
    // Average outward direction of the hex's border edges.
    let vx = 0;
    let vz = 0;
    for (const dir of dirs) {
      const d = HEX_DIRECTIONS[dir];
      const n = axialToWorld(d.q, d.r);
      vx += n.x;
      vz += n.z;
    }
    const len = Math.hypot(vx, vz) || 1;
    vx /= len;
    vz /= len;
    // Model front faces +Z; turn it to face back into the zone.
    return { x: c.x + vx * push, z: c.z + vz * push, ry: Math.atan2(-vx, -vz), hex: h };
  };


  return { keys, sorted, centers, centroid, borderEdges, interiorEdges, outsideDirs, boundary, spotOn };
}

export function computeZoneLayout(zone: ZoneLayoutInput): ZoneLayout {
  const rng = createRng(hashSeed(`farm:${zone.id}`));
  const { keys, sorted, centers, centroid, borderEdges, interiorEdges, outsideDirs, boundary, spotOn } = computeZoneFrame(zone.hexes);

  const used = new Set<string>();
  const take = (candidates: AxialCoord[]): AxialCoord | null => {
    const h = candidates.find((c) => !used.has(hexKey(c.q, c.r))) ?? null;
    if (h) used.add(hexKey(h.q, h.r));
    return h;
  };

  let pump: Spot | null = null;
  if (zone.level >= 3) {
    const src = zone.sourceHex;
    const byWater = src ? [...boundary].sort((a, b) => hexDistance(a, src) - hexDistance(b, src)) : boundary;
    const h = take(byWater);
    if (h) pump = spotOn(h, 2.2);
  }
  let hut: Spot | null = null;
  if (zone.level >= 2) {
    const h = take(boundary.slice().reverse());
    if (h) hut = spotOn(h, 2.0);
  }
  let scarecrow: Spot | null = null;
  const flags: Spot[] = [];
  if (zone.level >= 3) {
    const inner = [...sorted].sort(
      (a, b) => Math.hypot(axialToWorld(a.q, a.r).x - centroid.x, axialToWorld(a.q, a.r).z - centroid.z) -
        Math.hypot(axialToWorld(b.q, b.r).x - centroid.x, axialToWorld(b.q, b.r).z - centroid.z)
    );
    const h = take(inner) ?? inner[0];
    if (h) {
      const c = axialToWorld(h.q, h.r);
      scarecrow = { x: c.x + 1.2, z: c.z - 0.8, ry: rng() * Math.PI * 2, hex: h };
    }
    for (const fh of boundary.slice(0, 2)) flags.push(spotOn(fh, 3.4));
  }

  // ── Crop slots ──
  const exclusions: { p: XZ; r: number }[] = [];
  if (hut) exclusions.push({ p: hut, r: 3.1 });
  if (pump) exclusions.push({ p: pump, r: 3.4 });
  if (scarecrow) exclusions.push({ p: scarecrow, r: 1.1 });
  for (const f of flags) exclusions.push({ p: f, r: 0.6 });

  const m = margins(zone.zoneType, zone.level);
  const slots: CropSlot[] = [];
  const beds: BedSeg[] = [];
  const accept = (p: XZ, h: AxialCoord, c: XZ, extra = 0): boolean => {
    const outs = outsideDirs.get(hexKey(h.q, h.r))!;
    for (let dir = 0; dir < 6; dir += 1) {
      const need = (outs.includes(dir) ? m.border : m.interior) + extra;
      if (edgeDistance(p, c, dir) < need) return false;
    }
    return exclusions.every((e) => Math.hypot(p.x - e.p.x, p.z - e.p.z) >= e.r);
  };

  if (zone.zoneType === 'orchard') {
    for (const h of sorted) {
      const c = axialToWorld(h.q, h.r);
      for (let k = 0; k < 3; k += 1) {
        const a = (Math.PI * 2 * k) / 3 + Math.PI / 6;
        const p = { x: c.x + Math.cos(a) * 2.45 + (rng() - 0.5) * 0.3, z: c.z + Math.sin(a) * 2.45 + (rng() - 0.5) * 0.3 };
        if (accept(p, h, c, 0.6)) {
          slots.push({ ...p, ry: rng() * Math.PI * 2, scale: 0.92 + rng() * 0.16, row: k, hexKey: hexKey(h.q, h.r) });
        }
      }
    }
  } else {
    const g = GRID[zone.zoneType];
    for (const h of sorted) {
      const c = axialToWorld(h.q, h.r);
      const key = hexKey(h.q, h.r);
      const j0 = Math.floor((c.z - APOTHEM * 1.2) / g.dz);
      const j1 = Math.ceil((c.z + APOTHEM * 1.2) / g.dz);
      for (let j = j0; j <= j1; j += 1) {
        const z = j * g.dz;
        const off = g.stagger && j % 2 !== 0 ? g.dx / 2 : 0;
        const i0 = Math.floor((c.x - APOTHEM * 1.2) / g.dx);
        const i1 = Math.ceil((c.x + APOTHEM * 1.2) / g.dx);
        let minX = Infinity;
        let maxX = -Infinity;
        for (let i = i0; i <= i1; i += 1) {
          const base = { x: i * g.dx + off, z };
          const owner = worldToAxial(base.x, base.z);
          if (owner.q !== h.q || owner.r !== h.r) continue;
          const p = { x: base.x + (rng() - 0.5) * 2 * g.jitter, z: base.z + (rng() - 0.5) * 2 * g.jitter };
          if (!accept(p, h, c)) continue;
          slots.push({ ...p, ry: rng() * Math.PI * 2, scale: 0.85 + rng() * 0.3, row: j, hexKey: key });
          minX = Math.min(minX, base.x);
          maxX = Math.max(maxX, base.x);
        }
        if (zone.zoneType !== 'pasture' && zone.zoneType !== 'rice_paddy' && minX <= maxX) {
          beds.push({ x0: minX - g.dx * 0.5, x1: maxX + g.dx * 0.5, z, hexKey: key });
        }
      }
    }
  }

  // ── Farmer waypoints: near hex centres, away from structures ──
  const waypoints = centers.map((c) => ({ x: c.x + (rng() - 0.5) * 3, z: c.z + (rng() - 0.5) * 3 }));

  return { keys, centers, centroid, borderEdges, interiorEdges, hut, pump, scarecrow, flags, slots, beds, waypoints };
}
