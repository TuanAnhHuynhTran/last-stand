import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { WorldGenerator, planNextAction, type BattleAction, type BattleClaimDTO, type BattleDTO, type BattleLobbyDTO, type MissionCode, type UnitTypeCode } from '@cityverse/shared';
import { createApp } from '../src/app.js';
import { createSequelizeInstance } from '../src/config/database.js';
import { loadEnv, type EnvConfig } from '../src/config/env.js';
import { initModels, type DatabaseModels } from '../src/database/models/index.js';

const KIT: Record<UnitTypeCode, [string, string][]> = {
  swordsman: [['weapon', 'eq_saber'], ['offhand', 'eq_shield'], ['armor', 'eq_leather_armor']],
  spearman: [['weapon', 'eq_spear'], ['armor', 'eq_leather_armor']],
  archer: [['weapon', 'eq_bow'], ['ammo', 'eq_arrows']],
  crossbowman: [['weapon', 'eq_crossbow'], ['ammo', 'eq_bolts'], ['armor', 'eq_leather_armor']],
};

describe('Phase 11 – Tactical battles API', () => {
  let config: EnvConfig;
  let models: DatabaseModels;
  let app: Express;
  let nowMs = Date.UTC(2026, 10, 27, 8, 0, 0);
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
      'BattleReward', 'BattleTurn', 'BattleActionRecord', 'BattleUnitRecord', 'BattleParticipant', 'BattleInstance',
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

  async function setup(name = 'commander') {
    const reg = await request(app).post('/api/v1/auth/register').send({ email: `${name}@lasthaven.io`, username: name, password: 'LastHaven2026' });
    const token = reg.body.data.tokens.accessToken as string;
    const cityRes = await request(app).post('/api/v1/cities').set('Authorization', `Bearer ${token}`).send({ name: `Haven ${name}`, terrainType: 'plains', isPublic: true });
    const city = cityRes.body.data as { id: string; worldSeed: string };
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    await auth(request(app).get(`/api/v1/cities/${city.id}/population`));
    await auth(request(app).get(`/api/v1/cities/${city.id}/military`)); // seeds unit_types / equipment_types
    /** Trained, equipped soldiers straight in the database (Phase 8 flows are tested elsewhere). */
    const soldiers = async (types: UnitTypeCode[]) => {
      const out: string[] = [];
      for (const [i, type] of types.entries()) {
        const s = await models.Survivor.create({
          cityId: city.id,
          name: `Lính ${i + 1}`,
          professionCode: null,
          skills: {},
          health: 1,
          stamina: 1,
          satisfaction: 0.8,
          appearance: { skin: '#f6d2b4', hair: '#2b2116', hairStyle: 0, height: 1 },
          origin: 'migration',
          seed: 1000 + i,
          assignable: true,
          arrivedAt: new Date(nowMs),
        });
        const u = await models.MilitaryUnit.create({ cityId: city.id, survivorId: s.id, unitTypeCode: type, buildingId: null, status: 'ready', recruitedAt: new Date(nowMs), trainedAt: new Date(nowMs), xp: 120, rank: 2 });
        for (const [slot, code] of KIT[type]) await models.UnitEquipment.create({ unitId: u.id, slot: slot as never, equipmentCode: code as never });
        out.push(u.id);
      }
      return out;
    };
    const lobby = async () => (await auth(request(app).get(`/api/v1/cities/${city.id}/battles`))).body.data as BattleLobbyDTO;
    const create = (mission: MissionCode, unitIds: string[], key = randomUUID()) => auth(request(app).post(`/api/v1/cities/${city.id}/battles`)).send({ mission, unitIds, idempotencyKey: key });
    const get = async (id: string) => (await auth(request(app).get(`/api/v1/battles/${id}`))).body.data as BattleDTO;
    const act = (b: { id: string; version: number }, action: BattleAction, clientActionId = randomUUID()) =>
      auth(request(app).post(`/api/v1/battles/${b.id}/actions`)).send({ clientActionId, expectedVersion: b.version, action });
    const endTurn = (b: { id: string; version: number }) => auth(request(app).post(`/api/v1/battles/${b.id}/end-turn`)).send({ clientActionId: randomUUID(), expectedVersion: b.version });
    const stock = async (code: string) => (await models.CityResource.findOne({ where: { cityId: city.id, resourceCode: code } }))?.amount ?? 0;
    return { city, auth, soldiers, lobby, create, get, act, endTurn, stock };
  }

  /** Plays the battle through the API with the shared planner (one validated intent at a time). */
  async function playOut(api: Awaited<ReturnType<typeof setup>>, start: BattleDTO): Promise<BattleDTO> {
    let b = start;
    if (b.phase === 'deployment') b = (await api.act(b, { type: 'start' })).body.data as BattleDTO;
    for (let i = 0; i < 600 && (b.phase === 'player' || b.phase === 'deployment'); i += 1) {
      const next = planNextAction(b.state);
      const res = next ? await api.act(b, next) : await api.endTurn(b);
      expect(res.status, JSON.stringify(res.body.error ?? {})).toBe(200);
      b = res.body.data as BattleDTO;
    }
    return b;
  }

  it('creates a battle only from ready, equipped, healthy soldiers and checks mission conditions', async () => {
    const api = await setup();
    const ids = await api.soldiers(['swordsman', 'spearman', 'archer', 'crossbowman']);
    expect((await api.create('rescue_survivors', ids.slice(0, 2))).status).toBe(400); // needs 3
    expect((await api.create('mutant_boss', ids)).body.error.code).toBe('MISSION_LOCKED'); // needs ruins first
    // An injured soldier and one without weapons cannot march out.
    const [hurt, bare] = await api.soldiers(['archer', 'spearman']);
    const hurtUnit = await models.MilitaryUnit.findByPk(hurt);
    await models.Survivor.update({ health: 0.2 }, { where: { id: hurtUnit!.survivorId } });
    await models.UnitEquipment.destroy({ where: { unitId: bare } });
    expect((await api.create('rescue_survivors', [ids[0], ids[1], hurt])).body.error.code).toBe('UNIT_UNAVAILABLE');
    expect((await api.create('rescue_survivors', [ids[0], ids[1], bare])).body.error.code).toBe('UNIT_UNAVAILABLE');
    const l = await api.lobby();
    expect(l.candidates.find((c) => c.id === hurt)?.reason).toMatch(/thương/);
    expect(l.missions.find((m) => m.mission.code === 'mutant_boss')?.available).toBe(false);

    const key = randomUUID();
    const res = await api.create('rescue_survivors', ids.slice(0, 3), key);
    expect(res.status).toBe(201);
    const b = res.body.data as BattleDTO;
    expect(b.phase).toBe('deployment');
    expect(b.state.tiles).toHaveLength(169);
    expect(b.state.units.filter((u) => u.side === 'player')).toHaveLength(3);
    // Same request again → the same battle; another battle while one is open → refused.
    expect(((await api.create('rescue_survivors', ids.slice(0, 3), key)).body.data as BattleDTO).id).toBe(b.id);
    expect((await api.create('reclaim_ruins', ids)).body.error.code).toBe('BATTLE_ACTIVE');
    expect(await models.MilitaryUnit.count({ where: { status: 'battle' } })).toBe(3);
    expect(await models.BattleUnitRecord.count({ where: { battleId: b.id } })).toBe(b.state.units.length);
    expect(await models.BattleParticipant.count({ where: { battleId: b.id } })).toBe(1);
    expect((await api.lobby()).active?.id).toBe(b.id);
  });

  it('validates every action on the server; the client cannot send damage', async () => {
    const api = await setup();
    const ids = await api.soldiers(['swordsman', 'spearman', 'archer']);
    let b = (await api.create('rescue_survivors', ids)).body.data as BattleDTO;
    const enemy = b.state.units.find((u) => u.side === 'enemy')!;
    expect((await api.act(b, { type: 'move', unitId: 'p1', to: { q: 0, r: 5 } })).body.error.code).toBe('WRONG_PHASE');
    b = (await api.act(b, { type: 'start' })).body.data as BattleDTO;
    expect((await api.act(b, { type: 'move', unitId: enemy.id, to: { q: enemy.q, r: enemy.r + 1 } })).body.error.code).toBe('NOT_YOUR_UNIT');
    expect((await api.act(b, { type: 'move', unitId: 'p1', to: { q: 0, r: -6 } })).body.error.code).toMatch(/TOO_FAR|BLOCKED|OCCUPIED/);
    expect((await api.act(b, { type: 'attack', unitId: 'p1', targetId: enemy.id })).body.error.code).toBe('OUT_OF_RANGE');
    // Extra fields (damage, rewards …) are rejected by the strict schema.
    const forged = await api.auth(request(app).post(`/api/v1/battles/${b.id}/actions`)).send({ clientActionId: randomUUID(), expectedVersion: b.version, action: { type: 'attack', unitId: 'p1', targetId: enemy.id, damage: 999 } });
    expect(forged.status).toBe(400);
    expect((await api.auth(request(app).post(`/api/v1/battles/${b.id}/rewards`)).send({ coins: 99999 })).status).toBe(400);
    // Acting on an old version is refused.
    expect((await api.act({ id: b.id, version: b.version - 1 }, { type: 'defend', unitId: 'p1' })).body.error.code).toBe('STALE_BATTLE');
    // Another player can't see or control the battle.
    const other = await setup('stranger');
    expect((await other.auth(request(app).get(`/api/v1/battles/${b.id}`))).status).toBe(403);
    expect(await models.BattleActionRecord.count({ where: { battleId: b.id } })).toBe(1); // only "start"
  });

  it('survives disconnects: state is saved, retries are not applied twice, turns are logged', async () => {
    const api = await setup();
    const ids = await api.soldiers(['swordsman', 'spearman', 'archer']);
    let b = (await api.create('rescue_survivors', ids)).body.data as BattleDTO;
    b = (await api.act(b, { type: 'start' })).body.data as BattleDTO;
    const to = b.state.deployZone.find((h) => !b.state.units.some((u) => u.q === h.q && u.r === h.r) && h.r === 6)!;
    const step = planNextAction(b.state) ?? { type: 'move' as const, unitId: 'p1', to };
    const id = randomUUID();
    const first = (await api.act(b, step, id)).body.data as BattleDTO;
    // The response was "lost": the client retries the same action with the same id.
    const retry = await api.act(b, step, id);
    expect(retry.status).toBe(200);
    expect((retry.body.data as BattleDTO).version).toBe(first.version);
    expect(retry.body.data.events).toEqual(first.events);
    expect(await models.BattleActionRecord.count({ where: { battleId: b.id } })).toBe(2);
    // Reconnect: the same state comes back.
    const again = await api.get(b.id);
    expect(again.version).toBe(first.version);
    expect(again.state.units).toEqual(first.state.units);
    const ended = (await api.endTurn(again)).body.data as BattleDTO;
    expect(ended.state.turn).toBe(2);
    expect(ended.events.some((e) => e.type === 'turn' && e.side === 'enemy')).toBe(true);
    expect(await models.BattleTurn.count({ where: { battleId: b.id } })).toBe(3); // player 1, enemy 1, player 2
  });

  it('plays a battle to the end: results stored, rewards paid exactly once, soldiers home, buildings untouched', async () => {
    const api = await setup();
    const ids = await api.soldiers(['swordsman', 'spearman', 'archer', 'crossbowman', 'swordsman', 'archer']);
    // A house in the player's own territory before the battle.
    const world = new WorldGenerator(api.city.worldSeed);
    const spot = world.getStarterTerritory().find((h) => world.getHexTile(h.q, h.r).buildable)!;
    const house = await api.auth(request(app).post(`/api/v1/cities/${api.city.id}/buildings`)).send({ typeCode: 'house', q: spot.q, r: spot.r });
    expect(house.status).toBe(201);
    const before = JSON.stringify((await models.WorldBuilding.findAll({ order: [['id', 'ASC']] })).map((x) => [x.id, x.typeCode, x.level, x.anchorQ, x.anchorR]));
    const buildings = await models.WorldBuilding.count();
    const footprints = await models.BuildingFootprint.count();
    expect(buildings).toBe(1);
    let b: BattleDTO | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const created = (await api.create('rescue_survivors', ids)).body.data as BattleDTO;
      b = await playOut(api, created);
      if (b.phase === 'victory') break;
      expect(await models.BattleReward.count({ where: { battleId: b.id } })).toBe(0); // defeat: no rewards
      expect((await api.auth(request(app).post(`/api/v1/battles/${b.id}/rewards`))).body.error.code).toBe('NOT_WON');
    }
    expect(b!.phase).toBe('victory');
    const battle = b!;
    expect(battle.state.outcome?.result).toBe('victory');
    expect(battle.rewards?.resources.coins).toBeGreaterThan(0);
    expect(await models.MilitaryUnit.count({ where: { status: 'battle' } })).toBe(0); // everyone is home
    const xp = (await models.MilitaryUnit.findAll({ where: { id: ids } })).map((u) => u.xp);
    expect(xp.every((x) => x > 120)).toBe(true);
    const units = await models.BattleUnitRecord.findAll({ where: { battleId: battle.id, side: 'player' } });
    expect(units.every((u) => u.endHp !== null && u.xpGained > 0)).toBe(true);
    for (const u of units.filter((x) => x.ko)) {
      const unit = await models.MilitaryUnit.findByPk(u.militaryUnitId!);
      expect((await models.Survivor.findByPk(unit!.survivorId))!.health).toBeLessThan(0.3); // injured
    }

    const tools = await api.stock('tools');
    const people = await models.Survivor.count({ where: { origin: 'rescue' } });
    const claims = await Promise.all([1, 2, 3].map(() => api.auth(request(app).post(`/api/v1/battles/${battle.id}/rewards`))));
    for (const c of claims) expect(c.status).toBe(200);
    const granted = claims.map((c) => (c.body.data as BattleClaimDTO).granted).filter(Boolean);
    expect(granted).toHaveLength(1);
    expect(await api.stock('tools')).toBe(tools + granted[0]!.goods.tools);
    expect(await models.Survivor.count({ where: { origin: 'rescue' } })).toBe(people + granted[0]!.survivors);
    expect(granted[0]!.survivors).toBeGreaterThan(0);
    expect((await api.get(battle.id)).claimed).toBe(true);
    // The battle never touched the player's world.
    expect(await models.WorldBuilding.count()).toBe(buildings);
    expect(await models.BuildingFootprint.count()).toBe(footprints);
    expect(JSON.stringify((await models.WorldBuilding.findAll({ order: [['id', 'ASC']] })).map((x) => [x.id, x.typeCode, x.level, x.anchorQ, x.anchorR]))).toBe(before);
    // Back in the lobby: no active battle, the mission cools down.
    const l = await api.lobby();
    expect(l.active).toBeNull();
    expect(l.missions.find((m) => m.mission.code === 'rescue_survivors')?.cooldownUntil).not.toBeNull();
    expect(l.history[0]).toMatchObject({ id: battle.id, phase: 'victory', claimed: true });
  });

  it('retreat and abandoned battles end in defeat without rewards and free the soldiers', async () => {
    const api = await setup();
    const ids = await api.soldiers(['swordsman', 'spearman', 'archer']);
    let b = (await api.create('rescue_survivors', ids)).body.data as BattleDTO;
    b = (await api.act(b, { type: 'start' })).body.data as BattleDTO;
    const r = (await api.act(b, { type: 'retreat' })).body.data as BattleDTO;
    expect(r.state.outcome).toMatchObject({ result: 'defeat', reason: 'retreat' });
    expect(await models.MilitaryUnit.count({ where: { status: 'battle' } })).toBe(0);
    expect((await api.act(r, { type: 'end_turn' })).body.error.code).toBe('BATTLE_FINISHED');

    const c = (await api.create('rescue_survivors', ids)).body.data as BattleDTO;
    advance(25 * 3600); // the player never came back
    const gone = await api.get(c.id);
    expect(gone.state.outcome).toMatchObject({ result: 'defeat', reason: 'abandoned' });
    expect(gone.rewards).toBeNull();
    expect(await models.MilitaryUnit.count({ where: { status: 'battle' } })).toBe(0);
    expect(await models.BattleReward.count()).toBe(0);
  });
});
