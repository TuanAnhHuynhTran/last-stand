/**
 * PondRenderer — the player's water bodies.
 *
 *  terrain  : owns the PondEditLayer installed on the WorldGenerator. When ponds are dug,
 *             expanded or filled in, only the changed hexes' chunks are rebuilt (the terrain
 *             itself is carved — no flat blue sheet), see WorldEngine.setWaterBodies
 *  water    : one stylised water mesh per dug pond, lifted to the current water level
 *  scenery  : banks + structures per level (merged), spinning aerator wheels (instanced)
 *  fish     : FishSchool per pond, InstancedMesh pools per species (body + tail); at most
 *             MAX_FISH_PER_POND shown per pond and none beyond FISH_DRAW_DISTANCE / off-screen
 *  effects  : rising bubbles (aerators + random), feeding ripples / splashes
 */
import * as THREE from 'three';
import {
  FISH_SPECIES_CODES,
  PondEditLayer,
  getFishSpecies,
  getWaterBodyDefinition,
  hexKey,
  pondOccupant,
  targetWeight,
  worldToAxial,
  type FishSpeciesCode,
  type PondSpec,
  type WaterBodyDTO,
} from '@cityverse/shared';
import type { HeightSampler } from '../farming/farmGround';
import type { XZ } from '../farming/farmLayout';
import { FishModelCache } from './fishModels';
import { FishSchool, type FishPose, type SchoolFish } from './FishSchool';
import { computePondLayout, type PondLayout } from './pondLayout';
import { buildAeratorWheel, buildPondScenery } from './pondScenery';
import { MAX_RIPPLES, buildPondWaterGeometry, createPondWaterMaterial } from './pondWater';

export const MAX_FISH_PER_POND = 24;
export const FISH_DRAW_DISTANCE = 260;
const FISH_SCALE = 1.25;
const BUBBLES_PER_EMITTER = 6;
const AUTO_FEED_EVERY = 25;

interface Entry {
  dto: WaterBodyDTO;
  key: string;
  layout: PondLayout;
  root: THREE.Group;
  solid: THREE.Mesh;
  water: THREE.Mesh | null;
  material: THREE.ShaderMaterial | null;
  school: FishSchool;
  wheels: { x: number; y: number; z: number; ry: number }[];
  bubbles: XZ[];
  sphere: THREE.Sphere;
  ripples: THREE.Vector4[];
  rippleNext: number;
  autoFeed: number;
}

export interface PondRenderStats {
  ponds: number;
  fish: number;
  fishDrawn: number;
  culled: number;
}

export class PondRenderer {
  readonly group = new THREE.Group();
  /** Terrain edits for the world generator (dug ponds). */
  readonly edits = new PondEditLayer();
  readonly models = new FishModelCache();
  private readonly baseWater = createPondWaterMaterial();
  private readonly solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  private readonly fishMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 });
  private readonly entries = new Map<string, Entry>();
  private readonly hexToBody = new Map<string, string>();
  private readonly pools = new Map<FishSpeciesCode, { body: THREE.InstancedMesh; tail: THREE.InstancedMesh }>();
  private wheelMesh: THREE.InstancedMesh;
  private bubbleMesh: THREE.InstancedMesh;
  private readonly highlight: THREE.Mesh;
  private highlightId: string | null = null;
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly m = new THREE.Matrix4();
  private readonly m2 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private time = 0;
  readonly stats: PondRenderStats = { ponds: 0, fish: 0, fishDrawn: 0, culled: 0 };

  constructor() {
    this.group.name = 'PondRenderer';
    this.wheelMesh = new THREE.InstancedMesh(buildAeratorWheel(), this.solidMat, 8);
    this.wheelMesh.count = 0;
    this.wheelMesh.name = 'Pond:aerators';
    this.bubbleMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.09, 1),
      new THREE.MeshStandardMaterial({ color: '#e8fbff', transparent: true, opacity: 0.75, roughness: 0.1 }),
      64
    );
    this.bubbleMesh.count = 0;
    this.bubbleMesh.name = 'Pond:bubbles';
    this.highlight = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: '#bff3ff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
    );
    this.highlight.visible = false;
    this.highlight.renderOrder = 8;
    this.highlight.frustumCulled = false;
    this.group.add(this.wheelMesh, this.bubbleMesh, this.highlight);
  }

  get count(): number {
    return this.entries.size;
  }

  /** Terrain specs for the edit layer (server values: surface / bed heights). */
  static specs(list: readonly WaterBodyDTO[]): PondSpec[] {
    return list.map((b) => ({ id: b.id, hexes: b.hexes, surface: b.surfaceHeight, bottom: b.bottomHeight, dug: getWaterBodyDefinition(b.type).dug }));
  }

  occupiedHexes(): Map<string, string> {
    const m = new Map<string, string>();
    for (const [k, id] of this.hexToBody) m.set(k, pondOccupant(id));
    return m;
  }

  bodyAtHex(key: string): string | null {
    return this.hexToBody.get(key) ?? null;
  }

  getEntry(id: string): { layout: PondLayout; school: FishSchool; root: THREE.Group } | null {
    const e = this.entries.get(id);
    return e ? { layout: e.layout, school: e.school, root: e.root } : null;
  }

  /** Call after the terrain edit layer and chunks are up to date. */
  sync(list: readonly WaterBodyDTO[], height: HeightSampler, rebuildAll = false): void {
    const seen = new Set<string>();
    this.hexToBody.clear();
    for (const dto of list) {
      seen.add(dto.id);
      for (const h of dto.hexes) this.hexToBody.set(hexKey(h.q, h.r), dto.id);
      const key = sceneryKey(dto);
      let e = this.entries.get(dto.id);
      if (e && (rebuildAll || e.key !== key)) {
        this.remove(dto.id);
        e = undefined;
      }
      if (!e) e = this.create(dto, height);
      e.dto = dto;
      e.school.sync(displayFish(dto));
    }
    for (const id of [...this.entries.keys()]) if (!seen.has(id)) this.remove(id);
    this.setHighlight(this.highlightId, height);
  }

  /** Feeding: fish gather at the feeder, ripples spread, bubbles burst. */
  feed(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.school.feed();
    for (let i = 0; i < 3; i += 1) this.ripple(e, e.layout.feeder.x + (i - 1) * 0.6, e.layout.feeder.z + (i % 2) * 0.5, 0.9, i * 0.5);
  }

  setHighlight(id: string | null, height: HeightSampler): void {
    this.highlightId = id;
    const e = id ? this.entries.get(id) : null;
    this.highlight.geometry.dispose();
    if (!e) {
      this.highlight.geometry = new THREE.BufferGeometry();
      this.highlight.visible = false;
      return;
    }
    const pos: number[] = [];
    for (const edge of e.layout.frame.borderEdges) {
      const out = (p: XZ, d: number): XZ => {
        const vx = p.x - edge.center.x;
        const vz = p.z - edge.center.z;
        const l = Math.hypot(vx, vz) || 1;
        return { x: p.x + (vx / l) * d, z: p.z + (vz / l) * d };
      };
      const quad = [out(edge.a, 0.05), out(edge.b, 0.05), out(edge.b, 0.7), out(edge.a, 0.7)];
      for (const i of [0, 2, 1, 0, 3, 2]) pos.push(quad[i].x, height(quad[i].x, quad[i].z) + 0.6, quad[i].z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.highlight.geometry = g;
    this.highlight.visible = true;
  }

  update(dt: number, time: number, camera: THREE.Camera, sunDir: THREE.Vector3, serverNowMs: number): void {
    this.time = time;
    camera.updateMatrixWorld();
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    const cam = camera.getWorldPosition(this.v.clone());
    const counts = new Map<string, number>();
    let wheels = 0;
    let bubbles = 0;
    const st = this.stats;
    st.ponds = this.entries.size;
    st.fish = 0;
    st.fishDrawn = 0;
    st.culled = 0;

    for (const e of this.entries.values()) {
      const surface = effectiveSurface(e.dto, serverNowMs);
      e.layout.setSurface(surface);
      e.school.surfaceY = surface;
      if (e.material) {
        e.material.uniforms.uTime.value = time;
        e.material.uniforms.uSurface.value = surface;
        e.material.uniforms.uQuality.value = e.dto.waterQuality;
        (e.material.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
        e.water!.visible = e.dto.waterLevel > 0.02 || e.dto.status === 'filling';
      }
      st.fish += e.school.size;
      const visible = this.frustum.intersectsSphere(e.sphere) && cam.distanceTo(e.sphere.center) < FISH_DRAW_DISTANCE;
      // Automatic feeding animation while the feeder has food.
      e.autoFeed -= dt;
      if (e.autoFeed <= 0 && e.dto.feedStock > 0 && e.school.size) {
        e.school.feed(3);
        this.ripple(e, e.layout.feeder.x, e.layout.feeder.z, 0.5, 0);
        e.autoFeed = AUTO_FEED_EVERY;
      }
      if (!visible) {
        st.culled += e.school.size;
        continue;
      }
      e.school.update(dt);
      e.school.forEachPose((_id, species, pose) => this.writeFish(species, pose, counts));
      st.fishDrawn += e.school.size;
      // Random splashes from fish nibbling at the surface
      e.rippleNext -= dt;
      if (e.rippleNext <= 0 && e.school.size) {
        const p = e.school.positions()[Math.floor(Math.random() * e.school.size)];
        this.ripple(e, p.x, p.z, 0.35, 0);
        e.rippleNext = e.school.feeding ? 0.4 : 3 + Math.random() * 4;
      }
      for (const w of e.wheels) {
        if (wheels >= this.wheelMesh.instanceMatrix.count) this.wheelMesh = growInstanced(this.group, this.wheelMesh, wheels + 1);
        this.e.set(time * 3, w.ry, 0, 'YXZ');
        this.q.setFromEuler(this.e);
        this.wheelMesh.setMatrixAt(wheels++, this.m.compose(this.v.set(w.x, w.y, w.z), this.q, this.s.set(1, 1, 1)));
      }
      const emitters = e.school.feeding ? [...e.bubbles, e.layout.feeder] : e.bubbles;
      for (const [k, b] of emitters.entries()) {
        for (let i = 0; i < BUBBLES_PER_EMITTER; i += 1) {
          const t = (time * 0.8 + i / BUBBLES_PER_EMITTER + k * 0.37) % 1;
          if (bubbles >= this.bubbleMesh.instanceMatrix.count) this.bubbleMesh = growInstanced(this.group, this.bubbleMesh, bubbles + 1);
          const a = i * 2.4 + k;
          const sc = 0.6 + t * 0.8;
          this.bubbleMesh.setMatrixAt(
            bubbles++,
            this.m.compose(this.v.set(b.x + Math.cos(a) * 0.6, surface - 1.1 + t * 1.15, b.z + Math.sin(a) * 0.6), this.q.identity(), this.s.set(sc, sc, sc))
          );
        }
      }
      if (e.material) (e.material.uniforms.uRipples.value as THREE.Vector4[]).forEach((r, i) => r.copy(e.ripples[i]));
    }

    for (const code of FISH_SPECIES_CODES) {
      const p = this.pools.get(code);
      if (!p) continue;
      for (const part of ['body', 'tail'] as const) {
        const mesh = p[part];
        mesh.count = counts.get(`${code}:${part}`) ?? 0;
        mesh.visible = mesh.count > 0;
        if (mesh.count) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
        }
      }
    }
    for (const [mesh, n] of [[this.wheelMesh, wheels], [this.bubbleMesh, bubbles]] as const) {
      mesh.count = n;
      mesh.visible = n > 0;
      if (n) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    }
  }

  dispose(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
    for (const p of this.pools.values()) {
      p.body.dispose();
      p.tail.dispose();
    }
    this.models.dispose();
    this.baseWater.dispose();
    this.solidMat.dispose();
    this.fishMat.dispose();
    this.wheelMesh.geometry.dispose();
    this.wheelMesh.dispose();
    this.bubbleMesh.geometry.dispose();
    (this.bubbleMesh.material as THREE.Material).dispose();
    this.bubbleMesh.dispose();
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
  }

  // ── Internals ──────────────────────────────────────────────────────────────
  private create(dto: WaterBodyDTO, height: HeightSampler): Entry {
    const layout = computePondLayout(
      { id: dto.id, type: dto.type, level: dto.level, hexes: dto.hexes, surface: dto.surfaceHeight, bottom: dto.bottomHeight },
      height,
      (x, z) => this.edits.pondAt(x, z)?.id === dto.id || (!getWaterBodyDefinition(dto.type).dug && this.hexToBody.get(keyAt(x, z)) === dto.id)
    );
    const scenery = buildPondScenery(layout, height);
    const root = new THREE.Group();
    root.name = `Pond:${dto.id}`;
    const solid = new THREE.Mesh(scenery.solid, this.solidMat);
    solid.castShadow = true;
    solid.receiveShadow = true;
    root.add(solid);
    let water: THREE.Mesh | null = null;
    let material: THREE.ShaderMaterial | null = null;
    if (layout.dug) {
      material = this.baseWater.clone();
      material.uniforms.uRipples.value = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0));
      water = new THREE.Mesh(buildPondWaterGeometry(dto.hexes, height), material);
      water.name = `PondWater:${dto.id}`;
      water.renderOrder = 3;
      root.add(water);
    }
    let r = 0;
    for (const c of layout.frame.centers) r = Math.max(r, Math.hypot(c.x - layout.frame.centroid.x, c.z - layout.frame.centroid.z));
    const school = new FishSchool(layout, (s) => this.models.get(s).rig, dto.id, height);
    const entry: Entry = {
      dto,
      key: sceneryKey(dto),
      layout,
      root,
      solid,
      water,
      material,
      school,
      wheels: scenery.wheels,
      bubbles: scenery.bubbles,
      sphere: new THREE.Sphere(new THREE.Vector3(layout.frame.centroid.x, layout.surface, layout.frame.centroid.z), r + 8),
      ripples: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)),
      rippleNext: 2,
      autoFeed: 6,
    };
    this.entries.set(dto.id, entry);
    this.group.add(root);
    return entry;
  }

  private remove(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.solid.geometry.dispose();
    e.water?.geometry.dispose();
    e.material?.dispose();
    this.group.remove(e.root);
    this.entries.delete(id);
  }

  private ripple(e: Entry, x: number, z: number, amp: number, delay: number): void {
    // Reuse the oldest slot.
    let k = 0;
    for (let i = 1; i < e.ripples.length; i += 1) if (e.ripples[i].z < e.ripples[k].z) k = i;
    e.ripples[k].set(x, z, this.time + delay, amp);
  }

  private pool(species: FishSpeciesCode, part: 'body' | 'tail', need: number): THREE.InstancedMesh {
    let p = this.pools.get(species);
    if (!p) {
      const parts = this.models.get(species);
      const mk = (g: THREE.BufferGeometry, name: string) => {
        const mesh = new THREE.InstancedMesh(g, this.fishMat, 32);
        mesh.name = name;
        mesh.count = 0;
        this.group.add(mesh);
        return mesh;
      };
      p = { body: mk(parts.body, `Fish:${species}:body`), tail: mk(parts.tail, `Fish:${species}:tail`) };
      this.pools.set(species, p);
    }
    if (need > p[part].instanceMatrix.count) p[part] = growInstanced(this.group, p[part], need);
    return p[part];
  }

  private writeFish(species: FishSpeciesCode, pose: FishPose, counts: Map<string, number>): void {
    const rig = this.models.get(species).rig;
    const sc = pose.scale * FISH_SCALE;
    this.e.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(pose.x, pose.y, pose.z), this.q, this.s.set(sc, sc, sc));
    const bi = counts.get(`${species}:body`) ?? 0;
    counts.set(`${species}:body`, bi + 1);
    this.pool(species, 'body', bi + 1).setMatrixAt(bi, this.m);
    this.e.set(0, pose.tailYaw, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m2.compose(this.v.set(0, 0, rig.tailZ), this.q, this.s.set(1, 1, 1));
    const ti = counts.get(`${species}:tail`) ?? 0;
    counts.set(`${species}:tail`, ti + 1);
    this.pool(species, 'tail', ti + 1).setMatrixAt(ti, this.m2.premultiply(this.m));
  }
}

function growInstanced(group: THREE.Group, mesh: THREE.InstancedMesh, need: number): THREE.InstancedMesh {
  const bigger = new THREE.InstancedMesh(mesh.geometry, mesh.material, Math.ceil(need * 1.6));
  bigger.name = mesh.name;
  bigger.castShadow = mesh.castShadow;
  (bigger.instanceMatrix.array as Float32Array).set(mesh.instanceMatrix.array as Float32Array);
  group.remove(mesh);
  mesh.dispose();
  group.add(bigger);
  return bigger;
}

const keyAt = (x: number, z: number): string => {
  const a = worldToAxial(x, z);
  return hexKey(a.q, a.r);
};

function sceneryKey(b: WaterBodyDTO): string {
  return `${b.type}|${b.level}|${b.surfaceHeight}|${b.bottomHeight}|${b.hexes.map((h) => hexKey(h.q, h.r)).join(';')}`;
}

/** Water surface now: rising while filling, lower when the pond is not full. */
export function effectiveSurface(b: WaterBodyDTO, serverNowMs: number): number {
  if (!getWaterBodyDefinition(b.type).dug) return b.surfaceHeight;
  let level = b.waterLevel;
  if (b.fillStartedAt && b.fillFinishesAt) {
    const s = new Date(b.fillStartedAt).getTime();
    const f = new Date(b.fillFinishesAt).getTime();
    level = Math.max(level, Math.min(1, (serverNowMs - s) / Math.max(1, f - s)));
  }
  return b.bottomHeight + (b.surfaceHeight - b.bottomHeight) * Math.min(1, Math.max(0, level));
}

/** Fish shown for a water body (capped; distributed over the batches). */
export function displayFish(b: WaterBodyDTO): SchoolFish[] {
  const total = b.batches.reduce((s, x) => s + x.alive, 0);
  if (!total) return [];
  const cap = Math.min(MAX_FISH_PER_POND, total);
  const out: SchoolFish[] = [];
  for (const batch of b.batches) {
    const n = Math.max(batch.alive > 0 ? 1 : 0, Math.round((batch.alive / total) * cap));
    const scale = 0.45 + 0.55 * Math.min(1, batch.weight / getFishSpecies(batch.species).marketWeight);
    const grown = Math.min(1, batch.weight / targetWeight(b.type, batch.species));
    for (let i = 0; i < n && out.length < MAX_FISH_PER_POND; i += 1) out.push({ id: `${batch.id}:${i}`, species: batch.species, scale: scale * (0.9 + 0.1 * grown) });
  }
  return out;
}
