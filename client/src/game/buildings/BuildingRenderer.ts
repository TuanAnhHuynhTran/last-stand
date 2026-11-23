/**
 * BuildingRenderer — one mesh per placed building (merged chibi model = one draw call).
 *
 *  constructing: the level-1 model "grows" out of the ground (clipping plane follows the
 *                job progress) inside scaffolding, with a progress bar above it.
 *  upgrading   : the current model stays, wrapped in scaffolding, with a progress bar; the
 *                model is swapped in place when the server reports the new level (same id).
 */
import * as THREE from 'three';
import {
  HEX_RADIUS,
  axialToWorld,
  hexKey,
  pathEdgeKey,
  rotationToYaw,
  type BuildingStatus,
  type BuildingTypeCode,
  type WorldBuildingDTO,
} from '@cityverse/shared';
import { BuildingModelCache } from './buildingModels';
import { ModelBuilder, box, cyl } from './modelKit';
import { drapePathGeometry, pathSurfaceSampler } from './pathGeometry';
import { jobProgress } from './buildingStore';

export type HeightSampler = (x: number, z: number) => number;

interface Entry {
  dto: WorldBuildingDTO;
  root: THREE.Group;
  mesh: THREE.Mesh;
  modelKey: string;
  scaffold: THREE.Mesh | null;
  bar: THREE.Group | null;
  barFill: THREE.Mesh | null;
  clip: THREE.Plane | null;
  height: number;
}

/**
 * Ground height for a footprint: near the mean terrain height (slightly biased up), so the
 * plot reads as a garden edge rather than a raised hex pedestal; the model's foundation skirt
 * extends below to hide any gap on the downhill side.
 */
export function footprintBaseHeight(footprint: { q: number; r: number }[], height: HeightSampler): number {
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let n = 0;
  const add = (h: number): void => {
    max = Math.max(max, h);
    sum += h;
    n += 1;
  };
  for (const h of footprint) {
    const c = axialToWorld(h.q, h.r);
    add(height(c.x, c.z));
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      add(height(c.x + Math.cos(a) * HEX_RADIUS * 0.85, c.z + Math.sin(a) * HEX_RADIUS * 0.85));
    }
  }
  const mean = sum / n;
  return mean + (max - mean) * 0.3 - 0.08;
}

export class BuildingRenderer {
  readonly group = new THREE.Group();
  readonly models = new BuildingModelCache();
  readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  private readonly scaffoldMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  private readonly barBgMat = new THREE.MeshBasicMaterial({ color: '#3b3026', transparent: true, opacity: 0.8, depthTest: false });
  // Transparent (opacity 1) so the fill sorts after the transparent background via renderOrder.
  private readonly barBuildMat = new THREE.MeshBasicMaterial({ color: '#7dd36f', depthTest: false, transparent: true });
  private readonly barUpgradeMat = new THREE.MeshBasicMaterial({ color: '#ffc94d', depthTest: false, transparent: true });
  private readonly barGeo = new THREE.PlaneGeometry(1, 1);
  private readonly scaffoldCache = new Map<string, THREE.BufferGeometry>();
  private readonly entries = new Map<string, Entry>();
  private readonly raycaster = new THREE.Raycaster();
  private castShadow = true;

  constructor() {
    this.group.name = 'BuildingRenderer';
  }

  setShadows(enabled: boolean): void {
    this.castShadow = enabled;
    for (const e of this.entries.values()) e.mesh.castShadow = enabled;
  }

  /** Reconciles meshes with the server list. Building ids are stable across upgrades/moves. */
  sync(list: readonly WorldBuildingDTO[], height: HeightSampler): void {
    const seen = new Set<string>();
    for (const dto of list) {
      seen.add(dto.id);
      const e = this.entries.get(dto.id);
      if (!e) this.create(dto, height);
      else this.updateEntry(e, dto, height);
    }
    for (const id of [...this.entries.keys()]) if (!seen.has(id)) this.remove(id);
    this.reseat(height);
  }

  /** Re-seats every building on the current terrain surface (e.g. after a terrain LOD change). */
  reseat(height: HeightSampler): void {
    const surface = pathSurfaceSampler([...this.entries.values()].map(e => e.dto), height);
    for (const e of this.entries.values()) {
      if (e.dto.typeCode !== 'road') { e.root.position.y = footprintBaseHeight(e.dto.footprint, height); continue; }
      e.root.position.y = 0;
      if (e.mesh.geometry !== this.models.get('road', e.dto.level)) e.mesh.geometry.dispose();
      e.mesh.geometry = drapePathGeometry(this.models.get('road', e.dto.level), e.dto.anchorQ, e.dto.anchorR, e.dto.rotation, surface);
    }
  }

  /** Per-frame: construction clipping, progress bars facing the camera. */
  update(serverNowMs: number, camera: THREE.Camera): void {
    for (const e of this.entries.values()) {
      if (!e.dto.activeJob) continue;
      const p = jobProgress(e.dto, serverNowMs);
      if (e.clip) e.clip.constant = e.root.position.y - 0.3 + (e.height + 0.5) * Math.max(0.04, p);
      if (e.bar && e.barFill) {
        e.bar.quaternion.copy(camera.quaternion);
        e.barFill.scale.x = Math.max(0.001, p) * 3.1;
        e.barFill.position.x = -1.55 + (p * 3.1) / 2;
      }
    }
  }

  /** Building id under a pointer ray, if any. */
  pick(camera: THREE.Camera, ndc: { x: number; y: number }): string | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const meshes = [...this.entries.values()].map((e) => e.mesh);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    return hit ? ((hit.object.userData.buildingId as string | undefined) ?? null) : null;
  }

  occupiedHexes(): Map<string, string> {
    const map = new Map<string, string>();
    for (const e of this.entries.values()) {
      if (e.dto.typeCode === 'road') map.set(pathEdgeKey({ q: e.dto.anchorQ, r: e.dto.anchorR }, e.dto.rotation), e.dto.id);
      else for (const h of e.dto.footprint) map.set(hexKey(h.q, h.r), e.dto.id);
    }
    return map;
  }

  getEntryRoot(id: string): THREE.Object3D | null {
    return this.entries.get(id)?.root ?? null;
  }

  get count(): number {
    return this.entries.size;
  }

  dispose(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
    this.models.dispose();
    this.scaffoldCache.forEach((g) => g.dispose());
    this.material.dispose();
    this.scaffoldMat.dispose();
    this.barBgMat.dispose();
    this.barBuildMat.dispose();
    this.barUpgradeMat.dispose();
    this.barGeo.dispose();
  }

  private modelKey(dto: WorldBuildingDTO): string {
    return `${dto.typeCode}:${dto.level}:${dto.status}`;
  }

  private create(dto: WorldBuildingDTO, height: HeightSampler): void {
    const root = new THREE.Group();
    root.name = `building:${dto.id}`;
    const mesh = new THREE.Mesh(this.models.get(dto.typeCode, dto.level), this.material);
    mesh.userData.buildingId = dto.id;
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = true;
    root.add(mesh);
    this.group.add(root);
    const e: Entry = { dto, root, mesh, modelKey: '', scaffold: null, bar: null, barFill: null, clip: null, height: 0 };
    this.entries.set(dto.id, e);
    this.updateEntry(e, dto, height);
  }

  private updateEntry(e: Entry, dto: WorldBuildingDTO, height: HeightSampler): void {
    e.dto = dto;
    const anchor = axialToWorld(dto.anchorQ, dto.anchorR);
    e.root.position.set(anchor.x, footprintBaseHeight(dto.footprint, height), anchor.z);
    e.root.rotation.y = rotationToYaw(dto.rotation);
    e.root.updateMatrixWorld(true);

    const key = this.modelKey(dto);
    if (key === e.modelKey) return;
    e.modelKey = key;
    // Swap the model in place (same object, same id) when the level changes.
    if (dto.typeCode === 'road' && e.mesh.geometry !== this.models.get('road', dto.level)) e.mesh.geometry.dispose();
    e.mesh.geometry = this.models.get(dto.typeCode, dto.level);
    e.height = e.mesh.geometry.boundingBox!.max.y;
    this.setConstructionState(e, dto.status, dto.typeCode, dto.level);
  }

  private setConstructionState(e: Entry, status: BuildingStatus, code: BuildingTypeCode, level: number): void {
    // Clear previous construction visuals.
    if (e.scaffold) e.root.remove(e.scaffold);
    if (e.bar) e.root.remove(e.bar);
    if (e.mesh.material !== this.material) (e.mesh.material as THREE.Material).dispose();
    e.mesh.material = this.material;
    e.scaffold = null;
    e.bar = null;
    e.barFill = null;
    e.clip = null;
    if (status === 'active' || code === 'road') return;

    if (status === 'constructing') {
      e.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), e.root.position.y);
      const mat = this.material.clone();
      mat.clippingPlanes = [e.clip];
      mat.clipShadows = true;
      e.mesh.material = mat;
    }
    e.scaffold = new THREE.Mesh(this.scaffoldFor(code, level, e.mesh.geometry), this.scaffoldMat);
    e.scaffold.castShadow = this.castShadow;
    e.root.add(e.scaffold);

    const bar = new THREE.Group();
    const bg = new THREE.Mesh(this.barGeo, this.barBgMat);
    bg.scale.set(3.4, 0.55, 1);
    const fill = new THREE.Mesh(this.barGeo, status === 'constructing' ? this.barBuildMat : this.barUpgradeMat);
    fill.scale.set(0.001, 0.36, 1);
    fill.position.z = 0.01;
    bg.renderOrder = 20;
    fill.renderOrder = 21;
    bar.add(bg, fill);
    bar.position.set(0, e.height + 1.6, 0);
    e.bar = bar;
    e.barFill = fill;
    e.root.add(bar);
  }

  /** Wooden scaffolding around the model's bounding box. */
  private scaffoldFor(code: BuildingTypeCode, level: number, geo: THREE.BufferGeometry): THREE.BufferGeometry {
    const key = `${code}:${level}`;
    const cached = this.scaffoldCache.get(key);
    if (cached) return cached;
    // Size from the building mass (above the garden plate, fences and flowers), not the plot.
    const bb = new THREE.Box3();
    const pos = geo.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      if (v.y > 2.0) bb.expandByPoint(v);
    }
    if (bb.isEmpty()) bb.copy(geo.boundingBox!);
    const b = new ModelBuilder();
    const minX = bb.min.x + 0.6;
    const maxX = bb.max.x - 0.6;
    const minZ = bb.min.z + 0.6;
    const maxZ = bb.max.z - 0.6;
    const h = Math.min(bb.max.y * 0.85, 9);
    const wood: [string, string] = ['#b0814f', '#d9b07a'];
    const xs = [minX, (minX + maxX) / 2, maxX];
    const zs = [minZ, maxZ];
    for (const x of xs) for (const z of zs) b.add(cyl(0.09, 0.09, h, 5), wood, { x, y: h / 2, z });
    for (let y = 1.6; y < h; y += 1.6) {
      for (const z of zs) b.add(box(maxX - minX, 0.12, 0.45, 0.03), wood, { x: (minX + maxX) / 2, y, z });
      for (const x of [minX, maxX]) b.add(box(0.45, 0.12, maxZ - minZ, 0.03), wood, { x, y, z: (minZ + maxZ) / 2 });
    }
    const diag = Math.hypot(maxX - minX, Math.min(h, 3.2));
    b.add(box(diag, 0.08, 0.08, 0.02), wood, { x: (minX + maxX) / 2, y: Math.min(h, 3.2) / 2, z: maxZ + 0.05, rz: Math.atan2(Math.min(h, 3.2), maxX - minX) });
    const g = b.build();
    this.scaffoldCache.set(key, g);
    return g;
  }

  private remove(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    if (e.mesh.material !== this.material) (e.mesh.material as THREE.Material).dispose();
    if (e.dto.typeCode === 'road' && e.mesh.geometry !== this.models.get('road', e.dto.level)) e.mesh.geometry.dispose();
    this.group.remove(e.root);
    this.entries.delete(id);
  }
}
