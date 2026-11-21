import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  WORLD_CONFIG,
  worldToChunk,
  type WorldBounds,
} from '@cityverse/shared';
import { useWorldStore } from '../stores/worldStore';
import {
  DEFAULT_CAMERA_LIMITS,
  IsometricCameraController,
  applyCameraViewportResize,
} from './cameraController';

interface CameraRigProps {
  initialTarget: { x: number; y: number; z: number };
  worldBounds: WorldBounds;
  chunkSize?: number;
  tileSize?: number;
  chunksX?: number;
  chunksZ?: number;
  getTerrainHeight?: (x: number, z: number) => number;
  onCameraTargetUpdate?: (x: number, y: number, z: number) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function CameraRig({
  initialTarget,
  worldBounds,
  chunkSize = WORLD_CONFIG.CHUNK_SIZE,
  tileSize = WORLD_CONFIG.TILE_SIZE,
  chunksX = WORLD_CONFIG.CHUNKS_X,
  chunksZ = WORLD_CONFIG.CHUNKS_Z,
  getTerrainHeight,
  onCameraTargetUpdate,
}: CameraRigProps) {
  const { camera, gl, size } = useThree();
  const cameraResetCounter = useWorldStore((s) => s.cameraResetCounter);
  const setCameraTelemetry = useWorldStore((s) => s.setCameraTelemetry);

  const controllerRef = useRef<IsometricCameraController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new IsometricCameraController(initialTarget, {
      worldBounds,
      minDistance: DEFAULT_CAMERA_LIMITS.minDistance,
      maxDistance: DEFAULT_CAMERA_LIMITS.maxDistance,
      minPolarAngle: DEFAULT_CAMERA_LIMITS.minPolarAngle,
      maxPolarAngle: DEFAULT_CAMERA_LIMITS.maxPolarAngle,
      padding: DEFAULT_CAMERA_LIMITS.padding,
    });
  }

  const keysPressedRef = useRef<Set<string>>(new Set());
  const dragModeRef = useRef<'none' | 'pan' | 'rotate'>('none');
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTelemetryTimeRef = useRef(0);
  const initializedRef = useRef(false);

  // Snap camera immediately on first mount
  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl || initializedRef.current) return;
    initializedRef.current = true;
    const pose = ctrl.snapToDesired();
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
    onCameraTargetUpdate?.(pose.target[0], pose.target[1], pose.target[2]);
  }, [camera, onCameraTargetUpdate]);

  // Reset camera when HUD Reset button is clicked
  useEffect(() => {
    if (cameraResetCounter === 0) return;
    controllerRef.current?.reset(initialTarget);
  }, [cameraResetCounter, initialTarget]);

  // Keep PerspectiveCamera aspect ratio & projection matrix synced on resize
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      applyCameraViewportResize(camera, size.width, size.height);
    }
  }, [camera, size.width, size.height]);

  // Keyboard (WASD / Arrows) + Mouse (Left/Middle Pan, Right Rotate, Wheel Zoom)
  useEffect(() => {
    const domElement = gl.domElement;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      keysPressedRef.current.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.code);
    };

    const onWindowBlur = () => {
      keysPressedRef.current.clear();
      dragModeRef.current = 'none';
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 2) {
        dragModeRef.current = 'rotate';
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      if (e.button === 1) {
        e.preventDefault();
        dragModeRef.current = 'pan';
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      if (e.button === 0) {
        const tool = useWorldStore.getState().interactionTool;
        if (tool === 'pan' && !e.shiftKey) {
          dragModeRef.current = 'pan';
          lastPointerRef.current = { x: e.clientX, y: e.clientY };
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const mode = dragModeRef.current;
      if (mode === 'none') return;

      const ctrl = controllerRef.current;
      if (!ctrl) return;

      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };

      if (mode === 'pan') {
        ctrl.panByPixels(dx, dy, domElement.clientHeight || window.innerHeight);
      } else if (mode === 'rotate') {
        ctrl.rotateByPixels(dx, dy);
      }
    };

    const onPointerUp = () => {
      dragModeRef.current = 'none';
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      controllerRef.current?.zoomByWheel(e.deltaY);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    domElement.addEventListener('contextmenu', onContextMenu);
    domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    domElement.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      domElement.removeEventListener('contextmenu', onContextMenu);
      domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domElement.removeEventListener('wheel', onWheel);
    };
  }, [gl.domElement]);

  useFrame((state, delta) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    const keys = keysPressedRef.current;
    let forward = 0;
    let right = 0;

    if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) right += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) right -= 1;

    if (forward !== 0 || right !== 0) {
      const len = Math.hypot(forward, right);
      const desiredState = ctrl.getDesiredState();
      // Scale pan speed smoothly with zoom level so navigation feels natural up close and zoomed out
      const speed = Math.max(24, desiredState.distance * 0.95) * Math.min(delta, 0.05);
      ctrl.panScreenAligned((right / len) * speed, (forward / len) * speed, 1);
    }

    // Track gentle terrain elevation under camera target so target never sinks beneath hills
    if (getTerrainHeight) {
      const desired = ctrl.getDesiredState();
      const terrainY = getTerrainHeight(desired.targetX, desired.targetZ);
      ctrl.setTargetElevation(Math.max(0, terrainY));
    }

    const pose = ctrl.step(delta, 12);
    // Keep camera safely above ground even over tall peaks
    let camY = pose.position[1];
    if (getTerrainHeight) {
      const groundUnderCam = getTerrainHeight(pose.position[0], pose.position[2]);
      camY = Math.max(camY, groundUnderCam + 8);
    }

    camera.position.set(pose.position[0], camY, pose.position[2]);
    camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);

    onCameraTargetUpdate?.(pose.target[0], pose.target[1], pose.target[2]);

    // Update HUD telemetry ~10x/sec to keep React renders light
    const now = state.clock.elapsedTime;
    if (now - lastTelemetryTimeRef.current > 0.1) {
      lastTelemetryTimeRef.current = now;
      const cur = ctrl.getCurrentState();
      const chunkCoord = worldToChunk(
        cur.targetX,
        cur.targetZ,
        chunkSize,
        tileSize,
        chunksX,
        chunksZ
      );
      setCameraTelemetry({
        targetX: Math.round(cur.targetX * 10) / 10,
        targetZ: Math.round(cur.targetZ * 10) / 10,
        chunkX: chunkCoord.cx,
        chunkZ: chunkCoord.cz,
        distance: Math.round(cur.distance),
        polarDeg: Math.round((cur.polar * 180) / Math.PI),
      });
    }
  });

  return null;
}
