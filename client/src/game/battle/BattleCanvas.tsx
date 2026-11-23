import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AxialCoord } from '@cityverse/shared';
import type { BattleCamera } from './BattleCamera';
import type { BattleRenderer } from './BattleRenderer';

interface Props {
  renderer: BattleRenderer;
  camera: BattleCamera;
  onHover: (hex: AxialCoord | null) => void;
  onClick: (hex: AxialCoord) => void;
}

/** The BattleScene: its own canvas, lights and camera — the personal world is not loaded here. */
export function BattleCanvas(props: Props) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 42, near: 0.5, far: 600, position: [0, 60, 60] }} style={{ position: 'absolute', inset: 0 }}>
      <color attach="background" args={['#bcd7e6']} />
      <fog attach="fog" args={['#bcd7e6', 120, 260]} />
      <hemisphereLight args={['#fff6e0', '#6a7a5a', 0.9]} />
      <directionalLight position={[30, 60, 25]} intensity={1.6} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={60} shadow-camera-bottom={-60} />
      <Scene {...props} />
    </Canvas>
  );
}

function Scene({ renderer, camera, onHover, onClick }: Props) {
  const { camera: cam, gl, scene } = useThree();
  const ray = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const drag = useRef<{ x: number; y: number; button: number; moved: boolean } | null>(null);

  useEffect(() => {
    scene.add(renderer.group);
    return () => {
      scene.remove(renderer.group);
    };
  }, [renderer, scene]);

  useEffect(() => {
    const el = gl.domElement;
    const hexAt = (e: PointerEvent | MouseEvent): AxialCoord | null => {
      const r = el.getBoundingClientRect();
      mouse.current.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.current.setFromCamera(mouse.current, cam);
      return renderer.pickHex(ray.current);
    };
    const down = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (d) {
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        if (d.moved) {
          if (d.button === 2) {
            camera.rotate(-dx * 0.006);
            camera.tilt(dy * 0.003);
          } else camera.pan(-dx * 0.08, -dy * 0.08);
          d.x = e.clientX;
          d.y = e.clientY;
        }
      }
      onHover(hexAt(e));
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (d && !d.moved && d.button === 0) {
        const h = hexAt(e);
        if (h) onClick(h);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.zoom(Math.sign(e.deltaY) * 0.1);
    };
    const menu = (e: Event) => e.preventDefault();
    const leave = () => onHover(null);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', menu);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', menu);
      el.removeEventListener('pointerleave', leave);
    };
  }, [gl, cam, renderer, camera, onHover, onClick]);

  useEffect(() => {
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => keys.add(e.code);
    const ku = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const id = window.setInterval(() => {
      const k = (c: string) => keys.has(c);
      if (k('KeyQ')) camera.rotate(0.04);
      if (k('KeyE')) camera.rotate(-0.04);
      const fx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
      const fz = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
      if (fx || fz) camera.pan(fx * 1.2, fz * 1.2);
    }, 16);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.clearInterval(id);
    };
  }, [camera]);

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.1);
    camera.update(step, cam as THREE.PerspectiveCamera);
    renderer.update(step, cam);
  });
  return null;
}
