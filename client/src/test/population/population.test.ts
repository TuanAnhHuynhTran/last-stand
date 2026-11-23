import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HEX_DIRECTIONS,
  WorldGenerator,
  hexKey,
  survivorIdentity,
  type AxialCoord,
  type SurvivorDTO,
  type WorldBuildingDTO,
} from '@cityverse/shared';
import { VILLAGER_CLIPS, VillagerBrain, type VillageContext, type VillagerState } from '../../game/population/VillagerBrain';
import { MAX_DETAILED_VILLAGERS, VillagerRenderer } from '../../game/population/VillagerRenderer';
import { VillageNav } from '../../game/population/villageNav';
import { RIG, buildVillagerParts } from '../../game/population/villagerModels';
import { daylight } from '../../game/world/WorldEngine';

const world = new WorldGenerator('CV-COA-AABBCC112233');
const territory = world.getStarterTerritory().filter((h) => world.getHexTile(h.q, h.r).buildable);
const flat = () => 3;

function building(id: string, typeCode: WorldBuildingDTO['typeCode'], hexes: AxialCoord[], status: WorldBuildingDTO['status'] = 'active', level = 1): WorldBuildingDTO {
  return { id, cityId: 'c', typeCode, level, status, anchorQ: hexes[0].q, anchorR: hexes[0].r, rotation: 0, footprint: hexes, activeJob: null, createdAt: '', updatedAt: '' };
}

const near = (k: number): AxialCoord => territory[k];

function survivor(i: number, over: Partial<SurvivorDTO> = {}): SurvivorDTO {
  const id = survivorIdentity(i);
  return {
    id: `s${i}`,
    name: id.name,
    profession: 'carpenter',
    skills: {},
    health: 1,
    stamina: 1,
    satisfaction: 0.8,
    mood: 'happy',
    appearance: id.appearance,
    homeId: 'home',
    job: { kind: 'building', id: 'work' },
    activity: 'work',
    arrivedAt: '',
    origin: 'founder',
    soldier: false,
    ...over,
  };
}

/** A small village: house, workshop, a road between them, a centre. */
function village(extra: WorldBuildingDTO[] = []) {
  const house = [near(3)];
  const work = [near(40)];
  const centre = [near(0)];
  const buildings = [building('home', 'house', house), building('work', 'carpentry', work), building('centre', 'territory_center', centre), ...extra];
  const nav = new VillageNav({ world, buildings, fields: [], ranches: [], ponds: [] });
  const ctx: VillageContext = {
    nav,
    homes: new Map([['home', house]]),
    workplaces: new Map([['building:work', { kind: 'building', typeCode: 'carpentry', hexes: work }]]),
    haulFrom: [work],
    haulTo: [centre],
    gathering: [centre],
    fallback: centre[0],
  };
  return { ctx, nav, house, work, centre, buildings };
}

/** Every point along a route (sampled every 0.25 m) lies on a walkable hex. */
function routeIsValid(nav: VillageNav, pts: { x: number; z: number }[]): boolean {
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
    for (let k = 0; k <= n; k += 1) {
      const x = a.x + ((b.x - a.x) * k) / n;
      const z = a.z + ((b.z - a.z) * k) / n;
      if (!nav.walkableAt(x, z)) return false;
    }
  }
  return true;
}

describe('Chibi villager rig', () => {
  it('2.5–3.5 heads tall on one shared skeleton; every hat, tool and mood exists', () => {
    const p = buildVillagerParts();
    p.head.computeBoundingBox();
    const headH = p.head.boundingBox!.getSize(new THREE.Vector3()).y;
    const heads = RIG.height / headH;
    expect(heads).toBeGreaterThanOrEqual(2.5);
    expect(heads).toBeLessThanOrEqual(3.5);
    expect(Object.keys(p.mouths).sort()).toEqual(['content', 'happy', 'sad', 'tired']);
    expect(Object.keys(p.hats).length).toBeGreaterThanOrEqual(8);
    expect(p.hair).toHaveLength(4);
    expect(Object.keys(p.tools).length).toBeGreaterThanOrEqual(7);
  });
});

describe('Village navigation (hex A*)', () => {
  it('blocks buildings, construction sites, fenced farms, ponds and water; prefers roads', () => {
    const site = [near(20)];
    const ranch = [near(25), near(26)];
    const { nav } = village();
    const nav2 = new VillageNav({ world, buildings: [building('b', 'house', [near(5)]), building('site', 'house', site, 'constructing')], fields: [], ranches: [ranch], ponds: [[near(30)]] });
    expect(nav2.blocked.get(hexKey(near(5).q, near(5).r))).toBe('building');
    expect(nav2.blocked.get(hexKey(site[0].q, site[0].r))).toBe('construction');
    expect(nav2.blocked.get(hexKey(ranch[0].q, ranch[0].r))).toBe('fence');
    expect(nav2.blocked.get(hexKey(near(30).q, near(30).r))).toBe('water');
    expect(nav.isWalkable(hexKey(near(10).q, near(10).r))).toBe(true);

    // A road makes the detour cheaper than a straight walk over grass.
    const from = near(3);
    const to = territory.find((h) => Math.abs(h.q - from.q) + Math.abs(h.r - from.r) >= 6)!;
    const plain = new VillageNav({ world, buildings: [], fields: [], ranches: [], ponds: [] });
    const direct = plain.findPath(from, [to])!;
    const roadHexes = direct.slice(1, -1);
    const withRoad = new VillageNav({ world, buildings: roadHexes.map((h, i) => building(`r${i}`, 'road', [h])), fields: [], ranches: [], ponds: [] });
    const viaRoad = withRoad.findPath(from, [to])!;
    expect(viaRoad.filter((h) => withRoad.roads.has(hexKey(h.q, h.r))).length).toBe(roadHexes.length);
  });

  it('routes never cross blocked hexes (sampled every 25 cm), and an enclosed workplace is unreachable', () => {
    const walls = [5, 6, 7, 8, 9, 11, 12, 13].map((i) => building(`h${i}`, 'house', [near(i)]));
    const { nav } = village(walls);
    let checked = 0;
    for (let i = 0; i < 40; i += 1) {
      const a = territory[(i * 7) % territory.length];
      const b = territory[(i * 13 + 5) % territory.length];
      if (!nav.isWalkable(hexKey(a.q, a.r)) || !nav.isWalkable(hexKey(b.q, b.r))) continue;
      const path = nav.findPath(a, [b]);
      if (!path) continue;
      for (const h of path) expect(nav.isWalkable(hexKey(h.q, h.r))).toBe(true);
      for (let k = 1; k < path.length; k += 1) expect(HEX_DIRECTIONS.some((d) => path[k - 1].q + d.q === path[k].q && path[k - 1].r + d.r === path[k].r)).toBe(true);
      const start = nav.spotToward(a, a, 0);
      const end = nav.spotToward(b, b, 0);
      expect(routeIsValid(nav, nav.smooth(path, { x: start.x + 1.5, z: start.z - 1.5 }, end, 0.6))).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(15);
    // Ring of buildings around a target hex → no path.
    const target = near(60);
    const ring = HEX_DIRECTIONS.map((d) => ({ q: target.q + d.q, r: target.r + d.r }));
    const closed = new VillageNav({ world, buildings: ring.map((h, i) => building(`w${i}`, 'house', [h])), fields: [], ranches: [], ponds: [] });
    expect(closed.findPath(near(2), [target])).toBeNull();
  });
});

describe('Villager behaviour', () => {
  it('follows the day: home at night, working by day, eating at lunch, chatting in the evening — on valid routes only', () => {
    const { ctx, nav } = village();
    const brain = new VillagerBrain(ctx);
    brain.logRoutes = true;
    brain.sync(
      Array.from({ length: 6 }, (_, i) => survivor(i)),
      5
    );
    const seenAt: Record<string, Set<VillagerState>> = { night: new Set(), work: new Set(), lunch: new Set(), evening: new Set() };
    // One game day from 05:00, 1 game hour = 30 real seconds.
    for (let f = 0; f < 24 * 30 * 10; f += 1) {
      const hour = (5 + f / (30 * 10)) % 24;
      brain.update(0.1, hour, 8);
      const bucket = hour >= 23 || hour < 5.5 ? 'night' : hour >= 9 && hour < 11.5 ? 'work' : hour >= 12.4 && hour < 12.9 ? 'lunch' : hour >= 19 && hour < 20.3 ? 'evening' : null;
      if (bucket) for (const [s, n] of Object.entries(brain.states())) if (n) seenAt[bucket].add(s as VillagerState);
      if (f % 50 === 0) for (const p of brain.positions()) if (p.visible) expect(nav.walkableAt(p.x, p.z)).toBe(true);
    }
    expect(seenAt.work.has('WORK')).toBe(true);
    expect(seenAt.lunch.has('EAT')).toBe(true);
    expect([...seenAt.evening].some((s) => s === 'TALK' || s === 'SIT')).toBe(true);
    expect(seenAt.night.has('INSIDE')).toBe(true);
    expect(brain.routeLog.length).toBeGreaterThan(10);
    for (const r of brain.routeLog) expect(routeIsValid(nav, r.points)).toBe(true);
  });

  it('spawns at a sensible place for the hour (after reload) and reports unreachable workplaces', () => {
    const { ctx } = village();
    const day = new VillagerBrain(ctx);
    day.sync([survivor(1)], 10);
    expect(day.stateOf('s1')).toBe('WORK');
    const night = new VillagerBrain(ctx);
    night.sync([survivor(1)], 2);
    expect(night.stateOf('s1')).toBe('INSIDE');

    // Workshop walled in by houses: the villager says so instead of walking through walls.
    const work = ctx.workplaces.get('building:work')!.hexes[0];
    const ring = HEX_DIRECTIONS.map((d) => ({ q: work.q + d.q, r: work.r + d.r }));
    const walled = village(ring.map((h, i) => building(`x${i}`, 'house', [h])));
    const brain = new VillagerBrain(walled.ctx);
    brain.sync([survivor(2)], 7.5);
    for (let i = 0; i < 50; i += 1) brain.update(0.1, 7.6, 8);
    expect(Object.values(brain.unreachable()).join(' ')).toMatch(/Không thể tới|không có lối vào/);
  });

  it('animations cross-fade: weights sum to 1 and never jump in one frame', () => {
    const { ctx } = village();
    const brain = new VillagerBrain(ctx);
    brain.sync([survivor(3)], 7.4);
    let prev = brain.weightsOf('s3')!;
    let maxJump = 0;
    for (let f = 0; f < 3000; f += 1) {
      brain.update(1 / 60, 7.4 + f / 600, 8);
      const w = brain.weightsOf('s3')!;
      const sum = [...w.values()].reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 4);
      for (const c of VILLAGER_CLIPS) maxJump = Math.max(maxJump, Math.abs((w.get(c) ?? 0) - (prev.get(c) ?? 0)));
      prev = w;
    }
    expect(maxJump).toBeLessThan(0.3);
  });
});

describe('Villager renderer', () => {
  it(`draws at most ${MAX_DETAILED_VILLAGERS} detailed villagers and stays fast with 300 villagers`, () => {
    const { ctx } = village();
    const r = new VillagerRenderer(ctx);
    r.sync(Array.from({ length: 300 }, (_, i) => survivor(i, { job: null, homeId: null, profession: (['farmer', 'fisher', 'mason', 'transporter'] as const)[i % 4] })), 10);
    const c = r.brain.positions()[0];
    const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 2000);
    cam.position.set(c.x + 40, 60, c.z + 40);
    cam.lookAt(c.x, 3, c.z);
    r.update(0.016, 10, cam, flat); // warm-up (paths)
    const t0 = performance.now();
    for (let i = 0; i < 30; i += 1) r.update(0.016, 10 + i * 0.001, cam, flat);
    const ms = (performance.now() - t0) / 30;
    expect(r.stats.villagers).toBe(300);
    expect(r.stats.detailed).toBeLessThanOrEqual(MAX_DETAILED_VILLAGERS);
    expect(r.stats.detailed + r.stats.far + r.stats.culled + r.stats.inside).toBe(300);
    expect(ms).toBeLessThan(40);
    // A bounded number of draw calls whatever the population.
    expect(r.group.children.length).toBeLessThan(40);
    r.dispose();
  });

  it('daylight: night is dark, midday is full', () => {
    expect(daylight(2)).toBe(0);
    expect(daylight(12)).toBe(1);
    expect(daylight(6)).toBeGreaterThan(0);
    expect(daylight(6)).toBeLessThan(1);
  });
});
