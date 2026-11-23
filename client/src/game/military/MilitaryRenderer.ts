/**
 * MilitaryRenderer — the live training scene of every military compound:
 *   soldiers   chibi villager body + class tunic, armour, helmet, rank accessories; weapons on
 *              the hand sockets (soldierRig); per-class drill cycles (soldierAnimation)
 *   props      straw dummies / thrust posts / archery targets that wobble when hit
 *   effects    arrows & bolts in flight (and stuck in the target), straw / dust chips, sounds
 * Everything is instanced (one draw call per part). Soldiers beyond the detail distance use a
 * merged LOD; off-screen soldiers write nothing (but their drill clocks keep running).
 */
import * as THREE from 'three';
import { getUnitType, type EquipmentCode, type MilitaryStateDTO, type MilitaryUnitDTO } from '@cityverse/shared';
import { footprintBaseHeight } from '../buildings/BuildingRenderer';
import type { HeightSampler } from '../farming/farmGround';
import { buildVillagerParts, disposeVillagerParts, type VillagerParts } from '../population/villagerModels';
import { InstancePool } from './instancePool';
import { RIG } from '../population/villagerModels';
import { RIDER_SEAT_OFFSET, drillPose, eventsBetween, heldItems, idlePose, phaseOffset, ridingPose, type DrillEventKind, type SoldierPose } from './soldierAnimation';
import { buildSoldierParts, disposeSoldierParts, type SoldierParts } from './soldierModels';
import { createSoldierMatrices, soldierMatrices } from './soldierRig';
import { TrainingSounds, type SoundKind } from './soundFx';
import { planTrainingScene, type CompoundPlan, type SoldierPlan } from './trainingScene';

export const SOLDIER_SCALE = 1.25;
export const SOLDIER_DRAW_DISTANCE = 300;
export const SOLDIER_DETAIL_DISTANCE = 130;
export const MAX_DETAILED_SOLDIERS = 80;
const SOUND_DISTANCE = 90;
const PANTS = '#3a3744';

interface PropState {
  key: string;
  kind: 'dummy' | 'post' | 'target';
  x: number;
  y: number;
  z: number;
  yaw: number;
  amp: number;
  hitAt: number;
  stuck: { u: number; v: number; until: number; bolt: boolean }[];
  /** Where the next arrow in flight will stick (offset on the face) */
  pending: { u: number; v: number };
}

interface Projectile {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  bolt: boolean;
  prop: PropState | null;
}

interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  color: THREE.Color;
  spin: number;
  floor: number;
}

export interface MilitaryRenderStats {
  soldiers: number;
  detailed: number;
  far: number;
  culled: number;
  props: number;
  projectiles: number;
  particles: number;
}

const ARROW_AXIS = new THREE.Vector3(0, -1, 0);
const BOLT_AXIS = new THREE.Vector3(0, 0, 1);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class MilitaryRenderer {
  readonly group = new THREE.Group();
  readonly sounds = new TrainingSounds();
  readonly stats: MilitaryRenderStats = { soldiers: 0, detailed: 0, far: 0, culled: 0, props: 0, projectiles: 0, particles: 0 };
  /** Clip each soldier played on the last frame (for the HUD / tests) */
  readonly clips = new Map<string, string>();
  private readonly vp: VillagerParts;
  private readonly sp: SoldierParts;
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68 });
  private readonly pool: InstancePool;
  private compounds: CompoundPlan[] = [];
  private soldiers: SoldierPlan[] = [];
  private readonly baseY = new Map<string, number>();
  private readonly props = new Map<string, PropState>();
  private readonly clocks = new Map<string, number>();
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private selected: string | null = null;
  private readonly colors = new Map<string, THREE.Color>();
  private readonly mats = createSoldierMatrices();
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly root = new THREE.Matrix4();
  private readonly m = new THREE.Matrix4();
  private readonly m2 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private ring: THREE.Mesh;
  /** Seat socket of a horse (world matrix) — provided by the livestock renderer */
  private seatOf: ((animalId: string, out: THREE.Matrix4) => boolean) | null = null;
  private readonly seat = new THREE.Matrix4();
  private readonly seatPos = new THREE.Vector3();
  private readonly seatQuat = new THREE.Quaternion();
  private readonly seatScale = new THREE.Vector3();
  private readonly riders = new Map<string, THREE.Vector3>();

  constructor() {
    this.group.name = 'MilitaryRenderer';
    this.vp = buildVillagerParts();
    this.sp = buildSoldierParts();
    this.pool = new InstancePool(this.group, this.material, 'Military');
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.95, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.85, depthWrite: false })
    );
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    this.group.add(this.ring);
  }

  // ── State ──────────────────────────────────────────────────────────────────
  sync(state: MilitaryStateDTO | null, height: HeightSampler): void {
    const plan = planTrainingScene(state);
    this.compounds = plan.compounds;
    this.soldiers = plan.soldiers;
    this.reseat(height);
    // Props of the active stations (kept across syncs so a wobble is not cut short).
    const keep = new Set<string>();
    for (const c of this.compounds) {
      const y = this.baseY.get(c.buildingId) ?? 0;
      c.stations.forEach((st, i) => {
        if (!st.prop) return;
        const key = `${c.buildingId}:${i}`;
        keep.add(key);
        const prev = this.props.get(key);
        if (prev) Object.assign(prev, { kind: st.prop.kind, x: st.prop.x, y, z: st.prop.z, yaw: st.prop.yaw });
        else this.props.set(key, { key, kind: st.prop.kind, x: st.prop.x, y, z: st.prop.z, yaw: st.prop.yaw, amp: 0, hitAt: 0, stuck: [], pending: { u: 0, v: 0 } });
      });
    }
    for (const k of [...this.props.keys()]) if (!keep.has(k)) this.props.delete(k);
    // Dismounted soldiers stop following their horse right away.
    for (const id of [...this.riders.keys()]) if (!this.soldiers.some((s) => s.unit.id === id && s.mode === 'ride')) this.riders.delete(id);
    const alive = new Set(this.soldiers.map((s) => s.unit.id));
    for (const id of [...this.clocks.keys()]) if (!alive.has(id)) this.clocks.delete(id);
    this.projectiles = this.projectiles.filter((p) => !p.prop || this.props.has(p.prop.key));
  }

  reseat(height: HeightSampler): void {
    for (const c of this.compounds) {
      const y = footprintBaseHeight(c.hexes, height);
      this.baseY.set(c.buildingId, y);
      for (const p of this.props.values()) if (p.key.startsWith(`${c.buildingId}:`)) p.y = y;
    }
  }

  setSound(on: boolean): void {
    this.sounds.setEnabled(on);
  }

  /** Riders are attached to the horses drawn by the livestock renderer. */
  setSeatProvider(fn: ((animalId: string, out: THREE.Matrix4) => boolean) | null): void {
    this.seatOf = fn;
  }

  /** Rider root (feet frame) on a seat socket: hips sit RIDER_SEAT_OFFSET above the seat. */
  riderRoot(seat: THREE.Matrix4, scale: number, out: THREE.Matrix4): THREE.Matrix4 {
    seat.decompose(this.seatPos, this.seatQuat, this.seatScale);
    out.compose(this.seatPos, this.seatQuat, this.s.set(scale, scale, scale));
    return out.multiply(this.m2.makeTranslation(0, -RIG.hipY + RIDER_SEAT_OFFSET, 0));
  }

  setSelected(unitId: string | null): void {
    this.selected = unitId;
  }

  setShadows(on: boolean): void {
    this.pool.setShadows(on);
  }

  /** True while the soldier is drawn on a horse (camera follow). */
  isRiding(unitId: string): boolean {
    return this.riders.has(unitId);
  }

  /** World position of a soldier (for camera focus). */
  positionOf(unitId: string): { x: number; y: number; z: number } | null {
    const rider = this.riders.get(unitId);
    if (rider) return { x: rider.x, y: rider.y, z: rider.z };
    const s = this.soldiers.find((x) => x.unit.id === unitId);
    if (!s || s.mode === 'ride') return null;
    return { x: s.x, y: this.baseY.get(s.buildingId) ?? 0, z: s.z };
  }

  get soldierCount(): number {
    return this.soldiers.length;
  }

  /** Instances of a part written on the last frame (e.g. 'saber', 'cape', 'dummy'). */
  partCount(key: string): number {
    return this.pool.count(key);
  }

  /** Current wobble amplitude of every prop (hit reactions). */
  propAmplitudes(): number[] {
    return [...this.props.values()].map((p) => p.amp);
  }

  // ── Frame ──────────────────────────────────────────────────────────────────
  update(dt: number, time: number, camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const cam = camera.getWorldPosition(this.v2.clone());
    const st = this.stats;
    st.soldiers = this.soldiers.length;
    st.detailed = 0;
    st.far = 0;
    st.culled = 0;
    this.pool.begin();

    // Soldiers (nearest first get the detailed rig).
    const visible: { s: SoldierPlan; d: number; y: number }[] = [];
    for (const s of this.soldiers) {
      if (s.mode === 'ride') continue; // drawn on their horses below
      const y = this.baseY.get(s.buildingId) ?? 0;
      this.v.set(s.x, y + 1.2, s.z);
      const d = this.v.distanceTo(cam);
      const t = time + phaseOffset(s.unit.id, s.unit.type);
      const last = this.clocks.get(s.unit.id);
      this.clocks.set(s.unit.id, t);
      if (d > SOLDIER_DRAW_DISTANCE || !this.frustum.containsPoint(this.v)) {
        st.culled += 1;
        continue;
      }
      visible.push({ s, d, y });
      // Drill events only for soldiers you can see (hits, arrows, sounds).
      if (s.mode === 'drill' && last !== undefined && d < SOLDIER_DETAIL_DISTANCE) {
        for (const ev of eventsBetween(s.unit.type, last, t)) this.onEvent(s, ev.kind, y, d);
      }
    }
    visible.sort((a, b) => a.d - b.d);
    let ringAt: THREE.Vector3 | null = null;
    for (const [i, { s, d, y }] of visible.entries()) {
      const t = time + phaseOffset(s.unit.id, s.unit.type);
      if (i < MAX_DETAILED_SOLDIERS && d < SOLDIER_DETAIL_DISTANCE) {
        const { pose, clip } = s.mode === 'drill' ? drillPose(s.unit.type, t) : { pose: idlePose(s.unit.type, t), clip: 'attention' };
        this.clips.set(s.unit.id, clip);
        this.writeSoldier(s, pose, y);
        st.detailed += 1;
      } else {
        this.compose(this.root, s.x, y, s.z, 0, s.yaw, 0, SOLDIER_SCALE * s.unit.appearance.height);
        this.pool.put('lod', this.sp.lod, this.root, this.color(getUnitType(s.unit.type).look.tunic));
        st.far += 1;
      }
      if (s.unit.id === this.selected) ringAt = new THREE.Vector3(s.x, y + 0.06, s.z);
    }
    // Mounted soldiers: riding pose on the horse's seat socket (follows the horse's gait / turns).
    for (const s of this.soldiers) {
      if (s.mode !== 'ride' || !s.mountId) continue;
      if (!this.seatOf?.(s.mountId, this.seat)) {
        this.riders.delete(s.unit.id);
        st.culled += 1;
        continue;
      }
      const sc = SOLDIER_SCALE * s.unit.appearance.height;
      this.riderRoot(this.seat, sc, this.root);
      const p = new THREE.Vector3().setFromMatrixPosition(this.seat);
      this.riders.set(s.unit.id, p);
      if (p.distanceTo(cam) > SOLDIER_DRAW_DISTANCE) continue;
      const t = time + phaseOffset(s.unit.id, s.unit.type);
      this.clips.set(s.unit.id, 'ride');
      this.writeSoldier(s, ridingPose(s.unit.type, t), 0, this.root);
      st.detailed += 1;
      if (s.unit.id === this.selected) ringAt = new THREE.Vector3(p.x, p.y - 1.9, p.z);
    }
    this.ring.visible = Boolean(ringAt);
    if (ringAt) {
      this.ring.position.copy(ringAt);
      this.ring.scale.setScalar(1 + Math.sin(time * 4) * 0.06);
    }

    this.writeProps(time, cam);
    this.updateProjectiles(dt, time, cam);
    this.updateParticles(dt);
    this.pool.commit();
  }

  dispose(): void {
    this.pool.dispose();
    disposeVillagerParts(this.vp);
    disposeSoldierParts(this.sp);
    this.material.dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.sounds.dispose();
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  private onEvent(s: SoldierPlan, kind: DrillEventKind, y: number, dist: number): void {
    const vol = Math.max(0, 1 - dist / SOUND_DISTANCE);
    const prop = s.station !== null ? this.props.get(`${s.buildingId}:${s.station}`) ?? null : null;
    const sound = (k: SoundKind, v = vol) => this.sounds.play(k, v);
    switch (kind) {
      case 'swing':
        sound('swing', vol * 0.7);
        break;
      case 'clack':
        sound('clack', vol * 0.8);
        break;
      case 'stomp':
        this.burst(new THREE.Vector3(s.x, y + 0.1, s.z), '#c9b79a', 5, 1.2, y);
        sound('stomp', vol * 0.6);
        break;
      case 'hit':
        if (!prop) break;
        prop.amp = s.unit.type === 'spearman' ? 0.22 : 0.34;
        prop.hitAt = performance.now() / 1000;
        this.burst(new THREE.Vector3(prop.x, y + 1.25, prop.z), prop.kind === 'post' ? '#b07a48' : '#e8c46a', 7, 2.2, y);
        sound('thud', vol);
        break;
      case 'shoot': {
        const ammo: EquipmentCode | undefined = s.unit.equipment.ammo;
        const bolt = s.unit.type === 'crossbowman';
        if (!ammo || (bolt ? ammo !== 'eq_bolts' : ammo !== 'eq_arrows')) break;
        sound(bolt ? 'clack' : 'twang', vol);
        if (!prop) break;
        const sc = SOLDIER_SCALE * s.unit.appearance.height;
        const from = new THREE.Vector3(s.x + Math.sin(s.yaw) * 0.6 * sc, y + 1.3 * sc, s.z + Math.cos(s.yaw) * 0.6 * sc);
        const aim = prop.kind === 'target' ? 1.35 : 1.3;
        // A few shots go a little wide (training!).
        const spread = bolt ? 0.18 : 0.32;
        const u = (Math.random() - 0.5) * spread * 2;
        const w = (Math.random() - 0.5) * spread * 2;
        const to = new THREE.Vector3(prop.x + Math.cos(prop.yaw) * u, prop.y + aim + w, prop.z - Math.sin(prop.yaw) * u);
        const dist3 = from.distanceTo(to);
        this.projectiles.push({ from, to, t: 0, dur: dist3 / (bolt ? 42 : 30), arc: dist3 * (bolt ? 0.015 : 0.04), bolt, prop });
        prop.pending = { u, v: w };
        break;
      }
    }
  }

  private burst(at: THREE.Vector3, color: string, n: number, speed: number, floor = at.y - 1.3): void {
    if (this.particles.length > 400) return;
    const c = this.color(color);
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.6 + Math.random() * 1.2;
      this.particles.push({
        p: at.clone(),
        v: new THREE.Vector3(Math.cos(a) * speed * (0.4 + Math.random()), up * speed, Math.sin(a) * speed * (0.4 + Math.random())),
        life: 0,
        max: 0.6 + Math.random() * 0.5,
        color: c,
        spin: Math.random() * 10,
        floor,
      });
    }
  }

  // ── Writing ────────────────────────────────────────────────────────────────
  private color(hex: string): THREE.Color {
    let c = this.colors.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      this.colors.set(hex, c);
    }
    return c;
  }

  private compose(out: THREE.Matrix4, x: number, y: number, z: number, pitch: number, yaw: number, roll: number, scale = 1): THREE.Matrix4 {
    this.e.set(pitch, yaw, roll, 'YXZ');
    this.q.setFromEuler(this.e);
    return out.compose(this.v.set(x, y, z), this.q, this.s.set(scale, scale, scale));
  }

  private part(key: string, geo: THREE.BufferGeometry, local: THREE.Matrix4, color?: THREE.Color): void {
    this.m.multiplyMatrices(this.root, local);
    this.pool.put(key, geo, this.m, color);
  }

  private writeSoldier(s: SoldierPlan, pose: SoldierPose, y: number, root?: THREE.Matrix4): void {
    const u: MilitaryUnitDTO = s.unit;
    const V = this.vp;
    const S = this.sp;
    const look = getUnitType(u.type).look;
    const tunic = this.color(look.tunic);
    const trim = this.color(look.trim);
    const skin = this.color(u.appearance.skin);
    const pants = this.color(PANTS);
    const eq = u.equipment;
    const M = soldierMatrices(pose, this.mats);
    if (root) this.root.copy(root);
    else this.compose(this.root, s.x, y, s.z, 0, s.yaw, 0, SOLDIER_SCALE * u.appearance.height);

    // Body
    this.part('hips', V.hips, M.hips, pants);
    this.part('torso', V.torso, M.hips, tunic);
    this.part('belt', S.belt, M.hips, trim);
    if (eq.armor === 'eq_iron_armor') this.part('armor:iron', S.armor.iron, M.hips);
    else if (eq.armor === 'eq_leather_armor') this.part('armor:leather', S.armor.leather, M.hips);
    this.part('head', V.head, M.head, skin);
    this.part('face', V.face, M.head);
    this.part(`mouth:${s.mode === 'drill' ? 'content' : 'happy'}`, V.mouths[s.mode === 'drill' ? 'content' : 'happy'], M.head);
    if (eq.helmet === 'eq_iron_helmet') this.part('helmet:iron', S.helmet.iron, M.head);
    else if (eq.helmet === 'eq_helmet') this.part('helmet:leather', S.helmet.leather, M.head);
    else this.part(`hair:${u.appearance.hairStyle}`, V.hair[u.appearance.hairStyle], M.head, this.color(u.appearance.hair));
    // Rank accessories accumulate on the SAME model (no model swap).
    if (u.rank >= 2) this.part('scarf', S.scarf, M.hips, trim);
    if (u.rank >= 3) this.part('plume', S.plume, M.head);
    if (u.rank >= 5) this.part('cape', S.cape, M.hips);
    for (const arm of [M.armL, M.armR]) {
      this.part('arm', V.arm, arm, tunic);
      if (u.rank >= 4) this.part('pauldron', S.pauldron, arm);
    }
    this.part('hand', V.hand, M.handL, skin);
    this.part('hand', V.hand, M.handR, skin);
    this.part('leg', V.leg, M.legL, pants);
    this.part('leg', V.leg, M.legR, pants);

    // Weapons on the hand sockets (only what is really equipped).
    const held = heldItems(u.type);
    if (held.main === 'saber') {
      this.part('scabbard', S.scabbard, M.hips);
      if (eq.weapon === 'eq_saber') this.part('saber', S.saber, M.main);
    } else if (held.main === 'spear' && eq.weapon === 'eq_spear') {
      this.part('spear', S.spear, M.main);
    } else if (held.main === 'crossbow' && eq.weapon === 'eq_crossbow') {
      this.part('crossbow', S.crossbow, M.main);
      if (pose.loaded > 0.5 && eq.ammo === 'eq_bolts') this.part('bolt', S.bolt, M.main);
    }
    if (held.off === 'shield' && eq.offhand === 'eq_shield') this.part('shield', S.shield, M.off, tunic);
    if (held.off === 'bow' && eq.weapon === 'eq_bow') {
      this.part('bow', S.bow, M.off);
      // String: two segments from the limb tips to the nock point (pulled back by `draw`).
      const nockY = pose.draw * 0.42;
      for (const tip of [0.6, -0.6]) {
        const len = Math.hypot(nockY, tip);
        this.q.setFromUnitVectors(Z_AXIS, this.v.set(0, -nockY, tip).normalize());
        this.m2.compose(this.v2.set(0, nockY, 0), this.q, this.s.set(1, 1, len));
        this.m.multiplyMatrices(M.off, this.m2);
        this.part('string', S.string, this.m);
      }
      if (pose.loaded > 0.5 && eq.ammo === 'eq_arrows') {
        this.m2.makeTranslation(0, nockY, 0);
        this.m.multiplyMatrices(M.off, this.m2);
        this.part('arrow', S.arrow, this.m);
      }
    }
    if (held.quiver === 'arrows' && eq.ammo === 'eq_arrows') this.part('quiver', S.quiver, M.hips);
    if (held.quiver === 'bolts' && eq.ammo === 'eq_bolts') this.part('boltCase', S.boltCase, M.hips);
  }

  private writeProps(_time: number, cam: THREE.Vector3): void {
    const now = performance.now() / 1000;
    let n = 0;
    for (const p of this.props.values()) {
      this.v.set(p.x, p.y + 1, p.z);
      if (this.v.distanceTo(cam) > SOLDIER_DRAW_DISTANCE || !this.frustum.containsPoint(this.v)) continue;
      const age = now - p.hitAt;
      const sway = p.amp * Math.exp(-age * 4.5) * Math.sin(age * 15);
      if (age > 2) p.amp = 0;
      // Pushed away from the soldier (who stands on the +Z side of the prop).
      const tilt = p.kind === 'target' ? sway * 0.25 : -sway;
      this.compose(this.m2, p.x, p.y, p.z, tilt, p.yaw, p.kind === 'dummy' ? sway * 0.4 : 0);
      this.pool.put(p.kind, this.sp[p.kind], this.m2);
      n += 1;
      // Stuck arrows / bolts (fade after a while).
      p.stuck = p.stuck.filter((a) => a.until > now);
      for (const a of p.stuck) {
        this.compose(this.m, a.u, (p.kind === 'target' ? 1.35 : 1.3) + a.v, p.kind === 'target' ? 0.72 : 0.9, Math.PI / 2, 0, 0);
        this.m.multiplyMatrices(this.m2, this.m);
        this.pool.put('stuck', this.sp.arrow, this.m);
      }
    }
    this.stats.props = n;
  }

  private updateProjectiles(dt: number, _time: number, cam: THREE.Vector3): void {
    const keep: Projectile[] = [];
    for (const pr of this.projectiles) {
      pr.t += dt;
      const k = Math.min(1, pr.t / pr.dur);
      const pos = this.v.copy(pr.from).lerp(pr.to, k);
      pos.y += pr.arc * 4 * k * (1 - k);
      // Direction = derivative of the arc.
      const dir = this.v2.copy(pr.to).sub(pr.from);
      dir.y += pr.arc * 4 * (1 - 2 * k);
      dir.normalize();
      this.q.setFromUnitVectors(pr.bolt ? BOLT_AXIS : ARROW_AXIS, dir);
      this.m.compose(pos, this.q, this.s.set(SOLDIER_SCALE, SOLDIER_SCALE, SOLDIER_SCALE));
      this.pool.put(pr.bolt ? 'flyingBolt' : 'flyingArrow', pr.bolt ? this.sp.bolt : this.sp.arrow, this.m);
      if (k < 1) {
        keep.push(pr);
        continue;
      }
      // Impact: the target shakes a little, the arrow stays stuck for a few seconds.
      const p = pr.prop;
      if (p && this.props.has(p.key)) {
        p.amp = Math.max(p.amp, pr.bolt ? 0.2 : 0.12);
        p.hitAt = performance.now() / 1000;
        p.stuck.push({ u: p.pending.u, v: p.pending.v, until: p.hitAt + 6, bolt: pr.bolt });
        if (p.stuck.length > 5) p.stuck.shift();
        this.burst(pr.to.clone(), p.kind === 'target' ? '#f4efe2' : '#e8c46a', 4, 1.4, p.y);
        this.sounds.play('thunk', Math.max(0, 1 - pr.to.distanceTo(cam) / SOUND_DISTANCE) * 0.8);
      }
    }
    this.projectiles = keep;
    this.stats.projectiles = keep.length;
  }

  private updateParticles(dt: number): void {
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.v.y -= 9.8 * dt;
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < p.floor) {
        p.p.y = p.floor;
        p.v.multiplyScalar(0.3);
      }
      const sc = 1 - p.life / p.max;
      this.compose(this.m, p.p.x, p.p.y, p.p.z, p.spin * p.life, p.spin * 0.7 * p.life, 0, sc * 1.4);
      this.pool.put('chip', this.sp.chip, this.m, p.color);
      keep.push(p);
    }
    this.particles = keep;
    this.stats.particles = keep.length;
  }
}

