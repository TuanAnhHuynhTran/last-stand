import * as THREE from 'three';
import { axialToWorld, rotationToYaw, worldToAxial, hexKey, type WorldBuildingDTO } from '@cityverse/shared';
import { footprintBaseHeight, type HeightSampler } from './BuildingRenderer';

/** Paths sit on the actual terrain or on an adjacent building's garden foundation. */
export function pathSurfaceSampler(buildings: readonly WorldBuildingDTO[], height: HeightSampler): HeightSampler {
  const plots = new Map<string, number>();
  for (const b of buildings) {
    if (b.typeCode === 'road') continue;
    const y = footprintBaseHeight(b.footprint, height) + 0.15;
    for (const h of b.footprint) plots.set(hexKey(h.q, h.r), y);
  }
  return (x, z) => {
    const h = worldToAxial(x, z);
    return Math.max(height(x, z), plots.get(hexKey(h.q, h.r)) ?? -Infinity);
  };
}

/** Produces an owned geometry; never modifies the model cache. Root Y must be zero. */
export function drapePathGeometry(source: THREE.BufferGeometry, q: number, r: number, rotation: number, height: HeightSampler): THREE.BufferGeometry {
  const geo = source.clone();
  const p = geo.getAttribute('position');
  const c = axialToWorld(q, r);
  const yaw = rotationToYaw(rotation);
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, p.getY(i) + height(c.x + x * cos + z * sin, c.z - x * sin + z * cos));
  }
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
