/**
 * AssetCache — one geometry per (asset, detail) and one material per material key, shared by
 * every chunk. Nothing is rebuilt when chunks stream in and out.
 *
 * GLB pipeline: an asset kind can be mapped to a GLB/GLTF file (Blender export, glTF 2.0).
 * Its meshes are flattened into a single geometry so they stay instancing-friendly. Until a
 * GLB is registered the procedural chibi geometry is used. No GLB files ship yet.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VegetationKind } from '../chunkBuilder';
import { buildVegetationGeometry, type AssetDetail } from './chibiGeometries';

/** kind → URL of a GLB that replaces the procedural mesh (empty until real assets exist). */
export const GLB_ASSET_OVERRIDES: Partial<Record<VegetationKind, { hi: string; lo?: string }>> = {};

export class AssetCache {
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.Material>();
  private readonly glbPromises = new Map<string, Promise<THREE.BufferGeometry | null>>();
  private loader: GLTFLoader | null = null;

  getGeometry(kind: VegetationKind, detail: AssetDetail): THREE.BufferGeometry {
    const key = `${kind}:${detail}`;
    let geo = this.geometries.get(key);
    if (!geo) {
      geo = buildVegetationGeometry(kind, detail);
      geo.computeBoundingSphere();
      this.geometries.set(key, geo);
    }
    return geo;
  }

  getMaterial<T extends THREE.Material>(key: string, create: () => T): T {
    let mat = this.materials.get(key);
    if (!mat) {
      mat = create();
      this.materials.set(key, mat);
    }
    return mat as T;
  }

  /** Resolves the GLB override for an asset (or null when none is registered / it fails). */
  loadGlbOverride(kind: VegetationKind, detail: AssetDetail): Promise<THREE.BufferGeometry | null> {
    const entry = GLB_ASSET_OVERRIDES[kind];
    const url = entry ? (detail === 'lo' ? (entry.lo ?? entry.hi) : entry.hi) : undefined;
    if (!url) return Promise.resolve(null);
    let promise = this.glbPromises.get(url);
    if (!promise) {
      this.loader ??= new GLTFLoader();
      promise = this.loader
        .loadAsync(url)
        .then((gltf) => {
          const parts: THREE.BufferGeometry[] = [];
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh) parts.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
          });
          const merged = parts.length ? mergeGeometries(parts, false) : null;
          if (merged) this.geometries.set(`${kind}:${detail}`, merged);
          return merged;
        })
        .catch((err: unknown) => {
          console.warn(`[AssetCache] GLB failed for ${kind}, using procedural mesh`, err);
          return null;
        });
      this.glbPromises.set(url, promise);
    }
    return promise;
  }

  get geometryCount(): number {
    return this.geometries.size;
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.glbPromises.clear();
  }
}
