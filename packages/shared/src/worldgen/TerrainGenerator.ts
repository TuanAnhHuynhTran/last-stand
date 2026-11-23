/**
 * TerrainGenerator — continuous, seeded terrain fields over the world plane.
 *
 * Everything here is a smooth function of (x, z): height, moisture, forest density,
 * rockiness, lakes, rivers, ruins. The hex grid only *samples* these fields, which is what
 * keeps biomes as large continuous regions instead of a per-hex patchwork, and what lets
 * the renderer draw one seamless surface across chunks.
 */
import { HEX_WORLD_SIZE } from '../hex/hexMath.js';
import { SimplexNoise2D, clamp01, hashSeed, lerp, mixSeed, smoothstep } from './noise.js';

export const WORLDGEN_VERSION = 'lh-worldgen-v1';
export const WATER_LEVEL = 0;
/** Generous upper bound for terrain height (used by ray picking and camera limits). */
export const MAX_TERRAIN_HEIGHT = 40;
export const MIN_TERRAIN_HEIGHT = -6;

/** Radius (world units) of the guaranteed flat starter plateau and its blend band. */
export const STARTER_FLAT_RADIUS = 62;
export const STARTER_BLEND_RADIUS = 96;

export interface TerrainSample {
  height: number;
  /** 0..1, dry → wet */
  moisture: number;
  /** 0..1 forest density */
  forest: number;
  /** 0..1 exposed rock tendency (mountains, high hills) */
  rock: number;
  /** 0..1 lake basin mask */
  lake: number;
  /** 0..1 river channel mask (1 = in the water channel) */
  river: number;
  /** 0..1 wider river valley / bank mask */
  riverBank: number;
  /** 0..1 ruins cluster mask */
  ruins: number;
  /** 0..1 mountain region mask */
  mountain: number;
  /** 0..1 how strongly the starter plateau shapes this point */
  starter: number;
  /** 0..1 inside a dug pond: 0 on its rim, 1 on the flat bed (player terrain edits) */
  pond: number;
}

/**
 * Player terrain edits applied on top of the seed terrain (e.g. dug ponds). The seed terrain
 * stays the source of truth; edits only lower points inside their own region and are zero on
 * its border, so the edited surface is continuous with the untouched land around it.
 */
export interface TerrainEdits {
  apply(x: number, z: number, out: TerrainSample): void;
}

export function createTerrainSample(): TerrainSample {
  return {
    height: 0,
    moisture: 0,
    forest: 0,
    rock: 0,
    lake: 0,
    river: 0,
    riverBank: 0,
    ruins: 0,
    mountain: 0,
    starter: 0,
    pond: 0,
  };
}

export interface StarterSite {
  x: number;
  z: number;
  /** Height of the flattened plateau */
  plateauHeight: number;
  /** Plateau radius (development test worlds get a bigger one) */
  flatRadius?: number;
  blendRadius?: number;
}

/** Converts any seed representation into the 32-bit generator seed. */
export function resolveSeed(seed: string | number): number {
  return typeof seed === 'number' ? seed >>> 0 : hashSeed(`${WORLDGEN_VERSION}:${seed}`);
}

export class TerrainGenerator {
  readonly seed: number;
  readonly starter: StarterSite | null;

  private readonly nContinent: SimplexNoise2D;
  private readonly nRoll: SimplexNoise2D;
  private readonly nHillMask: SimplexNoise2D;
  private readonly nHill: SimplexNoise2D;
  private readonly nMountainMask: SimplexNoise2D;
  private readonly nPeak: SimplexNoise2D;
  private readonly nLake: SimplexNoise2D;
  private readonly nWarp: SimplexNoise2D;
  private readonly nRiver: SimplexNoise2D;
  private readonly nMoisture: SimplexNoise2D;
  private readonly nForest: SimplexNoise2D;
  private readonly nRuins: SimplexNoise2D;
  private readonly nDetail: SimplexNoise2D;

  constructor(seed: string | number, starter: StarterSite | null = null) {
    this.seed = resolveSeed(seed);
    this.starter = starter;
    const s = this.seed;
    this.nContinent = new SimplexNoise2D(mixSeed(s, 1));
    this.nRoll = new SimplexNoise2D(mixSeed(s, 2));
    this.nHillMask = new SimplexNoise2D(mixSeed(s, 3));
    this.nHill = new SimplexNoise2D(mixSeed(s, 4));
    this.nMountainMask = new SimplexNoise2D(mixSeed(s, 5));
    this.nPeak = new SimplexNoise2D(mixSeed(s, 6));
    this.nLake = new SimplexNoise2D(mixSeed(s, 7));
    this.nWarp = new SimplexNoise2D(mixSeed(s, 8));
    this.nRiver = new SimplexNoise2D(mixSeed(s, 9));
    this.nMoisture = new SimplexNoise2D(mixSeed(s, 10));
    this.nForest = new SimplexNoise2D(mixSeed(s, 11));
    this.nRuins = new SimplexNoise2D(mixSeed(s, 12));
    this.nDetail = new SimplexNoise2D(mixSeed(s, 13));
  }

  private edits: TerrainEdits | null = null;
  private editsBypass = 0;

  /** Installs (or clears) the player terrain edit layer. */
  setEdits(edits: TerrainEdits | null): void {
    this.edits = edits;
  }

  get hasEdits(): boolean {
    return this.edits !== null;
  }

  /** Seed terrain height, ignoring player edits (used to plan new edits). */
  baseHeightAt(x: number, z: number): number {
    this.editsBypass += 1;
    try {
      return this.sample(x, z, BASE_SCRATCH).height;
    } finally {
      this.editsBypass -= 1;
    }
  }

  /** Same fields, with the starter plateau applied at `site`. */
  withStarter(site: StarterSite): TerrainGenerator {
    return new TerrainGenerator(this.seed, site);
  }

  heightAt(x: number, z: number): number {
    return this.sample(x, z, SCRATCH).height;
  }

  sample(x: number, z: number, out: TerrainSample = createTerrainSample()): TerrainSample {
    // ── Large-scale shape ────────────────────────────────────────────────────
    const continent = this.nContinent.fbm(x / 420, z / 420, 3);
    const roll = this.nRoll.fbm(x / 95, z / 95, 2) * 0.9;

    const hillMask = smoothstep(0.05, 0.45, this.nHillMask.fbm(x / 260, z / 260, 2));
    const hills = hillMask * (0.55 + 0.45 * this.nHill.fbm(x / 70, z / 70, 3)) * 7.5;

    const mountain = smoothstep(0.26, 0.58, this.nMountainMask.fbm(x / 300, z / 300, 2));
    const p = this.nPeak.fbm(x / 115, z / 115, 3);
    // 1 - p² keeps crests rounded (no creases) for the soft chibi look.
    const peaks = mountain * (0.42 + 0.58 * (1 - p * p)) * 21;

    // ── Water ────────────────────────────────────────────────────────────────
    const lakeField = this.nLake.fbm(x / 210, z / 210, 2);
    const lake = smoothstep(0.3, 0.48, lakeField);

    const wx = x + this.nWarp.fbm(x / 200, z / 200, 2) * 60;
    const wz = z + this.nWarp.fbm(x / 200 + 31.7, z / 200 - 12.9, 2) * 60;
    const rd = Math.abs(this.nRiver.fbm(wx / 380, wz / 380, 2));
    const river = 1 - smoothstep(0.016, 0.036, rd);
    const riverBank = 1 - smoothstep(0.036, 0.11, rd);

    // ── Compose height ───────────────────────────────────────────────────────
    let land = 2.6 + continent * 3.2 + roll;
    land += hills * (1 - riverBank * 0.8);
    land += peaks * (1 - riverBank) * (1 - lake);

    // Gentle frame of hills along the world border.
    const edge = Math.min(HALF_WORLD - Math.abs(x), HALF_WORLD - Math.abs(z));
    land += (1 - smoothstep(0, 70, edge)) * 9;

    // River valley: pull banks down toward ~1 m above water, then carve the channel.
    land = lerp(land, Math.min(land, 1.1), riverBank * 0.85);
    let h = lerp(land, WATER_LEVEL - 2.3, river);

    // Lakes: soft bowls with a shallow shelf near the shore.
    const lakeFloor = WATER_LEVEL - 0.9 - 3.6 * smoothstep(0.48, 0.7, lakeField);
    h = lerp(h, Math.min(h, lakeFloor), lake);

    // ── Starter plateau ──────────────────────────────────────────────────────
    let starter = 0;
    if (this.starter) {
      const d = Math.hypot(x - this.starter.x, z - this.starter.z);
      starter = 1 - smoothstep(this.starter.flatRadius ?? STARTER_FLAT_RADIUS, this.starter.blendRadius ?? STARTER_BLEND_RADIUS, d);
      if (starter > 0) {
        const undulation = this.nDetail.fbm(x / 40, z / 40, 2) * 0.3;
        h = lerp(h, this.starter.plateauHeight + undulation, starter);
      }
    }

    // ── Ecology fields ───────────────────────────────────────────────────────
    const lakeShore = smoothstep(0.15, 0.35, lakeField);
    const moisture = clamp01(
      0.5 + 0.55 * this.nMoisture.fbm(x / 260, z / 260, 3) + 0.3 * riverBank + 0.25 * lakeShore
    );

    const forestBase = this.nForest.fbm(x / 150, z / 150, 3) + (moisture - 0.5) * 0.5;
    const highland = smoothstep(16, 24, h);
    const forest =
      smoothstep(0.02, 0.32, forestBase) * (1 - highland) * (1 - river) * (1 - starter * 0.92);

    const ruins =
      smoothstep(0.5, 0.6, this.nRuins.fbm(x / 85, z / 85, 2)) *
      (1 - riverBank) *
      (1 - lake) *
      (1 - mountain) *
      (1 - starter);

    out.height = h;
    out.moisture = moisture;
    out.forest = forest;
    out.rock = clamp01(smoothstep(9, 20, h) * 0.8 + mountain * 0.35 * (1 - starter));
    out.lake = lake;
    out.river = river;
    out.riverBank = riverBank;
    out.ruins = ruins;
    out.mountain = mountain;
    out.starter = starter;
    out.pond = 0;
    if (this.edits && this.editsBypass === 0) this.edits.apply(x, z, out);
    return out;
  }
}

const HALF_WORLD = HEX_WORLD_SIZE / 2;
const SCRATCH = createTerrainSample();
const BASE_SCRATCH = createTerrainSample();
