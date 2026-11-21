import { WORLD_CONFIG } from '../constants.js';
import type {
  BiomeType,
  ChunkDataDTO,
  ChunkTerrainDelta,
  TerrainArchetype,
  TerrainPropInstance,
  TerrainPropType,
  TerrainTileDeltaEntry,
  TerrainTypeInput,
} from '../types.js';
import {
  chunkKey,
  clamp,
  getHexRadius,
  gridToLocalTile,
  gridToWorldCenter,
  localTileKey,
  normalizeTerrainArchetype,
} from './coordinates.js';

/** Deterministic 32-bit string hash (FNV-1a / xmur3 hybrid) */
export function hashString32(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createSeedHash(worldSeed: string, terrainType: TerrainTypeInput): string {
  const archetype = normalizeTerrainArchetype(terrainType);
  const raw = `${WORLD_CONFIG.GENERATOR_VERSION}:${archetype}:${worldSeed}`;
  const h1 = hashString32(raw).toString(16).padStart(8, '0');
  const h2 = hashString32(`${raw}:salt`).toString(16).padStart(8, '0');
  return `${h1}${h2}`;
}

/** Deterministic integer grid hash returning float in [0, 1) */
function hash2D(ix: number, iz: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Smooth deterministic 2D value noise in [-1, 1] */
function valueNoise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const u = fade(fx);
  const v = fade(fz);

  const a = hash2D(ix, iz, seed) * 2 - 1;
  const b = hash2D(ix + 1, iz, seed) * 2 - 1;
  const c = hash2D(ix, iz + 1, seed) * 2 - 1;
  const d = hash2D(ix + 1, iz + 1, seed) * 2 - 1;

  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Multi-octave Fractal Brownian Motion in roughly [-1, 1] */
function fbm2D(
  x: number,
  z: number,
  seed: number,
  octaves = 4,
  lacunarity = 2.02,
  gain = 0.5
): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let maxAmplitude = 0;

  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise2D(x * frequency, z * frequency, seed + i * 1013) * amplitude;
    maxAmplitude += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }

  return sum / maxAmplitude;
}

/** Ridged multifractal noise in [0, 1] for crisp mountain crests */
function ridged2D(x: number, z: number, seed: number, octaves = 4): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let maxAmplitude = 0;

  for (let i = 0; i < octaves; i += 1) {
    const n = 1 - Math.abs(valueNoise2D(x * frequency, z * frequency, seed + i * 2027));
    sum += n * n * amplitude;
    maxAmplitude += amplitude;
    frequency *= 2.08;
    amplitude *= 0.48;
  }

  return sum / maxAmplitude;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface TerrainSeedParams {
  seedInt: number;
  archetype: TerrainArchetype;
  offsetX: number;
  offsetZ: number;
  coastSide: number;
  riverPhase: number;
  riverAngle: number;
  spawnGx: number;
  spawnGz: number;
}

export function createTerrainSeedParams(
  worldSeed: string,
  terrainType: TerrainTypeInput,
  mapWidth: number = WORLD_CONFIG.MAP_WIDTH,
  mapHeight: number = WORLD_CONFIG.MAP_HEIGHT
): TerrainSeedParams {
  const archetype = normalizeTerrainArchetype(terrainType);
  const seedInt = hashString32(`${WORLD_CONFIG.GENERATOR_VERSION}:${archetype}:${worldSeed}`);
  const offsetX = (hash2D(11, 23, seedInt) - 0.5) * 400;
  const offsetZ = (hash2D(37, 59, seedInt) - 0.5) * 400;
  const coastSide = Math.floor(hash2D(71, 83, seedInt) * 4) % 4;
  const riverPhase = hash2D(97, 101, seedInt) * Math.PI * 2;
  const riverAngle = (hash2D(107, 113, seedInt) - 0.5) * 0.45;

  const spawnGx = Math.floor(mapWidth * 0.5);
  const spawnGz = Math.floor(mapHeight * 0.5);

  return {
    seedInt,
    archetype,
    offsetX,
    offsetZ,
    coastSide,
    riverPhase,
    riverAngle,
    spawnGx,
    spawnGz,
  };
}

/**
 * Samples deterministic base terrain elevation at a global grid corner (vx, vz)
 * where vx in [0..mapWidth], vz in [0..mapHeight] (and halo values -1 / mapWidth+1).
 */
export function sampleBaseCornerHeight(
  params: TerrainSeedParams,
  vx: number,
  vz: number,
  mapWidth: number = WORLD_CONFIG.MAP_WIDTH,
  mapHeight: number = WORLD_CONFIG.MAP_HEIGHT
): number {
  const nx = vx / mapWidth;
  const nz = vz / mapHeight;
  const sx = vx * 0.032 + params.offsetX;
  const sz = vz * 0.032 + params.offsetZ;

  const baseNoise = fbm2D(sx, sz, params.seedInt, 4);
  const detailNoise = fbm2D(sx * 2.4 + 19.3, sz * 2.4 - 11.7, params.seedInt + 551, 3);

  let height = 2.0;

  if (params.archetype === 'plain') {
    // Lush pastoral plains with gentle rolling hills and occasional sparkling meadow ponds
    const hills = (baseNoise * 0.5 + 0.5) * 4.4 + detailNoise * 0.85;
    const pondField = fbm2D(sx * 0.9 + 41.2, sz * 0.9 - 27.4, params.seedInt + 997, 3);
    const pondCarve = pondField < -0.44 ? smoothstep(-0.44, -0.68, pondField) * 4.4 : 0;
    height = 0.95 + hills - pondCarve;
  } else if (params.archetype === 'coastal') {
    // Scenic bay & sandy coastline on a seeded side, rising to green coastal hills inland
    let coastCoord = nx;
    let alongCoord = nz;
    if (params.coastSide === 1) {
      coastCoord = 1 - nx;
      alongCoord = nz;
    } else if (params.coastSide === 2) {
      coastCoord = nz;
      alongCoord = nx;
    } else if (params.coastSide === 3) {
      coastCoord = 1 - nz;
      alongCoord = nx;
    }

    const bayWave =
      Math.sin(alongCoord * Math.PI * 2.2 + params.riverPhase) * 0.09 +
      fbm2D(alongCoord * 3.5 + params.offsetX * 0.05, params.seedInt * 0.0001, params.seedInt + 313, 3) *
      0.11;
    const shoreDist = coastCoord - (0.31 + bayWave);

    if (shoreDist < 0) {
      // Ocean & shallow bay
      const seaDepth = smoothstep(0, -0.32, shoreDist);
      height = -0.35 - seaDepth * 3.4 + detailNoise * 0.25;
    } else {
      // Sandy beach transitioning into rolling coastal terraces
      const inlandRise = Math.pow(smoothstep(0, 0.72, shoreDist), 1.15) * 9.5;
      const rolling = (baseNoise * 0.5 + 0.5) * 3.8 + detailNoise * 0.75;
      height = 0.22 + inlandRise * 0.72 + rolling * smoothstep(0.02, 0.22, shoreDist);
    }
  } else if (params.archetype === 'mountain') {
    // Dramatic low-poly highland peaks, alpine ridges, valleys and tarn lakes
    const ridge = ridged2D(sx * 1.18, sz * 1.18, params.seedInt + 701, 4);
    const broadMassif = baseNoise * 0.5 + 0.5;
    const valleyBasin = fbm2D(sx * 0.65 - 12.1, sz * 0.65 + 8.4, params.seedInt + 811, 3);

    height = 1.6 + ridge * ridge * 17.5 + broadMassif * 5.2 + detailNoise * 1.1;

    // Carve scenic alpine tarns in lowest pockets
    if (valleyBasin < -0.38) {
      const tarn = smoothstep(-0.38, -0.62, valleyBasin);
      height -= tarn * 6.5;
    }
  } else {
    // 'river' archetype: scenic turquoise lake & meandering hex river channels between lush green meadows
    const cosA = Math.cos(params.riverAngle);
    const sinA = Math.sin(params.riverAngle);
    const rx = (nx - 0.5) * cosA - (nz - 0.5) * sinA;
    const rz = (nx - 0.5) * sinA + (nz - 0.5) * cosA;

    // Offset river gracefully near center so spawn village sits overlooking the turquoise hex water
    const riverCenter =
      0.13 +
      Math.sin(rz * Math.PI * 2.4 + params.riverPhase) * 0.13 +
      fbm2D(rz * 3.8 + params.offsetX * 0.02, params.offsetZ * 0.02, params.seedInt + 431, 3) * 0.08;

    const distToRiver = Math.abs(rx - riverCenter);
    const lakeBulge =
      Math.exp(-Math.pow((rz + 0.06) / 0.22, 2)) * 0.055;
    const riverHalfWidth =
      0.062 +
      lakeBulge +
      (valueNoise2D(rz * 5.2, 3.1, params.seedInt + 449) * 0.5 + 0.5) * 0.032;

    if (distToRiver < riverHalfWidth) {
      const channelT = smoothstep(riverHalfWidth, 0, distToRiver);
      height = -0.35 - channelT * 2.3 + detailNoise * 0.14;
    } else {
      const bankDist = distToRiver - riverHalfWidth;
      const valleySlope = smoothstep(0.05, 0.48, bankDist) * 4.8;
      const meadowHills = (baseNoise * 0.5 + 0.5) * 2.4 + detailNoise * 0.45;
      height = 0.72 + valleySlope + meadowHills * smoothstep(0.0, 0.12, bankDist);
    }
  }

  // Gently grade a pleasant buildable plaza around the city spawn center so City Hall & Character stand level
  const dxSpawn = vx - params.spawnGx;
  const dzSpawn = vz - params.spawnGz;
  const distSpawn = Math.hypot(dxSpawn, dzSpawn);
  if (distSpawn < 11) {
    const flattenT = 1 - smoothstep(4.5, 11, distSpawn);
    const targetSpawnHeight =
      params.archetype === 'mountain' ? 4.4 : params.archetype === 'coastal' ? 2.1 : 2.3;
    height = lerp(height, targetSpawnHeight, flattenT * 0.88);
  }

  return clamp(height, WORLD_CONFIG.MIN_TERRAIN_HEIGHT, WORLD_CONFIG.MAX_TERRAIN_HEIGHT);
}

/**
 * Looks up merged tile delta entry at global tile (gx, gz) across a map of chunk deltas.
 */
function getGlobalTileDelta(
  gx: number,
  gz: number,
  chunkDeltas: ReadonlyMap<string, ChunkTerrainDelta>,
  mapWidth: number,
  mapHeight: number,
  chunkSize: number
): TerrainTileDeltaEntry | undefined {
  if (gx < 0 || gz < 0 || gx >= mapWidth || gz >= mapHeight) {
    return undefined;
  }
  const { cx, cz, lx, lz } = gridToLocalTile(gx, gz, chunkSize);
  const delta = chunkDeltas.get(chunkKey(cx, cz));
  if (!delta) {
    return undefined;
  }
  return delta.tiles[localTileKey(lx, lz)];
}

/**
 * Computes seamless corner elevation including deltas from all up-to-4 incident tiles.
 * Because adjacent chunks share the exact same global corner (vx, vz) and evaluate
 * the same 4 incident tiles (using neighbor chunk deltas), zero seams can ever appear!
 */
export function sampleCornerHeightWithDeltas(
  params: TerrainSeedParams,
  vx: number,
  vz: number,
  chunkDeltas: ReadonlyMap<string, ChunkTerrainDelta>,
  mapWidth: number = WORLD_CONFIG.MAP_WIDTH,
  mapHeight: number = WORLD_CONFIG.MAP_HEIGHT,
  chunkSize: number = WORLD_CONFIG.CHUNK_SIZE
): number {
  const baseHeight = sampleBaseCornerHeight(params, vx, vz, mapWidth, mapHeight);
  if (chunkDeltas.size === 0) {
    return baseHeight;
  }

  const incidentTiles: [number, number][] = [
    [vx - 1, vz - 1],
    [vx, vz - 1],
    [vx - 1, vz],
    [vx, vz],
  ];

  let deltaSum = 0;
  let setHeightSum = 0;
  let setHeightCount = 0;
  let deltaCount = 0;

  for (const [tx, tz] of incidentTiles) {
    const entry = getGlobalTileDelta(tx, tz, chunkDeltas, mapWidth, mapHeight, chunkSize);
    if (!entry) continue;
    if (typeof entry.setHeight === 'number') {
      setHeightSum += entry.setHeight;
      setHeightCount += 1;
    } else if (typeof entry.heightDelta === 'number') {
      deltaSum += entry.heightDelta;
      deltaCount += 1;
    }
  }

  let finalHeight = baseHeight;
  if (setHeightCount > 0) {
    const avgTarget = setHeightSum / setHeightCount;
    const weight = setHeightCount / 4;
    finalHeight = lerp(baseHeight, avgTarget, Math.min(1, weight * 1.35));
  }
  if (deltaCount > 0) {
    finalHeight += deltaSum / 4;
  }

  return clamp(finalHeight, WORLD_CONFIG.MIN_TERRAIN_HEIGHT, WORLD_CONFIG.MAX_TERRAIN_HEIGHT);
}

export function classifyBiome(
  height: number,
  slope: number,
  moisture: number,
  archetype: TerrainArchetype,
  waterLevel: number = WORLD_CONFIG.WATER_LEVEL
): BiomeType {
  if (height < waterLevel - 1.35) return 'deep_water';
  if (height < waterLevel) return 'shallow_water';

  if (archetype === 'coastal' && height < waterLevel + 1.05) {
    return 'sand';
  }
  if (archetype === 'river' && height < waterLevel + 0.55) {
    return 'sand';
  }
  if (height < waterLevel + 0.42) {
    return 'sand';
  }

  if (height >= 14.2) return 'snow';
  if (height >= 9.6 || (slope > 0.72 && height > 4.5)) return 'mountain';
  if (height >= 6.4 || slope > 0.52) return 'hill';

  if (moisture > 0.22 && height > 1.3) return 'forest';
  if (moisture < -0.18) return 'meadow';
  return 'grass';
}

export function isTileBuildable(biome: BiomeType, slope: number): boolean {
  if (biome === 'deep_water' || biome === 'shallow_water' || biome === 'mountain' || biome === 'snow') {
    return false;
  }
  return slope <= 0.58;
}

export function getSpawnPoint(
  worldSeed: string,
  terrainType: TerrainTypeInput,
  mapWidth: number = WORLD_CONFIG.MAP_WIDTH,
  mapHeight: number = WORLD_CONFIG.MAP_HEIGHT,
  tileSize: number = WORLD_CONFIG.TILE_SIZE
): { gx: number; gz: number; worldX: number; worldY: number; worldZ: number } {
  const params = createTerrainSeedParams(worldSeed, terrainType, mapWidth, mapHeight);
  const gx = params.spawnGx;
  const gz = params.spawnGz;
  const center = gridToWorldCenter(gx, gz, tileSize);
  const h00 = sampleBaseCornerHeight(params, gx, gz, mapWidth, mapHeight);
  const h10 = sampleBaseCornerHeight(params, gx + 1, gz, mapWidth, mapHeight);
  const h01 = sampleBaseCornerHeight(params, gx, gz + 1, mapWidth, mapHeight);
  const h11 = sampleBaseCornerHeight(params, gx + 1, gz + 1, mapWidth, mapHeight);
  const worldY = round3((h00 + h10 + h01 + h11) * 0.25);

  return {
    gx,
    gz,
    worldX: center.x,
    worldY,
    worldZ: center.z,
  };
}

export interface GenerateChunkOptions {
  cityId: string;
  worldSeed: string;
  terrainType: TerrainTypeInput;
  chunkX: number;
  chunkZ: number;
  revision?: number;
  updatedAt?: string;
  mapWidth?: number;
  mapHeight?: number;
  chunkSize?: number;
  tileSize?: number;
  /** Map of chunkKey ("cx:cz") -> ChunkTerrainDelta including this chunk and adjacent border chunks */
  chunkDeltas?: ReadonlyMap<string, ChunkTerrainDelta>;
}

/**
 * Deterministically generates a full 32x32 chunk (33x33 shared vertices, halo-computed
 * seamless normals, biomes, buildability, and stylized low-poly props).
 */
export function generateChunkData(options: GenerateChunkOptions): ChunkDataDTO {
  const mapWidth = options.mapWidth ?? WORLD_CONFIG.MAP_WIDTH;
  const mapHeight = options.mapHeight ?? WORLD_CONFIG.MAP_HEIGHT;
  const chunkSize = options.chunkSize ?? WORLD_CONFIG.CHUNK_SIZE;
  const tileSize = options.tileSize ?? WORLD_CONFIG.TILE_SIZE;
  const waterLevel = WORLD_CONFIG.WATER_LEVEL;
  const chunkDeltas = options.chunkDeltas ?? new Map<string, ChunkTerrainDelta>();
  const ownDelta: ChunkTerrainDelta = chunkDeltas.get(chunkKey(options.chunkX, options.chunkZ)) ?? {
    tiles: {},
  };

  const params = createTerrainSeedParams(options.worldSeed, options.terrainType, mapWidth, mapHeight);
  const seedHash = createSeedHash(options.worldSeed, options.terrainType);

  const vertsPerSide = chunkSize + 1; // 33
  const haloSide = chunkSize + 3; // 35 (-1..33)
  const originGx = options.chunkX * chunkSize;
  const originGz = options.chunkZ * chunkSize;

  // 1. Sample 35x35 halo grid so border normals match neighboring chunks with ZERO seams
  const haloHeights = new Float32Array(haloSide * haloSide);
  for (let hz = 0; hz < haloSide; hz += 1) {
    const globalVz = originGz + hz - 1;
    for (let hx = 0; hx < haloSide; hx += 1) {
      const globalVx = originGx + hx - 1;
      haloHeights[hz * haloSide + hx] = sampleCornerHeightWithDeltas(
        params,
        globalVx,
        globalVz,
        chunkDeltas,
        mapWidth,
        mapHeight,
        chunkSize
      );
    }
  }

  // 2. Extract 33x33 corner heights and seamless unit normals via central differences
  const cornerHeights: number[] = new Array(vertsPerSide * vertsPerSide);
  const cornerNormals: number[] = new Array(vertsPerSide * vertsPerSide * 3);
  const twoTileSize = tileSize * 2;

  for (let vz = 0; vz < vertsPerSide; vz += 1) {
    for (let vx = 0; vx < vertsPerSide; vx += 1) {
      const idx = vz * vertsPerSide + vx;
      const hx = vx + 1;
      const hz = vz + 1;

      const hCenter = haloHeights[hz * haloSide + hx];
      const hLeft = haloHeights[hz * haloSide + (hx - 1)];
      const hRight = haloHeights[hz * haloSide + (hx + 1)];
      const hDown = haloHeights[(hz - 1) * haloSide + hx];
      const hUp = haloHeights[(hz + 1) * haloSide + hx];

      cornerHeights[idx] = round3(hCenter);

      const nx = hLeft - hRight;
      const ny = twoTileSize;
      const nz = hDown - hUp;
      const len = Math.hypot(nx, ny, nz) || 1;

      cornerNormals[idx * 3] = round3(nx / len);
      cornerNormals[idx * 3 + 1] = round3(ny / len);
      cornerNormals[idx * 3 + 2] = round3(nz / len);
    }
  }

  // 3. Tile heights, biomes, buildability, and stylized low-poly props
  const tileCount = chunkSize * chunkSize;
  const tileHeights: number[] = new Array(tileCount);
  const tileBiomes: BiomeType[] = new Array(tileCount);
  const buildableMask: boolean[] = new Array(tileCount);
  const props: TerrainPropInstance[] = [];
  const biomeCounts = new Map<BiomeType, number>();
  let hasWater = false;

  for (let lz = 0; lz < chunkSize; lz += 1) {
    const gz = originGz + lz;
    for (let lx = 0; lx < chunkSize; lx += 1) {
      const gx = originGx + lx;
      const tileIdx = lz * chunkSize + lx;

      const h00 = cornerHeights[lz * vertsPerSide + lx];
      const h10 = cornerHeights[lz * vertsPerSide + lx + 1];
      const h01 = cornerHeights[(lz + 1) * vertsPerSide + lx];
      const h11 = cornerHeights[(lz + 1) * vertsPerSide + lx + 1];

      const avgHeight = (h00 + h10 + h01 + h11) * 0.25;
      const minH = Math.min(h00, h10, h01, h11);
      const maxH = Math.max(h00, h10, h01, h11);
      const slope = (maxH - minH) / tileSize;

      tileHeights[tileIdx] = round3(avgHeight);
      if (minH < waterLevel) {
        hasWater = true;
      }

      const moisture = fbm2D(
        gx * 0.055 + params.offsetX * 0.7,
        gz * 0.055 + params.offsetZ * 0.7,
        params.seedInt + 1223,
        3
      );

      const tileDelta = ownDelta.tiles[localTileKey(lx, lz)];
      const biome =
        tileDelta?.biome ?? classifyBiome(avgHeight, slope, moisture, params.archetype, waterLevel);
      tileBiomes[tileIdx] = biome;
      buildableMask[tileIdx] = isTileBuildable(biome, slope);
      biomeCounts.set(biome, (biomeCounts.get(biome) ?? 0) + 1);

      // Keep spawn plaza clear for City Hall and player character
      const distToSpawn = Math.hypot(gx - params.spawnGx, gz - params.spawnGz);
      if (distToSpawn < 6.5 || tileDelta?.clearProps) {
        continue;
      }

      // Skip underwater or overly steep tiles for ground foliage
      if (avgHeight <= waterLevel + 0.35 || biome === 'deep_water' || biome === 'shallow_water') {
        continue;
      }

      const propRoll = hash2D(gx, gz, params.seedInt + 3331);
      const hexMaxJitter = getHexRadius(tileSize) * 0.34;
      const jitterX = (hash2D(gx + 17, gz - 9, params.seedInt + 4447) - 0.5) * 2 * hexMaxJitter;
      const jitterZ = (hash2D(gx - 13, gz + 29, params.seedInt + 5557) - 0.5) * 2 * hexMaxJitter;
      const scaleRoll = hash2D(gx + 41, gz + 7, params.seedInt + 6661);
      const rotRoll = hash2D(gx - 31, gz - 19, params.seedInt + 7771);
      const colorVariant = Math.floor(hash2D(gx + 5, gz + 53, params.seedInt + 8887) * 4);

      let propType: TerrainPropType | null = null;
      let scale = 1;

      if (biome === 'forest') {
        if (propRoll < 0.34) {
          propType = 'pine_tree';
          scale = 0.85 + scaleRoll * 0.55;
        } else if (propRoll < 0.52) {
          propType = 'deciduous_tree';
          scale = 0.85 + scaleRoll * 0.48;
        } else if (propRoll < 0.68) {
          propType = 'autumn_tree';
          scale = 0.85 + scaleRoll * 0.48;
        } else if (propRoll < 0.78) {
          propType = 'grass_tuft';
          scale = 0.75 + scaleRoll * 0.45;
        }
      } else if (biome === 'grass' || biome === 'meadow') {
        if (propRoll < 0.065) {
          propType = 'deciduous_tree';
          scale = 0.82 + scaleRoll * 0.44;
        } else if (propRoll < 0.1) {
          propType = 'pine_tree';
          scale = 0.82 + scaleRoll * 0.44;
        } else if (propRoll < 0.135) {
          propType = 'autumn_tree';
          scale = 0.84 + scaleRoll * 0.4;
        } else if (propRoll < 0.175) {
          propType = 'rock';
          scale = 0.78 + scaleRoll * 0.72;
        } else if (propRoll < 0.28) {
          propType = 'grass_tuft';
          scale = 0.7 + scaleRoll * 0.5;
        }
      } else if (biome === 'hill') {
        if (propRoll < 0.16) {
          propType = 'pine_tree';
          scale = 0.8 + scaleRoll * 0.45;
        } else if (propRoll < 0.28) {
          propType = 'rock';
          scale = 0.88 + scaleRoll * 0.92;
        } else if (propRoll < 0.36) {
          propType = 'grass_tuft';
          scale = 0.65 + scaleRoll * 0.35;
        }
      } else if (biome === 'mountain') {
        if (propRoll < 0.26 && slope < 0.95) {
          propType = 'rock';
          scale = 0.95 + scaleRoll * 1.15;
        } else if (propRoll < 0.31 && avgHeight < 12.2 && slope < 0.65) {
          propType = 'pine_tree';
          scale = 0.72 + scaleRoll * 0.35;
        }
      } else if (biome === 'sand') {
        if (propRoll < 0.07) {
          propType = 'rock';
          scale = 0.65 + scaleRoll * 0.7;
        }
      }

      if (propType) {
        const center = gridToWorldCenter(gx, gz, tileSize);
        const worldX = center.x + jitterX;
        const worldZ = center.z + jitterZ;
        // Props stand directly on the flat-topped hex surface elevation
        const worldY = avgHeight;

        if (worldY > waterLevel + 0.15) {
          props.push({
            type: propType,
            gx,
            gz,
            worldX: round3(worldX),
            worldY: round3(worldY),
            worldZ: round3(worldZ),
            scale: round3(scale),
            rotationY: round3(rotRoll * Math.PI * 2),
            colorVariant,
          });
        }
      }
    }
  }

  let biomeSummary: BiomeType = 'grass';
  let maxBiomeCount = -1;
  for (const [biome, count] of biomeCounts.entries()) {
    if (count > maxBiomeCount) {
      maxBiomeCount = count;
      biomeSummary = biome;
    }
  }

  return {
    cityId: options.cityId,
    chunkX: options.chunkX,
    chunkZ: options.chunkZ,
    chunkSize,
    tileSize,
    revision: options.revision ?? 1,
    seedHash,
    biomeSummary,
    waterLevel,
    cornerHeights,
    cornerNormals,
    tileHeights,
    tileBiomes,
    buildableMask,
    props,
    delta: ownDelta,
    hasWater,
    updatedAt: options.updatedAt ?? new Date(0).toISOString(),
  };
}
