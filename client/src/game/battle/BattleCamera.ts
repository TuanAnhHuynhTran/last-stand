/**
 * Tactical camera: isometric orbit around a target point.
 *  - zoom (wheel), rotate (Q / E, right-drag), pan (WASD / arrows, middle-drag)
 *  - focus(selected unit) / focus(target when attacking): smooth glide, never a cut
 *  - cinematic(): a short close-up for special skills, then back to the previous framing
 */
import * as THREE from 'three';

export interface CameraFrame {
  x: number;
  z: number;
  yaw: number;
  distance: number;
  pitch: number;
}

export const BATTLE_CAMERA_LIMITS = { minDistance: 22, maxDistance: 95, minPitch: 0.55, maxPitch: 1.25 } as const;

export class BattleCamera {
  readonly desired: CameraFrame = { x: 0, z: 18, yaw: 0, distance: 62, pitch: 0.92 };
  readonly current: CameraFrame = { ...this.desired };
  private cinematicUntil = 0;
  private saved: CameraFrame | null = null;
  private clock = 0;

  focus(x: number, z: number, distance?: number): void {
    this.desired.x = x;
    this.desired.z = z;
    if (distance !== undefined) this.desired.distance = THREE.MathUtils.clamp(distance, BATTLE_CAMERA_LIMITS.minDistance, BATTLE_CAMERA_LIMITS.maxDistance);
  }

  zoom(delta: number): void {
    this.desired.distance = THREE.MathUtils.clamp(this.desired.distance * (1 + delta), BATTLE_CAMERA_LIMITS.minDistance, BATTLE_CAMERA_LIMITS.maxDistance);
  }

  rotate(delta: number): void {
    this.desired.yaw += delta;
  }

  tilt(delta: number): void {
    this.desired.pitch = THREE.MathUtils.clamp(this.desired.pitch + delta, BATTLE_CAMERA_LIMITS.minPitch, BATTLE_CAMERA_LIMITS.maxPitch);
  }

  /** Pan in screen space (right / forward relative to the current yaw). */
  pan(right: number, forward: number): void {
    const s = this.desired.distance / 60;
    const cy = Math.cos(this.desired.yaw);
    const sy = Math.sin(this.desired.yaw);
    this.desired.x += (right * cy - forward * sy) * s;
    this.desired.z += (-right * sy - forward * cy) * s;
  }

  /** Close-up on a point for `seconds`, then glide back. */
  cinematic(x: number, z: number, seconds = 1.4): void {
    if (!this.saved) this.saved = { ...this.desired };
    this.cinematicUntil = this.clock + seconds;
    this.desired.x = x;
    this.desired.z = z;
    this.desired.distance = BATTLE_CAMERA_LIMITS.minDistance + 4;
    this.desired.pitch = 0.75;
  }

  get inCinematic(): boolean {
    return this.saved !== null;
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    this.clock += dt;
    if (this.saved && this.clock >= this.cinematicUntil) {
      Object.assign(this.desired, this.saved);
      this.saved = null;
    }
    const k = 1 - Math.exp(-dt * 6);
    const c = this.current;
    const d = this.desired;
    c.x += (d.x - c.x) * k;
    c.z += (d.z - c.z) * k;
    c.distance += (d.distance - c.distance) * k;
    c.pitch += (d.pitch - c.pitch) * k;
    let dy = d.yaw - c.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    c.yaw += dy * k;
    const horiz = Math.cos(c.pitch) * c.distance;
    camera.position.set(c.x + Math.sin(c.yaw) * horiz, Math.sin(c.pitch) * c.distance, c.z + Math.cos(c.yaw) * horiz);
    camera.lookAt(c.x, 1.5, c.z);
  }
}
