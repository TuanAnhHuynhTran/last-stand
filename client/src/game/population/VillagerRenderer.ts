/**
 * VillagerRenderer — chibi villagers as instanced parts (≈30 draw calls in total, whatever the
 * population). Per-villager skin / hair / shirt / pants / hat colours come from instance colours.
 *
 *  budget   : at most MAX_DETAILED_VILLAGERS (nearest first) get the full rig; the rest use the
 *             merged far LOD; villagers off-screen or beyond VILLAGER_DRAW_DISTANCE write nothing
 *  sim      : the brain runs for everyone — constant work per villager plus a few budgeted hex A*
 *             searches per frame (~100 hexes each), so a large village stays cheap
 */
import * as THREE from 'three';
import { getProfession, type HatStyle, type Mood, type SurvivorDTO, type ToolStyle } from '@cityverse/shared';
import type { HeightSampler } from '../farming/farmGround';
import { VillagerBrain, type VillageContext, type VillagerPose } from './VillagerBrain';
import { RIG, buildVillagerParts, disposeVillagerParts, type VillagerParts } from './villagerModels';

export const MAX_DETAILED_VILLAGERS = 100;
export const VILLAGER_DRAW_DISTANCE = 320;
export const VILLAGER_DETAIL_DISTANCE = 140;
/** Display scale of the chibi rig (readable from the strategy camera). */
export const VILLAGER_SCALE = 1.25;

type PartKey = string;

export interface VillagerRenderStats {
  villagers: number;
  detailed: number;
  far: number;
  culled: number;
  inside: number;
}

const WHITE = new THREE.Color('#ffffff');

export class VillagerRenderer {
  readonly group = new THREE.Group();
  readonly brain: VillagerBrain;
  private readonly parts: VillagerParts;
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  private readonly meshes = new Map<PartKey, THREE.InstancedMesh>();
  private readonly colors = new Map<string, THREE.Color>();
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly root = new THREE.Matrix4();
  private readonly hips = new THREE.Matrix4();
  private readonly head = new THREE.Matrix4();
  private readonly arm = new THREE.Matrix4();
  private readonly tmp = new THREE.Matrix4();
  private readonly tmp2 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly p = new THREE.Vector3();
  readonly stats: VillagerRenderStats = { villagers: 0, detailed: 0, far: 0, culled: 0, inside: 0 };

  constructor(ctx: VillageContext) {
    this.group.name = 'VillagerRenderer';
    this.brain = new VillagerBrain(ctx);
    this.parts = buildVillagerParts();
  }

  setContext(ctx: VillageContext): void {
    this.brain.setContext(ctx);
  }

  sync(list: readonly SurvivorDTO[], hour: number): void {
    // Soldiers are drawn by the military training scene, not as villagers.
    this.brain.sync(list.filter((s) => !s.soldier), hour);
  }

  setShadows(on: boolean): void {
    for (const m of this.meshes.values()) m.castShadow = on;
  }

  update(dt: number, hour: number, camera: THREE.Camera, height: HeightSampler): void {
    // Behaviour for everyone (budgeted path finding inside).
    this.brain.update(dt, hour);
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const cam = camera.getWorldPosition(new THREE.Vector3());

    const counts = new Map<PartKey, number>();
    const visible: { dto: SurvivorDTO; pose: VillagerPose; mood: Mood; d: number }[] = [];
    const st = this.stats;
    st.villagers = this.brain.size;
    st.detailed = 0;
    st.far = 0;
    st.culled = 0;
    st.inside = this.brain.states().INSIDE;
    this.brain.forEachPose((dto, pose, mood) => {
      this.p.set(pose.x, height(pose.x, pose.z) + 1, pose.z);
      const d = this.p.distanceTo(cam);
      if (d > VILLAGER_DRAW_DISTANCE || !this.frustum.containsPoint(this.p)) {
        st.culled += 1;
        return;
      }
      visible.push({ dto, pose: { ...pose }, mood, d });
    });
    visible.sort((a, b) => a.d - b.d);
    for (const [i, v] of visible.entries()) {
      const y = height(v.pose.x, v.pose.z);
      if (i < MAX_DETAILED_VILLAGERS && v.d < VILLAGER_DETAIL_DISTANCE) {
        this.writeDetailed(v.dto, v.pose, v.mood, y, counts);
        st.detailed += 1;
      } else {
        this.writeFar(v.dto, v.pose, y, counts);
        st.far += 1;
      }
    }
    for (const [key, mesh] of this.meshes) {
      mesh.count = counts.get(key) ?? 0;
      mesh.visible = mesh.count > 0;
      if (mesh.count) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    }
  }

  dispose(): void {
    for (const m of this.meshes.values()) m.dispose();
    this.meshes.clear();
    disposeVillagerParts(this.parts);
    this.material.dispose();
  }

  // ── Writing instances ──────────────────────────────────────────────────────
  private color(hex: string): THREE.Color {
    let c = this.colors.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      this.colors.set(hex, c);
    }
    return c;
  }

  private put(key: PartKey, geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color, counts: Map<PartKey, number>): void {
    const i = counts.get(key) ?? 0;
    counts.set(key, i + 1);
    let mesh = this.meshes.get(key);
    if (!mesh || i >= mesh.instanceMatrix.count) {
      const bigger = new THREE.InstancedMesh(geo, this.material, Math.max(16, Math.ceil((i + 1) * 1.6)));
      bigger.name = `Villager:${key}`;
      bigger.castShadow = true;
      if (mesh) {
        (bigger.instanceMatrix.array as Float32Array).set(mesh.instanceMatrix.array as Float32Array);
        if (mesh.instanceColor) {
          for (let k = 0; k < bigger.instanceMatrix.count; k += 1) bigger.setColorAt(k, WHITE);
          (bigger.instanceColor!.array as Float32Array).set(mesh.instanceColor.array as Float32Array);
        }
        this.group.remove(mesh);
        mesh.dispose();
      }
      this.group.add(bigger);
      this.meshes.set(key, bigger);
      mesh = bigger;
    }
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color);
  }

  private compose(out: THREE.Matrix4, x: number, y: number, z: number, pitch: number, yaw: number, roll: number, scale = 1): THREE.Matrix4 {
    this.e.set(pitch, yaw, roll, 'YXZ');
    this.q.setFromEuler(this.e);
    return out.compose(this.v.set(x, y, z), this.q, this.s.set(scale, scale, scale));
  }

  private writeRoot(dto: SurvivorDTO, pose: VillagerPose, y: number): void {
    const sc = VILLAGER_SCALE * dto.appearance.height;
    // Lying down: rotate the whole body onto its back around the hips.
    const lieY = pose.lie * (RIG.hipY * 0.55);
    this.compose(this.root, pose.x, y + pose.lift * sc - lieY * sc, pose.z, pose.pitch - pose.lie * (Math.PI / 2 - 0.1), pose.yaw, pose.roll, sc);
  }

  private writeDetailed(dto: SurvivorDTO, pose: VillagerPose, mood: Mood, y: number, counts: Map<PartKey, number>): void {
    const P = this.parts;
    const prof = dto.profession ? getProfession(dto.profession) : null;
    const outfit = prof?.outfit ?? { shirt: '#c9b79a', pants: '#5b4636', hat: 'none' as HatStyle, hatColor: '#ffffff', tool: 'none' as ToolStyle, apron: null };
    const skin = this.color(dto.appearance.skin);
    const shirt = this.color(outfit.shirt);
    const pants = this.color(outfit.pants);
    this.writeRoot(dto, pose, y);

    // Hips (lower when sitting / crouching)
    this.compose(this.tmp, 0, RIG.hipY - pose.sit * 0.28, 0, 0, 0, 0);
    this.hips.multiplyMatrices(this.root, this.tmp);
    this.put('hips', P.hips, this.hips, pants, counts);
    this.put('torso', P.torso, this.hips, shirt, counts);
    if (outfit.apron) this.put('apron', P.apron, this.hips, this.color(outfit.apron), counts);

    // Head + face + hair + hat
    this.compose(this.tmp, 0, RIG.neckY - RIG.hipY, 0, pose.headPitch, pose.headYaw, 0);
    this.head.multiplyMatrices(this.hips, this.tmp);
    this.put('head', P.head, this.head, skin, counts);
    this.put('face', P.face, this.head, WHITE, counts);
    this.put(`mouth:${mood}`, P.mouths[mood], this.head, WHITE, counts);
    if (outfit.hat !== 'none') this.put(`hat:${outfit.hat}`, P.hats[outfit.hat], this.head, this.color(outfit.hatColor), counts);
    if (outfit.hat === 'none' || outfit.hat === 'headband' || outfit.hat === 'beret' || outfit.hat === 'bandana') {
      this.put(`hair:${dto.appearance.hairStyle}`, P.hair[dto.appearance.hairStyle], this.head, this.color(dto.appearance.hair), counts);
    }

    // Arms + hands (+ tool in the right hand)
    for (const side of [-1, 1] as const) {
      const pitch = side < 0 ? pose.armLPitch : pose.armRPitch;
      const roll = (side < 0 ? pose.armLRoll : pose.armRRoll) + side * -0.08;
      this.compose(this.tmp, side * RIG.shoulderX, RIG.shoulderY - RIG.hipY, 0, pitch, 0, roll);
      this.arm.multiplyMatrices(this.hips, this.tmp);
      this.put('arm', P.arm, this.arm, shirt, counts);
      this.compose(this.tmp, 0, -RIG.armLength, 0, 0, 0, 0);
      this.tmp2.multiplyMatrices(this.arm, this.tmp);
      this.put('hand', P.hand, this.tmp2, skin, counts);
      if (side > 0 && pose.tool > 0.5 && outfit.tool !== 'none' && outfit.tool !== 'cart') {
        this.put(`tool:${outfit.tool}`, P.tools[outfit.tool], this.tmp2, WHITE, counts);
      }
    }

    // Legs (forward when sitting)
    for (const side of [-1, 1] as const) {
      const swing = (side < 0 ? pose.legL : pose.legR) - pose.sit * 1.4;
      this.compose(this.tmp, side * RIG.hipX, 0, 0, swing, 0, 0);
      this.tmp2.multiplyMatrices(this.hips, this.tmp);
      this.put('leg', P.leg, this.tmp2, pants, counts);
    }

    // Props: crate held at the chest, push cart in front.
    if (pose.carry > 0.5) {
      this.compose(this.tmp, 0, 0.45, 0.4, 0, 0, 0);
      this.tmp2.multiplyMatrices(this.hips, this.tmp);
      this.put('crate', P.crate, this.tmp2, WHITE, counts);
    }
    if (pose.cart > 0.5) {
      this.compose(this.tmp, 0, 0, 1.05, -pose.pitch, 0, 0);
      this.tmp2.multiplyMatrices(this.root, this.tmp);
      this.put('cart', P.cart, this.tmp2, WHITE, counts);
    }
  }

  private writeFar(dto: SurvivorDTO, pose: VillagerPose, y: number, counts: Map<PartKey, number>): void {
    const prof = dto.profession ? getProfession(dto.profession) : null;
    this.writeRoot(dto, pose, y);
    this.put('lod', this.parts.lod, this.root, this.color(prof?.outfit.shirt ?? '#c9b79a'), counts);
  }
}
