import { WORLD_CONFIG } from '../constants.js';
import type {
  ChunkCoord,
  GridCoord,
  GridSelection,
  TerrainArchetype,
  TerrainType,
  TerrainTypeInput,
  WorldBounds,
  WorldPoint2D,
} from '../types.js';

const SQRT3 = Math.sqrt(3);

export function normalizeTerrainArchetype(terrainType: TerrainTypeInput): TerrainArchetype {
  switch (terrainType) {
    case 'plain':
    case 'plains':
      return 'plain';
    case 'coastal':
      return 'coastal';
    case 'mountain':
    case 'highlands':
      return 'mountain';
    case 'river':
    case 'valley':
      return 'river';
  }
}

export function normalizeTerrainTypeToDb(terrainType: TerrainTypeInput): TerrainType {
  switch (terrainType) {
    case 'plain':
    case 'plains':
      return 'plains';
    case 'coastal':
      return 'coastal';
    case 'mountain':
    case 'highlands':
      return 'highlands';
    case 'river':
    case 'valley':
      return 'valley';
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Pointy-top hexagon outer radius (center to pointed vertex) for a given flat-to-flat tileSize */
export function getHexRadius(tileSize: number = WORLD_CONFIG.TILE_SIZE): number {
  return tileSize / SQRT3;
}

/** Vertical distance between consecutive pointy-top hex rows */
export function getHexRowStep(tileSize: number = WORLD_CONFIG.TILE_SIZE): number {
  return getHexRadius(tileSize) * 1.5;
}

/**
 * Returns the 6 local corner offsets [dx, dz] of a pointy-top hexagon in counter-clockwise order
 * starting from the top vertex (-Z) and moving clockwise/around for consistent winding.
 */
export function getHexCornerOffsets(
  tileSize: number = WORLD_CONFIG.TILE_SIZE,
  scale = 1
): ReadonlyArray<readonly [number, number]> {
  const radius = getHexRadius(tileSize) * scale;
  const corners: [number, number][] = [];
  for (let i = 0; i < 6; i += 1) {
    // Pointy-top: angles -90, -30, +30, +90, +150, +210 deg
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    corners.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return corners;
}

/**
 * Odd-r pointy-top hex grid -> world center (X, Z).
 * Odd rows (gz & 1 === 1) are shifted right by half a hex width (tileSize * 0.5).
 */
export function gridToWorldCenter(
  gx: number,
  gz: number,
  tileSize: number = WORLD_CONFIG.TILE_SIZE
): WorldPoint2D {
  const radius = getHexRadius(tileSize);
  const rowStep = radius * 1.5;
  const parity = ((gz % 2) + 2) % 2;
  return {
    x: (gx + 0.5 + parity * 0.5) * tileSize,
    z: radius + gz * rowStep,
  };
}

/**
 * Returns the 6 world-space (X, Z) vertices of hex tile (gx, gz).
 */
export function getHexVertices(
  gx: number,
  gz: number,
  tileSize: number = WORLD_CONFIG.TILE_SIZE,
  scale = 1
): WorldPoint2D[] {
  const center = gridToWorldCenter(gx, gz, tileSize);
  const offsets = getHexCornerOffsets(tileSize, scale);
  return offsets.map(([dx, dz]) => ({
    x: center.x + dx,
    z: center.z + dz,
  }));
}

export function gridCornerToWorld(
  vx: number,
  vz: number,
  tileSize: number = WORLD_CONFIG.TILE_SIZE
): WorldPoint2D {
  return {
    x: vx * tileSize,
    z: vz * getHexRowStep(tileSize),
  };
}

/**
 * Exact pointy-top odd-r hex inverse using axial -> cube rounding.
 * Returns null when the resolved hex lies outside [0..mapWidth-1] x [0..mapHeight-1].
 */
export function worldToGrid(
  worldX: number,
  worldZ: number,
  mapWidth: number = WORLD_CONFIG.MAP_WIDTH,
  mapHeight: number = WORLD_CONFIG.MAP_HEIGHT,
  tileSize: number = WORLD_CONFIG.TILE_SIZE
): GridCoord | null {
  const radius = getHexRadius(tileSize);
  const px = worldX - tileSize * 0.5;
  const pz = worldZ - radius;

  // Fractional axial coordinates (pointy-top)
  const qf = ((SQRT3 / 3) * px - (1 / 3) * pz) / radius;
  const rf = ((2 / 3) * pz) / radius;
  const sf = -qf - rf;

  let rq = Math.round(qf);
  let rr = Math.round(rf);
  const rs = Math.round(sf);

  const dq = Math.abs(rq - qf);
  const dr = Math.abs(rr - rf);
  const ds = Math.abs(rs - sf);

  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  }

  // Convert axial (rq, rr) -> odd-r offset (gx, gz), normalizing -0 to +0
  const gz = rr === 0 ? 0 : rr;
  const parity = ((gz % 2) + 2) % 2;
  const rawGx = rq + Math.floor((gz - parity) / 2);
  const gx = rawGx === 0 ? 0 : rawGx;

  if (gx < 0 || gz < 0 || gx >= mapWidth || gz >= mapHeight) {
    return null;
  }
  return { gx, gz };
}

export function worldToGridClamped(
  worldX: number,
  worldZ: number,
  mapWidth: number = WORLD_CONFIG.MAP_WIDTH,
  mapHeight: number = WORLD_CONFIG.MAP_HEIGHT,
  tileSize: number = WORLD_CONFIG.TILE_SIZE
): GridCoord {
  const radius = getHexRadius(tileSize);
  const px = worldX - tileSize * 0.5;
  const pz = worldZ - radius;

  const qf = ((SQRT3 / 3) * px - (1 / 3) * pz) / radius;
  const rf = ((2 / 3) * pz) / radius;
  const sf = -qf - rf;

  let rq = Math.round(qf);
  let rr = Math.round(rf);
  const rs = Math.round(sf);

  const dq = Math.abs(rq - qf);
  const dr = Math.abs(rr - rf);
  const ds = Math.abs(rs - sf);

  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  }

  const gz = rr === 0 ? 0 : rr;
  const parity = ((gz % 2) + 2) % 2;
  const rawGx = rq + Math.floor((gz - parity) / 2);
  const gx = rawGx === 0 ? 0 : rawGx;

  return {
    gx: clamp(gx, 0, mapWidth - 1),
    gz: clamp(gz, 0, mapHeight - 1),
  };
}

export function gridToChunk(
  gx: number,
  gz: number,
  chunkSize: number = WORLD_CONFIG.CHUNK_SIZE
): ChunkCoord {
  return {
    cx: Math.floor(gx / chunkSize),
    cz: Math.floor(gz / chunkSize),
  };
}

export function gridToLocalTile(
  gx: number,
  gz: number,
  chunkSize: number = WORLD_CONFIG.CHUNK_SIZE
): { cx: number; cz: number; lx: number; lz: number } {
  const cx = Math.floor(gx / chunkSize);
  const cz = Math.floor(gz / chunkSize);
  const lx = gx - cx * chunkSize;
  const lz = gz - cz * chunkSize;
  return { cx, cz, lx, lz };
}

export function worldToChunk(
  worldX: number,
  worldZ: number,
  chunkSize: number = WORLD_CONFIG.CHUNK_SIZE,
  tileSize: number = WORLD_CONFIG.TILE_SIZE,
  chunksX: number = WORLD_CONFIG.CHUNKS_X,
  chunksZ: number = WORLD_CONFIG.CHUNKS_Z
): ChunkCoord {
  const mapWidth = chunksX * chunkSize;
  const mapHeight = chunksZ * chunkSize;
  const grid = worldToGridClamped(worldX, worldZ, mapWidth, mapHeight, tileSize);
  return {
    cx: clamp(Math.floor(grid.gx / chunkSize), 0, chunksX - 1),
    cz: clamp(Math.floor(grid.gz / chunkSize), 0, chunksZ - 1),
  };
}

export function chunkToWorldBounds(
  cx: number,
  cz: number,
  chunkSize: number = WORLD_CONFIG.CHUNK_SIZE,
  tileSize: number = WORLD_CONFIG.TILE_SIZE
): WorldBounds & { centerX: number; centerZ: number } {
  const radius = getHexRadius(tileSize);
  const rowStep = radius * 1.5;

  const firstGx = cx * chunkSize;
  const lastGx = firstGx + chunkSize - 1;
  const firstGz = cz * chunkSize;
  const lastGz = firstGz + chunkSize - 1;

  const minX = firstGx * tileSize;
  const maxX = (lastGx + 1.5) * tileSize;
  const minZ = firstGz * rowStep;
  const maxZ = lastGz * rowStep + radius * 2;

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
  };
}

export function getWorldBounds(
  mapWidth: number = WORLD_CONFIG.MAP_WIDTH,
  mapHeight: number = WORLD_CONFIG.MAP_HEIGHT,
  tileSize: number = WORLD_CONFIG.TILE_SIZE
): WorldBounds {
  const radius = getHexRadius(tileSize);
  const rowStep = radius * 1.5;
  return {
    minX: 0,
    maxX: (mapWidth + 0.5) * tileSize,
    minZ: 0,
    maxZ: radius * 2 + (mapHeight - 1) * rowStep,
  };
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx}:${cz}`;
}

export function parseChunkKey(key: string): ChunkCoord {
  const [cxStr, czStr] = key.split(':');
  return { cx: Number(cxStr), cz: Number(czStr) };
}

export function localTileKey(lx: number, lz: number): string {
  return `${lx},${lz}`;
}

export function getChunksInRadius(
  centerCx: number,
  centerCz: number,
  radius: number,
  chunksX: number = WORLD_CONFIG.CHUNKS_X,
  chunksZ: number = WORLD_CONFIG.CHUNKS_Z
): ChunkCoord[] {
  const minX = clamp(centerCx - radius, 0, chunksX - 1);
  const maxX = clamp(centerCx + radius, 0, chunksX - 1);
  const minZ = clamp(centerCz - radius, 0, chunksZ - 1);
  const maxZ = clamp(centerCz + radius, 0, chunksZ - 1);

  const list: ChunkCoord[] = [];
  for (let cz = minZ; cz <= maxZ; cz += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      list.push({ cx, cz });
    }
  }
  return list;
}

export function chunkChebyshevDistance(a: ChunkCoord, b: ChunkCoord): number {
  return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cz - b.cz));
}

export function normalizeGridSelection(
  start: GridCoord,
  end: GridCoord,
  mapWidth: number = WORLD_CONFIG.MAP_WIDTH,
  mapHeight: number = WORLD_CONFIG.MAP_HEIGHT
): GridSelection {
  return {
    minX: clamp(Math.min(start.gx, end.gx), 0, mapWidth - 1),
    maxX: clamp(Math.max(start.gx, end.gx), 0, mapWidth - 1),
    minZ: clamp(Math.min(start.gz, end.gz), 0, mapHeight - 1),
    maxZ: clamp(Math.max(start.gz, end.gz), 0, mapHeight - 1),
  };
}
