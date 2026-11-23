import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import {
  GRADUATION_XP,
  WorldGenerator,
  getBuildingDefinition,
  getBuildingLevel,
  trainingSeconds,
  type BuildingTypeCode,
  type MilitaryStateDTO,
} from '@cityverse/shared';
import { createApp } from '../src/app.js';
import { createSequelizeInstance } from '../src/config/database.js';
import { loadEnv, type EnvConfig } from '../src/config/env.js';
import { initModels, type DatabaseModels } from '../src/database/models/index.js';

describe('Phase 8 – Military barracks, soldiers & squads API', () => {
  let config: EnvConfig;
  let models: DatabaseModels;
  let app: Express;
  let nowMs = Date.UTC(2026, 10, 24, 8, 0, 0);
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

  async function setup(name = 'general') {
    const reg = await request(app).post('/api/v1/auth/register').send({ email: `${name}@lasthaven.io`, username: name, password: 'LastHaven2026' });
    const token = reg.body.data.tokens.accessToken as string;
    const cityRes = await request(app).post('/api/v1/cities').set('Authorization', `Bearer ${token}`).send({ name: `Haven ${name}`, terrainType: 'plains', isPublic: true });
    const city = cityRes.body.data as { id: string; worldSeed: string };
    const world = new WorldGenerator(city.worldSeed);
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const base = `/api/v1/cities/${city.id}/military`;
    const give = async (code: string, amount: number) => {
      const row = await models.CityResource.findOne({ where: { cityId: city.id, resourceCode: code } });
      if (row) await row.update({ amount });
      else await models.CityResource.create({ cityId: city.id, resourceCode: code, amount });
    };
    const stock = async (code: string) => (await models.CityResource.findOne({ where: { cityId: city.id, resourceCode: code } }))?.amount ?? 0;
    // Plenty of materials for the big military buildings; food for recruits and villagers.
    await give('wood', 50000);
    await give('stone', 50000);
    await give('vegetables', 2000);
    await give('water', 2000);
    const territory = world.getStarterTerritory().filter((h) => world.getHexTile(h.q, h.r).buildable);
    let cursor = 0;
    const build = async (typeCode: BuildingTypeCode) => {
      for (; cursor < territory.length; cursor += 1) {
        const h = territory[cursor];
        const res = await auth(request(app).post(`/api/v1/cities/${city.id}/buildings`)).send({ typeCode, q: h.q, r: h.r });
        if (res.status === 201) {
          cursor += 1;
          advance(getBuildingDefinition(typeCode).levels[0].buildSeconds + 1);
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
    const state = async () => {
      const res = await auth(request(app).get(base));
      expect(res.status).toBe(200);
      return res.body.data as MilitaryStateDTO;
    };
    const arm = async (n: number) => {
      await give('eq_saber', n);
      await give('eq_shield', n);
      await give('eq_leather_armor', n);
    };
    // Keep the economy from reshuffling villagers in the middle of a test.
    await auth(request(app).patch(`/api/v1/cities/${city.id}/population/settings`)).send({ autoAssign: false });
    return { city, auth, base, give, stock, build, upgrade, state, arm };
  }

  it('builds a 6-hex sword barracks and upgrades through three levels (2 / 4 / 6 slots, same footprint)', async () => {
    const { build, upgrade, state } = await setup();
    const b = await build('sword_barracks');
    expect(await models.BuildingFootprint.count({ where: { buildingId: b.id } })).toBe(6);
    let s = await state();
    expect(s.barracks).toHaveLength(1);
    expect(s.barracks[0]).toMatchObject({ buildingId: b.id, level: 1, slots: 2, free: 2, unitType: 'swordsman', ready: true });
    expect(s.barracks[0].hexes).toHaveLength(6);
    await upgrade(b.id, 'sword_barracks', 2);
    s = await state();
    expect(s.barracks[0]).toMatchObject({ level: 2, slots: 4 });
    await upgrade(b.id, 'sword_barracks', 3);
    s = await state();
    expect(s.barracks[0]).toMatchObject({ level: 3, slots: 6 });
    expect(s.barracks[0].hexes).toHaveLength(6);
    expect(s.barracks[0].trainSeconds).toBeLessThan(trainingSeconds('swordsman', 1));
    // A 9-hex training ground.
    const g = await build('training_ground');
    expect(await models.BuildingFootprint.count({ where: { buildingId: g.id } })).toBe(9);
  });

  it('cannot recruit more soldiers than citizens', async () => {
    const { build, upgrade, auth, base, arm, state } = await setup();
    const b = await build('sword_barracks');
    await upgrade(b.id, 'sword_barracks', 2);
    await upgrade(b.id, 'sword_barracks', 3);
    await arm(10);
    const s0 = await state();
    expect(s0.recruitable).toBe(5);
    const res = await auth(request(app).post(`${base}/recruit`)).send({ buildingId: b.id, unitType: 'swordsman', count: 6 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_ENOUGH_CITIZENS');
    expect(await models.MilitaryUnit.count()).toBe(0);
    // Wrong class for this barracks.
    const wrong = await auth(request(app).post(`${base}/recruit`)).send({ buildingId: b.id, unitType: 'archer', count: 1 });
    expect(wrong.status).toBe(400);
    // Slots are respected too.
    const ok = await auth(request(app).post(`${base}/recruit`)).send({ buildingId: b.id, unitType: 'swordsman', count: 5 });
    expect(ok.status).toBe(201);
    const s = ok.body.data.state as MilitaryStateDTO;
    expect(s.units).toHaveLength(5);
    expect(s.recruitable).toBe(0);
    // Soldiers leave civilian work.
    expect(await models.SurvivorJob.count({ where: { survivorId: s.units.map((u) => u.survivorId) } })).toBe(0);
  });

  it('cannot recruit or train without equipment; nothing is consumed', async () => {
    const { build, auth, base, give, stock } = await setup();
    const b = await build('sword_barracks');
    await give('eq_saber', 2);
    await give('eq_shield', 2); // no leather armour
    const food = await stock('vegetables');
    const res = await auth(request(app).post(`${base}/recruit`)).send({ buildingId: b.id, unitType: 'swordsman', count: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MISSING_EQUIPMENT');
    expect(res.body.error.details.missing).toContain('eq_leather_armor');
    expect(await stock('eq_saber')).toBe(2);
    expect(await stock('vegetables')).toBe(food);
    expect(await models.MilitaryUnit.count()).toBe(0);

    // Recruit (no training) with full kit, strip the armour, then training is refused.
    await give('eq_leather_armor', 1);
    const r = await auth(request(app).post(`${base}/recruit`)).send({ buildingId: b.id, unitType: 'swordsman', count: 1, startTraining: false });
    expect(r.status).toBe(201);
    const unit = (r.body.data.state as MilitaryStateDTO).units[0];
    expect(unit.status).toBe('recruit');
    const strip = await auth(request(app).put(`${base}/units/${unit.id}/equipment`)).send({ slot: 'armor', equipmentCode: null });
    expect(strip.status).toBe(200);
    expect(await stock('eq_leather_armor')).toBe(1); // returned to storage
    const train = await auth(request(app).post(`${base}/training`)).send({ buildingId: b.id, kind: 'recruit' });
    expect(train.status).toBe(409);
    expect(train.body.error.code).toBe('MISSING_EQUIPMENT');
    expect(await models.MilitaryTrainingJob.count()).toBe(0);
  });

  it('training runs on server time, survives refresh and completes exactly once', async () => {
    const { build, auth, base, arm, stock, state } = await setup();
    const b = await build('sword_barracks');
    await arm(2);
    const res = await auth(request(app).post(`${base}/recruit`)).send({ buildingId: b.id, unitType: 'swordsman', count: 2 });
    expect(res.status).toBe(201);
    let s = res.body.data.state as MilitaryStateDTO;
    expect(s.jobs).toHaveLength(1);
    expect(s.units.every((u) => u.status === 'training')).toBe(true);
    expect(s.barracks[0]).toMatchObject({ training: 2, free: 0 });
    expect(await stock('eq_saber')).toBe(0);
    const finishesAt = s.jobs[0].finishesAt;

    // Refresh mid-way: same job, same deadline.
    advance(trainingSeconds('swordsman', 1) / 2);
    s = await state();
    expect(s.jobs).toHaveLength(1);
    expect(s.jobs[0].finishesAt).toBe(finishesAt);
    expect(s.units.every((u) => u.status === 'training')).toBe(true);
    // Barracks is full.
    const full = await auth(request(app).post(`${base}/training`)).send({ buildingId: b.id, kind: 'drill' });
    expect(full.status).toBe(409);

    // Past the deadline: many concurrent reads, the reward is granted once.
    advance(trainingSeconds('swordsman', 1));
    await Promise.all([state(), state(), state(), state()]);
    s = await state();
    expect(s.jobs).toHaveLength(0);
    expect(s.units.every((u) => u.status === 'ready' && u.xp === GRADUATION_XP && u.ready)).toBe(true);
    expect(await models.MilitaryTrainingJob.count({ where: { status: 'completed' } })).toBe(1);
    expect((await models.MilitaryUnit.findAll()).every((u) => u.xp === GRADUATION_XP)).toBe(true);

    // A drill adds XP once more.
    const drill = await auth(request(app).post(`${base}/training`)).send({ buildingId: b.id, kind: 'drill' });
    expect(drill.status).toBe(201);
    advance(200);
    s = await state();
    expect(s.units.every((u) => u.status === 'ready' && u.xp > GRADUATION_XP)).toBe(true);
  });

  it('squads are stored in the database; a soldier is never in two deployed squads', async () => {
    const { build, auth, base, arm, state, stock } = await setup();
    const b = await build('sword_barracks');
    await arm(2);
    await auth(request(app).post(`${base}/recruit`)).send({ buildingId: b.id, unitType: 'swordsman', count: 2 });
    advance(trainingSeconds('swordsman', 1) + 1);
    const units = (await state()).units;

    const a = await auth(request(app).post(`${base}/squads`)).send({ name: 'Đội Hổ', formation: 'wedge' });
    expect(a.status).toBe(201);
    const squadA = (a.body.data.state as MilitaryStateDTO).squads[0];
    const add = await auth(request(app).post(`${base}/squads/${squadA.id}/members`)).send({ unitIds: units.map((u) => u.id) });
    expect(add.status).toBe(200);
    const deploy = await auth(request(app).patch(`${base}/squads/${squadA.id}`)).send({ status: 'deployed' });
    expect(deploy.status).toBe(200);

    // Persisted: a fresh read (and the DB) sees the same squad.
    const s = await state();
    expect(s.squads).toHaveLength(1);
    expect(s.squads[0]).toMatchObject({ name: 'Đội Hổ', formation: 'wedge', status: 'deployed', readiness: 1 });
    expect(s.squads[0].members).toEqual(units.map((u) => u.id));
    expect(s.squads[0].power).toBeGreaterThan(0);
    expect(await models.MilitarySquad.count()).toBe(1);
    expect(await models.MilitarySquadMember.count()).toBe(2);

    // Second squad with the same soldier cannot be deployed.
    const bRes = await auth(request(app).post(`${base}/squads`)).send({ name: 'Đội Báo' });
    const squadB = (bRes.body.data.state as MilitaryStateDTO).squads.find((x) => x.name === 'Đội Báo')!;
    expect((await auth(request(app).post(`${base}/squads/${squadB.id}/members`)).send({ unitIds: [units[0].id] })).status).toBe(200);
    const clash = await auth(request(app).patch(`${base}/squads/${squadB.id}`)).send({ status: 'deployed' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('UNIT_ON_MISSION');

    // Cannot discharge a soldier on a mission; after standby, discharge returns the kit.
    expect((await auth(request(app).delete(`${base}/units/${units[1].id}`))).status).toBe(409);
    await auth(request(app).patch(`${base}/squads/${squadA.id}`)).send({ status: 'standby' });
    const dis = await auth(request(app).delete(`${base}/units/${units[1].id}`));
    expect(dis.status).toBe(200);
    expect(await stock('eq_saber')).toBe(1);
    expect(await models.MilitaryUnit.count()).toBe(1);
    expect((await state()).recruitable).toBe(4);
  });
});
