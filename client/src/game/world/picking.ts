/**
 * Terrain picking by ray-marching the height field (no triangle raycasting against dozens of
 * chunk meshes). The sampler is the *rendered* surface, so the hit is the point the player
 * actually sees under the cursor — independent of camera rotation or zoom.
 */
import * as THREE from 'three';
import { MAX_TERRAIN_HEIGHT, worldToAxial, type AxialCoord } from '@cityverse/shared';

export type HeightSampler = (x: number, z: number) => number;

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

export interface TerrainHit {
  point: THREE.Vector3;
  hex: AxialCoord;
}

export function pickTerrain(ray: THREE.Ray, height: HeightSampler, maxDistance = 4000): THREE.Vector3 | null {
  const o = ray.origin;
  const d = ray.direction;
  let t = 0;
  // Skip straight to the top of the terrain envelope.
  if (o.y > MAX_TERRAIN_HEIGHT) {
    if (d.y >= 0) return null;
    t = (o.y - MAX_TERRAIN_HEIGHT) / -d.y;
  }
  let prevT = t;
  let prevGap = o.y + d.y * t - height(o.x + d.x * t, o.z + d.z * t);
  if (prevGap <= 0) return new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);

  while (t < maxDistance) {
    // Conservative adaptive step: never jump more than ~half the vertical gap.
    const step = Math.min(6, Math.max(0.35, prevGap * 0.5));
    t += step;
    const x = o.x + d.x * t;
    const y = o.y + d.y * t;
    const z = o.z + d.z * t;
    if (y < -50) return null;
    const gap = y - height(x, z);
    if (gap <= 0) {
      // Bisection between prevT (above) and t (below).
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 24; i += 1) {
        const mid = (lo + hi) / 2;
        const g = o.y + d.y * mid - height(o.x + d.x * mid, o.z + d.z * mid);
        if (g > 0) lo = mid;
        else hi = mid;
      }
      return new THREE.Vector3(o.x + d.x * hi, o.y + d.y * hi, o.z + d.z * hi);
    }
    prevT = t;
    prevGap = gap;
  }
  return null;
}

/** NDC (-1..1) → terrain hit + hex. */
export function pickHexFromNdc(camera: THREE.Camera, ndcX: number, ndcY: number, height: HeightSampler): TerrainHit | null {
  ndc.set(ndcX, ndcY);
  raycaster.setFromCamera(ndc, camera);
  const point = pickTerrain(raycaster.ray, height);
  if (!point) return null;
  return { point, hex: worldToAxial(point.x, point.z) };
}

export function clientToNdc(element: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
    y: -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
  };
}
