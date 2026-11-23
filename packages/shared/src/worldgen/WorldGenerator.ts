/**
 * WorldGenerator — turns a world_seed into the logical hex world.
 *
 *  1. Picks a starter site deterministically (open land, away from water and mountains).
 *  2. Builds the final TerrainGenerator with a flattened starter plateau.
 *  3. Classifies hexes by sampling the continuous fields (centre + 6 inner corners).
 *  4. Grows a connected starter territory of ~115 buildable hexes (≈ 100 × 100 m²).
 *
 * Nothing is stored per hex: any tile can be recomputed from the seed on client or server.
 */
import {
  HEX_RADIUS,
  axialToWorld,
  getHexEdgeCorners,
  hexKey,
  hexNeighbor,
  hexNeighbors,
  isWithinWorldBounds,
  worldToAxial,
  type AxialCoord,
} from '../hex/hexMath.js';
import { getChunkHexes, hexToChunk } from '../hex/hexChunks.js';
import { SimplexNoise2D, mixSeed } from './noise.js';
import {
  STARTER_FLAT_RADIUS,
  TerrainGenerator,
  WATER_LEVEL,
  createTerrainSample,
  type TerrainEdits,
  type StarterSite,
  type TerrainSample,
} from './TerrainGenerator.js';

export type HexTerrainType =
  | 'dirt'
  | 'grassland'
  | 'farmland'
  | 'forest'
  | 'hill'
  | 'low_mountain'
  | 'lake'
  | 'river'
  | 'riverbank'
  | 'ruins';

export const HEX_TERRAIN_TYPES: readonly HexTerrainType[] = [
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

export const HEX_TERRAIN_LABELS: Record<HexTerrainType, string> = {
  dirt: 'Đất thường',
  grassland: 'Đồng cỏ',
  farmland: 'Đất canh tác',
  forest: 'Rừng',
  hill: 'Đồi',
  low_mountain: 'Núi thấp',
  lake: 'Hồ nước',
  river: 'Sông',
  riverbank: 'Bờ sông / bờ hồ',
  ruins: 'Khu đổ nát',
};

const BUILDABLE_TYPES: ReadonlySet<HexTerrainType> = new Set(['dirt', 'grassland', 'farmland']);
const WATER_TYPES: ReadonlySet<HexTerrainType> = new Set(['lake', 'river']);

/** Max height difference (m) inside one hex for it to count as buildable. */
export const BUILDABLE_MAX_SLOPE = 1.6;
export const STARTER_TERRITORY_SIZE = 115;

/**
 * Development test worlds (Phase 9): seeds with this prefix get a much larger starter territory so
 * big compounds (stables, elephant camps) can be tested. Such seeds are ONLY created by the
 * development tool route (never mounted in production); normal cities get `CV-<TER>-<hex>` seeds.
 */
export const DEV_WORLD_SEED_PREFIX = 'CV-DEV-';
export const DEV_TERRITORY_SIZE = 340;
export const DEV_FLAT_RADIUS = 118;
export const DEV_BLEND_RADIUS = 160;
export function isDevWorldSeed(seed: string): boolean {
  return seed.startsWith(DEV_WORLD_SEED_PREFIX);
}

/** Edits that turn whole hexes into water (dug ponds). */
export interface HexWaterEdits {
  pondAtHex(q: number, r: number): unknown;
  /** Inside a dug pond (which has its own water surface) */
  dugAt(x: number, z: number): boolean;
}

export interface HexTile {
  q: number;
  r: number;
  key: string;
  type: HexTerrainType;
  /** Terrain height at the hex centre */
  height: number;
  /** Height spread across centre + corners (m) */
  slope: number;
  buildable: boolean;
  isWater: boolean;
  chunkX: number;
  chunkZ: number;
}

export interface HexEdgeRef {
  q: number;
  r: number;
  /** Neighbour direction 0..5 (see HEX_DIRECTIONS) */
  direction: number;
  /** Corner indices into getHexPolygon(q, r) */
  corners: [number, number];
}

export interface WorldSpawn extends StarterSite {
  q: number;
  r: number;
}

export function isBuildableTerrain(type: HexTerrainType): boolean {
  return BUILDABLE_TYPES.has(type);
}

export function isWaterTerrain(type: HexTerrainType): boolean {
  return WATER_TYPES.has(type);
}

export class WorldGenerator {
  readonly worldSeed: string;
  readonly terrain: TerrainGenerator;
  readonly spawn: WorldSpawn;

  private readonly tileCache = new Map<string, HexTile>();
  private readonly starterKeys: ReadonlySet<string>;
  private readonly starterList: readonly AxialCoord[];
  private readonly territoryNoise: SimplexNoise2D;
  private readonly sample = createTerrainSample();

  constructor(worldSeed: string) {
    this.worldSeed = worldSeed;
    const base = new TerrainGenerator(worldSeed);
    const dev = isDevWorldSeed(worldSeed);
    const site = { ...pickStarterSite(base), ...(dev ? { flatRadius: DEV_FLAT_RADIUS, blendRadius: DEV_BLEND_RADIUS } : {}) };
    const hex = worldToAxial(site.x, site.z);
    const center = axialToWorld(hex.q, hex.r);
    this.spawn = { ...site, x: center.x, z: center.z, q: hex.q, r: hex.r };
    this.terrain = base.withStarter(this.spawn);
    this.territoryNoise = new SimplexNoise2D(mixSeed(this.terrain.seed, 99));
    this.starterList = this.growStarterTerritory();
    this.starterKeys = new Set(this.starterList.map((h) => hexKey(h.q, h.r)));
  }

  private hexEdits: HexWaterEdits | null = null;
  private claims: readonly AxialCoord[] = [];
  private claimKeys = new Set<string>();

  setClaims(hexes: readonly AxialCoord[]): void {
    this.claims = hexes;
    this.claimKeys = new Set(hexes.map(h => hexKey(h.q, h.r)));
  }

  getOwnedTerritory(): readonly AxialCoord[] {
    return [...this.starterList, ...this.claims.filter(h => !this.starterKeys.has(hexKey(h.q, h.r)))];
  }

  /**
   * Installs player terrain edits (dug ponds) on top of the seed terrain. Heights everywhere
   * (terrain mesh, vegetation, picking) then follow the edited surface; dug hexes classify as water.
   */
  setTerrainEdits(edits: (TerrainEdits & HexWaterEdits) | null): void {
    this.hexEdits = edits;
    this.terrain.setEdits(edits);
    this.tileCache.clear();
  }

  /** True inside a player-dug pond (its water is not the natural sea-level water). */
  isDugWaterAt(x: number, z: number): boolean {
    return this.hexEdits?.dugAt(x, z) ?? false;
  }

  getHexTile(q: number, r: number): HexTile {
    const key = hexKey(q, r);
    const cached = this.tileCache.get(key);
    if (cached) return cached;
    const tile = this.classify(q, r, key);
    this.tileCache.set(key, tile);
    return tile;
  }

  getChunkTiles(cx: number, cz: number): HexTile[] {
    return getChunkHexes(cx, cz).map((h) => this.getHexTile(h.q, h.r));
  }

  getStarterTerritory(): readonly AxialCoord[] {
    return this.starterList;
  }

  /** Ownership for phase 2 = the starter territory (persisted claims come in later phases). */
  isOwned(q: number, r: number): boolean {
    return this.starterKeys.has(hexKey(q, r)) || this.claimKeys.has(hexKey(q, r));
  }

  /** Edges between an owned hex and a non-owned neighbour. */
  getTerritoryBorderEdges(): HexEdgeRef[] {
    const edges: HexEdgeRef[] = [];
    for (const h of this.getOwnedTerritory()) {
      for (let dir = 0; dir < 6; dir += 1) {
        const nb = hexNeighbor(h, dir);
        if (!this.isOwned(nb.q, nb.r)) {
          edges.push({ q: h.q, r: h.r, direction: dir, corners: getHexEdgeCorners(dir) });
        }
      }
    }
    return edges;
  }

  sampleAt(x: number, z: number, out?: TerrainSample): TerrainSample {
    return this.terrain.sample(x, z, out);
  }

  private classify(q: number, r: number, key: string): HexTile {
    const c = axialToWorld(q, r);
    const s = this.terrain.sample(c.x, c.z, this.sample);
    const center = { ...s };

    let minH = center.height;
    let maxH = center.height;
    let waterCount = center.height < WATER_LEVEL - 0.05 ? 1 : 0;
    const inner = HEX_RADIUS * 0.85;
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const h = this.terrain.heightAt(c.x + Math.cos(a) * inner, c.z + Math.sin(a) * inner);
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
      if (h < WATER_LEVEL - 0.05) waterCount += 1;
    }
    const slope = maxH - minH;

    let type: HexTerrainType;
    if (center.height < WATER_LEVEL - 0.1 && waterCount >= 4) {
      type = center.river > center.lake ? 'river' : 'lake';
    } else if (waterCount >= 1 || center.height < WATER_LEVEL + 0.6) {
      type = 'riverbank';
    } else if (center.height >= 15 || (center.mountain > 0.55 && center.height >= 11)) {
      type = 'low_mountain';
    } else if (center.height >= 7.5 || slope >= 3.2) {
      type = 'hill';
    } else if (center.ruins > 0.5) {
      type = 'ruins';
    } else if (center.forest > 0.55) {
      type = 'forest';
    } else if (center.moisture > 0.62 && slope < 1.2 && center.height < 5.5) {
      type = 'farmland';
    } else if (center.moisture > 0.4) {
      type = 'grassland';
    } else {
      type = 'dirt';
    }

    const chunk = hexToChunk(q, r);
    if (this.hexEdits?.pondAtHex(q, r)) {
      return { q, r, key, type: 'lake', height: center.height, slope, buildable: false, isWater: true, chunkX: chunk.cx, chunkZ: chunk.cz };
    }
    return {
      q,
      r,
      key,
      type,
      height: center.height,
      slope,
      buildable:
        isBuildableTerrain(type) && slope < BUILDABLE_MAX_SLOPE && isWithinWorldBounds(q, r),
      isWater: isWaterTerrain(type),
      chunkX: chunk.cx,
      chunkZ: chunk.cz,
    };
  }

  /** Best-first growth from the spawn hex; organic outline, always connected. */
  private growStarterTerritory(): AxialCoord[] {
    const start: AxialCoord = { q: this.spawn.q, r: this.spawn.r };
    const score = (h: AxialCoord): number => {
      const w = axialToWorld(h.q, h.r);
      const d = Math.hypot(w.x - this.spawn.x, w.z - this.spawn.z) / 10;
      return d + this.territoryNoise.noise(w.x / 45, w.z / 45) * 1.4;
    };
    const accepted: AxialCoord[] = [];
    const seen = new Set<string>([hexKey(start.q, start.r)]);
    const frontier: { h: AxialCoord; s: number }[] = [{ h: start, s: 0 }];

    const dev = isDevWorldSeed(this.worldSeed);
    const size = dev ? DEV_TERRITORY_SIZE : STARTER_TERRITORY_SIZE;
    const radius = dev ? DEV_FLAT_RADIUS : STARTER_FLAT_RADIUS;
    while (frontier.length > 0 && accepted.length < size) {
      let best = 0;
      for (let i = 1; i < frontier.length; i += 1) {
        if (frontier[i].s < frontier[best].s) best = i;
      }
      const { h } = frontier.splice(best, 1)[0];
      const tile = this.getHexTile(h.q, h.r);
      const w = axialToWorld(h.q, h.r);
      const inPlateau = Math.hypot(w.x - this.spawn.x, w.z - this.spawn.z) <= radius;
      if (!tile.buildable || !inPlateau) continue;
      accepted.push(h);
      for (const nb of hexNeighbors(h)) {
        const k = hexKey(nb.q, nb.r);
        if (!seen.has(k) && isWithinWorldBounds(nb.q, nb.r)) {
          seen.add(k);
          frontier.push({ h: nb, s: score(nb) });
        }
      }
    }
    return accepted;
  }
}

/**
 * Deterministic starter site search on the un-flattened terrain: prefer open, gentle land
 * near the world centre, with water visible nearby but not inside the plateau.
 */
export function pickStarterSite(base: TerrainGenerator): StarterSite {
  const s = createTerrainSample();
  let best = { x: 0, z: 0, score: Number.POSITIVE_INFINITY, height: 3 };

  for (let ring = 0; ring <= 8; ring += 1) {
    const count = ring === 0 ? 1 : ring * 6;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + ring * 0.37;
      const cx = Math.cos(a) * ring * 30;
      const cz = Math.sin(a) * ring * 30;

      let penalty = 0;
      let hSum = 0;
      let n = 0;
      let nearWater = 0;
      for (let k = 0; k < 3; k += 1) {
        const rad = [0, 40, 80][k];
        const steps = k === 0 ? 1 : 12;
        for (let j = 0; j < steps; j += 1) {
          const b = (j / steps) * Math.PI * 2;
          base.sample(cx + Math.cos(b) * rad, cz + Math.sin(b) * rad, s);
          if (s.height < WATER_LEVEL + 0.8 || s.river > 0.2 || s.lake > 0.2) penalty += 6;
          penalty += s.mountain * 4 + Math.max(0, s.height - 7) * 0.8 + s.ruins * 2;
          hSum += s.height;
          n += 1;
        }
      }
      for (let j = 0; j < 16; j += 1) {
        const b = (j / 16) * Math.PI * 2;
        const h = base.heightAt(cx + Math.cos(b) * 160, cz + Math.sin(b) * 160);
        if (h < WATER_LEVEL) nearWater = 1;
      }
      const score = penalty + Math.hypot(cx, cz) / 40 - nearWater * 2;
      if (score < best.score) best = { x: cx, z: cz, score, height: hSum / n };
    }
  }

  return {
    x: best.x,
    z: best.z,
    plateauHeight: Math.min(4.5, Math.max(2.2, best.height)),
  };
}
