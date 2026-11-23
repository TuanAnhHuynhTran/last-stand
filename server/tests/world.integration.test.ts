import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import {
  WORLD_CONFIG,
  generateChunkData,
  getGridWorldBounds,
  type ChunkDataDTO,
  type TerrainArchetype,
} from '@cityverse/shared';
import { createApp } from '../src/app.js';
import { createSequelizeInstance } from '../src/config/database.js';
import { loadEnv, type EnvConfig } from '../src/config/env.js';
import { initModels, type DatabaseModels } from '../src/database/models/index.js';

describe('CITYVERSE Phase 2 - 3D World Engine & Terrain API Integration Tests', () => {
  let config: EnvConfig;
  let models: DatabaseModels;
  let app: Express;

  beforeAll(async () => {
    config = loadEnv({
      NODE_ENV: 'test',
      DEV_AUTO_ADMIN: 'true',
      DB_DIALECT: process.env.TEST_DB_DIALECT === 'mysql' ? 'mysql' : 'sqlite',
      DB_STORAGE: ':memory:',
      DB_LOGGING: 'false',
      BCRYPT_SALT_ROUNDS: 4,
      AUTH_RATE_LIMIT_WINDOW_MS: 60000,
      AUTH_RATE_LIMIT_MAX_ATTEMPTS: 100,
    });

    const sequelize = createSequelizeInstance(config);
    models = initModels(sequelize);
    await sequelize.sync({ force: true });
    app = createApp(models, config);
  });

  beforeEach(async () => {
    await models.CityChunk.destroy({ where: {} });
    await models.CityEconomy.destroy({ where: {} });
    await models.CityMember.destroy({ where: {} });
    await models.City.destroy({ where: {} });
    await models.Character.destroy({ where: {} });
    await models.RefreshToken.destroy({ where: {} });
    await models.User.destroy({ where: {} });
  });

  afterAll(async () => {
    await models.sequelize.close();
  });

  async function createOwnerAndCity(
    email: string,
    username: string,
    terrainType: 'plains' | 'plain' | 'coastal' | 'highlands' | 'mountain' | 'valley' | 'river' = 'river',
    isPublic = true
  ) {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email,
      username,
      password: 'CityVerse2026',
    });
    const token = reg.body.data.tokens.accessToken as string;

    const cityRes = await request(app)
      .post('/api/v1/cities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `City ${username}`,
        terrainType,
        isPublic,
      });

    return {
      token,
      userId: reg.body.data.user.id as string,
      city: cityRes.body.data as { id: string; worldSeed: string; terrainType: string },
    };
  }

  it('1. World seed tao cung mot terrain (determinism) cho ca 4 archetype: plain, coastal, mountain, river', () => {
    const archetypes: TerrainArchetype[] = ['plain', 'coastal', 'mountain', 'river'];

    for (const archetype of archetypes) {
      const seed = `CV-TEST-${archetype.toUpperCase()}-123456`;
      const first = generateChunkData({
        cityId: 'city-a',
        worldSeed: seed,
        terrainType: archetype,
        chunkX: 1,
        chunkZ: 2,
      });
      const second = generateChunkData({
        cityId: 'city-a',
        worldSeed: seed,
        terrainType: archetype,
        chunkX: 1,
        chunkZ: 2,
      });
      const differentSeed = generateChunkData({
        cityId: 'city-a',
        worldSeed: `${seed}-DIFF`,
        terrainType: archetype,
        chunkX: 1,
        chunkZ: 2,
      });

      expect(first.cornerHeights).toEqual(second.cornerHeights);
      expect(first.cornerNormals).toEqual(second.cornerNormals);
      expect(first.tileBiomes).toEqual(second.tileBiomes);
      expect(first.props).toEqual(second.props);
      expect(first.cornerHeights).not.toEqual(differentSeed.cornerHeights);
    }
  });

  it('2. API metadata terrain & tai chunk theo pham vi khong tai toan bo world cung luc', async () => {
    const { token, city } = await createOwnerAndCity('world1@cityverse.io', 'world_one', 'river');

    // Verify metadata
    const metaRes = await request(app)
      .get(`/api/v1/cities/${city.id}/terrain`)
      .set('Authorization', `Bearer ${token}`);

    expect(metaRes.status).toBe(200);
    expect(metaRes.body.data.mapWidth).toBe(128);
    expect(metaRes.body.data.mapHeight).toBe(128);
    expect(metaRes.body.data.tileSize).toBe(4);
    expect(metaRes.body.data.chunkSize).toBe(32);
    expect(metaRes.body.data.chunksX).toBe(4);
    expect(metaRes.body.data.chunksZ).toBe(4);
    expect(metaRes.body.data.totalChunks).toBe(16);
    expect(metaRes.body.data.terrainArchetype).toBe('river');
    expect(metaRes.body.data.worldBounds).toEqual(getGridWorldBounds(128, 128, 4));

    // Request ONLY 2x2 chunk subset (4 of 16 chunks)
    const rangeRes = await request(app)
      .get(`/api/v1/cities/${city.id}/chunks?minX=0&maxX=1&minZ=0&maxZ=1`)
      .set('Authorization', `Bearer ${token}`);

    expect(rangeRes.status).toBe(200);
    expect(rangeRes.body.data.totalWorldChunks).toBe(16);
    expect(rangeRes.body.data.loadedCount).toBe(4);
    expect(rangeRes.body.data.chunks).toHaveLength(4);
    expect(rangeRes.body.data.loadedCount).toBeLessThan(rangeRes.body.data.totalWorldChunks);

    // Every chunk has 33x33 corner heights and 32x32 tiles
    for (const chunk of rangeRes.body.data.chunks as ChunkDataDTO[]) {
      expect(chunk.cornerHeights).toHaveLength(33 * 33);
      expect(chunk.cornerNormals).toHaveLength(33 * 33 * 3);
      expect(chunk.tileBiomes).toHaveLength(32 * 32);
      expect(chunk.revision).toBeGreaterThanOrEqual(1);
    }
  });

  it('3. Luu delta dia hinh, tang revision, khong phat sinh seam giua 2 chunk va reload giu du lieu', async () => {
    const { token, city } = await createOwnerAndCity('world2@cityverse.io', 'world_two', 'plain');

    // Load chunks (0,0) and (1,0) before modification
    const beforeRes = await request(app)
      .get(`/api/v1/cities/${city.id}/chunks?minX=0&maxX=1&minZ=0&maxZ=0`)
      .set('Authorization', `Bearer ${token}`);
    expect(beforeRes.status).toBe(200);
    const beforeLeft = (beforeRes.body.data.chunks as ChunkDataDTO[]).find(
      (c) => c.chunkX === 0 && c.chunkZ === 0
    )!;
    const beforeRight = (beforeRes.body.data.chunks as ChunkDataDTO[]).find(
      (c) => c.chunkX === 1 && c.chunkZ === 0
    )!;

    // Verify ZERO seam along shared edge vx=32 (left) vs vx=0 (right) before delta
    const verts = WORLD_CONFIG.CHUNK_SIZE + 1;
    for (let vz = 0; vz < verts; vz += 1) {
      expect(beforeLeft.cornerHeights[vz * verts + 32]).toBe(
        beforeRight.cornerHeights[vz * verts + 0]
      );
      expect(beforeLeft.cornerNormals[(vz * verts + 32) * 3]).toBe(
        beforeRight.cornerNormals[(vz * verts + 0) * 3]
      );
    }

    const oldTileHeight = beforeLeft.tileHeights[10 * 32 + 31];

    // Modify border tile gx=31, gz=10 (touches seam between chunk (0,0) and chunk (1,0))
    const deltaRes = await request(app)
      .post(`/api/v1/cities/${city.id}/terrain/delta`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        tiles: [
          { gx: 31, gz: 10, heightDelta: 4.0, clearProps: true },
          { gx: 32, gz: 10, heightDelta: 4.0, clearProps: true },
        ],
      });

    expect(deltaRes.status).toBe(200);
    expect(deltaRes.body.data.appliedTiles).toBe(2);

    // Simulate page reload: fresh GET /chunks from DB
    const reloadRes = await request(app)
      .get(`/api/v1/cities/${city.id}/chunks?minX=0&maxX=1&minZ=0&maxZ=0`)
      .set('Authorization', `Bearer ${token}`);
    expect(reloadRes.status).toBe(200);

    const reloadedLeft = (reloadRes.body.data.chunks as ChunkDataDTO[]).find(
      (c) => c.chunkX === 0 && c.chunkZ === 0
    )!;
    const reloadedRight = (reloadRes.body.data.chunks as ChunkDataDTO[]).find(
      (c) => c.chunkX === 1 && c.chunkZ === 0
    )!;

    // Revision bumped & persisted terrain elevation changed
    expect(reloadedLeft.revision).toBe(beforeLeft.revision + 1);
    expect(reloadedRight.revision).toBe(beforeRight.revision + 1);
    expect(reloadedLeft.tileHeights[10 * 32 + 31]).toBeGreaterThan(oldTileHeight + 1.0);
    expect(reloadedLeft.delta.tiles['31,10']?.heightDelta).toBe(4);
    expect(reloadedRight.delta.tiles['0,10']?.heightDelta).toBe(4);

    // Verify ZERO seam along shared edge AFTER border delta modification!
    for (let vz = 0; vz < verts; vz += 1) {
      expect(reloadedLeft.cornerHeights[vz * verts + 32]).toBe(
        reloadedRight.cornerHeights[vz * verts + 0]
      );
      expect(reloadedLeft.cornerNormals[(vz * verts + 32) * 3 + 1]).toBe(
        reloadedRight.cornerNormals[(vz * verts + 0) * 3 + 1]
      );
    }

    // Verify reset from world_seed restores base height
    const resetRes = await request(app)
      .post(`/api/v1/cities/${city.id}/terrain/seed`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        resetDeltas: true,
        chunks: [
          { cx: 0, cz: 0 },
          { cx: 1, cz: 0 },
        ],
      });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.data.resetDeltas).toBe(true);

    const afterResetRes = await request(app)
      .get(`/api/v1/cities/${city.id}/chunks?minX=0&maxX=0&minZ=0&maxZ=0`)
      .set('Authorization', `Bearer ${token}`);
    const resetLeft = afterResetRes.body.data.chunks[0] as ChunkDataDTO;
    expect(resetLeft.tileHeights[10 * 32 + 31]).toBe(oldTileHeight);
  });

  it('4. Phan quyen terrain: visitor khong duoc sua delta (403) va thanh pho rieng tu chan doc chunk (403)', async () => {
    const owner = await createOwnerAndCity('owner_w@cityverse.io', 'owner_world', 'mountain', true);
    const visitorReg = await request(app).post('/api/v1/auth/register').send({
      email: 'visitor_w@cityverse.io',
      username: 'visitor_world',
      password: 'CityVerse2026',
    });
    const visitorToken = visitorReg.body.data.tokens.accessToken as string;

    // Visitor CAN read public city chunks
    const readRes = await request(app)
      .get(`/api/v1/cities/${owner.city.id}/chunks?cx=1&cz=1&radius=0`)
      .set('Authorization', `Bearer ${visitorToken}`);
    expect(readRes.status).toBe(200);
    expect(readRes.body.data.loadedCount).toBe(1);

    // Visitor CANNOT mutate terrain delta
    const editRes = await request(app)
      .post(`/api/v1/cities/${owner.city.id}/terrain/delta`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .send({ tiles: [{ gx: 10, gz: 10, heightDelta: 2 }] });
    expect(editRes.status).toBe(403);
    expect(editRes.body.error.code).toBe('TERRAIN_EDIT_FORBIDDEN');

    // Private city blocks unauthorized chunk read
    const privateOwner = await createOwnerAndCity(
      'priv_w@cityverse.io',
      'priv_world',
      'coastal',
      false
    );
    const blockedRes = await request(app)
      .get(`/api/v1/cities/${privateOwner.city.id}/chunks?cx=1&cz=1&radius=0`)
      .set('Authorization', `Bearer ${visitorToken}`);
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.code).toBe('CITY_ACCESS_DENIED');
  });

  it('5. Che do vao nhanh Admin (/auth/dev-admin) tu tao tai khoan admin, nhan vat, thanh pho va vao thang 3D world', async () => {
    const devRes = await request(app).post('/api/v1/auth/dev-admin');
    expect(devRes.status).toBe(200);
    expect(devRes.body.data.user.username).toBe('admin');
    expect(devRes.body.data.character).not.toBeNull();
    expect(devRes.body.data.city).not.toBeNull();
    expect(devRes.body.data.tokens.accessToken).toBeTruthy();

    const adminToken = devRes.body.data.tokens.accessToken as string;
    const adminCityId = devRes.body.data.city.id as string;

    const metaRes = await request(app)
      .get(`/api/v1/cities/${adminCityId}/terrain`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(metaRes.status).toBe(200);
    expect(metaRes.body.data.mapWidth).toBe(128);
    expect(metaRes.body.data.totalChunks).toBe(16);
  });
});
