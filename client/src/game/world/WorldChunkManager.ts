/**
 * WorldChunkManager — decides which hex chunks are live around the camera focus, builds
 * their data in small time-sliced jobs, and notifies renderers.
 *
 *  - Only chunks intersecting the streaming radius are loaded (never the whole 1000 × 1000).
 *  - LOD per chunk (0 near / 1 far) with hysteresis so chunks don't flicker between levels.
 *  - Generated data lives in an LRU cache, so panning back and forth doesn't regenerate.
 */
import {
  WORLD_CHUNKS_PER_SIDE,
  hexToChunk,
  type AxialCoord,
  WORLD_TOTAL_CHUNKS,
  distanceToWorldChunk,
  getWorldChunkBounds,
  worldChunkKey,
  type HexTile,
  type WorldBounds,
  type WorldGenerator,
} from '@cityverse/shared';
import {
  buildTerrainChunk,
  buildVegetationChunk,
  buildWaterChunk,
  sampleTerrainChunkHeight,
  type TerrainChunkData,
  type VegetationChunkData,
  type WaterChunkData,
} from './chunkBuilder';
import type { QualityPreset } from './qualitySettings';

export interface LiveChunk {
  key: string;
  cx: number;
  cz: number;
  bounds: WorldBounds;
  /** Distance from the focus point to the chunk rectangle (updated every update()). */
  distance: number;
  lod: number;
  terrain: TerrainChunkData | null;
  water: WaterChunkData | null;
  vegetation: VegetationChunkData | null;
  tiles: HexTile[];
}

export type ChunkEvent =
  | { type: 'terrain'; chunk: LiveChunk }
  | { type: 'vegetation'; chunk: LiveChunk }
  | { type: 'unload'; key: string };

export type ChunkListener = (event: ChunkEvent) => void;

interface CachedChunkData {
  terrain: Map<number, { terrain: TerrainChunkData; water: WaterChunkData | null }>;
  vegetation: VegetationChunkData | null;
  tiles: HexTile[] | null;
}

const UNLOAD_MARGIN = 60;
const LOD_HYSTERESIS = 20;
const CACHE_LIMIT = 72;

export interface ChunkManagerStats {
  loaded: number;
  pending: number;
  total: number;
  cached: number;
}

export class WorldChunkManager {
  private readonly live = new Map<string, LiveChunk>();
  private readonly cache = new Map<string, CachedChunkData>();
  private readonly listeners = new Set<ChunkListener>();
  private quality: QualityPreset;
  private focusX = 0;
  private focusZ = 0;
  private radius = 0;
  private pendingJobs = 0;

  constructor(
    readonly world: WorldGenerator,
    quality: QualityPreset
  ) {
    this.quality = quality;
  }

  private visibleChunks: Set<string> | null = null;
  setVisibleHexes(hexes: readonly AxialCoord[] | null): void {
    this.visibleChunks = hexes ? new Set(hexes.map(h => { const c = hexToChunk(h.q, h.r); return worldChunkKey(c.cx, c.cz); })) : null;
    for (const key of this.live.keys()) if (this.visibleChunks && !this.visibleChunks.has(key)) this.unload(key);
  }

  get preset(): QualityPreset {
    return this.quality;
  }

  subscribe(listener: ChunkListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Switching quality invalidates every built chunk; renderers receive unload events. */
  setQuality(quality: QualityPreset): void {
    if (quality === this.quality) return;
    this.quality = quality;
    for (const key of [...this.live.keys()]) this.unload(key);
    this.cache.clear();
  }

  /** Streaming radius for a camera distance: wider when zoomed out, capped by quality. */
  radiusForCameraDistance(distance: number): number {
    return Math.min(this.quality.maxLoadRadius, Math.max(200, 130 + distance * 0.9));
  }

  /**
   * Re-evaluates the live set around (x, z) and spends up to `budgetMs` building chunk data.
   * At least one job runs per call so progress is guaranteed.
   */
  update(x: number, z: number, radius: number, budgetMs = 6): void {
    this.focusX = x;
    this.focusZ = z;
    this.radius = radius;

    // Unload chunks that moved out of range.
    for (const chunk of [...this.live.values()]) {
      chunk.distance = distanceToWorldChunk(chunk.cx, chunk.cz, x, z);
      if (chunk.distance > radius + UNLOAD_MARGIN) this.unload(chunk.key);
    }

    // Register newly wanted chunks.
    for (let cz = 0; cz < WORLD_CHUNKS_PER_SIDE; cz += 1) {
      for (let cx = 0; cx < WORLD_CHUNKS_PER_SIDE; cx += 1) {
        const key = worldChunkKey(cx, cz);
        if (this.live.has(key) || (this.visibleChunks && !this.visibleChunks.has(key))) continue;
        const distance = distanceToWorldChunk(cx, cz, x, z);
        if (distance > radius) continue;
        this.live.set(key, {
          key,
          cx,
          cz,
          bounds: getWorldChunkBounds(cx, cz),
          distance,
          lod: this.lodFor(distance, null),
          terrain: null,
          water: null,
          vegetation: null,
          tiles: [],
        });
      }
    }

    // Build work, nearest first.
    const queue = [...this.live.values()].sort((a, b) => a.distance - b.distance);
    const start = now();
    let ran = 0;
    for (const chunk of queue) {
      const wantLod = this.lodFor(chunk.distance, chunk.lod);
      const needsTerrain = !chunk.terrain || chunk.terrain.lod !== wantLod;
      if (needsTerrain) {
        if (ran > 0 && now() - start > budgetMs) break;
        this.buildTerrain(chunk, wantLod);
        ran += 1;
        continue;
      }
      if (!chunk.vegetation) {
        if (ran > 0 && now() - start > budgetMs) break;
        this.buildVegetation(chunk);
        ran += 1;
      }
    }

    let pending = 0;
    for (const chunk of this.live.values()) {
      if (!chunk.terrain || !chunk.vegetation || chunk.terrain.lod !== this.lodFor(chunk.distance, chunk.lod)) {
        pending += 1;
      }
    }
    this.pendingJobs = pending;
  }

  /** Runs update() until nothing is pending (used for the first frame and in tests). */
  loadAllPending(x: number, z: number, radius: number, maxIterations = 500): void {
    for (let i = 0; i < maxIterations; i += 1) {
      this.update(x, z, radius, 50);
      if (this.pendingJobs === 0) return;
    }
  }

  getLiveChunks(): IterableIterator<LiveChunk> {
    return this.live.values();
  }

  getChunk(key: string): LiveChunk | undefined {
    return this.live.get(key);
  }

  get stats(): ChunkManagerStats {
    let loaded = 0;
    for (const c of this.live.values()) if (c.terrain) loaded += 1;
    return { loaded, pending: this.pendingJobs, total: WORLD_TOTAL_CHUNKS, cached: this.cache.size };
  }

  get focus(): { x: number; z: number; radius: number } {
    return { x: this.focusX, z: this.focusZ, radius: this.radius };
  }

  /**
   * Height of the *rendered* surface at (x, z) when its chunk is loaded (identical to the mesh
   * triangles, which keeps picking and overlays glued to what the player sees); falls back to
   * the analytic terrain function elsewhere.
   */
  sampleHeight(x: number, z: number): number {
    const b = getWorldChunkBounds(0, 0);
    const size = b.maxX - b.minX;
    const cx = Math.floor((x - b.minX) / size);
    const cz = Math.floor((z - b.minZ) / size);
    const chunk = this.live.get(worldChunkKey(cx, cz));
    if (chunk?.terrain) {
      const h = sampleTerrainChunkHeight(chunk.terrain, x, z);
      if (h !== null) return h;
    }
    return this.world.terrain.heightAt(x, z);
  }

  /**
   * Player terrain edits (dug ponds) changed the surface inside these world rectangles:
   * cached data is dropped and live chunks are rebuilt in place (terrain now, vegetation on
   * the next update), so the new bank / bed replaces the old ground without a hole.
   */
  invalidateAreas(areas: readonly WorldBounds[]): number {
    if (!areas.length) return 0;
    const b0 = getWorldChunkBounds(0, 0);
    const size = b0.maxX - b0.minX;
    const keys = new Set<string>();
    for (const a of areas) {
      // One terrain cell of margin: chunk normals read a 1-vertex border ring.
      const m = this.quality.terrainFarCell + 1;
      const x0 = Math.floor((a.minX - m - b0.minX) / size);
      const x1 = Math.floor((a.maxX + m - b0.minX) / size);
      const z0 = Math.floor((a.minZ - m - b0.minZ) / size);
      const z1 = Math.floor((a.maxZ + m - b0.minZ) / size);
      for (let cz = z0; cz <= z1; cz += 1) {
        for (let cx = x0; cx <= x1; cx += 1) {
          if (cx >= 0 && cz >= 0 && cx < WORLD_CHUNKS_PER_SIDE && cz < WORLD_CHUNKS_PER_SIDE) keys.add(worldChunkKey(cx, cz));
        }
      }
    }
    for (const key of keys) {
      this.cache.delete(key);
      const chunk = this.live.get(key);
      if (!chunk?.terrain) continue;
      this.buildTerrain(chunk, chunk.lod);
      chunk.vegetation = null;
    }
    return keys.size;
  }

  dispose(): void {
    for (const key of [...this.live.keys()]) this.unload(key);
    this.cache.clear();
    this.listeners.clear();
  }

  private lodFor(distance: number, current: number | null): number {
    const near = this.quality.nearLodRadius;
    if (current === 0) return distance > near + LOD_HYSTERESIS ? 1 : 0;
    if (current === 1) return distance < near - LOD_HYSTERESIS ? 0 : 1;
    return distance <= near ? 0 : 1;
  }

  private cached(key: string): CachedChunkData {
    let entry = this.cache.get(key);
    if (entry) {
      // LRU refresh
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry;
    }
    entry = { terrain: new Map(), vegetation: null, tiles: null };
    this.cache.set(key, entry);
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.findEvictable();
      if (!oldest) break;
      this.cache.delete(oldest);
    }
    return entry;
  }

  private findEvictable(): string | null {
    for (const key of this.cache.keys()) if (!this.live.has(key)) return key;
    return null;
  }

  private buildTerrain(chunk: LiveChunk, lod: number): void {
    const entry = this.cached(chunk.key);
    let built = entry.terrain.get(lod);
    if (!built) {
      const cell = lod === 0 ? this.quality.terrainCell : this.quality.terrainFarCell;
      const terrain = buildTerrainChunk(this.world, chunk.cx, chunk.cz, cell, lod);
      built = { terrain, water: buildWaterChunk(terrain, this.world) };
      entry.terrain.set(lod, built);
    }
    if (!entry.tiles) entry.tiles = this.world.getChunkTiles(chunk.cx, chunk.cz);
    chunk.lod = lod;
    chunk.terrain = built.terrain;
    chunk.water = built.water;
    chunk.tiles = entry.tiles;
    this.emit({ type: 'terrain', chunk });
  }

  private buildVegetation(chunk: LiveChunk): void {
    const entry = this.cached(chunk.key);
    if (!entry.vegetation) {
      entry.vegetation = buildVegetationChunk(this.world, chunk.cx, chunk.cz, {
        grassSpacing: this.quality.grassSpacing,
      });
    }
    chunk.vegetation = entry.vegetation;
    this.emit({ type: 'vegetation', chunk });
  }

  private unload(key: string): void {
    if (!this.live.delete(key)) return;
    this.emit({ type: 'unload', key });
  }

  private emit(event: ChunkEvent): void {
    for (const l of this.listeners) l(event);
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
