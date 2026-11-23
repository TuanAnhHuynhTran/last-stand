/**
 * Soldier skeleton → part matrices (local frame: feet at origin, facing +Z, unscaled).
 * Uses the villager RIG so every chibi shares one body; weapons are attached to the HAND
 * SOCKETS (main weapon → right hand, shield / bow → left hand), so they follow every animation.
 */
import * as THREE from 'three';
import { RIG } from '../population/villagerModels';
import type { SoldierPose } from './soldierAnimation';

export interface SoldierMatrices {
  hips: THREE.Matrix4;
  head: THREE.Matrix4;
  armL: THREE.Matrix4;
  armR: THREE.Matrix4;
  handL: THREE.Matrix4;
  handR: THREE.Matrix4;
  legL: THREE.Matrix4;
  legR: THREE.Matrix4;
  /** Main weapon frame = right-hand socket × grip rotation */
  main: THREE.Matrix4;
  /** Off-hand frame = left-hand socket × grip rotation */
  off: THREE.Matrix4;
}

export function createSoldierMatrices(): SoldierMatrices {
  const m = () => new THREE.Matrix4();
  return { hips: m(), head: m(), armL: m(), armR: m(), handL: m(), handR: m(), legL: m(), legR: m(), main: m(), off: m() };
}

const e = new THREE.Euler(0, 0, 0, 'YXZ');
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const one = new THREE.Vector3(1, 1, 1);
const tmp = new THREE.Matrix4();

function local(x: number, y: number, z: number, pitch: number, yaw: number, roll: number): THREE.Matrix4 {
  e.set(pitch, yaw, roll, 'YXZ');
  q.setFromEuler(e);
  return tmp.compose(v.set(x, y, z), q, one);
}

/** Fills `out` with the local matrices of every part for a pose. */
export function soldierMatrices(pose: SoldierPose, out: SoldierMatrices = createSoldierMatrices()): SoldierMatrices {
  out.hips.copy(local(0, RIG.hipY - pose.crouch * 0.3, pose.stepZ, pose.lean, pose.twist, 0));
  out.head.multiplyMatrices(out.hips, local(0, RIG.neckY - RIG.hipY, 0, pose.headPitch, pose.headYaw, 0));
  for (const side of [-1, 1] as const) {
    const arm = side < 0 ? out.armL : out.armR;
    const hand = side < 0 ? out.handL : out.handR;
    const pitch = side < 0 ? pose.armLPitch : pose.armRPitch;
    const roll = (side < 0 ? pose.armLRoll : pose.armRRoll) + side * -0.08;
    arm.multiplyMatrices(out.hips, local(side * RIG.shoulderX, RIG.shoulderY - RIG.hipY, 0, pitch, 0, roll));
    hand.multiplyMatrices(arm, local(0, -RIG.armLength, 0, 0, 0, 0));
    const leg = side < 0 ? out.legL : out.legR;
    leg.multiplyMatrices(out.hips, local(side * RIG.hipX, 0, 0, (side < 0 ? pose.legL : pose.legR) + pose.crouch * 0.4, 0, side * pose.straddle));
  }
  // Grip: the item's long axis (+Z) ends up at the pose's desired body-frame pitch.
  out.main.multiplyMatrices(out.handR, local(0, 0, 0, pose.weapon - pose.armRPitch, 0, 0));
  out.off.multiplyMatrices(out.handL, local(0, 0, 0, pose.off - pose.armLPitch, 0, 0));
  return out;
}

/** World-space position of a frame's origin (e.g. a hand socket). */
export function originOf(m: THREE.Matrix4, target = new THREE.Vector3()): THREE.Vector3 {
  return target.setFromMatrixPosition(m);
}
