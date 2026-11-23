/**
 * VegetationRenderer — trees, bushes, rocks, flowers, grass and ruins.
 *
 * Instead of one mesh per chunk per asset (hundreds of draw calls), every (asset, detail)
 * pair is ONE InstancedMesh pool shared by all live chunks. Each frame the renderer decides
 * which chunks are visible (chunk-level frustum test + per-layer distance limits + LOD) and,
 * when that set changes, re-packs the pools from per-chunk matrix caches (a few memcpy's).
 */
import * as THREE from 'three';
import { worldToAxial, hexKey } from '@cityverse/shared';
import {
  VEG_STRIDE,
  VEGETATION_KINDS,
  vegetationLayer,
  type VegetationChunkData,
  type VegetationKind,
} from './chunkBuilder';
import type { AssetCache } from './assets/AssetCache';
import type { AssetDetail } from './assets/chibiGeometries';
import type { ChunkEvent, LiveChunk, WorldChunkManager } from './WorldChunkManager';
import type { QualityPreset } from './qualitySettings';

interface ChunkInstances {
  key: string;
  live: LiveChunk;
  source: VegetationChunkData;
  bounds: THREE.Box3;
  /** Per kind: packed 4×4 matrices and RGB colours */
  matrices: Partial<Record<VegetationKind, Float32Array>>;
  colors: Partial<Record<VegetationKind, Float32Array>>;
}

interface Pool {
  kind: VegetationKind;
  detail: AssetDetail;
  mesh: THREE.InstancedMesh;
  capacity: number;
}

const REBUILD_INTERVAL = 0.12;

export class VegetationRenderer {
  readonly group = new THREE.Group();
  private readonly chunks = new Map<string, ChunkInstances>();
  private readonly pools = new Map<string, Pool>();
  private readonly frustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();
  private readonly expandedBox = new THREE.Box3();
  private readonly unsubscribe: () => void;
  private quality: QualityPreset;
  private signature = '';
  private dirty = true;
  private sinceRebuild = 0;
  private readonly windUniform = { value: 0 };
  private instanceCount = 0;
  private blocked: ReadonlySet<string> = new Set();

  constructor(
    private readonly manager: WorldChunkManager,
    private readonly assets: AssetCache,
    quality: QualityPreset
  ) {
    this.group.name = 'VegetationRenderer';
    this.quality = quality;
    this.unsubscribe = manager.subscribe((e) => this.onChunkEvent(e));
  }

  setQuality(quality: QualityPreset): void {
    this.quality = quality;
    for (const pool of this.pools.values()) pool.mesh.castShadow = this.castsShadow(pool.kind);
    this.dirty = true;
  }

  /** Hides vegetation on hexes covered by buildings (re-packs the affected instance data). */
  setBlockedHexes(keys: ReadonlySet<string>): void {
    if (keys.size === this.blocked.size && [...keys].every((k) => this.blocked.has(k))) return;
    this.blocked = new Set(keys);
    for (const [key, inst] of this.chunks) this.chunks.set(key, packChunk(inst.live, inst.source, this.blocked));
    this.dirty = true;
  }

  get visibleInstances(): number {
    return this.instanceCount;
  }

  update(camera: THREE.Camera, focusX: number, focusZ: number, dt: number, time: number): void {
    this.windUniform.value = time;
    this.sinceRebuild += dt;

    camera.updateMatrixWorld();
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);

    // Decide per chunk: visible? which layers? which detail?
    const plan: { chunk: ChunkInstances; near: boolean; props: boolean; detail: boolean }[] = [];
    let sig = '';
    for (const inst of this.chunks.values()) {
      const live = this.manager.getChunk(inst.key);
      if (!live) continue;
      this.expandedBox.copy(inst.bounds).expandByScalar(6);
      if (!this.frustum.intersectsBox(this.expandedBox)) continue;
      const d = distanceXZ(inst.bounds, focusX, focusZ);
      const near = live.lod === 0;
      const props = d <= this.quality.propRadius;
      const detail = d <= this.quality.detailRadius;
      plan.push({ chunk: inst, near, props, detail });
      sig += `${inst.key}${near ? 'n' : 'f'}${props ? 'p' : ''}${detail ? 'd' : ''};`;
    }

    if (sig === this.signature && !this.dirty) return;
    if (!this.dirty && this.sinceRebuild < REBUILD_INTERVAL) return;
    this.signature = sig;
    this.dirty = false;
    this.sinceRebuild = 0;
    this.rebuildPools(plan);
  }

  dispose(): void {
    this.unsubscribe();
    for (const pool of this.pools.values()) {
      this.group.remove(pool.mesh);
      pool.mesh.dispose();
    }
    this.pools.clear();
    this.chunks.clear();
  }

  private castsShadow(kind: VegetationKind): boolean {
    return this.quality.shadows && vegetationLayer(kind) !== 'detail';
  }

  private onChunkEvent(e: ChunkEvent): void {
    if (e.type === 'vegetation' && e.chunk.vegetation) {
      this.chunks.set(e.chunk.key, packChunk(e.chunk, e.chunk.vegetation, this.blocked));
      this.dirty = true;
    } else if (e.type === 'unload') {
      if (this.chunks.delete(e.key)) this.dirty = true;
    } else if (e.type === 'terrain') {
      this.dirty = true; // LOD may have changed
    }
  }

  private rebuildPools(plan: { chunk: ChunkInstances; near: boolean; props: boolean; detail: boolean }[]): void {
    const counts = new Map<string, number>();
    const poolKey = (kind: VegetationKind, detail: AssetDetail): string => `${kind}:${detail}`;
    const includes = (p: (typeof plan)[number], kind: VegetationKind): boolean => {
      const layer = vegetationLayer(kind);
      return layer === 'tree' || (layer === 'prop' && p.props) || (layer === 'detail' && p.detail);
    };

    for (const p of plan) {
      for (const kind of VEGETATION_KINDS) {
        const m = p.chunk.matrices[kind];
        if (!m || !includes(p, kind)) continue;
        const key = poolKey(kind, p.near ? 'hi' : 'lo');
        counts.set(key, (counts.get(key) ?? 0) + m.length / 16);
      }
    }

    // Grow/create pools as needed.
    for (const [key, count] of counts) {
      const [kind, detail] = key.split(':') as [VegetationKind, AssetDetail];
      const pool = this.pools.get(key);
      if (!pool || pool.capacity < count) this.createPool(kind, detail, Math.ceil(count * 1.3) + 16);
    }

    const offsets = new Map<string, number>();
    for (const p of plan) {
      for (const kind of VEGETATION_KINDS) {
        const m = p.chunk.matrices[kind];
        const c = p.chunk.colors[kind];
        if (!m || !c || !includes(p, kind)) continue;
        const key = poolKey(kind, p.near ? 'hi' : 'lo');
        const pool = this.pools.get(key)!;
        const offset = offsets.get(key) ?? 0;
        (pool.mesh.instanceMatrix.array as Float32Array).set(m, offset * 16);
        (pool.mesh.instanceColor!.array as Float32Array).set(c, offset * 3);
        offsets.set(key, offset + m.length / 16);
      }
    }

    let total = 0;
    for (const [key, pool] of this.pools) {
      const n = offsets.get(key) ?? 0;
      pool.mesh.count = n;
      pool.mesh.visible = n > 0;
      if (n > 0) {
        pool.mesh.instanceMatrix.clearUpdateRanges();
        pool.mesh.instanceMatrix.addUpdateRange(0, n * 16);
        pool.mesh.instanceMatrix.needsUpdate = true;
        pool.mesh.instanceColor!.clearUpdateRanges();
        pool.mesh.instanceColor!.addUpdateRange(0, n * 3);
        pool.mesh.instanceColor!.needsUpdate = true;
      }
      total += n;
    }
    this.instanceCount = total;
  }

  private createPool(kind: VegetationKind, detail: AssetDetail, capacity: number): void {
    const key = `${kind}:${detail}`;
    const old = this.pools.get(key);
    if (old) {
      this.group.remove(old.mesh);
      old.mesh.dispose();
    }
    const geometry = this.assets.getGeometry(kind, detail);
    const material = this.materialFor(kind);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = `veg:${key}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    // Culling is done per chunk above; the pool spans many chunks.
    mesh.frustumCulled = false;
    mesh.castShadow = this.castsShadow(kind);
    mesh.receiveShadow = vegetationLayer(kind) !== 'detail' && this.quality.shadows;
    this.pools.set(key, { kind, detail, mesh, capacity });
    this.group.add(mesh);
  }

  private materialFor(kind: VegetationKind): THREE.Material {
    if (kind === 'grass') {
      return this.assets.getMaterial('veg:grass', () => {
        const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
        m.onBeforeCompile = (shader) => {
          shader.uniforms.uWind = this.windUniform;
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uWind;')
            .replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
               #ifdef USE_INSTANCING
                 vec2 wp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
                 float sway = sin(uWind * 1.6 + wp.x * 0.35 + wp.y * 0.27) * 0.5
                            + sin(uWind * 2.7 + wp.x * 0.9) * 0.2;
                 transformed.x += sway * 0.16 * position.y;
                 transformed.z += sway * 0.08 * position.y;
               #endif`
            );
        };
        return m;
      });
    }
    if (kind.startsWith('flower_')) {
      return this.assets.getMaterial('veg:flower', () => new THREE.MeshLambertMaterial({ vertexColors: true }));
    }
    return this.assets.getMaterial(
      'veg:solid',
      () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 })
    );
  }
}

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Converts per-instance records into packed matrices once per chunk. */
function packChunk(chunk: LiveChunk, data: VegetationChunkData, blocked: ReadonlySet<string>): ChunkInstances {
  const matrices: ChunkInstances['matrices'] = {};
  const colors: ChunkInstances['colors'] = {};
  let maxY = chunk.terrain?.maxHeight ?? 10;
  let minY = chunk.terrain?.minHeight ?? 0;
  for (const kind of VEGETATION_KINDS) {
    const rec = data[kind];
    if (!rec || rec.length === 0) continue;
    const total = rec.length / VEG_STRIDE;
    const keep: number[] = [];
    for (let i = 0; i < total; i += 1) {
      const o = i * VEG_STRIDE;
      if (blocked.size > 0) {
        const h = worldToAxial(rec[o], rec[o + 2]);
        if (blocked.has(hexKey(h.q, h.r))) continue;
      }
      keep.push(o);
    }
    const n = keep.length;
    if (n === 0) continue;
    const m = new Float32Array(n * 16);
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const o = keep[i];
      tmpPos.set(rec[o], rec[o + 1], rec[o + 2]);
      tmpQuat.setFromAxisAngle(Y_AXIS, rec[o + 3]);
      tmpScale.set(rec[o + 4], rec[o + 5], rec[o + 4]);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      tmpMatrix.toArray(m, i * 16);
      c[i * 3] = rec[o + 6];
      c[i * 3 + 1] = rec[o + 7];
      c[i * 3 + 2] = rec[o + 8];
      if (rec[o + 1] + 7 > maxY) maxY = rec[o + 1] + 7;
      if (rec[o + 1] < minY) minY = rec[o + 1];
    }
    matrices[kind] = m;
    colors[kind] = c;
  }
  const b = chunk.bounds;
  return {
    key: chunk.key,
    live: chunk,
    source: data,
    bounds: new THREE.Box3(new THREE.Vector3(b.minX, minY - 1, b.minZ), new THREE.Vector3(b.maxX, maxY + 1, b.maxZ)),
    matrices,
    colors,
  };
}

function distanceXZ(box: THREE.Box3, x: number, z: number): number {
  const dx = Math.max(box.min.x - x, 0, x - box.max.x);
  const dz = Math.max(box.min.z - z, 0, z - box.max.z);
  return Math.hypot(dx, dz);
}
