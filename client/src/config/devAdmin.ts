import {
  CHARACTER_PRESETS,
  CITY_CONFIG,
  TERRAIN_PRESETS,
  WORLD_CONFIG,
  chunkKey,
  clamp,
  generateChunkData,
  getSpawnPoint,
  getGridWorldBounds,
  gridToLocalTile,
  localTileKey,
  normalizeTerrainArchetype,
  type AuthResponseDTO,
  type ChunkDataDTO,
  type ChunkRangeResponseDTO,
  type ChunkTerrainDelta,
  type DashboardDTO,
  type SaveTerrainDeltaResponseDTO,
  type TerrainMetadataDTO,
  type TerrainTileDeltaEntry,
  type TerrainTileDeltaInput,
} from '@cityverse/shared';

export const IS_AUTO_ADMIN_ENABLED =
  import.meta.env.MODE !== 'test' && import.meta.env.VITE_AUTO_ADMIN_LOGIN !== 'false';

export const OFFLINE_ADMIN_TOKEN = 'offline-dev-admin-token';
export const OFFLINE_ADMIN_CITY_ID = '00000000-0000-4000-8000-000000000001';

const NOW_ISO = '2026-11-19T00:00:00.000Z';
const OFFLINE_STORAGE_KEY = 'cityverse-offline-admin-chunks-v2';

export const OFFLINE_ADMIN_AUTH: AuthResponseDTO = {
  user: {
    id: '00000000-0000-4000-8000-000000000010',
    email: 'admin@cityverse.io',
    username: 'admin',
    status: 'active',
    createdAt: NOW_ISO,
  },
  character: {
    id: '00000000-0000-4000-8000-000000000020',
    userId: '00000000-0000-4000-8000-000000000010',
    name: 'Admin Architect',
    presetId: CHARACTER_PRESETS[0].id,
    appearance: { ...CHARACTER_PRESETS[0].appearance },
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  city: {
    id: OFFLINE_ADMIN_CITY_ID,
    ownerId: '00000000-0000-4000-8000-000000000010',
    name: 'Admin Valley',
    terrainType: 'valley',
    worldSeed: 'CV-VAL-ADMIN20260001',
    mapWidth: CITY_CONFIG.MAP_WIDTH,
    mapHeight: CITY_CONFIG.MAP_HEIGHT,
    level: CITY_CONFIG.INITIAL_LEVEL,
    isPublic: true,
    visibility: 'public',
    role: 'owner',
    economy: {
      id: '00000000-0000-4000-8000-000000000030',
      cityId: OFFLINE_ADMIN_CITY_ID,
      cityCoins: CITY_CONFIG.INITIAL_COINS,
      population: CITY_CONFIG.INITIAL_POPULATION,
      happiness: CITY_CONFIG.INITIAL_HAPPINESS,
      taxRate: CITY_CONFIG.INITIAL_TAX_RATE,
      powerCapacity: 0,
      powerUsage: 0,
      waterCapacity: 0,
      waterUsage: 0,
      lastTickAt: null,
    },
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  tokens: {
    accessToken: OFFLINE_ADMIN_TOKEN,
    refreshToken: 'offline-dev-admin-refresh',
    accessTokenExpiresIn: '24h',
  },
};

export const OFFLINE_ADMIN_DASHBOARD: DashboardDTO = {
  user: OFFLINE_ADMIN_AUTH.user,
  character: OFFLINE_ADMIN_AUTH.character,
  city: OFFLINE_ADMIN_AUTH.city,
  onboarding: {
    hasCharacter: true,
    hasCity: true,
    isReadyToPlay: true,
  },
};

interface OfflineStoredChunk {
  revision: number;
  delta: ChunkTerrainDelta;
  updatedAt: string;
}

function readOfflineStore(): Record<string, OfflineStoredChunk> {
  try {
    const raw = localStorage.getItem(OFFLINE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, OfflineStoredChunk>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeOfflineStore(store: Record<string, OfflineStoredChunk>): void {
  try {
    localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota errors in offline mode
  }
}

export function getOfflineTerrainMetadata(): TerrainMetadataDTO {
  const city = OFFLINE_ADMIN_AUTH.city!;
  const store = readOfflineStore();
  const preset = TERRAIN_PRESETS.find((t) => t.id === city.terrainType) ?? TERRAIN_PRESETS[0];
  const chunksX = Math.ceil(city.mapWidth / WORLD_CONFIG.CHUNK_SIZE);
  const chunksZ = Math.ceil(city.mapHeight / WORLD_CONFIG.CHUNK_SIZE);

  return {
    cityId: city.id,
    worldSeed: city.worldSeed,
    terrainType: city.terrainType,
    terrainArchetype: normalizeTerrainArchetype(city.terrainType),
    generatorVersion: WORLD_CONFIG.GENERATOR_VERSION,
    mapWidth: city.mapWidth,
    mapHeight: city.mapHeight,
    tileSize: WORLD_CONFIG.TILE_SIZE,
    chunkSize: WORLD_CONFIG.CHUNK_SIZE,
    chunksX,
    chunksZ,
    totalChunks: chunksX * chunksZ,
    persistedChunks: Object.keys(store).length,
    waterLevel: WORLD_CONFIG.WATER_LEVEL,
    elevationScale: preset.elevationScale,
    worldBounds: getGridWorldBounds(city.mapWidth, city.mapHeight, WORLD_CONFIG.TILE_SIZE),
    spawnPoint: getSpawnPoint(
      city.worldSeed,
      city.terrainType,
      city.mapWidth,
      city.mapHeight,
      WORLD_CONFIG.TILE_SIZE
    ),
    preset,
  };
}

export function getOfflineChunksInRange(range: {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}): ChunkRangeResponseDTO {
  const city = OFFLINE_ADMIN_AUTH.city!;
  const store = readOfflineStore();
  const chunksX = Math.ceil(city.mapWidth / WORLD_CONFIG.CHUNK_SIZE);
  const chunksZ = Math.ceil(city.mapHeight / WORLD_CONFIG.CHUNK_SIZE);

  const deltaMap = new Map<string, ChunkTerrainDelta>();
  for (const [k, v] of Object.entries(store)) {
    deltaMap.set(k, v.delta);
  }

  const minX = clamp(range.minX, 0, chunksX - 1);
  const maxX = clamp(range.maxX, 0, chunksX - 1);
  const minZ = clamp(range.minZ, 0, chunksZ - 1);
  const maxZ = clamp(range.maxZ, 0, chunksZ - 1);

  const chunks: ChunkDataDTO[] = [];
  for (let cz = minZ; cz <= maxZ; cz += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      const saved = store[chunkKey(cx, cz)];
      chunks.push(
        generateChunkData({
          cityId: city.id,
          worldSeed: city.worldSeed,
          terrainType: city.terrainType,
          chunkX: cx,
          chunkZ: cz,
          revision: saved?.revision ?? 1,
          updatedAt: saved?.updatedAt ?? NOW_ISO,
          mapWidth: city.mapWidth,
          mapHeight: city.mapHeight,
          chunkSize: WORLD_CONFIG.CHUNK_SIZE,
          tileSize: WORLD_CONFIG.TILE_SIZE,
          chunkDeltas: deltaMap,
        })
      );
    }
  }

  return {
    cityId: city.id,
    range: { minX, maxX, minZ, maxZ },
    totalWorldChunks: chunksX * chunksZ,
    loadedCount: chunks.length,
    chunks,
  };
}

export function saveOfflineTerrainDelta(tiles: TerrainTileDeltaInput[]): SaveTerrainDeltaResponseDTO {
  const city = OFFLINE_ADMIN_AUTH.city!;
  const store = readOfflineStore();
  const chunkSize = WORLD_CONFIG.CHUNK_SIZE;
  const chunksX = Math.ceil(city.mapWidth / chunkSize);
  const chunksZ = Math.ceil(city.mapHeight / chunkSize);
  const impacted = new Map<string, { cx: number; cz: number }>();

  for (const tile of tiles) {
    const { cx, cz, lx, lz } = gridToLocalTile(tile.gx, tile.gz, chunkSize);
    const key = chunkKey(cx, cz);
    const entry = store[key] ?? { revision: 1, delta: { tiles: {} }, updatedAt: NOW_ISO };
    const tKey = localTileKey(lx, lz);
    const prev: TerrainTileDeltaEntry = entry.delta.tiles[tKey] ?? {};
    const next: TerrainTileDeltaEntry = { ...prev };

    if (typeof tile.setHeight === 'number') {
      next.setHeight = clamp(
        tile.setHeight,
        WORLD_CONFIG.MIN_TERRAIN_HEIGHT,
        WORLD_CONFIG.MAX_TERRAIN_HEIGHT
      );
      delete next.heightDelta;
    } else if (typeof tile.heightDelta === 'number') {
      next.heightDelta = clamp(
        (prev.heightDelta ?? 0) + tile.heightDelta,
        WORLD_CONFIG.MIN_HEIGHT_DELTA,
        WORLD_CONFIG.MAX_HEIGHT_DELTA
      );
    }
    if (tile.biome !== undefined) next.biome = tile.biome;
    if (tile.clearProps !== undefined) next.clearProps = tile.clearProps;

    entry.delta.tiles[tKey] = next;
    store[key] = entry;
    impacted.set(key, { cx, cz });

    const dxs = lx === 0 ? [-1, 0] : lx === chunkSize - 1 ? [0, 1] : [0];
    const dzs = lz === 0 ? [-1, 0] : lz === chunkSize - 1 ? [0, 1] : [0];
    for (const dx of dxs) {
      for (const dz of dzs) {
        const ncx = cx + dx;
        const ncz = cz + dz;
        if (ncx >= 0 && ncz >= 0 && ncx < chunksX && ncz < chunksZ) {
          impacted.set(chunkKey(ncx, ncz), { cx: ncx, cz: ncz });
        }
      }
    }
  }

  const deltaMap = new Map<string, ChunkTerrainDelta>();
  for (const [k, v] of Object.entries(store)) {
    deltaMap.set(k, v.delta);
  }

  const now = new Date().toISOString();
  const updatedChunks: ChunkDataDTO[] = [];

  for (const { cx, cz } of impacted.values()) {
    const key = chunkKey(cx, cz);
    const prev = store[key] ?? { revision: 1, delta: { tiles: {} }, updatedAt: now };
    prev.revision += 1;
    prev.updatedAt = now;
    store[key] = prev;

    updatedChunks.push(
      generateChunkData({
        cityId: city.id,
        worldSeed: city.worldSeed,
        terrainType: city.terrainType,
        chunkX: cx,
        chunkZ: cz,
        revision: prev.revision,
        updatedAt: now,
        mapWidth: city.mapWidth,
        mapHeight: city.mapHeight,
        chunkSize,
        tileSize: WORLD_CONFIG.TILE_SIZE,
        chunkDeltas: deltaMap,
      })
    );
  }

  writeOfflineStore(store);

  return {
    cityId: city.id,
    appliedTiles: tiles.length,
    updatedChunks,
  };
}
