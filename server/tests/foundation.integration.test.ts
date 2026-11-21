import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { CITY_CONFIG } from '@cityverse/shared';
import { createApp } from '../src/app.js';
import { createSequelizeInstance } from '../src/config/database.js';
import { loadEnv, type EnvConfig } from '../src/config/env.js';
import { initModels, type DatabaseModels } from '../src/database/models/index.js';
import { signAccessToken } from '../src/utils/jwt.js';

describe('CITYVERSE Phase 1 - Foundation API Integration Tests', () => {
  let config: EnvConfig;
  let models: DatabaseModels;
  let app: Express;

  beforeAll(async () => {
    config = loadEnv({
      NODE_ENV: 'test',
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

  async function registerUser(email: string, username: string, password = 'CityVerse2026') {
    return request(app).post('/api/v1/auth/register').send({ email, username, password });
  }

  it('1. Dang ky thanh cong, hash mat khau, va tu choi dang ky trung email (409)', async () => {
    const firstRes = await registerUser('mayor1@cityverse.io', 'mayor_one');
    expect(firstRes.status).toBe(201);
    expect(firstRes.body.success).toBe(true);
    expect(firstRes.body.data.tokens.accessToken).toBeTruthy();
    expect(firstRes.body.data.tokens.refreshToken).toBeTruthy();

    // Verify password is stored hashed, not plaintext
    const savedUser = await models.User.findOne({ where: { email: 'mayor1@cityverse.io' } });
    expect(savedUser).not.toBeNull();
    expect(savedUser?.passwordHash).not.toBe('CityVerse2026');
    expect(savedUser?.passwordHash.startsWith('$2')).toBe(true);

    // Duplicate email must fail with 409
    const duplicateRes = await registerUser('MAYOR1@cityverse.io', 'mayor_two');
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.success).toBe(false);
    expect(duplicateRes.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('2. Dang nhap sai mat khau tra ve 401 Unauthorized', async () => {
    await registerUser('mayor2@cityverse.io', 'mayor_two');

    const badLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'mayor2@cityverse.io',
      password: 'WrongPassword99',
    });

    expect(badLogin.status).toBe(401);
    expect(badLogin.body.success).toBe(false);
    expect(badLogin.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('3. Access token het han tra ve 401 va Refresh Token Rotation hoat dong chinh xac', async () => {
    const reg = await registerUser('mayor3@cityverse.io', 'mayor_three');
    const user = reg.body.data.user;
    const oldRefreshToken = reg.body.data.tokens.refreshToken as string;

    // Issue an already-expired access token (-5s)
    const expiredAccessToken = signAccessToken(
      { sub: user.id, email: user.email, username: user.username },
      config,
      '-5s'
    );

    const expiredRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredAccessToken}`);

    expect(expiredRes.status).toBe(401);
    expect(expiredRes.body.error.code).toBe('TOKEN_EXPIRED');

    // Rotate refresh token
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken });

    expect(refreshRes.status).toBe(200);
    const newAccessToken = refreshRes.body.data.tokens.accessToken as string;
    const newRefreshToken = refreshRes.body.data.tokens.refreshToken as string;
    expect(newRefreshToken).not.toBe(oldRefreshToken);

    // New access token works
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${newAccessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe('mayor3@cityverse.io');

    // Reusing old refresh token triggers reuse detection & revokes the whole family
    const replayRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken });
    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // Consequently, the rotated token in the same family is also revoked
    const revokedFamilyRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: newRefreshToken });
    expect(revokedFamilyRes.status).toBe(401);
  });

  it('4. Tao nhan vat & tao thanh pho (128x128, 250000 coins, owner), chan tao thanh pho lan thu 2', async () => {
    const reg = await registerUser('mayor4@cityverse.io', 'mayor_four');
    const token = reg.body.data.tokens.accessToken as string;

    // Create character
    const charRes = await request(app)
      .post('/api/v1/characters')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Alex Horizon',
        presetId: 'urban-architect',
      });

    expect(charRes.status).toBe(201);
    expect(charRes.body.data.name).toBe('Alex Horizon');
    expect(charRes.body.data.appearance.modelKey).toBe('character_architect_v1');

    // Cannot create second character
    const secondCharRes = await request(app)
      .post('/api/v1/characters')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Duplicate Char',
        presetId: 'visionary-mayor',
      });
    expect(secondCharRes.status).toBe(409);
    expect(secondCharRes.body.error.code).toBe('CHARACTER_ALREADY_EXISTS');

    // Create city (atomic transaction: city + city_economies + city_members owner)
    const cityRes = await request(app)
      .post('/api/v1/cities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Neo Saigon',
        terrainType: 'coastal',
        isPublic: true,
      });

    expect(cityRes.status).toBe(201);
    const createdCity = cityRes.body.data;
    expect(createdCity.name).toBe('Neo Saigon');
    expect(createdCity.mapWidth).toBe(CITY_CONFIG.MAP_WIDTH);
    expect(createdCity.mapHeight).toBe(CITY_CONFIG.MAP_HEIGHT);
    expect(createdCity.worldSeed).toMatch(/^CV-COA-/);
    expect(createdCity.role).toBe('owner');
    expect(createdCity.economy.cityCoins).toBe(CITY_CONFIG.INITIAL_COINS);
    expect(createdCity.economy.population).toBe(0);

    // Verify all 3 tables were created consistently in DB
    const dbMember = await models.CityMember.findOne({
      where: { cityId: createdCity.id, userId: reg.body.data.user.id },
    });
    expect(dbMember?.role).toBe('owner');

    const dbEconomy = await models.CityEconomy.findOne({ where: { cityId: createdCity.id } });
    expect(Number(dbEconomy?.cityCoins)).toBe(250000);

    // Attempt to create a second city -> MUST fail with 409
    const secondCityRes = await request(app)
      .post('/api/v1/cities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Second City',
        terrainType: 'plains',
      });

    expect(secondCityRes.status).toBe(409);
    expect(secondCityRes.body.error.code).toBe('CITY_ALREADY_EXISTS');

    // Dashboard returns full persisted state
    const dashRes = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.character.name).toBe('Alex Horizon');
    expect(dashRes.body.data.city.name).toBe('Neo Saigon');
    expect(dashRes.body.data.city.economy.cityCoins).toBe(250000);
    expect(dashRes.body.data.onboarding.isReadyToPlay).toBe(true);
  });

  it('5. Kiem tra phan quyen: chua dang nhap (401), thanh pho rieng tu (403), thanh pho khong ton tai (404)', async () => {
    // No token -> 401
    const unauthRes = await request(app).get('/api/v1/dashboard');
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body.error.code).toBe('MISSING_TOKEN');

    // User A creates a private city
    const userA = await registerUser('owner@cityverse.io', 'city_owner');
    const tokenA = userA.body.data.tokens.accessToken as string;

    const privateCityRes = await request(app)
      .post('/api/v1/cities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Secret Citadel',
        terrainType: 'highlands',
        isPublic: false,
      });
    const privateCityId = privateCityRes.body.data.id as string;

    // User B tries to enter User A's private city -> 403 Forbidden
    const userB = await registerUser('intruder@cityverse.io', 'city_visitor');
    const tokenB = userB.body.data.tokens.accessToken as string;

    const forbiddenRes = await request(app)
      .get(`/api/v1/cities/${privateCityId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error.code).toBe('CITY_ACCESS_DENIED');

    // Non-existent city -> 404 Not Found
    const missingCityId = crypto.randomUUID();
    const notFoundRes = await request(app)
      .get(`/api/v1/cities/${missingCityId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.error.code).toBe('CITY_NOT_FOUND');
  });

  it('6. Rate limit login chan request khi vuot nguong (429)', async () => {
    const strictConfig = loadEnv({
      NODE_ENV: 'test',
      DB_DIALECT: 'sqlite',
      DB_STORAGE: ':memory:',
      BCRYPT_SALT_ROUNDS: 4,
      AUTH_RATE_LIMIT_WINDOW_MS: 60000,
      AUTH_RATE_LIMIT_MAX_ATTEMPTS: 3,
    });
    const strictApp = createApp(models, strictConfig);

    for (let i = 0; i < 3; i += 1) {
      const attempt = await request(strictApp)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@cityverse.io', password: 'WrongPassword1' });
      expect(attempt.status).toBe(401);
    }

    const blocked = await request(strictApp)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@cityverse.io', password: 'WrongPassword1' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
