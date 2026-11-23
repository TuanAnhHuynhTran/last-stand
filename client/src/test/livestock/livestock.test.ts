import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ANIMAL_TYPE_CODES,
  LIVESTOCK_FARM_TYPE_CODES,
  WorldGenerator,
  getConnectedHexes,
  getLivestockFarmDefinition,
  hexDistance,
  hexKey,
  hexNeighbors,
  planRanchTiles,
  worldToAxial,
  type AnimalTypeCode,
  type AxialCoord,
  type LivestockFarmDTO,
  type LivestockFarmTypeCode,
} from '@cityverse/shared';
import { edgeDistance } from '../../game/farming/farmLayout';
import { buildAnimalParts } from '../../game/livestock/animalModels';
import {
  ANIMAL_BEHAVIOR_STATES,
  ANIMAL_TRANSITIONS,
  ANIMATION_CLIPS,
  AnimalStateMachine,
  type AnimalBehaviorState,
  type SimAnimal,
} from '../../game/livestock/AnimalStateMachine';
import { LOD_NEAR_DISTANCE, LivestockRenderer, MAX_DETAILED_ANIMALS } from '../../game/livestock/LivestockRenderer';
import { buildRanchScenery } from '../../game/livestock/ranchGround';
import { FENCE_MARGIN, WALL_MARGIN, computeRanchLayout, routePath } from '../../game/livestock/ranchLayout';
import { QUALITY_PRESETS } from '../../game/world/qualitySettings';
import { WorldEngine } from '../../game/world/WorldEngine';

const world = new WorldGenerator('CV-COA-AABBCC112233');
const farmable = (h: AxialCoord) => world.isOwned(h.q, h.r) && world.getHexTile(h.q, h.r).buildable;
const hexes = getConnectedHexes({ q: world.spawn.q, r: world.spawn.r }, farmable, 9);
const bigHexes = getConnectedHexes({ q: world.spawn.q, r: world.spawn.r }, farmable, 24);
const flat = () => 3;
const T0 = Date.UTC(2026, 10, 21, 10, 0, 0);

function rngOf(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function farm(
  farmType: LivestockFarmTypeCode,
  level: number,
  animals: [AnimalTypeCode, number, boolean][] = [],
  over: Partial<LivestockFarmDTO> = {},
  farmHexes: AxialCoord[] = hexes
): LivestockFarmDTO {
  let n = 0;
  return {
    id: `00000000-0000-4000-8000-0000000000${farmType.length}${level}`,
    buildingId: 'b',
    cityId: 'c',
    farmType,
    name: farmType,
    level,
    status: 'active',
    upgradeStartedAt: null,
    upgradeFinishesAt: null,
    hexes: farmHexes,
    tiles: planRanchTiles(farmHexes, level),
    capacity: 60,
    animals: animals.flatMap(([code, count, adult]) =>
      Array.from({ length: count }, () => {
        n += 1;
        return {
          id: `a-${code}-${n}`,
          animalCode: code,
          breed: getLivestockFarmDefinition(farmType).animals.includes(code) ? 'x' : 'x',
          name: `${code}${n}`,
          bornAt: new Date(T0 - 1_000_000).toISOString(),
          growsUpAt: new Date(adult ? T0 - 1 : T0 + 1_000_000).toISOString(),
          health: 1,
          satiety: 0.9,
          thirst: 0.1,
          status: adult ? ('healthy' as const) : ('young' as const),
        };
      })
    ),
    jobs: [],
    feedStock: 500,
    feedCapacity: 1000,
    feedQuality: 0,
    waterStock: 500,
    waterCapacity: 1000,
    waterSource: 'well',
    effectiveWaterSource: 'well',
    caretakers: 1,
    maxCaretakers: 1,
    caretakersNeeded: 1,
    simulatedAt: new Date(T0).toISOString(),
    invested: { coins: 0, wood: 0, stone: 0 },
    totalProduced: 0,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('Ranch layout, hex graph & pathfinding', () => {
  const layout = computeRanchLayout({ id: 'r', farmType: 'cattle_farm', level: 3, hexes: bigHexes });
  const inFarm = (p: { x: number; z: number }, list = bigHexes) => {
    const a = worldToAxial(p.x, p.z);
    return list.some((h) => h.q === a.q && h.r === a.r);
  };

  it('uses the server tile roles: barn, feeder, water trough and caretaker spot inside the farm; L3 adds nursery, waste, water tower, dividers', () => {
    for (const s of [layout.feeder, layout.water, layout.caretaker, layout.barn]) expect(inFarm(s)).toBe(true);
    expect(layout.pen && layout.waste && layout.tower && layout.storage).toBeTruthy();
    expect(layout.walls.length).toBeGreaterThan(0);
    const l1 = computeRanchLayout({ id: 'r', farmType: 'cattle_farm', level: 1, hexes });
    expect(l1.pen).toBeNull();
    expect(l1.storage).toBeNull();
    expect(l1.walls).toHaveLength(0);
    expect(computeRanchLayout({ id: 'r', farmType: 'cattle_farm', level: 2, hexes }).storage).not.toBeNull();
    expect(layout.feedPoints.length).toBeGreaterThan(2);
    expect(layout.drinkPoints.length).toBeGreaterThan(1);
    expect(layout.nurseryPoints.length).toBeGreaterThan(0);
    // The barn sits on the hex the server marked as barn.
    const barnTile = layout.tiles.find((t) => t.role === 'barn')!;
    expect(layout.barn.hex).toMatchObject({ q: barnTile.q, r: barnTile.r });
  });

  it('nav grid: every walkable cell is inside the fence, away from obstacles and dividing walls; the yard stays connected', () => {
    const { nav, frame, obstacles, walls } = layout;
    expect(nav.walkableCount).toBeGreaterThan(400);
    expect(nav.componentCount()).toBe(1);
    for (let j = 0; j < nav.h; j += 1) {
      for (let i = 0; i < nav.w; i += 1) {
        if (!nav.isCellWalkable(i, j)) continue;
        const p = nav.center(i, j);
        const a = worldToAxial(p.x, p.z);
        const key = hexKey(a.q, a.r);
        expect(frame.keys.has(key)).toBe(true);
        const c = frame.spotOn(a, 0);
        for (const dir of frame.outsideDirs.get(key) ?? []) expect(edgeDistance(p, c, dir)).toBeGreaterThanOrEqual(FENCE_MARGIN);
        for (const o of obstacles) expect(Math.hypot(p.x - o.x, p.z - o.z)).toBeGreaterThanOrEqual(o.r);
        for (const w of walls) {
          const vx = w.b.x - w.a.x;
          const vz = w.b.z - w.a.z;
          const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * vx + (p.z - w.a.z) * vz) / (vx * vx + vz * vz)));
          expect(Math.hypot(p.x - (w.a.x + vx * t), p.z - (w.a.z + vz * t))).toBeGreaterThanOrEqual(WALL_MARGIN);
        }
      }
    }
  });

  it('hex graph routes (and plain A*) never cross fences, walls or buildings', () => {
    const rng = rngOf(7);
    let found = 0;
    let viaGraph = 0;
    for (let k = 0; k < 40; k += 1) {
      const a = layout.nav.randomWalkable(rng);
      const b = layout.nav.randomWalkable(rng);
      const path = routePath(layout, a, b);
      if (!path) continue;
      found += 1;
      const ha = worldToAxial(a.x, a.z);
      const hb = worldToAxial(b.x, b.z);
      if ((layout.hexGraph.findHexPath(hexKey(ha.q, ha.r), hexKey(hb.q, hb.r))?.length ?? 0) > 3) viaGraph += 1;
      let prev = a;
      for (const p of path) {
        expect(layout.nav.lineOfSight(prev, p)).toBe(true);
        prev = p;
      }
      expect(Math.hypot(prev.x - b.x, prev.z - b.z)).toBeLessThan(1);
    }
    expect(found).toBeGreaterThan(30);
    expect(viaGraph).toBeGreaterThan(0);
  });

  it('hex graph: neighbours only, inside the farm', () => {
    const keys = [...layout.hexGraph.waypoints.keys()];
    const path = layout.hexGraph.findHexPath(keys[0], keys[keys.length - 1])!;
    expect(path[0]).toBe(keys[0]);
    for (let i = 1; i < path.length; i += 1) {
      const [q, r] = path[i - 1].split(',').map(Number);
      expect(hexNeighbors({ q, r }).map((n) => hexKey(n.q, n.r))).toContain(path[i]);
    }
  });
});

describe('Chibi animals', () => {
  it('every species has body / head / legs + LOD, big heads and readable size', () => {
    for (const code of ANIMAL_TYPE_CODES) {
      const p = buildAnimalParts(code);
      p.head.computeBoundingBox();
      p.body.computeBoundingBox();
      p.lod.computeBoundingBox();
      const head = p.head.boundingBox!.getSize(new THREE.Vector3());
      const body = p.body.boundingBox!.getSize(new THREE.Vector3());
      const all = p.lod.boundingBox!.getSize(new THREE.Vector3());
      expect(p.rig.hips.length, code).toBe(code === 'chicken' ? 2 : 4);
      // Chibi: head at least ~60 % of the body width, and the animal is not tiny.
      expect(head.x / body.x, `${code} head/body`).toBeGreaterThan(0.6);
      expect(all.y, `${code} height`).toBeGreaterThan(1.4);
      // The far LOD replaces every animated part (incl. trunk ×3, ears ×2, tail) and is lighter.
      const n = (g?: THREE.BufferGeometry, k = 1) => (g ? g.getAttribute('position').count * k : 0);
      expect(p.lod.getAttribute('position').count).toBeLessThan(
        n(p.body) + n(p.head) + n(p.leg, p.rig.hips.length) + n(p.trunk, 3) + n(p.ear, 2) + n(p.tail)
      );
    }
  });
});

describe('AnimalStateMachine', () => {
  const herd = (n: number, over: Partial<SimAnimal> = {}): SimAnimal[] =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, code: i % 2 ? 'sheep' : 'goat', adult: i < n - 2, ...over }));

  it('visits IDLE, WANDER, SEEK_FOOD, EAT, SEEK_WATER, DRINK, REST; only allowed transitions; never leaves the fence', () => {
    const layout = computeRanchLayout({ id: 'r', farmType: 'sheep_farm', level: 3, hexes: bigHexes });
    const sim = new AnimalStateMachine(layout, (c) => buildAnimalParts(c).rig, 'seed');
    const bad: string[] = [];
    sim.onTransition = (_id, from, to) => {
      if (!ANIMAL_TRANSITIONS[from].includes(to)) bad.push(`${from}->${to}`);
    };
    sim.sync(herd(12));
    const seen = new Set<AnimalBehaviorState>();
    for (let t = 0; t < 2400; t += 1) {
      sim.update(0.25, 8);
      const c = sim.stateCounts();
      for (const s of ANIMAL_BEHAVIOR_STATES) if (c[s]) seen.add(s);
      if (t % 25 === 0) for (const p of sim.positions()) expect(layout.nav.isWalkable(p.x, p.z) || layout.nav.nearestWalkable(p.x, p.z) !== null).toBe(true);
      if (t % 25 === 0) for (const p of sim.positions()) expect(layout.frame.keys.has(hexKey(worldToAxial(p.x, p.z).q, worldToAxial(p.x, p.z).r))).toBe(true);
    }
    for (const s of ['IDLE', 'WANDER', 'SEEK_FOOD', 'EAT', 'SEEK_WATER', 'DRINK', 'REST'] as const) expect(seen.has(s), s).toBe(true);
    expect(bad).toEqual([]);
    sim.react();
    expect(sim.stateCounts().REACT).toBe(12);
    sim.react(); // twice is fine
    let poses = 0;
    sim.forEachPose(1, (_id, _code, pose) => {
      poses += 1;
      expect(Number.isFinite(pose.x + pose.z + pose.yaw + pose.lift + pose.headPitch)).toBe(true);
    });
    expect(poses).toBe(12);
  });

  it('animations cross-fade: weights always sum to 1 and change gradually between states', () => {
    const layout = computeRanchLayout({ id: 'r', farmType: 'chicken_farm', level: 1, hexes });
    const sim = new AnimalStateMachine(layout, (c) => buildAnimalParts(c).rig, 'seed');
    sim.sync([{ id: 'hen', code: 'chicken', adult: true }]);
    let prev = sim.weightsOf('hen')!;
    let maxJump = 0;
    const clipsSeen = new Set<string>();
    for (let t = 0; t < 3000; t += 1) {
      sim.update(1 / 60, 4);
      const w = sim.weightsOf('hen')!;
      const sum = ANIMATION_CLIPS.reduce((s, c) => s + w[c], 0);
      expect(sum).toBeCloseTo(1, 5);
      for (const c of ANIMATION_CLIPS) {
        maxJump = Math.max(maxJump, Math.abs(w[c] - prev[c]));
        if (w[c] > 0.5) clipsSeen.add(c);
      }
      prev = w;
    }
    // At 60 fps no clip weight jumps by more than ~a quarter in one frame (no snapping).
    expect(maxJump).toBeLessThan(0.3);
    expect(clipsSeen.size).toBeGreaterThanOrEqual(3);
  });

  it('empty feeder / trough → the animal reacts instead of eating or drinking', () => {
    const layout = computeRanchLayout({ id: 'r', farmType: 'pig_farm', level: 1, hexes });
    const sim = new AnimalStateMachine(layout, (c) => buildAnimalParts(c).rig, 'seed');
    sim.setSupplies({ feed: false, water: false });
    // Starving, parched pigs (server stats).
    sim.sync(Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, code: 'pig' as const, adult: true, satiety: 0, thirst: 1, health: 0.4 })));
    const transitions: string[] = [];
    sim.onTransition = (_id, from, to) => transitions.push(`${from}->${to}`);
    for (let t = 0; t < 1600; t += 1) sim.update(0.25, 8);
    expect(transitions).toContain('SEEK_FOOD->REACT');
    expect(transitions).toContain('SEEK_WATER->REACT');
    expect(transitions).not.toContain('SEEK_FOOD->EAT');
    expect(transitions).not.toContain('SEEK_WATER->DRINK');
  });

  it('server needs drive behaviour: a hungry herd seeks food more often than a fed one', () => {
    const layout = computeRanchLayout({ id: 'r', farmType: 'chicken_farm', level: 2, hexes });
    const count = (satiety: number) => {
      const sim = new AnimalStateMachine(layout, (c) => buildAnimalParts(c).rig, 'seed');
      sim.sync(Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, code: 'chicken' as const, adult: true, satiety })));
      let seeks = 0;
      sim.onTransition = (_id, _from, to) => {
        if (to === 'SEEK_FOOD') seeks += 1;
      };
      for (let t = 0; t < 1200; t += 1) sim.update(0.25, 8);
      return seeks;
    };
    expect(count(0.1)).toBeGreaterThan(count(1));
  });

  it('young animals are smaller', () => {
    const layout = computeRanchLayout({ id: 'r', farmType: 'cattle_farm', level: 1, hexes });
    const sim = new AnimalStateMachine(layout, (c) => buildAnimalParts(c).rig, 'seed');
    sim.sync([
      { id: 'cow', code: 'cow', adult: true },
      { id: 'calf', code: 'cow', adult: false },
    ]);
    const scale: Record<string, number> = {};
    sim.forEachPose(0, (id, _c, pose) => {
      scale[id] = pose.scale;
    });
    expect(scale.calf).toBeLessThan(scale.cow);
  });
});

describe('Ranch scenery by level', () => {
  it('every farm type gets more detail at each level', () => {
    for (const t of LIVESTOCK_FARM_TYPE_CODES) {
      const counts = [1, 2, 3].map((level) => {
        const layout = computeRanchLayout({ id: 'r', farmType: t, level, hexes });
        return buildRanchScenery(t, level, layout, hexes, flat).solid.getAttribute('position').count;
      });
      expect(counts[1], `${t} L2 > L1`).toBeGreaterThan(counts[0]);
      expect(counts[2], `${t} L3 > L2`).toBeGreaterThan(counts[1]);
    }
    expect(getLivestockFarmDefinition('cattle_farm').minHexes).toBe(9);
  });
});

describe('LivestockRenderer: LOD, detail budget and animation culling', () => {
  const cameraAt = (x: number, y: number, z: number, target: THREE.Vector3) => {
    const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 2000);
    cam.position.set(x, y, z);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    return cam;
  };
  const pool = (r: LivestockRenderer, name: string) => r.group.children.find((o) => o.name === name) as THREE.InstancedMesh | undefined;

  it('near → animated parts, far → merged LOD, behind the camera → culled', () => {
    const r = new LivestockRenderer();
    r.sync([farm('chicken_farm', 1, [['chicken', 6, true], ['chicken', 2, false]])], flat, T0);
    const c = r.getEntry(farm('chicken_farm', 1).id)!.layout.frame.centroid;
    const target = new THREE.Vector3(c.x, 3, c.z);

    r.update(T0, 0.016, 0, cameraAt(c.x + 30, 40, c.z + 30, target), flat);
    expect(r.stats).toMatchObject({ animals: 8, near: 8, far: 0, culled: 0, caretakers: 1 });
    expect(pool(r, 'Animal:chicken:body')?.count).toBe(8);
    expect(pool(r, 'Animal:chicken:leg')?.count).toBe(16);

    const far = LOD_NEAR_DISTANCE + 60;
    r.update(T0, 0.016, 0.1, cameraAt(c.x + far * 0.6, far * 0.6, c.z + far * 0.5, target), flat);
    expect(r.stats).toMatchObject({ near: 0, far: 8, culled: 0 });
    expect(pool(r, 'Animal:chicken:lod')?.count).toBe(8);
    expect(pool(r, 'Animal:chicken:body')?.count).toBe(0);

    // Looking away from the farm: no matrices written at all.
    r.update(T0, 0.016, 0.2, cameraAt(c.x, 40, c.z + 60, new THREE.Vector3(c.x, 3, c.z + 200)), flat);
    expect(r.stats).toMatchObject({ near: 0, far: 0, culled: 8 });
    expect(pool(r, 'Animal:chicken:lod')?.count).toBe(0);
    r.dispose();
  });

  it(`limits detailed animation to ${MAX_DETAILED_ANIMALS} animals (the rest use the far LOD)`, () => {
    const r = new LivestockRenderer();
    const big = farm('chicken_farm', 3, [['chicken', MAX_DETAILED_ANIMALS + 10, true]], { capacity: 200 }, bigHexes);
    r.sync([big], flat, T0);
    const c = r.getEntry(big.id)!.layout.frame.centroid;
    r.update(T0, 0.016, 0, cameraAt(c.x + 30, 40, c.z + 30, new THREE.Vector3(c.x, 3, c.z)), flat);
    expect(r.stats.near).toBe(0);
    expect(r.stats.far).toBe(MAX_DETAILED_ANIMALS + 10);
    expect(r.stats.overBudget).toBe(MAX_DETAILED_ANIMALS + 10);
    r.dispose();
  });

  it('shows the products-ready marker and caretakers; occupancy uses ranch ids', () => {
    const r = new LivestockRenderer();
    const f = farm('pig_farm', 2, [['pig', 3, true]], { caretakers: 2 });
    f.jobs = [
      {
        id: 'j',
        jobType: 'produce',
        animalCode: null,
        breed: null,
        startedAt: new Date(T0 - 10_000).toISOString(),
        finishesAt: new Date(T0 - 1).toISOString(),
        status: 'ready',
        progress: {},
        output: { manure: 8 },
        efficiency: 1,
      },
    ];
    r.sync([f], flat, T0);
    const c = r.getEntry(f.id)!.layout.frame.centroid;
    r.update(T0, 0.016, 0, cameraAt(c.x + 30, 40, c.z + 30, new THREE.Vector3(c.x, 3, c.z)), flat);
    expect(r.getEntry(f.id)!.root.children.find((o) => o.name === 'Ranch:marker')!.visible).toBe(true);
    expect(r.stats.caretakers).toBe(2);
    expect([...r.occupiedHexes().values()].every((v) => v.startsWith('ranch:'))).toBe(true);
    r.dispose();
  });
});

describe('WorldEngine with livestock', () => {
  let engine: WorldEngine | null = null;
  afterEach(() => {
    engine?.dispose();
    engine = null;
  });

  it('livestock farms block buildings and fields; the draw tool enforces the per-type minimum and checks expansions', () => {
    engine = new WorldEngine(world, QUALITY_PRESETS.low);
    const cattle = farm('cattle_farm', 1, [['cow', 2, true]]);
    engine.setLivestock([cattle], 0);
    expect(engine.occupancy().get(hexKey(hexes[0].q, hexes[0].r))).toMatch(/^ranch:/);

    let last: unknown = 'unset';
    engine.attach(document.createElement('div'), new THREE.PerspectiveCamera(), {
      onHover: () => {},
      onSelect: () => {},
      onFocus: () => {},
      isBuildMode: () => true,
      onStats: () => {},
      onPlacementCheck: () => {},
      onPlaceAt: () => {},
      onSelectBuilding: () => {},
      onFarmDraftCheck: () => {},
      onPaintDraft: () => {},
      onSelectFarm: () => {},
      onRanchDraftCheck: (c) => {
        last = c;
      },
      onSelectRanch: () => {},
    });
    const free = getConnectedHexes(
      world.getStarterTerritory().find((h) => farmable(h) && !engine!.occupancy().has(hexKey(h.q, h.r)))!,
      (h) => farmable(h) && !engine!.occupancy().has(hexKey(h.q, h.r)),
      9
    );
    engine.setRanchDraft({ farmType: 'cattle_farm', hexes: free.slice(0, 7) });
    expect((last as { issues: string[] }).issues).toContain('TOO_SMALL');
    engine.setRanchDraft({ farmType: 'chicken_farm', hexes: free.slice(0, 7) });
    expect((last as { valid: boolean }).valid).toBe(true);
    engine.setRanchDraft({ farmType: 'cattle_farm', hexes: free });
    expect((last as { valid: boolean }).valid).toBe(true);
    engine.setRanchDraft({ farmType: 'pig_farm', hexes: [...free.slice(0, 6), hexes[0]] });
    expect((last as { issues: string[] }).issues).toContain('OCCUPIED');

    // Expansion: one free neighbour of the farm is valid (its own hexes don't block it).
    const keys = new Set(hexes.map((h) => hexKey(h.q, h.r)));
    const occ = engine.occupancy();
    const edge = hexes.flatMap((h) => hexNeighbors(h)).find((n) => farmable(n) && !keys.has(hexKey(n.q, n.r)) && !occ.has(hexKey(n.q, n.r)))!;
    engine.setRanchDraft({ farmType: 'cattle_farm', hexes: [edge], expandFarmId: cattle.id });
    expect((last as { valid: boolean }).valid).toBe(true);
    const lonely = world.getStarterTerritory().find((h) => farmable(h) && !occ.has(hexKey(h.q, h.r)) && hexes.every((x) => hexDistance(x, h) > 4))!;
    engine.setRanchDraft({ farmType: 'cattle_farm', hexes: [lonely], expandFarmId: cattle.id });
    expect((last as { issues: string[] }).issues).toContain('DISCONNECTED');
    engine.setRanchDraft(null);
    expect(last).toBeNull();
  });
});
