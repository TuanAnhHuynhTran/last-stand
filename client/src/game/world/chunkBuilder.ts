/**
 * Pure chunk data generation (no Three.js): terrain surface, water surface and vegetation
 * placement for one hex-compatible world chunk.
 *
 * Seams: every vertex position is derived from a *global* grid index, and normals use
 * central differences of the same global height function, so two neighbouring chunks at the
 * same LOD produce bit-identical edge vertices. Chunks at different LODs are joined by skirts.
 */
import {
  WATER_LEVEL,
  WORLD_CHUNK_SIZE,
  createRng,
  createTerrainSample,
  getWorldBounds,
  getWorldChunkBounds,
  mixSeed,
  smoothstep,
  type TerrainSample,
  type WorldBounds,
  type WorldGenerator,
} from '@cityverse/shared';

export const SKIRT_DEPTH = 3;

export interface TerrainChunkData {
  cx: number;
  cz: number;
  lod: number;
  cell: number;
  /** Grid resolution (segments per side). */
  segments: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  /** (segments+1)² surface heights, row-major (z rows, x columns). */
  heights: Float32Array;
  bounds: WorldBounds;
  minHeight: number;
  maxHeight: number;
  /** Number of surface (non-skirt) vertices. */
  surfaceVertexCount: number;
}

export interface WaterChunkData {
  positions: Float32Array;
  /** Water depth at each vertex (negative = terrain above water). */
  depths: Float32Array;
  indices: Uint32Array;
}

export type VegetationKind =
  | 'tree_oak'
  | 'tree_round'
  | 'tree_pine'
  | 'tree_fruit'
  | 'tree_birch'
  | 'tree_autumn'
  | 'bush'
  | 'rock'
  | 'flower_warm'
  | 'flower_cool'
  | 'grass'
  | 'ruin_wall'
  | 'ruin_pillar';

export const VEGETATION_KINDS: readonly VegetationKind[] = [
  'tree_oak',
  'tree_round',
  'tree_pine',
  'tree_fruit',
  'tree_birch',
  'tree_autumn',
  'bush',
  'rock',
  'flower_warm',
  'flower_cool',
  'grass',
  'ruin_wall',
  'ruin_pillar',
];

export type VegetationLayer = 'tree' | 'prop' | 'detail';

export function vegetationLayer(kind: VegetationKind): VegetationLayer {
  if (kind.startsWith('tree_')) return 'tree';
  if (kind === 'grass' || kind.startsWith('flower_')) return 'detail';
  return 'prop';
}

/** Per-instance record stride: x, y, z, rotY, scaleXZ, scaleY, r, g, b */
export const VEG_STRIDE = 9;

export type VegetationChunkData = Partial<Record<VegetationKind, Float32Array>>;

// ─────────────────────────────────────────────────────────────────────────────
// Terrain
// ─────────────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const C = {
  grassLush: [0.42, 0.74, 0.3] as RGB,
  grassDry: [0.7, 0.76, 0.36] as RGB,
  grassHigh: [0.6, 0.8, 0.38] as RGB,
  dirt: [0.8, 0.6, 0.4] as RGB,
  farm: [0.52, 0.66, 0.28] as RGB,
  forestFloor: [0.3, 0.56, 0.25] as RGB,
  rock: [0.64, 0.6, 0.56] as RGB,
  rockLight: [0.78, 0.74, 0.68] as RGB,
  sand: [0.94, 0.85, 0.62] as RGB,
  wetSand: [0.74, 0.7, 0.5] as RGB,
  lakeBed: [0.46, 0.6, 0.5] as RGB,
  pondBank: [0.6, 0.47, 0.32] as RGB,
  pondBed: [0.38, 0.44, 0.32] as RGB,
  ruins: [0.68, 0.6, 0.52] as RGB,
};

function mix(out: RGB, c: RGB, t: number): void {
  if (t <= 0) return;
  const k = t > 1 ? 1 : t;
  out[0] += (c[0] - out[0]) * k;
  out[1] += (c[1] - out[1]) * k;
  out[2] += (c[2] - out[2]) * k;
}

/** Cheap deterministic hash → [0, 1) for per-vertex colour speckle. */
function hash01(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Stylised terrain colour from the continuous fields (seamless, no per-hex patches). */
export function terrainColor(s: TerrainSample, normalY: number, speckle: number, out: RGB): RGB {
  const h = s.height;
  out[0] = C.grassDry[0];
  out[1] = C.grassDry[1];
  out[2] = C.grassDry[2];
  mix(out, C.grassLush, smoothstep(0.3, 0.7, s.moisture));
  mix(out, C.dirt, smoothstep(0.4, 0.2, s.moisture) * 0.75 * (1 - s.starter * 0.85));
  mix(out, C.farm, smoothstep(0.62, 0.75, s.moisture) * smoothstep(5.5, 3, h) * 0.45);
  mix(out, C.grassHigh, smoothstep(5, 11, h) * 0.45);
  mix(out, C.forestFloor, s.forest * 0.85);
  mix(out, C.ruins, s.ruins * 0.8);
  mix(out, C.grassLush, s.starter * 0.7);

  const steep = smoothstep(0.86, 0.64, normalY);
  const rockAmt = Math.max(s.rock * 0.75, steep);
  if (rockAmt > 0) {
    // Smooth light/dark blend (a hard switch streaks along stretched slope triangles).
    const rock: RGB = [C.rock[0], C.rock[1], C.rock[2]];
    mix(rock, C.rockLight, 0.25 + 0.5 * smoothstep(3, 14, h));
    mix(out, rock, rockAmt);
  }

  // Shore band: sand just above the waterline, wet sand / lake bed below it.
  const above = h - WATER_LEVEL;
  if (above < 1.3) {
    mix(out, C.sand, smoothstep(1.3, 0.35, above) * (1 - s.starter) * smoothstep(0.62, 0.86, normalY));
    if (above < 0) {
      mix(out, C.wetSand, smoothstep(0, -0.6, above));
      mix(out, C.lakeBed, smoothstep(-0.6, -2.8, above));
    }
  }

  // Dug ponds: wet earth on the bank, olive mud on the bed (grass stays on the rim).
  if (s.pond > 0) {
    mix(out, C.pondBank, smoothstep(0.02, 0.25, s.pond));
    mix(out, C.pondBed, smoothstep(0.45, 0.9, s.pond));
  }

  const v = 0.97 + speckle * 0.06;
  out[0] *= v;
  out[1] *= v;
  out[2] *= v;
  return out;
}

/** Palette values are authored in sRGB; vertex colours must be linear. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const indexCache = new Map<number, Uint32Array>();

/** Surface + skirt index buffer for a given grid resolution (shared by all chunks). */
function getTerrainIndices(n: number): Uint32Array {
  const cached = indexCache.get(n);
  if (cached) return cached;
  const row = n + 1;
  const perimeter = perimeterIndices(n);
  const surfaceVerts = row * row;
  const tris: number[] = [];
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      tris.push(a, c, b, b, c, d);
    }
  }
  // Skirts: one extra vertex per perimeter vertex, dropped by SKIRT_DEPTH. Both windings so
  // they hide cracks from any viewing side without needing a double-sided material.
  for (let k = 0; k < perimeter.length; k += 1) {
    const p0 = perimeter[k];
    const p1 = perimeter[(k + 1) % perimeter.length];
    const s0 = surfaceVerts + k;
    const s1 = surfaceVerts + ((k + 1) % perimeter.length);
    tris.push(p0, s0, p1, p1, s0, s1);
    tris.push(p0, p1, s0, p1, s1, s0);
  }
  const arr = Uint32Array.from(tris);
  indexCache.set(n, arr);
  return arr;
}

function perimeterIndices(n: number): number[] {
  const row = n + 1;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(i); // top edge, left → right
  for (let j = 0; j < n; j += 1) out.push(j * row + n); // right edge, top → bottom
  for (let i = n; i > 0; i -= 1) out.push(n * row + i); // bottom edge, right → left
  for (let j = n; j > 0; j -= 1) out.push(j * row); // left edge, bottom → top
  return out;
}

export function buildTerrainChunk(
  world: WorldGenerator,
  cx: number,
  cz: number,
  cell: number,
  lod: number
): TerrainChunkData {
  const n = Math.round(WORLD_CHUNK_SIZE / cell);
  const row = n + 1;
  const bounds = getWorldChunkBounds(cx, cz);
  const worldMin = getWorldBounds().minX;
  const giBase = cx * n;
  const gjBase = cz * n;
  const gx = (gi: number): number => worldMin + gi * cell;

  // Heights with a 1-vertex border ring for central-difference normals.
  const bw = n + 3;
  const border = new Float32Array(bw * bw);
  for (let j = 0; j < bw; j += 1) {
    for (let i = 0; i < bw; i += 1) {
      border[j * bw + i] = world.terrain.heightAt(gx(giBase + i - 1), gx(gjBase + j - 1));
    }
  }

  const surface = row * row;
  const perimeter = perimeterIndices(n);
  const total = surface + perimeter.length;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const heights = new Float32Array(surface);
  const sample = createTerrainSample();
  const rgb: RGB = [0, 0, 0];
  let minH = Number.POSITIVE_INFINITY;
  let maxH = Number.NEGATIVE_INFINITY;

  for (let j = 0; j <= n; j += 1) {
    for (let i = 0; i <= n; i += 1) {
      const v = j * row + i;
      const gi = giBase + i;
      const gj = gjBase + j;
      const x = gx(gi);
      const z = gx(gj);
      const h = border[(j + 1) * bw + (i + 1)];
      const hL = border[(j + 1) * bw + i];
      const hR = border[(j + 1) * bw + i + 2];
      const hU = border[j * bw + i + 1];
      const hD = border[(j + 2) * bw + i + 1];
      let nx = -(hR - hL) / (2 * cell);
      let ny = 1;
      let nz = -(hD - hU) / (2 * cell);
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;

      world.terrain.sample(x, z, sample);
      terrainColor(sample, ny, hash01(Math.round(x * 2), Math.round(z * 2), 17), rgb);

      positions[v * 3] = x;
      positions[v * 3 + 1] = h;
      positions[v * 3 + 2] = z;
      normals[v * 3] = nx;
      normals[v * 3 + 1] = ny;
      normals[v * 3 + 2] = nz;
      colors[v * 3] = srgbToLinear(rgb[0]);
      colors[v * 3 + 1] = srgbToLinear(rgb[1]);
      colors[v * 3 + 2] = srgbToLinear(rgb[2]);
      heights[v] = h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }

  for (let k = 0; k < perimeter.length; k += 1) {
    const src = perimeter[k];
    const dst = surface + k;
    positions[dst * 3] = positions[src * 3];
    positions[dst * 3 + 1] = positions[src * 3 + 1] - SKIRT_DEPTH;
    positions[dst * 3 + 2] = positions[src * 3 + 2];
    for (let c = 0; c < 3; c += 1) {
      normals[dst * 3 + c] = normals[src * 3 + c];
      colors[dst * 3 + c] = colors[src * 3 + c];
    }
  }

  return {
    cx,
    cz,
    lod,
    cell,
    segments: n,
    positions,
    normals,
    colors,
    indices: getTerrainIndices(n),
    heights,
    bounds,
    minHeight: minH,
    maxHeight: maxH,
    surfaceVertexCount: surface,
  };
}

/**
 * Height on the rendered terrain surface (same triangulation as the mesh), or null when the
 * point is outside this chunk.
 */
export function sampleTerrainChunkHeight(chunk: TerrainChunkData, x: number, z: number): number | null {
  const { bounds, cell, segments: n, heights } = chunk;
  if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return null;
  const fx = (x - bounds.minX) / cell;
  const fz = (z - bounds.minZ) / cell;
  const i = Math.min(n - 1, Math.max(0, Math.floor(fx)));
  const j = Math.min(n - 1, Math.max(0, Math.floor(fz)));
  const u = fx - i;
  const v = fz - j;
  const row = n + 1;
  const ha = heights[j * row + i];
  const hb = heights[j * row + i + 1];
  const hc = heights[(j + 1) * row + i];
  const hd = heights[(j + 1) * row + i + 1];
  if (u + v <= 1) return ha + (hb - ha) * u + (hc - ha) * v;
  return hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Water
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Natural water (sea level). Cells inside the player's dug ponds are skipped — those ponds have
 * their own water surface at their own height (PondRenderer).
 */
export function buildWaterChunk(terrain: TerrainChunkData, world?: WorldGenerator): WaterChunkData | null {
  if (terrain.minHeight >= WATER_LEVEL) return null;
  const n = terrain.segments;
  const row = n + 1;
  const { heights, positions: tp } = terrain;
  const tris: number[] = [];
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      if (Math.min(heights[a], heights[b], heights[c], heights[d]) < WATER_LEVEL + 0.05) {
        if (world?.isDugWaterAt(tp[a * 3] + terrain.cell / 2, tp[a * 3 + 2] + terrain.cell / 2)) continue;
        tris.push(a, c, b, b, c, d);
      }
    }
  }
  if (tris.length === 0) return null;

  // Compact the vertex set to the vertices actually used.
  const remap = new Int32Array(row * row).fill(-1);
  const used: number[] = [];
  for (const idx of tris) {
    if (remap[idx] === -1) {
      remap[idx] = used.length;
      used.push(idx);
    }
  }
  const positions = new Float32Array(used.length * 3);
  const depths = new Float32Array(used.length);
  used.forEach((src, k) => {
    positions[k * 3] = tp[src * 3];
    positions[k * 3 + 1] = WATER_LEVEL;
    positions[k * 3 + 2] = tp[src * 3 + 2];
    depths[k] = WATER_LEVEL - heights[src];
  });
  const indices = new Uint32Array(tris.length);
  for (let k = 0; k < tris.length; k += 1) indices[k] = remap[tris[k]];
  return { positions, depths, indices };
}

// ─────────────────────────────────────────────────────────────────────────────
// Vegetation
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_CELL = 2.5;

interface FieldGrid {
  n: number;
  minX: number;
  minZ: number;
  height: Float32Array;
  forest: Float32Array;
  moisture: Float32Array;
  rock: Float32Array;
  ruins: Float32Array;
  starter: Float32Array;
  bank: Float32Array;
}

function buildFieldGrid(world: WorldGenerator, bounds: WorldBounds): FieldGrid {
  const n = Math.round(WORLD_CHUNK_SIZE / FIELD_CELL);
  const count = (n + 1) * (n + 1);
  const g: FieldGrid = {
    n,
    minX: bounds.minX,
    minZ: bounds.minZ,
    height: new Float32Array(count),
    forest: new Float32Array(count),
    moisture: new Float32Array(count),
    rock: new Float32Array(count),
    ruins: new Float32Array(count),
    starter: new Float32Array(count),
    bank: new Float32Array(count),
  };
  const s = createTerrainSample();
  for (let j = 0; j <= n; j += 1) {
    for (let i = 0; i <= n; i += 1) {
      const k = j * (n + 1) + i;
      world.terrain.sample(bounds.minX + i * FIELD_CELL, bounds.minZ + j * FIELD_CELL, s);
      g.height[k] = s.height;
      g.forest[k] = s.forest;
      g.moisture[k] = s.moisture;
      g.rock[k] = s.rock;
      g.ruins[k] = s.ruins;
      g.starter[k] = s.starter;
      g.bank[k] = s.riverBank;
    }
  }
  return g;
}

interface FieldPoint {
  height: number;
  forest: number;
  moisture: number;
  rock: number;
  ruins: number;
  starter: number;
  bank: number;
  /** Height change per unit (gradient magnitude) */
  slope: number;
}

function sampleFields(g: FieldGrid, x: number, z: number, out: FieldPoint): FieldPoint {
  const fx = Math.min(g.n - 1e-6, Math.max(0, (x - g.minX) / FIELD_CELL));
  const fz = Math.min(g.n - 1e-6, Math.max(0, (z - g.minZ) / FIELD_CELL));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const row = g.n + 1;
  const k00 = j * row + i;
  const k10 = k00 + 1;
  const k01 = k00 + row;
  const k11 = k01 + 1;
  const bl = (a: Float32Array): number =>
    (a[k00] * (1 - u) + a[k10] * u) * (1 - v) + (a[k01] * (1 - u) + a[k11] * u) * v;
  out.height = bl(g.height);
  out.forest = bl(g.forest);
  out.moisture = bl(g.moisture);
  out.rock = bl(g.rock);
  out.ruins = bl(g.ruins);
  out.starter = bl(g.starter);
  out.bank = bl(g.bank);
  const dx = (g.height[k10] - g.height[k00] + g.height[k11] - g.height[k01]) / (2 * FIELD_CELL);
  const dz = (g.height[k01] - g.height[k00] + g.height[k11] - g.height[k10]) / (2 * FIELD_CELL);
  out.slope = Math.hypot(dx, dz);
  return out;
}

/** Smooth value noise in [0, 1) used to cluster tree species and flower colours. */
function clusterNoise(seed: number, x: number, z: number, scale: number): number {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const u = fx - ix;
  const v = fz - iz;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const a = hash01(ix, iz, seed);
  const b = hash01(ix + 1, iz, seed);
  const c = hash01(ix, iz + 1, seed);
  const d = hash01(ix + 1, iz + 1, seed);
  return (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv;
}

class InstanceWriter {
  private readonly lists = new Map<VegetationKind, number[]>();

  push(kind: VegetationKind, x: number, y: number, z: number, rot: number, s: number, sy: number, tint: RGB): void {
    let list = this.lists.get(kind);
    if (!list) {
      list = [];
      this.lists.set(kind, list);
    }
    list.push(x, y, z, rot, s, sy, tint[0], tint[1], tint[2]);
  }

  finish(): VegetationChunkData {
    const out: VegetationChunkData = {};
    for (const [kind, list] of this.lists) out[kind] = Float32Array.from(list);
    return out;
  }
}

export interface VegetationOptions {
  grassSpacing: number;
}

export function buildVegetationChunk(
  world: WorldGenerator,
  cx: number,
  cz: number,
  options: VegetationOptions
): VegetationChunkData {
  const bounds = getWorldChunkBounds(cx, cz);
  const grid = buildFieldGrid(world, bounds);
  const seed = world.terrain.seed;
  const writer = new InstanceWriter();
  const p: FieldPoint = {
    height: 0,
    forest: 0,
    moisture: 0,
    rock: 0,
    ruins: 0,
    starter: 0,
    bank: 0,
    slope: 0,
  };
  const white: RGB = [1, 1, 1];
  const tint: RGB = [1, 1, 1];

  /** Jittered-grid scatter: one candidate per cell, deterministic per chunk & layer. */
  const scatter = (layer: number, spacing: number, visit: (x: number, z: number, rng: () => number) => void): void => {
    const rng = createRng(mixSeed(seed, cx, cz, layer));
    const n = Math.floor(WORLD_CHUNK_SIZE / spacing);
    const step = WORLD_CHUNK_SIZE / n;
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const x = bounds.minX + (i + 0.1 + rng() * 0.8) * step;
        const z = bounds.minZ + (j + 0.1 + rng() * 0.8) * step;
        visit(x, z, rng);
      }
    }
  };

  const onDryLand = (): boolean => p.height > WATER_LEVEL + 0.45;

  // Trees
  scatter(1, 4.3, (x, z, rng) => {
    sampleFields(grid, x, z, p);
    if (!onDryLand() || p.slope > 0.75 || p.rock > 0.65) return;
    const chance = (Math.pow(p.forest, 1.15) * 0.92 + 0.012) * (1 - p.starter) * (1 - p.ruins * 0.7);
    if (rng() >= chance) return;
    const species = clusterNoise(seed + 7, x, z, 38);
    let kind: VegetationKind;
    if (p.height > 8 || p.rock > 0.3) kind = 'tree_pine';
    else if (p.bank > 0.3 || p.moisture > 0.78) kind = species > 0.5 ? 'tree_birch' : 'tree_round';
    else if (species > 0.78) kind = 'tree_autumn';
    else if (p.forest < 0.3 && rng() < 0.18) kind = 'tree_fruit';
    else if (species < 0.22) kind = 'tree_pine';
    else kind = rng() < 0.55 ? 'tree_oak' : 'tree_round';
    const s = (0.82 + rng() * 0.38) * (0.92 + p.forest * 0.18);
    const g = 0.92 + rng() * 0.16;
    tint[0] = g;
    tint[1] = 0.94 + rng() * 0.12;
    tint[2] = g;
    writer.push(kind, x, p.height - 0.15, z, rng() * Math.PI * 2, s, s * (0.9 + rng() * 0.22), tint);
  });

  // Bushes (forest edges, river banks, a few in the open)
  scatter(2, 5.5, (x, z, rng) => {
    sampleFields(grid, x, z, p);
    if (!onDryLand() || p.slope > 0.8) return;
    const edge = smoothstep(0.12, 0.45, p.forest) * (1 - smoothstep(0.7, 1, p.forest));
    const chance = (edge * 0.32 + p.bank * 0.08 + 0.022) * (1 - p.starter * 0.85);
    if (rng() >= chance) return;
    const s = 0.75 + rng() * 0.55;
    writer.push('bush', x, p.height - 0.1, z, rng() * Math.PI * 2, s, s * (0.85 + rng() * 0.3), white);
  });

  // Rocks (hills, mountains, ruins, shores)
  scatter(3, 7, (x, z, rng) => {
    sampleFields(grid, x, z, p);
    if (p.height < WATER_LEVEL - 0.8) return;
    const chance = (p.rock * 0.4 + p.ruins * 0.15 + smoothstep(0.35, 0.7, p.slope) * 0.2 + 0.012) * (1 - p.starter * 0.9);
    if (rng() >= chance) return;
    const s = (0.55 + rng() * 0.8) * (1 + p.rock * 0.9);
    const shade = 0.9 + rng() * 0.18;
    tint[0] = shade;
    tint[1] = shade;
    tint[2] = shade * (0.96 + rng() * 0.06);
    writer.push('rock', x, p.height - 0.25 * s, z, rng() * Math.PI * 2, s, s * (0.55 + rng() * 0.35), tint);
  });

  // Ruins props
  scatter(4, 6, (x, z, rng) => {
    sampleFields(grid, x, z, p);
    if (!onDryLand() || p.ruins < 0.25) return;
    if (rng() >= p.ruins * 0.32) return;
    const kind: VegetationKind = rng() < 0.6 ? 'ruin_wall' : 'ruin_pillar';
    const rot = Math.round(rng() * 6) * (Math.PI / 3) + (rng() - 0.5) * 0.3;
    const s = 0.8 + rng() * 0.45;
    writer.push(kind, x, p.height - 0.2, z, rot, s, s * (0.75 + rng() * 0.5), white);
  });

  // Flowers (meadows, a sprinkle on the starter land)
  scatter(5, 4.5, (x, z, rng) => {
    sampleFields(grid, x, z, p);
    if (!onDryLand() || p.slope > 0.5) return;
    const meadow =
      smoothstep(0.32, 0.5, p.moisture) * (1 - smoothstep(0.25, 0.5, p.forest)) * (1 - p.rock) * (1 - p.ruins);
    const chance = meadow * 0.2 + p.starter * 0.06;
    if (rng() >= chance) return;
    const kind: VegetationKind = clusterNoise(seed + 13, x, z, 26) > 0.5 ? 'flower_warm' : 'flower_cool';
    const s = 0.8 + rng() * 0.5;
    writer.push(kind, x, p.height - 0.05, z, rng() * Math.PI * 2, s, s, white);
  });

  // Grass tufts
  if (options.grassSpacing > 0) {
    scatter(6, options.grassSpacing, (x, z, rng) => {
      sampleFields(grid, x, z, p);
      if (p.height < WATER_LEVEL + 0.6 || p.slope > 0.7) return;
      const grassy =
        smoothstep(0.22, 0.45, p.moisture) * (1 - p.rock) * (1 - p.ruins * 0.6) * (1 - p.forest * 0.45);
      if (rng() >= grassy * 0.75) return;
      const s = 0.75 + rng() * 0.6;
      const lush = smoothstep(0.35, 0.8, p.moisture);
      tint[0] = 0.95 - lush * 0.12 + rng() * 0.08;
      tint[1] = 0.95 + rng() * 0.08;
      tint[2] = 0.85 - lush * 0.05;
      writer.push('grass', x, p.height - 0.05, z, rng() * Math.PI * 2, s, s * (0.8 + rng() * 0.5), tint);
    });
  }

  return writer.finish();
}

export function countVegetation(data: VegetationChunkData): number {
  let total = 0;
  for (const kind of VEGETATION_KINDS) total += (data[kind]?.length ?? 0) / VEG_STRIDE;
  return total;
}
