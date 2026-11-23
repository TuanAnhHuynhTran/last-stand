import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WorldGenerator,
  getConnectedHexes,
  planRanchTiles,
  unitStats,
  type AxialCoord,
  type EquipmentCode,
  type FarmAnimalDTO,
  type LivestockFarmDTO,
  type LivestockFarmTypeCode,
  type MilitaryStateDTO,
  type MilitaryUnitDTO,
  type MountTraitsDTO,
  type UnitTypeCode,
} from '@cityverse/shared';
import { AnimalStateMachine, ELEPHANT_CLIPS, HORSE_CLIPS, type AnimationClip, type SimAnimal } from '../../game/livestock/AnimalStateMachine';
import { ANIMAL_SCALE, LivestockRenderer, activityOf } from '../../game/livestock/LivestockRenderer';
import { AnimalModelCache, buildAnimalParts } from '../../game/livestock/animalModels';
import { buildRanchScenery } from '../../game/livestock/ranchGround';
import { FENCE_MARGIN, NAV_CLEARANCE, computeRanchLayout } from '../../game/livestock/ranchLayout';
import { MilitaryRenderer, SOLDIER_SCALE } from '../../game/military/MilitaryRenderer';
import { RIDER_SEAT_OFFSET, ridingPose } from '../../game/military/soldierAnimation';
import { soldierMatrices } from '../../game/military/soldierRig';
import { RIG } from '../../game/population/villagerModels';
import { VILLAGER_SCALE } from '../../game/population/VillagerRenderer';

const world = new WorldGenerator('CV-COA-AABBCC112233');
const farmable = (h: AxialCoord) => world.isOwned(h.q, h.r) && world.getHexTile(h.q, h.r).buildable;
const stableHexes = getConnectedHexes({ q: world.spawn.q, r: world.spawn.r }, farmable, 9);
const campHexes = getConnectedHexes({ q: world.spawn.q, r: world.spawn.r }, farmable, 12);
const flat = () => 3;
const T0 = Date.UTC(2026, 10, 25, 10, 0, 0);

const traits = (over: Partial<MountTraitsDTO> = {}): MountTraitsDTO => ({
  tameness: 0.8,
  tame: true,
  stamina: 0.6,
  speed: 9,
  carry: 120,
  trainingLevel: 1,
  trainingLabel: 'Cơ bản',
  use: null,
  training: null,
  equipment: {},
  ...over,
});

function animal(id: string, code: 'horse' | 'elephant', t: MountTraitsDTO | null = traits()): FarmAnimalDTO {
  return {
    id,
    animalCode: code,
    breed: code === 'horse' ? 'bay' : 'asian',
    name: id,
    bornAt: new Date(T0 - 1_000_000).toISOString(),
    growsUpAt: new Date(T0 - 1).toISOString(),
    health: 1,
    satiety: 0.9,
    thirst: 0.1,
    status: 'healthy',
    traits: t,
  };
}

function farm(farmType: LivestockFarmTypeCode, level: number, animals: FarmAnimalDTO[], hexes: AxialCoord[]): LivestockFarmDTO {
  return {
    id: `00000000-0000-4000-8000-00000000009${level}`,
    buildingId: 'b',
    cityId: 'c',
    farmType,
    name: farmType,
    level,
    status: 'active',
    upgradeStartedAt: null,
    upgradeFinishesAt: null,
    hexes,
    tiles: planRanchTiles(hexes, level, farmType),
    capacity: 12,
    animals,
    jobs: [],
    feedStock: 300,
    feedCapacity: 1000,
    feedQuality: 0,
    waterStock: 300,
    waterCapacity: 1000,
    waterSource: 'well',
    effectiveWaterSource: 'well',
    caretakers: 2,
    maxCaretakers: 3,
    caretakersNeeded: 1,
    simulatedAt: new Date(T0).toISOString(),
    invested: { coins: 0, wood: 0, stone: 0 },
    totalProduced: 0,
    createdAt: '',
    updatedAt: '',
  };
}

describe('Phase 9 – chibi horses & elephants', () => {
  it('horses have a big head, seat, mane / tail; elephants are much bigger than a chibi, with trunk and ears', () => {
    const horse = buildAnimalParts('horse');
    const elephant = buildAnimalParts('elephant');
    for (const p of [horse, elephant]) {
      p.head.computeBoundingBox();
      p.body.computeBoundingBox();
    }
    const size = (g: THREE.BufferGeometry) => g.boundingBox!.getSize(new THREE.Vector3());
    expect(size(horse.head).x / size(horse.body).x).toBeGreaterThan(0.9); // chibi: big head
    expect(horse.rig.seat).toBeDefined();
    expect(horse.tail).toBeDefined();
    expect(horse.tack?.saddle && horse.tack.armor && horse.tack.harness).toBeTruthy();
    expect(elephant.trunk && elephant.ear).toBeTruthy();
    expect(elephant.rig.ears).toHaveLength(2);
    expect(elephant.tack?.howdah && elephant.tack.harness).toBeTruthy();
    // Shown size vs a chibi villager (≈ 1.85 m rig × display scale).
    expect(elephant.rig.height * ANIMAL_SCALE).toBeGreaterThan(RIG.height * VILLAGER_SCALE * 2);
    expect(horse.rig.legLength / horse.rig.height).toBeLessThan(0.4); // legs not too long
  });

  it('stable / camp layouts: training yard with a walkable lap, care area, manager house / tower, elephant pond', () => {
    const s1 = computeRanchLayout({ id: 's', farmType: 'horse_stable', level: 1, hexes: stableHexes });
    expect(s1.arena).toBeNull();
    expect(s1.loop.length).toBeGreaterThan(0);
    const s3 = computeRanchLayout({ id: 's', farmType: 'horse_stable', level: 3, hexes: stableHexes });
    expect(s3.arena && s3.vet && s3.office && s3.storage).toBeTruthy();
    expect(s3.loop.length).toBeGreaterThanOrEqual(6);
    for (const p of s3.loop) expect(s3.nav.isWalkable(p.x, p.z)).toBe(true);
    const c2 = computeRanchLayout({ id: 'c', farmType: 'elephant_camp', level: 2, hexes: campHexes });
    expect(c2.pond).toBeGreaterThan(2.5);
    expect(c2.clearance).toBe(NAV_CLEARANCE.elephant_camp);
    // Big animals keep more room from the fence than chickens.
    expect(c2.clearance + FENCE_MARGIN).toBeGreaterThan(FENCE_MARGIN + 0.5);
    const scenery = buildRanchScenery('elephant_camp', 3, computeRanchLayout({ id: 'c', farmType: 'elephant_camp', level: 3, hexes: campHexes }), campHexes, flat);
    expect(scenery.water).not.toBeNull(); // bathing pond
    scenery.solid.dispose();
    scenery.water?.dispose();
  });

  it('horses and elephants never walk through fences or buildings — grazing, training, riding or hauling', () => {
    const models = new AnimalModelCache();
    for (const [type, code, hexes] of [['horse_stable', 'horse', stableHexes], ['elephant_camp', 'elephant', campHexes]] as const) {
      const layout = computeRanchLayout({ id: type, farmType: type, level: 3, hexes });
      const sim = new AnimalStateMachine(layout, (c) => models.get(c).rig, type);
      const herd: SimAnimal[] = [
        { id: 'free', code, adult: true },
        { id: 'train', code, adult: true, activity: 'train' },
        { id: 'ride', code, adult: true, activity: code === 'horse' ? 'ride' : 'cargo' },
      ];
      sim.sync(herd);
      let bad = 0;
      for (let i = 0; i < 1500; i += 1) {
        sim.update(1 / 20, 8);
        for (const p of sim.positions()) if (!layout.nav.isWalkable(p.x, p.z)) bad += 1;
      }
      expect(bad, type).toBe(0);
    }
    models.dispose();
  });

  it('each species uses its own clips: horses trot / gallop / ride / rear, elephants train / cargo / trunk', () => {
    const models = new AnimalModelCache();
    const seen = (type: LivestockFarmTypeCode, code: 'horse' | 'elephant', herd: SimAnimal[], steps = 2400) => {
      const layout = computeRanchLayout({ id: type, farmType: type, level: 3, hexes: type === 'horse_stable' ? stableHexes : campHexes });
      const sim = new AnimalStateMachine(layout, (c) => models.get(c).rig, `${type}:clips`);
      sim.sync(herd);
      // Empty troughs startle grazing animals (horses rear up); working animals keep working.
      sim.setSupplies({ feed: false, water: false });
      const clips = new Map<string, Set<AnimationClip>>();
      for (let i = 0; i < steps; i += 1) {
        sim.update(1 / 20, 8);
        if (i === 600) sim.react();
        sim.forEachPose(i / 20, (id, _c, _p, _t, clip) => {
          const s = clips.get(id) ?? new Set<AnimationClip>();
          s.add(clip);
          clips.set(id, s);
        });
      }
      void code;
      return clips;
    };
    const h = seen('horse_stable', 'horse', [
      { id: 'train', code: 'horse', adult: true, activity: 'train' },
      { id: 'ride', code: 'horse', adult: true, activity: 'ride' },
      { id: 'free', code: 'horse', adult: true },
    ]);
    expect([...h.get('train')!]).toEqual(expect.arrayContaining(['trot', 'gallop']));
    expect(h.get('ride')!.has('ride')).toBe(true);
    expect(h.get('free')!.has('rear')).toBe(true); // startled by the empty trough
    for (const set of h.values()) for (const c of set) expect([...HORSE_CLIPS, 'sleep', 'happy', 'rest']).toContain(c);
    const e = seen('elephant_camp', 'elephant', [
      { id: 'train', code: 'elephant', adult: true, activity: 'train' },
      { id: 'cargo', code: 'elephant', adult: true, activity: 'cargo' },
      { id: 'free', code: 'elephant', adult: true },
    ]);
    expect(e.get('train')!.has('train')).toBe(true);
    expect(e.get('cargo')!.has('cargo')).toBe(true);
    for (const set of e.values()) for (const c of set) expect([...ELEPHANT_CLIPS, 'sleep', 'happy', 'react']).toContain(c);
    expect(activityOf(animal('x', 'horse', traits({ training: { jobId: 'j', program: 'riding', startedAt: '', finishesAt: '' } })))).toBe('train');
    expect(activityOf(animal('x', 'horse', traits({ use: { kind: 'mount', unitId: 'u', unitName: 'A', unitType: 'spearman' } })))).toBe('ride');
    expect(activityOf(animal('x', 'elephant', traits({ use: { kind: 'transport', since: '' } })))).toBe('cargo');
    models.dispose();
  });
});

describe('Phase 9 – riding', () => {
  function unit(id: string, type: UnitTypeCode, mountId: string | null): MilitaryUnitDTO {
    const eq: Record<UnitTypeCode, Partial<Record<string, EquipmentCode>>> = {
      swordsman: { weapon: 'eq_saber', offhand: 'eq_shield' },
      spearman: { weapon: 'eq_spear' },
      archer: { weapon: 'eq_bow', ammo: 'eq_arrows' },
      crossbowman: { weapon: 'eq_crossbow' },
    };
    return {
      id,
      survivorId: `s-${id}`,
      name: id,
      type,
      rank: 1,
      rankName: 'Tân binh',
      xp: 20,
      nextRankXp: 100,
      status: 'ready',
      buildingId: '',
      equipment: eq[type],
      stats: unitStats(type, 1, Object.values(eq[type]) as EquipmentCode[]),
      power: 10,
      ready: true,
      missing: [],
      squadIds: [],
      appearance: { skin: '#f6d2b4', hair: '#2b2116', hairStyle: 0, height: 1 },
      mount: mountId ? { animalId: mountId, farmId: 'f', name: 'Gió', breed: 'bay', speed: 9, trainingLevel: 1, armored: false } : null,
    };
  }

  const army = (units: MilitaryUnitDTO[]): MilitaryStateDTO => ({
    units,
    jobs: [],
    barracks: [],
    squads: [],
    equipment: {},
    recruitable: 0,
    food: 0,
    resources: { coins: 0, wood: 0, stone: 0 } as MilitaryStateDTO['resources'],
    serverTime: new Date(T0).toISOString(),
  });

  it('the rider sits on the saddle seat socket every frame and the camera can follow them', () => {
    const horse = animal('h1', 'horse', traits({ use: { kind: 'mount', unitId: 'r1', unitName: 'r1', unitType: 'spearman' }, equipment: { saddle: 'eq_saddle' } }));
    const stable = farm('horse_stable', 3, [horse], stableHexes);
    const live = new LivestockRenderer();
    live.sync([stable], flat, T0);
    const mil = new MilitaryRenderer();
    mil.setSeatProvider((id, out) => live.seatMatrix(id, out));
    mil.sync(army([unit('r1', 'spearman', 'h1')]), flat);
    const L = computeRanchLayout({ id: stable.id, farmType: 'horse_stable', level: 3, hexes: stableHexes, tiles: stable.tiles });
    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 2000);
    cam.position.set(L.frame.centroid.x, 40, L.frame.centroid.z + 40);
    cam.lookAt(L.frame.centroid.x, 3, L.frame.centroid.z);
    const seat = new THREE.Matrix4();
    const root = new THREE.Matrix4();
    const hips = new THREE.Vector3();
    const seatPos = new THREE.Vector3();
    const up = new THREE.Vector3();
    let frames = 0;
    for (let i = 0; i < 240; i += 1) {
      const t = i / 30;
      live.update(T0, 1 / 30, t, cam, flat);
      mil.update(1 / 30, t, cam);
      if (!live.seatMatrix('h1', seat)) continue;
      frames += 1;
      // Hips = seat + offset along the seat's up axis (in rider scale) — never drifting.
      mil.riderRoot(seat, SOLDIER_SCALE, root);
      const M = soldierMatrices(ridingPose('spearman', t));
      hips.setFromMatrixPosition(M.hips).applyMatrix4(root);
      seatPos.setFromMatrixPosition(seat);
      up.set(0, 1, 0).transformDirection(seat);
      const expected = seatPos.clone().addScaledVector(up, RIDER_SEAT_OFFSET * SOLDIER_SCALE);
      expect(hips.distanceTo(expected)).toBeLessThan(0.06); // lean only tilts the hips in place
      expect(mil.isRiding('r1')).toBe(true);
      expect(mil.positionOf('r1')!.x).toBeCloseTo(seatPos.x, 5);
    }
    expect(frames).toBeGreaterThan(200);
    expect(mil.partCount('torso')).toBe(1);
    expect(mil.partCount('spear')).toBe(1);
    expect(live.extraCount('horse:tack:saddle')).toBe(1);
    expect(live.clipOf('h1')).toBe('ride');
    // Dismounted (no mount) → back to the barracks (not drawn on a horse).
    mil.sync(army([unit('r1', 'spearman', null)]), flat);
    mil.update(1 / 30, 9, cam);
    expect(mil.isRiding('r1')).toBe(false);
    expect(mil.positionOf('r1')).toBeNull(); // no barracks in this test → not drawn anywhere
    live.dispose();
    mil.dispose();
  });

  it('weapons never pass through the horse while riding (spear, sabre + shield, bow)', () => {
    const parts = buildAnimalParts('horse');
    const rig = parts.rig;
    const horseRoot = new THREE.Matrix4().makeScale(ANIMAL_SCALE, ANIMAL_SCALE, ANIMAL_SCALE);
    const seat = new THREE.Matrix4().multiplyMatrices(horseRoot, new THREE.Matrix4().makeTranslation(0, rig.seat!.y, rig.seat!.z));
    const mil = new MilitaryRenderer();
    const root = mil.riderRoot(seat, SOLDIER_SCALE, new THREE.Matrix4());
    const inv = new THREE.Matrix4().copy(horseRoot).invert();
    // Horse volumes in its body frame: barrel, neck / chest, head.
    const inside = (p: THREE.Vector3): boolean => {
      const b = p.clone().applyMatrix4(inv);
      const barrel = ((b.x / 0.55) ** 2 + ((b.y - 1.3) / 0.45) ** 2 + (b.z / 0.85) ** 2) < 1;
      const chest = b.distanceTo(new THREE.Vector3(0, 1.45, 0.62)) < 0.42;
      const head = b.distanceTo(new THREE.Vector3(rig.head.x, rig.head.y + 0.28, rig.head.z + 0.12)) < 0.5;
      return barrel || chest || head;
    };
    const along = (m: THREE.Matrix4, z0: number, z1: number, y = 0) =>
      Array.from({ length: 24 }, (_, i) => new THREE.Vector3(0, y, z0 + ((z1 - z0) * i) / 23).applyMatrix4(m));
    for (const type of ['spearman', 'swordsman', 'archer'] as const) {
      for (let t = 0; t < 4; t += 0.1) {
        const M = soldierMatrices(ridingPose(type, t));
        const world = (m: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(root, m);
        const pts: THREE.Vector3[] = [];
        if (type === 'spearman') pts.push(...along(world(M.main), -0.8, 1.95));
        if (type === 'swordsman') {
          pts.push(...along(world(M.main), 0, 1.0));
          const off = world(M.off);
          for (let k = 0; k < 12; k += 1) {
            const a = (k / 12) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.1).applyMatrix4(off));
          }
        }
        if (type === 'archer') pts.push(...along(world(M.off), -0.6, 0.6, -0.1));
        const hits = pts.filter(inside).length;
        expect(hits, `${type} @${t.toFixed(1)}`).toBe(0);
      }
    }
    mil.dispose();
  });
});
