/**
 * Pond terrain: digging a pond really lowers the terrain (no flat blue sheet on the ground).
 *
 *  - planPondLevels: from the SEED terrain, the rim height of the region (lowest point along its
 *    border) gives a flat water surface just below it and a bed `depth` below that.
 *  - PondEditLayer (a TerrainEdits): for any point inside a pond's hexes, the height is pulled
 *    down toward the bed with a smoothstep of the distance to the region border, so
 *      • the bank slopes gently (POND_BANK_WIDTH),
 *      • the edit is exactly zero on the border → continuous with the land around it (no gap),
 *      • merging hexes (expansion) recomputes the border: inner banks disappear by construction.
 *  - The same layer answers "is this point deep enough to swim?" for the fish.
 *
 * Fish cages (natural water) are registered without carving.
 */
import {
  HEX_AREA,
  HEX_DIRECTIONS,
  HEX_RADIUS,
  axialToWorld,
  getHexEdgeCorners,
  getHexPolygon,
  hexKey,
  worldToAxial,
  type AxialCoord,
} from '../hex/hexMath.js';
import { WATER_LEVEL, type TerrainEdits, type TerrainSample } from '../worldgen/TerrainGenerator.js';
import { getWaterBodyDefinition, type WaterBodyTypeCode } from './definitions.js';

/** Horizontal width of the sloping bank (m). */
export const POND_BANK_WIDTH = 4.5;
/** Water surface sits this far below the lowest rim point (m). */
export const POND_FREEBOARD = 0.35;
/** Fish keep at least this much water above the bed. */
export const SWIM_MIN_DEPTH = 0.45;

export interface PondLevels {
  rim: number;
  surface: number;
  bottom: number;
}

export interface PondSpec {
  id: string;
  hexes: readonly AxialCoord[];
  /** Water surface height */
  surface: number;
  /** Bed height (dug types) */
  bottom: number;
  /** Dug into land (carves terrain) or floating on natural water */
  dug: boolean;
}

export interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** Border edges of a hex region (world-space segments) — the shoreline of a pond. */
export function regionBorder(hexes: readonly AxialCoord[]): Segment[] {
  const keys = new Set(hexes.map((h) => hexKey(h.q, h.r)));
  const out: Segment[] = [];
  for (const h of hexes) {
    const poly = getHexPolygon(h.q, h.r);
    for (let dir = 0; dir < 6; dir += 1) {
      const d = HEX_DIRECTIONS[dir];
      if (keys.has(hexKey(h.q + d.q, h.r + d.r))) continue;
      const [i, j] = getHexEdgeCorners(dir);
      out.push({ ax: poly[i].x, az: poly[i].z, bx: poly[j].x, bz: poly[j].z });
    }
  }
  return out;
}

export function segmentDistance(x: number, z: number, s: Segment): number {
  const vx = s.bx - s.ax;
  const vz = s.bz - s.az;
  const len2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / len2));
  return Math.hypot(x - (s.ax + vx * t), z - (s.az + vz * t));
}

const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * Water surface and bed for a region, from the seed terrain (`baseHeight` must ignore edits).
 * Fish cages use the natural water level.
 */
export function planPondLevels(baseHeight: (x: number, z: number) => number, hexes: readonly AxialCoord[], type: WaterBodyTypeCode): PondLevels {
  const def = getWaterBodyDefinition(type);
  if (!def.dug) return { rim: WATER_LEVEL, surface: WATER_LEVEL, bottom: WATER_LEVEL - 3 };
  let rim = Infinity;
  for (const s of regionBorder(hexes)) {
    for (let k = 0; k <= 4; k += 1) {
      const t = k / 4;
      rim = Math.min(rim, baseHeight(s.ax + (s.bx - s.ax) * t, s.az + (s.bz - s.az) * t));
    }
  }
  if (!Number.isFinite(rim)) rim = 0;
  const surface = rim - POND_FREEBOARD;
  return { rim, surface, bottom: surface - def.depth };
}

interface CompiledPond extends PondSpec {
  keys: Set<string>;
  /** hex key → border segments of that hex and its neighbours (the only ones within bank reach) */
  near: Map<string, Segment[]>;
  border: Segment[];
}

function compile(spec: PondSpec): CompiledPond {
  const keys = new Set(spec.hexes.map((h) => hexKey(h.q, h.r)));
  const own = new Map<string, Segment[]>();
  for (const h of spec.hexes) own.set(hexKey(h.q, h.r), regionBorderOf(h, keys));
  const near = new Map<string, Segment[]>();
  for (const h of spec.hexes) {
    const list = [...(own.get(hexKey(h.q, h.r)) ?? [])];
    for (const d of HEX_DIRECTIONS) list.push(...(own.get(hexKey(h.q + d.q, h.r + d.r)) ?? []));
    near.set(hexKey(h.q, h.r), list);
  }
  return { ...spec, keys, near, border: regionBorder(spec.hexes) };
}

function regionBorderOf(h: AxialCoord, keys: ReadonlySet<string>): Segment[] {
  const poly = getHexPolygon(h.q, h.r);
  const out: Segment[] = [];
  for (let dir = 0; dir < 6; dir += 1) {
    const d = HEX_DIRECTIONS[dir];
    if (keys.has(hexKey(h.q + d.q, h.r + d.r))) continue;
    const [i, j] = getHexEdgeCorners(dir);
    out.push({ ax: poly[i].x, az: poly[i].z, bx: poly[j].x, bz: poly[j].z });
  }
  return out;
}

/** Carved height of a point at distance `d` inside the border (base height `h`). */
export function carveHeight(h: number, d: number, bottom: number, x: number, z: number): number {
  const t = smooth(d / POND_BANK_WIDTH);
  // A gently uneven bed (deterministic) so the bottom never looks like a plate.
  const bed = bottom + 0.12 * Math.sin(x * 0.31) * Math.cos(z * 0.27);
  return Math.min(h, h + (bed - h) * t);
}

/** The player's water bodies as a terrain edit layer. */
export class PondEditLayer implements TerrainEdits {
  private readonly ponds = new Map<string, CompiledPond>();
  private readonly byHex = new Map<string, CompiledPond>();
  /** Bumped on every change (renderers compare it to know when to rebuild). */
  version = 0;

  get size(): number {
    return this.ponds.size;
  }

  /** Replaces all ponds; returns the hex keys whose terrain changed (for chunk rebuilds). */
  setPonds(specs: readonly PondSpec[]): Set<string> {
    const changed = new Set<string>();
    const next = new Map(specs.map((s) => [s.id, s]));
    for (const [id, old] of this.ponds) {
      const s = next.get(id);
      if (!s || !samePond(old, s)) {
        for (const k of old.keys) changed.add(k);
        this.ponds.delete(id);
      }
    }
    for (const s of specs) {
      if (this.ponds.has(s.id)) continue;
      const c = compile(s);
      this.ponds.set(s.id, c);
      for (const k of c.keys) changed.add(k);
    }
    this.byHex.clear();
    for (const p of this.ponds.values()) for (const k of p.keys) this.byHex.set(k, p);
    if (changed.size) this.version += 1;
    return changed;
  }

  pondAtHex(q: number, r: number): PondSpec | null {
    return this.byHex.get(hexKey(q, r)) ?? null;
  }

  pondAt(x: number, z: number): PondSpec | null {
    const a = worldToAxial(x, z);
    return this.byHex.get(hexKey(a.q, a.r)) ?? null;
  }

  dugAt(x: number, z: number): boolean {
    return this.pondAt(x, z)?.dug ?? false;
  }

  /** Distance from (x, z) to the border of the pond whose hex contains it (≥ bank width = far). */
  borderDistance(x: number, z: number): number {
    const a = worldToAxial(x, z);
    const p = this.byHex.get(hexKey(a.q, a.r));
    if (!p) return 0;
    let d = POND_BANK_WIDTH * 2;
    for (const s of p.near.get(hexKey(a.q, a.r)) ?? []) d = Math.min(d, segmentDistance(x, z, s));
    return d;
  }

  apply(x: number, z: number, out: TerrainSample): void {
    if (this.byHex.size === 0) return;
    const a = worldToAxial(x, z);
    const p = this.byHex.get(hexKey(a.q, a.r));
    if (!p || !p.dug) return;
    let d = POND_BANK_WIDTH;
    for (const s of p.near.get(hexKey(a.q, a.r)) ?? []) {
      const sd = segmentDistance(x, z, s);
      if (sd < d) d = sd;
    }
    out.height = carveHeight(out.height, d, p.bottom, x, z);
    out.pond = smooth(d / POND_BANK_WIDTH);
    out.forest = 0;
    out.ruins = 0;
    out.moisture = Math.max(out.moisture, 0.75);
  }

  /** Deep enough for fish (dug ponds) / inside the water region (cages: checked by the caller). */
  isSwimmable(x: number, z: number, terrainHeight: number, minDepth = SWIM_MIN_DEPTH): boolean {
    const p = this.pondAt(x, z);
    return Boolean(p && p.surface - terrainHeight >= minDepth);
  }

  specs(): PondSpec[] {
    return [...this.ponds.values()];
  }

  border(id: string): Segment[] {
    return this.ponds.get(id)?.border ?? [];
  }
}

function samePond(a: CompiledPond, b: PondSpec): boolean {
  if (a.surface !== b.surface || a.bottom !== b.bottom || a.dug !== b.dug || a.keys.size !== b.hexes.length) return false;
  return b.hexes.every((h) => a.keys.has(hexKey(h.q, h.r)));
}

export interface PondMetrics {
  /** m² of water surface */
  area: number;
  /** m³ of water when full */
  volume: number;
  /** Shoreline length (m) */
  shoreline: number;
  maxDepth: number;
}

/** Area / volume by sampling the carved bowl (1.25 m grid). */
export function measurePond(baseHeight: (x: number, z: number) => number, spec: PondSpec): PondMetrics {
  const border = regionBorder(spec.hexes);
  const shoreline = border.reduce((s, b) => s + Math.hypot(b.bx - b.ax, b.bz - b.az), 0);
  if (!spec.dug) {
    return { area: spec.hexes.length * HEX_AREA, volume: spec.hexes.length * HEX_AREA * 3, shoreline, maxDepth: 3 };
  }
  const layer = new PondEditLayer();
  layer.setPonds([spec]);
  const step = 1.25;
  let area = 0;
  let volume = 0;
  let maxDepth = 0;
  for (const h of spec.hexes) {
    const c = axialToWorld(h.q, h.r);
    for (let z = c.z - HEX_RADIUS; z <= c.z + HEX_RADIUS; z += step) {
      for (let x = c.x - HEX_RADIUS; x <= c.x + HEX_RADIUS; x += step) {
        const a = worldToAxial(x, z);
        if (a.q !== h.q || a.r !== h.r) continue;
        const d = Math.min(POND_BANK_WIDTH, layer.borderDistance(x, z));
        const depth = spec.surface - carveHeight(baseHeight(x, z), d, spec.bottom, x, z);
        if (depth <= 0) continue;
        area += step * step;
        volume += depth * step * step;
        maxDepth = Math.max(maxDepth, depth);
      }
    }
  }
  return { area: Math.round(area), volume: Math.round(volume), shoreline: Math.round(shoreline), maxDepth: Math.round(maxDepth * 100) / 100 };
}
