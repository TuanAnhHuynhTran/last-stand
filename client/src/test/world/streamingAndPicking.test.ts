import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HEX_RADIUS,
  WORLD_TOTAL_CHUNKS,
  axialToWorld,
  getHexPolygon,
  getWorldBounds,
  hexDisk,
  WorldGenerator,
} from '@cityverse/shared';
import { CAMERA_PRESETS, CameraController } from '../../game/world/CameraController';
import { pickHexFromNdc } from '../../game/world/picking';
import { QUALITY_PRESETS } from '../../game/world/qualitySettings';
import { WorldChunkManager, type ChunkEvent } from '../../game/world/WorldChunkManager';

const world = new WorldGenerator('CV-COA-AABBCC112233');

describe('WorldChunkManager – streaming', () => {
  it('never loads the whole 1000 × 1000 world, even fully zoomed out on High', () => {
    const manager = new WorldChunkManager(world, QUALITY_PRESETS.high);
    const radius = manager.radiusForCameraDistance(10_000);
    expect(radius).toBe(QUALITY_PRESETS.high.maxLoadRadius);
    manager.loadAllPending(world.spawn.x, world.spawn.z, radius);
    expect(manager.stats.loaded).toBeGreaterThan(4);
    expect(manager.stats.loaded).toBeLessThan(WORLD_TOTAL_CHUNKS);
    manager.dispose();
  });

  it('loads near the focus, unloads behind when moving, and emits events', () => {
    const manager = new WorldChunkManager(world, QUALITY_PRESETS.low);
    const events: ChunkEvent[] = [];
    manager.subscribe((e) => events.push(e));
    manager.loadAllPending(-350, -350, 220);
    const firstKeys = new Set([...manager.getLiveChunks()].map((c) => c.key));
    expect(firstKeys.has('1:1')).toBe(true);
    expect(firstKeys.has('8:8')).toBe(false);

    manager.loadAllPending(350, 350, 220);
    const secondKeys = new Set([...manager.getLiveChunks()].map((c) => c.key));
    expect(secondKeys.has('8:8')).toBe(true);
    expect(secondKeys.has('1:1')).toBe(false);
    expect(events.some((e) => e.type === 'unload' && e.key === '1:1')).toBe(true);
    expect(events.some((e) => e.type === 'terrain')).toBe(true);
    expect(events.some((e) => e.type === 'vegetation')).toBe(true);
    manager.dispose();
  });

  it('time-slices work: one small-budget update does not build everything', () => {
    const manager = new WorldChunkManager(world, QUALITY_PRESETS.medium);
    manager.update(world.spawn.x, world.spawn.z, 300, 0);
    expect(manager.stats.loaded).toBe(1);
    expect(manager.stats.pending).toBeGreaterThan(5);
    manager.dispose();
  });

  it('assigns LOD 0 near and LOD 1 far', () => {
    const manager = new WorldChunkManager(world, QUALITY_PRESETS.medium);
    manager.loadAllPending(0, 0, 330);
    for (const c of manager.getLiveChunks()) {
      if (c.distance < QUALITY_PRESETS.medium.nearLodRadius - 25) expect(c.lod).toBe(0);
      if (c.distance > QUALITY_PRESETS.medium.nearLodRadius + 25) expect(c.lod).toBe(1);
    }
    manager.dispose();
  });
});

describe('Hover picking – exact hex under the cursor', () => {
  const manager = new WorldChunkManager(world, QUALITY_PRESETS.medium);
  manager.loadAllPending(world.spawn.x, world.spawn.z, 260);
  const height = (x: number, z: number) => manager.sampleHeight(x, z);
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 3000);

  const probes = [
    ...hexDisk({ q: world.spawn.q, r: world.spawn.r }, 1),
    // Hexes on hills / shores near the territory: terrain relief must not shift the pick.
    ...[
      { q: world.spawn.q + 9, r: world.spawn.r - 3 },
      { q: world.spawn.q - 8, r: world.spawn.r + 6 },
      { q: world.spawn.q + 3, r: world.spawn.r + 10 },
    ],
  ];

  function checkAll(distance: number, pitchDeg: number): number {
    let checks = 0;
    for (let az = 0; az < 360; az += 30) {
      const ctl = new CameraController(
        {
          bounds: getWorldBounds(),
          margin: 0,
          minDistance: 10,
          maxDistance: 1000,
          minPitch: 0.2,
          maxPitch: 1.5,
          groundClearance: 2,
        },
        { x: world.spawn.x, z: world.spawn.z }
      );
      ctl.focus(world.spawn.x + 15, world.spawn.z - 10, distance, THREE.MathUtils.degToRad(pitchDeg));
      ctl.desired.azimuth = THREE.MathUtils.degToRad(az);
      ctl.snap(height);
      ctl.applyTo(camera);
      camera.updateProjectionMatrix();
      for (const h of probes) {
        const c = axialToWorld(h.q, h.r);
        const poly = getHexPolygon(h.q, h.r);
        // Centre and points 80 % of the way to each corner.
        const pts = [c, ...poly.map((p) => ({ x: c.x + (p.x - c.x) * 0.8, z: c.z + (p.z - c.z) * 0.8 }))];
        for (const p of pts) {
          const world3 = new THREE.Vector3(p.x, height(p.x, p.z), p.z);
          const ndc = world3.clone().project(camera);
          if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z > 1) continue;
          // Skip points hidden behind closer terrain from this angle.
          const toPoint = world3.clone().sub(camera.position);
          const hit = pickHexFromNdc(camera, ndc.x, ndc.y, height);
          expect(hit).not.toBeNull();
          if (hit!.point.distanceTo(camera.position) < toPoint.length() - 0.5) continue;
          expect(hit!.hex, `az ${az} pitch ${pitchDeg} d ${distance}`).toEqual(h);
          checks += 1;
        }
      }
    }
    return checks;
  }

  it('picks the right hex for every rotation at the default view', () => {
    expect(checkAll(CAMERA_PRESETS.default.distance, 52)).toBeGreaterThan(300);
  });

  it('picks the right hex zoomed in close (low pitch)', () => {
    expect(checkAll(CAMERA_PRESETS.near.distance, 30)).toBeGreaterThan(100);
  });

  it('picks the right hex zoomed far out (high pitch)', () => {
    expect(checkAll(CAMERA_PRESETS.far.distance, 70)).toBeGreaterThan(300);
  });

  it('hit point lies on the rendered surface', () => {
    camera.position.set(world.spawn.x + 60, 90, world.spawn.z + 60);
    camera.lookAt(world.spawn.x, 3, world.spawn.z);
    camera.updateMatrixWorld();
    const hit = pickHexFromNdc(camera, 0.1, -0.2, height)!;
    expect(Math.abs(hit.point.y - height(hit.point.x, hit.point.z))).toBeLessThan(0.01);
    expect(HEX_RADIUS).toBeGreaterThan(5);
  });
});

describe('CameraController', () => {
  const limits = {
    bounds: getWorldBounds(),
    margin: 25,
    minDistance: 24,
    maxDistance: 430,
    minPitch: THREE.MathUtils.degToRad(24),
    maxPitch: THREE.MathUtils.degToRad(80),
    groundClearance: 4,
  };
  const flat = () => 2;

  it('damps smoothly toward the desired state (no jumps, converges)', () => {
    const ctl = new CameraController(limits, { x: 0, z: 0 });
    ctl.snap(flat);
    ctl.focus(100, 50);
    ctl.update(1 / 60, flat);
    expect(ctl.current.x).toBeGreaterThan(0);
    expect(ctl.current.x).toBeLessThan(20);
    for (let i = 0; i < 240; i += 1) ctl.update(1 / 60, flat);
    expect(ctl.current.x).toBeCloseTo(100, 1);
    expect(ctl.current.z).toBeCloseTo(50, 1);
    expect(ctl.isMoving).toBe(false);
  });

  it('clamps zoom, pitch and target to sensible limits', () => {
    const ctl = new CameraController(limits, { x: 0, z: 0 });
    ctl.zoom(0.0001);
    expect(ctl.desired.distance).toBe(24);
    ctl.zoom(1e6);
    expect(ctl.desired.distance).toBe(430);
    ctl.rotate(0, 10);
    expect(ctl.desired.pitch).toBeCloseTo(limits.maxPitch);
    ctl.rotate(0, -10);
    expect(ctl.desired.pitch).toBeCloseTo(limits.minPitch);
    ctl.focus(10_000, -10_000);
    expect(ctl.desired.x).toBe(475);
    expect(ctl.desired.z).toBe(-475);
  });

  it('works zoomed in and out: camera stays above terrain and looks at the focus', () => {
    const hilly = (x: number, z: number) => 10 + Math.sin(x * 0.05) * 8 + Math.cos(z * 0.04) * 6;
    for (const preset of ['near', 'default', 'far'] as const) {
      const ctl = new CameraController(limits, { x: 50, z: -30, preset });
      for (let az = 0; az < 6.3; az += 0.7) {
        ctl.desired.azimuth = az;
        ctl.snap(hilly);
        expect(ctl.position.y).toBeGreaterThanOrEqual(hilly(ctl.position.x, ctl.position.z) + 4 - 1e-9);
        expect(ctl.position.distanceTo(ctl.lookAt)).toBeGreaterThan(CAMERA_PRESETS[preset].distance * 0.9);
      }
    }
  });

  it('pans relative to the view direction after rotating', () => {
    const ctl = new CameraController(limits, { x: 0, z: 0 });
    ctl.desired.azimuth = 0; // camera south of target, looking toward -Z
    ctl.pan(0, 10);
    expect(ctl.desired.z).toBeCloseTo(-10);
    ctl.desired.azimuth = Math.PI / 2; // camera east, looking toward -X
    ctl.pan(0, 10);
    expect(ctl.desired.x).toBeCloseTo(-10);
  });

  it('zoom toward the cursor moves the focus toward the anchor', () => {
    const ctl = new CameraController(limits, { x: 0, z: 0 });
    ctl.zoom(0.5, { x: 40, z: 0 });
    expect(ctl.desired.x).toBeCloseTo(20);
  });
});
