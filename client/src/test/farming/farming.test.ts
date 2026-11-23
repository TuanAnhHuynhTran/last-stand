import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CROP_TYPE_CODES,
  FARM_ZONE_TYPE_CODES,
  WorldGenerator,
  getConnectedHexes,
  getFarmZoneLevel,
  hexKey,
  worldToAxial,
  type AxialCoord,
  type FarmZoneDTO,
  type FarmZoneTypeCode,
} from '@cityverse/shared';
import { computeZoneLayout } from '../../game/farming/farmLayout';
import { buildZoneScenery } from '../../game/farming/farmGround';
import { buildCropGeometry, buildFarmerGeometry, type StageIndex } from '../../game/farming/farmModels';
import { FarmRenderer } from '../../game/farming/FarmRenderer';
import { QUALITY_PRESETS } from '../../game/world/qualitySettings';
import { WorldEngine } from '../../game/world/WorldEngine';

const world = new WorldGenerator('CV-COA-AABBCC112233');
const farmable = (h: AxialCoord) => world.isOwned(h.q, h.r) && world.getHexTile(h.q, h.r).buildable;
const hexes = getConnectedHexes({ q: world.spawn.q, r: world.spawn.r }, farmable, 8);
const flat = () => 3;
const T0 = Date.UTC(2026, 10, 21, 9, 0, 0);

function zone(zoneType: FarmZoneTypeCode, level: number, crop: FarmZoneDTO['crop'] = null, extra: Partial<FarmZoneDTO> = {}): FarmZoneDTO {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    cityId: 'c',
    zoneType,
    name: zoneType,
    level,
    status: 'active',
    upgradeStartedAt: null,
    upgradeFinishesAt: null,
    hexes,
    irrigation: { kind: 'none', sourceType: 'rain', sourceHex: null, sourceDistance: null, naturalSupply: 0.5, supply: 0.5, fertility: 1 },
    crop,
    totalHarvested: 0,
    invested: { coins: 0, wood: 0, stone: 0 },
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

const riceCrop = (): FarmZoneDTO['crop'] => ({
  id: 'cy',
  cropCode: 'rice',
  plantedAt: new Date(T0).toISOString(),
  readyAt: new Date(T0 + 100_000).toISOString(),
  expectedYield: 100,
  waterFactor: 1,
  status: 'growing',
});

function bounds(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox();
  return g.boundingBox!;
}

function avgColor(g: THREE.BufferGeometry): THREE.Color {
  const c = g.getAttribute('color');
  let r = 0;
  let gg = 0;
  let b = 0;
  for (let i = 0; i < c.count; i += 1) {
    r += c.getX(i);
    gg += c.getY(i);
    b += c.getZ(i);
  }
  return new THREE.Color(r / c.count, gg / c.count, b / c.count);
}

describe('Farm layout', () => {
  it('is deterministic, keeps every crop inside the zone, and adds structures by level', () => {
    const l1 = computeZoneLayout({ id: 'z', zoneType: 'rice_paddy', level: 1, hexes });
    expect(computeZoneLayout({ id: 'z', zoneType: 'rice_paddy', level: 1, hexes })).toEqual(l1);
    const keys = new Set(hexes.map((h) => hexKey(h.q, h.r)));
    for (const s of l1.slots) {
      const a = worldToAxial(s.x, s.z);
      expect(keys.has(hexKey(a.q, a.r))).toBe(true);
    }
    expect(l1.hut).toBeNull();
    expect(l1.pump).toBeNull();
    const l2 = computeZoneLayout({ id: 'z', zoneType: 'rice_paddy', level: 2, hexes });
    expect(l2.hut).not.toBeNull();
    expect(l2.pump).toBeNull();
    const l3 = computeZoneLayout({ id: 'z', zoneType: 'rice_paddy', level: 3, hexes });
    expect(l3.hut && l3.pump && l3.scarecrow).toBeTruthy();
    expect(l3.flags.length).toBeGreaterThan(0);
    // Every edge of the zone is either a border or a shared interior edge.
    expect(l1.borderEdges.length + l1.interiorEdges.length * 2).toBe(hexes.length * 6);
  });

  it('every zone type gets plants on many slots', () => {
    for (const t of FARM_ZONE_TYPE_CODES) {
      for (const level of [1, 2, 3]) {
        const l = computeZoneLayout({ id: 'z', zoneType: t, level, hexes });
        expect(l.slots.length, `${t} L${level}`).toBeGreaterThan(t === 'orchard' ? 10 : 60);
      }
    }
  });
});

describe('Chibi crop models', () => {
  it('builds every crop at 4 growth stages', () => {
    for (const c of CROP_TYPE_CODES) {
      for (const s of [0, 1, 2, 3] as StageIndex[]) {
        const g = buildCropGeometry(c, s);
        expect(g.getAttribute('position').count).toBeGreaterThan(0);
        expect(g.getAttribute('color')).toBeDefined();
      }
    }
  });

  it('rice visibly grows (seeded < seedling < growing) and turns golden when ripe', () => {
    const [s0, s1, s2, s3] = ([0, 1, 2, 3] as StageIndex[]).map((s) => buildCropGeometry('rice', s));
    expect(bounds(s0).max.y).toBeLessThan(bounds(s1).max.y);
    expect(bounds(s1).max.y).toBeLessThan(bounds(s2).max.y);
    const green = avgColor(s2);
    const gold = avgColor(s3);
    expect(green.g).toBeGreaterThan(green.r * 1.5); // fresh green
    expect(gold.r).toBeGreaterThan(gold.g * 0.75); // golden (red ≈ green, little blue)
    expect(gold.r).toBeGreaterThan(green.r * 2);
  });

  it('chibi farmer is small with a big head and a conical hat', () => {
    const b = bounds(buildFarmerGeometry());
    expect(b.max.y).toBeGreaterThan(1.5);
    expect(b.max.y).toBeLessThan(2.1);
  });
});

describe('Zone scenery by level', () => {
  it('adds canal water at L2 and more detail at every level, for every zone type', () => {
    for (const t of FARM_ZONE_TYPE_CODES) {
      const counts = [1, 2, 3].map((level) => {
        const layout = computeZoneLayout({ id: 'z', zoneType: t, level, hexes });
        const s = buildZoneScenery(t, level, layout, hexes, flat);
        if (level >= 2) expect(s.water, `${t} L${level} canal`).not.toBeNull();
        if (t === 'rice_paddy') expect(s.water, 'paddy water').not.toBeNull();
        return s.solid.getAttribute('position').count;
      });
      expect(counts[1], `${t} L2 > L1`).toBeGreaterThan(counts[0]);
      expect(counts[2], `${t} L3 > L2`).toBeGreaterThan(counts[1]);
    }
  });

  it('corn & pasture L3 get an animated windmill', () => {
    const layout = computeZoneLayout({ id: 'z', zoneType: 'pasture', level: 3, hexes });
    expect(buildZoneScenery('pasture', 3, layout, hexes, flat).animated).toHaveLength(1);
  });
});

describe('FarmRenderer', () => {
  it('instances crops per stage, follows growth on the server clock, shows farmers and the ripe marker', () => {
    const r = new FarmRenderer();
    const cam = new THREE.PerspectiveCamera();
    r.sync([zone('rice_paddy', 1, riceCrop())], flat);
    const slots = r.getEntry(zone('rice_paddy', 1).id)!.layout.slots.length;

    r.update(T0 + 1_000, 0.016, 0, cam, flat);
    expect(r.cropInstances).toBe(slots);
    const pool = (key: string) => r.group.children.find((c) => c.name === `Crop:${key}`) as THREE.InstancedMesh | undefined;
    expect(pool('rice:0')?.visible).toBe(true);

    r.update(T0 + 30_000, 0.016, 1, cam, flat);
    expect(pool('rice:1')?.visible).toBe(true);
    expect(pool('rice:0')?.visible).toBe(false);
    r.update(T0 + 70_000, 0.016, 2, cam, flat);
    expect(pool('rice:2')?.count).toBe(slots);
    r.update(T0 + 100_000, 0.016, 3, cam, flat);
    expect(pool('rice:3')?.count).toBe(slots);
    const entry = r.getEntry(zone('rice_paddy', 1).id)!;
    expect(entry.root.children.some((c) => c instanceof THREE.Group && c.visible)).toBe(true); // ripe marker

    expect(r.farmerCount).toBe(getFarmZoneLevel('rice_paddy', 1)!.farmers);
    expect([...r.occupiedHexes().values()].every((v) => v.startsWith('farm:'))).toBe(true);
    expect(r.zoneAtHex(hexKey(hexes[0].q, hexes[0].r))).toBe(zone('rice_paddy', 1).id);

    // Harvested → fallow: no crop instances.
    r.sync([zone('rice_paddy', 1)], flat);
    r.update(T0 + 101_000, 0.016, 4, cam, flat);
    expect(r.cropInstances).toBe(0);
    r.dispose();
  });

  it('upgrading shows a progress bar and swaps scenery when the level changes', () => {
    const r = new FarmRenderer();
    const cam = new THREE.PerspectiveCamera();
    const upgrading = zone('corn_field', 1, null, {
      status: 'upgrading',
      upgradeStartedAt: new Date(T0).toISOString(),
      upgradeFinishesAt: new Date(T0 + 40_000).toISOString(),
    });
    r.sync([upgrading], flat);
    const before = r.getEntry(upgrading.id)!.root;
    r.update(T0 + 20_000, 0.016, 0, cam, flat);
    const bar = before.children.filter((c) => c instanceof THREE.Group).find((g) => g.children.length === 2)!;
    expect(bar.visible).toBe(true);
    r.sync([zone('corn_field', 2)], flat);
    expect(r.getEntry(upgrading.id)!.root).not.toBe(before);
    r.update(T0 + 41_000, 0.016, 1, cam, flat);
    expect(r.farmerCount).toBe(getFarmZoneLevel('corn_field', 2)!.farmers);
    r.dispose();
  });
});

describe('WorldEngine with farms', () => {
  let engine: WorldEngine | null = null;
  afterEach(() => {
    engine?.dispose();
    engine = null;
  });

  it('farmland blocks building placement and hides wild vegetation; the draw tool validates shapes', () => {
    engine = new WorldEngine(world, QUALITY_PRESETS.high);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#fff', 100, 500);
    scene.add(engine.root);
    const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 1500);
    const gl = { info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0 } } } as unknown as THREE.WebGLRenderer;
    const run = (n: number) => {
      for (let i = 0; i < n; i += 1) engine!.frame(1 / 60, cam, scene, gl);
    };
    run(60);
    const before = engine.vegetation.visibleInstances;
    engine.setFarms([zone('pasture', 2)], 0);
    run(20);
    expect(engine.vegetation.visibleInstances).toBeLessThan(before);
    expect(engine.occupancy().get(hexKey(hexes[0].q, hexes[0].r))).toMatch(/^farm:/);

    let lastCheck: unknown = 'unset';
    engine.attach(document.createElement('div'), cam, {
      onHover: () => {},
      onSelect: () => {},
      onFocus: () => {},
      isBuildMode: () => true,
      onStats: () => {},
      onPlacementCheck: () => {},
      onPlaceAt: () => {},
      onSelectBuilding: () => {},
      onFarmDraftCheck: (c) => {
        lastCheck = c;
      },
      onPaintDraft: () => {},
      onSelectFarm: () => {},
      onRanchDraftCheck: () => {},
      onSelectRanch: () => {},
    });
    const others = getConnectedHexes(
      world.getStarterTerritory().find((h) => farmable(h) && !engine!.occupancy().has(hexKey(h.q, h.r)))!,
      (h) => farmable(h) && !engine!.occupancy().has(hexKey(h.q, h.r)),
      6
    );
    engine.setFarmDraft({ mode: 'create', zoneType: 'rice_paddy', zoneId: null, hexes: others.slice(0, 4) });
    expect((lastCheck as { issues: string[] }).issues).toContain('TOO_SMALL');
    engine.setFarmDraft({ mode: 'create', zoneType: 'rice_paddy', zoneId: null, hexes: others });
    expect((lastCheck as { valid: boolean }).valid).toBe(true);
    engine.setFarmDraft({ mode: 'create', zoneType: 'rice_paddy', zoneId: null, hexes: [...others, hexes[0]] });
    expect((lastCheck as { issues: string[] }).issues).toContain('FARMLAND');
    engine.setFarmDraft(null);
    expect(lastCheck).toBeNull();
  });
});
