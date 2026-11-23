/**
 * Scene-level checks without a GPU: builds the real WorldEngine (Three.js objects only),
 * runs frames with a stub renderer, and audits what would be drawn.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WorldGenerator } from '@cityverse/shared';
import { QUALITY_PRESETS, type QualityLevel } from '../../game/world/qualitySettings';
import { WorldEngine } from '../../game/world/WorldEngine';

const world = new WorldGenerator('CV-COA-AABBCC112233');
const fakeGl = { info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0 } } } as unknown as THREE.WebGLRenderer;

function runFrames(engine: WorldEngine, camera: THREE.PerspectiveCamera, scene: THREE.Scene, n: number): void {
  for (let i = 0; i < n; i += 1) engine.frame(1 / 60, camera, scene, fakeGl);
}

/** Objects that would issue a draw call this frame (main pass only, before shadows). */
function auditDrawCalls(root: THREE.Object3D, camera: THREE.PerspectiveCamera) {
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  );
  let calls = 0;
  let instanced = 0;
  root.updateMatrixWorld(true);
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh.isMesh || (o as THREE.LineSegments).isLineSegments)) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    if (!geo.getAttribute('position') || geo.getAttribute('position').count === 0) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const im = mesh as THREE.InstancedMesh;
      if (im.count === 0) return;
      instanced += im.count;
      calls += 1;
      return;
    }
    if (mesh.frustumCulled) {
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const s = geo.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
      if (!frustum.intersectsSphere(s)) return;
    }
    calls += 1;
  });
  return { calls, instanced };
}

describe('WorldEngine scene', () => {
  let engine: WorldEngine | null = null;
  afterEach(() => {
    engine?.dispose();
    engine = null;
  });

  function boot(level: QualityLevel) {
    engine = new WorldEngine(world, QUALITY_PRESETS[level]);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#fff', 100, 500);
    scene.add(engine.root);
    const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 1500);
    runFrames(engine, camera, scene, 240);
    return { engine, scene, camera };
  }

  it.each(['low', 'medium', 'high'] as QualityLevel[])(
    'renders a bounded scene on %s quality (one mesh per chunk, pooled vegetation)',
    (level) => {
      const { engine: e, camera } = boot(level);
      const stats = e.manager.stats;
      expect(stats.loaded).toBeGreaterThan(0);
      expect(stats.loaded).toBeLessThan(stats.total);
      expect(e.terrain.meshCount).toBe(stats.loaded);

      const audit = auditDrawCalls(e.root, camera);
      // A per-object approach would be thousands of draw calls; pooled instancing keeps it small.
      expect(audit.instanced).toBeGreaterThan(500);
      expect(audit.calls).toBeLessThan(120);
      console.info(
        `[scene:${level}] chunks ${stats.loaded}/${stats.total}, main-pass draw calls ≈ ${audit.calls}, instances ${audit.instanced}`
      );
    }
  );

  it('normal mode hides the grid; build mode shows per-chunk hex lines; border is always on', () => {
    const { engine: e, camera, scene } = boot('medium');
    const buildGroup = e.overlay.group.children.find((c) => c.name === 'HexOverlay:build')!;
    expect(buildGroup.visible).toBe(false);
    expect(e.overlay.gridChunkCount).toBe(0);
    const border = e.overlay.group.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    expect(border.geometry.getAttribute('position').count).toBeGreaterThan(100);

    e.setMode('build');
    runFrames(e, camera, scene, 30);
    expect(buildGroup.visible).toBe(true);
    expect(e.overlay.gridChunkCount).toBeGreaterThan(0);
  });

  it('switching quality rebuilds chunks at the new resolution', () => {
    const { engine: e, camera, scene } = boot('low');
    const anyChunk = [...e.manager.getLiveChunks()].find((c) => c.terrain)!;
    expect(anyChunk.terrain!.cell).toBeGreaterThanOrEqual(QUALITY_PRESETS.low.terrainCell);
    e.setQuality(QUALITY_PRESETS.high);
    runFrames(e, camera, scene, 300);
    const near = [...e.manager.getLiveChunks()].find((c) => c.terrain && c.lod === 0)!;
    expect(near.terrain!.cell).toBe(QUALITY_PRESETS.high.terrainCell);
  });

  it('default camera frames the starter territory from a ¾ view', () => {
    const { engine: e } = boot('medium');
    const cam = e.camera;
    expect(Math.hypot(cam.lookAt.x - world.spawn.x, cam.lookAt.z - world.spawn.z)).toBeLessThan(1);
    const pitch = Math.asin((cam.position.y - cam.lookAt.y) / cam.position.distanceTo(cam.lookAt));
    expect(THREE.MathUtils.radToDeg(pitch)).toBeGreaterThan(40);
    expect(THREE.MathUtils.radToDeg(pitch)).toBeLessThan(65);
  });
});
