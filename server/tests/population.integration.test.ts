import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import {
  WorldGenerator,
  getBuildingDefinition,
  getBuildingLevel,
  getConnectedHexes,
  type AxialCoord,
  type BuildingTypeCode,
  type PopulationStateDTO,
} from '@cityverse/shared';
import { createApp } from '../src/app.js';
import { createSequelizeInstance } from '../src/config/database.js';
import { loadEnv, type EnvConfig } from '../src/config/env.js';
import { initModels, type DatabaseModels } from '../src/database/models/index.js';

const DAY = 720;
const HOUR = DAY / 24;

describe('Phase 7 – Villagers & economy API', () => {
  let config: EnvConfig;
  let models: DatabaseModels;
  let app: Express;
  let nowMs = Date.UTC(2026, 10, 23, 8, 0, 0);
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
    const order = [
      'ResourceTransaction', 'ProductionJob', 'SurvivorJob', 'SurvivorHousing', 'Survivor', 'WorldTimeState',
      'WaterQualityRecord', 'FishStockBatch', 'AquacultureCycle', 'WaterBodyTile', 'WaterBody',
      'LivestockProductionJob', 'FarmAnimal', 'LivestockFarmTile', 'LivestockFarm',
      'CropCycle', 'IrrigationNetwork', 'FarmZoneTile', 'FarmZone',
      'BuildingConstructionJob', 'BuildingFootprint', 'WorldBuilding', 'CityResource', 'CityChunk', 'CityEconomy', 'CityMember', 'City', 'Character', 'RefreshToken', 'User',
    ] as const;
    for (const name of order) await (models[name] as unknown as { destroy: (o: object) => Promise<number> }).destroy({ where: {} });
  });

  afterAll(async () => {
    await models.sequelize.close();
  });

  async function register(name: string) {
    const reg = await request(app).post('/api/v1/auth/register').send({ email: `${name}@lasthaven.io`, username: name, password: 'LastHaven2026' });
    return reg.body.data.tokens.accessToken as string;
  }

  async function setup(name = 'mayor') {
    const token = await register(name);
    const cityRes = await request(app).post('/api/v1/cities').set('Authorization', `Bearer ${token}`).send({ name: `Haven ${name}`, terrainType: 'plains', isPublic: true });
    const city = cityRes.body.data as { id: string; worldSeed: string };
    const world = new WorldGenerator(city.worldSeed);
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const base = `/api/v1/cities/${city.id}/population`;
    const territory = world.getStarterTerritory().filter((h) => world.getHexTile(h.q, h.r).buildable);
    let cursor = 0;
    /** Places a building on the first free spot and (optionally) waits for it to finish. */
    const build = async (typeCode: BuildingTypeCode, finish = true) => {
      for (; cursor < territory.length; cursor += 1) {
        const h = territory[cursor];
        const res = await auth(request(app).post(`/api/v1/cities/${city.id}/buildings`)).send({ typeCode, q: h.q, r: h.r });
        if (res.status === 201) {
          cursor += 1;
          if (finish) advance(getBuildingDefinition(typeCode).levels[0].buildSeconds + 1);
          return res.body.data.building as { id: string };
        }
      }
      throw new Error(`no room for ${typeCode}`);
    };
    const upgrade = async (id: string, type: BuildingTypeCode, level: number) => {
      const res = await auth(request(app).post(`/api/v1/cities/${city.id}/buildings/${id}/upgrade`));
      expect(res.status).toBe(200);
      advance(getBuildingLevel(type, level)!.buildSeconds + 1);
    };
    const give = async (code: string, amount: number) => {
      const row = await models.CityResource.findOne({ where: { cityId: city.id, resourceCode: code } });
      if (row) await row.update({ amount });
      else await models.CityResource.create({ cityId: city.id, resourceCode: code, amount });
    };
    const stock = async (code: string) => (await models.CityResource.findOne({ where: { cityId: city.id, resourceCode: code } }))?.amount ?? 0;
    const state = async () => (await auth(request(app).get(base))).body.data as PopulationStateDTO;
    return { token, city, world, auth, base, build, upgrade, give, stock, state };
  }

  it('starts with 5 survivors; houses hold 4 / 6 / 10 by level; building does not add people by itself', async () => {
    const { state, build, upgrade } = await setup();
    const s0 = await state();
    expect(s0.survivors).toHaveLength(5);
    expect(s0.survivors.every((s) => s.homeId === null)).toBe(true);
    expect(s0.warnings.map((w) => w.code)).toContain('HOMELESS');
    expect(await models.Survivor.count()).toBe(5);

    const house = await build('house');
    let s = await state();
    expect(s.houses[0]).toMatchObject({ capacity: 4, ready: true });
    expect(s.houses[0].residents).toHaveLength(4);
    expect(s.survivors.filter((x) => x.homeId === house.id)).toHaveLength(4);
    expect(s.survivors).toHaveLength(5); // capacity ≠ population
    await upgrade(house.id, 'house', 2);
    s = await state();
    expect(s.houses[0]).toMatchObject({ level: 2, capacity: 6 });
    expect(s.houses[0].residents).toHaveLength(5);
    await upgrade(house.id, 'house', 3);
    s = await state();
    expect(s.houses[0].capacity).toBe(10);
    expect(s.housingCapacity).toBe(10);
  });

  it('every survivor has exactly one main home; moving replaces it', async () => {
    const { state, build, auth, base } = await setup();
    const a = await build('house');
    const b = await build('house');
    const s = await state();
    const someone = s.survivors[0];
    const target = someone.homeId === a.id ? b.id : a.id;
    const moved = await auth(request(app).post(`${base}/survivors/${someone.id}/home`)).send({ buildingId: target });
    expect(moved.status).toBe(200);
    expect(await models.SurvivorHousing.count({ where: { survivorId: someone.id } })).toBe(1);
    expect(moved.body.data.state.survivors.find((x: { id: string }) => x.id === someone.id).homeId).toBe(target);
    // The database refuses a second home row.
    const row = (await models.Survivor.findByPk(someone.id))!;
    await expect(models.SurvivorHousing.create({ cityId: row.cityId, survivorId: someone.id, buildingId: a.id, movedInAt: new Date() })).rejects.toThrow();

  });

  it('assignments never overlap: one full-time job per survivor, slots respected, unfinished workplaces refused', async () => {
    const { state, build, auth, base } = await setup();
    // Manual control first (auto-assignment would fill the new workplaces).
    await auth(request(app).patch(`${base}/settings`)).send({ autoAssign: false });
    await build('house');
    const carp = await build('carpentry');
    const quarry = await build('quarry');
    const unfinished = await build('smithy', false);
    const [s1, s2, s3] = (await state()).survivors;
    const assign = (sid: string, id: string) => auth(request(app).post(`${base}/assign`)).send({ survivorId: sid, kind: 'building', workplaceId: id });
    expect((await assign(s1.id, carp.id)).status).toBe(200);
    expect((await assign(s1.id, quarry.id)).status).toBe(200);
    expect(await models.SurvivorJob.count({ where: { survivorId: s1.id } })).toBe(1);
    expect((await state()).survivors.find((x) => x.id === s1.id)).toMatchObject({ profession: 'mason', job: { kind: 'building', id: quarry.id } });
    expect((await assign(s2.id, carp.id)).status).toBe(200);
    expect((await assign(s3.id, carp.id)).status).toBe(200);
    const [, , , s4] = (await state()).survivors;
    expect((await assign(s4.id, carp.id)).body.error.code).toBe('WORKPLACE_FULL'); // L1 carpentry: 2 slots
    expect((await assign(s4.id, unfinished.id)).body.error.code).toBe('WORKPLACE_NOT_READY');
    expect(await models.SurvivorJob.count()).toBe(3);
    const ids = (await models.SurvivorJob.findAll()).map((j) => j.survivorId);
    expect(new Set(ids).size).toBe(ids.length);
    // Unassign → auto-assign leaves them alone; explicit auto-assign fills slots.
    expect((await auth(request(app).delete(`${base}/assign/${s2.id}`))).status).toBe(200);
    await auth(request(app).patch(`${base}/settings`)).send({ autoAssign: true });
    expect((await state()).survivors.find((x) => x.id === s2.id)!.job).toBeNull();
    const auto = await auth(request(app).post(`${base}/auto-assign`));
    expect(auto.body.data.state.survivors.filter((x: { job: unknown }) => x.job).length).toBeGreaterThan(3);
  });

  it('production follows recipes and work hours; missing inputs block it; goods reach storage once', async () => {
    const { state, build, auth, base, give, stock } = await setup();
    await build('house');
    await build('house');
    const carp = await build('carpentry');
    await build('market');
    const st = await state();
    expect(st.production.find((p) => p.buildingId === carp.id)).toMatchObject({ recipe: 'logging' });
    expect(st.workplaces.find((w) => w.id === carp.id)!.workers.length).toBeGreaterThan(0);

    // Planks need wood: without wood the workshop is blocked.
    await give('wood', 0);
    await auth(request(app).post(`${base}/production/${carp.id}/recipe`)).send({ recipeCode: 'planks' });
    advance(HOUR * 30);
    const blocked = await state();
    expect(blocked.production.find((p) => p.buildingId === carp.id)!.status).toBe('missing_input');
    expect(await stock('planks')).toBe(0);
    expect(blocked.warnings.map((w) => w.code)).toContain('MISSING_INPUT');
    await give('wood', 200);
    advance(HOUR * 24);
    await state();
    expect(await stock('planks')).toBeGreaterThan(0);
    expect(await stock('wood')).toBeLessThan(200);
    expect((await auth(request(app).post(`${base}/production/${carp.id}/recipe`)).send({ recipeCode: 'bricks' })).body.error.code).toBe('RECIPE_NOT_ALLOWED');

    // Ledger: every unit that entered the stock is recorded exactly once.
    const tx = await models.ResourceTransaction.findAll({ where: { resourceCode: 'planks' } });
    const ledger = tx.reduce((a, r) => a + r.delta, 0);
    expect(ledger).toBeCloseTo(await stock('planks'), 3);
    // Reading again at the same instant adds nothing.
    const before = await stock('planks');
    await state();
    await state();
    expect(await stock('planks')).toBe(before);
  });

  it('manual collect from a level-1 building without transporters is paid once', async () => {
    const { state, build, auth, base, stock } = await setup();
    await build('house');
    const quarry = await build('quarry');
    await state();
    advance(HOUR * 26); // a full working day
    const s = await state();
    const p = s.production.find((x) => x.buildingId === quarry.id)!;
    expect(p.buffer.stone).toBeGreaterThan(0); // nobody hauls it (no market / storage workers)
    const stone = await stock('stone');
    const [a, b] = await Promise.all([
      auth(request(app).post(`${base}/production/${quarry.id}/collect`)),
      auth(request(app).post(`${base}/production/${quarry.id}/collect`)),
    ]);
    const ok = [a, b].filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    expect([a, b].find((r) => r.status !== 200)!.body.error.code).toBe('NOTHING_TO_COLLECT');
    expect(await stock('stone')).toBe(stone + ok[0].body.data.collected.stone);
  });

  it('villagers eat and drink from storage; shortages are warned; migrants need housing and food', async () => {
    const { state, build, give, auth, base, stock } = await setup();
    await build('house');
    await build('house');
    await give('vegetables', 0);
    await give('water', 0);
    await state();
    advance(DAY * 1.5);
    const hungry = await state();
    expect(hungry.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['FOOD_SHORTAGE']));
    expect(hungry.survivors[0].satisfaction).toBeLessThan(0.65);
    expect(hungry.survivors).toHaveLength(5); // nobody comes to a starving village

    await give('vegetables', 400);
    await give('water', 400);
    await state();
    advance(DAY * 4);
    const grown = await state();
    expect(grown.survivors.length).toBeGreaterThan(5);
    expect(grown.survivors.length).toBeLessThanOrEqual(8); // two houses = 8 beds
    expect(await stock('vegetables')).toBeLessThan(400);
    expect(grown.survivors.some((s) => s.origin === 'migration' || s.origin === 'event')).toBe(true);

    // Rescue mission: costs coins + food, survivors return after the mission time.
    const r = await auth(request(app).post(`${base}/rescue`));
    expect(r.status).toBe(200);
    expect((await auth(request(app).post(`${base}/rescue`))).body.error.code).toBe('RESCUE_IN_PROGRESS');
    const count = grown.survivors.length;
    advance(DAY);
    const back = await state();
    expect(back.survivors.filter((s) => s.origin === 'rescue').length).toBeGreaterThanOrEqual(2);
    expect(back.survivors.length).toBeGreaterThanOrEqual(count + 2);
  });

  it('state survives a reload (new app instance), and other players cannot manage the village', async () => {
    const { state, build, auth, base, city } = await setup();
    await build('house');
    await build('carpentry');
    const before = await state();
    const fresh = createApp(models, config, { now: () => new Date(nowMs) });
    const after = (await auth(request(fresh).get(base))).body.data as PopulationStateDTO;
    expect(after.survivors.map((s) => [s.id, s.homeId, s.job?.id ?? null])).toEqual(before.survivors.map((s) => [s.id, s.homeId, s.job?.id ?? null]));
    expect(after.clock.day).toBe(before.clock.day);
    const stranger = await register('stranger');
    const res = await request(app).post(`/api/v1/cities/${city.id}/population/auto-assign`).set('Authorization', `Bearer ${stranger}`);
    expect(res.status).toBe(403);
  });

  it('villagers work the fields, farms and ponds: herders count as caretakers', async () => {
    const { state, auth, world, city } = await setup();
    const farmable = (h: AxialCoord) => world.isOwned(h.q, h.r) && world.getHexTile(h.q, h.r).buildable;
    const hexes = getConnectedHexes({ q: world.spawn.q, r: world.spawn.r }, farmable, 6);
    const ranch = await auth(request(app).post(`/api/v1/cities/${city.id}/livestock`)).send({ farmType: 'chicken_farm', hexes });
    expect(ranch.status).toBe(201);
    const s = await state();
    const herders = s.workplaces.find((w) => w.kind === 'livestock_farm')!.workers;
    expect(herders.length).toBe(1);
    expect(s.survivors.find((x) => x.id === herders[0])!.profession).toBe('herder');
    const farm = (await auth(request(app).get(`/api/v1/cities/${city.id}/livestock`))).body.data.farms[0];
    expect(farm.caretakers).toBe(2); // the hired one + the villager
  });
});
