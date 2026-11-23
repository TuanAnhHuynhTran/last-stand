/**
 * Static scenery of a livestock farm, draped on the terrain:
 *  L1 wooden barn, wooden rail fence, simple troughs
 *  L2 brick barn with tiled roof, white fence, separate eating / drinking areas, hay, path
 *  L3 complete farm: bigger barn + silo, stone-post fence, breeding pen, waste processing
 *     (compost + biogas dome), lamps
 * Returns one merged solid geometry and one water geometry (troughs, pig wallow).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LivestockFarmTypeCode } from '@cityverse/shared';
import { ModelBuilder, ball, box, cone, cyl, gableRoof, lampPost, shade, windowAt, type Paint } from '../buildings/modelKit';
import {
  FIELD_LIFT,
  drapeHex,
  hash,
  insetEdge,
  placeStructure,
  segmentBox,
  surface,
  waterStrip,
  type HeightSampler,
} from '../farming/farmGround';
import { STRUCTURE_SCALE, type RanchLayout } from './ranchLayout';

export interface RanchScenery {
  solid: THREE.BufferGeometry;
  water: THREE.BufferGeometry | null;
  topY: number;
}

const GROUND: Record<LivestockFarmTypeCode, { base: string; patch: string; patchShare: number }> = {
  chicken_farm: { base: '#9ed468', patch: '#d8bf86', patchShare: 0.45 },
  pig_farm: { base: '#93cc62', patch: '#8f6a48', patchShare: 0.4 },
  cattle_farm: { base: '#8fd062', patch: '#a9dc72', patchShare: 0.3 },
  sheep_farm: { base: '#a2de6c', patch: '#c4e98c', patchShare: 0.3 },
  horse_stable: { base: '#97d164', patch: '#b9e27a', patchShare: 0.25 },
  elephant_camp: { base: '#9acb62', patch: '#c9a46c', patchShare: 0.42 },
};

/** Barn size per farm type (width along X, depth, wall height). */
const BARN: Record<LivestockFarmTypeCode, { w: number; d: number; h: number }> = {
  chicken_farm: { w: 3.4, d: 2.8, h: 1.9 },
  pig_farm: { w: 3.8, d: 3.0, h: 2.0 },
  cattle_farm: { w: 4.6, d: 3.8, h: 2.7 },
  sheep_farm: { w: 4.0, d: 3.2, h: 2.3 },
  horse_stable: { w: 5.2, d: 3.4, h: 2.5 },
  elephant_camp: { w: 5.0, d: 4.2, h: 3.6 },
};

const FEED_COLOR: Record<LivestockFarmTypeCode, [string, string]> = {
  chicken_farm: ['#e0b041', '#ffd86b'],
  pig_farm: ['#e58a3a', '#9fd46a'],
  cattle_farm: ['#c9a43c', '#f3dc84'],
  sheep_farm: ['#c9a43c', '#f3dc84'],
  horse_stable: ['#c9a43c', '#f3dc84'],
  elephant_camp: ['#5f9a3a', '#9fd46a'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Structures (local frame, facing +Z)
// ─────────────────────────────────────────────────────────────────────────────
function barnModel(type: LivestockFarmTypeCode, level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const s = BARN[type];
  const w = s.w * (level >= 3 ? 1.12 : 1);
  const d = s.d;
  const h = s.h * (level >= 2 ? 1.08 : 1);
  b.add(box(w + 0.5, 0.3, d + 0.5, 0.1), ['#8d857a', '#b9b1a5'], { y: 0.12 });
  if (level === 1) {
    // Wooden shed: plank walls, thick thatched roof with a ridge pole.
    b.add(box(w, h, d, 0.14), ['#9a6a3e', '#c0874f'], { y: 0.25 + h / 2 });
    for (let i = 0; i < 5; i += 1) b.add(box(w + 0.04, 0.05, d + 0.04, 0.02), '#7d5432', { y: 0.45 + (i * h) / 5 });
    gableRoof(b, { width: w, depth: d, height: h * 0.62, overhang: 0.5, color: '#d6b45e', rows: 4, gable: '#a8743f' }, 0, 0.25 + h, 0);
    b.add(cyl(0.12, 0.12, d + 1.1, 6), '#8a6a32', { y: 0.25 + h + h * 0.62, rx: Math.PI / 2 });
  } else {
    // Brick barn: red brick, white trim, tiled roof, big barn door with X brace.
    b.add(box(w, h, d, 0.14), ['#b4553b', '#d9744f'], { y: 0.25 + h / 2 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(box(0.22, h + 0.05, 0.22, 0.04), '#f4ede0', { x: (sx * w) / 2, y: 0.25 + h / 2, z: (sz * d) / 2 });
    b.add(box(w + 0.1, 0.16, d + 0.1, 0.05), '#f4ede0', { y: 0.25 + h });
    gableRoof(b, { width: w, depth: d, height: h * 0.6, overhang: 0.45, color: level >= 3 ? '#c94f3a' : '#d9603b', rows: 4, gable: '#b4553b' }, 0, 0.25 + h, 0);
    windowAt(b, { x: w / 2 + 0.06, y: 0.25 + h * 0.62, z: 0, ry: Math.PI / 2 }, 0.7, 0.6, { frame: '#f4ede0', shutters: '#3f7fb0' });
    windowAt(b, { x: -w / 2 - 0.06, y: 0.25 + h * 0.62, z: 0, ry: -Math.PI / 2 }, 0.7, 0.6, { frame: '#f4ede0', shutters: '#3f7fb0' });
  }
  // Door (front, +Z)
  const doorW = Math.min(1.6, w * 0.4);
  const doorH = Math.min(1.9, h * 0.8);
  if (level === 1) {
    b.add(box(doorW, doorH, 0.08, 0.04), '#3b2a1c', { y: 0.25 + doorH / 2, z: d / 2 + 0.03 });
  } else {
    b.add(box(doorW + 0.2, doorH + 0.15, 0.1, 0.04), '#f4ede0', { y: 0.25 + doorH / 2, z: d / 2 + 0.04 });
    b.add(box(doorW, doorH, 0.1, 0.04), ['#a8433a', '#c8564a'], { y: 0.25 + doorH / 2, z: d / 2 + 0.07 });
    const diag = Math.hypot(doorW, doorH);
    for (const s2 of [-1, 1]) b.add(box(0.1, diag * 0.95, 0.06, 0.02), '#f4ede0', { y: 0.25 + doorH / 2, z: d / 2 + 0.12, rz: s2 * Math.atan2(doorW, doorH) });
  }
  if (type === 'chicken_farm') {
    // Ramp + nesting boxes
    b.add(box(0.6, 0.08, 1.3, 0.03), '#a8743f', { x: w * 0.3, y: 0.45, z: d / 2 + 0.55, rx: 0.35 });
    for (let i = 0; i < 3; i += 1) b.add(box(0.5, 0.45, 0.4, 0.06), ['#c49a5a', '#e2bd7c'], { x: -w / 2 + 0.5 + i * 0.6, y: 0.5, z: -d / 2 - 0.25 });
  }
  if (type === 'horse_stable') {
    // Row of stall half-doors along the front, a hay rack above each, a big overhanging roof.
    for (let i = 0; i < 3; i += 1) {
      const x = -w / 2 + w * (0.2 + i * 0.3);
      b.add(box(0.85, 0.85, 0.08, 0.04), level >= 2 ? ['#a8433a', '#c8564a'] : ['#7d5432', '#a87648'], { x, y: 0.7, z: d / 2 + 0.05 });
      b.add(box(0.9, 0.06, 0.1, 0.02), '#f4ede0', { x, y: 1.14, z: d / 2 + 0.07 });
      b.add(box(0.6, 0.22, 0.25, 0.05), ['#c9a43c', '#f3dc84'], { x, y: 1.6, z: d / 2 + 0.2 });
    }
    b.add(box(w + 1.2, 0.08, 1.0, 0.03), level >= 2 ? '#c94f3a' : '#d6b45e', { y: 0.25 + h * 0.98, z: d / 2 + 0.5, rx: 0.25 }); // porch roof
    for (const sx of [-1, 1]) b.add(cyl(0.07, 0.07, h * 0.95, 6), '#7a5232', { x: (sx * (w + 1)) / 2, y: 0.25 + h * 0.48, z: d / 2 + 0.95 });
    if (level >= 3) {
      // Big stable complex: second wing at the back and a cupola with a horse weathervane.
      b.add(box(w * 0.8, h * 0.8, d * 0.6, 0.12), ['#b4553b', '#d9744f'], { y: 0.25 + h * 0.4, z: -d * 0.72 });
      b.add(box(0.9, 0.7, 0.9, 0.08), '#f4ede0', { y: 0.25 + h + h * 0.6 + 0.3 });
      b.add(cone(0.7, 0.6, 4), '#c94f3a', { y: 0.25 + h + h * 0.6 + 0.95, ry: Math.PI / 4 });
      b.add(box(0.5, 0.28, 0.06, 0.02), '#3c3f46', { y: 0.25 + h + h * 0.6 + 1.5 });
    }
  }
  if (type === 'elephant_camp') {
    // Tall open shelter posts / stone pillars (elephants need headroom).
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(cyl(0.2, 0.24, h + 0.6, 8), level >= 2 ? ['#9f998f', '#cfc9bd'] : ['#7a5232', '#a87648'], { x: (sx * w) / 2, y: 0.25 + (h + 0.6) / 2, z: (sz * d) / 2 });
    b.add(box(w * 0.9, 0.3, 0.12, 0.04), '#7a5232', { y: 1.2, z: d / 2 + 0.1 }); // low gate beam
  }
  if (level >= 3 && type !== 'horse_stable' && type !== 'elephant_camp') {
    // Silo + weathervane
    b.add(cyl(0.85, 0.9, h * 1.7, 14), ['#c9c3b8', '#f1ece2'], { x: -w / 2 - 1.1, y: 0.25 + (h * 1.7) / 2, z: -d * 0.15 });
    b.add(ball(0.88, 1), ['#3f7fb0', '#6fb2e8'], { x: -w / 2 - 1.1, y: 0.25 + h * 1.7, z: -d * 0.15, sy: 0.6 });
    for (let i = 0; i < 3; i += 1) b.add(cyl(0.9, 0.9, 0.08, 14), '#9d978c', { x: -w / 2 - 1.1, y: 0.6 + i * h * 0.5, z: -d * 0.15 });
    b.add(cyl(0.03, 0.03, 0.9, 4), '#3c3f46', { y: 0.25 + h * 1.6 + 0.4 });
    b.add(cone(0.12, 0.5, 4), '#f2c14e', { y: 0.25 + h * 1.6 + 0.85, rz: Math.PI / 2 });
  }
  return b.build();
}

function troughModel(type: LivestockFarmTypeCode, level: number, water: boolean): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const len = type === 'chicken_farm' ? 1.5 : 2.0;
  const wall: Paint = level >= 2 ? ['#9f998f', '#cfc9bd'] : ['#8a5a32', '#b07a48'];
  b.add(box(len, 0.45, 0.75, 0.1), wall, { y: 0.32 });
  for (const s of [-1, 1]) b.add(box(0.12, 0.25, 0.12, 0.03), shade(wall[0], 0.85), { x: (s * len) / 2.4, y: 0.1 });
  if (!water) {
    b.add(box(len - 0.18, 0.16, 0.55, 0.06), FEED_COLOR[type], { y: 0.5 });
    for (let i = 0; i < 6; i += 1) b.add(ball(0.09, 0), FEED_COLOR[type][1], { x: -len / 2 + 0.25 + i * (len - 0.5) / 5, y: 0.6, z: (i % 2 ? 0.1 : -0.1) });
    if (level >= 2) {
      // Little roof over the feeder
      for (const s of [-1, 1]) b.add(cyl(0.05, 0.05, 1.3, 5), '#7a5232', { x: (s * len) / 2, y: 0.85, z: 0 });
      b.add(box(len + 0.4, 0.1, 1.1, 0.04), level >= 3 ? '#c94f3a' : '#d9603b', { y: 1.5, rx: 0.12 });
    }
  }
  return b.build();
}

/** Caretaker's spot: wooden stand, bucket, pitchfork rack and a little sign (every level). */
function caretakerStand(level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(box(1.5, 0.14, 1.2, 0.04), level >= 2 ? ['#b9b1a5', '#d8d0c2'] : ['#8a5a32', '#b07a48'], { y: 0.07 });
  b.add(cyl(0.22, 0.18, 0.36, 10), ['#7f8a96', '#a9b4bf'], { x: 0.45, y: 0.32, z: 0.3 }); // bucket
  b.add(cyl(0.2, 0.2, 0.04, 10), '#6fb2e8', { x: 0.45, y: 0.48, z: 0.3 });
  b.add(box(0.9, 0.08, 0.08, 0.02), '#7a5232', { x: -0.3, y: 1.05, z: -0.45 }); // tool rack
  for (const s of [-1, 1]) b.add(cyl(0.04, 0.04, 1.1, 4), '#7a5232', { x: -0.3 + s * 0.42, y: 0.55, z: -0.45 });
  b.add(cyl(0.025, 0.025, 1.3, 4), '#a8743f', { x: -0.45, y: 0.8, z: -0.38, rz: 0.15 });
  b.add(box(0.28, 0.2, 0.04, 0.01), '#c9c3b8', { x: -0.45, y: 1.48, z: -0.38 }); // fork head
  b.add(box(0.55, 0.38, 0.05, 0.02), '#f4ede0', { x: 0.55, y: 0.95, z: -0.5 }); // sign
  b.add(cyl(0.03, 0.03, 0.8, 4), '#7a5232', { x: 0.55, y: 0.45, z: -0.52 });
  return b.build();
}

/** Level 2+: feed storage shed with sacks and a feed bin. */
function storageShed(type: LivestockFarmTypeCode, level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const wall: Paint = level >= 3 ? ['#9f998f', '#cfc9bd'] : ['#b4553b', '#d9744f'];
  b.add(box(2.0, 0.2, 1.7, 0.06), ['#8d857a', '#b9b1a5'], { y: 0.1 });
  b.add(box(1.8, 1.35, 1.5, 0.1), wall, { y: 0.2 + 0.675 });
  gableRoof(b, { width: 1.8, depth: 1.5, height: 0.7, overhang: 0.25, color: level >= 3 ? '#c94f3a' : '#d9603b', rows: 2, gable: wall[0] }, 0, 1.55, 0);
  b.add(box(0.7, 0.95, 0.06, 0.03), '#7a5232', { y: 0.68, z: 0.77 }); // door
  // Sacks in front
  for (const [x, z] of [[-0.6, 1.1], [-0.25, 1.2], [0.6, 1.05]] as const) {
    b.add(ball(0.26, 1), ['#d9c79a', '#f1e4bd'], { x, y: 0.33, z, sy: 1.2 });
    b.add(cyl(0.08, 0.1, 0.12, 6), '#b89a5e', { x, y: 0.62, z });
  }
  b.add(cyl(0.32, 0.32, 0.6, 10), ['#7f8a96', '#a9b4bf'], { x: 1.2, y: 0.4, z: 0.4 }); // feed bin
  b.add(cyl(0.3, 0.3, 0.06, 10), FEED_COLOR[type][1], { x: 1.2, y: 0.72, z: 0.4 });
  return b.build();
}

/** Level 3: water tower (tank on stilts) — the pipe to the trough is added in world space. */
function waterTower(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]] as const) {
    b.add(cyl(0.08, 0.1, 2.6, 6), '#7a5232', { x, y: 1.3, z, rz: x * 0.05, rx: -z * 0.05 });
  }
  b.add(box(1.4, 0.1, 1.4, 0.03), '#8a5a32', { y: 2.6 });
  b.add(cyl(0.85, 0.85, 1.2, 14), ['#3f7fb0', '#6fb2e8'], { y: 3.25 });
  for (const y of [2.8, 3.7]) b.add(cyl(0.88, 0.88, 0.08, 14), '#2f5f86', { y });
  b.add(cone(0.95, 0.5, 14), ['#c94f3a', '#e86b55'], { y: 4.1 });
  b.add(cyl(0.07, 0.07, 2.6, 6), '#9d978c', { x: 0.7, y: 1.3, z: 0.7 }); // down pipe
  return b.build();
}

function hayStack(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(box(1.2, 0.6, 0.8, 0.12), ['#c9a43c', '#f3dc84'], { y: 0.3 });
  b.add(box(1.2, 0.6, 0.8, 0.12), ['#c9a43c', '#f3dc84'], { y: 0.3, x: 0.2, z: 0.85 });
  b.add(box(1.2, 0.6, 0.8, 0.12), ['#c9a43c', '#f3dc84'], { y: 0.9, x: 0.1, z: 0.4 });
  for (const z of [0, 0.85]) b.add(box(1.22, 0.05, 0.05, 0.01), '#8a5a32', { y: 0.32, x: z ? 0.2 : 0, z });
  return b.build();
}

/** Level 3 breeding pen: round fence, straw floor, nest / shelter, heart sign. */
function breedingPen(type: LivestockFarmTypeCode): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(cyl(2.0, 2.0, 0.08, 18), ['#d9bf7a', '#f3dc94'], { y: 0.06 });
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    if (i === 3) continue; // gap = gate
    b.add(cyl(0.08, 0.09, 0.8, 6), ['#e8e4da', '#ffffff'], { x: Math.cos(a) * 2.05, y: 0.4, z: Math.sin(a) * 2.05 });
    const a2 = ((i + 0.5) / 12) * Math.PI * 2;
    if (i !== 2) b.add(box(1.05, 0.08, 0.06, 0.02), '#ffffff', { x: Math.cos(a2) * 2.0, y: 0.6, z: Math.sin(a2) * 2.0, ry: -a2 + Math.PI / 2 });
  }
  if (type === 'chicken_farm') {
    for (const [x, z] of [[-0.5, -0.4], [0.6, 0.3]] as const) {
      b.add(cyl(0.45, 0.5, 0.3, 12), ['#c49a5a', '#e2bd7c'], { x, y: 0.2, z });
      for (let k = 0; k < 3; k += 1) b.add(ball(0.11, 1), ['#f2ece0', '#ffffff'], { x: x + (k - 1) * 0.15, y: 0.36, z, sy: 1.3 });
    }
  } else {
    b.add(box(1.4, 1.1, 1.1, 0.12), ['#a8743f', '#d39a5b'], { x: -0.6, y: 0.6, z: -0.6 });
    b.add(box(1.6, 0.12, 1.3, 0.05), '#d9603b', { x: -0.6, y: 1.2, z: -0.6, rx: 0.15 });
  }
  // Heart sign
  b.add(cyl(0.04, 0.04, 1.4, 4), '#7a5232', { x: 1.4, y: 0.7, z: 1.4 });
  for (const s of [-1, 1]) b.add(ball(0.17, 1), '#ff6f91', { x: 1.4 + s * 0.1, y: 1.45, z: 1.4, sz: 0.4 });
  b.add(cone(0.24, 0.3, 4), '#ff6f91', { x: 1.4, y: 1.27, z: 1.4, rx: Math.PI, sz: 0.4 });
  return b.build();
}

/** Level 3 waste processing: compost bays + chibi biogas dome with pipe. */
function wasteArea(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  for (let i = 0; i < 2; i += 1) {
    b.add(box(1.1, 0.6, 1.1, 0.06), ['#7a6a58', '#9d8c76'], { x: -0.9 + i * 1.2, y: 0.3, z: -0.4 });
    b.add(box(0.9, 0.1, 0.9, 0.04), '#5b3f28', { x: -0.9 + i * 1.2, y: 0.58, z: -0.4 });
  }
  b.add(ball(0.95, 1), ['#6f9a6a', '#9cc78e'], { x: 0.9, y: 0.25, z: 0.6, sy: 0.75 });
  b.add(cyl(0.25, 0.25, 0.3, 10), '#9d978c', { x: 0.9, y: 0.95, z: 0.6 });
  b.add(cyl(0.07, 0.07, 1.6, 6), '#3b7fb8', { x: 0.1, y: 0.9, z: 0.6, rz: Math.PI / 2 });
  b.add(box(0.6, 0.5, 0.06, 0.02), '#f4ede0', { x: -0.3, y: 1.1, z: 0.25 }); // sign
  b.add(ball(0.12, 0), '#6fbf5a', { x: -0.3, y: 1.12, z: 0.3 });
  return b.build();
}

/** Training yard: sand oval with a jump (horses) or log + tub (elephants); arena rails at L3. */
function arenaModel(type: LivestockFarmTypeCode, level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const r = type === 'elephant_camp' ? 5.4 : 4.6;
  b.add(cyl(r, r, 0.05, 28), ['#d9c08a', '#ecd8a8'], { y: 0.03 });
  if (type === 'horse_stable') {
    // Jump: two striped stands and a pole (centre obstacle).
    for (const s of [-1, 1]) b.add(box(0.14, 0.9, 0.14, 0.04), ['#ffffff', '#d23c3c'], { x: s * 0.7, y: 0.45 });
    b.add(cyl(0.05, 0.05, 1.5, 6), ['#ffffff', '#d23c3c'], { y: 0.6, rz: Math.PI / 2 });
    for (const [x, z] of [[2.4, 2.4], [-2.6, -2.2], [2.6, -2.4]]) b.add(cone(0.22, 0.55, 8), '#ff8a3d', { x, y: 0.28, z }); // cones
  } else {
    b.add(cyl(0.35, 0.35, 1.7, 10), ['#8a5a32', '#b07a48'], { y: 0.35, rz: Math.PI / 2 }); // log to push
    b.add(cyl(0.55, 0.6, 0.55, 12), ['#7f8a96', '#a9b4bf'], { x: 2.8, y: 0.28, z: 2.6 }); // stand tub
    b.add(cyl(0.5, 0.5, 0.04, 12), '#d23c3c', { x: 2.8, y: 0.57, z: 2.6 });
  }
  if (level >= 3) {
    // Riding arena / stadium: post-and-rail ring with gaps (entrances).
    const n = 20;
    for (let i = 0; i < n; i += 1) {
      if (i % 5 === 0) continue;
      const a = (i / n) * Math.PI * 2;
      const a2 = ((i + 0.5) / n) * Math.PI * 2;
      b.add(cyl(0.07, 0.07, 0.8, 5), '#f4ede0', { x: Math.cos(a) * (r + 0.3), y: 0.4, z: Math.sin(a) * (r + 0.3) });
      if ((i + 1) % 5 !== 0) b.add(box((Math.PI * 2 * (r + 0.3)) / n, 0.07, 0.06, 0.02), '#ffffff', { x: Math.cos(a2) * (r + 0.3), y: 0.62, z: Math.sin(a2) * (r + 0.3), ry: -a2 + Math.PI / 2 });
    }
    // Flags
    for (const a of [0.3, 3.4]) {
      b.add(cyl(0.04, 0.04, 2.2, 5), '#7a5232', { x: Math.cos(a) * (r + 0.6), y: 1.1, z: Math.sin(a) * (r + 0.6) });
      b.add(box(0.6, 0.36, 0.03, 0.01), '#3f7fb0', { x: Math.cos(a) * (r + 0.6) + 0.3, y: 2.0, z: Math.sin(a) * (r + 0.6) });
    }
  }
  return b.build();
}

/** Care area (L2) / veterinary clinic (L3): little hut with a cross sign, water bucket, med box. */
function vetModel(level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const wall: Paint = level >= 3 ? ['#e8e4da', '#ffffff'] : ['#b4553b', '#d9744f'];
  b.add(box(2.2, 0.18, 1.9, 0.06), ['#8d857a', '#b9b1a5'], { y: 0.09 });
  b.add(box(1.9, 1.4, 1.6, 0.1), wall, { y: 0.18 + 0.7 });
  gableRoof(b, { width: 1.9, depth: 1.6, height: 0.7, overhang: 0.25, color: level >= 3 ? '#3f7fb0' : '#d9603b', rows: 2, gable: wall[0] }, 0, 1.58, 0);
  b.add(box(0.5, 0.16, 0.04, 0.02), '#d23c3c', { y: 1.15, z: 0.83 });
  b.add(box(0.16, 0.5, 0.04, 0.02), '#d23c3c', { y: 1.15, z: 0.83 });
  b.add(box(0.6, 0.9, 0.05, 0.03), '#7a5232', { x: 0.55, y: 0.63, z: 0.82 }); // door
  b.add(box(0.5, 0.35, 0.35, 0.05), ['#d23c3c', '#ff6f6f'], { x: -1.25, y: 0.3, z: 0.4 }); // med box
  b.add(box(0.16, 0.05, 0.36, 0.01), '#ffffff', { x: -1.25, y: 0.49, z: 0.4 });
  return b.build();
}

/** Manager house (stable L3) or watchtower (camp L3). */
function officeModel(type: LivestockFarmTypeCode): THREE.BufferGeometry {
  const b = new ModelBuilder();
  if (type === 'elephant_camp') {
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]] as const) b.add(cyl(0.1, 0.12, 4.2, 6), '#7a5232', { x, y: 2.1, z });
    b.add(box(1.8, 0.14, 1.8, 0.04), '#8a5a32', { y: 4.2 });
    for (const s of [-1, 1]) b.add(box(1.8, 0.5, 0.08, 0.02), '#a8743f', { y: 4.5, z: s * 0.88 });
    b.add(cone(1.4, 1.0, 4), ['#d6b45e', '#f0d27a'], { y: 5.5, ry: Math.PI / 4 });
    b.add(box(0.12, 4.0, 0.5, 0.03), '#7a5232', { x: 0.95, y: 2.0, rz: 0.12 }); // ladder
    return b.build();
  }
  b.add(box(2.8, 0.2, 2.3, 0.06), ['#8d857a', '#b9b1a5'], { y: 0.1 });
  b.add(box(2.5, 1.7, 2.0, 0.12), ['#f1e4c8', '#fff6e2'], { y: 0.2 + 0.85 });
  gableRoof(b, { width: 2.5, depth: 2.0, height: 0.9, overhang: 0.3, color: '#3f7fb0', rows: 3, gable: '#f1e4c8' }, 0, 1.9, 0);
  windowAt(b, { x: -0.6, y: 1.2, z: 1.06, ry: 0 }, 0.55, 0.5, { frame: '#ffffff', shutters: '#3f7fb0' });
  b.add(box(0.6, 1.0, 0.06, 0.03), '#7a5232', { x: 0.6, y: 0.7, z: 1.03 });
  b.add(box(0.9, 0.36, 0.05, 0.02), '#f4ede0', { x: 0.6, y: 1.45, z: 1.05 }); // sign
  b.add(cyl(0.12, 0.12, 0.8, 6), '#9d978c', { x: 0.8, y: 2.6, z: -0.4 }); // chimney
  return b.build();
}

/** Elephant bathing pond: stone rim and a sloped mud bank. */
function pondModel(r: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(cyl(r + 0.4, r + 0.6, 0.12, 26), ['#7d5a3a', '#9a7450'], { y: 0.0 });
  const n = 18;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    b.add(ball(0.32 + (i % 3) * 0.06, 0), ['#8d857a', '#b9b1a5'], { x: Math.cos(a) * (r + 0.3), y: 0.12, z: Math.sin(a) * (r + 0.3), sy: 0.6 });
  }
  return b.build();
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise in [0, 1] over integer lattice hashes (smooth, deterministic). */
function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assembly
// ─────────────────────────────────────────────────────────────────────────────
export function buildRanchScenery(
  type: LivestockFarmTypeCode,
  level: number,
  layout: RanchLayout,
  hexes: readonly { q: number; r: number }[],
  height: HeightSampler
): RanchScenery {
  const parts: THREE.BufferGeometry[] = [];
  const waterPos: number[] = [];
  const waterCol: number[] = [];
  const b = new ModelBuilder();

  // Ground: grass with dirt / mud / clover patches; level 1 is mostly a trampled dirt yard.
  const g = GROUND[type];
  const share = level === 1 ? Math.max(g.patchShare, 0.58) : g.patchShare;
  const base = new THREE.Color(g.base);
  const patch = new THREE.Color(level === 1 && type !== 'pig_farm' ? '#cfb07c' : g.patch);
  const tmp = new THREE.Color();
  const pos: number[] = [];
  const col: number[] = [];
  for (const h of hexes) {
    drapeHex(pos, col, h.q, h.r, 1, 6, FIELD_LIFT, height, (x, z) => {
      // Soft blotches: smooth value noise blended with a smoothstep (no hard cell edges).
      const n = valueNoise(x / 4.5, z / 4.5) * 0.7 + valueNoise(x / 1.8 + 31, z / 1.8 + 17) * 0.3;
      const t = smoothstep(1 - share - 0.08, 1 - share + 0.08, n);
      tmp.copy(base).lerp(patch, t).multiplyScalar(0.96 + valueNoise(x * 1.3, z * 1.3) * 0.07);
      return tmp;
    });
  }
  parts.push(surface(pos, col));

  // Fence along the border.
  for (const e of layout.frame.borderEdges) fenceEdge(b, e, level, height);

  // Barn and troughs.
  placeStructure(parts, barnModel(type, level), layout.barn, height, STRUCTURE_SCALE.barn);
  placeStructure(parts, troughModel(type, level, false), layout.feeder, height, STRUCTURE_SCALE.trough);
  if (layout.pond) {
    placeStructure(parts, pondModel(layout.pond), layout.water, height, 1);
    const w = layout.water;
    const y = height(w.x, w.z) + 0.1;
    const c = new THREE.Color('#6cc3e6');
    const n = 24;
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      for (const [x, z] of [[w.x, w.z], [w.x + Math.cos(a1) * layout.pond, w.z + Math.sin(a1) * layout.pond], [w.x + Math.cos(a0) * layout.pond, w.z + Math.sin(a0) * layout.pond]]) {
        waterPos.push(x, y, z);
        waterCol.push(c.r, c.g, c.b);
      }
    }
  } else placeStructure(parts, troughModel(type, level, true), layout.water, height, STRUCTURE_SCALE.trough);
  if (!layout.pond) {
    // Water surface of the drinking trough.
    const w = layout.water;
    const k = STRUCTURE_SCALE.trough;
    const len = (type === 'chicken_farm' ? 1.3 : 1.8) * k;
    const dx = Math.cos(w.ry) * len * 0.5;
    const dz = -Math.sin(w.ry) * len * 0.5;
    const y = height(w.x, w.z) + 0.5 * k - FIELD_LIFT;
    waterStrip(waterPos, waterCol, { x: w.x - dx, z: w.z - dz }, { x: w.x + dx, z: w.z + dz }, 0.5 * k, () => y, FIELD_LIFT);
  }
  if (type === 'pig_farm') {
    // Mud wallow (pigs love it), between the water trough and the middle of the farm.
    const m = { x: layout.water.x * 0.6 + layout.frame.centroid.x * 0.4, z: layout.water.z * 0.6 + layout.frame.centroid.z * 0.4 };
    if (layout.nav.isWalkable(m.x, m.z)) {
      b.add(cyl(1.5, 1.6, 0.06, 16), ['#6a4a30', '#7d5a3a'], { x: m.x, y: height(m.x, m.z) + FIELD_LIFT + 0.02, z: m.z, sx: 1.3 });
    }
  }

  // Caretaker's spot (every farm has one).
  placeStructure(parts, caretakerStand(level), layout.caretaker, height, 1.2);

  if (level >= 2 && layout.storage) {
    // Feed storage shed + hay beside it.
    placeStructure(parts, storageShed(type, level), layout.storage, height, STRUCTURE_SCALE.storage);
    const s = layout.storage;
    const hay = { x: s.x + Math.cos(s.ry) * 2.2, z: s.z - Math.sin(s.ry) * 2.2, ry: s.ry, hex: s.hex };
    placeStructure(parts, hayStack(), hay, height, STRUCTURE_SCALE.hay * 0.8);
  }

  if (level >= 2) {
    // Path from the barn door to the feeder.
    const reach = (BARN[type].d / 2 + 0.6) * STRUCTURE_SCALE.barn;
    const door = { x: layout.barn.x + Math.sin(layout.barn.ry) * reach, z: layout.barn.z + Math.cos(layout.barn.ry) * reach };
    const path: Paint = level >= 3 ? ['#cfc7b6', '#e8e1d2'] : ['#cdb184', '#e6cfa0'];
    segmentBox(b, door, { x: layout.feeder.x, z: layout.feeder.z }, height, 1.2, 0.06, path, FIELD_LIFT - 0.03, 0.05);
    // Flowers along the fence.
    layout.frame.borderEdges.forEach((e, i) => {
      if (i % 3) return;
      const [p0, p1] = insetEdge(e, 0.7);
      const x = (p0.x + p1.x) / 2;
      const z = (p0.z + p1.z) / 2;
      b.add(ball(0.18, 0), [i % 2 ? '#ff8fb1' : '#ffd45c', '#fff6e0'], { x, y: height(x, z) + FIELD_LIFT + 0.18, z });
    });
  }

  // Stables / camps: training yard, care area / vet, manager house / watchtower.
  if (layout.arena) placeStructure(parts, arenaModel(type, level), layout.arena, height, 1);
  if (layout.vet) placeStructure(parts, vetModel(level), layout.vet, height, 1.15);
  if (layout.office) placeStructure(parts, officeModel(type), layout.office, height, 1.1);

  if (level >= 3) {
    if (layout.pen) placeStructure(parts, breedingPen(type), layout.pen, height, STRUCTURE_SCALE.pen);
    if (layout.waste) placeStructure(parts, wasteArea(), layout.waste, height, STRUCTURE_SCALE.waste);
    if (layout.tower) {
      // Water tower and the pipe that keeps the trough full.
      placeStructure(parts, waterTower(), layout.tower, height, STRUCTURE_SCALE.tower);
      segmentBox(b, layout.tower, layout.water, height, 0.16, 0.16, ['#2f5f86', '#3f7fb0'], FIELD_LIFT + 0.12, 0.04);
    }
    // Dividing fences: the yard is split into sections (gaps keep them connected).
    for (const w of layout.walls) {
      segmentBox(b, w.a, w.b, height, 0.12, 0.7, ['#9f998f', '#cfc9bd'], FIELD_LIFT, 0.03);
      for (const p of [w.a, w.b]) b.add(box(0.26, 0.95, 0.26, 0.06), ['#8d857a', '#b9b1a5'], { x: p.x, y: height(p.x, p.z) + FIELD_LIFT + 0.45, z: p.z });
    }
    // Lamp beside the barn door.
    const l = layout.barn;
    const lb = new ModelBuilder();
    lampPost(lb, 0, 0);
    const lamp = lb.build();
    const a = (BARN[type].d / 2 + 0.8) * STRUCTURE_SCALE.barn;
    const b2 = (BARN[type].w / 2 + 0.6) * STRUCTURE_SCALE.barn;
    const side = { x: l.x + Math.sin(l.ry) * a + Math.cos(l.ry) * b2, z: l.z + Math.cos(l.ry) * a - Math.sin(l.ry) * b2 };
    lamp.translate(side.x, height(side.x, side.z), side.z);
    parts.push(lamp);
  }
  parts.push(b.build());

  const solid = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  solid.computeBoundingSphere();
  const water = waterPos.length ? surface(waterPos, waterCol) : null;
  water?.computeBoundingSphere();
  return { solid, water, topY: height(layout.barn.x, layout.barn.z) + BARN[type].h * 2.2 * STRUCTURE_SCALE.barn + 1.5 };
}

/** Fence segment on one border edge, style by level. */
function fenceEdge(b: ModelBuilder, e: Parameters<typeof insetEdge>[0], level: number, height: HeightSampler): void {
  const [p0, p1] = insetEdge(e, 0.3);
  const n = 3;
  for (let i = 0; i <= n; i += 1) {
    const x = p0.x + ((p1.x - p0.x) * i) / n;
    const z = p0.z + ((p1.z - p0.z) * i) / n;
    const y = height(x, z) + FIELD_LIFT;
    if (level >= 3 && (i === 0 || i === n)) {
      b.add(box(0.36, 1.2, 0.36, 0.08), ['#9f998f', '#cfc9bd'], { x, y: y + 0.55, z });
      b.add(box(0.44, 0.1, 0.44, 0.04), '#b9b2a6', { x, y: y + 1.18, z });
    } else if (level >= 2) {
      b.add(box(0.16, 1.05, 0.16, 0.04), ['#e8e4da', '#ffffff'], { x, y: y + 0.5, z });
    } else {
      b.add(cyl(0.11, 0.13, 1.05, 6), ['#7a5232', '#9c6b43'], { x, y: y + 0.48, z });
    }
  }
  const rail: Paint = level >= 2 ? ['#eeeae0', '#ffffff'] : ['#8a5d38', '#a87648'];
  for (const y of [0.42, 0.82]) segmentBox(b, p0, p1, height, 0.1, 0.11, rail, FIELD_LIFT + y - 0.05, 0.03);
}

