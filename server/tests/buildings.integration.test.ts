import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { STARTING_MATERIALS, WorldGenerator, getBuildingLevel, hexNeighbors, type AxialCoord } from '@cityverse/shared';
import { createApp } from '../src/app.js';
import { createSequelizeInstance } from '../src/config/database.js';
import { loadEnv, type EnvConfig } from '../src/config/env.js';
import { initModels, type DatabaseModels } from '../src/database/models/index.js';

describe('Phase 3 – Building system API', () => {
  let config: EnvConfig;
  let models: DatabaseModels;
  let app: Express;
  let nowMs = Date.UTC(2026, 10, 21, 8, 0, 0);
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

  async function setup(name = 'builder') {
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
    const territory = world.getStarterTerritory();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const base = `/api/v1/cities/${city.id}/buildings`;
    return { token, city, world, territory, auth, base };
  }

  /** An owned hex whose 6 neighbours are also owned (room for multi-hex footprints). */
  function innerHexes(world: WorldGenerator, territory: readonly AxialCoord[]): AxialCoord[] {
    return territory.filter((h) => hexNeighbors(h).every((n) => world.isOwned(n.q, n.r)));
  }

  it('persists edge roads beside houses without reserving plots or charging duplicates', async () => {
    const { auth, base, city, world } = await setup();
    const anchor = { q: world.spawn.q, r: world.spawn.r };
    const road = await auth(request(app).post(base)).send({ typeCode: 'road', ...anchor, rotation: 0 });
    expect(road.status).toBe(201);
    expect(await models.BuildingFootprint.count({ where: { buildingId: road.body.data.building.id } })).toBe(0);
    const duplicate = await auth(request(app).post(base)).send({ typeCode: 'road', q: anchor.q + 1, r: anchor.r, rotation: 3 });
    expect(duplicate.status).toBe(400);
    expect((await auth(request(app).get(base))).body.data.resources).toEqual(road.body.data.resources);
    const house = await auth(request(app).post(base)).send({ typeCode: 'house', ...anchor, rotation: 0 });
    expect(house.status).toBe(201);
    advance(60);
    const side = await auth(request(app).post(base)).send({ typeCode: 'road', ...anchor, rotation: 1 });
    expect(side.status).toBe(201);
    advance(10);
    const state = (await auth(request(app).get(base))).body.data;
    expect(state.buildings).toHaveLength(3);
    expect(state.buildings.filter((b: { typeCode: string }) => b.typeCode === 'road').every((b: { status: string }) => b.status === 'active')).toBe(true);
    expect(await models.BuildingFootprint.count({ where: { cityId: city.id } })).toBe(1);
    const move = await auth(request(app).post(`${base}/${side.body.data.building.id}/move`)).send({ ...anchor, rotation: 0 });
    expect(move.status).toBe(400);
    const other = await setup('pathvisitor');
    expect((await other.auth(request(app).post(base)).send({ typeCode: 'road', ...anchor, rotation: 2 })).status).toBe(403);
    expect((await other.auth(request(app).get(other.base))).body.data.buildings).toEqual([]);
  });

  it('starts empty with starting resources and serves the catalogue from the database', async () => {
    const { auth, base } = await setup();
    const res = await auth(request(app).get(base));
    expect(res.status).toBe(200);
    expect(res.body.data.buildings).toEqual([]);
    expect(res.body.data.resources).toEqual({ coins: 250000, ...STARTING_MATERIALS });

    const cat = await auth(request(app).get('/api/v1/buildings/catalog'));
    expect(cat.status).toBe(200);
    const codes = cat.body.data.map((t: { code: string }) => t.code).sort();
    expect(codes).toEqual(['archery_range', 'carpentry', 'clinic', 'crossbow_range', 'house', 'market', 'military_depot', 'military_forge', 'quarry', 'radar', 'road', 'smithy', 'spear_barracks', 'storage', 'sword_barracks', 'territory_center', 'training_ground', 'well']);
    const house = cat.body.data.find((t: { code: string }) => t.code === 'house');
    expect(house.footprint).toEqual([{ q: 0, r: 0 }]);
    expect(house.levels.map((l: { stats: { residents: number } }) => l.stats.residents)).toEqual([4, 6, 10]);
    // 10 buildings × 3 levels, plus 6 livestock farm types (incl. horse stable & elephant camp) and 4 water body types (they own world_buildings rows) and 7 military buildings × 3 levels.
    expect(await models.BuildingLevel.count()).toBe(30 + 18 + 12 + 21 + 3);
  });

  it('builds a 1-hex house, upgrades it 1 → 2 → 3 keeping the same id and position, and it survives refresh', async () => {
    const { auth, base, world } = await setup();
    const spawn = { q: world.spawn.q, r: world.spawn.r };

    const placed = await auth(request(app).post(base)).send({ typeCode: 'house', ...spawn, rotation: 2 });
    expect(placed.status).toBe(201);
    const id = placed.body.data.building.id as string;
    expect(placed.body.data.building).toMatchObject({ status: 'constructing', level: 1, footprint: [spawn], rotation: 2 });
    const l1 = getBuildingLevel('house', 1)!;
    expect(placed.body.data.resources).toEqual({
      coins: 250000 - l1.cost.coins,
      wood: STARTING_MATERIALS.wood - l1.cost.wood,
      stone: STARTING_MATERIALS.stone - l1.cost.stone,
    });

    // Cannot upgrade while still under construction.
    expect((await auth(request(app).post(`${base}/${id}/upgrade`))).body.error.code).toBe('BUILDING_BUSY');

    advance(l1.buildSeconds);
    let state = await auth(request(app).get(base));
    expect(state.body.data.buildings[0]).toMatchObject({ id, status: 'active', level: 1, activeJob: null });

    for (const target of [2, 3]) {
      const up = await auth(request(app).post(`${base}/${id}/upgrade`));
      expect(up.status).toBe(200);
      // Same building id, same hex, old level kept until the job completes.
      expect(up.body.data.building).toMatchObject({ id, status: 'upgrading', level: target - 1, footprint: [spawn] });
      expect(up.body.data.building.activeJob).toMatchObject({ jobType: 'upgrade', fromLevel: target - 1, targetLevel: target });

      advance(getBuildingLevel('house', target)!.buildSeconds - 1);
      state = await auth(request(app).get(base));
      expect(state.body.data.buildings[0].level).toBe(target - 1);
      advance(1);
      state = await auth(request(app).get(base));
      expect(state.body.data.buildings[0]).toMatchObject({ id, level: target, status: 'active', footprint: [spawn] });
    }

    const maxed = await auth(request(app).post(`${base}/${id}/upgrade`));
    expect(maxed.status).toBe(400);
    expect(maxed.body.error.code).toBe('MAX_LEVEL_REACHED');

    // "Refresh": a brand-new app instance reading the same database sees level 3.
    const fresh = createApp(models, config, { now: () => new Date(nowMs) });
    const reloaded = await auth(request(fresh).get(base));
    expect(reloaded.body.data.buildings).toHaveLength(1);
    expect(reloaded.body.data.buildings[0]).toMatchObject({ id, level: 3, status: 'active' });
    expect(await models.WorldBuilding.count()).toBe(1);
    expect(await models.BuildingFootprint.count()).toBe(1);
    expect(await models.BuildingConstructionJob.count({ where: { status: 'completed' } })).toBe(3);
  });

  it('refuses to build on top of another building or outside owned land', async () => {
    const { auth, base, world } = await setup();
    const spawn = { q: world.spawn.q, r: world.spawn.r };
    expect((await auth(request(app).post(base)).send({ typeCode: 'house', ...spawn })).status).toBe(201);

    const overlap = await auth(request(app).post(base)).send({ typeCode: 'house', ...spawn });
    expect(overlap.status).toBe(400);
    expect(overlap.body.error.details.issues).toEqual(['OCCUPIED']);

    // A storage (2 hexes) whose second hex lands on the house is rejected too.
    const west = { q: spawn.q - 1, r: spawn.r };
    const partial = await auth(request(app).post(base)).send({ typeCode: 'storage', ...west, rotation: 0 });
    expect(partial.status).toBe(400);
    expect(partial.body.error.details.issues).toContain('OCCUPIED');

    const outside = await auth(request(app).post(base)).send({ typeCode: 'house', q: spawn.q + 25, r: spawn.r });
    expect(outside.status).toBe(400);
    expect(outside.body.error.details.issues).toContain('NOT_OWNED');

    expect(await models.WorldBuilding.count()).toBe(1);
  });

  it('only one of two simultaneous requests for the same hex succeeds', async () => {
    const { auth, base, world } = await setup();
    const spawn = { q: world.spawn.q, r: world.spawn.r };
    const [a, b] = await Promise.all([
      auth(request(app).post(base)).send({ typeCode: 'house', ...spawn }),
      auth(request(app).post(base)).send({ typeCode: 'house', ...spawn }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(await models.BuildingFootprint.count()).toBe(1);
  });

  it('the database itself rejects two footprints on one hex', async () => {
    const { city, auth, base, world } = await setup();
    const spawn = { q: world.spawn.q, r: world.spawn.r };
    const id = (await auth(request(app).post(base)).send({ typeCode: 'house', ...spawn })).body.data.building.id;
    await expect(models.BuildingFootprint.create({ cityId: city.id, buildingId: id, ...spawn })).rejects.toThrow(
      /unique|UNIQUE|Validation/
    );
  });

  it('does not upgrade (or change anything) when resources are insufficient', async () => {
    const { auth, base, world, city } = await setup();
    const spawn = { q: world.spawn.q, r: world.spawn.r };
    const placed = await auth(request(app).post(base)).send({ typeCode: 'house', ...spawn });
    const id = placed.body.data.building.id as string;
    advance(60);
    await auth(request(app).get(base));

    await models.CityResource.update({ amount: 10 }, { where: { cityId: city.id, resourceCode: 'stone' } });
    const before = (await auth(request(app).get(base))).body.data;

    const res = await auth(request(app).post(`${base}/${id}/upgrade`));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_RESOURCES');
    expect(res.body.error.details.missing).toEqual(['stone']);

    const after = (await auth(request(app).get(base))).body.data;
    expect(after.resources).toEqual(before.resources);
    expect(after.buildings[0]).toMatchObject({ id, level: 1, status: 'active', activeJob: null });
    expect(await models.BuildingConstructionJob.count({ where: { status: 'in_progress' } })).toBe(0);

    // Also blocks new buildings.
    const build = await auth(request(app).post(base)).send({ typeCode: 'house', q: spawn.q + 1, r: spawn.r });
    expect(build.body.error.code).toBe('INSUFFICIENT_RESOURCES');
  });

  it('moves a finished building (same id, new hex) and frees the old hex', async () => {
    const { auth, base, world } = await setup();
    const spawn = { q: world.spawn.q, r: world.spawn.r };
    const target = hexNeighbors(spawn).find((h) => world.isOwned(h.q, h.r))!;
    const id = (await auth(request(app).post(base)).send({ typeCode: 'house', ...spawn })).body.data.building.id;

    expect((await auth(request(app).post(`${base}/${id}/move`)).send(target)).body.error.code).toBe('BUILDING_BUSY');
    advance(60);
    const moved = await auth(request(app).post(`${base}/${id}/move`)).send({ ...target, rotation: 4 });
    expect(moved.status).toBe(200);
    expect(moved.body.data.building).toMatchObject({ id, anchorQ: target.q, anchorR: target.r, rotation: 4, footprint: [target] });
    expect((await auth(request(app).post(base)).send({ typeCode: 'house', ...spawn })).status).toBe(201);
  });

  it('demolishes with refund: unfinished job in full + 50 % of built levels', async () => {
    const { auth, base, world } = await setup();
    const spawn = { q: world.spawn.q, r: world.spawn.r };
    const placed = await auth(request(app).post(base)).send({ typeCode: 'house', ...spawn });
    const id = placed.body.data.building.id;
    advance(60);
    await auth(request(app).post(`${base}/${id}/upgrade`));
    const before = (await auth(request(app).get(base))).body.data.resources;

    const res = await auth(request(app).delete(`${base}/${id}`));
    expect(res.status).toBe(200);
    const l1 = getBuildingLevel('house', 1)!.cost;
    const l2 = getBuildingLevel('house', 2)!.cost;
    expect(res.body.data.refunded).toEqual({
      coins: l2.coins + Math.floor(l1.coins / 2),
      wood: l2.wood + Math.floor(l1.wood / 2),
      stone: l2.stone + Math.floor(l1.stone / 2),
    });
    expect(res.body.data.resources.coins).toBe(before.coins + res.body.data.refunded.coins);
    expect(await models.WorldBuilding.count()).toBe(0);
    expect(await models.BuildingFootprint.count()).toBe(0);
  });

  it('places multi-hex buildings with rotation, enforces the territory-centre limit and the job queue', async () => {
    const { auth, base, world, territory } = await setup();
    const inner = innerHexes(world, territory);
    const center = inner[0];
    const tc = await auth(request(app).post(base)).send({ typeCode: 'territory_center', ...center });
    expect(tc.status).toBe(201);
    expect(tc.body.data.building.footprint).toHaveLength(7);

    const second = inner.find((h) => Math.abs(h.q - center.q) + Math.abs(h.r - center.r) > 6)!;
    const dup = await auth(request(app).post(base)).send({ typeCode: 'territory_center', ...second });
    expect(dup.body.error.code).toBe('BUILDING_LIMIT_REACHED');

    // Two more jobs fill the queue of 3; the 4th is refused.
    const free = territory.filter((h) => !tc.body.data.building.footprint.some((f: AxialCoord) => f.q === h.q && f.r === h.r));
    expect((await auth(request(app).post(base)).send({ typeCode: 'house', ...free[0] })).status).toBe(201);
    expect((await auth(request(app).post(base)).send({ typeCode: 'house', ...free[1] })).status).toBe(201);
    const full = await auth(request(app).post(base)).send({ typeCode: 'house', ...free[2] });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('CONSTRUCTION_QUEUE_FULL');
  });

  it('visitors cannot build in someone else’s territory', async () => {
    const owner = await setup('owner1');
    const visitor = await setup('visitor1');
    const res = await visitor.auth(request(app).post(owner.base)).send({
      typeCode: 'house',
      q: owner.world.spawn.q,
      r: owner.world.spawn.r,
    });
    expect(res.status).toBe(403);
  });
});
