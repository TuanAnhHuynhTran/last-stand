import { Op, type Transaction } from 'sequelize';
import {
  TERRAIN_PRESETS,
  WORLD_CONFIG,
  chunkKey,
  clamp,
  createSeedHash,
  generateChunkData,
  getSpawnPoint,
  getWorldBounds,
  gridToLocalTile,
  localTileKey,
  normalizeTerrainArchetype,
  type ChunkDataDTO,
  type ChunkRangeQueryInput,
  type ChunkRangeResponseDTO,
  type ChunkTerrainDelta,
  type CityMemberRole,
  type SaveChunkDeltaBodyInput,
  type SaveTerrainDeltaInput,
  type SaveTerrainDeltaResponseDTO,
  type SeedTerrainInput,
  type SeedTerrainResponseDTO,
  type TerrainMetadataDTO,
  type TerrainTileDeltaEntry,
} from '@cityverse/shared';
import type { City } from '../../database/models/City.js';
import type { CityChunk } from '../../database/models/CityChunk.js';
import type { DatabaseModels } from '../../database/models/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';

interface CityAccessContext {
  city: City;
  role: CityMemberRole;
  chunksX: number;
  chunksZ: number;
}

export class WorldService {
  constructor(private readonly models: DatabaseModels) {}

  private async resolveCityAccess(
    cityId: string,
    requesterUserId: string,
    requireEdit = false
  ): Promise<CityAccessContext> {
    const city = await this.models.City.findByPk(cityId);
    if (!city) {
      throw new NotFoundError('Thanh pho khong ton tai', 'CITY_NOT_FOUND');
    }

    const membership = await this.models.CityMember.findOne({
      where: { cityId: city.id, userId: requesterUserId },
    });

    let role: CityMemberRole;
    if (membership) {
      role = membership.role;
    } else if (city.ownerId === requesterUserId) {
      role = 'owner';
    } else if (city.isPublic) {
      role = 'visitor';
    } else {
      throw new ForbiddenError(
        'Ban khong du quyen truy cap thanh pho rieng tu nay',
        'CITY_ACCESS_DENIED'
      );
    }

    if (requireEdit && role !== 'owner' && role !== 'co_mayor') {
      throw new ForbiddenError(
        'Chi chu thanh pho hoac pho thi truong moi duoc chinh sua dia hinh',
        'TERRAIN_EDIT_FORBIDDEN'
      );
    }

    const chunksX = Math.max(1, Math.ceil(city.mapWidth / WORLD_CONFIG.CHUNK_SIZE));
    const chunksZ = Math.max(1, Math.ceil(city.mapHeight / WORLD_CONFIG.CHUNK_SIZE));

    return { city, role, chunksX, chunksZ };
  }

  private async loadDeltaMapForRange(
    cityId: string,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    chunksX: number,
    chunksZ: number,
    transaction?: Transaction
  ): Promise<{
    rowsByKey: Map<string, CityChunk>;
    deltaMap: Map<string, ChunkTerrainDelta>;
  }> {
    const haloMinX = clamp(minX - 1, 0, chunksX - 1);
    const haloMaxX = clamp(maxX + 1, 0, chunksX - 1);
    const haloMinZ = clamp(minZ - 1, 0, chunksZ - 1);
    const haloMaxZ = clamp(maxZ + 1, 0, chunksZ - 1);

    const rows = await this.models.CityChunk.findAll({
      where: {
        cityId,
        chunkX: { [Op.between]: [haloMinX, haloMaxX] },
        chunkZ: { [Op.between]: [haloMinZ, haloMaxZ] },
      },
      transaction,
    });

    const rowsByKey = new Map<string, CityChunk>();
    const deltaMap = new Map<string, ChunkTerrainDelta>();

    for (const row of rows) {
      const key = chunkKey(row.chunkX, row.chunkZ);
      rowsByKey.set(key, row);
      deltaMap.set(key, row.terrainDelta);
    }

    return { rowsByKey, deltaMap };
  }

  async getTerrainMetadata(cityId: string, requesterUserId: string): Promise<TerrainMetadataDTO> {
    const { city, chunksX, chunksZ } = await this.resolveCityAccess(cityId, requesterUserId, false);
    const persistedChunks = await this.models.CityChunk.count({ where: { cityId: city.id } });

    const preset =
      TERRAIN_PRESETS.find((item) => item.id === city.terrainType) ?? TERRAIN_PRESETS[0];
    const archetype = normalizeTerrainArchetype(city.terrainType);
    const spawnPoint = getSpawnPoint(
      city.worldSeed,
      city.terrainType,
      city.mapWidth,
      city.mapHeight,
      WORLD_CONFIG.TILE_SIZE
    );

    return {
      cityId: city.id,
      worldSeed: city.worldSeed,
      terrainType: city.terrainType,
      terrainArchetype: archetype,
      generatorVersion: WORLD_CONFIG.GENERATOR_VERSION,
      mapWidth: city.mapWidth,
      mapHeight: city.mapHeight,
      tileSize: WORLD_CONFIG.TILE_SIZE,
      chunkSize: WORLD_CONFIG.CHUNK_SIZE,
      chunksX,
      chunksZ,
      totalChunks: chunksX * chunksZ,
      persistedChunks,
      waterLevel: WORLD_CONFIG.WATER_LEVEL,
      elevationScale: preset.elevationScale,
      worldBounds: getWorldBounds(city.mapWidth, city.mapHeight, WORLD_CONFIG.TILE_SIZE),
      spawnPoint,
      preset,
    };
  }

  async getChunksInRange(
    cityId: string,
    requesterUserId: string,
    query: ChunkRangeQueryInput
  ): Promise<ChunkRangeResponseDTO> {
    const { city, chunksX, chunksZ } = await this.resolveCityAccess(cityId, requesterUserId, false);

    let minX: number;
    let maxX: number;
    let minZ: number;
    let maxZ: number;

    if (
      query.minX !== undefined &&
      query.maxX !== undefined &&
      query.minZ !== undefined &&
      query.maxZ !== undefined
    ) {
      minX = clamp(query.minX, 0, chunksX - 1);
      maxX = clamp(query.maxX, 0, chunksX - 1);
      minZ = clamp(query.minZ, 0, chunksZ - 1);
      maxZ = clamp(query.maxZ, 0, chunksZ - 1);
    } else {
      const cx = clamp(query.cx ?? 0, 0, chunksX - 1);
      const cz = clamp(query.cz ?? 0, 0, chunksZ - 1);
      const radius = clamp(query.radius ?? WORLD_CONFIG.DEFAULT_LOAD_RADIUS, 0, 2);
      minX = clamp(cx - radius, 0, chunksX - 1);
      maxX = clamp(cx + radius, 0, chunksX - 1);
      minZ = clamp(cz - radius, 0, chunksZ - 1);
      maxZ = clamp(cz + radius, 0, chunksZ - 1);
    }

    if (minX > maxX || minZ > maxZ) {
      throw new BadRequestError('Pham vi chunk yeu cau khong hop le', 'INVALID_CHUNK_RANGE');
    }

    const { rowsByKey, deltaMap } = await this.loadDeltaMapForRange(
      city.id,
      minX,
      maxX,
      minZ,
      maxZ,
      chunksX,
      chunksZ
    );

    const chunks: ChunkDataDTO[] = [];
    for (let cz = minZ; cz <= maxZ; cz += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        const persisted = rowsByKey.get(chunkKey(cx, cz));
        const chunkData = generateChunkData({
          cityId: city.id,
          worldSeed: city.worldSeed,
          terrainType: city.terrainType,
          chunkX: cx,
          chunkZ: cz,
          revision: persisted?.revision ?? 1,
          updatedAt: persisted?.updatedAt?.toISOString() ?? city.updatedAt.toISOString(),
          mapWidth: city.mapWidth,
          mapHeight: city.mapHeight,
          chunkSize: WORLD_CONFIG.CHUNK_SIZE,
          tileSize: WORLD_CONFIG.TILE_SIZE,
          chunkDeltas: deltaMap,
        });
        chunks.push(chunkData);
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

  async saveChunkDelta(
    cityId: string,
    requesterUserId: string,
    chunkX: number,
    chunkZ: number,
    body: SaveChunkDeltaBodyInput
  ): Promise<SaveTerrainDeltaResponseDTO> {
    const { city, chunksX, chunksZ } = await this.resolveCityAccess(cityId, requesterUserId, true);

    if (chunkX < 0 || chunkZ < 0 || chunkX >= chunksX || chunkZ >= chunksZ) {
      throw new BadRequestError('Toa do chunk nam ngoai pham vi ban do', 'CHUNK_OUT_OF_BOUNDS');
    }

    const globalTiles = body.tiles.map((t) => ({
      gx: chunkX * WORLD_CONFIG.CHUNK_SIZE + t.lx,
      gz: chunkZ * WORLD_CONFIG.CHUNK_SIZE + t.lz,
      heightDelta: t.heightDelta,
      setHeight: t.setHeight,
      biome: t.biome,
      clearProps: t.clearProps,
    }));

    return this.saveTerrainDelta(city.id, requesterUserId, { tiles: globalTiles });
  }

  async saveTerrainDelta(
    cityId: string,
    requesterUserId: string,
    input: SaveTerrainDeltaInput
  ): Promise<SaveTerrainDeltaResponseDTO> {
    const { city, chunksX, chunksZ } = await this.resolveCityAccess(cityId, requesterUserId, true);
    const chunkSize = WORLD_CONFIG.CHUNK_SIZE;
    const seedHash = createSeedHash(city.worldSeed, city.terrainType);

    // Group tile modifications by chunk and track neighbor chunks whose shared seam vertices are impacted
    const tilesByChunk = new Map<
      string,
      { cx: number; cz: number; updates: Array<{ lx: number; lz: number; patch: TerrainTileDeltaEntry }> }
    >();
    const impactedChunks = new Map<string, { cx: number; cz: number }>();

    for (const tile of input.tiles) {
      if (tile.gx < 0 || tile.gz < 0 || tile.gx >= city.mapWidth || tile.gz >= city.mapHeight) {
        throw new BadRequestError(
          `Toa do o dat (${tile.gx}, ${tile.gz}) nam ngoai ban do ${city.mapWidth}x${city.mapHeight}`,
          'TILE_OUT_OF_BOUNDS'
        );
      }

      const { cx, cz, lx, lz } = gridToLocalTile(tile.gx, tile.gz, chunkSize);
      const key = chunkKey(cx, cz);
      if (!tilesByChunk.has(key)) {
        tilesByChunk.set(key, { cx, cz, updates: [] });
      }
      tilesByChunk.get(key)!.updates.push({
        lx,
        lz,
        patch: {
          heightDelta: tile.heightDelta,
          setHeight: tile.setHeight,
          biome: tile.biome,
          clearProps: tile.clearProps,
        },
      });
      impactedChunks.set(key, { cx, cz });

      // If tile lies on a chunk edge, adjacent chunks share boundary corners and must bump revision too
      const dxs = lx === 0 ? [-1, 0] : lx === chunkSize - 1 ? [0, 1] : [0];
      const dzs = lz === 0 ? [-1, 0] : lz === chunkSize - 1 ? [0, 1] : [0];
      for (const dx of dxs) {
        for (const dz of dzs) {
          const ncx = cx + dx;
          const ncz = cz + dz;
          if (ncx >= 0 && ncz >= 0 && ncx < chunksX && ncz < chunksZ) {
            impactedChunks.set(chunkKey(ncx, ncz), { cx: ncx, cz: ncz });
          }
        }
      }
    }

    return this.models.sequelize.transaction(async (transaction) => {
      let minX = chunksX - 1;
      let maxX = 0;
      let minZ = chunksZ - 1;
      let maxZ = 0;

      for (const coord of impactedChunks.values()) {
        minX = Math.min(minX, coord.cx);
        maxX = Math.max(maxX, coord.cx);
        minZ = Math.min(minZ, coord.cz);
        maxZ = Math.max(maxZ, coord.cz);
      }

      const { rowsByKey, deltaMap } = await this.loadDeltaMapForRange(
        city.id,
        minX,
        maxX,
        minZ,
        maxZ,
        chunksX,
        chunksZ,
        transaction
      );

      // Apply merged deltas into deltaMap first
      for (const [key, entry] of tilesByChunk.entries()) {
        const existingDelta: ChunkTerrainDelta = deltaMap.get(key) ?? { tiles: {} };
        const mergedTiles: Record<string, TerrainTileDeltaEntry> = { ...existingDelta.tiles };

        for (const { lx, lz, patch } of entry.updates) {
          const tKey = localTileKey(lx, lz);
          const prev = mergedTiles[tKey] ?? {};
          const next: TerrainTileDeltaEntry = { ...prev };

          if (typeof patch.setHeight === 'number') {
            next.setHeight = clamp(
              patch.setHeight,
              WORLD_CONFIG.MIN_TERRAIN_HEIGHT,
              WORLD_CONFIG.MAX_TERRAIN_HEIGHT
            );
            delete next.heightDelta;
          } else if (typeof patch.heightDelta === 'number') {
            if (typeof prev.setHeight === 'number') {
              next.setHeight = clamp(
                prev.setHeight + patch.heightDelta,
                WORLD_CONFIG.MIN_TERRAIN_HEIGHT,
                WORLD_CONFIG.MAX_TERRAIN_HEIGHT
              );
            } else {
              next.heightDelta = clamp(
                (prev.heightDelta ?? 0) + patch.heightDelta,
                WORLD_CONFIG.MIN_HEIGHT_DELTA,
                WORLD_CONFIG.MAX_HEIGHT_DELTA
              );
            }
          }

          if (patch.biome !== undefined) {
            next.biome = patch.biome;
          }
          if (patch.clearProps !== undefined) {
            next.clearProps = patch.clearProps;
          }

          mergedTiles[tKey] = next;
        }

        deltaMap.set(key, { tiles: mergedTiles });
      }

      // Persist all impacted chunks with incremented revision and return fresh ChunkDataDTO[]
      const updatedChunks: ChunkDataDTO[] = [];

      for (const { cx, cz } of impactedChunks.values()) {
        const key = chunkKey(cx, cz);
        const existingRow = rowsByKey.get(key);
        const nextRevision = (existingRow?.revision ?? 1) + 1;
        const chunkDelta = deltaMap.get(key) ?? { tiles: {} };

        const generated = generateChunkData({
          cityId: city.id,
          worldSeed: city.worldSeed,
          terrainType: city.terrainType,
          chunkX: cx,
          chunkZ: cz,
          revision: nextRevision,
          mapWidth: city.mapWidth,
          mapHeight: city.mapHeight,
          chunkSize,
          tileSize: WORLD_CONFIG.TILE_SIZE,
          chunkDeltas: deltaMap,
        });

        let savedRow: CityChunk;
        if (existingRow) {
          existingRow.revision = nextRevision;
          existingRow.biomeSummary = generated.biomeSummary;
          existingRow.seedHash = seedHash;
          existingRow.terrainDelta = chunkDelta;
          existingRow.changed('terrainDelta', true);
          savedRow = await existingRow.save({ transaction });
        } else {
          savedRow = await this.models.CityChunk.create(
            {
              cityId: city.id,
              chunkX: cx,
              chunkZ: cz,
              revision: nextRevision,
              biomeSummary: generated.biomeSummary,
              seedHash,
              terrainDelta: chunkDelta,
            },
            { transaction }
          );
        }

        updatedChunks.push({
          ...generated,
          revision: savedRow.revision,
          updatedAt: savedRow.updatedAt.toISOString(),
        });
      }

      return {
        cityId: city.id,
        appliedTiles: input.tiles.length,
        updatedChunks,
      };
    });
  }

  async seedTerrain(
    cityId: string,
    requesterUserId: string,
    input: SeedTerrainInput
  ): Promise<SeedTerrainResponseDTO> {
    const { city, role, chunksX, chunksZ } = await this.resolveCityAccess(
      cityId,
      requesterUserId,
      true
    );

    if (input.resetDeltas && role !== 'owner') {
      throw new ForbiddenError('Chi chu thanh pho moi duoc tai tao dia hinh goc', 'OWNER_ONLY');
    }

    const targets: Array<{ cx: number; cz: number }> = [];
    if (input.chunks && input.chunks.length > 0) {
      for (const c of input.chunks) {
        if (c.cx >= chunksX || c.cz >= chunksZ) {
          throw new BadRequestError('Toa do chunk seed nam ngoai ban do', 'CHUNK_OUT_OF_BOUNDS');
        }
        targets.push(c);
      }
    } else {
      for (let cz = 0; cz < chunksZ; cz += 1) {
        for (let cx = 0; cx < chunksX; cx += 1) {
          targets.push({ cx, cz });
        }
      }
    }

    const seedHash = createSeedHash(city.worldSeed, city.terrainType);

    await this.models.sequelize.transaction(async (transaction) => {
      for (const { cx, cz } of targets) {
        const existing = await this.models.CityChunk.findOne({
          where: { cityId: city.id, chunkX: cx, chunkZ: cz },
          transaction,
        });

        const baseGenerated = generateChunkData({
          cityId: city.id,
          worldSeed: city.worldSeed,
          terrainType: city.terrainType,
          chunkX: cx,
          chunkZ: cz,
          mapWidth: city.mapWidth,
          mapHeight: city.mapHeight,
          chunkSize: WORLD_CONFIG.CHUNK_SIZE,
          tileSize: WORLD_CONFIG.TILE_SIZE,
        });

        if (existing) {
          if (input.resetDeltas) {
            existing.revision += 1;
            existing.terrainDelta = { tiles: {} };
            existing.biomeSummary = baseGenerated.biomeSummary;
            existing.seedHash = seedHash;
            existing.changed('terrainDelta', true);
            await existing.save({ transaction });
          }
        } else {
          await this.models.CityChunk.create(
            {
              cityId: city.id,
              chunkX: cx,
              chunkZ: cz,
              revision: 1,
              biomeSummary: baseGenerated.biomeSummary,
              seedHash,
              terrainDelta: { tiles: {} },
            },
            { transaction }
          );
        }
      }
    });

    return {
      cityId: city.id,
      worldSeed: city.worldSeed,
      seededChunks: targets.length,
      totalChunks: chunksX * chunksZ,
      resetDeltas: Boolean(input.resetDeltas),
    };
  }
}
