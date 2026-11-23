/**
 * FarmRenderer — farm zones in the 3D world.
 *
 *  scenery : one merged solid mesh + one water mesh per zone (ground, bunds, canal, roads,
 *            beds, hut / pump / windmill …), rebuilt only when the zone's shape or level changes
 *  crops   : one InstancedMesh per (crop, growth stage) shared by ALL zones; matrices are
 *            rebuilt only when a zone changes stage or grows a visible step
 *  wind    : vertex-shader sway (instance position phase × height above ground)
 *  farmers : one InstancedMesh, simple walk → work → walk loop per zone
 *  markers : bouncing "ripe" marker and an upgrade progress bar per zone
 */
import * as THREE from 'three';
import {
  cropStageAt,
  cropStageFraction,
  farmOccupant,
  getCropDefinition,
  getFarmZoneLevel,
  hexKey,
  type CropTypeCode,
  type FarmZoneDTO,
} from '@cityverse/shared';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeZoneLayout, type XZ, type ZoneLayout } from './farmLayout';
import { FIELD_LIFT, buildZoneScenery, type AnimatedPart, type HeightSampler } from './farmGround';
import { CROP_WIND, buildCropGeometry, buildFarmerGeometry, buildWindmillBlades, type StageIndex } from './farmModels';
import { isZoneRipe, zoneCropProgress, zoneUpgradeProgress } from './farmStore';

interface FarmerState {
  pos: THREE.Vector3;
  target: XZ;
  waiting: number;
  phase: number;
}

interface ZoneEntry {
  dto: FarmZoneDTO;
  layout: ZoneLayout;
  sceneryKey: string;
  root: THREE.Group;
  solid: THREE.Mesh;
  water: THREE.Mesh | null;
  blades: THREE.Mesh[];
  slotY: Float32Array;
  marker: THREE.Group;
  bar: THREE.Group;
  barFill: THREE.Mesh;
  topY: number;
  farmers: FarmerState[];
}

const MAX_FARMERS_PER_ZONE = 4;

export class FarmRenderer {
  readonly group = new THREE.Group();
  readonly solidMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  readonly waterMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    roughness: 0.08,
    metalness: 0.1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  private readonly time = { value: 0 };
  private readonly cropMats = new Map<CropTypeCode, THREE.MeshStandardMaterial>();
  private readonly cropGeos = new Map<string, THREE.BufferGeometry>();
  private readonly pools = new Map<string, THREE.InstancedMesh>();
  private readonly entries = new Map<string, ZoneEntry>();
  private readonly hexToZone = new Map<string, string>();
  private readonly farmerGeo = buildFarmerGeometry();
  private readonly farmerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  private farmers: THREE.InstancedMesh;
  private readonly bladesGeo = buildWindmillBlades();
  private readonly markerGeo: THREE.BufferGeometry;
  private readonly markerMat = new THREE.MeshStandardMaterial({ color: '#ffd54a', emissive: '#ffb300', emissiveIntensity: 0.55, roughness: 0.4 });
  private readonly barGeo = new THREE.PlaneGeometry(1, 1);
  private readonly barBgMat = new THREE.MeshBasicMaterial({ color: '#3b3026', transparent: true, opacity: 0.8, depthTest: false });
  private readonly barFillMat = new THREE.MeshBasicMaterial({ color: '#7ad0ff', transparent: true, depthTest: false });
  private readonly highlight: THREE.Mesh;
  private highlightId: string | null = null;
  /** null = dirty (forces a rebuild even when nothing is planted). */
  private cropSignature: string | null = null;
  private castShadow = true;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpP = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.group.name = 'FarmRenderer';
    this.farmers = this.createFarmerMesh(16);
    this.markerGeo = buildMarkerGeometry();
    this.highlight = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: '#fff6b0', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
    );
    this.highlight.renderOrder = 8;
    this.highlight.frustumCulled = false;
    this.highlight.visible = false;
    this.group.add(this.highlight);
  }

  get count(): number {
    return this.entries.size;
  }

  /** Visible crop instances (all zones). */
  get cropInstances(): number {
    let n = 0;
    for (const p of this.pools.values()) n += p.visible ? p.count : 0;
    return n;
  }

  get farmerCount(): number {
    return this.farmers.count;
  }

  setShadows(enabled: boolean): void {
    this.castShadow = enabled;
    for (const e of this.entries.values()) {
      e.solid.castShadow = enabled;
      for (const b of e.blades) b.castShadow = enabled;
    }
    this.farmers.castShadow = enabled;
    for (const [key, mesh] of this.pools) mesh.castShadow = enabled && (key.startsWith('orange') || key.startsWith('corn'));
  }

  /** Hex key → `farm:<zoneId>` (merged into the building placement occupancy). */
  occupiedHexes(): Map<string, string> {
    const m = new Map<string, string>();
    for (const [k, id] of this.hexToZone) m.set(k, farmOccupant(id));
    return m;
  }

  zoneAtHex(key: string): string | null {
    return this.hexToZone.get(key) ?? null;
  }

  getEntry(id: string): { layout: ZoneLayout; root: THREE.Group; dto: FarmZoneDTO } | null {
    const e = this.entries.get(id);
    return e ? { layout: e.layout, root: e.root, dto: e.dto } : null;
  }

  /** Reconciles zone meshes with the server list. */
  sync(list: readonly FarmZoneDTO[], height: HeightSampler): void {
    const seen = new Set<string>();
    this.hexToZone.clear();
    for (const dto of list) {
      seen.add(dto.id);
      for (const h of dto.hexes) this.hexToZone.set(hexKey(h.q, h.r), dto.id);
      const key = sceneryKey(dto);
      const e = this.entries.get(dto.id);
      if (!e) this.create(dto, height);
      else if (e.sceneryKey !== key) {
        this.remove(dto.id);
        this.create(dto, height);
      } else {
        e.dto = dto;
        this.syncFarmers(e);
      }
    }
    for (const id of [...this.entries.keys()]) if (!seen.has(id)) this.remove(id);
    this.cropSignature = null;
    this.setHighlight(this.highlightId, height);
  }

  /** Rebuilds scenery heights after a terrain LOD change. */
  reseat(height: HeightSampler): void {
    const list = [...this.entries.values()].map((e) => e.dto);
    for (const dto of list) this.remove(dto.id);
    for (const dto of list) this.create(dto, height);
    this.cropSignature = null;
    this.setHighlight(this.highlightId, height);
  }

  /** Soft glow over the selected zone's hexes. */
  setHighlight(zoneId: string | null, height: HeightSampler): void {
    this.highlightId = zoneId;
    const e = zoneId ? this.entries.get(zoneId) : null;
    this.highlight.geometry.dispose();
    if (!e) {
      this.highlight.geometry = new THREE.BufferGeometry();
      this.highlight.visible = false;
      return;
    }
    // Glowing outline along the zone border (a fill would wash out the field colours).
    const pos: number[] = [];
    for (const edge of e.layout.borderEdges) {
      const { a, b, center } = edge;
      const inward = (p: XZ, d: number): XZ => {
        const vx = center.x - p.x;
        const vz = center.z - p.z;
        const l = Math.hypot(vx, vz) || 1;
        return { x: p.x + (vx / l) * d, z: p.z + (vz / l) * d };
      };
      const quad = [inward(a, 0.05), inward(b, 0.05), inward(b, 0.75), inward(a, 0.75)];
      for (const i of [0, 2, 1, 0, 3, 2]) {
        const p = quad[i];
        pos.push(p.x, height(p.x, p.z) + 0.75, p.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.highlight.geometry = g;
    this.highlight.visible = true;
  }

  /** Per frame: wind, crop growth, farmers, markers. */
  update(serverNowMs: number, dt: number, time: number, camera: THREE.Camera, height: HeightSampler): void {
    this.time.value = time;
    this.updateCrops(serverNowMs);
    this.updateFarmers(dt, time, height);
    for (const e of this.entries.values()) {
      for (const b of e.blades) b.rotation.z += dt * 1.6;
      const ripe = isZoneRipe(e.dto, serverNowMs);
      e.marker.visible = ripe;
      if (ripe) {
        e.marker.position.y = e.topY + Math.sin(time * 3 + e.layout.centroid.x) * 0.35;
        e.marker.rotation.y = time * 1.5;
      }
      const up = zoneUpgradeProgress(e.dto, serverNowMs);
      e.bar.visible = up !== null;
      if (up !== null) {
        e.bar.quaternion.copy(camera.quaternion);
        e.barFill.scale.x = Math.max(0.001, up) * 4.1;
        e.barFill.position.x = -2.05 + (up * 4.1) / 2;
      }
    }
  }

  dispose(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
    for (const p of this.pools.values()) p.dispose();
    for (const g of this.cropGeos.values()) g.dispose();
    for (const m of this.cropMats.values()) m.dispose();
    this.farmers.dispose();
    this.farmerGeo.dispose();
    this.farmerMat.dispose();
    this.bladesGeo.dispose();
    this.markerGeo.dispose();
    this.markerMat.dispose();
    this.barGeo.dispose();
    this.barBgMat.dispose();
    this.barFillMat.dispose();
    this.solidMat.dispose();
    this.waterMat.dispose();
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
  }

  // ── Zones ──────────────────────────────────────────────────────────────────
  private create(dto: FarmZoneDTO, height: HeightSampler): void {
    const layout = computeZoneLayout({
      id: dto.id,
      zoneType: dto.zoneType,
      level: dto.level,
      hexes: dto.hexes,
      sourceHex: dto.irrigation.sourceHex,
    });
    const scenery = buildZoneScenery(dto.zoneType, dto.level, layout, dto.hexes, height);
    const root = new THREE.Group();
    root.name = `FarmZone:${dto.id}`;
    const solid = new THREE.Mesh(scenery.solid, this.solidMat);
    solid.castShadow = this.castShadow;
    solid.receiveShadow = true;
    solid.userData.farmZoneId = dto.id;
    root.add(solid);
    let water: THREE.Mesh | null = null;
    if (scenery.water) {
      water = new THREE.Mesh(scenery.water, this.waterMat);
      water.renderOrder = 2;
      water.receiveShadow = true;
      root.add(water);
    }
    const blades = scenery.animated.map((a) => this.createBlades(a));
    blades.forEach((b) => root.add(b));

    const marker = new THREE.Group();
    const markerMesh = new THREE.Mesh(this.markerGeo, this.markerMat);
    marker.add(markerMesh);
    marker.position.set(layout.centroid.x, scenery.topY, layout.centroid.z);
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
    bar.position.set(layout.centroid.x, scenery.topY + 1.6, layout.centroid.z);
    bar.visible = false;
    root.add(bar);

    const slotY = new Float32Array(layout.slots.length);
    layout.slots.forEach((s, i) => {
      slotY[i] = height(s.x, s.z) + FIELD_LIFT;
    });

    const entry: ZoneEntry = {
      dto,
      layout,
      sceneryKey: sceneryKey(dto),
      root,
      solid,
      water,
      blades,
      slotY,
      marker,
      bar,
      barFill: fill,
      topY: scenery.topY,
      farmers: [],
    };
    this.syncFarmers(entry);
    this.entries.set(dto.id, entry);
    this.group.add(root);
  }

  private remove(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.solid.geometry.dispose();
    e.water?.geometry.dispose();
    this.group.remove(e.root);
    this.entries.delete(id);
  }

  private createBlades(a: AnimatedPart): THREE.Mesh {
    const m = new THREE.Mesh(this.bladesGeo, this.solidMat);
    m.position.set(a.x, a.y, a.z);
    m.rotation.order = 'YXZ';
    m.rotation.y = a.ry;
    m.scale.setScalar(0.85);
    m.castShadow = this.castShadow;
    return m;
  }

  // ── Crops ──────────────────────────────────────────────────────────────────
  private updateCrops(serverNowMs: number): void {
    // Signature: per zone stage + growth step (10 visible steps per stage).
    let sig = '';
    const plan: { e: ZoneEntry; crop: CropTypeCode; stage: StageIndex; grow: number }[] = [];
    for (const e of this.entries.values()) {
      const p = zoneCropProgress(e.dto, serverNowMs);
      if (p === null || !e.dto.crop) continue;
      const crop = getCropDefinition(e.dto.crop.cropCode);
      const stage = cropStageAt(crop, p).index as StageIndex;
      const step = Math.round(cropStageFraction(crop, p) * 10) / 10;
      sig += `${e.dto.id}:${crop.code}:${stage}:${step}|`;
      plan.push({ e, crop: crop.code, stage, grow: stage === 3 ? 1 : 0.7 + 0.3 * step });
    }
    if (sig === this.cropSignature) return;
    this.cropSignature = sig;

    const counts = new Map<string, number>();
    for (const { e, crop, stage } of plan) {
      const key = `${crop}:${stage}`;
      counts.set(key, (counts.get(key) ?? 0) + e.layout.slots.length);
    }
    for (const [key, mesh] of this.pools) {
      if (!counts.has(key)) {
        mesh.count = 0;
        mesh.visible = false;
      }
    }
    const filled = new Map<string, number>();
    for (const { e, crop, stage, grow } of plan) {
      const key = `${crop}:${stage}`;
      const mesh = this.pool(crop, stage, counts.get(key)!);
      let i = filled.get(key) ?? 0;
      e.layout.slots.forEach((s, k) => {
        const sc = s.scale * grow;
        this.tmpQ.setFromAxisAngle(this.up, s.ry);
        this.tmpS.set(sc, sc, sc);
        this.tmpP.set(s.x, e.slotY[k], s.z);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        mesh.setMatrixAt(i, this.tmpM);
        i += 1;
      });
      filled.set(key, i);
    }
    for (const [key, n] of filled) {
      const mesh = this.pools.get(key)!;
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  private pool(crop: CropTypeCode, stage: StageIndex, needed: number): THREE.InstancedMesh {
    const key = `${crop}:${stage}`;
    let mesh = this.pools.get(key);
    if (mesh && mesh.instanceMatrix.count >= needed) return mesh;
    const capacity = Math.max(64, Math.ceil(needed * 1.5));
    if (mesh) {
      this.group.remove(mesh);
      mesh.dispose();
    }
    let geo = this.cropGeos.get(key);
    if (!geo) {
      geo = buildCropGeometry(crop, stage);
      this.cropGeos.set(key, geo);
    }
    mesh = new THREE.InstancedMesh(geo, this.cropMaterial(crop), capacity);
    mesh.name = `Crop:${key}`;
    mesh.count = 0;
    mesh.castShadow = this.castShadow && (crop === 'orange' || crop === 'corn');
    mesh.receiveShadow = false;
    this.pools.set(key, mesh);
    this.group.add(mesh);
    return mesh;
  }

  private cropMaterial(crop: CropTypeCode): THREE.MeshStandardMaterial {
    let m = this.cropMats.get(crop);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const amp = { value: CROP_WIND[crop] };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.uniforms.uWindAmp = amp;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWindAmp;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
             vec2 wp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
             float gust = sin(uTime * 1.3 + wp.x * 0.21 + wp.y * 0.17) * 0.6
                        + sin(uTime * 2.9 + wp.x * 0.7 + wp.y * 0.45) * 0.25;
             float bend = uWindAmp * gust * position.y * position.y;
             transformed.x += bend;
             transformed.z += bend * 0.5;
           #endif`
        );
    };
    m.customProgramCacheKey = () => `crop-wind-${crop}`;
    this.cropMats.set(crop, m);
    return m;
  }

  // ── Farmers ────────────────────────────────────────────────────────────────
  private createFarmerMesh(capacity: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.farmerGeo, this.farmerMat, capacity);
    m.name = 'Farmers';
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = this.castShadow;
    this.group.add(m);
    return m;
  }

  private syncFarmers(e: ZoneEntry): void {
    const want = Math.min(MAX_FARMERS_PER_ZONE, getFarmZoneLevel(e.dto.zoneType, e.dto.level)?.farmers ?? 2);
    const pts = e.layout.waypoints;
    while (e.farmers.length < want && pts.length) {
      const i = e.farmers.length;
      const start = pts[(i * 3) % pts.length];
      e.farmers.push({
        pos: new THREE.Vector3(start.x, 0, start.z),
        target: pts[(i * 3 + 1) % pts.length],
        waiting: 1 + i,
        phase: i * 1.7,
      });
    }
    e.farmers.length = Math.min(e.farmers.length, want);
  }

  private updateFarmers(dt: number, time: number, height: HeightSampler): void {
    let total = 0;
    for (const e of this.entries.values()) total += e.farmers.length;
    if (total > this.farmers.instanceMatrix.count) {
      this.group.remove(this.farmers);
      this.farmers.dispose();
      this.farmers = this.createFarmerMesh(Math.ceil(total * 1.5));
    }
    let i = 0;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    for (const e of this.entries.values()) {
      const pts = e.layout.waypoints;
      for (const f of e.farmers) {
        let yaw = Math.atan2(f.target.x - f.pos.x, f.target.z - f.pos.z);
        let bow = 0;
        let bob = 0;
        if (f.waiting > 0) {
          // Working by hand: bowing rhythmically (planting / hoeing).
          f.waiting -= dt;
          bow = 0.35 + Math.sin(time * 4 + f.phase) * 0.3;
          yaw += Math.sin(f.phase) * 0.6;
          if (f.waiting <= 0) f.target = pts[Math.floor(Math.abs(Math.sin(time * 13.1 + f.phase)) * pts.length) % pts.length];
        } else {
          const dx = f.target.x - f.pos.x;
          const dz = f.target.z - f.pos.z;
          const d = Math.hypot(dx, dz);
          const step = Math.min(d, 1.3 * dt);
          if (d < 0.1) f.waiting = 2.5 + (Math.abs(Math.sin(f.phase + time)) * 3);
          else {
            f.pos.x += (dx / d) * step;
            f.pos.z += (dz / d) * step;
            bob = Math.abs(Math.sin(time * 9 + f.phase)) * 0.1;
          }
        }
        f.pos.y = height(f.pos.x, f.pos.z) + FIELD_LIFT + bob;
        euler.set(bow, yaw, 0);
        this.tmpQ.setFromEuler(euler);
        this.tmpS.set(1, 1, 1);
        this.tmpM.compose(f.pos, this.tmpQ, this.tmpS);
        this.farmers.setMatrixAt(i, this.tmpM);
        i += 1;
      }
    }
    this.farmers.count = i;
    this.farmers.instanceMatrix.needsUpdate = true;
  }
}

function sceneryKey(z: FarmZoneDTO): string {
  const src = z.irrigation.sourceHex ? `${z.irrigation.sourceHex.q},${z.irrigation.sourceHex.r}` : '-';
  return `${z.zoneType}|${z.level}|${src}|${z.hexes.map((h) => hexKey(h.q, h.r)).join(';')}`;
}

/** Bouncing "ready to harvest" marker: golden sheaf on a downward pointer. */
function buildMarkerGeometry(): THREE.BufferGeometry {
  const parts = [
    new THREE.ConeGeometry(0.55, 1.0, 12).rotateX(Math.PI).translate(0, -0.1, 0),
    new THREE.IcosahedronGeometry(0.7, 1).translate(0, 0.85, 0),
  ];
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
  parts.forEach((p) => p.dispose());
  return g;
}

