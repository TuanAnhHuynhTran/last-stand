import {
  WORLD_CONFIG,
  chunkChebyshevDistance,
  chunkKey,
  getChunksInRadius,
  gridToLocalTile,
  worldToChunk,
  worldToGridClamped,
  type BiomeType,
  type ChunkCoord,
  type ChunkDataDTO,
} from '@cityverse/shared';

export interface ChunkRangeFetchRequest {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type ChunkRangeFetcher = (request: ChunkRangeFetchRequest) => Promise<ChunkDataDTO[]>;

export interface ChunkManagerOptions {
  mapWidth?: number;
  mapHeight?: number;
  chunkSize?: number;
  tileSize?: number;
  loadRadius?: number;
  unloadRadius?: number;
  fetcher: ChunkRangeFetcher;
  onChange?: (chunks: ChunkDataDTO[]) => void;
  onUnload?: (chunk: ChunkDataDTO) => void;
  onLoadingChange?: (inFlightCount: number) => void;
  onError?: (error: unknown) => void;
}

export interface TileLookupInfo {
  gx: number;
  gz: number;
  cx: number;
  cz: number;
  height: number;
  biome: BiomeType;
  buildable: boolean;
  revision: number;
}

export class ChunkManager {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly chunkSize: number;
  readonly tileSize: number;
  readonly chunksX: number;
  readonly chunksZ: number;
  readonly loadRadius: number;
  readonly unloadRadius: number;

  private readonly fetcher: ChunkRangeFetcher;
  private readonly onChange?: (chunks: ChunkDataDTO[]) => void;
  private readonly onUnload?: (chunk: ChunkDataDTO) => void;
  private readonly onLoadingChange?: (inFlightCount: number) => void;
  private readonly onError?: (error: unknown) => void;

  private readonly loadedChunks = new Map<string, ChunkDataDTO>();
  private readonly inFlightKeys = new Set<string>();
  private activeCameraChunk: ChunkCoord | null = null;
  private disposed = false;

  constructor(options: ChunkManagerOptions) {
    this.mapWidth = options.mapWidth ?? WORLD_CONFIG.MAP_WIDTH;
    this.mapHeight = options.mapHeight ?? WORLD_CONFIG.MAP_HEIGHT;
    this.chunkSize = options.chunkSize ?? WORLD_CONFIG.CHUNK_SIZE;
    this.tileSize = options.tileSize ?? WORLD_CONFIG.TILE_SIZE;
    this.chunksX = Math.max(1, Math.ceil(this.mapWidth / this.chunkSize));
    this.chunksZ = Math.max(1, Math.ceil(this.mapHeight / this.chunkSize));
    this.loadRadius = options.loadRadius ?? WORLD_CONFIG.DEFAULT_LOAD_RADIUS;
    this.unloadRadius = Math.max(
      this.loadRadius,
      options.unloadRadius ?? WORLD_CONFIG.DEFAULT_UNLOAD_RADIUS
    );
    this.fetcher = options.fetcher;
    this.onChange = options.onChange;
    this.onUnload = options.onUnload;
    this.onLoadingChange = options.onLoadingChange;
    this.onError = options.onError;
  }

  getActiveCameraChunk(): ChunkCoord | null {
    return this.activeCameraChunk;
  }

  getLoadedChunks(): ChunkDataDTO[] {
    return Array.from(this.loadedChunks.values());
  }

  getLoadedChunkKeys(): string[] {
    return Array.from(this.loadedChunks.keys()).sort();
  }

  getChunkRevisions(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, chunk] of this.loadedChunks.entries()) {
      result[key] = chunk.revision;
    }
    return result;
  }

  getChunk(cx: number, cz: number): ChunkDataDTO | undefined {
    return this.loadedChunks.get(chunkKey(cx, cz));
  }

  getLoadedCount(): number {
    return this.loadedChunks.size;
  }

  getTotalWorldChunks(): number {
    return this.chunksX * this.chunksZ;
  }

  /**
   * Updates streaming window around camera target world position (X/Z).
   * Loads missing chunks inside loadRadius and unloads chunks outside unloadRadius.
   */
  async updateCameraWorldPosition(
    worldX: number,
    worldZ: number,
    forceReload = false
  ): Promise<{ loaded: ChunkDataDTO[]; unloaded: string[] }> {
    if (this.disposed) {
      return { loaded: [], unloaded: [] };
    }

    const nextChunk = worldToChunk(
      worldX,
      worldZ,
      this.chunkSize,
      this.tileSize,
      this.chunksX,
      this.chunksZ
    );

    if (
      !forceReload &&
      this.activeCameraChunk &&
      this.activeCameraChunk.cx === nextChunk.cx &&
      this.activeCameraChunk.cz === nextChunk.cz
    ) {
      return { loaded: [], unloaded: [] };
    }

    this.activeCameraChunk = nextChunk;

    // 1. Unload chunks outside unloadRadius
    const unloaded: string[] = [];
    for (const [key, chunk] of this.loadedChunks.entries()) {
      const dist = chunkChebyshevDistance(nextChunk, { cx: chunk.chunkX, cz: chunk.chunkZ });
      if (dist > this.unloadRadius) {
        this.loadedChunks.delete(key);
        unloaded.push(key);
        this.onUnload?.(chunk);
      }
    }

    if (unloaded.length > 0) {
      this.emitChange();
    }

    // 2. Determine missing chunks inside loadRadius
    const desired = getChunksInRadius(
      nextChunk.cx,
      nextChunk.cz,
      this.loadRadius,
      this.chunksX,
      this.chunksZ
    );

    const missing = desired.filter((coord) => {
      const key = chunkKey(coord.cx, coord.cz);
      if (this.inFlightKeys.has(key)) return false;
      if (forceReload) return true;
      return !this.loadedChunks.has(key);
    });

    if (missing.length === 0) {
      return { loaded: [], unloaded };
    }

    let minX = this.chunksX - 1;
    let maxX = 0;
    let minZ = this.chunksZ - 1;
    let maxZ = 0;
    for (const coord of missing) {
      minX = Math.min(minX, coord.cx);
      maxX = Math.max(maxX, coord.cx);
      minZ = Math.min(minZ, coord.cz);
      maxZ = Math.max(maxZ, coord.cz);
      this.inFlightKeys.add(chunkKey(coord.cx, coord.cz));
    }
    this.onLoadingChange?.(this.inFlightKeys.size);

    try {
      const fetched = await this.fetcher({ minX, maxX, minZ, maxZ });
      if (this.disposed) {
        return { loaded: [], unloaded };
      }

      const accepted: ChunkDataDTO[] = [];
      for (const chunk of fetched) {
        // Discard chunks that are already outside the current unload window if camera moved fast
        if (this.activeCameraChunk) {
          const dist = chunkChebyshevDistance(this.activeCameraChunk, {
            cx: chunk.chunkX,
            cz: chunk.chunkZ,
          });
          if (dist > this.unloadRadius) {
            continue;
          }
        }
        const key = chunkKey(chunk.chunkX, chunk.chunkZ);
        const existing = this.loadedChunks.get(key);
        if (!existing || chunk.revision >= existing.revision || forceReload) {
          this.loadedChunks.set(key, chunk);
          accepted.push(chunk);
        }
      }

      if (accepted.length > 0) {
        this.emitChange();
      }
      return { loaded: accepted, unloaded };
    } catch (error) {
      this.onError?.(error);
      throw error;
    } finally {
      for (const coord of missing) {
        this.inFlightKeys.delete(chunkKey(coord.cx, coord.cz));
      }
      this.onLoadingChange?.(this.inFlightKeys.size);
    }
  }

  /**
   * Applies server-updated chunks (e.g. after saving a terrain delta) only when
   * the chunk is currently in view and its revision is newer or equal.
   */
  applyUpdatedChunks(chunks: ChunkDataDTO[]): void {
    if (this.disposed) return;

    let changed = false;
    for (const chunk of chunks) {
      const key = chunkKey(chunk.chunkX, chunk.chunkZ);
      const existing = this.loadedChunks.get(key);
      if (existing && chunk.revision >= existing.revision) {
        this.loadedChunks.set(key, chunk);
        changed = true;
      } else if (
        !existing &&
        this.activeCameraChunk &&
        chunkChebyshevDistance(this.activeCameraChunk, {
          cx: chunk.chunkX,
          cz: chunk.chunkZ,
        }) <= this.loadRadius
      ) {
        this.loadedChunks.set(key, chunk);
        changed = true;
      }
    }

    if (changed) {
      this.emitChange();
    }
  }

  /**
   * Samples hex tile elevation at any world coordinate (X, Z) from loaded chunk data.
   */
  getHeightAtWorld(worldX: number, worldZ: number, fallback = 0): number {
    const { gx, gz } = worldToGridClamped(
      worldX,
      worldZ,
      this.mapWidth,
      this.mapHeight,
      this.tileSize
    );
    return this.getTileHeight(gx, gz, fallback);
  }

  /**
   * Returns the top surface elevation of hex tile (gx, gz).
   */
  getTileHeight(gx: number, gz: number, fallback = 0): number {
    if (gx < 0 || gz < 0 || gx >= this.mapWidth || gz >= this.mapHeight) {
      return fallback;
    }
    const { cx, cz, lx, lz } = gridToLocalTile(gx, gz, this.chunkSize);
    const chunk = this.loadedChunks.get(chunkKey(cx, cz));
    if (!chunk) {
      return fallback;
    }
    return chunk.tileHeights[lz * chunk.chunkSize + lx] ?? fallback;
  }

  /**
   * Returns the 4 corner heights of tile (gx, gz) for compatibility & slope queries.
   */
  getTileCornerHeights(gx: number, gz: number): [number, number, number, number] | null {
    if (gx < 0 || gz < 0 || gx >= this.mapWidth || gz >= this.mapHeight) {
      return null;
    }
    const { cx, cz, lx, lz } = gridToLocalTile(gx, gz, this.chunkSize);
    const chunk = this.loadedChunks.get(chunkKey(cx, cz));
    if (!chunk) {
      return null;
    }
    const vertsPerSide = chunk.chunkSize + 1;
    return [
      chunk.cornerHeights[lz * vertsPerSide + lx],
      chunk.cornerHeights[lz * vertsPerSide + lx + 1],
      chunk.cornerHeights[(lz + 1) * vertsPerSide + lx],
      chunk.cornerHeights[(lz + 1) * vertsPerSide + lx + 1],
    ];
  }

  getTileInfo(gx: number, gz: number): TileLookupInfo | null {
    if (gx < 0 || gz < 0 || gx >= this.mapWidth || gz >= this.mapHeight) {
      return null;
    }
    const { cx, cz, lx, lz } = gridToLocalTile(gx, gz, this.chunkSize);
    const chunk = this.loadedChunks.get(chunkKey(cx, cz));
    if (!chunk) {
      return null;
    }
    const idx = lz * chunk.chunkSize + lx;
    return {
      gx,
      gz,
      cx,
      cz,
      height: chunk.tileHeights[idx] ?? 0,
      biome: chunk.tileBiomes[idx] ?? 'grass',
      buildable: chunk.buildableMask[idx] ?? false,
      revision: chunk.revision,
    };
  }

  disposeAll(): void {
    this.disposed = true;
    for (const chunk of this.loadedChunks.values()) {
      this.onUnload?.(chunk);
    }
    this.loadedChunks.clear();
    this.inFlightKeys.clear();
  }

  private emitChange(): void {
    this.onChange?.(this.getLoadedChunks());
  }
}
