/**
 * TerrainRenderer — one mesh per live chunk, all sharing a single vertex-coloured material.
 * Meshes keep Three.js frustum culling (per-chunk bounding spheres).
 */
import * as THREE from 'three';
import type { TerrainChunkData } from './chunkBuilder';
import type { ChunkEvent, WorldChunkManager } from './WorldChunkManager';
import type { QualityPreset } from './qualitySettings';

export class TerrainRenderer {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private material: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  private receiveShadow: boolean;
  private readonly unsubscribe: () => void;

  constructor(manager: WorldChunkManager, quality: QualityPreset) {
    this.group.name = 'TerrainRenderer';
    this.material = createTerrainMaterial(quality);
    this.receiveShadow = quality.shadows;
    this.unsubscribe = manager.subscribe((e) => this.onChunkEvent(e));
  }

  setQuality(quality: QualityPreset): void {
    this.material.dispose();
    this.material = createTerrainMaterial(quality);
    this.receiveShadow = quality.shadows;
    for (const mesh of this.meshes.values()) {
      mesh.material = this.material;
      mesh.receiveShadow = this.receiveShadow;
    }
  }

  get meshCount(): number {
    return this.meshes.size;
  }

  getMesh(key: string): THREE.Mesh | undefined {
    return this.meshes.get(key);
  }

  dispose(): void {
    this.unsubscribe();
    for (const key of [...this.meshes.keys()]) this.remove(key);
    this.material.dispose();
  }

  private onChunkEvent(e: ChunkEvent): void {
    if (e.type === 'terrain' && e.chunk.terrain) this.upsert(e.chunk.key, e.chunk.terrain);
    else if (e.type === 'unload') this.remove(e.key);
  }

  private upsert(key: string, data: TerrainChunkData): void {
    const geometry = createTerrainGeometry(data);
    const existing = this.meshes.get(key);
    if (existing) {
      existing.geometry.dispose();
      existing.geometry = geometry;
      return;
    }
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.name = `terrain:${key}`;
    mesh.receiveShadow = this.receiveShadow;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.meshes.set(key, mesh);
    this.group.add(mesh);
  }

  private remove(key: string): void {
    const mesh = this.meshes.get(key);
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(key);
  }
}

export function createTerrainGeometry(data: TerrainChunkData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  const b = data.bounds;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const cy = (data.minHeight + data.maxHeight) / 2;
  const half = (b.maxX - b.minX) / 2;
  const hy = (data.maxHeight - data.minHeight) / 2 + 3;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.hypot(half, half, hy));
  geo.boundingBox = new THREE.Box3(
    new THREE.Vector3(b.minX, data.minHeight - 3, b.minZ),
    new THREE.Vector3(b.maxX, data.maxHeight, b.maxZ)
  );
  return geo;
}

function createTerrainMaterial(quality: QualityPreset): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
  if (!quality.pbrTerrain) return new THREE.MeshLambertMaterial({ vertexColors: true });
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
}
