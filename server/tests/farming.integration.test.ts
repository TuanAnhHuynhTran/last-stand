import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import {
  STARTING_MATERIALS,
  WorldGenerator,
  cropStageAt,
  cropProgress,
  farmCreateCost,
  farmExpandCost,
  farmUpgradeCost,
  getConnectedHexes,
  getCropDefinition,
  getFarmZoneLevel,
  hexDistance,
  hexKey,
  hexNeighbors,
  type AxialCoord,
  type FarmZoneDTO,
} from '@cityverse/shared';
import { createApp } from '../src/app.js';
import { createSequelizeInstance } from '../src/config/database.js';
import { loadEnv, type EnvConfig } from '../src/config/env.js';
import { initModels, type DatabaseModels } from '../src/database/models/index.js';

describe('Phase 4 – Agriculture & irrigation API', () => {
  let config: EnvConfig;
  let models: DatabaseModels;
  let app: Express;
  let nowMs = Date.UTC(2026, 10, 21, 9, 0, 0);
  const advance = (seconds: number) => {
    nowMs += seconds * 1000;
  };

  beforeAll(async () => {
    config = loadEnv({
      NODE_ENV: 'test',
      DB_DIALECT: process.env.TEST_DB_DIALECT === 'mysql' ? 'mysql' : 'sqlite',
      DB_STORAGE: ':memory:',
      DB_LOGGING: 'false',
      BCRYPT_SALT_ROUNDS: 4,
      AUTH_RATE_LIMIT_WINDOW_MS: 60000,
      AUTH_RATE_LIMIT_MAX_ATTEMPTS: 1000,
    });
    const sequelize = createSequelizeInstance(config);
    models = initModels(sequelize);
    await sequelize.sync({ force: true });
    app = createApp(models, config, { now: () => new Date(nowMs) });
  });

  beforeEach(async () => {
    for (const m of [
      models.CropCycle,
      models.IrrigationNetwork,
      models.FarmZoneTile,
      models.FarmZone,
      models.BuildingConstructionJob,
      models.BuildingFootprint,
      models.WorldBuilding,
      models.CityResource,
      models.CityChunk,
      models.CityEconomy,
      models.CityMember,
      models.City,
      models.Character,
      models.RefreshToken,
      models.User,
    ]) {
      await (m as unknown as { destroy: (o: object) => Promise<number> }).destroy({ where: {} });
    }
  });

  afterAll(async () => {
    await models.sequelize.close();
  });

  async function setup(name = 'farmer') {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: `${name}@lasthaven.io`, username: name, password: 'LastHaven2026' });
    const token = reg.body.data.tokens.accessToken as string;
    const cityRes = await request(app)
      .post('/api/v1/cities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Haven ${name}`, terrainType: 'plains', isPublic: true });
    const city = cityRes.body.data as { id: string; worldSeed: string };
    const world = new WorldGenerator(city.worldSeed);
    const farmable = (h: AxialCoord) => world.isOwned(h.q, h.r) && world.getHexTile(h.q, h.r).buildable;
    const region = (n: number, start: AxialCoord = world.spawn) => getConnectedHexes({ q: start.q, r: start.r }, farmable, n);
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const base = `/api/v1/cities/${city.id}/farms`;
    return { city, world, farmable, region, auth, base };
  }

  it('serves the crop catalogue from crop_types and starts with no zones', async () => {
    const { auth, base } = await setup();
    const state = await auth(request(app).get(base));
    expect(state.status).toBe(200);
    expect(state.body.data.zones).toEqual([]);
    expect(state.body.data.produce).toEqual({ rice: 0, corn: 0, vegetables: 0, fruit: 0, hay: 0 });

    const cat = await auth(request(app).get('/api/v1/farms/catalog'));
    expect(cat.status).toBe(200);
    expect(cat.body.data.zoneTypes).toHaveLength(5);
    const rice = cat.body.data.crops.find((c: { code: string }) => c.code === 'rice');
    expect(rice.stages.map((s: { key: string }) => s.key)).toEqual(['seeded', 'seedling', 'growing', 'ripe']);
    expect(await models.CropType.count()).toBe(6);
  });

  it('rejects zones under 6 hexes and disconnected zones; accepts 6 connected hexes and charges the cost', async () => {
    const { auth, base, region, farmable, world } = await setup();
    const five = await auth(request(app).post(base)).send({ zoneType: 'rice_paddy', hexes: region(5) });
    expect(five.status).toBe(400);
    expect(five.body.error.code).toBe('INVALID_FARM_ZONE');
    expect(five.body.error.details.issues).toContain('TOO_SMALL');

    const a = region(3);
    const ok2 = (h: AxialCoord) => farmable(h) && a.every((x) => hexDistance(x, h) >= 2);
    const start = world.getStarterTerritory().find((h) => ok2(h) && a.every((x) => hexDistance(x, h) >= 4))!;
    const far = getConnectedHexes(start, ok2, 3);
    expect(far).toHaveLength(3);
    const split = await auth(request(app).post(base)).send({ zoneType: 'rice_paddy', hexes: [...a, ...far] });
    expect(split.status).toBe(400);
    expect(split.body.error.details.issues).toContain('DISCONNECTED');
    expect(await models.FarmZone.count()).toBe(0);

    const hexes = region(6);
    const ok = await auth(request(app).post(base)).send({ zoneType: 'rice_paddy', hexes });
    expect(ok.status).toBe(201);
    const zone = ok.body.data.zone as FarmZoneDTO;
    expect(zone).toMatchObject({ zoneType: 'rice_paddy', level: 1, status: 'active', crop: null });
    expect(zone.hexes).toHaveLength(6);
    expect(zone.irrigation.kind).toBe('none');
    const cost = farmCreateCost('rice_paddy', 6);
    expect(ok.body.data.resources).toEqual({
      coins: 250000 - cost.coins,
      wood: STARTING_MATERIALS.wood - cost.wood,
      stone: STARTING_MATERIALS.stone - cost.stone,
    });
    expect(await models.FarmZoneTile.count()).toBe(6);
    expect(await models.IrrigationNetwork.count()).toBe(1);
  });

  it('zones never overlap each other or buildings', async () => {
    const { auth, base, region, city, world } = await setup();
    const hexes = region(6);
    expect((await auth(request(app).post(base)).send({ zoneType: 'corn_field', hexes })).status).toBe(201);
    const overlap = await auth(request(app).post(base)).send({ zoneType: 'pasture', hexes: region(8) });
    expect(overlap.status).toBe(400);
    expect(overlap.body.error.details.issues).toContain('FARMLAND');

    // A building on farmland is rejected …
    const house = await auth(request(app).post(`/api/v1/cities/${city.id}/buildings`)).send({
      typeCode: 'house',
      q: hexes[0].q,
      r: hexes[0].r,
    });
    expect(house.status).toBe(400);
    expect(house.body.error.details.issues).toEqual(['FARMLAND']);

    // … and a zone over a building is rejected.
    const keys = new Set(hexes.map((h) => hexKey(h.q, h.r)));
    const free = world.getStarterTerritory().find(
      (h) => world.getHexTile(h.q, h.r).buildable && hexes.every((x) => hexDistance(x, h) >= 4)
    )!;
    const placed = await auth(request(app).post(`/api/v1/cities/${city.id}/buildings`)).send({ typeCode: 'house', q: free.q, r: free.r });
    expect(placed.status).toBe(201);
    const around = getConnectedHexes(free, (h) => world.isOwned(h.q, h.r) && world.getHexTile(h.q, h.r).buildable && !keys.has(hexKey(h.q, h.r)), 7);
    const onHouse = await auth(request(app).post(base)).send({ zoneType: 'pasture', hexes: around });
    expect(onHouse.status).toBe(400);
    expect(onHouse.body.error.details.issues).toContain('OCCUPIED');
  });

  it('plants rice, grows through 4 stages on the backend clock, and harvests into produce', async () => {
    const { auth, base, region } = await setup();
    const created = await auth(request(app).post(base)).send({ zoneType: 'rice_paddy', hexes: region(6) });
    const id = created.body.data.zone.id as string;

    expect((await auth(request(app).post(`${base}/${id}/harvest`))).body.error.code).toBe('NO_CROP');
    const wrong = await auth(request(app).post(`${base}/${id}/plant`)).send({ cropCode: 'corn' });
    expect(wrong.body.error.code).toBe('CROP_NOT_ALLOWED');

    const planted = await auth(request(app).post(`${base}/${id}/plant`)).send({ cropCode: 'rice' });
    expect(planted.status).toBe(200);
    const crop = planted.body.data.zone.crop;
    expect(crop).toMatchObject({ cropCode: 'rice', status: 'growing' });
    expect(crop.expectedYield).toBeGreaterThan(0);
    expect((await auth(request(app).post(`${base}/${id}/plant`)).send({})).body.error.code).toBe('FARM_ZONE_HAS_CROP');

    const rice = getCropDefinition('rice');
    const planted0 = new Date(crop.plantedAt).getTime();
    const ready = new Date(crop.readyAt).getTime();
    const seen: string[] = [];
    for (const f of [0, 0.3, 0.7, 1]) {
      nowMs = planted0 + (ready - planted0) * f;
      const state = await auth(request(app).get(base));
      const c = state.body.data.zones[0].crop;
      seen.push(cropStageAt(rice, cropProgress(new Date(c.plantedAt).getTime(), new Date(c.readyAt).getTime(), new Date(state.body.data.serverTime).getTime())).key);
      if (f < 1) {
        const early = await auth(request(app).post(`${base}/${id}/harvest`));
        expect(early.status).toBe(409);
        expect(early.body.error.code).toBe('CROP_NOT_READY');
      }
    }
    expect(seen).toEqual(['seeded', 'seedling', 'growing', 'ripe']);

    const harvested = await auth(request(app).post(`${base}/${id}/harvest`));
    expect(harvested.status).toBe(200);
    expect(harvested.body.data.harvested).toBe(crop.expectedYield);
    expect(harvested.body.data.produce.rice).toBe(crop.expectedYield);
    expect(harvested.body.data.zone.crop).toBeNull();
    expect(harvested.body.data.zone.totalHarvested).toBe(crop.expectedYield);
    expect(await models.CropCycle.count({ where: { status: 'harvested' } })).toBe(1);
  });

  it('upgrades 1 → 2 → 3 (timed, same id and hexes); irrigation improves; refresh keeps the level', async () => {
    const { auth, base, region } = await setup();
    const hexes = region(6);
    const created = await auth(request(app).post(base)).send({ zoneType: 'rice_paddy', hexes });
    const id = created.body.data.zone.id as string;
    let supply = created.body.data.zone.irrigation.supply as number;

    for (const target of [2, 3]) {
      const before = (await auth(request(app).get(base))).body.data.resources;
      const up = await auth(request(app).post(`${base}/${id}/upgrade`));
      expect(up.status).toBe(200);
      expect(up.body.data.zone).toMatchObject({ id, status: 'upgrading', level: target - 1 });
      expect(up.body.data.resources.coins).toBe(before.coins - farmUpgradeCost('rice_paddy', target, 6)!.coins);
      expect((await auth(request(app).post(`${base}/${id}/upgrade`))).body.error.code).toBe('FARM_ZONE_BUSY');

      advance(getFarmZoneLevel('rice_paddy', target)!.upgradeSeconds);
      const state = await auth(request(app).get(base));
      const z = state.body.data.zones[0] as FarmZoneDTO;
      expect(z).toMatchObject({ id, level: target, status: 'active' });
      expect(z.hexes).toHaveLength(6);
      expect(z.irrigation.kind).toBe(target === 2 ? 'canal' : 'pump');
      expect(z.irrigation.supply).toBeGreaterThan(supply);
      supply = z.irrigation.supply;
    }
    expect((await auth(request(app).post(`${base}/${id}/upgrade`))).body.error.code).toBe('MAX_LEVEL_REACHED');

    const fresh = createApp(models, config, { now: () => new Date(nowMs) });
    const reloaded = await auth(request(fresh).get(base));
    expect(reloaded.body.data.zones[0]).toMatchObject({ id, level: 3 });
  });

  it('expansion is separate from upgrading: adds connected hexes, keeps the level, rejects gaps', async () => {
    const { auth, base, region, farmable, world } = await setup();
    const hexes = region(6);
    const created = await auth(request(app).post(base)).send({ zoneType: 'vegetable_garden', hexes });
    const id = created.body.data.zone.id as string;
    const keys = new Set(hexes.map((h) => hexKey(h.q, h.r)));
    const extra = hexes
      .flatMap((h) => hexNeighbors(h))
      .filter((n, i, arr) => farmable(n) && !keys.has(hexKey(n.q, n.r)) && arr.findIndex((m) => m.q === n.q && m.r === n.r) === i)
      .slice(0, 2);

    // Not while a crop is growing.
    await auth(request(app).post(`${base}/${id}/plant`)).send({ cropCode: 'carrot' });
    expect((await auth(request(app).post(`${base}/${id}/expand`)).send({ hexes: extra })).body.error.code).toBe('FARM_ZONE_HAS_CROP');
    advance(600);
    await auth(request(app).post(`${base}/${id}/harvest`));

    const before = (await auth(request(app).get(base))).body.data.resources.coins as number;
    const ok = await auth(request(app).post(`${base}/${id}/expand`)).send({ hexes: extra });
    expect(ok.status).toBe(200);
    expect(ok.body.data.zone).toMatchObject({ id, level: 1 });
    expect(ok.body.data.zone.hexes).toHaveLength(8);
    expect(ok.body.data.resources.coins).toBe(before - farmExpandCost('vegetable_garden', 1, 2).coins);

    const gap = world.getStarterTerritory().find((h) => farmable(h) && [...hexes, ...extra].every((x) => hexDistance(x, h) >= 3))!;
    const bad = await auth(request(app).post(`${base}/${id}/expand`)).send({ hexes: [gap] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.issues).toContain('DISCONNECTED');
    expect(await models.FarmZoneTile.count()).toBe(8);
  });

  it('refuses upgrades without resources and removes zones with a partial refund', async () => {
    const { auth, base, region, city } = await setup();
    const created = await auth(request(app).post(base)).send({ zoneType: 'orchard', hexes: region(6) });
    const id = created.body.data.zone.id as string;
    await models.CityResource.update({ amount: 0 }, { where: { cityId: city.id, resourceCode: 'stone' } });
    const up = await auth(request(app).post(`${base}/${id}/upgrade`));
    expect(up.status).toBe(400);
    expect(up.body.error.code).toBe('INSUFFICIENT_RESOURCES');
    expect((await auth(request(app).get(base))).body.data.zones[0]).toMatchObject({ level: 1, status: 'active' });

    const before = (await auth(request(app).get(base))).body.data.resources.coins as number;
    const del = await auth(request(app).delete(`${base}/${id}`));
    expect(del.status).toBe(200);
    expect(del.body.data.resources.coins).toBe(before + Math.floor(farmCreateCost('orchard', 6).coins * 0.5));
    expect(await models.FarmZoneTile.count()).toBe(0);
    expect(await models.IrrigationNetwork.count()).toBe(0);
  });
});
