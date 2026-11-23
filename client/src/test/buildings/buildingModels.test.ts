import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BUILDING_DEFINITIONS,
  HEX_SPACING,
  PATH_WIDTH,
  pathEndpoints,
  axialToWorld,
  getFootprintHexes,
  rotationToYaw,
  type BuildingTypeCode,
} from '@cityverse/shared';
import { buildBuildingGeometry } from '../../game/buildings/buildingModels';

const APOTHEM = HEX_SPACING / 2;

/** Pointy-top hex containment with a small tolerance. */
function insideHex(x: number, z: number, cx: number, cz: number, tol = 0.03): boolean {
  const dx = Math.abs(x - cx);
  const dz = Math.abs(z - cz);
  return dx <= APOTHEM + tol && dx * 0.5 + dz * (Math.sqrt(3) / 2) <= APOTHEM + tol;
}

function verticesOutside(code: BuildingTypeCode, level: number, rotation: number): number {
  const geo = buildBuildingGeometry(code, level);
  const yaw = rotationToYaw(rotation);
  const pos = geo.getAttribute('position');
  const centers = getFootprintHexes(code, { q: 0, r: 0 }, rotation).map((h) => axialToWorld(h.q, h.r));
  const v = new THREE.Vector3();
  const rot = new THREE.Matrix4().makeRotationY(yaw);
  let outside = 0;
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i).applyMatrix4(rot);
    if (code === 'road') {
      const [a, b] = pathEndpoints({ q: 0, r: 0 }, rotation);
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((v.x - a.x) * dx + (v.z - a.z) * dz) / (dx * dx + dz * dz)));
      if (Math.hypot(v.x - a.x - t * dx, v.z - a.z - t * dz) > PATH_WIDTH / 2 + 0.03) outside++;
    } else if (!centers.some((c) => insideHex(v.x, v.z, c.x, c.z))) outside += 1;
  }
  geo.dispose();
  return outside;
}

function colourSignature(geo: THREE.BufferGeometry): Set<string> {
  const c = geo.getAttribute('color');
  const set = new Set<string>();
  for (let i = 0; i < c.count; i += 7) {
    set.add(`${Math.round(c.getX(i) * 8)},${Math.round(c.getY(i) * 8)},${Math.round(c.getZ(i) * 8)}`);
  }
  return set;
}

describe('Building models', () => {
  it.each(BUILDING_DEFINITIONS.flatMap((d) => d.levels.map((l) => [d.code, l.level] as const)))(
    '%s level %i stays inside its plot or narrow path corridor for all 6 rotations',
    (code, level) => {
      for (let rot = 0; rot < 6; rot += 1) {
        expect(verticesOutside(code, level, rot), `rotation ${rot}`).toBe(0);
      }
    }
  );

  it('houses always fit in exactly 1 hex (no part spills into a neighbour)', () => {
    for (const level of [1, 2, 3]) expect(verticesOutside('house', level, 0)).toBe(0);
  });

  it('the three house levels are clearly different models', () => {
    const [l1, l2, l3] = [1, 2, 3].map((l) => buildBuildingGeometry('house', l));
    const h = [l1, l2, l3].map((g) => g.boundingBox!.max.y);
    // Level 3 is a real two-storey house.
    expect(h[2]).toBeGreaterThan(h[1] + 2);
    expect(h[1]).toBeGreaterThanOrEqual(h[0] - 0.2);
    // Different materials/colours: little overlap in colour palettes.
    const sig = [l1, l2, l3].map(colourSignature);
    const jaccard = (a: Set<string>, b: Set<string>) => {
      const inter = [...a].filter((x) => b.has(x)).length;
      return inter / new Set([...a, ...b]).size;
    };
    expect(jaccard(sig[0], sig[1])).toBeLessThan(0.5);
    expect(jaccard(sig[1], sig[2])).toBeLessThan(0.8);
    // More detail at each level.
    const verts = [l1, l2, l3].map((g) => g.getAttribute('position').count);
    expect(verts[1]).toBeGreaterThan(verts[0]);
    expect(verts[2]).toBeGreaterThan(verts[1]);
    [l1, l2, l3].forEach((g) => g.dispose());
  });

  it('models are single merged geometries with colours and normals (one draw call each)', () => {
    for (const def of BUILDING_DEFINITIONS) {
      const g = buildBuildingGeometry(def.code, 1);
      expect(g.getAttribute('color')).toBeTruthy();
      expect(g.getAttribute('normal')).toBeTruthy();
      // Roads are flat on purpose; everything else is a real 3D building.
      if (def.category === 'infrastructure') expect(g.boundingBox!.max.y).toBeLessThan(1.2);
      else expect(g.boundingBox!.max.y).toBeGreaterThan(2.4);
      g.dispose();
    }
  });
});
