import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { planNextAction, type AllianceStateDTO, type BattleAction, type FriendsStateDTO, type PvpBattleDTO, type PvpRoomDTO, type PvpStateDTO, type UnitTypeCode } from '@cityverse/shared';
import { createApp } from '../src/app.js';
import { createSequelizeInstance } from '../src/config/database.js';
import { loadEnv, type EnvConfig } from '../src/config/env.js';
import { initModels, type DatabaseModels } from '../src/database/models/index.js';
import { RealtimeBus } from '../src/realtime/bus.js';
import { attachRealtime, type RealtimeServices } from '../src/realtime/hub.js';

const KIT: Record<UnitTypeCode, [string, string][]> = {
  swordsman: [['weapon', 'eq_saber'], ['offhand', 'eq_shield'], ['armor', 'eq_leather_armor']],
  spearman: [['weapon', 'eq_spear'], ['armor', 'eq_leather_armor']],
  archer: [['weapon', 'eq_bow'], ['ammo', 'eq_arrows']],
  crossbowman: [['weapon', 'eq_crossbow'], ['ammo', 'eq_bolts'], ['armor', 'eq_leather_armor']],
};

describe('Phase 12 – friends, visits, PvP, ranking, alliances', () => {
  let config: EnvConfig;
  let models: DatabaseModels;
  let app: Express;
  let bus: RealtimeBus;
  let nowMs = Date.UTC(2026, 10, 28, 8, 0, 0);
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
    bus = new RealtimeBus();
    app = createApp(models, config, { now: () => new Date(nowMs), bus });
  });

  beforeEach(async () => {
    const order = [
      'AllianceQuest', 'AllianceInvite', 'AllianceMessage', 'AllianceMember', 'AllianceRole', 'Alliance',
      'PvpMatch', 'PvpRoom', 'PvpQueueEntry', 'PvpRating', 'PvpSeason', 'Notification', 'Friendship', 'FriendRequest',
      'BattleReward', 'BattleTurn', 'BattleActionRecord', 'BattleUnitRecord', 'BattleParticipant', 'BattleInstance',
      'MilitarySquadMember', 'MilitarySquad', 'MilitaryTrainingJob', 'UnitEquipment', 'MilitaryUnit',
      'ResourceTransaction', 'ProductionJob', 'SurvivorJob', 'SurvivorHousing', 'Survivor', 'WorldTimeState',
      'BuildingConstructionJob', 'BuildingFootprint', 'WorldBuilding', 'CityResource', 'CityChunk', 'CityEconomy', 'CityMember', 'City', 'Character', 'RefreshToken', 'User',
    ] as const;
    for (const name of order) await (models[name] as unknown as { destroy: (o: object) => Promise<number> }).destroy({ where: {} });
  });

  afterAll(async () => {
    await models.sequelize.close();
  });

  async function player(name: string, visibility: 'public' | 'friends' | 'private' = 'public') {
    const reg = await request(app).post('/api/v1/auth/register').send({ email: `${name}@lasthaven.io`, username: name, password: 'LastHaven2026' });
    expect(reg.status, JSON.stringify(reg.body)).toBe(201);
    const token = reg.body.data.tokens.accessToken as string;
    const userId = reg.body.data.user.id as string;
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const city = (await auth(request(app).post('/api/v1/cities')).send({ name: `Haven ${name}`, terrainType: 'plains', isPublic: true })).body.data as { id: string };
    if (visibility !== 'public') expect((await auth(request(app).patch(`/api/v1/cities/${city.id}/visibility`)).send({ visibility })).status).toBe(200);
    await auth(request(app).get(`/api/v1/cities/${city.id}/population`));
    await auth(request(app).get(`/api/v1/cities/${city.id}/military`));
    const soldiers = async (types: UnitTypeCode[]) => {
      const out: string[] = [];
      for (const [i, type] of types.entries()) {
        const s = await models.Survivor.create({
          cityId: city.id, name: `${name} ${i + 1}`, professionCode: null, skills: {}, health: 1, stamina: 1, satisfaction: 0.8,
          appearance: { skin: '#f6d2b4', hair: '#2b2116', hairStyle: 0, height: 1 }, origin: 'migration', seed: 1000 + i, assignable: true, arrivedAt: new Date(nowMs),
        });
        const u = await models.MilitaryUnit.create({ cityId: city.id, survivorId: s.id, unitTypeCode: type, buildingId: null, status: 'ready', recruitedAt: new Date(nowMs), trainedAt: new Date(nowMs), xp: 120, rank: 2 });
        for (const [slot, code] of KIT[type]) await models.UnitEquipment.create({ unitId: u.id, slot: slot as never, equipmentCode: code as never });
        out.push(u.id);
      }
      return out;
    };
    return { name, token, userId, city, auth, soldiers };
  }
  type P = Awaited<ReturnType<typeof player>>;

  async function befriend(a: P, b: P) {
    const r = await a.auth(request(app).post('/api/v1/friends/requests')).send({ userId: b.userId });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const incoming = ((await b.auth(request(app).get('/api/v1/friends'))).body.data as FriendsStateDTO).incoming;
    const ok = await b.auth(request(app).post(`/api/v1/friends/requests/${incoming[0].id}/respond`)).send({ accept: true });
    expect(ok.status).toBe(200);
  }

  const pvpGet = async (p: P, id: string) => (await p.auth(request(app).get(`/api/v1/pvp/battles/${id}`))).body.data as PvpBattleDTO;
  const pvpAct = (p: P, b: { id: string; version: number }, action: BattleAction, clientActionId = randomUUID()) =>
    p.auth(request(app).post(`/api/v1/pvp/battles/${b.id}/actions`)).send({ clientActionId, expectedVersion: b.version, action });
  const pvpEnd = (p: P, b: { id: string; version: number }) => p.auth(request(app).post(`/api/v1/pvp/battles/${b.id}/end-turn`)).send({ clientActionId: randomUUID(), expectedVersion: b.version });

  /** Both players play with the shared planner, each only on their own turn. */
  async function fight(host: P, guest: P, battleId: string): Promise<PvpBattleDTO> {
    let b = await pvpGet(host, battleId);
    for (let i = 0; i < 800 && b.phase === 'player'; i += 1) {
      const side = b.state.activeSide ?? 'player';
      const who = side === 'player' ? host : guest;
      const next = planNextAction(b.state, side);
      const res = next ? await pvpAct(who, b, next) : await pvpEnd(who, b);
      expect(res.status, JSON.stringify(res.body.error ?? {})).toBe(200);
      b = res.body.data as PvpBattleDTO;
    }
    return b;
  }

  async function friendlyDuel(a: P, b: P) {
    const room = (await a.auth(request(app).post('/api/v1/pvp/rooms')).send({ inviteUserId: b.userId })).body.data as PvpRoomDTO;
    expect((await b.auth(request(app).post(`/api/v1/pvp/rooms/${room.id}/join`))).status).toBe(200);
    const sa = await a.soldiers(['swordsman', 'spearman', 'archer']);
    const sb = await b.soldiers(['swordsman', 'spearman', 'archer']);
    expect((await a.auth(request(app).post(`/api/v1/pvp/rooms/${room.id}/roster`)).send({ unitIds: sa })).body.data.status).toBe('selecting');
    const done = (await b.auth(request(app).post(`/api/v1/pvp/rooms/${room.id}/roster`)).send({ unitIds: sb })).body.data as PvpRoomDTO;
    expect(done.status).toBe('in_battle');
    return { room: done, battleId: done.battleId!, sa, sb };
  }

  it('friends: search, requests with limits, reverse auto-accept, unfriend, notifications', async () => {
    const a = await player('alice');
    const b = await player('bob');
    const c = await player('carol');
    const found = (await a.auth(request(app).get('/api/v1/users/search?q=bo'))).body.data;
    expect(found.items.map((u: { username: string }) => u.username)).toEqual(['bob']);
    expect((await a.auth(request(app).get('/api/v1/users/search?q=b'))).status).toBe(400);
    expect((await a.auth(request(app).post('/api/v1/friends/requests')).send({ userId: a.userId })).status).toBe(400);
    expect((await a.auth(request(app).post('/api/v1/friends/requests')).send({ userId: b.userId })).status).toBe(201);
    // Duplicate → conflict, never two requests
    expect((await a.auth(request(app).post('/api/v1/friends/requests')).send({ userId: b.userId })).status).toBe(409);
    expect(await models.FriendRequest.count()).toBe(1);
    // Bob asks back → accepted instead of a second request
    const back = await b.auth(request(app).post('/api/v1/friends/requests')).send({ userId: a.userId });
    expect(back.status).toBe(201);
    expect((back.body.data as FriendsStateDTO).friends.map((f) => f.user.username)).toEqual(['alice']);
    expect(await models.Friendship.count()).toBe(1);
    const notes = (await a.auth(request(app).get('/api/v1/notifications'))).body.data;
    expect(notes.items.some((n: { kind: string }) => n.kind === 'friend_accepted')).toBe(true);
    // Decline + cool-down
    await c.auth(request(app).post('/api/v1/friends/requests')).send({ userId: a.userId });
    const inc = ((await a.auth(request(app).get('/api/v1/friends'))).body.data as FriendsStateDTO).incoming[0];
    expect((await a.auth(request(app).post(`/api/v1/friends/requests/${inc.id}/respond`)).send({ accept: false })).status).toBe(200);
    expect((await c.auth(request(app).post('/api/v1/friends/requests')).send({ userId: a.userId })).body.error.code).toBe('RECENTLY_DECLINED');
    // Only the recipient may answer
    await c.auth(request(app).post('/api/v1/friends/requests')).send({ userId: b.userId });
    const toBob = await models.FriendRequest.findOne({ where: { toUserId: b.userId, status: 'pending' } });
    expect((await a.auth(request(app).post(`/api/v1/friends/requests/${toBob!.id}/respond`)).send({ accept: true })).status).toBe(404);
    // Unfriend
    expect(((await a.auth(request(app).delete(`/api/v1/friends/${b.userId}`))).body.data as FriendsStateDTO).friends).toHaveLength(0);
  });

  it('visiting: public / friends-only / private, always read-only', async () => {
    const owner = await player('owner', 'friends');
    const friend = await player('friend');
    const stranger = await player('stranger');
    await befriend(owner, friend);
    expect((await stranger.auth(request(app).get(`/api/v1/cities/${owner.city.id}`))).status).toBe(403);
    const seen = await friend.auth(request(app).get(`/api/v1/cities/${owner.city.id}`));
    expect(seen.status).toBe(200);
    expect(seen.body.data.role).toBe('visitor');
    expect((await friend.auth(request(app).get(`/api/v1/cities/${owner.city.id}/buildings`))).status).toBe(200);
    // Visitors can never write: building, farming or visibility changes are refused.
    const place = await friend.auth(request(app).post(`/api/v1/cities/${owner.city.id}/buildings`)).send({ typeCode: 'house', q: 0, r: 0, rotation: 0 });
    expect(place.status).toBe(403);
    expect((await friend.auth(request(app).patch(`/api/v1/cities/${owner.city.id}/visibility`)).send({ visibility: 'public' })).status).toBe(403);
    // Visit invite only to friends
    expect((await owner.auth(request(app).post(`/api/v1/friends/${friend.userId}/visit-invite`))).status).toBe(200);
    expect((await owner.auth(request(app).post(`/api/v1/friends/${stranger.userId}/visit-invite`))).status).toBe(403);
    // Private: even friends are refused
    await owner.auth(request(app).patch(`/api/v1/cities/${owner.city.id}/visibility`)).send({ visibility: 'private' });
    expect((await friend.auth(request(app).get(`/api/v1/cities/${owner.city.id}`))).status).toBe(403);
    expect((await owner.auth(request(app).get(`/api/v1/cities/${owner.city.id}`))).status).toBe(200);
  });

  it('friendly PvP room: invites, rosters, turn checks, idempotent actions, both squads settled, no rating change', async () => {
    const a = await player('host');
    const b = await player('guest');
    const x = await player('intruder');
    // Only friends can be invited
    expect((await a.auth(request(app).post('/api/v1/pvp/rooms')).send({ inviteUserId: b.userId })).status).toBe(403);
    await befriend(a, b);
    const { battleId, sa, sb } = await friendlyDuel(a, b);
    const start = await pvpGet(a, battleId);
    expect(start.mySide).toBe('player');
    expect((await pvpGet(b, battleId)).mySide).toBe('enemy');
    expect(start.state.units.filter((u) => u.side === 'enemy')).toHaveLength(3);
    expect(start.turnDeadline).not.toBeNull();
    // Outsiders can't read or act
    expect((await x.auth(request(app).get(`/api/v1/pvp/battles/${battleId}`))).status).toBe(403);
    // PvE API refuses PvP battles
    expect((await a.auth(request(app).get(`/api/v1/battles/${battleId}`))).status).toBe(403);
    // Soldiers are busy in both cities
    expect(await models.MilitaryUnit.count({ where: { id: [...sa, ...sb], status: 'battle' } })).toBe(6);
    // Guest can't act on the host's turn
    const move = planNextAction(start.state, 'player')!;
    expect((await pvpAct(b, start, move)).body.error.code).toBe('NOT_YOUR_TURN');
    // Same clientActionId twice → applied once
    const id = randomUUID();
    const r1 = await pvpAct(a, start, move, id);
    expect(r1.status).toBe(200);
    const r2 = await pvpAct(a, start, move, id);
    expect(r2.status).toBe(200);
    expect(r2.body.data.version).toBe(r1.body.data.version);
    // Stale version refused
    expect((await pvpAct(a, start, move)).body.error.code).toBe('STALE_BATTLE');

    const end = await fight(a, b, battleId);
    expect(end.phase === 'victory' || end.phase === 'defeat').toBe(true);
    expect(end.state.outcome?.reason).toBeDefined();
    expect(await models.MilitaryUnit.count({ where: { id: [...sa, ...sb], status: 'ready' } })).toBe(6);
    const match = await models.PvpMatch.findOne({ where: { battleId } });
    expect(match?.reason.startsWith('friendly')).toBe(true);
    expect(match?.hostRatingAfter).toBe(match?.hostRatingBefore);
    expect(await models.PvpMatch.count()).toBe(1);
    const hist = (await a.auth(request(app).get('/api/v1/pvp/history'))).body.data;
    expect(hist.items).toHaveLength(1);
    // A finished battle refuses actions
    expect((await pvpEnd(a, end)).body.error.code).toBe('BATTLE_FINISHED');
  });

  it('ranked queue: matchmaking, retreat = loss, Elo once, leaderboard; newbie not matched with a far stronger squad', async () => {
    const a = await player('ranker');
    const b = await player('rival');
    const sa = await a.soldiers(['swordsman', 'spearman', 'archer']);
    const sb = await b.soldiers(['swordsman', 'spearman', 'archer']);
    const q1 = (await a.auth(request(app).post('/api/v1/pvp/queue')).send({ unitIds: sa })).body.data as PvpStateDTO;
    expect(q1.queue.queued).toBe(true);
    const q2 = (await b.auth(request(app).post('/api/v1/pvp/queue')).send({ unitIds: sb })).body.data as PvpStateDTO;
    expect(q2.queue.queued).toBe(false);
    expect(q2.activeBattleId).not.toBeNull();
    const battleId = q2.activeBattleId!;
    // In a battle → can't queue again
    expect((await a.auth(request(app).post('/api/v1/pvp/queue')).send({ unitIds: sa })).status).toBe(409);
    let bt = await pvpGet(a, battleId);
    // Host ends turn, guest retreats → host wins.
    bt = (await pvpEnd(a, bt)).body.data as PvpBattleDTO;
    const res = await pvpAct(b, bt, { type: 'retreat' });
    expect(res.status).toBe(200);
    expect(res.body.data.state.outcome.winner).toBe('player');
    const pa = (await a.auth(request(app).get('/api/v1/pvp'))).body.data as PvpStateDTO;
    const pb = (await b.auth(request(app).get('/api/v1/pvp'))).body.data as PvpStateDTO;
    expect(pa.profile.rating).toBeGreaterThan(1000);
    expect(pb.profile.rating).toBeLessThan(1000);
    expect(pa.profile.wins).toBe(1);
    expect(pb.profile.losses).toBe(1);
    expect(pa.history[0].result).toBe('win');
    // Reading again changes nothing (settled once)
    await pvpGet(b, battleId);
    expect(((await a.auth(request(app).get('/api/v1/pvp'))).body.data as PvpStateDTO).profile.rating).toBe(pa.profile.rating);
    const board = (await a.auth(request(app).get('/api/v1/pvp/leaderboard'))).body.data;
    expect(board.items.map((e: { username: string }) => e.username)).toEqual(['ranker', 'rival']);

    // Newbie protection: a veteran with a much stronger squad isn't matched with a newbie right away.
    const vet = await player('veteran');
    const rook = await player('rookie');
    const season = await models.PvpSeason.findOne();
    await models.PvpRating.create({ seasonId: season!.id, userId: vet.userId, rating: 1000, wins: 10, losses: 10 });
    const strong = await vet.soldiers(['crossbowman', 'crossbowman', 'swordsman', 'swordsman', 'spearman', 'archer']);
    await models.MilitaryUnit.update({ rank: 5, xp: 3000 }, { where: { id: strong } });
    const weak = await rook.soldiers(['archer', 'archer', 'archer']);
    await vet.auth(request(app).post('/api/v1/pvp/queue')).send({ unitIds: strong });
    const rq = (await rook.auth(request(app).post('/api/v1/pvp/queue')).send({ unitIds: weak })).body.data as PvpStateDTO;
    expect(rq.activeBattleId).toBeNull();
    expect(rq.queue.queued).toBe(true);
    await rook.auth(request(app).delete('/api/v1/pvp/queue'));
    expect(((await rook.auth(request(app).get('/api/v1/pvp'))).body.data as PvpStateDTO).queue.queued).toBe(false);
  });

  it('turn clock: an offline player forfeits after the limit; an online idle player only loses the turn', async () => {
    const a = await player('clock1');
    const b = await player('clock2');
    await befriend(a, b);
    const { battleId } = await friendlyDuel(a, b);
    // Host online and idle for 91 s → turn passes to the guest (no forfeit).
    bus.connected(a.userId);
    advance(91);
    let bt = await pvpGet(b, battleId);
    expect(bt.state.activeSide).toBe('enemy');
    expect(bt.phase).toBe('player');
    bus.disconnected(a.userId);
    // Guest offline 181 s → forfeit, host wins.
    advance(181);
    bt = await pvpGet(a, battleId);
    expect(bt.state.outcome?.reason).toBe('forfeit');
    expect(bt.state.outcome?.winner).toBe('player');
  });

  it('Socket.IO: JWT auth, validated actions, live updates to the opponent, reconnect state', async () => {
    const a = await player('sock1');
    const b = await player('sock2');
    await befriend(a, b);
    const server = http.createServer(app);
    attachRealtime(server, models, config, app.locals.realtime as RealtimeServices);
    await new Promise<void>((r) => server.listen(0, r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const open = (token?: string) =>
      new Promise<Socket>((resolve, reject) => {
        const s = connect(url, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
        s.on('connect', () => resolve(s));
        s.on('connect_error', (e) => reject(e));
      });
    try {
      await expect(open()).rejects.toThrow(/UNAUTHORIZED/);
      await expect(open('not-a-token')).rejects.toThrow(/UNAUTHORIZED/);
      const sa = await open(a.token);
      const sb = await open(b.token);
      expect(bus.isOnline(a.userId)).toBe(true);
      const { battleId } = await friendlyDuel(a, b);
      const emit = (s: Socket, ev: string, data: unknown) => new Promise<{ ok: boolean; data?: PvpBattleDTO; error?: { code: string } }>((r) => s.emit(ev, data, r));
      const joined = await emit(sb, 'battle:join', { battleId });
      expect(joined.ok).toBe(true);
      expect(joined.data!.mySide).toBe('enemy');
      // Bad payloads are rejected by the schema; guest can't act on host's turn.
      expect((await emit(sb, 'battle:action', { battleId, clientActionId: 'x', expectedVersion: 0, action: { type: 'end_turn' } })).ok).toBe(false);
      const state = joined.data!;
      const wrong = await emit(sb, 'battle:action', { battleId, clientActionId: randomUUID(), expectedVersion: state.version, action: { type: 'end_turn' } });
      expect(wrong.error?.code).toBe('NOT_YOUR_TURN');
      const update = new Promise<{ battleId: string; version: number }>((r) => sb.once('battle:update', r));
      const ok = await emit(sa, 'battle:action', { battleId, clientActionId: randomUUID(), expectedVersion: state.version, action: { type: 'end_turn' } });
      expect(ok.ok).toBe(true);
      expect((await update).version).toBe(ok.data!.version);
      // Reconnect: a fresh socket gets the authoritative state
      sb.disconnect();
      const again = await open(b.token);
      const re = await emit(again, 'battle:join', { battleId });
      expect(re.data!.version).toBe(ok.data!.version);
      expect(re.data!.state.activeSide).toBe('enemy');
      // Outsider can't join
      const x = await player('sock3');
      const sx = await open(x.token);
      expect((await emit(sx, 'battle:join', { battleId })).error?.code).toBe('BATTLE_FORBIDDEN');
      for (const s of [sa, again, sx]) s.disconnect();
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('alliances: create (paid), invites, roles & limits, chat with flood guard, quests paid once', async () => {
    const lead = await player('leader');
    const mem = await player('member');
    const out = await player('outsider');
    await models.CityEconomy.update({ cityCoins: 1000 }, { where: { cityId: lead.city.id } });
    const created = await lead.auth(request(app).post('/api/v1/alliances')).send({ name: 'Last Light', tag: 'lite', description: 'Ánh sáng cuối' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const st = created.body.data as AllianceStateDTO;
    expect(st.alliance?.tag).toBe('LITE');
    expect(st.me?.role).toBe('leader');
    expect(st.quests).toHaveLength(3);
    expect((await models.CityEconomy.findOne({ where: { cityId: lead.city.id } }))!.cityCoins).toBe(500);
    // Same tag → refused; second alliance for the same player → refused
    await models.CityEconomy.update({ cityCoins: 1000 }, { where: { cityId: out.city.id } });
    expect((await out.auth(request(app).post('/api/v1/alliances')).send({ name: 'Other', tag: 'LITE' })).body.error.code).toBe('ALLIANCE_TAKEN');
    expect((await models.CityEconomy.findOne({ where: { cityId: out.city.id } }))!.cityCoins).toBe(1000); // rolled back
    expect((await lead.auth(request(app).post('/api/v1/alliances')).send({ name: 'Again', tag: 'AGN' })).body.error.code).toBe('ALREADY_IN_ALLIANCE');

    expect((await lead.auth(request(app).post('/api/v1/alliance/invites')).send({ userId: mem.userId })).status).toBe(201);
    const inv = ((await mem.auth(request(app).get('/api/v1/alliance'))).body.data as AllianceStateDTO).invites[0];
    const joined = (await mem.auth(request(app).post(`/api/v1/alliance/invites/${inv.id}/respond`)).send({ accept: true })).body.data as AllianceStateDTO;
    expect(joined.me?.role).toBe('member');
    expect(joined.members).toHaveLength(2);
    // Members can't invite / kick; outsiders can't read chat
    expect((await mem.auth(request(app).post('/api/v1/alliance/invites')).send({ userId: out.userId })).status).toBe(403);
    expect((await mem.auth(request(app).delete(`/api/v1/alliance/members/${lead.userId}`))).status).toBe(403);
    expect((await out.auth(request(app).get('/api/v1/alliance/messages'))).status).toBe(403);
    // Promote → officer; officer still can't kick the leader
    expect((await lead.auth(request(app).patch(`/api/v1/alliance/members/${mem.userId}/role`)).send({ role: 'officer' })).status).toBe(200);
    expect((await mem.auth(request(app).delete(`/api/v1/alliance/members/${lead.userId}`))).status).toBe(403);
    // Leader can't leave without handing over
    expect((await lead.auth(request(app).post('/api/v1/alliance/leave'))).body.error.code).toBe('LEADER_MUST_TRANSFER');

    // Chat: 5 per 10 s, then 429; paginated newest first
    for (let i = 0; i < 5; i += 1) expect((await mem.auth(request(app).post('/api/v1/alliance/messages')).send({ body: `xin chào ${i}` })).status).toBe(201);
    expect((await mem.auth(request(app).post('/api/v1/alliance/messages')).send({ body: 'spam' })).status).toBe(429);
    advance(11);
    expect((await mem.auth(request(app).post('/api/v1/alliance/messages')).send({ body: 'lại đây' })).status).toBe(201);
    const feed = (await lead.auth(request(app).get('/api/v1/alliance/messages'))).body.data;
    expect(feed.items[0].body).toBe('lại đây');
    expect(feed.items).toHaveLength(6);

    // Donation: clamped to what the quest still needs, completion pays every member once.
    const wood = st.quests.find((q) => q.code === 'donate_wood')!;
    await models.CityResource.update({ amount: 9000 }, { where: { cityId: lead.city.id, resourceCode: 'wood' } });
    await models.CityResource.update({ amount: 9000 }, { where: { cityId: mem.city.id, resourceCode: 'wood' } });
    const coins = async (p: P) => (await models.CityEconomy.findOne({ where: { cityId: p.city.id } }))!.cityCoins;
    const before = { lead: await coins(lead), mem: await coins(mem) };
    expect((await lead.auth(request(app).post(`/api/v1/alliance/quests/${wood.id}/donate`)).send({ amount: 4000 })).status).toBe(200);
    const done = (await mem.auth(request(app).post(`/api/v1/alliance/quests/${wood.id}/donate`)).send({ amount: 5000 })).body.data as AllianceStateDTO;
    expect(done.quests.find((q) => q.id === wood.id)?.status).toBe('completed');
    expect((await models.CityResource.findOne({ where: { cityId: mem.city.id, resourceCode: 'wood' } }))!.amount).toBe(8000); // only 1000 taken
    expect(await coins(lead)).toBe(before.lead + 200);
    expect(await coins(mem)).toBe(before.mem + 200);
    expect((await lead.auth(request(app).post(`/api/v1/alliance/quests/${wood.id}/donate`)).send({ amount: 10 })).body.error.code).toBe('QUEST_CLOSED');
    expect(await coins(lead)).toBe(before.lead + 200);

    // Kick, transfer, disband
    expect((await lead.auth(request(app).post(`/api/v1/alliance/members/${mem.userId}/transfer`))).status).toBe(200);
    expect(((await mem.auth(request(app).get('/api/v1/alliance'))).body.data as AllianceStateDTO).me?.role).toBe('leader');
    expect((await mem.auth(request(app).delete(`/api/v1/alliance/members/${lead.userId}`))).status).toBe(200);
    expect(((await lead.auth(request(app).get('/api/v1/alliance'))).body.data as AllianceStateDTO).alliance).toBeNull();
    expect((await mem.auth(request(app).delete('/api/v1/alliance'))).status).toBe(200);
    expect(await models.Alliance.count()).toBe(0);
    expect(await models.AllianceMessage.count()).toBe(0);
  });
});
