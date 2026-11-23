/**
 * Phase 12 – the whole player journey through the public HTTP API (20 steps), on one server
 * clock. Only two shortcuts, both standing in for content outside this journey and marked
 * `SHORTCUT`: build materials are topped up (instead of hours of quarrying) and equipment is
 * placed in storage (instead of running the forge chain, tested in military tests).
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import {
  WorldGenerator,
  getBuildingDefinition,
  getBuildingLevel,
  getConnectedHexes,
  planNextAction,
  trainingSeconds,
  type AllianceStateDTO,
  type AxialCoord,
  type BattleDTO,
  type BuildingTypeCode,
  type FriendsStateDTO,
  type MilitaryStateDTO,
  type PvpBattleDTO,
  type PvpRoomDTO,
  type PvpStateDTO,
} from '@cityverse/shared';
import { createApp } from '../src/app.js';
import { createSequelizeInstance } from '../src/config/database.js';
import { loadEnv } from '../src/config/env.js';
import { initModels, type DatabaseModels } from '../src/database/models/index.js';

describe('Phase 12 – E2E player journey (API)', () => {
  let models: DatabaseModels;
  let app: Express;
  let nowMs = Date.UTC(2026, 10, 29, 6, 0, 0);
  const advance = (s: number) => {
    nowMs += s * 1000;
  };

  beforeAll(async () => {
    const config = loadEnv({ NODE_ENV: 'test', DB_DIALECT: 'sqlite', DB_STORAGE: ':memory:', DB_LOGGING: 'false', BCRYPT_SALT_ROUNDS: 4, AUTH_RATE_LIMIT_WINDOW_MS: 60000, AUTH_RATE_LIMIT_MAX_ATTEMPTS: 1000 });
    models = initModels(createSequelizeInstance(config));
    await models.sequelize.sync({ force: true });
    app = createApp(models, config, { now: () => new Date(nowMs) });
  });
  afterAll(async () => {
    await models.sequelize.close();
  });

  async function commander(name: string) {
    let tokens: { accessToken: string; refreshToken: string } = { accessToken: '', refreshToken: '' };
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${tokens.accessToken}`);
    const p = {
      name,
      email: `${name}@lasthaven.io`,
      userId: '',
      cityId: '',
      world: null as unknown as WorldGenerator,
      auth,
      setTokens: (t: typeof tokens) => (tokens = t),
      tokens: () => tokens,
      give: async (code: string, amount: number) => {
        const row = await models.CityResource.findOne({ where: { cityId: p.cityId, resourceCode: code } });
        if (row) await row.update({ amount: row.amount + amount });
        else await models.CityResource.create({ cityId: p.cityId, resourceCode: code, amount });
      },
      used: new Set<string>(),
      build: async (typeCode: BuildingTypeCode) => {
        for (const h of p.world.getStarterTerritory().filter((x) => p.world.getHexTile(x.q, x.r).buildable)) {
          if (p.used.has(`${h.q},${h.r}`)) continue;
          const res = await auth(request(app).post(`/api/v1/cities/${p.cityId}/buildings`)).send({ typeCode, q: h.q, r: h.r });
          if (res.status === 201) {
            for (const f of res.body.data.building.footprint as AxialCoord[]) p.used.add(`${f.q},${f.r}`);
            return res.body.data.building as { id: string };
          }
        }
        throw new Error(`no room for ${typeCode}`);
      },
    };
    return p;
  }

  async function joinGame(p: Awaited<ReturnType<typeof commander>>) {
    const reg = await request(app).post('/api/v1/auth/register').send({ email: p.email, username: p.name, password: 'LastHaven2026' });
    expect(reg.status).toBe(201);
    p.userId = reg.body.data.user.id;
    p.setTokens(reg.body.data.tokens);
    expect((await p.auth(request(app).post('/api/v1/characters')).send({ name: `Chỉ huy ${p.name}`, presetId: 'urban-architect' })).status).toBe(201);
    const city = await p.auth(request(app).post('/api/v1/cities')).send({ name: `Haven ${p.name}`, terrainType: 'plains', isPublic: true });
    expect(city.status).toBe(201);
    p.cityId = city.body.data.id;
    p.world = new WorldGenerator(city.body.data.worldSeed);
  }

  async function army(p: Awaited<ReturnType<typeof commander>>) {
    // SHORTCUT: materials + equipment in storage (forge / quarry chains are covered elsewhere).
    await p.give('wood', 60000);
    await p.give('stone', 60000);
    for (const code of ['eq_saber', 'eq_shield', 'eq_leather_armor']) await p.give(code, 4);
    await p.give('vegetables', 2000); // recruits need food (farms make it, but slowly)
    await p.give('water', 2000);
    await p.auth(request(app).patch(`/api/v1/cities/${p.cityId}/population/settings`)).send({ autoAssign: false });
    const barracks = await p.build('sword_barracks');
    advance(getBuildingDefinition('sword_barracks').levels[0].buildSeconds + 1);
    expect((await p.auth(request(app).post(`/api/v1/cities/${p.cityId}/buildings/${barracks.id}/upgrade`))).status).toBe(200);
    advance(getBuildingLevel('sword_barracks', 2)!.buildSeconds + 1);
    const rec = await p.auth(request(app).post(`/api/v1/cities/${p.cityId}/military/recruit`)).send({ buildingId: barracks.id, unitType: 'swordsman', count: 3 });
    expect(rec.status, JSON.stringify(rec.body.error ?? {})).toBe(201);
    advance(trainingSeconds('swordsman', 2) + 1);
    const st = (await p.auth(request(app).get(`/api/v1/cities/${p.cityId}/military`))).body.data as MilitaryStateDTO;
    expect(st.units.filter((u) => u.status === 'ready')).toHaveLength(3);
    return st.units.map((u) => u.id);
  }

  it('register → build → farm → train → PvE → alliance → friend visit → PvP → logout → login → data intact', async () => {
    const a = await commander('journey');
    const b = await commander('companion');

    // 1-3. Register, create a character and a city.
    await joinGame(a);
    // 4. Look at the world (terrain metadata of my city).
    expect((await a.auth(request(app).get(`/api/v1/cities/${a.cityId}/terrain`))).status).toBe(200);
    // 5-6. Farm: a 6-hex rice paddy, plant, grow on the server clock, harvest.
    const farmable = (h: AxialCoord) => a.world.isOwned(h.q, h.r) && a.world.getHexTile(h.q, h.r).buildable;
    const hexes = getConnectedHexes(a.world.spawn, farmable, 6);
    const zone = await a.auth(request(app).post(`/api/v1/cities/${a.cityId}/farms`)).send({ zoneType: 'rice_paddy', hexes });
    expect(zone.status).toBe(201);
    for (const h of hexes) a.used.add(`${h.q},${h.r}`);
    const planted = await a.auth(request(app).post(`/api/v1/cities/${a.cityId}/farms/${zone.body.data.zone.id}/plant`)).send({ cropCode: 'rice' });
    expect(planted.status).toBe(200);
    nowMs = new Date(planted.body.data.zone.crop.readyAt).getTime() + 1000;
    const harvest = await a.auth(request(app).post(`/api/v1/cities/${a.cityId}/farms/${zone.body.data.zone.id}/harvest`));
    expect(harvest.status).toBe(200);
    expect(harvest.body.data.produce.rice).toBeGreaterThan(0);
    // 7. Build a house (construction finishes on server time).
    await a.give('wood', 500);
    const house = await a.build('house');
    advance(getBuildingDefinition('house').levels[0].buildSeconds + 1);
    const buildings = (await a.auth(request(app).get(`/api/v1/cities/${a.cityId}/buildings`))).body.data;
    expect(JSON.stringify(buildings)).toContain(house.id);
    // 8. Citizens.
    const pop = await a.auth(request(app).get(`/api/v1/cities/${a.cityId}/population`));
    expect(pop.status).toBe(200);
    // 9-10. Barracks (upgrade to 4 slots), recruit and train three swordsmen.
    const units = await army(a);
    // 11. Alliance: found one (costs coins).
    await models.CityEconomy.update({ cityCoins: 2000 }, { where: { cityId: a.cityId } });
    expect((await a.auth(request(app).post('/api/v1/alliances')).send({ name: 'Hành Trình', tag: 'HT' })).status).toBe(201);
    // 12-13. PvE mission played to the end through validated intents; rewards claimed once.
    const created = await a.auth(request(app).post(`/api/v1/cities/${a.cityId}/battles`)).send({ mission: 'rescue_survivors', unitIds: units, idempotencyKey: randomUUID() });
    expect(created.status, JSON.stringify(created.body.error ?? {})).toBe(201);
    let pve = created.body.data as BattleDTO;
    const pveAct = async (action: object, end = false) => {
      const res = end
        ? await a.auth(request(app).post(`/api/v1/battles/${pve.id}/end-turn`)).send({ clientActionId: randomUUID(), expectedVersion: pve.version })
        : await a.auth(request(app).post(`/api/v1/battles/${pve.id}/actions`)).send({ clientActionId: randomUUID(), expectedVersion: pve.version, action });
      expect(res.status, JSON.stringify(res.body.error ?? {})).toBe(200);
      pve = res.body.data as BattleDTO;
    };
    await pveAct({ type: 'start' });
    for (let i = 0; i < 600 && pve.phase === 'player'; i += 1) {
      const next = planNextAction(pve.state);
      await (next ? pveAct(next) : pveAct({}, true));
    }
    expect(['victory', 'defeat']).toContain(pve.phase);
    const quest = async () => ((await a.auth(request(app).get('/api/v1/alliance'))).body.data as AllianceStateDTO).quests.find((q) => q.code === 'pve_wins')!;
    if (pve.phase === 'victory') {
      const claim = await a.auth(request(app).post(`/api/v1/battles/${pve.id}/rewards`));
      expect(claim.body.data.granted).not.toBeNull();
      expect((await a.auth(request(app).post(`/api/v1/battles/${pve.id}/rewards`))).body.data.granted).toBeNull();
      expect((await quest()).progress).toBe(1); // alliance quest counts the PvE win
    } else {
      expect((await quest()).progress).toBe(0);
    }
    // Survivors heal before the duel (injuries are real).
    advance(3 * 86400);
    await a.auth(request(app).get(`/api/v1/cities/${a.cityId}/population`)); // the village simulation (food → health) runs

    // 14. A second commander joins; 15. friend request accepted.
    await joinGame(b);
    const bUnits = await army(b);
    expect((await b.auth(request(app).patch(`/api/v1/cities/${b.cityId}/visibility`)).send({ visibility: 'friends' })).status).toBe(200);
    expect((await a.auth(request(app).get(`/api/v1/cities/${b.cityId}`))).status).toBe(403);
    await a.auth(request(app).post('/api/v1/friends/requests')).send({ userId: b.userId });
    const inc = ((await b.auth(request(app).get('/api/v1/friends'))).body.data as FriendsStateDTO).incoming[0];
    expect((await b.auth(request(app).post(`/api/v1/friends/requests/${inc.id}/respond`)).send({ accept: true })).status).toBe(200);
    // 16. Visit the friend's world: read-only.
    const visit = await a.auth(request(app).get(`/api/v1/cities/${b.cityId}`));
    expect(visit.body.data.role).toBe('visitor');
    expect((await a.auth(request(app).get(`/api/v1/cities/${b.cityId}/buildings`))).status).toBe(200);
    expect((await a.auth(request(app).post(`/api/v1/cities/${b.cityId}/buildings`)).send({ typeCode: 'house', q: 0, r: 0 })).status).toBe(403);
    // 17. Friend joins the alliance.
    expect((await a.auth(request(app).post('/api/v1/alliance/invites')).send({ userId: b.userId })).status).toBe(201);
    const ainv = ((await b.auth(request(app).get('/api/v1/alliance'))).body.data as AllianceStateDTO).invites[0];
    expect((await b.auth(request(app).post(`/api/v1/alliance/invites/${ainv.id}/respond`)).send({ accept: true })).status).toBe(200);

    // 18. PvP duel (friendly room), both sides validated turn by turn.
    const ready = ((await a.auth(request(app).get(`/api/v1/cities/${a.cityId}/battles`))).body.data.candidates as { id: string; available: boolean }[]).filter((c) => c.available).map((c) => c.id);
    expect(ready.length).toBeGreaterThanOrEqual(3);
    const room = (await a.auth(request(app).post('/api/v1/pvp/rooms')).send({ inviteUserId: b.userId })).body.data as PvpRoomDTO;
    await b.auth(request(app).post(`/api/v1/pvp/rooms/${room.id}/join`));
    await a.auth(request(app).post(`/api/v1/pvp/rooms/${room.id}/roster`)).send({ unitIds: ready.slice(0, 3) });
    const started = (await b.auth(request(app).post(`/api/v1/pvp/rooms/${room.id}/roster`)).send({ unitIds: bUnits })).body.data as PvpRoomDTO;
    expect(started.status).toBe('in_battle');
    let duel = (await a.auth(request(app).get(`/api/v1/pvp/battles/${started.battleId}`))).body.data as PvpBattleDTO;
    for (let i = 0; i < 800 && duel.phase === 'player'; i += 1) {
      const side = duel.state.activeSide ?? 'player';
      const who = side === 'player' ? a : b;
      const next = planNextAction(duel.state, side);
      const res = next
        ? await who.auth(request(app).post(`/api/v1/pvp/battles/${duel.id}/actions`)).send({ clientActionId: randomUUID(), expectedVersion: duel.version, action: next })
        : await who.auth(request(app).post(`/api/v1/pvp/battles/${duel.id}/end-turn`)).send({ clientActionId: randomUUID(), expectedVersion: duel.version });
      expect(res.status, JSON.stringify(res.body.error ?? {})).toBe(200);
      duel = res.body.data as PvpBattleDTO;
    }
    expect(duel.state.outcome).not.toBeNull();
    const snapshot = {
      buildings: await models.WorldBuilding.count({ where: { cityId: a.cityId } }),
      rice: harvest.body.data.produce.rice as number,
      xp: (await models.MilitaryUnit.findAll({ where: { cityId: a.cityId } })).map((u) => u.xp).sort(),
    };

    // 19. Log out (refresh token revoked).
    const refresh = a.tokens().refreshToken;
    expect((await a.auth(request(app).post('/api/v1/auth/logout')).send({ refreshToken: refresh })).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: refresh })).status).toBe(401);
    // 20. Log in again: everything is still there.
    const login = await request(app).post('/api/v1/auth/login').send({ email: a.email, password: 'LastHaven2026' });
    expect(login.status).toBe(200);
    a.setTokens(login.body.data.tokens);
    expect((await a.auth(request(app).get('/api/v1/auth/me'))).status).toBe(200);
    expect((await a.auth(request(app).get(`/api/v1/cities/${a.cityId}`))).body.data.role).toBe('owner');
    expect(await models.WorldBuilding.count({ where: { cityId: a.cityId } })).toBe(snapshot.buildings);
    const farms = (await a.auth(request(app).get(`/api/v1/cities/${a.cityId}/farms`))).body.data;
    expect(farms.zones).toHaveLength(1);
    expect(farms.produce.rice).toBeGreaterThanOrEqual(snapshot.rice);
    const mil = (await a.auth(request(app).get(`/api/v1/cities/${a.cityId}/military`))).body.data as MilitaryStateDTO;
    expect(mil.units.map((u) => u.xp).sort()).toEqual(snapshot.xp);
    expect(mil.units.every((u) => u.status === 'ready')).toBe(true);
    const pvp = (await a.auth(request(app).get('/api/v1/pvp'))).body.data as PvpStateDTO;
    expect(pvp.history).toHaveLength(1);
    expect(pvp.activeBattleId).toBeNull();
    const al = (await a.auth(request(app).get('/api/v1/alliance'))).body.data as AllianceStateDTO;
    expect(al.alliance?.name).toBe('Hành Trình');
    expect(al.members).toHaveLength(2);
    expect(((await a.auth(request(app).get('/api/v1/friends'))).body.data as FriendsStateDTO).friends).toHaveLength(1);
  }, 120_000);
});
