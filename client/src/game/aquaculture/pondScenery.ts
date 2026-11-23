/**
 * Static pond scenery, built in world space on top of the (already carved) terrain:
 *
 *  banks  L1 earth bank: grass tufts, small stones, reeds at the waterline, bushes, lily pads
 *         L2 stone revetment: rounded stones along the waterline
 *         L3 neat embankment: cut-stone blocks + cap, railing and lamps along the rim, flowers
 *  pond   L1 stilted chibi hut + small wooden jetty
 *         L2 longer jetty, inlet sluice (cống) with pipe, floating feeding frame
 *         L3 aerator floats (wheels animated by the renderer), filter tanks, harvest dock,
 *            small management office
 *  cages  bamboo (L1) / wooden (L2) / steel (L3) square cages with nets and walkways
 *
 * Returns one merged geometry plus the animated aerator wheels and bubble emitter points.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WATER_LEVEL, hashSeed } from '@cityverse/shared';
import { ModelBuilder, ball, box, cone, cyl, gableRoof, lampPost, windowAt, type Paint } from '../buildings/modelKit';
import type { HeightSampler } from '../farming/farmGround';
import type { Spot, XZ } from '../farming/farmLayout';
import { CAGE_HALF, type PondLayout } from './pondLayout';

export interface PondScenery {
  solid: THREE.BufferGeometry;
  /** Aerator wheels: centre + heading (renderer spins them) */
  wheels: { x: number; y: number; z: number; ry: number }[];
  /** Where bubbles rise */
  bubbles: XZ[];
  topY: number;
}

const r01 = (seed: number): number => (hashSeed(String(seed)) % 10000) / 10000;

export function buildPondScenery(L: PondLayout, height: HeightSampler): PondScenery {
  const b = new ModelBuilder();
  const parts: THREE.BufferGeometry[] = [];
  const wheels: PondScenery['wheels'] = [];
  const bubbles: XZ[] = [];
  const place = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry: number, s = 1): void => {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s)));
    parts.push(geo);
  };
  const surf = L.surface;

  if (L.dug) {
    banks(b, L, height, parts);
    // Hut on stilts over the shallow water near the shore.
    place(stiltHut(L.level, Math.max(1.2, surf + 1.1 - height(L.hut.x, L.hut.z))), L.hut.x, height(L.hut.x, L.hut.z), L.hut.z, L.hut.ry, 1.15);
    jetty(b, L.jetty.from, L.jetty.to, L.jetty.width, surf + 0.35, height, L.level);
    if (L.sluice) place(sluiceGate(L.level), L.sluice.x, height(L.sluice.x, L.sluice.z) - 0.4, L.sluice.z, L.sluice.ry, 1.1);
    if (L.level >= 2) feedingFrame(b, L.feeder, surf, L.level);
    for (const a of L.aerators) {
      const ry = Math.atan2(a.x - L.frame.centroid.x, a.z - L.frame.centroid.z) + Math.PI / 2;
      aeratorFloat(b, a, surf, ry);
      wheels.push({ x: a.x, y: surf + 0.35, z: a.z, ry });
      bubbles.push(a);
    }
    if (L.filter) place(filterUnit(), L.filter.x, height(L.filter.x, L.filter.z), L.filter.z, L.filter.ry, 1.1);
    if (L.harvest) harvestDock(b, L.harvest, surf, height);
    if (L.office) place(office(), L.office.x, height(L.office.x, L.office.z), L.office.z, L.office.ry, 1.1);
  } else {
    cages(b, L);
    place(stiltHut(L.level, 1.3), L.hut.x, WATER_LEVEL - 0.6, L.hut.z, L.hut.ry, 1.1);
    if (L.level >= 3) {
      const c = L.cages[0];
      aeratorFloat(b, { x: c.x + CAGE_HALF + 0.8, z: c.z }, WATER_LEVEL, 0);
      wheels.push({ x: c.x + CAGE_HALF + 0.8, y: WATER_LEVEL + 0.35, z: c.z, ry: 0 });
      bubbles.push({ x: c.x, z: c.z });
    }
  }
  parts.push(b.build());
  const solid = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  solid.computeBoundingSphere();
  return { solid, wheels, bubbles, topY: surf + 6 };
}

/** Aerator paddle wheel (spun around its local X axis by the renderer). */
export function buildAeratorWheel(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(cyl(0.08, 0.08, 1.6, 6), '#9aa3ad', { rz: Math.PI / 2 });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    b.add(box(1.2, 0.08, 0.36, 0.02), ['#f2c14e', '#ffe08a'], { y: Math.sin(a) * 0.38, z: Math.cos(a) * 0.38, rx: -a });
  }
  return b.build();
}

// ─────────────────────────────────────────────────────────────────────────────
// Banks
// ─────────────────────────────────────────────────────────────────────────────
function banks(b: ModelBuilder, L: PondLayout, height: HeightSampler, parts: THREE.BufferGeometry[]): void {
  L.shore.forEach((s, i) => {
    const seed = Math.round(s.x * 13 + s.z * 7);
    // Rim point: back toward the land from the waterline.
    const rim = { x: s.x - s.nx * 1.0, z: s.z - s.nz * 1.0 };
    if (L.level === 1) {
      if (i % 2 === 0) b.add(cone(0.18, 0.45, 5), ['#5d9a3a', '#9bd062'], { x: rim.x, y: height(rim.x, rim.z) + 0.2, z: rim.z, ry: seed });
      if (i % 3 === 0) b.add(ball(0.22, 0), ['#8a8075', '#b3a999'], { x: s.x - s.nx * 0.4, y: height(s.x - s.nx * 0.4, s.z - s.nz * 0.4) + 0.05, z: s.z - s.nz * 0.4, sy: 0.55 });
      // Reeds just inside the waterline
      if (i % 4 === 1) {
        const p = { x: s.x + s.nx * 0.5, z: s.z + s.nz * 0.5 };
        for (let k = 0; k < 3; k += 1) b.add(cyl(0.025, 0.03, 1.1, 4), '#6f8f3a', { x: p.x + (k - 1) * 0.12, y: L.surface + 0.35, z: p.z + (k % 2) * 0.1, rz: (k - 1) * 0.15 });
        b.add(cyl(0.05, 0.05, 0.25, 6), '#7a5232', { x: p.x, y: L.surface + 0.95, z: p.z }); // cattail
      }
    } else if (L.level === 2) {
      // Stone revetment along the waterline
      const sz = 0.38 + r01(seed) * 0.18;
      b.add(ball(sz, 1), ['#7d7b76', '#a9a59d'], { x: s.x, y: L.surface + 0.05, z: s.z, sy: 0.7, ry: seed });
      if (i % 2 === 0) b.add(ball(sz * 0.8, 0), ['#8d8a83', '#b8b3a9'], { x: s.x - s.nx * 0.6, y: height(s.x - s.nx * 0.6, s.z - s.nz * 0.6) + 0.1, z: s.z - s.nz * 0.6, sy: 0.6 });
      if (i % 3 === 0) b.add(cone(0.16, 0.4, 5), ['#5d9a3a', '#9bd062'], { x: rim.x, y: height(rim.x, rim.z) + 0.18, z: rim.z });
    } else {
      // Cut-stone embankment with a cap; railing posts along the rim.
      const ry = Math.atan2(s.nx, s.nz);
      b.add(box(1.25, 0.9, 0.5, 0.05), ['#9f998f', '#cfc9bd'], { x: s.x - s.nx * 0.15, y: L.surface - 0.1, z: s.z - s.nz * 0.15, ry });
      b.add(box(1.3, 0.12, 0.62, 0.03), '#e8e2d6', { x: s.x - s.nx * 0.2, y: L.surface + 0.4, z: s.z - s.nz * 0.2, ry });
      if (i % 2 === 0) {
        b.add(cyl(0.05, 0.05, 0.8, 5), '#6a5a48', { x: rim.x, y: height(rim.x, rim.z) + 0.4, z: rim.z });
      }
      if (i % 9 === 0) {
        const lb = new ModelBuilder();
        lampPost(lb, rim.x - s.nx * 0.4, rim.z - s.nz * 0.4);
        const lamp = lb.build();
        lamp.translate(0, height(rim.x, rim.z), 0);
        parts.push(lamp);
      }
      if (i % 5 === 2) b.add(ball(0.18, 0), ['#ff8fb1', '#ffd6e2'], { x: rim.x - s.nx * 0.4, y: height(rim.x, rim.z) + 0.2, z: rim.z - s.nz * 0.4 });
    }
    // Bushes now and then on every level
    if (i % 7 === 3) {
      const p = { x: s.x - s.nx * 1.6, z: s.z - s.nz * 1.6 };
      b.add(ball(0.5, 1), ['#3d8a36', '#86cc5c'], { x: p.x, y: height(p.x, p.z) + 0.35, z: p.z, sy: 0.8 });
    }
  });
  // Railings between posts (L3)
  if (L.level >= 3) {
    for (let i = 0; i + 2 < L.shore.length; i += 2) {
      const a = L.shore[i];
      const c = L.shore[i + 2];
      if (a.edge !== c.edge) continue;
      const pa = { x: a.x - a.nx, z: a.z - a.nz };
      const pc = { x: c.x - c.nx, z: c.z - c.nz };
      const len = Math.hypot(pc.x - pa.x, pc.z - pa.z);
      const y = (L.surface + 0.4 + 0.75);
      b.add(box(len, 0.06, 0.06, 0.02), '#7a5232', { x: (pa.x + pc.x) / 2, y, z: (pa.z + pc.z) / 2, ry: Math.atan2(-(pc.z - pa.z), pc.x - pa.x) });
    }
  }
  // Lily pads on L1 / L2 ponds
  if (L.level <= 2) {
    L.swimPoints.forEach((p, i) => {
      if (i % 9 !== 0) return;
      b.add(cyl(0.45, 0.45, 0.03, 10), '#5fa64a', { x: p.x, y: L.surface + 0.02, z: p.z });
      if (i % 18 === 0) b.add(ball(0.12, 0), '#ff9fc7', { x: p.x + 0.15, y: L.surface + 0.1, z: p.z });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Structures (local frame, facing +Z)
// ─────────────────────────────────────────────────────────────────────────────
function stiltHut(level: number, stilt: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const deck = stilt;
  for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]] as const) b.add(cyl(0.1, 0.12, deck, 6), '#6d4a2c', { x, y: deck / 2, z });
  b.add(box(2.8, 0.14, 2.8, 0.04), ['#8a5a32', '#b07a48'], { y: deck });
  const wall: Paint = level >= 3 ? ['#e8dcc4', '#fff6e2'] : ['#a8743f', '#d39a5b'];
  b.add(box(2.1, 1.4, 1.8, 0.08), wall, { y: deck + 0.78, z: -0.2 });
  b.add(box(0.6, 1.0, 0.06, 0.02), '#5b3a22', { y: deck + 0.6, z: 0.72 });
  if (level >= 2) windowAt(b, { x: 1.06, y: deck + 0.95, z: -0.2, ry: Math.PI / 2 }, 0.5, 0.4, { frame: '#f4ede0', shutters: '#3f7fb0' });
  const roof = level === 1 ? '#d6b45e' : level === 2 ? '#c96a3a' : '#3f7fb0';
  gableRoof(b, { width: 2.4, depth: 2.4, height: 0.95, overhang: 0.35, color: roof, rows: 3, gable: wall[0] }, 0, deck + 1.48, -0.2);
  // Railing on the front deck + a fishing rod
  for (const x of [-1.3, -0.4, 0.4, 1.3]) b.add(cyl(0.04, 0.04, 0.6, 4), '#7a5232', { x, y: deck + 0.35, z: 1.3 });
  b.add(box(2.7, 0.06, 0.06, 0.02), '#7a5232', { y: deck + 0.62, z: 1.3 });
  b.add(cyl(0.02, 0.02, 2.2, 4), '#3b2a1c', { x: 1.2, y: deck + 1.0, z: 1.6, rx: 0.9 });
  return b.build();
}

function jetty(b: ModelBuilder, from: XZ, to: XZ, width: number, y: number, height: HeightSampler, level: number): void {
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  const ry = Math.atan2(to.x - from.x, to.z - from.z);
  const n = Math.max(3, Math.round(len / 0.45));
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    b.add(box(width, 0.08, len / n - 0.05, 0.02), i % 2 ? '#a8743f' : '#b9834d', { x, y, z, ry });
  }
  const posts = Math.max(2, Math.round(len / 2));
  for (let i = 0; i <= posts; i += 1) {
    const t = i / posts;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const g = height(x, z);
    for (const s of [-1, 1]) {
      const px = x + Math.cos(ry) * s * (width / 2);
      const pz = z - Math.sin(ry) * s * (width / 2);
      const h = y - g + (level >= 2 ? 0.7 : 0.1);
      b.add(cyl(0.07, 0.08, h, 6), '#6d4a2c', { x: px, y: g + h / 2, z: pz });
    }
  }
}

function sluiceGate(level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(box(2.2, 1.4, 1.6, 0.1), ['#9f998f', '#cfc9bd'], { y: 0.7 });
  b.add(box(1.0, 0.9, 0.12, 0.03), '#3f5f86', { y: 0.95, z: 0.82 }); // gate
  b.add(cyl(0.4, 0.4, 0.06, 12), '#c94f3a', { y: 1.75, z: 0.82, rx: Math.PI / 2 }); // wheel
  b.add(cyl(0.05, 0.05, 0.6, 5), '#3c3f46', { y: 1.5, z: 0.82 });
  b.add(cyl(0.35, 0.35, 2.4, 10), ['#7f8a96', '#a9b4bf'], { y: 0.45, z: -1.8, rx: Math.PI / 2 }); // inlet pipe to land
  if (level >= 3) b.add(box(0.5, 0.3, 0.5, 0.05), '#2f5f86', { x: 0.9, y: 1.55, z: 0 });
  return b.build();
}

function feedingFrame(b: ModelBuilder, p: XZ, surf: number, level: number): void {
  const r = 1.4;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const a2 = ((i + 1) / 6) * Math.PI * 2;
    const x0 = p.x + Math.cos(a) * r;
    const z0 = p.z + Math.sin(a) * r;
    const x1 = p.x + Math.cos(a2) * r;
    const z1 = p.z + Math.sin(a2) * r;
    b.add(box(Math.hypot(x1 - x0, z1 - z0) + 0.1, 0.16, 0.18, 0.06), level >= 3 ? ['#2f5f86', '#3f7fb0'] : ['#d9603b', '#f0805a'], {
      x: (x0 + x1) / 2,
      y: surf + 0.04,
      z: (z0 + z1) / 2,
      ry: Math.atan2(-(z1 - z0), x1 - x0),
    });
  }
  for (let i = 0; i < 6; i += 1) b.add(ball(0.06, 0), '#c9a43c', { x: p.x + Math.cos(i * 1.7) * 0.6, y: surf + 0.03, z: p.z + Math.sin(i * 1.7) * 0.6 });
}

function aeratorFloat(b: ModelBuilder, p: XZ, surf: number, ry: number): void {
  for (const s of [-1, 1]) b.add(cyl(0.22, 0.22, 1.5, 8), ['#e8e4da', '#ffffff'], { x: p.x + Math.cos(ry) * s * 0.0 + Math.sin(ry) * s * 0.75, y: surf + 0.05, z: p.z + Math.cos(ry) * s * 0.75, rx: Math.PI / 2, ry });
  b.add(box(0.5, 0.4, 0.5, 0.08), ['#3f5f86', '#5a7fd0'], { x: p.x, y: surf + 0.6, z: p.z, ry }); // motor
}

function filterUnit(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(box(2.6, 0.2, 1.8, 0.05), '#9f998f', { y: 0.1 });
  for (const x of [-0.7, 0.7]) {
    b.add(cyl(0.55, 0.55, 1.5, 12), ['#5a7fd0', '#8fb3ea'], { x, y: 0.95 });
    b.add(ball(0.56, 1), '#3f5f86', { x, y: 1.7, sy: 0.4 });
  }
  b.add(cyl(0.12, 0.12, 2.6, 6), '#9aa3ad', { y: 0.5, z: 0.9, rz: Math.PI / 2 });
  b.add(box(0.5, 0.6, 0.3, 0.04), '#f2c14e', { x: 1.2, y: 0.5, z: -0.6 }); // control box
  return b.build();
}

function harvestDock(b: ModelBuilder, s: Spot, surf: number, height: HeightSampler): void {
  const fx = Math.sin(s.ry);
  const fz = Math.cos(s.ry);
  const c = { x: s.x, z: s.z };
  b.add(box(3.2, 0.12, 2.6, 0.03), ['#8a5a32', '#b07a48'], { x: c.x, y: surf + 0.4, z: c.z, ry: s.ry });
  for (const [u, v] of [[-1.4, -1.1], [1.4, -1.1], [-1.4, 1.1], [1.4, 1.1]] as const) {
    const x = c.x + Math.cos(s.ry) * u + fx * v;
    const z = c.z - Math.sin(s.ry) * u + fz * v;
    const g = height(x, z);
    b.add(cyl(0.08, 0.08, surf + 0.4 - g, 6), '#6d4a2c', { x, y: (surf + 0.4 + g) / 2, z });
  }
  // Crates, a scale and a net rack
  for (let i = 0; i < 3; i += 1) b.add(box(0.5, 0.4, 0.5, 0.04), ['#c49a5a', '#e2bd7c'], { x: c.x - fx * 0.6 + Math.cos(s.ry) * (i - 1) * 0.6, y: surf + 0.66, z: c.z - fz * 0.6 - Math.sin(s.ry) * (i - 1) * 0.6 });
  b.add(cyl(0.04, 0.04, 1.4, 4), '#7a5232', { x: c.x + fx * 0.9, y: surf + 1.1, z: c.z + fz * 0.9 });
  b.add(box(1.2, 0.8, 0.04, 0.01), '#4a5a5a', { x: c.x + fx * 0.9, y: surf + 1.4, z: c.z + fz * 0.9, ry: s.ry });
}

function office(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(box(3.0, 0.3, 2.6, 0.08), '#9f998f', { y: 0.15 });
  b.add(box(2.6, 1.7, 2.2, 0.1), ['#e8dcc4', '#fff6e2'], { y: 1.15 });
  gableRoof(b, { width: 2.6, depth: 2.2, height: 0.9, overhang: 0.3, color: '#3f7fb0', rows: 3, gable: '#e8dcc4' }, 0, 2.0, 0);
  b.add(box(0.7, 1.2, 0.06, 0.02), '#5b3a22', { y: 0.9, z: 1.12 });
  windowAt(b, { x: 0.85, y: 1.3, z: 1.12, ry: 0 }, 0.6, 0.5, { frame: '#f4ede0', shutters: '#3f7fb0' });
  b.add(box(1.0, 0.3, 0.05, 0.02), '#2f8d7b', { y: 2.2, z: 1.2 }); // sign
  b.add(ball(0.12, 0), '#f2c14e', { x: -1.0, y: 2.5, z: 0 }); // antenna light
  b.add(cyl(0.02, 0.02, 0.8, 4), '#3c3f46', { x: -1.0, y: 2.1, z: 0 });
  return b.build();
}

function cages(b: ModelBuilder, L: PondLayout): void {
  const y = WATER_LEVEL + 0.12;
  const beam: Paint = L.level === 1 ? ['#b9a35a', '#e0cc7a'] : L.level === 2 ? ['#8a5a32', '#b07a48'] : ['#3f5f86', '#5a7fd0'];
  for (const c of L.cages) {
    const h = CAGE_HALF;
    for (const [dx, dz, rot] of [[0, -h, 0], [0, h, 0], [-h, 0, 1], [h, 0, 1]] as const) {
      b.add(box(2 * h + 0.3, 0.22, 0.3, 0.06), beam, { x: c.x + dx, y, z: c.z + dz, ry: rot ? Math.PI / 2 : 0 });
      // Net skirt going down into the water
      b.add(box(2 * h, 1.8, 0.04, 0.01), '#2f3f3a', { x: c.x + dx * 0.98, y: y - 0.95, z: c.z + dz * 0.98, ry: rot ? Math.PI / 2 : 0 });
    }
    for (const [dx, dz] of [[-h, -h], [h, -h], [-h, h], [h, h]] as const) {
      b.add(cyl(0.22, 0.22, 0.5, 8), L.level === 3 ? '#f2c14e' : '#e8e4da', { x: c.x + dx, y, z: c.z + dz }); // floats
      if (L.level >= 2) b.add(cyl(0.05, 0.05, 0.8, 5), beam[0], { x: c.x + dx, y: y + 0.45, z: c.z + dz });
    }
  }
  // Walkways between neighbouring cages
  for (let i = 0; i < L.cages.length; i += 1) {
    for (let j = i + 1; j < L.cages.length; j += 1) {
      const a = L.cages[i];
      const c = L.cages[j];
      const d = Math.hypot(c.x - a.x, c.z - a.z);
      if (d > 10.5) continue;
      const mx = (a.x + c.x) / 2;
      const mz = (a.z + c.z) / 2;
      b.add(box(1.0, 0.08, d - 2 * CAGE_HALF + 0.4, 0.02), '#a8743f', { x: mx, y: y + 0.05, z: mz, ry: Math.atan2(c.x - a.x, c.z - a.z) });
    }
  }
  if (L.level >= 2) feedingFrame(b, L.cages[L.cages.length - 1], WATER_LEVEL, L.level);
}
