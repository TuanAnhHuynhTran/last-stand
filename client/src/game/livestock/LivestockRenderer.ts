/**
 * LivestockRenderer — livestock farms, their animals and caretakers.
 *
 *  scenery    : merged solid + water mesh per farm (rebuilt only when type / level / hexes change)
 *  animals    : InstancedMesh pools per species × part (body, head, leg) for the near LOD and one
 *               merged low-poly pool per species for the far LOD — a handful of draw calls total.
 *               Breed tints use per-instance colours.
 *  budget     : at most MAX_DETAILED_ANIMALS animals get animated parts per frame; nearer farms
 *               win, the rest fall back to the far LOD (which also simulates at a lower rate)
 *  culling    : farms outside the frustum are simulated at CULLED_SIM_HZ and write no matrices
 *               (animation culling); beyond LOD_FAR_DISTANCE animals are not drawn at all
 *  caretakers : one chibi caretaker per hired caretaker, standing at the caretaker spot / troughs
 *  markers    : bouncing "products ready" marker, upgrade progress bar, selection outline
 *  working    : (Phase 9) elephant trunk / ears, horse tail, tack from the animal's real equipment
 *               (saddle, barding, cargo harness + crates, howdah), water spray while bathing, and
 *               the saddle SEAT socket of every horse — riders are attached there (MilitaryRenderer)
 */
import * as THREE from 'three';
import {
  ANIMAL_TYPE_CODES,
  animalGrowth,
  cropProgress,
  getAnimalBreed,
  hexKey,
  ranchOccupant,
  type AnimalTypeCode,
  type FarmAnimalDTO,
  type LivestockFarmDTO,
  type LivestockProductCode,
} from '@cityverse/shared';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIELD_LIFT, type HeightSampler } from '../farming/farmGround';
import type { XZ } from '../farming/farmLayout';
import { buildFarmerGeometry } from '../farming/farmModels';
import { InstancePool } from '../military/instancePool';
import { AnimalModelCache } from './animalModels';
import { AnimalStateMachine, type AnimalActivity, type AnimalPose, type AnimationClip, type SimAnimal } from './AnimalStateMachine';
import { computeRanchLayout, type RanchLayout } from './ranchLayout';
import { buildRanchScenery } from './ranchGround';

/** Full animated parts within this camera distance, merged low-poly beyond. */
export const LOD_NEAR_DISTANCE = 150;
/** Animals are not drawn beyond this distance. */
export const LOD_FAR_DISTANCE = 460;
/** Chibi display scale of animals (big, readable from the isometric camera). */
export const ANIMAL_SCALE = 1.45;
/** Animals with detailed (per-part) animation per frame, across all farms. */
export const MAX_DETAILED_ANIMALS = 90;
/** Simulation rates for far-LOD farms and farms outside the frustum (Hz). */
const FAR_SIM_HZ = 10;
const CULLED_SIM_HZ = 2;
const CARETAKER_SCALE = 1.35;

const PRODUCT_MARKER: Record<LivestockProductCode, string> = {
  eggs: '#fff1d6',
  meat: '#ff9fb5',
  milk: '#ffffff',
  wool: '#f4f0ff',
  manure: '#9c7a52',
  draft: '#f2c14e',
};

interface FarmEntry {
  dto: LivestockFarmDTO;
  layout: RanchLayout;
  key: string;
  root: THREE.Group;
  solid: THREE.Mesh;
  water: THREE.Mesh | null;
  sim: AnimalStateMachine;
  sphere: THREE.Sphere;
  marker: THREE.Mesh;
  bar: THREE.Group;
  barFill: THREE.Mesh;
  topY: number;
  simTime: number;
  /** Animal DTOs by id (tack / activity) */
  info: Map<string, FarmAnimalDTO>;
}

interface SpeciesPools {
  body: THREE.InstancedMesh;
  head: THREE.InstancedMesh;
  leg: THREE.InstancedMesh;
  lod: THREE.InstancedMesh;
}

export interface LivestockRenderStats {
  farms: number;
  animals: number;
  /** Animals drawn with animated parts */
  near: number;
  /** Animals drawn with the merged far LOD */
  far: number;
  /** Animals in farms outside the frustum / too far (no matrices written) */
  culled: number;
  /** Animals that were near enough for detail but over the budget (drawn far LOD) */
  overBudget: number;
  caretakers: number;
}

const WHITE = new THREE.Color('#ffffff');

export class LivestockRenderer {
  readonly group = new THREE.Group();
  readonly models = new AnimalModelCache();
  readonly solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  readonly waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.1, depthWrite: false });
  private readonly animalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
  private readonly pools = new Map<AnimalTypeCode, SpeciesPools>();
  private readonly entries = new Map<string, FarmEntry>();
  private readonly hexToFarm = new Map<string, string>();
  private readonly markerGeo: THREE.BufferGeometry;
  private readonly markerMats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly barGeo = new THREE.PlaneGeometry(1, 1);
  private readonly barBgMat = new THREE.MeshBasicMaterial({ color: '#3b3026', transparent: true, opacity: 0.8, depthTest: false });
  private readonly barFillMat = new THREE.MeshBasicMaterial({ color: '#7ad0ff', transparent: true, depthTest: false });
  private readonly highlight: THREE.Mesh;
  private caretakerMesh: THREE.InstancedMesh;
  private readonly tintCache = new Map<string, THREE.Color>();
  private highlightId: string | null = null;
  private castShadow = true;
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  // Scratch
  private readonly mRoot = new THREE.Matrix4();
  private readonly mPart = new THREE.Matrix4();
  private readonly mTmp = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  readonly stats: LivestockRenderStats = { farms: 0, animals: 0, near: 0, far: 0, culled: 0, overBudget: 0, caretakers: 0 };
  /** Trunk / ears / tail / tack / spray instances */
  private readonly extras: InstancePool;
  private readonly dropGeo = new THREE.IcosahedronGeometry(0.09, 0);
  /** Seat socket (world) of each drawn working animal, refreshed every frame */
  private readonly seats = new Map<string, THREE.Matrix4>();
  private readonly clips = new Map<string, AnimationClip>();
  private readonly mSeat = new THREE.Matrix4();
  private readonly mHead = new THREE.Matrix4();
  private readonly mSeg = new THREE.Matrix4();

  constructor() {
    this.group.name = 'LivestockRenderer';
    const parts = [
      new THREE.ConeGeometry(0.5, 0.9, 12).rotateX(Math.PI).translate(0, -0.1, 0),
      new THREE.IcosahedronGeometry(0.65, 1).translate(0, 0.8, 0),
    ];
    this.markerGeo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
    parts.forEach((p) => p.dispose());
    this.highlight = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: '#fff6b0', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
    );
    this.highlight.renderOrder = 8;
    this.highlight.frustumCulled = false;
    this.highlight.visible = false;
    this.group.add(this.highlight);
    this.caretakerMesh = new THREE.InstancedMesh(buildFarmerGeometry(), this.animalMat, 16);
    this.caretakerMesh.name = 'Ranch:caretakers';
    this.caretakerMesh.count = 0;
    this.caretakerMesh.castShadow = true;
    this.group.add(this.caretakerMesh);
    this.extras = new InstancePool(this.group, this.animalMat, 'AnimalExtra');
  }

  /** World matrix of a horse / elephant's saddle seat (false if it was not drawn this frame). */
  seatMatrix(animalId: string, out: THREE.Matrix4): boolean {
    const m = this.seats.get(animalId);
    if (!m) return false;
    out.copy(m);
    return true;
  }

  /** Clip an animal played on the last drawn frame (tests / HUD). */
  clipOf(animalId: string): AnimationClip | null {
    return this.clips.get(animalId) ?? null;
  }

  /** Extra part instances written on the last frame (tests). */
  extraCount(key: string): number {
    return this.extras.count(key);
  }

  get count(): number {
    return this.entries.size;
  }

  setShadows(enabled: boolean): void {
    this.castShadow = enabled;
    for (const e of this.entries.values()) e.solid.castShadow = enabled;
    for (const p of this.pools.values()) {
      p.body.castShadow = enabled;
      p.head.castShadow = enabled;
    }
    this.caretakerMesh.castShadow = enabled;
  }

  occupiedHexes(): Map<string, string> {
    const m = new Map<string, string>();
    for (const [k, id] of this.hexToFarm) m.set(k, ranchOccupant(id));
    return m;
  }

  farmAtHex(key: string): string | null {
    return this.hexToFarm.get(key) ?? null;
  }

  getEntry(id: string): { layout: RanchLayout; sim: AnimalStateMachine; root: THREE.Group } | null {
    const e = this.entries.get(id);
    return e ? { layout: e.layout, sim: e.sim, root: e.root } : null;
  }

  /** Animals of the farm hop happily (selection / collection feedback). */
  react(farmId: string): void {
    this.entries.get(farmId)?.sim.react();
  }

  sync(list: readonly LivestockFarmDTO[], height: HeightSampler, serverNowMs: number): void {
    const seen = new Set<string>();
    this.hexToFarm.clear();
    for (const dto of list) {
      seen.add(dto.id);
      for (const h of dto.hexes) this.hexToFarm.set(hexKey(h.q, h.r), dto.id);
      const key = sceneryKey(dto);
      let e = this.entries.get(dto.id);
      if (e && e.key !== key) {
        // Level / shape changed: new scenery and nav grid (animals respawn near the barn).
        this.remove(dto.id);
        e = undefined;
      }
      if (!e) e = this.create(dto, height);
      e.dto = dto;
      e.info = new Map(dto.animals.map((a) => [a.id, a]));
      e.sim.setSupplies({ feed: dto.feedStock > 0.5, water: dto.waterStock > 0.5 });
      e.sim.sync(simAnimals(dto, serverNowMs));
    }
    for (const id of [...this.entries.keys()]) if (!seen.has(id)) this.remove(id);
    this.setHighlight(this.highlightId, height);
  }

  /** Re-drapes scenery after a terrain LOD change. */
  reseat(height: HeightSampler, serverNowMs: number): void {
    const list = [...this.entries.values()].map((e) => e.dto);
    for (const dto of list) this.remove(dto.id);
    this.sync(list, height, serverNowMs);
  }

  setHighlight(farmId: string | null, height: HeightSampler): void {
    this.highlightId = farmId;
    const e = farmId ? this.entries.get(farmId) : null;
    this.highlight.geometry.dispose();
    if (!e) {
      this.highlight.geometry = new THREE.BufferGeometry();
      this.highlight.visible = false;
      return;
    }
    const pos: number[] = [];
    for (const edge of e.layout.frame.borderEdges) {
      const inward = (p: XZ, d: number): XZ => {
        const vx = edge.center.x - p.x;
        const vz = edge.center.z - p.z;
        const l = Math.hypot(vx, vz) || 1;
        return { x: p.x + (vx / l) * d, z: p.z + (vz / l) * d };
      };
      const quad = [inward(edge.a, 0.05), inward(edge.b, 0.05), inward(edge.b, 0.7), inward(edge.a, 0.7)];
      for (const i of [0, 2, 1, 0, 3, 2]) pos.push(quad[i].x, height(quad[i].x, quad[i].z) + 1.35, quad[i].z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.highlight.geometry = g;
    this.highlight.visible = true;
  }

  update(serverNowMs: number, dt: number, time: number, camera: THREE.Camera, height: HeightSampler): void {
    camera.updateMatrixWorld();
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    const camPos = camera.getWorldPosition(this.v.clone());

    const counts = new Map<string, number>();
    const st = this.stats;
    st.farms = this.entries.size;
    st.animals = 0;
    st.near = 0;
    st.far = 0;
    st.culled = 0;
    st.overBudget = 0;
    st.caretakers = 0;

    // Nearest farms first: they get the detailed-animation budget.
    const ordered = [...this.entries.values()]
      .map((e) => ({ e, dist: camPos.distanceTo(e.sphere.center), visible: this.frustum.intersectsSphere(e.sphere) }))
      .sort((a, b) => a.dist - b.dist);
    let budget = MAX_DETAILED_ANIMALS;
    let caretakers = 0;
    this.extras.begin();
    this.seats.clear();

    for (const { e, dist, visible } of ordered) {
      st.animals += e.sim.size;
      // Growth may have turned young animals into adults.
      e.sim.sync(simAnimals(e.dto, serverNowMs));
      if (!visible || dist > LOD_FAR_DISTANCE) {
        // Animation culling: low-rate simulation, no pose / matrix work.
        this.tick(e, dt, CULLED_SIM_HZ, 2);
        st.culled += e.sim.size;
      } else {
        const wantsDetail = dist <= LOD_NEAR_DISTANCE;
        const detailed = wantsDetail && e.sim.size <= budget;
        if (wantsDetail && !detailed) st.overBudget += e.sim.size;
        if (detailed) {
          budget -= e.sim.size;
          e.sim.update(dt, 4);
          e.simTime = 0;
        } else this.tick(e, dt, FAR_SIM_HZ, 3);
        e.sim.forEachPose(time, (id, code, pose, tint, clip) => {
          const y = height(pose.x, pose.z) + FIELD_LIFT;
          this.clips.set(id, clip);
          const info = e.info.get(id);
          if (detailed) this.writeNear(code, pose, y, tint, counts, id, info, clip, time);
          else this.writeFar(code, pose, y, tint, counts, id);
        });
        if (detailed) st.near += e.sim.size;
        else st.far += e.sim.size;
        caretakers = this.writeCaretakers(e, time, height, caretakers);
      }

      // Markers
      const ready = e.dto.jobs.find((j) => j.jobType === 'produce' && j.status === 'ready');
      e.marker.visible = Boolean(ready);
      if (ready) {
        const product = (Object.keys(ready.output)[0] ?? 'eggs') as LivestockProductCode;
        e.marker.material = this.markerMat(PRODUCT_MARKER[product] ?? '#ffffff');
        e.marker.position.y = e.topY + Math.sin(time * 3 + e.sphere.center.x) * 0.35;
        e.marker.rotation.y = time * 1.5;
      }
      const up =
        e.dto.status === 'upgrading' && e.dto.upgradeStartedAt && e.dto.upgradeFinishesAt
          ? cropProgress(new Date(e.dto.upgradeStartedAt).getTime(), new Date(e.dto.upgradeFinishesAt).getTime(), serverNowMs)
          : null;
      e.bar.visible = up !== null;
      if (up !== null) {
        e.bar.quaternion.copy(camera.quaternion);
        e.barFill.scale.x = Math.max(0.001, up) * 4.1;
        e.barFill.position.x = -2.05 + (up * 4.1) / 2;
      }
    }

    for (const code of ANIMAL_TYPE_CODES) {
      const p = this.pools.get(code);
      if (!p) continue;
      for (const part of ['body', 'head', 'leg', 'lod'] as const) {
        const mesh = p[part];
        mesh.count = counts.get(`${code}:${part}`) ?? 0;
        mesh.visible = mesh.count > 0;
        if (mesh.count) {
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          mesh.computeBoundingSphere();
        }
      }
    }
    this.extras.commit();
    this.caretakerMesh.count = caretakers;
    this.caretakerMesh.visible = caretakers > 0;
    if (caretakers) {
      this.caretakerMesh.instanceMatrix.needsUpdate = true;
      this.caretakerMesh.computeBoundingSphere();
    }
    st.caretakers = caretakers;
  }

  dispose(): void {
    this.extras.dispose();
    this.dropGeo.dispose();
    for (const id of [...this.entries.keys()]) this.remove(id);
    for (const p of this.pools.values()) for (const m of Object.values(p)) (m as THREE.InstancedMesh).dispose();
    this.models.dispose();
    this.markerGeo.dispose();
    for (const m of this.markerMats.values()) m.dispose();
    this.barGeo.dispose();
    this.barBgMat.dispose();
    this.barFillMat.dispose();
    this.solidMat.dispose();
    this.waterMat.dispose();
    this.animalMat.dispose();
    this.caretakerMesh.geometry.dispose();
    this.caretakerMesh.dispose();
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
  }

  // ── Farms ──────────────────────────────────────────────────────────────────
  /** Throttled simulation step (far / culled farms). */
  private tick(e: FarmEntry, dt: number, hz: number, pathBudget: number): void {
    e.simTime += dt;
    if (e.simTime >= 1 / hz) {
      e.sim.update(e.simTime, pathBudget);
      e.simTime = 0;
    }
  }

  private create(dto: LivestockFarmDTO, height: HeightSampler): FarmEntry {
    const layout = computeRanchLayout({ id: dto.id, farmType: dto.farmType, level: dto.level, hexes: dto.hexes, tiles: dto.tiles });
    const scenery = buildRanchScenery(dto.farmType, dto.level, layout, dto.hexes, height);
    const root = new THREE.Group();
    root.name = `Ranch:${dto.id}`;
    const solid = new THREE.Mesh(scenery.solid, this.solidMat);
    solid.castShadow = this.castShadow;
    solid.receiveShadow = true;
    root.add(solid);
    let water: THREE.Mesh | null = null;
    if (scenery.water) {
      water = new THREE.Mesh(scenery.water, this.waterMat);
      water.renderOrder = 2;
      root.add(water);
    }
    const marker = new THREE.Mesh(this.markerGeo, this.markerMat('#ffffff'));
    marker.name = 'Ranch:marker';
    marker.position.set(layout.frame.centroid.x, scenery.topY, layout.frame.centroid.z);
    marker.visible = false;
    root.add(marker);

    const bar = new THREE.Group();
    const bg = new THREE.Mesh(this.barGeo, this.barBgMat);
    bg.scale.set(4.4, 0.6, 1);
    const fill = new THREE.Mesh(this.barGeo, this.barFillMat);
    fill.scale.set(0.001, 0.36, 1);
    fill.position.z = 0.01;
    bg.renderOrder = 20;
    fill.renderOrder = 21;
    bar.add(bg, fill);
    bar.position.set(layout.frame.centroid.x, scenery.topY + 1.6, layout.frame.centroid.z);
    bar.visible = false;
    root.add(bar);

    let r = 0;
    for (const c of layout.frame.centers) r = Math.max(r, Math.hypot(c.x - layout.frame.centroid.x, c.z - layout.frame.centroid.z));
    const cy = height(layout.frame.centroid.x, layout.frame.centroid.z);
    const entry: FarmEntry = {
      dto,
      layout,
      key: sceneryKey(dto),
      root,
      solid,
      water,
      sim: new AnimalStateMachine(layout, (code) => this.models.get(code).rig, dto.id),
      sphere: new THREE.Sphere(new THREE.Vector3(layout.frame.centroid.x, cy + 1.5, layout.frame.centroid.z), r + 8),
      marker,
      bar,
      barFill: fill,
      topY: scenery.topY,
      simTime: 0,
      info: new Map(dto.animals.map((a) => [a.id, a])),
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
    this.group.remove(e.root);
    this.entries.delete(id);
  }

  private markerMat(color: string): THREE.MeshStandardMaterial {
    let m = this.markerMats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, emissive: '#ffb300', emissiveIntensity: 0.35, roughness: 0.4 });
      this.markerMats.set(color, m);
    }
    return m;
  }

  /** Caretakers: first at the caretaker spot, the others by the feeder / water trough; they sway and look around. */
  private writeCaretakers(e: FarmEntry, time: number, height: HeightSampler, index: number): number {
    const L = e.layout;
    const spots: { x: number; z: number; face: XZ }[] = [
      { x: L.caretaker.x, z: L.caretaker.z, face: L.feeder },
      ...[L.feeder, L.water, L.storage ?? L.barn].map((s, k) => {
        const p = L.nav.nearestWalkable(s.x + (k % 2 ? 2.6 : -2.6), s.z + 2.2) ?? s;
        return { x: p.x, z: p.z, face: s };
      }),
    ];
    for (let i = 0; i < Math.min(e.dto.caretakers, spots.length); i += 1) {
      const sp = spots[i];
      if (index >= this.caretakerMesh.instanceMatrix.count) this.growCaretakers(index + 1);
      const sway = Math.sin(time * 1.3 + i * 2 + e.sphere.center.x) * 0.25;
      this.e.set(0, Math.atan2(sp.face.x - sp.x, sp.face.z - sp.z) + sway, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.v.set(sp.x, height(sp.x, sp.z) + FIELD_LIFT + Math.abs(Math.sin(time * 2 + i)) * 0.03, sp.z);
      this.s.setScalar(CARETAKER_SCALE);
      this.caretakerMesh.setMatrixAt(index, this.mTmp.compose(this.v, this.q, this.s));
      index += 1;
    }
    return index;
  }

  private growCaretakers(need: number): void {
    const old = this.caretakerMesh;
    const bigger = new THREE.InstancedMesh(old.geometry, this.animalMat, Math.ceil(need * 1.6));
    bigger.name = old.name;
    bigger.castShadow = old.castShadow;
    (bigger.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    this.group.remove(old);
    old.dispose();
    this.group.add(bigger);
    this.caretakerMesh = bigger;
  }

  // ── Animals ────────────────────────────────────────────────────────────────
  private pool(code: AnimalTypeCode, part: keyof SpeciesPools, need: number): THREE.InstancedMesh {
    let p = this.pools.get(code);
    if (!p) {
      const m = this.models.get(code);
      const mk = (geo: THREE.BufferGeometry, cap: number, name: string): THREE.InstancedMesh => {
        const mesh = new THREE.InstancedMesh(geo, this.animalMat, cap);
        mesh.name = name;
        mesh.count = 0;
        mesh.castShadow = this.castShadow && (name.endsWith('body') || name.endsWith('head'));
        this.group.add(mesh);
        return mesh;
      };
      p = {
        body: mk(m.body, 32, `Animal:${code}:body`),
        head: mk(m.head, 32, `Animal:${code}:head`),
        leg: mk(m.leg, 32 * 4, `Animal:${code}:leg`),
        lod: mk(m.lod, 32, `Animal:${code}:lod`),
      };
      this.pools.set(code, p);
    }
    const mesh = p[part];
    if (need <= mesh.instanceMatrix.count) return mesh;
    // Grow: copy existing matrices (and tints) into a bigger pool.
    const bigger = new THREE.InstancedMesh(mesh.geometry, this.animalMat, Math.ceil(need * 1.6));
    bigger.name = mesh.name;
    bigger.castShadow = mesh.castShadow;
    (bigger.instanceMatrix.array as Float32Array).set(mesh.instanceMatrix.array as Float32Array);
    if (mesh.instanceColor) {
      for (let i = 0; i < bigger.instanceMatrix.count; i += 1) bigger.setColorAt(i, WHITE);
      (bigger.instanceColor!.array as Float32Array).set(mesh.instanceColor.array as Float32Array);
    }
    this.group.remove(mesh);
    mesh.dispose();
    this.group.add(bigger);
    p[part] = bigger;
    return bigger;
  }

  private next(code: AnimalTypeCode, part: keyof SpeciesPools, counts: Map<string, number>): [THREE.InstancedMesh, number] {
    const k = `${code}:${part}`;
    const i = counts.get(k) ?? 0;
    counts.set(k, i + 1);
    return [this.pool(code, part, i + 1), i];
  }

  private tint(color: string | null): THREE.Color {
    if (!color) return WHITE;
    let c = this.tintCache.get(color);
    if (!c) {
      c = new THREE.Color(color);
      this.tintCache.set(color, c);
    }
    return c;
  }

  private rootMatrix(pose: AnimalPose, y: number, legLength: number): THREE.Matrix4 {
    const sc = pose.scale * ANIMAL_SCALE;
    this.v.set(pose.x, y + pose.lift * sc - legLength * 0.78 * pose.lying * sc, pose.z);
    this.e.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
    this.q.setFromEuler(this.e);
    this.s.set(sc, sc, sc);
    return this.mRoot.compose(this.v, this.q, this.s);
  }

  private writeNear(
    code: AnimalTypeCode,
    pose: AnimalPose,
    y: number,
    tint: string | null,
    counts: Map<string, number>,
    id = '',
    info?: FarmAnimalDTO,
    clip: AnimationClip = 'idle',
    time = 0
  ): void {
    const parts = this.models.get(code);
    const rig = parts.rig;
    const color = this.tint(tint);
    const root = this.rootMatrix(pose, y, rig.legLength);
    let [mesh, i] = this.next(code, 'body', counts);
    mesh.setMatrixAt(i, root);
    mesh.setColorAt(i, color);

    // Head: neck pivot, yaw then pitch; young animals get an extra-big head.
    const headScale = pose.scale < 1 ? 1.22 : 1;
    this.e.set(pose.headPitch, pose.headYaw, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.v.set(rig.head.x, rig.head.y, rig.head.z);
    this.s.set(headScale, headScale, headScale);
    this.mPart.compose(this.v, this.q, this.s);
    [mesh, i] = this.next(code, 'head', counts);
    mesh.setMatrixAt(i, this.mTmp.multiplyMatrices(root, this.mPart));
    mesh.setColorAt(i, color);
    this.mHead.copy(this.mTmp);

    // Elephant trunk: three soft segments curling with pose.trunk (negative = raised).
    if (parts.trunk && rig.trunk) {
      this.mSeg.multiplyMatrices(this.mHead, this.mPart.makeTranslation(0, rig.trunk.y, rig.trunk.z));
      for (let k = 0; k < 3; k += 1) {
        const sc = 1 - k * 0.18;
        this.e.set(0.12 + pose.trunk * (0.22 + 0.16 * k), 0, 0, 'YXZ');
        this.q.setFromEuler(this.e);
        this.mPart.compose(this.v.set(0, 0, 0), this.q, this.s.set(sc, sc, sc));
        this.mSeg.multiply(this.mPart);
        this.extras.put(`${code}:trunk`, parts.trunk, this.mSeg, color);
        this.mSeg.multiply(this.mPart.makeTranslation(0, -rig.trunk.segment, 0));
        this.mPart.makeScale(1 / sc, 1 / sc, 1 / sc);
        this.mSeg.multiply(this.mPart);
      }
      // Bathing: droplets arc from the raised trunk over the back.
      if (clip === 'bathe' && pose.trunk < -1.2) {
        const tip = new THREE.Vector3().setFromMatrixPosition(this.mSeg);
        const back = new THREE.Vector3(0, rig.seat?.y ?? 2.5, -0.4).applyMatrix4(root);
        for (let k = 0; k < 7; k += 1) {
          const u = (time * 1.6 + k / 7) % 1;
          const p = tip.clone().lerp(back, u);
          p.y += Math.sin(u * Math.PI) * 1.6;
          this.mPart.makeTranslation(p.x, p.y, p.z);
          this.extras.put('drop', this.dropGeo, this.mPart, this.tint('#8fd6ff'));
        }
      }
    }
    if (parts.ear && rig.ears) {
      rig.ears.forEach((ep, k) => {
        const side = k === 0 ? -1 : 1;
        this.e.set(0, side * (0.15 + pose.ear), 0, 'YXZ');
        this.q.setFromEuler(this.e);
        this.mPart.compose(this.v.set(ep.x, ep.y, ep.z), this.q, this.s.set(1, 1, 1));
        this.extras.put(`${code}:ear`, parts.ear!, this.mSeg.multiplyMatrices(this.mHead, this.mPart), color);
      });
    }
    if (parts.tail && rig.tail) {
      this.e.set(0.35, pose.tail, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.mPart.compose(this.v.set(0, rig.tail.y, rig.tail.z), this.q, this.s.set(1, 1, 1));
      this.extras.put(`${code}:tail`, parts.tail, this.mSeg.multiplyMatrices(root, this.mPart), WHITE);
    }
    // Seat socket + tack from the real equipment (saddle, barding, harness, howdah) and cargo crates.
    if (rig.seat) {
      this.mSeat.multiplyMatrices(root, this.mPart.makeTranslation(0, rig.seat.y, rig.seat.z));
      if (id) this.seats.set(id, this.mSeat.clone());
      const eq = info?.traits?.equipment ?? {};
      const tack = parts.tack ?? {};
      for (const slot of ['saddle', 'armor', 'harness', 'howdah'] as const) {
        const g = tack[slot];
        if (g && eq[slot]) this.extras.put(`${code}:tack:${slot}`, g, this.mSeat, WHITE);
      }
      if (tack.crates && eq.harness && activityOf(info) === 'cargo') this.extras.put(`${code}:tack:crates`, tack.crates, this.mSeat, WHITE);
    }

    // Legs: swing in diagonal pairs; folded when lying down.
    const fold = 1 - 0.85 * pose.lying;
    rig.hips.forEach((hip, k) => {
      const offset = rig.hips.length === 2 ? k * Math.PI : k === 0 || k === 3 ? 0 : Math.PI;
      this.e.set(pose.legSwing * Math.sin(pose.legPhase + offset), 0, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.v.set(hip.x, rig.hipY, hip.z);
      this.s.set(1, Math.max(0.05, fold), 1);
      this.mPart.compose(this.v, this.q, this.s);
      [mesh, i] = this.next(code, 'leg', counts);
      mesh.setMatrixAt(i, this.mTmp.multiplyMatrices(root, this.mPart));
    });
  }

  private writeFar(code: AnimalTypeCode, pose: AnimalPose, y: number, tint: string | null, counts: Map<string, number>, id = ''): void {
    const rig = this.models.get(code).rig;
    const root = this.rootMatrix(pose, y, rig.legLength);
    // Riders stay on far horses too.
    if (rig.seat && id) this.seats.set(id, new THREE.Matrix4().multiplyMatrices(root, this.mPart.makeTranslation(0, rig.seat.y, rig.seat.z)));
    const [mesh, i] = this.next(code, 'lod', counts);
    mesh.setMatrixAt(i, root);
    mesh.setColorAt(i, this.tint(tint));
  }
}

function sceneryKey(f: LivestockFarmDTO): string {
  return `${f.farmType}|${f.level}|${f.hexes.map((h) => hexKey(h.q, h.r)).join(';')}`;
}

/** Working animals: a running training job, a rider or transport duty drives the behaviour. */
export function activityOf(a: FarmAnimalDTO | undefined): AnimalActivity | null {
  const t = a?.traits;
  if (!t) return null;
  if (t.training) return 'train';
  if (t.use?.kind === 'mount') return 'ride';
  if (t.use?.kind === 'transport') return 'cargo';
  return null;
}

function simAnimals(dto: LivestockFarmDTO, serverNowMs: number): SimAnimal[] {
  return dto.animals.map((a) => ({
    id: a.id,
    code: a.animalCode,
    adult: animalGrowth(new Date(a.bornAt).getTime(), new Date(a.growsUpAt).getTime(), serverNowMs) >= 1,
    satiety: a.satiety,
    thirst: a.thirst,
    health: a.health,
    tint: getAnimalBreed(a.animalCode, a.breed).tint,
    activity: activityOf(a),
  }));
}
