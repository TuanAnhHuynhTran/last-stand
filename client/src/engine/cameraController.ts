import { clamp, type WorldBounds } from '@cityverse/shared';

export interface CameraBoundsConfig {
  worldBounds: WorldBounds;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  padding?: number;
}

export interface CameraRigState {
  targetX: number;
  targetY: number;
  targetZ: number;
  distance: number;
  azimuth: number;
  polar: number;
}

export interface ResizablePerspectiveCamera {
  aspect: number;
  updateProjectionMatrix: () => void;
}

export const DEFAULT_CAMERA_LIMITS = {
  minDistance: 22,
  maxDistance: 170,
  minPolarAngle: 0.38, // ~22 deg from top
  maxPolarAngle: 1.24, // ~71 deg from top (never clips below ground)
  defaultDistance: 84,
  defaultAzimuth: Math.PI / 4, // Isometric 45 deg diagonal angle
  defaultPolar: 0.82, // ~47 deg isometric tilt
  padding: 6,
} as const;

export class IsometricCameraController {
  readonly config: CameraBoundsConfig;
  private desired: CameraRigState;
  private current: CameraRigState;

  constructor(initialTarget: { x: number; y: number; z: number }, config: CameraBoundsConfig) {
    this.config = config;
    const clamped = this.clampState({
      targetX: initialTarget.x,
      targetY: initialTarget.y,
      targetZ: initialTarget.z,
      distance: DEFAULT_CAMERA_LIMITS.defaultDistance,
      azimuth: DEFAULT_CAMERA_LIMITS.defaultAzimuth,
      polar: DEFAULT_CAMERA_LIMITS.defaultPolar,
    });
    this.desired = { ...clamped };
    this.current = { ...clamped };
  }

  getDesiredState(): CameraRigState {
    return { ...this.desired };
  }

  getCurrentState(): CameraRigState {
    return { ...this.current };
  }

  reset(target: { x: number; y: number; z: number }): void {
    this.desired = this.clampState({
      targetX: target.x,
      targetY: target.y,
      targetZ: target.z,
      distance: DEFAULT_CAMERA_LIMITS.defaultDistance,
      azimuth: DEFAULT_CAMERA_LIMITS.defaultAzimuth,
      polar: DEFAULT_CAMERA_LIMITS.defaultPolar,
    });
  }

  setTargetElevation(y: number): void {
    this.desired.targetY = clamp(y, -2, 24);
  }

  /**
   * Pans camera in screen-aligned horizontal directions.
   * forwardInput > 0 moves forward (W / Up), rightInput > 0 moves right (D / Right).
   */
  panScreenAligned(rightInput: number, forwardInput: number, speedScale = 1): void {
    if (rightInput === 0 && forwardInput === 0) return;

    const sinA = Math.sin(this.desired.azimuth);
    const cosA = Math.cos(this.desired.azimuth);

    // Camera looks from (target + offset) toward target, where offset.x ~ sinA, offset.z ~ cosA
    // Therefore forward on ground is (-sinA, -cosA) and right is (cosA, -sinA)
    const dx = (rightInput * cosA - forwardInput * sinA) * speedScale;
    const dz = (-rightInput * sinA - forwardInput * cosA) * speedScale;

    this.desired = this.clampState({
      ...this.desired,
      targetX: this.desired.targetX + dx,
      targetZ: this.desired.targetZ + dz,
    });
  }

  /**
   * Pans via pointer drag deltas in screen pixels.
   */
  panByPixels(deltaPxX: number, deltaPxY: number, viewportHeight: number): void {
    const safeHeight = Math.max(1, viewportHeight);
    const worldPerPixel = (this.desired.distance * 1.15) / safeHeight;
    // Dragging mouse right pulls ground right -> target moves left (-deltaPxX)
    // Dragging mouse down pulls ground down -> target moves forward (+deltaPxY)
    this.panScreenAligned(-deltaPxX * worldPerPixel, deltaPxY * worldPerPixel, 1);
  }

  /**
   * Orbits camera via right-mouse drag deltas in screen pixels.
   */
  rotateByPixels(deltaPxX: number, deltaPxY: number, sensitivity = 0.0065): void {
    this.desired = this.clampState({
      ...this.desired,
      azimuth: this.desired.azimuth - deltaPxX * sensitivity,
      polar: this.desired.polar - deltaPxY * sensitivity,
    });
  }

  /**
   * Zooms smoothly via mouse wheel delta (positive = zoom out, negative = zoom in).
   */
  zoomByWheel(deltaY: number): void {
    const normalized = clamp(deltaY, -240, 240);
    const zoomFactor = Math.exp(normalized * 0.0012);
    this.desired = this.clampState({
      ...this.desired,
      distance: this.desired.distance * zoomFactor,
    });
  }

  /**
   * Advances damped camera state and returns world-space camera position & lookAt target.
   */
  step(deltaSeconds: number, damping = 12): {
    position: [number, number, number];
    target: [number, number, number];
  } {
    const t = 1 - Math.exp(-damping * Math.max(0.001, Math.min(deltaSeconds, 0.1)));
    this.current.targetX += (this.desired.targetX - this.current.targetX) * t;
    this.current.targetY += (this.desired.targetY - this.current.targetY) * t;
    this.current.targetZ += (this.desired.targetZ - this.current.targetZ) * t;
    this.current.distance += (this.desired.distance - this.current.distance) * t;
    this.current.azimuth += (this.desired.azimuth - this.current.azimuth) * t;
    this.current.polar += (this.desired.polar - this.current.polar) * t;

    return this.computeCameraPose(this.current);
  }

  snapToDesired(): {
    position: [number, number, number];
    target: [number, number, number];
  } {
    this.current = { ...this.desired };
    return this.computeCameraPose(this.current);
  }

  computeCameraPose(state: CameraRigState = this.current): {
    position: [number, number, number];
    target: [number, number, number];
  } {
    const sinP = Math.sin(state.polar);
    const cosP = Math.cos(state.polar);
    const sinA = Math.sin(state.azimuth);
    const cosA = Math.cos(state.azimuth);

    const camX = state.targetX + state.distance * sinP * sinA;
    const camY = state.targetY + state.distance * cosP;
    const camZ = state.targetZ + state.distance * sinP * cosA;

    return {
      position: [camX, camY, camZ],
      target: [state.targetX, state.targetY, state.targetZ],
    };
  }

  private clampState(state: CameraRigState): CameraRigState {
    const pad = this.config.padding ?? DEFAULT_CAMERA_LIMITS.padding;
    const minX = this.config.worldBounds.minX + pad;
    const maxX = Math.max(minX, this.config.worldBounds.maxX - pad);
    const minZ = this.config.worldBounds.minZ + pad;
    const maxZ = Math.max(minZ, this.config.worldBounds.maxZ - pad);

    return {
      targetX: clamp(state.targetX, minX, maxX),
      targetY: clamp(state.targetY, -2, 24),
      targetZ: clamp(state.targetZ, minZ, maxZ),
      distance: clamp(state.distance, this.config.minDistance, this.config.maxDistance),
      azimuth: state.azimuth,
      polar: clamp(state.polar, this.config.minPolarAngle, this.config.maxPolarAngle),
    };
  }
}

/**
 * Updates a PerspectiveCamera's aspect ratio and projection matrix cleanly on viewport resize.
 */
export function applyCameraViewportResize(
  camera: ResizablePerspectiveCamera,
  width: number,
  height: number
): boolean {
  if (width <= 0 || height <= 0) {
    return false;
  }
  const nextAspect = width / height;
  if (Math.abs(camera.aspect - nextAspect) > 1e-6) {
    camera.aspect = nextAspect;
    camera.updateProjectionMatrix();
    return true;
  }
  camera.updateProjectionMatrix();
  return false;
}
