/**
 * Builds the static scenery of one farm zone in world space, draped on the terrain:
 * soil / paddy mud / pasture ground, bunds, canals, farm roads, beds, furrows and the
 * level-dependent structures (hut, pump station / windmill, scarecrow, flags, hay).
 * Output: one merged solid geometry + one water geometry (paddy water and canals).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { axialToWorld, getHexPolygon, type FarmZoneTypeCode } from '@cityverse/shared';
import { ModelBuilder, ball, box, cyl, type Paint } from '../buildings/modelKit';
import {
  buildBasket,
  buildFlag,
  buildHayBale,
  buildHut,
  buildPumpStation,
  buildScarecrow,
  buildWindmillTower,
} from './farmModels';
import type { EdgeSeg, Spot, XZ, ZoneLayout } from './farmLayout';

export type HeightSampler = (x: number, z: number) => number;

export interface AnimatedPart {
  kind: 'windmill';
  x: number;
  y: number;
  z: number;
  ry: number;
}

export interface ZoneScenery {
  solid: THREE.BufferGeometry;
  water: THREE.BufferGeometry | null;
  animated: AnimatedPart[];
  /** Height (world Y) for markers above the zone */
  topY: number;
}

/** Lift of the field surface above the terrain (avoids z-fighting with the terrain mesh). */
export const FIELD_LIFT = 0.1;
/** Paddy water surface above the terrain. */
export const PADDY_WATER_LIFT = 0.26;

const GROUND: Record<FarmZoneTypeCode, string> = {
  rice_paddy: '#7d5c3b',
  corn_field: '#8f6644',
  vegetable_garden: '#80c45a',
  orchard: '#8ccf5e',
  pasture: '#97dc64',
};

export function hash(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Draped hex surface (position/normal/color, non-indexed) following the terrain. */
export function drapeHex(
  pos: number[],
  col: number[],
  q: number,
  r: number,
  scale: number,
  k: number,
  lift: number,
  height: HeightSampler,
  color: (x: number, z: number) => THREE.Color
): void {
  const c = axialToWorld(q, r);
  const poly = getHexPolygon(q, r, undefined, scale);
  const push = (x: number, z: number): void => {
    pos.push(x, height(x, z) + lift, z);
    const cc = color(x, z);
    col.push(cc.r, cc.g, cc.b);
  };
  for (let s = 0; s < 6; s += 1) {
    const a = poly[s];
    const b = poly[(s + 1) % 6];
    const P = (i: number, j: number): [number, number] => [
      c.x + (a.x - c.x) * (i / k) + (b.x - c.x) * (j / k),
      c.z + (a.z - c.z) * (i / k) + (b.z - c.z) * (j / k),
    ];
    for (let i = 0; i < k; i += 1) {
      for (let j = 0; j < k - i; j += 1) {
        const p0 = P(i, j);
        const p1 = P(i + 1, j);
        const p2 = P(i, j + 1);
        push(p0[0], p0[1]);
        push(p2[0], p2[1]);
        push(p1[0], p1[1]);
        if (j < k - i - 1) {
          const p3 = P(i + 1, j + 1);
          push(p1[0], p1[1]);
          push(p2[0], p2[1]);
          push(p3[0], p3[1]);
        }
      }
    }
  }
}

export function surface(pos: number[], col: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Box along a world segment p0→p1, split into ≤ 3 m pieces, each seated & tilted on the
 * terrain. `y0` is the bottom offset above terrain.
 */
export function segmentBox(
  b: ModelBuilder,
  p0: XZ,
  p1: XZ,
  height: HeightSampler,
  width: number,
  h: number,
  paint: Paint,
  y0 = 0,
  radius = 0.12
): void {
  const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  if (len < 0.05) return;
  const n = Math.max(1, Math.ceil(len / 3));
  const ry = Math.atan2(-(p1.z - p0.z), p1.x - p0.x);
  for (let i = 0; i < n; i += 1) {
    const a = { x: p0.x + ((p1.x - p0.x) * i) / n, z: p0.z + ((p1.z - p0.z) * i) / n };
    const c = { x: p0.x + ((p1.x - p0.x) * (i + 1)) / n, z: p0.z + ((p1.z - p0.z) * (i + 1)) / n };
    const ha = height(a.x, a.z);
    const hc = height(c.x, c.z);
    const l = len / n;
    b.add(box(l + 0.08, h, width, radius), paint, {
      x: (a.x + c.x) / 2,
      y: (ha + hc) / 2 + y0 + h / 2,
      z: (a.z + c.z) / 2,
      ry,
      rz: Math.atan2(hc - ha, l),
    });
  }
}

/** Edge shifted toward the hex centre by `inset`, shortened so neighbouring insets meet. */
export function insetEdge(e: EdgeSeg, inset: number): [XZ, XZ] {
  const mx = (e.a.x + e.b.x) / 2;
  const mz = (e.a.z + e.b.z) / 2;
  const nx = e.center.x - mx;
  const nz = e.center.z - mz;
  const nl = Math.hypot(nx, nz) || 1;
  const ox = (nx / nl) * inset;
  const oz = (nz / nl) * inset;
  const shrink = Math.min(0.45, (inset * 0.577) / Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z));
  const lerp = (t: number): XZ => ({ x: e.a.x + (e.b.x - e.a.x) * t + ox, z: e.a.z + (e.b.z - e.a.z) * t + oz });
  return [lerp(shrink), lerp(1 - shrink)];
}

export function placeStructure(parts: THREE.BufferGeometry[], geo: THREE.BufferGeometry, spot: Spot, height: HeightSampler, scale = 1): void {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(spot.x, height(spot.x, spot.z) - 0.05, spot.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.ry),
    new THREE.Vector3(scale, scale, scale)
  );
  geo.applyMatrix4(m);
  parts.push(geo);
}

export function buildZoneScenery(
  zoneType: FarmZoneTypeCode,
  level: number,
  layout: ZoneLayout,
  hexes: readonly { q: number; r: number }[],
  height: HeightSampler
): ZoneScenery {
  const parts: THREE.BufferGeometry[] = [];
  const waterPos: number[] = [];
  const waterCol: number[] = [];
  const b = new ModelBuilder();
  const animated: AnimatedPart[] = [];

  // ── Ground ──
  const groundPos: number[] = [];
  const groundCol: number[] = [];
  const base = new THREE.Color(GROUND[zoneType]);
  const tmp = new THREE.Color();
  const groundColor = (x: number, z: number): THREE.Color => {
    const v = 0.93 + hash(Math.round(x * 2), Math.round(z * 2)) * 0.12;
    // THREE.Color(hex) is already linear (ColorManagement), so no extra conversion.
    return tmp.copy(base).multiplyScalar(v);
  };
  for (const h of hexes) drapeHex(groundPos, groundCol, h.q, h.r, 1.0, 4, FIELD_LIFT, height, groundColor);
  parts.push(surface(groundPos, groundCol));

  // ── Paddy water (rice) ──
  if (zoneType === 'rice_paddy') {
    const wc = new THREE.Color('#79c9e6');
    for (const h of hexes) drapeHex(waterPos, waterCol, h.q, h.r, 0.9, 3, PADDY_WATER_LIFT, height, () => wc);
  }

  // ── Border: bunds / fences / canal ──
  const bundPaint: Paint =
    level >= 3 ? ['#9f998f', '#cfc9bd'] : level === 2 ? ['#7d5a36', '#9b7449'] : ['#7d5a36', '#a07a4c'];
  const grassTop: Paint = ['#5fae45', '#9be070'];
  const fenced = zoneType === 'pasture' || zoneType === 'orchard';
  for (const e of layout.borderEdges) {
    if (fenced && level === 1) {
      fence(b, e, height, zoneType === 'pasture' ? 'rail' : 'low');
    } else {
      const [p0, p1] = insetEdge(e, 0.38);
      const hBund = zoneType === 'rice_paddy' ? 0.42 : 0.3;
      segmentBox(b, p0, p1, height, 0.72, hBund, bundPaint, FIELD_LIFT - 0.05, 0.16);
      if (level >= 2) segmentBox(b, p0, p1, height, 0.6, 0.12, grassTop, FIELD_LIFT - 0.05 + hBund - 0.02, 0.06);
      if (fenced && level >= 2) fence(b, e, height, zoneType === 'pasture' ? 'rail' : 'low');
    }
    if (level >= 2) {
      // Canal just inside the bund: banks + water strip.
      const bank: Paint = level >= 3 ? ['#a9a39a', '#d3cdc2'] : ['#8a6440', '#a57b52'];
      const [w0, w1] = insetEdge(e, 1.25);
      segmentBox(b, ...insetEdge(e, 1.72), height, 0.26, 0.32, bank, FIELD_LIFT - 0.05, 0.08);
      segmentBox(b, w0, w1, height, 0.84, 0.12, ['#6a4c30', '#7d5a3a'], FIELD_LIFT - 0.04, 0.04);
      waterStrip(waterPos, waterCol, w0, w1, 0.78, height, FIELD_LIFT + 0.18);
      if (level >= 3) {
        // Flowers along the stone bund.
        const [f0, f1] = insetEdge(e, 0.38);
        for (const t of [0.25, 0.75]) {
          const x = f0.x + (f1.x - f0.x) * t;
          const z = f0.z + (f1.z - f0.z) * t;
          const c = hash(x, z) > 0.5 ? '#ff8fb1' : '#ffd45c';
          b.add(ball(0.16, 0), [c, '#fff6e0'], { x, y: height(x, z) + FIELD_LIFT + 0.48, z });
        }
      }
    }
  }

  // ── Interior edges: low bunds at L1, farm roads from L2 ──
  for (const e of layout.interiorEdges) {
    const p0 = e.a;
    const p1 = e.b;
    if (level === 1) {
      if (zoneType === 'rice_paddy') segmentBox(b, p0, p1, height, 0.55, 0.34, bundPaint, FIELD_LIFT - 0.05, 0.14);
    } else {
      const road: Paint = level >= 3 ? ['#cfc7b6', '#e8e1d2'] : ['#cdb184', '#e6cfa0'];
      const raise = zoneType === 'rice_paddy' ? 0.3 : 0.08;
      segmentBox(b, p0, p1, height, 1.7, raise, road, FIELD_LIFT - 0.05, 0.1);
      if (level >= 3) {
        for (const off of [-0.92, 0.92]) {
          const nx = -(p1.z - p0.z);
          const nz = p1.x - p0.x;
          const l = Math.hypot(nx, nz) || 1;
          const o = { x: (nx / l) * off, z: (nz / l) * off };
          segmentBox(b, { x: p0.x + o.x, z: p0.z + o.z }, { x: p1.x + o.x, z: p1.z + o.z }, height, 0.18, raise + 0.1, ['#9f998f', '#c4beb2'], FIELD_LIFT - 0.05, 0.06);
        }
      }
    }
  }

  // ── Beds / furrows ──
  if (zoneType === 'corn_field') {
    for (const bed of layout.beds) {
      segmentBox(b, { x: bed.x0, z: bed.z }, { x: bed.x1, z: bed.z }, height, 0.62, 0.2, ['#6e4b2e', '#8a6040'], FIELD_LIFT - 0.06, 0.1);
    }
  } else if (zoneType === 'vegetable_garden') {
    const soil: Paint = ['#6a4a2e', '#8a6242'];
    for (const bed of layout.beds) {
      const p0 = { x: bed.x0, z: bed.z };
      const p1 = { x: bed.x1, z: bed.z };
      segmentBox(b, p0, p1, height, 1.25, 0.28, soil, FIELD_LIFT - 0.06, 0.14);
      if (level >= 2) {
        const frame: Paint = level >= 3 ? ['#a9a39a', '#d3cdc2'] : ['#a8743f', '#d39a5b'];
        for (const dz of [-0.68, 0.68]) {
          segmentBox(b, { x: p0.x, z: p0.z + dz }, { x: p1.x, z: p1.z + dz }, height, 0.14, 0.4, frame, FIELD_LIFT - 0.06, 0.04);
        }
      }
    }
  } else if (zoneType === 'orchard') {
    for (const s of layout.slots) {
      const y = height(s.x, s.z) + FIELD_LIFT;
      b.add(cyl(0.95, 1.0, 0.08, 12), ['#7d5a36', '#9b7449'], { x: s.x, y: y + 0.02, z: s.z });
      if (level >= 2) b.add(cyl(1.05, 1.05, 0.12, 12), level >= 3 ? '#c4beb2' : '#9b7449', { x: s.x, y: y - 0.01, z: s.z, sx: 1, sy: 1 });
    }
  }

  // ── Structures ──
  if (layout.hut) placeStructure(parts, buildHut(), layout.hut, height, 0.9);
  if (layout.pump) {
    if (zoneType === 'corn_field' || zoneType === 'pasture') {
      placeStructure(parts, buildWindmillTower(), layout.pump, height, 0.85);
      const s = layout.pump;
      const local = new THREE.Vector3(0, 4.55 * 0.85, 1.28 * 0.85).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.ry);
      animated.push({ kind: 'windmill', x: s.x + local.x, y: height(s.x, s.z) + local.y, z: s.z + local.z, ry: s.ry });
    } else {
      placeStructure(parts, buildPumpStation(), layout.pump, height, 0.85);
    }
  }
  if (layout.scarecrow) placeStructure(parts, buildScarecrow(), layout.scarecrow, height);
  layout.flags.forEach((f, i) => placeStructure(parts, buildFlag(i % 2 ? '#ffd45c' : '#ff6f61'), f, height));
  if (level >= 3 && layout.hut) {
    const h = layout.hut;
    const side = { x: h.x + Math.cos(h.ry) * 2.0, z: h.z - Math.sin(h.ry) * 2.0 };
    if (zoneType === 'pasture') {
      placeStructure(parts, buildHayBale(), { ...side, ry: h.ry + 0.3, hex: h.hex }, height);
      placeStructure(parts, buildHayBale(), { x: side.x + 0.4, z: side.z + 1.2, ry: h.ry - 0.4, hex: h.hex }, height);
    } else {
      const fill = zoneType === 'orchard' ? '#ff9a2e' : zoneType === 'vegetable_garden' ? '#8fd47a' : zoneType === 'corn_field' ? '#ffd45c' : '#f2c84b';
      placeStructure(parts, buildBasket(fill), { ...side, ry: 0, hex: h.hex }, height);
      placeStructure(parts, buildBasket(fill), { x: side.x + 0.8, z: side.z + 0.5, ry: 0, hex: h.hex }, height);
    }
  }

  parts.push(b.build());
  const solid = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  solid.computeBoundingSphere();
  const water = waterPos.length ? surface(waterPos, waterCol) : null;
  water?.computeBoundingSphere();

  const cy = height(layout.centroid.x, layout.centroid.z);
  return { solid, water, animated, topY: cy + 6 };
}

/** Flat water ribbon along a segment (canal surface). */
export function waterStrip(pos: number[], col: number[], p0: XZ, p1: XZ, width: number, height: HeightSampler, lift: number): void {
  const c = new THREE.Color('#6cc3e6');
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const l = Math.hypot(dx, dz) || 1;
  const nx = (-dz / l) * (width / 2);
  const nz = (dx / l) * (width / 2);
  const n = Math.max(1, Math.ceil(l / 1.5));
  for (let i = 0; i < n; i += 1) {
    const a = { x: p0.x + (dx * i) / n, z: p0.z + (dz * i) / n };
    const b2 = { x: p0.x + (dx * (i + 1)) / n, z: p0.z + (dz * (i + 1)) / n };
    const quad: XZ[] = [
      { x: a.x - nx, z: a.z - nz },
      { x: a.x + nx, z: a.z + nz },
      { x: b2.x + nx, z: b2.z + nz },
      { x: b2.x - nx, z: b2.z - nz },
    ];
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      const p = quad[idx];
      pos.push(p.x, height(p.x, p.z) + lift, p.z);
      col.push(c.r, c.g, c.b);
    }
  }
}

/** Rustic fence along a border edge (pasture rails / low orchard fence). */
function fence(b: ModelBuilder, e: EdgeSeg, height: HeightSampler, style: 'rail' | 'low'): void {
  const [p0, p1] = insetEdge(e, 0.3);
  const n = 3;
  const postH = style === 'rail' ? 1.0 : 0.6;
  for (let i = 0; i <= n; i += 1) {
    const x = p0.x + ((p1.x - p0.x) * i) / n;
    const z = p0.z + ((p1.z - p0.z) * i) / n;
    b.add(cyl(0.1, 0.12, postH, 6), ['#7a5232', '#9c6b43'], { x, y: height(x, z) + FIELD_LIFT + postH / 2 - 0.05, z });
  }
  const rails = style === 'rail' ? [0.38, 0.78] : [0.4];
  for (const y of rails) segmentBox(b, p0, p1, height, 0.1, 0.1, ['#8a5d38', '#a87648'], FIELD_LIFT + y - 0.05, 0.03);
}

