import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import {
  WorldGenerator,
  feedCapacity,
  getAnimalDefinition,
  getConnectedHexes,
  getLivestockLevel,
  hexDistance,
  hexNeighbors,
  livestockCapacity,
  livestockCreateCost,
  livestockCycleSeconds,
  type AxialCoord,
  type HerdStatusDTO,
  type LivestockFarmDTO,
} from '@cityverse/shared';
import { createApp } from '../src/app.js';
import { createSequelizeInstance } from '../src/config/database.js';
import { loadEnv, type EnvConfig } from '../src/config/env.js';
import { initModels, type DatabaseModels } from '../src/database/models/index.js';

describe('Phase 5 – Livestock API', () => {
  let config: EnvConfig;
  let models: DatabaseModels;
  let app: Express;
  let nowMs = Date.UTC(2026, 10, 21, 10, 0, 0);
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
      models.LivestockProductionJob,
      models.FarmAnimal,
      models.LivestockFarmTile,
      models.LivestockFarm,
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

  async function setup(name = 'rancher') {
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
    /** A start hex at least `gap` hexes away from every hex in `avoid`. */
    const away = (avoid: AxialCoord[], gap = 5) =>
      world.getStarterTerritory().find((h) => farmable(h) && avoid.every((x) => hexDistance(x, h) >= gap))!;
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const base = `/api/v1/cities/${city.id}/livestock`;
    const giveProduce = async (code: string, amount: number) => {
      const row = await models.CityResource.findOne({ where: { cityId: city.id, resourceCode: code } });
      if (row) await row.update({ amount });
      else await models.CityResource.create({ cityId: city.id, resourceCode: code, amount });
    };
    const createFarm = async (farmType: string, hexes: AxialCoord[]) => {
      const res = await auth(request(app).post(base)).send({ farmType, hexes });
      expect(res.status).toBe(201);
      return res.body.data.farm as LivestockFarmDTO;
    };
    const herd = async (farmId: string) => (await auth(request(app).get(`${base}/${farmId}`))).body.data as HerdStatusDTO;
    return { city, world, farmable, region, away, auth, base, giveProduce, createFarm, herd };
  }

  it('seeds animal_species / animal_feed_recipes and enforces the minimum size per farm type (cattle ≥ 9)', async () => {
    const { auth, base, region } = await setup();
    const cat = await auth(request(app).get('/api/v1/livestock/catalog'));
    expect(cat.status).toBe(200);
    expect(cat.body.data.animals.map((a: { code: string }) => a.code).sort()).toEqual(['chicken', 'cow', 'elephant', 'goat', 'horse', 'pig', 'sheep']);
    expect(cat.body.data.feedRecipes).toHaveLength(5);
    expect(await models.AnimalSpecies.count()).toBe(7);
    expect(await models.AnimalFeedRecipe.count()).toBe(5);

    const small = await auth(request(app).post(base)).send({ farmType: 'chicken_farm', hexes: region(5) });
    expect(small.status).toBe(400);
    expect(small.body.error.details.issues).toContain('TOO_SMALL');
    const cattle8 = await auth(request(app).post(base)).send({ farmType: 'cattle_farm', hexes: region(8) });
    expect(cattle8.body.error.details.issues).toContain('TOO_SMALL');

    const ok = await auth(request(app).post(base)).send({ farmType: 'cattle_farm', hexes: region(9) });
    expect(ok.status).toBe(201);
    expect(ok.body.data.farm).toMatchObject({ farmType: 'cattle_farm', level: 1, capacity: 4, animals: [], caretakers: 1 });
    expect(ok.body.data.resources.coins).toBe(250000 - livestockCreateCost('cattle_farm', 9).coins);
    const roles = (ok.body.data.farm as LivestockFarmDTO).tiles.map((t) => t.role);
    for (const r of ['barn', 'feeder', 'water', 'caretaker', 'yard']) expect(roles).toContain(r);
  });

  it('reuses world_buildings + building_footprints for the land (one occupancy system)', async () => {
    const { auth, base, region, city, createFarm } = await setup();
    const farm = await createFarm('pig_farm', region(6));
    const building = await models.WorldBuilding.findByPk(farm.buildingId);
    expect(building).toMatchObject({ typeCode: 'pig_farm', level: 1, status: 'active' });
    expect(await models.BuildingFootprint.count({ where: { buildingId: farm.buildingId } })).toBe(6);
    expect(await models.BuildingType.findByPk('pig_farm')).toMatchObject({ category: 'livestock' });
    // The buildings API neither lists nor manages it.
    const list = await auth(request(app).get(`/api/v1/cities/${city.id}/buildings`));
    expect(list.body.data.buildings.find((b: { id: string }) => b.id === farm.buildingId)).toBeUndefined();
    const demolish = await auth(request(app).delete(`/api/v1/cities/${city.id}/buildings/${farm.buildingId}`));
    expect(demolish.body.error.code).toBe('MANAGED_BY_LIVESTOCK');
    // Removing the farm releases the footprint.
    expect((await auth(request(app).delete(`${base}/${farm.id}`))).status).toBe(200);
    expect(await models.WorldBuilding.count()).toBe(0);
    expect(await models.BuildingFootprint.count()).toBe(0);
    expect(await models.LivestockFarmTile.count()).toBe(0);
  });

  it('livestock farms, crop fields and buildings never overlap', async () => {
    const { auth, base, region, city, away, createFarm } = await setup();
    const hexes = region(6);
    await createFarm('pig_farm', hexes);
    const field = await auth(request(app).post(`/api/v1/cities/${city.id}/farms`)).send({ zoneType: 'pasture', hexes: region(8) });
    expect(field.status).toBe(400);
    const house = await auth(request(app).post(`/api/v1/cities/${city.id}/buildings`)).send({ typeCode: 'house', q: hexes[0].q, r: hexes[0].r });
    expect(house.body.error.details.issues).toEqual(['OCCUPIED']);
    const second = await auth(request(app).post(base)).send({ farmType: 'chicken_farm', hexes: [...region(5, away(hexes, 4)), hexes[0]] });
    expect(second.status).toBe(400);
  });

  it('buys young animals of a breed within capacity; they grow up on the backend clock', async () => {
    const { auth, base, region, createFarm } = await setup();
    const farm = await createFarm('chicken_farm', region(6));
    const url = `${base}/${farm.id}`;
    expect((await auth(request(app).post(`${url}/animals`)).send({ animalCode: 'cow' })).body.error.code).toBe('ANIMAL_NOT_ALLOWED');
    expect((await auth(request(app).post(`${url}/animals`)).send({ animalCode: 'chicken', breed: 'unicorn' })).body.error.code).toBe('INVALID_BREED');

    const before = (await auth(request(app).get(base))).body.data.resources.coins as number;
    const bought = await auth(request(app).post(`${url}/animals`)).send({ animalCode: 'chicken', breed: 'leghorn', count: 10 });
    expect(bought.status).toBe(200);
    const animals = bought.body.data.farm.animals as LivestockFarmDTO['animals'];
    expect(animals).toHaveLength(10);
    expect(animals[0]).toMatchObject({ animalCode: 'chicken', breed: 'leghorn', status: 'young', health: 1 });
    expect(bought.body.data.resources.coins).toBe(before - 10 * Math.round(getAnimalDefinition('chicken').price * 1.4));
    const full = await auth(request(app).post(`${url}/animals`)).send({ animalCode: 'chicken', count: 3 });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('FARM_FULL');
    expect(new Date(animals[0].growsUpAt).getTime() - new Date(animals[0].bornAt).getTime()).toBe(getAnimalDefinition('chicken').growSeconds * 1000);
  });

  it('feeds with recipes (produce → farm feed store) and refills water', async () => {
    const { auth, base, region, giveProduce, createFarm } = await setup();
    const farm = await createFarm('chicken_farm', region(6));
    const url = `${base}/${farm.id}`;
    expect((await auth(request(app).post(`${url}/feed`)).send({ recipeCode: 'corn_grain', batches: 5 })).body.error.code).toBe('INSUFFICIENT_FEED');
    expect((await auth(request(app).post(`${url}/feed`)).send({ recipeCode: 'fresh_grass', batches: 1 })).body.error.code).toBe('RECIPE_NOT_SUITABLE');
    await giveProduce('corn', 200);
    const fed = await auth(request(app).post(`${url}/feed`)).send({ recipeCode: 'corn_grain', batches: 20 });
    expect(fed.status).toBe(200);
    expect(fed.body.data.produce.corn).toBe(180);
    expect(fed.body.data.farm.feedStock).toBe(200);
    const cap = feedCapacity('chicken_farm', 1, 6);
    const over = await auth(request(app).post(`${url}/feed`)).send({ recipeCode: 'corn_grain', batches: 100 });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('FEED_STORAGE_FULL');
    expect(Number(over.body.error.details.maxBatches[0])).toBe(Math.floor((cap - 200) / 10));

    // Water: a well with no caretakers runs dry; the water action fills the troughs.
    await auth(request(app).put(`${url}/caretakers`)).send({ count: 0 });
    await auth(request(app).post(`${url}/animals`)).send({ animalCode: 'chicken', count: 6 });
    advance(30 * 60);
    const dry = await auth(request(app).get(`${url}`));
    const f = dry.body.data.farm as LivestockFarmDTO;
    if (f.effectiveWaterSource === 'well') {
      expect(f.waterStock).toBeLessThan(1);
      expect(f.animals.every((a) => a.status === 'thirsty' || a.status === 'hungry' || a.status === 'sick')).toBe(true);
    }
    const watered = await auth(request(app).post(`${url}/water`));
    expect(watered.body.data.farm.waterStock).toBe(watered.body.data.farm.waterCapacity);
  });

  it('produces from fed adults, collects once — no duplicate rewards', async () => {
    const { auth, base, region, giveProduce, createFarm } = await setup();
    const farm = await createFarm('chicken_farm', region(6));
    const url = `${base}/${farm.id}`;
    await auth(request(app).post(`${url}/animals`)).send({ animalCode: 'chicken', breed: 'ri', count: 4 });
    expect((await auth(request(app).post(`${url}/collect`))).body.error.code).toBe('NO_PRODUCTION');
    await giveProduce('corn', 500);
    await auth(request(app).post(`${url}/feed`)).send({ recipeCode: 'corn_grain', batches: 64 });
    advance(getAnimalDefinition('chicken').growSeconds);
    await auth(request(app).post(`${url}/water`));

    const running = (await auth(request(app).get(base))).body.data.farms[0] as LivestockFarmDTO;
    expect(running.jobs.find((j) => j.jobType === 'produce')?.status).toBe('in_progress');
    expect((await auth(request(app).post(`${url}/collect`))).body.error.code).toBe('PRODUCTION_NOT_READY');

    advance(livestockCycleSeconds('chicken_farm', 1, ['chicken']) + 1);
    const ready = await herd(auth, base, farm.id);
    expect(ready.summary.readyOutput.eggs).toBeGreaterThanOrEqual(10);

    // Two collects at the same time: only one pays out.
    const [a, b] = await Promise.all([auth(request(app).post(`${url}/collect`)), auth(request(app).post(`${url}/collect`))]);
    const ok = [a, b].filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    const eggs = ok[0].body.data.collected.eggs as number;
    expect(eggs).toBe(ready.summary.readyOutput.eggs);
    const after = (await auth(request(app).get(base))).body.data;
    expect(after.products.eggs).toBe(eggs);
    expect(after.farms[0].totalProduced).toBe(eggs);
    expect(await models.LivestockProductionJob.count({ where: { status: 'collected' } })).toBe(1);
    // And again later: still once.
    const again = await auth(request(app).post(`${url}/collect`));
    expect(again.status).toBe(409);
    expect((await auth(request(app).get(base))).body.data.products.eggs).toBe(eggs);
  });

  async function herd(auth: (r: request.Test) => request.Test, base: string, farmId: string): Promise<HerdStatusDTO> {
    return (await auth(request(app).get(`${base}/${farmId}`))).body.data as HerdStatusDTO;
  }

  it('lack of feed lowers productivity; production pauses when the storage is full (no infinite output)', async () => {
    const { auth, base, region, away, giveProduce, createFarm } = await setup();
    const hexesA = region(6);
    const fedFarm = await createFarm('chicken_farm', hexesA);
    const hungryFarm = await createFarm('chicken_farm', region(6, away(hexesA)));
    for (const f of [fedFarm, hungryFarm]) await auth(request(app).post(`${base}/${f.id}/animals`)).send({ animalCode: 'chicken', breed: 'leghorn', count: 6 });
    await giveProduce('corn', 1000);
    advance(getAnimalDefinition('chicken').growSeconds);
    for (const f of [fedFarm, hungryFarm]) await auth(request(app).post(`${base}/${f.id}/water`));
    await auth(request(app).post(`${base}/${fedFarm.id}/feed`)).send({ recipeCode: 'corn_grain', batches: 60 });
    // Wait long enough for the hungry hens to get really hungry.
    advance(10 * 60);
    const fed = await herd(auth, base, fedFarm.id);
    const hungry = await herd(auth, base, hungryFarm.id);
    expect(hungry.summary.avgSatiety).toBeLessThan(0.2);
    expect(hungry.summary.productivity).toBeLessThan(fed.summary.productivity);
    const out = (h: HerdStatusDTO) => h.summary.readyOutput.eggs ?? 0;
    expect(out(hungry)).toBeLessThan(out(fed));

    // Level 1 holds one ready batch: waiting longer adds nothing until collected.
    advance(30 * 60);
    expect(out(await herd(auth, base, fedFarm.id))).toBe(out(fed));
    expect(await models.LivestockProductionJob.count({ where: { farmId: fedFarm.id, status: 'ready' } })).toBe(1);
  });

  it('upgrades 1 → 2 → 3 through the construction queue (same id); breeding gives a newborn; capacity holds', async () => {
    const { auth, base, region, giveProduce, createFarm } = await setup();
    const farm = await createFarm('sheep_farm', region(6));
    const url = `${base}/${farm.id}`;
    await auth(request(app).post(`${url}/animals`)).send({ animalCode: 'sheep', count: 2 });
    await giveProduce('hay', 500);
    await auth(request(app).post(`${url}/feed`)).send({ recipeCode: 'fresh_grass', batches: 60 });
    advance(getAnimalDefinition('sheep').growSeconds);

    for (const target of [2, 3]) {
      const up = await auth(request(app).post(`${url}/upgrade`));
      expect(up.status).toBe(200);
      expect(up.body.data.farm).toMatchObject({ id: farm.id, status: 'upgrading', level: target - 1 });
      expect(await models.BuildingConstructionJob.count({ where: { buildingId: farm.buildingId, status: 'in_progress' } })).toBe(1);
      expect((await auth(request(app).post(`${url}/upgrade`))).body.error.code).toBe('LIVESTOCK_FARM_BUSY');
      advance(getLivestockLevel('sheep_farm', target)!.upgradeSeconds);
      await auth(request(app).post(`${url}/water`));
      const s = await auth(request(app).get(base));
      expect(s.body.data.farms[0]).toMatchObject({ id: farm.id, level: target, status: 'active' });
    }
    const l3 = (await auth(request(app).get(base))).body.data.farms[0] as LivestockFarmDTO;
    expect(l3.effectiveWaterSource).toBe('piped');
    expect(l3.maxCaretakers).toBe(4);
    for (const r of ['nursery', 'waste']) expect(l3.tiles.map((t) => t.role)).toContain(r);
    expect(l3.capacity).toBe(livestockCapacity('sheep_farm', 3, 6));
    expect((await auth(request(app).post(`${url}/upgrade`))).body.error.code).toBe('MAX_LEVEL_REACHED');

    expect((await auth(request(app).post(`${url}/breed`)).send({ animalCode: 'goat' })).body.error.code).toBe('NOT_ENOUGH_ADULTS');
    const bred = await auth(request(app).post(`${url}/breed`)).send({ animalCode: 'sheep' });
    expect(bred.status).toBe(200);
    expect(bred.body.data.farm.jobs.find((j: { jobType: string }) => j.jobType === 'breed')).toMatchObject({ animalCode: 'sheep' });
    expect((await auth(request(app).post(`${url}/breed`)).send({ animalCode: 'sheep' })).body.error.code).toBe('BREEDING_IN_PROGRESS');
    advance(getAnimalDefinition('sheep').breedSeconds);
    const after = (await auth(request(app).get(base))).body.data.farms[0] as LivestockFarmDTO;
    expect(after.animals).toHaveLength(3);
    const baby = after.animals[2];
    expect(baby.status).toBe('young');
    // Nursery: the newborn grows faster than a bought lamb.
    expect(new Date(baby.growsUpAt).getTime() - new Date(baby.bornAt).getTime()).toBeLessThan(getAnimalDefinition('sheep').growSeconds * 1000);

    // Fill the farm: breeding can never exceed capacity.
    const room = after.capacity - after.animals.length;
    await auth(request(app).post(`${url}/animals`)).send({ animalCode: 'goat', count: room });
    expect((await auth(request(app).post(`${url}/breed`)).send({ animalCode: 'sheep' })).body.error.code).toBe('FARM_FULL');
    expect((await auth(request(app).post(`${url}/animals`)).send({ animalCode: 'goat', count: 1 })).body.error.code).toBe('FARM_FULL');

    // Refresh: a new app instance sees level 3 and the same herd.
    const fresh = createApp(models, config, { now: () => new Date(nowMs) });
    const reloaded = await auth(request(fresh).get(base));
    expect(reloaded.body.data.farms[0]).toMatchObject({ level: 3 });
    expect(reloaded.body.data.farms[0].animals).toHaveLength(after.capacity);
  });

  it('expands a farm with connected hexes (more capacity) and rejects disconnected ones', async () => {
    const { auth, base, region, away, createFarm, farmable } = await setup();
    const hexes = region(6);
    const farm = await createFarm('chicken_farm', hexes);
    const url = `${base}/${farm.id}`;
    const keys = new Set(hexes.map((h) => `${h.q},${h.r}`));
    const ring = hexes.flatMap((h) => hexNeighbors(h)).filter((h) => farmable(h) && !keys.has(`${h.q},${h.r}`));
    const add = ring.filter((h, i, arr) => arr.findIndex((x) => x.q === h.q && x.r === h.r) === i).slice(0, 2);
    const grown = await auth(request(app).post(`${url}/expand`)).send({ hexes: add });
    expect(grown.status).toBe(200);
    expect(grown.body.data.farm.hexes).toHaveLength(8);
    expect(grown.body.data.farm.capacity).toBe(livestockCapacity('chicken_farm', 1, 8));
    expect(await models.BuildingFootprint.count({ where: { buildingId: farm.buildingId } })).toBe(8);
    const far = await auth(request(app).post(`${url}/expand`)).send({ hexes: [away(hexes, 6)] });
    expect(far.status).toBe(400);
    expect(far.body.error.details.issues).toContain('DISCONNECTED');
  });

  it('transfers animals between compatible farms with room', async () => {
    const { auth, base, region, away, createFarm } = await setup();
    const hexesA = region(6);
    const a = await createFarm('chicken_farm', hexesA);
    const hexesB = region(6, away(hexesA));
    const b = await createFarm('chicken_farm', hexesB);
    const pig = await createFarm('pig_farm', region(6, away([...hexesA, ...hexesB])));
    const bought = await auth(request(app).post(`${base}/${a.id}/animals`)).send({ animalCode: 'chicken', count: 2 });
    const hen = bought.body.data.farm.animals[0].id as string;
    expect((await auth(request(app).post(`${base}/${a.id}/animals/${hen}/transfer`)).send({ targetFarmId: pig.id })).body.error.code).toBe('ANIMAL_NOT_ALLOWED');
    const moved = await auth(request(app).post(`${base}/${a.id}/animals/${hen}/transfer`)).send({ targetFarmId: b.id });
    expect(moved.status).toBe(200);
    expect(moved.body.data.farm.animals).toHaveLength(1);
    expect(moved.body.data.otherFarm.animals.map((x: { id: string }) => x.id)).toEqual([hen]);
    // Target full → refused.
    await auth(request(app).post(`${base}/${b.id}/animals`)).send({ animalCode: 'chicken', count: b.capacity - 1 });
    const other = bought.body.data.farm.animals[1].id as string;
    expect((await auth(request(app).post(`${base}/${a.id}/animals/${other}/transfer`)).send({ targetFarmId: b.id })).body.error.code).toBe('FARM_FULL');
  });

  it('caretakers: limited by level, hiring costs coins; adults go to the butcher for meat', async () => {
    const { auth, base, region, createFarm } = await setup();
    const farm = await createFarm('pig_farm', region(6));
    const url = `${base}/${farm.id}`;
    expect((await auth(request(app).put(`${url}/caretakers`)).send({ count: 2 })).body.error.code).toBe('CARETAKER_LIMIT');
    const bought = await auth(request(app).post(`${url}/animals`)).send({ animalCode: 'pig', breed: 'yorkshire', count: 2 });
    const pigId = bought.body.data.farm.animals[0].id as string;
    expect((await auth(request(app).post(`${url}/animals/${pigId}/harvest`))).body.error.code).toBe('ANIMAL_NOT_ADULT');
    advance(getAnimalDefinition('pig').growSeconds);
    const meat = await auth(request(app).post(`${url}/animals/${pigId}/harvest`));
    expect(meat.status).toBe(200);
    expect(meat.body.data.collected.meat).toBeGreaterThan(getAnimalDefinition('pig').meatYield);
    expect(meat.body.data.products.meat).toBe(meat.body.data.collected.meat);
    expect(meat.body.data.farm.animals).toHaveLength(1);
    const sold = await auth(request(app).delete(`${url}/animals/${bought.body.data.farm.animals[1].id}`));
    expect(sold.status).toBe(200);
    expect(sold.body.data.farm.animals).toHaveLength(0);
  });

  it('simulates offline time from server timestamps (no request while away)', async () => {
    const { auth, base, region, giveProduce, createFarm } = await setup();
    const farm = await createFarm('cattle_farm', region(9));
    const url = `${base}/${farm.id}`;
    await auth(request(app).post(`${url}/animals`)).send({ animalCode: 'cow', count: 3 });
    await giveProduce('hay', 100);
    await auth(request(app).post(`${url}/feed`)).send({ recipeCode: 'fresh_grass', batches: 50 });
    const before = await herd(auth, base, farm.id);
    expect(before.farm.feedStock).toBe(500);
    // Two days away.
    advance(2 * 24 * 3600);
    const after = await herd(auth, base, farm.id);
    expect(after.farm.feedStock).toBe(0);
    expect(after.summary.avgHealth).toBeLessThan(0.5);
    expect(after.summary.adults).toBe(3);
    expect(new Date(after.farm.simulatedAt).getTime()).toBe(nowMs);
    // Animal rows store stats, never positions.
    const row = (await models.FarmAnimal.findOne({ where: { farmId: farm.id } }))!.get({ plain: true }) as Record<string, unknown>;
    expect(Object.keys(row)).not.toContain('x');
    expect(row.status).not.toBe('healthy');
  });
});
