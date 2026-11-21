import {
  CHARACTER_PRESETS,
  CITY_CONFIG,
  WORLD_CONFIG,
  createSeedHash,
  generateChunkData,
  getSpawnPoint,
  gridToChunk,
} from '@cityverse/shared';
import type { EnvConfig } from '../config/env.js';
import type { DatabaseModels } from './models/index.js';
import type { User } from './models/User.js';
import { hashPassword } from '../utils/password.js';

export const DEV_ADMIN_EMAIL = 'admin@cityverse.io';
export const DEV_ADMIN_USERNAME = 'admin';
export const DEV_ADMIN_CITY_ID = '00000000-0000-4000-8000-000000000001';
export const DEV_ADMIN_WORLD_SEED = 'CV-VAL-ADMIN20260001';

/**
 * Ensures a default admin account, 3D character, and 128x128 river-valley city
 * exist in the database (idempotent, safe to call on every startup or dev-admin login).
 */
export async function ensureAdminAccount(
  models: DatabaseModels,
  config: EnvConfig
): Promise<User> {
  const existingUser = await models.User.findOne({ where: { email: DEV_ADMIN_EMAIL } });

  return models.sequelize.transaction(async (transaction) => {
    let user = existingUser;
    if (!user) {
      const passwordHash = await hashPassword('AdminCity2026', Math.min(config.BCRYPT_SALT_ROUNDS, 8));
      user = await models.User.create(
        {
          email: DEV_ADMIN_EMAIL,
          username: DEV_ADMIN_USERNAME,
          passwordHash,
          status: 'active',
        },
        { transaction }
      );
    }

    const existingCharacter = await models.Character.findOne({
      where: { userId: user.id },
      transaction,
    });
    if (!existingCharacter) {
      const preset = CHARACTER_PRESETS[0];
      await models.Character.create(
        {
          userId: user.id,
          name: 'Admin Architect',
          presetId: preset.id,
          appearance: { ...preset.appearance },
        },
        { transaction }
      );
    }

    let city = await models.City.findOne({
      where: { ownerId: user.id },
      transaction,
    });
    if (!city) {
      city = await models.City.create(
        {
          id: DEV_ADMIN_CITY_ID,
          ownerId: user.id,
          name: 'Admin Valley',
          terrainType: 'valley',
          worldSeed: DEV_ADMIN_WORLD_SEED,
          mapWidth: CITY_CONFIG.MAP_WIDTH,
          mapHeight: CITY_CONFIG.MAP_HEIGHT,
          level: CITY_CONFIG.INITIAL_LEVEL,
          isPublic: true,
        },
        { transaction }
      );
    }

    const existingEconomy = await models.CityEconomy.findOne({
      where: { cityId: city.id },
      transaction,
    });
    if (!existingEconomy) {
      await models.CityEconomy.create(
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
    }

    const existingMember = await models.CityMember.findOne({
      where: { cityId: city.id, userId: user.id },
      transaction,
    });
    if (!existingMember) {
      await models.CityMember.create(
        {
          cityId: city.id,
          userId: user.id,
          role: 'owner',
          joinedAt: new Date(),
        },
        { transaction }
      );
    }

    const spawn = getSpawnPoint(
      city.worldSeed,
      city.terrainType,
      city.mapWidth,
      city.mapHeight,
      WORLD_CONFIG.TILE_SIZE
    );
    const spawnChunk = gridToChunk(spawn.gx, spawn.gz, WORLD_CONFIG.CHUNK_SIZE);
    const existingChunk = await models.CityChunk.findOne({
      where: { cityId: city.id, chunkX: spawnChunk.cx, chunkZ: spawnChunk.cz },
      transaction,
    });
    if (!existingChunk) {
      const initialChunk = generateChunkData({
        cityId: city.id,
        worldSeed: city.worldSeed,
        terrainType: city.terrainType,
        chunkX: spawnChunk.cx,
        chunkZ: spawnChunk.cz,
        mapWidth: city.mapWidth,
        mapHeight: city.mapHeight,
        chunkSize: WORLD_CONFIG.CHUNK_SIZE,
        tileSize: WORLD_CONFIG.TILE_SIZE,
      });
      await models.CityChunk.create(
        {
          cityId: city.id,
          chunkX: spawnChunk.cx,
          chunkZ: spawnChunk.cz,
          revision: 1,
          biomeSummary: initialChunk.biomeSummary,
          seedHash: createSeedHash(city.worldSeed, city.terrainType),
          terrainDelta: { tiles: {} },
        },
        { transaction }
      );
    }

    return user;
  });
}
