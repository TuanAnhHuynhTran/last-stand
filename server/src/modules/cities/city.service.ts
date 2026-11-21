import {
  CITY_CONFIG,
  TERRAIN_PRESETS,
  WORLD_CONFIG,
  createSeedHash,
  generateChunkData,
  getSpawnPoint,
  gridToChunk,
  type CityDTO,
  type CityMemberRole,
  type CreateCityInput,
  type TerrainPreset,
} from '@cityverse/shared';
import type { DatabaseModels } from '../../database/models/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { toCityDTO } from '../../utils/mappers.js';
import { generateWorldSeed } from '../../utils/seedGenerator.js';

export class CityService {
  constructor(private readonly models: DatabaseModels) {}

  getTerrains(): { terrains: readonly TerrainPreset[]; config: typeof CITY_CONFIG } {
    return {
      terrains: TERRAIN_PRESETS,
      config: CITY_CONFIG,
    };
  }

  async getMyCity(userId: string): Promise<CityDTO> {
    const city = await this.models.City.findOne({ where: { ownerId: userId } });
    if (!city) {
      throw new NotFoundError('Ban chua tao thanh pho nao', 'CITY_NOT_FOUND');
    }

    const economy = await this.models.CityEconomy.findOne({ where: { cityId: city.id } });
    if (!economy) {
      throw new NotFoundError('Du lieu kinh te thanh pho khong ton tai', 'CITY_ECONOMY_NOT_FOUND');
    }

    return toCityDTO(city, economy, 'owner');
  }

  async createCity(userId: string, input: CreateCityInput): Promise<CityDTO> {
    const existing = await this.models.City.findOne({ where: { ownerId: userId } });
    if (existing) {
      throw new ConflictError(
        'Moi tai khoan chi duoc so huu toi da 1 thanh pho o ban MVP',
        'CITY_ALREADY_EXISTS'
      );
    }

    const worldSeed = generateWorldSeed(input.terrainType);

    return this.models.sequelize.transaction(async (transaction) => {
      const existingInTx = await this.models.City.findOne({
        where: { ownerId: userId },
        transaction,
      });
      if (existingInTx) {
        throw new ConflictError(
          'Moi tai khoan chi duoc so huu toi da 1 thanh pho o ban MVP',
          'CITY_ALREADY_EXISTS'
        );
      }

      const city = await this.models.City.create(
        {
          ownerId: userId,
          name: input.name.trim(),
          terrainType: input.terrainType,
          worldSeed,
          mapWidth: CITY_CONFIG.MAP_WIDTH,
          mapHeight: CITY_CONFIG.MAP_HEIGHT,
          level: CITY_CONFIG.INITIAL_LEVEL,
          isPublic: input.isPublic ?? true,
        },
        { transaction }
      );

      const economy = await this.models.CityEconomy.create(
        {
          cityId: city.id,
          cityCoins: CITY_CONFIG.INITIAL_COINS,
          population: CITY_CONFIG.INITIAL_POPULATION,
          happiness: CITY_CONFIG.INITIAL_HAPPINESS,
          taxRate: CITY_CONFIG.INITIAL_TAX_RATE,
          powerCapacity: 0,
          powerUsage: 0,
          waterCapacity: 0,
          waterUsage: 0,
        },
        { transaction }
      );

      await this.models.CityMember.create(
        {
          cityId: city.id,
          userId,
          role: 'owner',
          joinedAt: new Date(),
        },
        { transaction }
      );

      // Seed the initial spawn chunk record; remaining chunks reconstruct deterministically from world_seed on demand
      const spawn = getSpawnPoint(
        worldSeed,
        input.terrainType,
        CITY_CONFIG.MAP_WIDTH,
        CITY_CONFIG.MAP_HEIGHT,
        WORLD_CONFIG.TILE_SIZE
      );
      const spawnChunk = gridToChunk(spawn.gx, spawn.gz, WORLD_CONFIG.CHUNK_SIZE);
      const initialChunk = generateChunkData({
        cityId: city.id,
        worldSeed,
        terrainType: input.terrainType,
        chunkX: spawnChunk.cx,
        chunkZ: spawnChunk.cz,
        mapWidth: CITY_CONFIG.MAP_WIDTH,
        mapHeight: CITY_CONFIG.MAP_HEIGHT,
        chunkSize: WORLD_CONFIG.CHUNK_SIZE,
        tileSize: WORLD_CONFIG.TILE_SIZE,
      });
      await this.models.CityChunk.create(
        {
          cityId: city.id,
          chunkX: spawnChunk.cx,
          chunkZ: spawnChunk.cz,
          revision: 1,
          biomeSummary: initialChunk.biomeSummary,
          seedHash: createSeedHash(worldSeed, input.terrainType),
          terrainDelta: { tiles: {} },
        },
        { transaction }
      );

      return toCityDTO(city, economy, 'owner');
    });
  }

  async getCityById(cityId: string, requesterUserId: string): Promise<CityDTO> {
    const city = await this.models.City.findByPk(cityId);
    if (!city) {
      throw new NotFoundError('Thanh pho khong ton tai', 'CITY_NOT_FOUND');
    }

    const membership = await this.models.CityMember.findOne({
      where: { cityId: city.id, userId: requesterUserId },
    });

    let effectiveRole: CityMemberRole;
    if (membership) {
      effectiveRole = membership.role;
    } else if (city.ownerId === requesterUserId) {
      effectiveRole = 'owner';
    } else if (city.isPublic) {
      effectiveRole = 'visitor';
    } else {
      throw new ForbiddenError(
        'Ban khong du quyen truy cap thanh pho rieng tu nay',
        'CITY_ACCESS_DENIED'
      );
    }

    const economy = await this.models.CityEconomy.findOne({ where: { cityId: city.id } });
    if (!economy) {
      throw new NotFoundError('Du lieu kinh te thanh pho khong ton tai', 'CITY_ECONOMY_NOT_FOUND');
    }

    return toCityDTO(city, economy, effectiveRole);
  }
}
