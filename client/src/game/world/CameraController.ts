/**
 * CameraController — isometric / ¾ orbit camera for managing territory.
 *
 * State is (target x/z, distance, azimuth, pitch). Input writes the *desired* state; update()
 * eases the current state toward it with frame-rate independent exponential damping, keeps
 * the target inside the world, and keeps the camera above the terrain.
 */
import * as THREE from 'three';
import type { WorldBounds } from '@cityverse/shared';

export type HeightAt = (x: number, z: number) => number;
export type CameraPresetName = 'near' | 'default' | 'far';

export interface CameraLimits {
  bounds: WorldBounds;
  /** Keep the focus this far inside the world edge */
  margin: number;
  minDistance: number;
  maxDistance: number;
  minPitch: number;
  maxPitch: number;
  /** Minimum camera clearance above the terrain */
  groundClearance: number;
}

export const CAMERA_PRESETS: Record<CameraPresetName, { distance: number; pitch: number }> = {
  near: { distance: 55, pitch: THREE.MathUtils.degToRad(30) },
  default: { distance: 150, pitch: THREE.MathUtils.degToRad(45) },
  far: { distance: 380, pitch: THREE.MathUtils.degToRad(58) },
};

export const DEFAULT_AZIMUTH = THREE.MathUtils.degToRad(45);

interface CamState {
  x: number;
  z: number;
  distance: number;
  azimuth: number;
  pitch: number;
}

export class CameraController {
  readonly current: CamState;
  readonly desired: CamState;
  readonly position = new THREE.Vector3();
  readonly lookAt = new THREE.Vector3();
  private focusY = 0;
  private initialised = false;

  constructor(
    readonly limits: CameraLimits,
    start: { x: number; z: number; preset?: CameraPresetName }
  ) {
    const p = CAMERA_PRESETS[start.preset ?? 'default'];
    this.desired = { x: start.x, z: start.z, distance: p.distance, azimuth: DEFAULT_AZIMUTH, pitch: p.pitch };
    this.current = { ...this.desired };
  }

  /** Ground-plane basis for the current azimuth. */
  basis(): { right: THREE.Vector2; forward: THREE.Vector2 } {
    const a = this.desired.azimuth;
    // forward = direction from camera to target, projected on the ground.
    return {
      right: new THREE.Vector2(Math.cos(a), -Math.sin(a)),
      forward: new THREE.Vector2(-Math.sin(a), -Math.cos(a)),
    };
  }

  /** Move the focus in camera-relative ground axes (world units). */
  pan(right: number, forward: number): void {
    const { right: r, forward: f } = this.basis();
    this.desired.x += r.x * right + f.x * forward;
    this.desired.z += r.y * right + f.y * forward;
    this.clampDesired();
  }

  /** Drag-to-pan in screen pixels ("grab the ground"). */
  panByPixels(dx: number, dy: number, viewportHeight: number, fovRad: number): void {
    const worldPerPx = (2 * this.current.distance * Math.tan(fovRad / 2)) / Math.max(1, viewportHeight);
    const forwardScale = 1 / Math.max(0.35, Math.sin(this.current.pitch));
    this.pan(-dx * worldPerPx, dy * worldPerPx * forwardScale);
  }

  rotate(dAzimuth: number, dPitch: number): void {
    this.desired.azimuth += dAzimuth;
    this.desired.pitch = THREE.MathUtils.clamp(this.desired.pitch + dPitch, this.limits.minPitch, this.limits.maxPitch);
  }

  /**
   * Multiplies the distance by `factor`. With an anchor (ground point under the cursor) the
   * focus slides toward it so zooming feels like zooming into what you point at.
   */
  zoom(factor: number, anchor?: { x: number; z: number }): void {
    const before = this.desired.distance;
    const after = THREE.MathUtils.clamp(before * factor, this.limits.minDistance, this.limits.maxDistance);
    this.desired.distance = after;
    if (anchor && after !== before) {
      const t = 1 - after / before;
      this.desired.x += (anchor.x - this.desired.x) * t;
      this.desired.z += (anchor.z - this.desired.z) * t;
      this.clampDesired();
    }
  }

  focus(x: number, z: number, distance?: number, pitch?: number): void {
    this.desired.x = x;
    this.desired.z = z;
    if (distance !== undefined) {
      this.desired.distance = THREE.MathUtils.clamp(distance, this.limits.minDistance, this.limits.maxDistance);
    }
    if (pitch !== undefined) {
      this.desired.pitch = THREE.MathUtils.clamp(pitch, this.limits.minPitch, this.limits.maxPitch);
    }
    this.clampDesired();
  }

  applyPreset(name: CameraPresetName): void {
    const p = CAMERA_PRESETS[name];
    this.focus(this.desired.x, this.desired.z, p.distance, p.pitch);
  }

  /** Eases toward the desired state and computes camera position / look-at. */
  update(dt: number, heightAt: HeightAt): void {
    const c = this.current;
    const d = this.desired;
    if (!this.initialised) {
      Object.assign(c, d);
      this.focusY = heightAt(c.x, c.z);
      this.initialised = true;
    }
    const k = (rate: number): number => 1 - Math.exp(-rate * Math.min(dt, 0.1));
    const kMove = k(9);
    const kRot = k(11);
    c.x += (d.x - c.x) * kMove;
    c.z += (d.z - c.z) * kMove;
    c.distance += (d.distance - c.distance) * kMove;
    c.azimuth += (d.azimuth - c.azimuth) * kRot;
    c.pitch += (d.pitch - c.pitch) * kRot;
    this.focusY += (heightAt(c.x, c.z) - this.focusY) * k(6);
    this.computePose(heightAt);
  }

  /** Jumps straight to the desired state (no easing). */
  snap(heightAt: HeightAt): void {
    Object.assign(this.current, this.desired);
    this.focusY = heightAt(this.current.x, this.current.z);
    this.initialised = true;
    this.computePose(heightAt);
  }

  applyTo(camera: THREE.PerspectiveCamera): void {
    camera.position.copy(this.position);
    camera.lookAt(this.lookAt);
    camera.updateMatrixWorld();
  }

  /** True while still easing (used to know when hover needs re-picking). */
  get isMoving(): boolean {
    const c = this.current;
    const d = this.desired;
    return (
      Math.abs(c.x - d.x) > 0.01 ||
      Math.abs(c.z - d.z) > 0.01 ||
      Math.abs(c.distance - d.distance) > 0.01 ||
      Math.abs(c.azimuth - d.azimuth) > 1e-4 ||
      Math.abs(c.pitch - d.pitch) > 1e-4
    );
  }

  private computePose(heightAt: HeightAt): void {
    const c = this.current;
    this.lookAt.set(c.x, this.focusY, c.z);
    const horiz = Math.cos(c.pitch) * c.distance;
    this.position.set(
      c.x + Math.sin(c.azimuth) * horiz,
      this.focusY + Math.sin(c.pitch) * c.distance,
      c.z + Math.cos(c.azimuth) * horiz
    );
    const ground = heightAt(this.position.x, this.position.z) + this.limits.groundClearance;
    if (this.position.y < ground) this.position.y = ground;
  }

  private clampDesired(): void {
    const { bounds, margin } = this.limits;
    this.desired.x = THREE.MathUtils.clamp(this.desired.x, bounds.minX + margin, bounds.maxX - margin);
    this.desired.z = THREE.MathUtils.clamp(this.desired.z, bounds.minZ + margin, bounds.maxZ - margin);
  }
}

/**
 * Mouse + keyboard binding:
 *  - left drag: pan (paints hexes in farm draw mode) · right / middle drag: rotate (horizontal) & tilt (vertical)
 *  - wheel: zoom toward cursor · WASD / arrows: pan · Q / E: rotate · R / F: tilt · +/-: zoom
 */
export class CameraInput {
  private drag: { button: number; x: number; y: number; moved: number } | null = null;
  private readonly keys = new Set<string>();
  private readonly disposers: (() => void)[] = [];

  constructor(
    private readonly element: HTMLElement,
    private readonly controller: CameraController,
    private readonly fovRad: () => number,
    private readonly groundUnderCursor: (clientX: number, clientY: number) => { x: number; z: number } | null
  ) {
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions
    ): void => {
      target.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(element, 'pointerdown', (e) => this.onDown(e));
    on(window, 'pointermove', (e) => this.onMove(e));
    on(window, 'pointerup', (e) => this.onUp(e));
    on(element, 'wheel', (e) => this.onWheel(e), { passive: false });
    on(element, 'contextmenu', (e) => e.preventDefault());
    on(window, 'keydown', (e) => this.onKey(e, true));
    on(window, 'keyup', (e) => this.onKey(e, false));
    on(window, 'blur', () => this.keys.clear());
  }

  /** Pixels the pointer moved during the current/last drag (used to tell click from drag). */
  get lastDragDistance(): number {
    return this.drag?.moved ?? this.lastMoved;
  }

  private lastMoved = 0;

  /** When this returns false, left-drag does not pan (e.g. while painting farm hexes). */
  leftDragPans: () => boolean = () => true;

  update(dt: number): void {
    const k = this.keys;
    if (k.size === 0) return;
    const speed = this.controller.current.distance * 1.1 * dt;
    let right = 0;
    let forward = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) forward += speed;
    if (k.has('KeyS') || k.has('ArrowDown')) forward -= speed;
    if (k.has('KeyD') || k.has('ArrowRight')) right += speed;
    if (k.has('KeyA') || k.has('ArrowLeft')) right -= speed;
    if (right || forward) this.controller.pan(right, forward);
    if (k.has('KeyQ')) this.controller.rotate(-1.6 * dt, 0);
    if (k.has('KeyE')) this.controller.rotate(1.6 * dt, 0);
    if (k.has('KeyR')) this.controller.rotate(0, 0.9 * dt);
    if (k.has('KeyF')) this.controller.rotate(0, -0.9 * dt);
    if (k.has('Equal') || k.has('NumpadAdd')) this.controller.zoom(Math.exp(-1.4 * dt));
    if (k.has('Minus') || k.has('NumpadSubtract')) this.controller.zoom(Math.exp(1.4 * dt));
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers.length = 0;
  }

  private onDown(e: PointerEvent): void {
    this.drag = { button: e.button, x: e.clientX, y: e.clientY, moved: 0 };
    this.lastMoved = 0;
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (d.button === 0) {
      if (d.moved < 4 || !this.leftDragPans()) return; // small jitter stays a click
      this.controller.panByPixels(dx, dy, this.element.clientHeight, this.fovRad());
    } else {
      this.controller.rotate(-dx * 0.006, dy * 0.004);
    }
  }

  private onUp(_e: PointerEvent): void {
    this.lastMoved = this.drag?.moved ?? 0;
    this.drag = null;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = Math.exp(THREE.MathUtils.clamp(delta, -300, 300) * 0.0012);
    const anchor = factor < 1 ? this.groundUnderCursor(e.clientX, e.clientY) : null;
    this.controller.zoom(factor, anchor ?? undefined);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
  }
}
