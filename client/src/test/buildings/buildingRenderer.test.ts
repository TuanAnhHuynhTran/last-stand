import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WorldGenerator, hexKey, pathEdgeKey, type WorldBuildingDTO } from '@cityverse/shared';
import { BuildingRenderer } from '../../game/buildings/BuildingRenderer';
import { QUALITY_PRESETS } from '../../game/world/qualitySettings';
import { WorldEngine } from '../../game/world/WorldEngine';

const world = new WorldGenerator('CV-COA-AABBCC112233');
const flat = () => 3;
const T0 = Date.UTC(2026, 10, 21, 8, 0, 0);

function house(level: number, status: WorldBuildingDTO['status'], job = status !== 'active'): WorldBuildingDTO {
  return {
    id: 'b-1',
    cityId: 'c-1',
    typeCode: 'house',
    level,
    status,
    anchorQ: world.spawn.q,
    anchorR: world.spawn.r,
    rotation: 1,
    footprint: [{ q: world.spawn.q, r: world.spawn.r }],
    activeJob: job
      ? {
          id: 'j',
          jobType: status === 'constructing' ? 'build' : 'upgrade',
          fromLevel: status === 'constructing' ? 0 : level,
          targetLevel: status === 'constructing' ? 1 : level + 1,
          cost: { coins: 1, wood: 1, stone: 1 },
          startedAt: new Date(T0).toISOString(),
          finishesAt: new Date(T0 + 20_000).toISOString(),
          status: 'in_progress',
        }
      : null,
    createdAt: new Date(T0).toISOString(),
    updatedAt: new Date(T0).toISOString(),
  };
}

describe('BuildingRenderer', () => {
  it('drapes a narrow road beside a house without replacing its plot occupancy or cached geometry', () => {
    const r = new BuildingRenderer();
    const h = house(1, 'active');
    const road: WorldBuildingDTO = { ...h, id: 'path', typeCode: 'road', rotation: 0 };
    r.sync([h, road], flat);
    expect(r.occupiedHexes().get(hexKey(h.anchorQ, h.anchorR))).toBe(h.id);
    expect(r.occupiedHexes().get(pathEdgeKey({ q: h.anchorQ, r: h.anchorR }, 0))).toBe('path');
    const mesh = r.getEntryRoot('path')!.children[0] as THREE.Mesh;
    const cached = r.models.get('road', 1);
    expect(mesh.geometry).not.toBe(cached);
    expect(mesh.geometry.boundingBox!.max.x - mesh.geometry.boundingBox!.min.x).toBeLessThan(1.21);
    expect(mesh.geometry.boundingBox!.min.y).toBeGreaterThan(3);
    r.reseat(() => 7);
    expect(mesh.geometry.boundingBox!.min.y).toBeGreaterThan(7);
    expect(cached.boundingBox!.max.y).toBeLessThan(1);
    r.sync([road], flat);
    expect(r.occupiedHexes().has(hexKey(h.anchorQ, h.anchorR))).toBe(false);
    r.dispose();
  });

  it('keeps the same scene object across construction → upgrade → new level, swapping only the model', () => {
    const r = new BuildingRenderer();
    const cam = new THREE.PerspectiveCamera();
    r.sync([house(1, 'constructing')], flat);
    const root = r.getEntryRoot('b-1')!;
    const mesh = root.children.find((c) => (c as THREE.Mesh).userData.buildingId) as THREE.Mesh;
    const l1Geo = mesh.geometry;
    // Construction: clipped "rising" material, scaffolding and a progress bar.
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.clippingPlanes).toHaveLength(1);
    expect(root.children.length).toBeGreaterThanOrEqual(3);
    r.update(T0 + 10_000, cam);
    const halfway = mat.clippingPlanes![0].constant;
    r.update(T0 + 19_000, cam);
    expect(mat.clippingPlanes![0].constant).toBeGreaterThan(halfway);

    r.sync([house(1, 'active')], flat);
    expect(r.getEntryRoot('b-1')).toBe(root);
    expect(root.children).toHaveLength(1);
    expect((mesh.material as THREE.MeshStandardMaterial).clippingPlanes ?? []).toHaveLength(0);

    r.sync([house(1, 'upgrading')], flat);
    expect(r.getEntryRoot('b-1')).toBe(root);
    expect(mesh.geometry).toBe(l1Geo); // old model stays while upgrading
    expect(root.children.length).toBeGreaterThanOrEqual(3);

    r.sync([house(2, 'active')], flat);
    expect(r.getEntryRoot('b-1')).toBe(root);
    expect(mesh.geometry).not.toBe(l1Geo);
    expect(root.children).toHaveLength(1);
    expect(root.position.y).toBeCloseTo(2.92); // flat ground: plot sits 8 cm into the terrain
    expect(root.rotation.y).toBeCloseTo(-Math.PI / 3);

    r.sync([], flat);
    expect(r.count).toBe(0);
    r.dispose();
  });

  it('picks a building under the cursor and exposes occupied hexes', () => {
    const r = new BuildingRenderer();
    r.sync([house(3, 'active')], flat);
    const root = r.getEntryRoot('b-1')!;
    const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 500);
    cam.position.set(root.position.x + 25, 25, root.position.z + 25);
    cam.lookAt(root.position.x, 5, root.position.z);
    cam.updateMatrixWorld();
    const ndc = new THREE.Vector3(root.position.x, 5, root.position.z).project(cam);
    expect(r.pick(cam, { x: ndc.x, y: ndc.y })).toBe('b-1');
    expect(r.pick(cam, { x: 0.95, y: 0.95 })).toBeNull();
    expect([...r.occupiedHexes().keys()]).toEqual([hexKey(world.spawn.q, world.spawn.r)]);
    r.dispose();
  });
});

describe('WorldEngine with buildings', () => {
  let engine: WorldEngine | null = null;
  afterEach(() => {
    engine?.dispose();
    engine = null;
  });

  it('hides grass and flowers under building footprints', () => {
    engine = new WorldEngine(world, QUALITY_PRESETS.high);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#fff', 100, 500);
    scene.add(engine.root);
    const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 1500);
    const gl = { info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0 } } } as unknown as THREE.WebGLRenderer;
    const run = (n: number) => {
      for (let i = 0; i < n; i += 1) engine!.frame(1 / 60, cam, scene, gl);
    };
    run(120);
    const before = engine.vegetation.visibleInstances;
    // Cover the whole starter territory with houses (synthetic data, no API needed).
    const houses = world.getStarterTerritory().map((h, i) => ({ ...house(1, 'active', false), id: `h${i}`, anchorQ: h.q, anchorR: h.r, footprint: [h] }));
    engine.setBuildings(houses, 0);
    run(30);
    expect(engine.buildings.count).toBe(houses.length);
    expect(engine.vegetation.visibleInstances).toBeLessThan(before);
  });

  it('placement preview validates against existing buildings and territory', () => {
    engine = new WorldEngine(world, QUALITY_PRESETS.low);
    engine.setBuildings([house(1, 'active', false)], 0);
    engine.setPlacing({ typeCode: 'house', rotation: 0, movingId: null, level: 1 });
    expect(engine.preview.group.visible).toBe(false); // nothing hovered yet
  });
});
