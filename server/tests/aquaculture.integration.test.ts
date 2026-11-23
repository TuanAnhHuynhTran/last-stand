import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import {
  HEX_DIRECTIONS,
  WorldGenerator,
  getConnectedHexes,
  getFishSpecies,
  getWaterBodyLevel,
  hexDistance,
  hexKey,
  hexNeighbors,
  waterBodyCreateCost,
  waterFillSeconds,
  type AxialCoord,
  type WaterBodyDTO,
} from '@cityverse/shared';
import { createApp } from '../src/app.js';
import { createSequelizeInstance } from '../src/config/database.js';
import { loadEnv, type EnvConfig } from '../src/config/env.js';
import { initModels, type DatabaseModels } from '../src/database/models/index.js';

describe('Phase 6 – Aquaculture API', () => {
  let config: EnvConfig;
  let models: DatabaseModels;
  let app: Express;
  let nowMs = Date.UTC(2026, 10, 22, 10, 0, 0);
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
      models.WaterQualityRecord,
      models.FishStockBatch,
      models.AquacultureCycle,
      models.WaterBodyTile,
      models.WaterBody,
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

  async function register(name: string) {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: `${name}@lasthaven.io`, username: name, password: 'LastHaven2026' });
    return reg.body.data.tokens.accessToken as string;
  }

  async function setup(name = 'fisher') {
    const token = await register(name);
    const cityRes = await request(app)
      .post('/api/v1/cities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Haven ${name}`, terrainType: 'plains', isPublic: true });
    const city = cityRes.body.data as { id: string; worldSeed: string };
    const world = new WorldGenerator(city.worldSeed);
    const farmable = (h: AxialCoord) => world.isOwned(h.q, h.r) && world.getHexTile(h.q, h.r).buildable;
    const region = (n: number, start: AxialCoord = world.spawn) => getConnectedHexes({ q: start.q, r: start.r }, farmable, n);
    /** A thin, irregular (snake-like) shape: not a compact blob. */
    const snake = (n: number): AxialCoord[] => {
      const out: AxialCoord[] = [{ q: world.spawn.q, r: world.spawn.r }];
      const used = new Set([hexKey(out[0].q, out[0].r)]);
      let dir = 0;
      for (let guard = 0; out.length < n && guard < 200; guard += 1) {
        const last = out[out.length - 1];
        const d = HEX_DIRECTIONS[dir];
        const next = { q: last.q + d.q, r: last.r + d.r };
        const k = hexKey(next.q, next.r);
        // Keep it thin: the new hex may touch only the previous one.
        const touching = hexNeighbors(next).filter((x) => used.has(hexKey(x.q, x.r))).length;
        if (!used.has(k) && farmable(next) && touching === 1) {
          out.push(next);
          used.add(k);
          if (out.length % 3 === 0) dir = (dir + 1) % 6;
        } else dir = (dir + 1) % 6;
      }
      return out;
    };
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const base = `/api/v1/cities/${city.id}/water-bodies`;
    const give = async (code: string, amount: number) => {
      const row = await models.CityResource.findOne({ where: { cityId: city.id, resourceCode: code } });
      if (row) await row.update({ amount });
      else await models.CityResource.create({ cityId: city.id, resourceCode: code, amount });
    };
    const dig = async (type: string, hexes: AxialCoord[]) => {
      const res = await auth(request(app).post(base)).send({ type, hexes });
      expect(res.status, JSON.stringify(res.body.error)).toBe(201);
      return res.body.data.waterBody as WaterBodyDTO;
    };
    const get = async (id: string) => (await auth(request(app).get(`${base}/${id}`))).body.data.waterBody as WaterBodyDTO;
    /** Dig, fill and wait until full. */
    const ready = async (type = 'fish_pond', hexes = region(6)) => {
      const pond = await dig(type, hexes);
      if (type !== 'fish_cage') {
        expect((await auth(request(app).post(`${base}/${pond.id}/fill`))).status).toBe(200);
        advance(waterFillSeconds(type as 'fish_pond', hexes.length) + 1);
      }
      return get(pond.id);
    };
    return { token, city, world, farmable, region, snake, auth, base, give, dig, get, ready };
  }

  it('digs a 6-hex pond: seeds fish_species, reuses world_buildings + footprints and stores the carved terrain', async () => {
    const { auth, base, region, dig, world } = await setup();
    const cat = await auth(request(app).get('/api/v1/aquaculture/catalog'));
    expect(cat.body.data.species.map((s: { code: string }) => s.code).sort()).toEqual(['carp', 'catfish', 'snakehead', 'tilapia']);
    expect(await models.FishSpecies.count()).toBe(4);
    expect((await auth(request(app).post(base)).send({ type: 'fish_pond', hexes: region(5) })).body.error.details.issues).toContain('TOO_SMALL');
    expect((await auth(request(app).post(base)).send({ type: 'fish_lake', hexes: region(11) })).body.error.details.issues).toContain('TOO_SMALL');

    const before = (await auth(request(app).get(base))).body.data.resources.coins as number;
    const hexes = region(6);
    const pond = await dig('fish_pond', hexes);
    expect(pond).toMatchObject({ type: 'fish_pond', level: 1, status: 'dry', waterLevel: 0 });
    expect(pond.hexes).toHaveLength(6);
    expect(pond.bottomHeight).toBeLessThan(pond.surfaceHeight);
    expect(pond.surfaceHeight).toBeLessThan(Math.min(...hexes.map((h) => world.getHexTile(h.q, h.r).height)));
    expect(pond.area).toBeGreaterThan(200);
    expect(pond.volume).toBeGreaterThan(0);
    expect((await auth(request(app).get(base))).body.data.resources.coins).toBe(before - waterBodyCreateCost('fish_pond', 6).coins);
    expect(await models.WorldBuilding.findByPk(pond.buildingId)).toMatchObject({ typeCode: 'fish_pond', level: 1 });
    expect(await models.BuildingFootprint.count({ where: { buildingId: pond.buildingId } })).toBe(6);
    const tiles = await models.WaterBodyTile.findAll({ where: { waterBodyId: pond.id } });
    expect(tiles).toHaveLength(6);
    for (const t of tiles) expect(t.bedHeight).toBeLessThan(t.originalHeight);
  });

  it('accepts an irregular shape exactly as drawn', async () => {
    const { snake, dig } = await setup();
    const shape = snake(7);
    expect(shape.length).toBe(7);
    const pond = await dig('fish_pond', shape);
    expect(pond.hexes.map((h) => hexKey(h.q, h.r)).sort()).toEqual(shape.map((h) => hexKey(h.q, h.r)).sort());
  });

  it('never digs on a house (or other buildings), and the buildings API cannot touch a pond', async () => {
    const { auth, base, region, city, dig } = await setup();
    const hexes = region(6);
    const house = await auth(request(app).post(`/api/v1/cities/${city.id}/buildings`)).send({ typeCode: 'house', q: hexes[2].q, r: hexes[2].r });
    expect(house.status).toBe(201);
    const onHouse = await auth(request(app).post(base)).send({ type: 'fish_pond', hexes });
    expect(onHouse.status).toBe(400);
    expect(onHouse.body.error.details.issues).toContain('OCCUPIED');
    // Elsewhere is fine; then a house cannot go on the pond either.
    const world = new WorldGenerator(city.worldSeed);
    const away = world.getStarterTerritory().find((h) => world.getHexTile(h.q, h.r).buildable && hexes.every((x) => hexDistance(x, h) >= 4))!;
    const pond = await dig('fish_pond', region(6, away));
    const onPond = await auth(request(app).post(`/api/v1/cities/${city.id}/buildings`)).send({ typeCode: 'house', q: pond.hexes[0].q, r: pond.hexes[0].r });
    expect(onPond.body.error.details.issues).toEqual(['OCCUPIED']);
    const demolish = await auth(request(app).delete(`/api/v1/cities/${city.id}/buildings/${pond.buildingId}`));
    expect(demolish.body.error.code).toBe('MANAGED_BY_AQUACULTURE');
  });

  it('expands correctly: water merges, area / volume grow, the stored water spreads; disconnected hexes are refused', async () => {
    const { auth, base, region, farmable, ready, world } = await setup();
    const hexes = region(6);
    const pond = await ready('fish_pond', hexes);
    expect(pond.waterLevel).toBeGreaterThan(0.99);
    const keys = new Set(hexes.map((h) => hexKey(h.q, h.r)));
    const ring = hexes.flatMap((h) => hexNeighbors(h)).filter((h) => farmable(h) && !keys.has(hexKey(h.q, h.r)));
    const add = ring.filter((h, i, a) => a.findIndex((x) => x.q === h.q && x.r === h.r) === i).slice(0, 3);
    const grown = await auth(request(app).post(`${base}/${pond.id}/expand`)).send({ hexes: add });
    expect(grown.status).toBe(200);
    const g = grown.body.data.waterBody as WaterBodyDTO;
    expect(g.hexes).toHaveLength(9);
    expect(g.area).toBeGreaterThan(pond.area);
    expect(g.volume).toBeGreaterThan(pond.volume);
    expect(g.waterLevel).toBeLessThan(1);
    expect(g.waterLevel).toBeCloseTo(pond.volume / g.volume, 2);
    expect(await models.WaterBodyTile.count({ where: { waterBodyId: pond.id } })).toBe(9);
    expect(await models.BuildingFootprint.count({ where: { buildingId: pond.buildingId } })).toBe(9);
    const far = world.getStarterTerritory().find((h) => farmable(h) && hexes.every((x) => hexDistance(x, h) >= 6))!;
    const bad = await auth(request(app).post(`${base}/${pond.id}/expand`)).send({ hexes: [far] });
    expect(bad.body.error.details.issues).toContain('DISCONNECTED');
  });

  it('full cycle: fill → stock fry → feed → grow → harvest once → prepare → new cycle', async () => {
    const { auth, base, region, dig, get, give } = await setup();
    const pond = await dig('fish_pond', region(6));
    const url = `${base}/${pond.id}`;
    expect((await auth(request(app).post(`${url}/stock`)).send({ species: 'tilapia', count: 50 })).body.error.code).toBe('NOT_ENOUGH_WATER');
    const filling = await auth(request(app).post(`${url}/fill`));
    expect(filling.body.data.waterBody.status).toBe('filling');
    expect((await auth(request(app).post(`${url}/fill`))).body.error.code).toBe('ALREADY_FILLING');
    advance(waterFillSeconds('fish_pond', 6) + 1);
    expect((await get(pond.id)).status).toBe('active');

    const coins = (await auth(request(app).get(base))).body.data.resources.coins as number;
    const stocked = await auth(request(app).post(`${url}/stock`)).send({ species: 'tilapia', count: 100 });
    expect(stocked.status).toBe(200);
    expect(stocked.body.data.resources.coins).toBe(coins - 100 * getFishSpecies('tilapia').fryPrice);
    expect(stocked.body.data.waterBody.batches[0]).toMatchObject({ species: 'tilapia', alive: 100, stage: 'fry' });
    expect(stocked.body.data.waterBody.cycle).toMatchObject({ status: 'active', stockedFish: 100 });
    expect((await auth(request(app).post(`${url}/stock`)).send({ species: 'carp', count: 99999 })).status).toBe(400);
    expect((await auth(request(app).post(`${url}/stock`)).send({ species: 'carp', count: 5000 })).body.error.code).toBe('POND_FULL');

    expect((await auth(request(app).post(`${url}/feed`)).send({ feedCode: 'corn_meal', batches: 5 })).body.error.code).toBe('INSUFFICIENT_FEED');
    await give('corn', 100);
    const fed = await auth(request(app).post(`${url}/feed`)).send({ feedCode: 'corn_meal', batches: 20 });
    expect(fed.status).toBe(200);
    expect(fed.body.data.waterBody.feedStock).toBe(100);
    expect(fed.body.data.produce.corn).toBe(80);
    expect((await auth(request(app).post(`${url}/harvest`))).body.error.code).toBe('FISH_NOT_READY');

    // Keep the fish fed while they grow (earth pond: top up the water too).
    for (let i = 0; i < 4; i += 1) {
      advance(getFishSpecies('tilapia').growSeconds / 3);
      await give('corn', 100);
      const p = await get(pond.id);
      const room = Math.floor((p.feedCapacity - p.feedStock) / 5);
      if (room > 0) await auth(request(app).post(`${url}/feed`)).send({ feedCode: 'corn_meal', batches: Math.min(20, room) });
      if (p.waterLevel < 0.95) await auth(request(app).post(`${url}/fill`));
    }
    const grown = await get(pond.id);
    expect(grown.batches[0].stage).toBe('harvestable');
    expect(grown.records.length).toBeGreaterThan(2);

    // Two harvests at once: only one pays.
    const [a, b] = await Promise.all([auth(request(app).post(`${url}/harvest`)), auth(request(app).post(`${url}/harvest`))]);
    const ok = [a, b].filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    const kg = ok[0].body.data.harvested.fish_tilapia as number;
    expect(kg).toBeGreaterThan(30);
    const after = (await auth(request(app).get(base))).body.data;
    expect(after.fish.fish_tilapia).toBe(kg);
    expect(after.waterBodies[0].batches).toEqual([]);
    expect(await models.FishStockBatch.count({ where: { status: 'harvested' } })).toBe(1);
    expect((await auth(request(app).post(`${url}/harvest`))).body.error.code).toBe('NO_FISH');
    expect((await auth(request(app).get(base))).body.data.fish.fish_tilapia).toBe(kg);
    expect(await models.AquacultureCycle.findOne({ where: { waterBodyId: pond.id } })).toMatchObject({ status: 'harvested' });

    // Preparing the next cycle.
    expect((await get(pond.id)).status).toBe('preparing');
    await auth(request(app).post(`${url}/fill`));
    expect((await auth(request(app).post(`${url}/stock`)).send({ species: 'carp', count: 10 })).body.error.code).toBe('POND_PREPARING');
    advance(20);
    expect((await auth(request(app).post(`${url}/stock`)).send({ species: 'carp', count: 10 })).status).toBe(200);
    expect(await models.AquacultureCycle.count({ where: { waterBodyId: pond.id } })).toBe(2);
  });

  it('upgrades 1 → 2 → 3 keeping the designed shape and terrain', async () => {
    const { auth, base, snake, ready } = await setup();
    const pond = await ready('fish_pond', snake(7));
    const url = `${base}/${pond.id}`;
    const tilesBefore = (await models.WaterBodyTile.findAll({ where: { waterBodyId: pond.id } })).map((t) => `${t.q},${t.r},${t.bedHeight}`).sort();
    for (const target of [2, 3]) {
      const up = await auth(request(app).post(`${url}/upgrade`));
      expect(up.status).toBe(200);
      expect(up.body.data.waterBody).toMatchObject({ id: pond.id, status: 'upgrading', level: target - 1 });
      advance(getWaterBodyLevel('fish_pond', target)!.upgradeSeconds);
      const after = (await auth(request(app).get(url))).body.data.waterBody as WaterBodyDTO;
      expect(after).toMatchObject({ id: pond.id, level: target, surfaceHeight: pond.surfaceHeight, bottomHeight: pond.bottomHeight, area: pond.area });
      expect(after.hexes).toEqual(pond.hexes);
    }
    const tilesAfter = (await models.WaterBodyTile.findAll({ where: { waterBodyId: pond.id } })).map((t) => `${t.q},${t.r},${t.bedHeight}`).sort();
    expect(tilesAfter).toEqual(tilesBefore);
    expect((await auth(request(app).post(`${url}/upgrade`))).body.error.code).toBe('MAX_LEVEL_REACHED');
  });

  it('fish and water data survive a reload; hatchery fry stock other ponds; other players cannot touch them', async () => {
    const { auth, base, region, ready, world, city, give } = await setup();
    const hatch = await ready('hatchery', region(6));
    const away = world.getStarterTerritory().find((h) => world.getHexTile(h.q, h.r).buildable && hatch.hexes.every((x) => hexDistance(x, h) >= 5))!;
    const pond = await ready('fish_pond', region(6, away));
    await auth(request(app).post(`${base}/${hatch.id}/stock`)).send({ species: 'carp', count: 200 });
    await give('rice', 100);
    await auth(request(app).post(`${base}/${hatch.id}/feed`)).send({ feedCode: 'rice_bran_fish', batches: 20 });
    advance(30);
    const snapshot = (await auth(request(app).get(base))).body.data.waterBodies as WaterBodyDTO[];
    const fresh = createApp(models, config, { now: () => new Date(nowMs) });
    const reloaded = (await auth(request(fresh).get(base))).body.data.waterBodies as WaterBodyDTO[];
    expect(reloaded.map((w) => ({ id: w.id, fish: w.fishCount, water: w.waterLevel, q: w.waterQuality, hexes: w.hexes }))).toEqual(
      snapshot.map((w) => ({ id: w.id, fish: w.fishCount, water: w.waterLevel, q: w.waterQuality, hexes: w.hexes }))
    );

    // Hatchery: fry grow into fingerlings, the harvest gives fry for other ponds.
    advance(200);
    const h = await auth(request(app).post(`${base}/${hatch.id}/harvest`));
    expect(h.status).toBe(200);
    const fry = h.body.data.harvested.fry_carp as number;
    expect(fry).toBeGreaterThan(100);
    const fromHatchery = await auth(request(app).post(`${base}/${pond.id}/stock`)).send({ species: 'carp', count: 50, source: 'hatchery' });
    expect(fromHatchery.status).toBe(200);
    expect(fromHatchery.body.data.fish.fry_carp).toBe(fry - 50);
    expect((await auth(request(app).post(`${base}/${pond.id}/stock`)).send({ species: 'tilapia', count: 1, source: 'hatchery' })).body.error.code).toBe('NOT_ENOUGH_FRY');

    // Ownership: a stranger cannot feed / harvest / dig in this city.
    const stranger = await register('stranger');
    const other = await request(app).post(`${base}/${pond.id}/harvest`).set('Authorization', `Bearer ${stranger}`);
    expect(other.status).toBe(403);
    const otherDig = await request(app).post(`/api/v1/cities/${city.id}/water-bodies`).set('Authorization', `Bearer ${stranger}`).send({ type: 'fish_pond', hexes: region(6) });
    expect(otherDig.status).toBe(403);
  });

  it('fish cages: refused on land, accepted on natural water next to the territory', async () => {
    const { auth, base, region, world, dig } = await setup();
    const land = await auth(request(app).post(base)).send({ type: 'fish_cage', hexes: region(6) });
    expect(land.body.error.details.issues).toContain('NOT_WATER');
    const owned = world.getStarterTerritory();
    const water: AxialCoord[] = [];
    for (let q = world.spawn.q - 25; q <= world.spawn.q + 25; q += 1) {
      for (let r = world.spawn.r - 25; r <= world.spawn.r + 25; r += 1) {
        if (world.getHexTile(q, r).isWater && owned.some((o) => hexDistance(o, { q, r }) <= 3)) water.push({ q, r });
      }
    }
    const set = new Set(water.map((h) => hexKey(h.q, h.r)));
    const cage = water.length ? getConnectedHexes(water[0], (h) => set.has(hexKey(h.q, h.r)), 6) : [];
    if (cage.length < 6) return; // this seed has no lake next to the territory
    const c = await dig('fish_cage', cage);
    expect(c).toMatchObject({ status: 'active', waterLevel: 1 });
    expect((await auth(request(app).post(`${base}/${c.id}/fill`))).body.error.code).toBe('NATURAL_WATER');
  });
});
