import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import {
  DEV_TERRITORY_SIZE,
  STARTER_TERRITORY_SIZE,
  WorldGenerator,
  getConnectedHexes,
  getLivestockLevel,
  hexDistance,
  hexKey,
  type AxialCoord,
  type LivestockFarmDTO,
  type MilitaryStateDTO,
  type MountStateDTO,
  type UnitTypeCode,
} from '@cityverse/shared';
import { createApp } from '../src/app.js';
import { createSequelizeInstance } from '../src/config/database.js';
import { loadEnv, type EnvConfig } from '../src/config/env.js';
import { initModels, type DatabaseModels } from '../src/database/models/index.js';

describe('Phase 9 – Horse stables, elephant camps & mounts API', () => {
  let config: EnvConfig;
  let models: DatabaseModels;
  let app: Express;
  let nowMs = Date.UTC(2026, 10, 25, 8, 0, 0);
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
      // Development tools on (the test-world route); production never mounts them.
      DEV_AUTO_ADMIN: 'true',
    });
    const sequelize = createSequelizeInstance(config);
    models = initModels(sequelize);
    await sequelize.sync({ force: true });
    app = createApp(models, config, { now: () => new Date(nowMs) });
  });

  beforeEach(async () => {
    const order = [
      'AnimalCareRecord', 'MountAssignment', 'AnimalEquipment', 'AnimalAssignment', 'AnimalTrainingJob',
      'MilitarySquadMember', 'MilitarySquad', 'MilitaryTrainingJob', 'UnitEquipment', 'MilitaryUnit',
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

  async function setup(name = 'rider') {
    const token = await register(name);
    const cityRes = await request(app).post('/api/v1/cities').set('Authorization', `Bearer ${token}`).send({ name: `Haven ${name}`, terrainType: 'plains', isPublic: true });
    const city = cityRes.body.data as { id: string; worldSeed: string };
    const world = new WorldGenerator(city.worldSeed);
    const farmable = (h: AxialCoord) => world.isOwned(h.q, h.r) && world.getHexTile(h.q, h.r).buildable;
    const region = (n: number, start: AxialCoord = world.spawn) => getConnectedHexes({ q: start.q, r: start.r }, farmable, n);
    const away = (avoid: AxialCoord[], gap = 5) => world.getStarterTerritory().find((h) => farmable(h) && avoid.every((x) => hexDistance(x, h) >= gap))!;
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const live = `/api/v1/cities/${city.id}/livestock`;
    const mounts = `/api/v1/cities/${city.id}/mounts`;
    const give = async (code: string, amount: number) => {
      const row = await models.CityResource.findOne({ where: { cityId: city.id, resourceCode: code } });
      if (row) await row.update({ amount });
      else await models.CityResource.create({ cityId: city.id, resourceCode: code, amount });
    };
    const stock = async (code: string) => (await models.CityResource.findOne({ where: { cityId: city.id, resourceCode: code } }))?.amount ?? 0;
    await give('wood', 50000);
    await give('stone', 50000);
    await give('hay', 3000);
    await give('vegetables', 3000);
    const createFarm = async (farmType: string, hexes: AxialCoord[]) => {
      const res = await auth(request(app).post(live)).send({ farmType, hexes });
      expect(res.status).toBe(201);
      return res.body.data.farm as LivestockFarmDTO;
    };
    const farm = async (id: string) => (await auth(request(app).get(`${live}/${id}`))).body.data.farm as LivestockFarmDTO;
    const state = async () => {
      const res = await auth(request(app).get(mounts));
      expect(res.status).toBe(200);
      return res.body.data as MountStateDTO;
    };
    const buy = (farmId: string, animalCode: string, count = 1, breed?: string) => auth(request(app).post(`${live}/${farmId}/animals`)).send({ animalCode, count, breed });
    const feed = (farmId: string, batches = 30) => auth(request(app).post(`${live}/${farmId}/feed`)).send({ recipeCode: 'fresh_grass', batches });
    /** A trained soldier (Phase 8) straight in the database. */
    const soldier = async (type: UnitTypeCode) => {
      await auth(request(app).get(`/api/v1/cities/${city.id}/population`));
      await auth(request(app).get(`/api/v1/cities/${city.id}/military`)); // seeds unit_types
      const used = new Set((await models.MilitaryUnit.findAll({ where: { cityId: city.id } })).map((u) => u.survivorId));
      const s = (await models.Survivor.findAll({ where: { cityId: city.id } })).find((x) => !used.has(x.id))!;
      return models.MilitaryUnit.create({ cityId: city.id, survivorId: s.id, unitTypeCode: type, buildingId: null, status: 'ready', recruitedAt: new Date(nowMs), trainedAt: new Date(nowMs), xp: 20 });
    };
    return { city, world, region, away, auth, live, mounts, give, stock, createFarm, farm, state, buy, feed, soldier };
  }

  it('a horse stable needs ≥ 9 hexes and an elephant camp ≥ 12; both upgrade through three levels on the same land', async () => {
    const { region, away, auth, live, createFarm, farm } = await setup();
    const small = await auth(request(app).post(live)).send({ farmType: 'horse_stable', hexes: region(8) });
    expect(small.status).toBe(400);
    const stable = await createFarm('horse_stable', region(9));
    expect(stable.hexes).toHaveLength(9);
    expect(stable.capacity).toBe(4);
    expect(await models.BuildingFootprint.count({ where: { buildingId: stable.buildingId } })).toBe(9);
    const hexes = stable.hexes.map((h) => hexKey(h.q, h.r)).sort();
    for (const [level, cap] of [[2, 8], [3, 12]] as const) {
      expect((await auth(request(app).post(`${live}/${stable.id}/upgrade`))).status).toBe(200);
      advance(getLivestockLevel('horse_stable', level)!.upgradeSeconds + 1);
      const f = await farm(stable.id);
      expect(f.level).toBe(level);
      expect(f.capacity).toBe(cap);
      expect(f.hexes.map((h) => hexKey(h.q, h.r)).sort()).toEqual(hexes);
    }
    const roles = (await farm(stable.id)).tiles.map((t) => t.role);
    expect(roles).toEqual(expect.arrayContaining(['barn', 'arena', 'vet', 'office', 'storage']));

    const start = away(stable.hexes, 6);
    const tooSmall = await auth(request(app).post(live)).send({ farmType: 'elephant_camp', hexes: region(11, start) });
    expect(tooSmall.status).toBe(400);
    const camp = await createFarm('elephant_camp', region(12, start));
    expect(camp.capacity).toBe(2);
    for (const [level, cap] of [[2, 4], [3, 6]] as const) {
      expect((await auth(request(app).post(`${live}/${camp.id}/upgrade`))).status).toBe(200);
      advance(getLivestockLevel('elephant_camp', level)!.upgradeSeconds + 1);
      expect(await farm(camp.id)).toMatchObject({ level, capacity: cap });
    }
  });

  it('never goes over capacity; receives half-wild horses with traits; food and water are consumed; starving animals die', async () => {
    const { region, createFarm, farm, buy, feed, auth, live, state, stock } = await setup();
    const stable = await createFarm('horse_stable', region(9));
    expect((await buy(stable.id, 'horse', 5)).status).toBe(409);
    const ok = await buy(stable.id, 'horse', 2, 'black');
    expect(ok.status).toBe(200);
    expect((await buy(stable.id, 'horse', 3)).status).toBe(409); // 2 + 3 > 4
    const s0 = await state();
    expect(s0.animals).toHaveLength(2);
    expect(s0.animals[0].traits).toMatchObject({ tame: false, trainingLevel: 0, use: null });
    expect(s0.animals[0].traits.speed).toBeGreaterThan(9);

    const hay = await stock('hay');
    expect((await feed(stable.id, 20)).status).toBe(200);
    expect(await stock('hay')).toBe(hay - 20);
    // No caretakers drawing water → the troughs empty while the horses drink.
    await auth(request(app).put(`${live}/${stable.id}/caretakers`)).send({ count: 0 });
    const f0 = await farm(stable.id);
    advance(180);
    const f1 = await farm(stable.id);
    expect(f1.feedStock).toBeLessThan(f0.feedStock);
    expect(f1.waterStock).toBeLessThan(f0.waterStock);
    // Left without food and water for hours, the horses die (they don't live forever).
    advance(6 * 3600);
    const f2 = await farm(stable.id);
    expect(f2.animals).toHaveLength(0);
    expect(await models.AnimalCareRecord.count({ where: { kind: 'death' } })).toBe(2);
    expect((await state()).records.some((r) => r.kind === 'death')).toBe(true);
  });

  it('untamed horses cannot be combat mounts; training completes exactly once and survives reload', async () => {
    const { region, createFarm, buy, feed, auth, mounts, give, state, soldier } = await setup();
    const stable = await createFarm('horse_stable', region(9));
    await buy(stable.id, 'horse', 1, 'bay');
    await feed(stable.id, 40);
    advance(160); // grows up
    let s = await state();
    const horse = s.animals[0];
    await give('eq_saddle', 2);
    expect((await auth(request(app).put(`${mounts}/animals/${horse.id}/equipment`)).send({ slot: 'saddle', equipmentCode: 'eq_saddle' })).status).toBe(200);
    const spear = await soldier('spearman');
    const wild = await auth(request(app).post(`${mounts}/animals/${horse.id}/mount`)).send({ unitId: spear.id });
    expect(wild.status).toBe(409);
    expect(wild.body.error.code).toBe('NOT_TAME');
    // Riding needs a tame horse and the training yard.
    expect((await auth(request(app).post(`${mounts}/animals/${horse.id}/training`)).send({ program: 'riding' })).body.error.code).toBe('STABLE_LEVEL_TOO_LOW');

    const start = await auth(request(app).post(`${mounts}/animals/${horse.id}/training`)).send({ program: 'taming' });
    expect(start.status).toBe(201);
    s = start.body.data.state as MountStateDTO;
    expect(s.jobs).toHaveLength(1);
    const finishesAt = s.jobs[0].finishesAt;
    expect((await auth(request(app).post(`${mounts}/animals/${horse.id}/training`)).send({ program: 'taming' })).body.error.code).toBe('ANIMAL_TRAINING');
    advance(30);
    s = await state(); // refresh: same job, same deadline
    expect(s.jobs).toHaveLength(1);
    expect(s.jobs[0].finishesAt).toBe(finishesAt);
    expect(s.animals[0].traits.training?.program).toBe('taming');
    const before = s.animals[0].traits.tameness;
    advance(60);
    await Promise.all([state(), state(), state()]);
    s = await state();
    expect(s.jobs).toHaveLength(0);
    expect(await models.AnimalTrainingJob.count({ where: { status: 'completed' } })).toBe(1);
    expect(await models.AnimalCareRecord.count({ where: { kind: 'training' } })).toBe(1);
    const after = s.animals[0].traits.tameness;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(before + 0.3 + 1e-6);
    expect((await state()).animals[0].traits.tameness).toBe(after); // stable after reload
  });

  it('a horse is never given to two soldiers; mounts are stored, unassigned and freed on sale', async () => {
    const { region, createFarm, buy, feed, auth, mounts, give, state, soldier, stock, live } = await setup();
    const stable = await createFarm('horse_stable', region(9));
    await buy(stable.id, 'horse', 2, 'chestnut');
    await feed(stable.id, 40);
    advance(160);
    const [h1, h2] = (await state()).animals;
    await models.FarmAnimal.update({ tameness: 0.8 }, { where: { id: [h1.id, h2.id] } });
    await give('eq_saddle', 2);
    for (const h of [h1, h2]) await auth(request(app).put(`${mounts}/animals/${h.id}/equipment`)).send({ slot: 'saddle', equipmentCode: 'eq_saddle' });
    const a = await soldier('spearman');
    const b = await soldier('archer');
    const c = await soldier('crossbowman');
    expect((await auth(request(app).post(`${mounts}/animals/${h1.id}/mount`)).send({ unitId: a.id })).status).toBe(201);
    const twice = await auth(request(app).post(`${mounts}/animals/${h1.id}/mount`)).send({ unitId: b.id });
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('ANIMAL_IN_USE');
    expect((await auth(request(app).post(`${mounts}/animals/${h2.id}/mount`)).send({ unitId: a.id })).body.error.code).toBe('UNIT_HAS_MOUNT');
    expect((await auth(request(app).post(`${mounts}/animals/${h2.id}/mount`)).send({ unitId: c.id })).body.error.code).toBe('RIDER_NOT_SUITABLE');
    // The database itself refuses a second rider for the same horse.
    await expect(models.MountAssignment.create({ cityId: a.cityId, animalId: h1.id, unitId: b.id, assignedAt: new Date(nowMs) })).rejects.toThrow();
    // Cannot unsaddle a horse that carries a rider.
    expect((await auth(request(app).put(`${mounts}/animals/${h1.id}/equipment`)).send({ slot: 'saddle', equipmentCode: null })).status).toBe(409);

    // Reload: the mount is persisted, the soldier is faster on horseback.
    const s = await state();
    expect(s.animals.find((x) => x.id === h1.id)!.traits.use).toMatchObject({ kind: 'mount', unitId: a.id });
    const army = (await auth(request(app).get(`/api/v1/cities/${a.cityId}/military`))).body.data as MilitaryStateDTO;
    const rider = army.units.find((u) => u.id === a.id)!;
    expect(rider.mount).toMatchObject({ animalId: h1.id });
    expect(rider.stats.speed).toBeGreaterThan(army.units.find((u) => u.id === b.id)!.stats.speed);
    expect(await models.MountAssignment.count()).toBe(1);

    expect((await auth(request(app).delete(`${mounts}/animals/${h1.id}/mount`))).status).toBe(200);
    expect((await auth(request(app).post(`${mounts}/animals/${h1.id}/mount`)).send({ unitId: b.id })).status).toBe(201);
    // Selling the horse frees the rider and returns the saddle to storage.
    const saddles = await stock('eq_saddle');
    expect((await auth(request(app).delete(`${live}/${stable.id}/animals/${h1.id}`))).status).toBe(200);
    expect(await models.MountAssignment.count()).toBe(0);
    expect(await stock('eq_saddle')).toBe(saddles + 1);
  });

  it('elephants haul cargo with a harness, train for war later, are never butchered and need the care area for a vet', async () => {
    const { region, createFarm, buy, feed, auth, mounts, give, state, live } = await setup();
    const camp = await createFarm('elephant_camp', region(12));
    await buy(camp.id, 'elephant', 1);
    await feed(camp.id, 60);
    advance(250);
    const e = (await state()).animals[0];
    expect(e.animalCode).toBe('elephant');
    await models.FarmAnimal.update({ tameness: 0.9 }, { where: { id: e.id } });
    expect((await auth(request(app).post(`${mounts}/animals/${e.id}/task`)).send({ kind: 'transport' })).body.error.code).toBe('NO_HARNESS');
    await give('eq_cargo_harness', 1);
    expect((await auth(request(app).put(`${mounts}/animals/${e.id}/equipment`)).send({ slot: 'harness', equipmentCode: 'eq_cargo_harness' })).status).toBe(200);
    expect((await auth(request(app).post(`${mounts}/animals/${e.id}/task`)).send({ kind: 'transport' })).status).toBe(201);
    const s = await state();
    expect(s.transportBonus).toBeGreaterThan(0);
    expect(s.animals[0].traits.use).toMatchObject({ kind: 'transport' });
    expect(await models.AnimalAssignment.count()).toBe(1);
    expect((await auth(request(app).delete(`${mounts}/animals/${e.id}/task`))).status).toBe(200);
    expect((await auth(request(app).post(`${mounts}/animals/${e.id}/task`)).send({ kind: 'military' })).body.error.code).toBe('NOT_WAR_TRAINED');
    // An elephant is a horse for nobody.
    expect((await auth(request(app).post(`${live}/${camp.id}/animals/${e.id}/harvest`))).body.error.code).toBe('ANIMAL_NOT_BUTCHERABLE');
    expect((await auth(request(app).post(`${mounts}/animals/${e.id}/care`)).send({ action: 'vet' })).body.error.code).toBe('VET_UNAVAILABLE');
    expect((await auth(request(app).post(`${mounts}/animals/${e.id}/care`)).send({ action: 'groom' })).status).toBe(200);
    expect((await auth(request(app).post(`${mounts}/animals/${e.id}/care`)).send({ action: 'groom' })).body.error.code).toBe('GROOM_COOLDOWN');
    expect(await models.AnimalCareRecord.count({ where: { kind: 'groom' } })).toBe(1);
  });

  it('the free test-world land tool exists only outside production', async () => {
    const token = await register('devtester');
    const res = await request(app).post('/api/v1/dev/test-world').set('Authorization', `Bearer ${token}`).send({ name: 'Test Ranch', terrainType: 'plains' });
    expect(res.status).toBe(201);
    expect(res.body.data.worldSeed).toMatch(/^CV-DEV-/);
    const big = new WorldGenerator(res.body.data.worldSeed).getStarterTerritory().length;
    expect(big).toBeGreaterThan(STARTER_TERRITORY_SIZE * 2);
    expect(big).toBeLessThanOrEqual(DEV_TERRITORY_SIZE);
    // Normal cities never get a dev seed.
    const t2 = await register('normal');
    const normal = await request(app).post('/api/v1/cities').set('Authorization', `Bearer ${t2}`).send({ name: 'Normal Haven', terrainType: 'plains' });
    expect(normal.body.data.worldSeed).not.toMatch(/^CV-DEV-/);
    for (const cfg of [{ ...config, NODE_ENV: 'production' as const }, { ...config, DEV_AUTO_ADMIN: false }]) {
      const prod = createApp(models, cfg, { now: () => new Date(nowMs) });
      const t3 = await register(`prod${cfg.NODE_ENV}${String(cfg.DEV_AUTO_ADMIN)}`);
      const r = await request(prod).post('/api/v1/dev/test-world').set('Authorization', `Bearer ${t3}`).send({ name: 'Free Land', terrainType: 'plains' });
      expect(r.status).toBe(404);
    }
  });
});
