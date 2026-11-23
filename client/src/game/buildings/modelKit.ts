/**
 * Tiny procedural modelling kit for chibi buildings. Every part is coloured with a soft
 * vertical gradient and merged into ONE geometry per model (one draw call per building).
 *
 * Local frame: anchor hex centre at the origin, ground at y = 0, front of the building
 * facing +Z (the pointed corner of a pointy-top hex).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HEX_RADIUS, createRng } from '@cityverse/shared';

export type Paint = string | [bottom: string, top: string];

export interface Xf {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

const tmpColor = new THREE.Color();
const tmpColor2 = new THREE.Color();

/** Darken / lighten a hex colour (k < 1 darker). */
export function shade(hex: string, k: number): string {
  tmpColor.set(hex);
  tmpColor.r = Math.min(1, tmpColor.r * k);
  tmpColor.g = Math.min(1, tmpColor.g * k);
  tmpColor.b = Math.min(1, tmpColor.b * k);
  return `#${tmpColor.getHexString()}`;
}

function paint(geo: THREE.BufferGeometry, p: Paint): void {
  const [bottom, top] = typeof p === 'string' ? [shade(p, 0.86), p] : p;
  geo.computeBoundingBox();
  const lo = geo.boundingBox!.min.y;
  const hi = geo.boundingBox!.max.y;
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  tmpColor.set(bottom);
  tmpColor2.set(top);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const t = hi > lo ? (pos.getY(i) - lo) / (hi - lo) : 1;
    c.copy(tmpColor).lerp(tmpColor2, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export class ModelBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  add(geometry: THREE.BufferGeometry, color: Paint, xf: Xf = {}): this {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    if (geo !== geometry) geometry.dispose();
    geo.deleteAttribute('uv');
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    // 'YXZ': tilt/roll in the part's own frame first, then yaw (roof rows, awnings, logs).
    this.e.set(xf.rx ?? 0, xf.ry ?? 0, xf.rz ?? 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.v.set(xf.x ?? 0, xf.y ?? 0, xf.z ?? 0);
    this.s.set(xf.sx ?? 1, xf.sy ?? 1, xf.sz ?? 1);
    this.m.compose(this.v, this.q, this.s);
    geo.applyMatrix4(this.m);
    paint(geo, color);
    this.parts.push(geo);
    return this;
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    if (!merged) throw new Error('ModelBuilder: nothing to merge');
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

export const box = (w: number, h: number, d: number, radius = 0.1): THREE.BufferGeometry =>
  new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2.2, h / 2.2, d / 2.2));
export const cyl = (rTop: number, rBot: number, h: number, seg = 10): THREE.BufferGeometry =>
  new THREE.CylinderGeometry(rTop, rBot, h, seg);
export const ball = (r: number, detail = 1): THREE.BufferGeometry => new THREE.IcosahedronGeometry(r, detail);
export const cone = (r: number, h: number, seg = 8): THREE.BufferGeometry => new THREE.ConeGeometry(r, h, seg);

/** Triangular prism (gable infill) spanning x ∈ [−len/2, len/2], base width `w` on y = 0. */
export function gablePrism(len: number, w: number, h: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  geo.rotateY(Math.PI / 2);
  geo.translate(-len / 2, 0, 0);
  return geo;
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────────

const HEX_PLATE_DEPTH = 2.2;

/** Hex-shaped garden plot that also acts as a foundation skirt into uneven terrain. */
export function hexPlate(b: ModelBuilder, cx: number, cz: number, top: string, side = '#9a7450', scale = 0.985): void {
  const r = HEX_RADIUS * scale;
  // CylinderGeometry with 6 segments has a vertex on +Z → pointy-top like our hex grid.
  b.add(cyl(r, r, HEX_PLATE_DEPTH, 6), [side, shade(side, 1.08)], { x: cx, y: 0.12 - HEX_PLATE_DEPTH / 2 - 0.12, z: cz });
  b.add(cyl(r * 0.995, r * 0.995, 0.24, 6), [shade(top, 0.9), top], { x: cx, y: 0.0, z: cz });
}

export interface RoofSpec {
  /** Span along X (ridge direction) */
  width: number;
  /** Depth along Z (eaves to eaves, before overhang) */
  depth: number;
  height: number;
  overhang: number;
  color: string;
  /** Number of tile/shingle rows per side */
  rows: number;
  /** Alternate row shading strength (0 = flat) */
  stripe?: number;
  /** Colour of the gable triangles */
  gable: string;
}

/** Big chibi gable roof with visible tile/shingle rows, ridge cap and filled gables. */
export function gableRoof(b: ModelBuilder, spec: RoofSpec, cx: number, baseY: number, cz: number, ry = 0): void {
  const { width, depth, height, overhang, color, rows } = spec;
  const hd = depth / 2 + overhang;
  const slope = Math.atan2(height + overhang * (height / (depth / 2)), hd);
  const len = hd / Math.cos(slope);
  const rowLen = len / rows;
  const thick = 0.22;
  const span = width + overhang * 2;
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const place = (lx: number, lz: number): { x: number; z: number } => ({
    x: cx + lx * cos + lz * sin,
    z: cz - lx * sin + lz * cos,
  });
  const ridgeY = baseY + height;

  for (const side of [1, -1]) {
    for (let i = 0; i < rows; i += 1) {
      const u = (i + 0.5) / rows; // 0 at ridge → 1 at eave
      const along = u * len;
      const lz = side * along * Math.cos(slope);
      const y = ridgeY - along * Math.sin(slope) + i * 0.035;
      const k = 1 - (spec.stripe ?? 0.08) * (i % 2) - i * 0.01;
      const p = place(0, lz);
      b.add(box(span, thick, rowLen * 1.18, 0.08), [shade(color, k * 0.82), shade(color, k)], {
        x: p.x,
        y,
        z: p.z,
        rx: side * slope,
        ry,
      });
    }
  }
  const ridge = place(0, 0);
  b.add(box(span + 0.1, 0.34, 0.5, 0.15), shade(color, 0.75), { x: ridge.x, y: ridgeY + 0.12, z: ridge.z, ry });
  // Gable infill (under the roof, from wall top to ridge).
  b.add(gablePrism(width - 0.02, depth - 0.02, height * 0.96), spec.gable, { x: ridge.x, y: baseY, z: ridge.z, ry });
}

export type Face = 'front' | 'back' | 'left' | 'right';

/** Transform for a feature on a wall face of a box body centred at (cx, cz). */
export function onFace(face: Face, cx: number, cz: number, w: number, d: number, u: number, y: number, out = 0.06): Xf {
  switch (face) {
    case 'front':
      return { x: cx + u, y, z: cz + d / 2 + out, ry: 0 };
    case 'back':
      return { x: cx - u, y, z: cz - d / 2 - out, ry: Math.PI };
    case 'right':
      return { x: cx + w / 2 + out, y, z: cz - u, ry: Math.PI / 2 };
    case 'left':
      return { x: cx - w / 2 - out, y, z: cz + u, ry: -Math.PI / 2 };
  }
}

export interface WindowStyle {
  frame: string;
  glass?: string;
  shutters?: string;
  flowerBox?: boolean;
  arched?: boolean;
}

/** Big friendly window: frame, glass, cross mullion, optional shutters and flower box. */
export function windowAt(b: ModelBuilder, xf: Xf, w: number, h: number, style: WindowStyle): void {
  const ry = xf.ry ?? 0;
  const off = (dx: number, dy: number, dz: number): Xf => ({
    x: (xf.x ?? 0) + dx * Math.cos(ry) + dz * Math.sin(ry),
    y: (xf.y ?? 0) + dy,
    z: (xf.z ?? 0) - dx * Math.sin(ry) + dz * Math.cos(ry),
    ry,
  });
  b.add(box(w + 0.24, h + 0.24, 0.14, 0.06), style.frame, off(0, 0, 0));
  b.add(box(w, h, 0.1, 0.03), [style.glass ?? '#8fd3f0', '#e6f8ff'], off(0, 0, 0.04));
  b.add(box(0.09, h, 0.12, 0.02), style.frame, off(0, 0, 0.07));
  b.add(box(w, 0.09, 0.12, 0.02), style.frame, off(0, 0, 0.07));
  if (style.arched) b.add(cyl(w / 2 + 0.12, w / 2 + 0.12, 0.14, 12), style.frame, { ...off(0, h / 2, 0), rx: Math.PI / 2 });
  if (style.shutters) {
    for (const s of [-1, 1]) b.add(box(w * 0.42, h + 0.1, 0.08, 0.03), style.shutters, off(s * (w / 2 + w * 0.26), 0, 0.02));
  }
  if (style.flowerBox) {
    b.add(box(w + 0.3, 0.24, 0.34, 0.06), '#a5683f', off(0, -h / 2 - 0.2, 0.18));
    const rng = createRng(Math.round(w * 100 + h * 10));
    for (let i = 0; i < 4; i += 1) {
      const fx = -w / 2 + (i + 0.5) * (w / 4);
      b.add(ball(0.13, 0), ['#ff7aa2', '#ffd1e0'], off(fx, -h / 2 - 0.02, 0.2 + rng() * 0.05));
    }
  }
}

export function doorAt(b: ModelBuilder, xf: Xf, w: number, h: number, wood: string, frame: string, awning?: string): void {
  const ry = xf.ry ?? 0;
  const off = (dx: number, dy: number, dz: number): Xf => ({
    x: (xf.x ?? 0) + dx * Math.cos(ry) + dz * Math.sin(ry),
    y: (xf.y ?? 0) + dy,
    z: (xf.z ?? 0) - dx * Math.sin(ry) + dz * Math.cos(ry),
    ry,
  });
  b.add(box(w + 0.26, h + 0.16, 0.14, 0.05), frame, off(0, 0.08, 0));
  b.add(box(w, h, 0.12, 0.05), [shade(wood, 0.8), wood], off(0, 0, 0.05));
  b.add(ball(0.08, 0), '#f2c14e', off(w * 0.3, -0.05, 0.14));
  b.add(box(w + 0.6, 0.18, 0.7, 0.06), '#b9ad9b', off(0, -h / 2 - 0.06, 0.4));
  if (awning) b.add(box(w + 0.7, 0.14, 0.8, 0.06), awning, { ...off(0, h / 2 + 0.38, 0.38), rx: 0.35 });
}

/** Points along the hex outline (scale relative to the hex), clockwise from the top corner. */
export function hexOutline(cx: number, cz: number, scale: number): { x: number; z: number }[] {
  const r = HEX_RADIUS * scale;
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
  });
}

export type FenceStyle = 'rustic' | 'picket' | 'hedge';

/**
 * Fence following the hex outline, with a gate gap at the front (+Z) corner.
 * `skipEdges` lets multi-hex buildings drop edges shared with their other hexes.
 */
export function hexFence(b: ModelBuilder, cx: number, cz: number, style: FenceStyle, scale = 0.9, skipEdges: number[] = []): void {
  const pts = hexOutline(cx, cz, scale);
  const gate = pts[3];
  const gateGap = 1.4;
  for (let e = 0; e < 6; e += 1) {
    if (skipEdges.includes(e)) continue;
    const a = pts[e];
    const c = pts[(e + 1) % 6];
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    const ry = Math.atan2(-(c.z - a.z), c.x - a.x);
    const segs = style === 'hedge' ? 5 : 4;
    for (let i = 0; i <= segs; i += 1) {
      const t = i / segs;
      const x = a.x + (c.x - a.x) * t;
      const z = a.z + (c.z - a.z) * t;
      if (Math.hypot(x - gate.x, z - gate.z) < gateGap) continue;
      if (style === 'hedge') {
        b.add(ball(0.55, 1), ['#3f8f3c', '#7ccd5a'], { x, y: 0.42, z, sy: 0.85 });
      } else if (style === 'picket') {
        b.add(box(0.16, 0.95, 0.12, 0.04), ['#e8e4da', '#ffffff'], { x, y: 0.5, z, ry });
        b.add(cone(0.11, 0.18, 4), '#ffffff', { x, y: 1.06, z, ry: ry + Math.PI / 4 });
      } else {
        b.add(cyl(0.11, 0.13, 0.95, 6), ['#7a5232', '#9c6b43'], { x, y: 0.47, z });
      }
    }
    if (style === 'hedge') continue;
    // Rails, split around the gate.
    const pieces: [number, number][] = [];
    const ga = Math.hypot(a.x - gate.x, a.z - gate.z) < 0.01;
    const gc = Math.hypot(c.x - gate.x, c.z - gate.z) < 0.01;
    pieces.push([ga ? gateGap / len : 0, gc ? 1 - gateGap / len : 1]);
    for (const [t0, t1] of pieces) {
      if (t1 <= t0) continue;
      const mx = a.x + (c.x - a.x) * ((t0 + t1) / 2);
      const mz = a.z + (c.z - a.z) * ((t0 + t1) / 2);
      const l = len * (t1 - t0);
      const railColor: Paint = style === 'picket' ? ['#eeeae0', '#ffffff'] : ['#8a5d38', '#a87648'];
      for (const y of style === 'picket' ? [0.55] : [0.35, 0.72]) {
        b.add(box(l, 0.1, 0.08, 0.03), railColor, { x: mx, y, z: mz, ry });
      }
    }
  }
}

export function bush(b: ModelBuilder, x: number, z: number, s = 1, colors: [string, string] = ['#3d8a36', '#86cc5c']): void {
  b.add(ball(0.55 * s, 1), colors, { x, y: 0.4 * s, z, sy: 0.85 });
  b.add(ball(0.4 * s, 1), colors, { x: x + 0.45 * s, y: 0.32 * s, z: z + 0.15 * s, sy: 0.85 });
}

export function flowerPatch(b: ModelBuilder, x: number, z: number, seed: number, palette = ['#ff8fb1', '#ffd45c', '#ffffff', '#b48cff']): void {
  const rng = createRng(seed);
  for (let i = 0; i < 6; i += 1) {
    const fx = x + (rng() - 0.5) * 1.1;
    const fz = z + (rng() - 0.5) * 1.1;
    b.add(cyl(0.03, 0.03, 0.35, 4), '#4f9a34', { x: fx, y: 0.3, z: fz });
    b.add(ball(0.13, 0), [palette[i % palette.length], '#fffaf0'], { x: fx, y: 0.5, z: fz, sy: 0.7 });
  }
}

export function flowerPot(b: ModelBuilder, x: number, z: number, plant: 'flower' | 'tree' = 'flower'): void {
  b.add(cyl(0.34, 0.26, 0.5, 10), ['#b4532f', '#d9784c'], { x, y: 0.37, z });
  if (plant === 'tree') {
    b.add(cyl(0.06, 0.08, 0.7, 6), '#7a5232', { x, y: 0.9, z });
    b.add(ball(0.5, 1), ['#3f8f3c', '#8fd468'], { x, y: 1.45, z });
  } else {
    b.add(ball(0.32, 1), ['#3f8f3c', '#7ccd5a'], { x, y: 0.75, z, sy: 0.8 });
    for (const [dx, dz, c] of [
      [0.12, 0.1, '#ff6f91'],
      [-0.14, 0.05, '#ffd45c'],
      [0.02, -0.15, '#ffffff'],
    ] as const) {
      b.add(ball(0.1, 0), c, { x: x + dx, y: 0.98, z: z + dz });
    }
  }
}

export function lampPost(b: ModelBuilder, x: number, z: number): void {
  b.add(cyl(0.08, 0.12, 2.2, 8), ['#3c3f46', '#5a5f69'], { x, y: 1.2, z });
  b.add(box(0.5, 0.55, 0.5, 0.1), ['#ffd977', '#fff3c4'], { x, y: 2.5, z });
  b.add(cone(0.42, 0.35, 4), '#3c3f46', { x, y: 2.95, z, ry: Math.PI / 4 });
}

export function steppingStones(b: ModelBuilder, from: { x: number; z: number }, to: { x: number; z: number }, n: number, color = '#cfc4b2'): void {
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    b.add(cyl(0.42, 0.46, 0.14, 8), color, { x: from.x + (to.x - from.x) * t, y: 0.14, z: from.z + (to.z - from.z) * t, sx: 1.15 });
  }
}

export function crate(b: ModelBuilder, x: number, y: number, z: number, s = 1, ry = 0): void {
  b.add(box(0.9 * s, 0.9 * s, 0.9 * s, 0.06), ['#a8743f', '#d39a5b'], { x, y: y + 0.45 * s, z, ry });
  b.add(box(0.95 * s, 0.12 * s, 0.95 * s, 0.03), '#7a5232', { x, y: y + 0.45 * s, z, ry });
}

export function logPile(b: ModelBuilder, x: number, z: number, ry = 0): void {
  const rows = [3, 2, 1];
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i += 1) {
      const off = (i - (count - 1) / 2) * 0.5;
      b.add(cyl(0.24, 0.24, 2.2, 8), ['#8a5a32', '#b07a48'], {
        x: x + off * Math.cos(ry),
        y: 0.26 + row * 0.42,
        z: z - off * Math.sin(ry),
        rz: Math.PI / 2,
        ry,
      });
    }
  });
}
