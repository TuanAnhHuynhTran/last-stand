/**
 * Chibi building models for every type × level (18 variants), built from the model kit.
 * Upgrades change materials (wood → brick), roofs (shingles → red tiles → large tiled roof),
 * storeys (1 → 2) and yard dressing (rustic fence → picket + pots → hedge, lamp, path),
 * so each level reads as a clear step up.
 *
 * Every model stays inside its footprint hexes (verified by unit tests for all rotations).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { entranceGeometry, entranceStart } from './entrancePaths';
import { quarryModel, roadModel, smithyModel, wellModel } from './economyModels';
import { militaryModel } from './militaryModels';
import { axialToWorld, createRng, getBuildingDefinition, type BuildingTypeCode } from '@cityverse/shared';
import {
  ModelBuilder,
  ball,
  box,
  bush,
  cone,
  crate,
  cyl,
  doorAt,
  flowerPatch,
  flowerPot,
  gableRoof,
  hexFence,
  hexPlate,
  lampPost,
  logPile,
  onFace,
  shade,
  steppingStones,
  windowAt,
  type Face,
} from './modelKit';

type Material = 'logs' | 'brick' | 'plaster' | 'planks' | 'whitewash';

const PAL = {
  grass: '#8fd46a',
  grassRich: '#7fcb5c',
  plinth: '#b9ad9b',
  logA: '#c4884c',
  logB: '#d39a5b',
  darkWood: '#8a5a32',
  brick: '#c0603f',
  brickHi: '#cf6d49',
  quoin: '#efe3cf',
  plaster: '#f6ead6',
  plank: '#d6a46a',
  white: '#f4efe6',
  shingle: '#c8743c',
  tile: '#d9573b',
  tileDeep: '#c2402f',
  frameCream: '#fff3dc',
  frameWhite: '#ffffff',
  shutterGreen: '#4f9a6a',
  doorWood: '#9a5f34',
};

interface BodySpec {
  cx: number;
  cz: number;
  w: number;
  d: number;
  floors: { h: number; mat: Material }[];
  seed: number;
}

/** Walls for each storey; returns the wall-top height. */
function body(b: ModelBuilder, s: BodySpec): number {
  const { cx, cz, w, d } = s;
  const rng = createRng(s.seed);
  b.add(box(w + 0.34, 0.4, d + 0.34, 0.12), PAL.plinth, { x: cx, y: 0.32, z: cz });
  let y = 0.5;
  s.floors.forEach((f, fi) => {
    const yc = y + f.h / 2;
    switch (f.mat) {
      case 'logs': {
        const rows = Math.round(f.h / 0.42);
        const rh = f.h / rows;
        for (let i = 0; i < rows; i += 1) {
          b.add(box(w, rh + 0.04, d, 0.17), i % 2 ? PAL.logA : PAL.logB, { x: cx, y: y + rh * (i + 0.5), z: cz });
        }
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          b.add(cyl(0.2, 0.22, f.h + 0.1, 8), [PAL.darkWood, '#a06c40'], { x: cx + sx * w / 2, y: yc, z: cz + sz * d / 2 });
        }
        break;
      }
      case 'brick':
      case 'plaster':
      case 'planks':
      case 'whitewash': {
        const base = f.mat === 'brick' ? (fi > 0 ? PAL.brickHi : PAL.brick) : f.mat === 'plaster' ? PAL.plaster : f.mat === 'planks' ? PAL.plank : PAL.white;
        b.add(box(w, f.h, d, 0.12), [shade(base, 0.88), base], { x: cx, y: yc, z: cz });
        if (f.mat === 'brick') {
          // Stone quoins at the corners + a scatter of proud bricks = readable brickwork.
          const blocks = Math.floor(f.h / 0.42);
          for (let i = 0; i < blocks; i += 1) {
            const big = i % 2 === 0;
            const qy = y + 0.21 + i * 0.42;
            for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
              b.add(box(big ? 0.62 : 0.42, 0.36, big ? 0.42 : 0.62, 0.05), PAL.quoin, {
                x: cx + sx * (w / 2 - (big ? 0.24 : 0.14)),
                y: qy,
                z: cz + sz * (d / 2 - (big ? 0.14 : 0.24)),
              });
            }
          }
          const faces: Face[] = ['front', 'right', 'left', 'back'];
          for (let i = 0; i < Math.round((w + d) * f.h * 0.9); i += 1) {
            const face = faces[i % 4];
            const span = face === 'front' || face === 'back' ? w : d;
            const u = (rng() - 0.5) * (span - 1.4);
            const by = y + 0.3 + rng() * (f.h - 0.6);
            const xf = onFace(face, cx, cz, w, d, u, by, 0.02);
            b.add(box(0.5, 0.2, 0.08, 0.03), shade(base, 0.82 + rng() * 0.3), xf);
          }
        } else if (f.mat === 'plaster') {
          // Half-timbering on plaster storeys.
          for (const face of ['front', 'back', 'left', 'right'] as Face[]) {
            const span = face === 'front' || face === 'back' ? w : d;
            for (const u of [-span / 2 + 0.15, span / 2 - 0.15]) {
              b.add(box(0.2, f.h, 0.08, 0.03), PAL.darkWood, onFace(face, cx, cz, w, d, u, yc, 0.02));
            }
            b.add(box(span, 0.18, 0.08, 0.03), PAL.darkWood, onFace(face, cx, cz, w, d, 0, y + f.h - 0.1, 0.02));
          }
        } else {
          // Vertical battens on plank walls.
          for (const face of ['front', 'back', 'left', 'right'] as Face[]) {
            const span = face === 'front' || face === 'back' ? w : d;
            const n = Math.max(2, Math.round(span / 0.9));
            for (let i = 0; i <= n; i += 1) {
              const u = -span / 2 + 0.08 + (i / n) * (span - 0.16);
              b.add(box(0.12, f.h, 0.06, 0.02), shade(base, 0.78), onFace(face, cx, cz, w, d, u, yc, 0.02));
            }
          }
        }
        break;
      }
    }
    y += f.h;
    if (fi < s.floors.length - 1) {
      b.add(box(w + 0.22, 0.2, d + 0.22, 0.08), PAL.quoin, { x: cx, y: y + 0.08, z: cz });
      y += 0.16;
    }
  });
  return y;
}

function chimney(b: ModelBuilder, x: number, y: number, z: number, color = PAL.brick, h = 1.6): void {
  b.add(box(0.7, h, 0.7, 0.08), [shade(color, 0.85), color], { x, y: y + h / 2, z });
  b.add(box(0.86, 0.2, 0.86, 0.06), PAL.quoin, { x, y: y + h + 0.05, z });
}

// ─────────────────────────────────────────────────────────────────────────────
// Houses (1 hex)
// ─────────────────────────────────────────────────────────────────────────────

function houseL1(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  hexPlate(b, 0, 0, PAL.grass);
  const w = 4.7;
  const d = 4.1;
  const cz = -0.55;
  const top = body(b, { cx: 0, cz, w, d, floors: [{ h: 2.35, mat: 'logs' }], seed: 1 });
  const win = { frame: PAL.frameCream, shutters: PAL.shutterGreen };
  doorAt(b, onFace('front', 0, cz, w, d, 0, 1.3), 0.95, 1.55, PAL.doorWood, PAL.darkWood);
  windowAt(b, onFace('front', 0, cz, w, d, -1.5, 1.72), 0.95, 0.95, win);
  windowAt(b, onFace('front', 0, cz, w, d, 1.5, 1.72), 0.95, 0.95, win);
  windowAt(b, onFace('right', 0, cz, w, d, 0, 1.72), 1.05, 0.95, win);
  windowAt(b, onFace('left', 0, cz, w, d, 0, 1.72), 1.05, 0.95, win);
  gableRoof(b, { width: w, depth: d, height: 2.35, overhang: 0.55, color: PAL.shingle, rows: 5, stripe: 0.1, gable: PAL.logB }, 0, top, cz);
  // Stove pipe
  b.add(cyl(0.18, 0.18, 1.2, 8), ['#5a5f69', '#7b818c'], { x: 1.3, y: top + 1.6, z: cz - 0.8 });
  // Yard: rustic fence, flower bed, tiny veggie patch, dirt path, bushes.
  hexFence(b, 0, 0, 'rustic');
  b.add(box(1.2, 0.08, 2.4, 0.04), '#c9a77a', { x: 0, y: 0.15, z: 3.2 });
  flowerPatch(b, -2.35, 2.05, 11);
  b.add(box(1.5, 0.16, 1.3, 0.06), ['#7a5232', '#94663f'], { x: 2.35, y: 0.16, z: 2.0 });
  for (let i = 0; i < 6; i += 1) {
    b.add(ball(0.18, 0), ['#3f8f3c', '#8fd468'], { x: 1.85 + (i % 3) * 0.5, y: 0.36, z: 1.75 + Math.floor(i / 3) * 0.5 });
  }
  bush(b, -2.9, -1.0, 0.9);
  return b.build();
}

function houseL2(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  hexPlate(b, 0, 0, PAL.grassRich);
  const w = 4.9;
  const d = 4.2;
  const cz = -0.55;
  const top = body(b, { cx: 0, cz, w, d, floors: [{ h: 2.55, mat: 'brick' }], seed: 2 });
  const win = { frame: PAL.frameWhite, flowerBox: true };
  doorAt(b, onFace('front', 0, cz, w, d, 0, 1.35), 1.0, 1.6, '#7c3f2a', PAL.frameWhite, PAL.tile);
  windowAt(b, onFace('front', 0, cz, w, d, -1.55, 1.85), 1.05, 1.15, win);
  windowAt(b, onFace('front', 0, cz, w, d, 1.55, 1.85), 1.05, 1.15, win);
  windowAt(b, onFace('right', 0, cz, w, d, 0, 1.85), 1.15, 1.15, win);
  windowAt(b, onFace('left', 0, cz, w, d, 0, 1.85), 1.15, 1.15, win);
  gableRoof(b, { width: w, depth: d, height: 2.45, overhang: 0.6, color: PAL.tile, rows: 7, stripe: 0.18, gable: PAL.plaster }, 0, top, cz);
  // Round attic windows on both gables.
  for (const s of [1, -1]) {
    b.add(cyl(0.38, 0.38, 0.12, 14), PAL.frameWhite, { x: s * (w / 2 + 0.04), y: top + 0.8, z: cz, rz: Math.PI / 2 });
    b.add(cyl(0.28, 0.28, 0.14, 14), ['#8fd3f0', '#e6f8ff'], { x: s * (w / 2 + 0.06), y: top + 0.8, z: cz, rz: Math.PI / 2 });
  }
  chimney(b, -1.35, top + 0.7, cz - 0.9);
  // Yard: white picket fence, pots by the door, stepping stones, bushes and flowers.
  hexFence(b, 0, 0, 'picket');
  steppingStones(b, { x: 0, z: 2.1 }, { x: 0, z: 4.8 }, 4);
  flowerPot(b, -0.95, 2.15);
  flowerPot(b, 0.95, 2.15);
  flowerPatch(b, -2.5, 1.9, 21, ['#ff6f91', '#ffd45c', '#ffffff']);
  flowerPatch(b, 2.5, 1.9, 22, ['#b48cff', '#ffffff', '#ff9ec4']);
  bush(b, -3.0, -1.4, 0.95);
  bush(b, 3.0, -1.3, 0.9);
  return b.build();
}

function houseL3(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  hexPlate(b, 0, 0, PAL.grassRich);
  const w = 5.0;
  const d = 4.3;
  const cz = -0.6;
  const f1 = 2.45;
  const top = body(b, {
    cx: 0,
    cz,
    w,
    d,
    floors: [
      { h: f1, mat: 'brick' },
      { h: 2.3, mat: 'brick' },
    ],
    seed: 3,
  });
  const win = { frame: PAL.frameWhite, flowerBox: true };
  const y2 = 0.5 + f1 + 0.16;
  doorAt(b, onFace('front', 0, cz, w, d, 0, 1.3), 1.0, 1.55, '#6b3424', PAL.frameWhite);
  windowAt(b, onFace('front', 0, cz, w, d, -1.6, 1.75), 1.05, 1.1, win);
  windowAt(b, onFace('front', 0, cz, w, d, 1.6, 1.75), 1.05, 1.1, win);
  for (const face of ['left', 'right'] as Face[]) {
    windowAt(b, onFace(face, 0, cz, w, d, 0.7, 1.75), 0.95, 1.05, win);
    windowAt(b, onFace(face, 0, cz, w, d, -0.7, y2 + 1.1), 0.95, 1.05, { frame: PAL.frameWhite });
  }
  // Upstairs: balcony door + side windows, balcony with white railing.
  windowAt(b, onFace('front', 0, cz, w, d, 0, y2 + 0.95), 1.0, 1.6, { frame: PAL.frameWhite, glass: '#a9dcf3' });
  windowAt(b, onFace('front', 0, cz, w, d, -1.65, y2 + 1.15), 0.9, 0.95, { frame: PAL.frameWhite, shutters: '#2f7d6d' });
  windowAt(b, onFace('front', 0, cz, w, d, 1.65, y2 + 1.15), 0.9, 0.95, { frame: PAL.frameWhite, shutters: '#2f7d6d' });
  const bz = cz + d / 2 + 0.55;
  b.add(box(2.6, 0.2, 1.1, 0.06), PAL.quoin, { x: 0, y: y2 + 0.05, z: bz });
  for (let i = 0; i <= 6; i += 1) {
    const x = -1.2 + i * 0.4;
    b.add(box(0.09, 0.7, 0.09, 0.02), PAL.frameWhite, { x, y: y2 + 0.5, z: bz + 0.48 });
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 2; i += 1) b.add(box(0.09, 0.7, 0.09, 0.02), PAL.frameWhite, { x: s * 1.24, y: y2 + 0.5, z: bz - 0.4 + i * 0.44 });
  }
  b.add(box(2.6, 0.1, 0.12, 0.03), PAL.frameWhite, { x: 0, y: y2 + 0.88, z: bz + 0.48 });
  for (const s of [-1, 1]) b.add(box(0.12, 0.1, 1.0, 0.03), PAL.frameWhite, { x: s * 1.24, y: y2 + 0.88, z: bz });
  flowerPot(b, -0.85, bz + 0.1);
  b.add(cyl(0.12, 0.14, y2 - 0.3, 8), PAL.frameWhite, { x: -1.15, y: (y2 + 0.3) / 2, z: bz + 0.4 });
  b.add(cyl(0.12, 0.14, y2 - 0.3, 8), PAL.frameWhite, { x: 1.15, y: (y2 + 0.3) / 2, z: bz + 0.4 });

  gableRoof(b, { width: w, depth: d, height: 2.7, overhang: 0.65, color: PAL.tileDeep, rows: 8, stripe: 0.18, gable: PAL.plaster }, 0, top, cz);
  for (const s of [1, -1]) {
    b.add(cyl(0.42, 0.42, 0.12, 14), PAL.frameWhite, { x: s * (w / 2 + 0.04), y: top + 0.85, z: cz, rz: Math.PI / 2 });
    b.add(cyl(0.31, 0.31, 0.14, 14), ['#8fd3f0', '#e6f8ff'], { x: s * (w / 2 + 0.06), y: top + 0.85, z: cz, rz: Math.PI / 2 });
  }
  chimney(b, -1.5, top + 0.6, cz - 0.95, PAL.brick, 1.9);
  chimney(b, 1.5, top + 0.6, cz - 0.95, PAL.brick, 1.5);
  // Garden: hedge, stone path, lamp, potted trees, flower beds.
  hexFence(b, 0, 0, 'hedge', 0.84);
  steppingStones(b, { x: 0, z: 2.6 }, { x: 0, z: 4.6 }, 3, '#e3d9c8');
  lampPost(b, 1.1, 3.6);
  flowerPot(b, -2.3, 2.1, 'tree');
  flowerPot(b, 2.3, 2.1, 'tree');
  flowerPatch(b, -1.6, 3.4, 31, ['#ff6f91', '#ffffff', '#ffd45c']);
  flowerPatch(b, 2.8, 0.6, 32, ['#b48cff', '#ffffff']);
  return b.build();
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers for multi-hex buildings
// ─────────────────────────────────────────────────────────────────────────────

/** Garden plots for every footprint hex (grass; yards are added as separate surfaces). */
function plates(b: ModelBuilder, code: BuildingTypeCode): void {
  for (const h of getBuildingDefinition(code).footprint) {
    const c = axialToWorld(h.q, h.r);
    hexPlate(b, c.x, c.z, PAL.grassRich);
  }
}

/** Flat paved/dirt surface sitting just above the plot. */
function paving(b: ModelBuilder, x: number, z: number, w: number, d: number, color = '#e2d3b5'): void {
  b.add(box(w, 0.08, d, 0.04), [shade(color, 0.92), color], { x, y: 0.16, z });
}

type Avoid = { x: number; z: number; w: number; d: number } | { x: number; z: number; r: number };

function blocked(x: number, z: number, avoid: Avoid[], pad: number): boolean {
  return avoid.some((a) =>
    'r' in a
      ? Math.hypot(x - a.x, z - a.z) < a.r + pad
      : Math.abs(x - a.x) < a.w / 2 + pad && Math.abs(z - a.z) < a.d / 2 + pad
  );
}

/**
 * Dresses every footprint hex with bushes, flower beds and (from level 2) potted trees in
 * the space the building leaves free, so large plots never look bare.
 */
function yard(b: ModelBuilder, code: BuildingTypeCode, level: number, avoid: Avoid[], seed: number): void {
  const rng = createRng(seed);
  let k = 0;
  for (const h of getBuildingDefinition(code).footprint) {
    const c = axialToWorld(h.q, h.r);
    let placed = 0;
    // Outer ring toward the edge midpoints, then an inner ring between them.
    for (let i = 0; i < 12 && placed < 4; i += 1) {
      const outer = i < 6;
      const a = (Math.PI / 3) * (i % 6) - Math.PI / 2 + (outer ? Math.PI / 6 : 0);
      const rad = outer ? 3.35 : 2.1;
      const x = c.x + Math.cos(a) * rad;
      const z = c.z + Math.sin(a) * rad;
      const entrance = entranceStart(code, level);
      if (z >= entrance.z && Math.abs(x - entrance.x) < 1.7) continue;
      if (blocked(x, z, avoid, 1.1)) continue;
      const pick = (k + Math.floor(rng() * 2)) % (level >= 2 ? 3 : 2);
      if (pick === 0) bush(b, x, z, 0.85 + rng() * 0.25);
      else if (pick === 1) flowerPatch(b, x, z, seed * 31 + k);
      else flowerPot(b, x, z, 'tree');
      placed += 1;
      k += 1;
    }
  }
}

function stripedAwning(b: ModelBuilder, x: number, y: number, z: number, w: number, d: number, colors: [string, string], ry = 0): void {
  const n = 6;
  for (let i = 0; i < n; i += 1) {
    const u = -w / 2 + (i + 0.5) * (w / n);
    b.add(box(w / n + 0.02, 0.12, d, 0.04), i % 2 ? colors[0] : colors[1], {
      x: x + u * Math.cos(ry),
      y,
      z: z - u * Math.sin(ry),
      rx: 0.32,
      ry,
    });
  }
}

function stall(b: ModelBuilder, x: number, z: number, colors: [string, string], goods: string[]): void {
  b.add(box(2.4, 0.9, 1.1, 0.08), ['#a8743f', '#d39a5b'], { x, y: 0.6, z });
  for (const s of [-1, 1]) b.add(cyl(0.08, 0.08, 2.3, 6), PAL.darkWood, { x: x + s * 1.1, y: 1.3, z: z - 0.45 });
  for (const s of [-1, 1]) b.add(cyl(0.08, 0.08, 1.9, 6), PAL.darkWood, { x: x + s * 1.1, y: 1.1, z: z + 0.5 });
  stripedAwning(b, x, 2.35, z, 2.7, 1.7, colors);
  goods.forEach((g, i) => b.add(ball(0.2, 0), g, { x: x - 0.8 + i * 0.4, y: 1.15, z: z + 0.2, sy: 0.8 }));
}

function flag(b: ModelBuilder, x: number, z: number, h: number, color: string): void {
  b.add(cyl(0.08, 0.1, h, 8), ['#d8d2c6', '#f4f0e8'], { x, y: h / 2 + 0.1, z });
  b.add(ball(0.14, 0), '#f2c14e', { x, y: h + 0.15, z });
  b.add(box(1.4, 0.85, 0.06, 0.04), [shade(color, 0.85), color], { x: x + 0.75, y: h - 0.45, z });
}

// ─────────────────────────────────────────────────────────────────────────────
// Territory centre (7 hexes)
// ─────────────────────────────────────────────────────────────────────────────

function territoryCenter(level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  plates(b, 'territory_center');
  const w = level === 3 ? 12 : 11;
  const d = 7.4;
  const cz = -1.2;
  const floors: BodySpec['floors'] =
    level === 1 ? [{ h: 2.8, mat: 'logs' }] : level === 2 ? [{ h: 3.0, mat: 'brick' }] : [{ h: 2.9, mat: 'brick' }, { h: 2.5, mat: 'plaster' }];
  const top = body(b, { cx: 0, cz, w, d, floors, seed: 40 + level });
  const win = { frame: level === 1 ? PAL.frameCream : PAL.frameWhite, shutters: level === 1 ? PAL.shutterGreen : undefined, flowerBox: level > 1 };
  doorAt(b, onFace('front', 0, cz, w, d, 0, 1.45), 1.6, 1.9, level === 1 ? PAL.doorWood : '#6b3424', level === 1 ? PAL.darkWood : PAL.frameWhite, level > 1 ? '#3a6fb0' : undefined);
  for (const u of [-4.2, -2.6, 2.6, 4.2]) windowAt(b, onFace('front', 0, cz, w, d, u, 1.95), 0.95, 1.1, win);
  for (const face of ['left', 'right'] as Face[]) {
    for (const u of [-1.6, 1.6]) windowAt(b, onFace(face, 0, cz, w, d, u, 1.95), 0.95, 1.1, win);
  }
  if (level === 3) {
    for (const u of [-4.4, -2.2, 0, 2.2, 4.4]) windowAt(b, onFace('front', 0, cz, w, d, u, 4.75), 0.85, 1.0, { frame: PAL.frameWhite });
  }
  gableRoof(
    b,
    {
      width: w,
      depth: d,
      height: level === 1 ? 3.0 : 3.3,
      overhang: 0.7,
      color: level === 1 ? PAL.shingle : level === 2 ? PAL.tile : PAL.tileDeep,
      rows: level === 1 ? 6 : 9,
      stripe: 0.1,
      gable: level === 1 ? PAL.logB : PAL.plaster,
    },
    0,
    top,
    cz
  );
  if (level === 3) {
    // Little clock tower on the ridge.
    b.add(box(1.6, 1.8, 1.6, 0.1), [PAL.plaster, '#fff7ea'], { x: 0, y: top + 3.9, z: cz });
    b.add(cyl(0.5, 0.5, 0.12, 16), PAL.frameWhite, { x: 0, y: top + 4.0, z: cz + 0.82, rx: Math.PI / 2 });
    b.add(cone(1.35, 1.6, 4), PAL.tileDeep, { x: 0, y: top + 5.6, z: cz, ry: Math.PI / 4 });
  }
  flag(b, 5.6, 4.0, level === 1 ? 5 : 6.2, '#3a6fb0');
  flag(b, -5.6, 4.0, level === 1 ? 5 : 6.2, '#e05a47');
  // Front yard: plaza / fountain / benches.
  if (level === 1) {
    steppingStones(b, { x: 0, z: 2.6 }, { x: 0, z: 9 }, 5);
    crate(b, 3, 0, 3.2, 1, 0.3);
    logPile(b, -3.6, 3.4, 0.2);
  } else {
    b.add(cyl(2.6, 2.6, 0.12, 24), '#e7dfd0', { x: 0, y: 0.17, z: 6.6 });
    if (level === 3) {
      b.add(cyl(1.6, 1.8, 0.6, 20), ['#b9ad9b', '#d8cfbf'], { x: 0, y: 0.45, z: 6.6 });
      b.add(cyl(1.35, 1.35, 0.1, 20), ['#5fd0e0', '#a6ecf5'], { x: 0, y: 0.72, z: 6.6 });
      b.add(cyl(0.22, 0.3, 1.4, 10), '#d8cfbf', { x: 0, y: 1.2, z: 6.6 });
      b.add(ball(0.45, 1), ['#7fd6ff', '#d8f6ff'], { x: 0, y: 2.0, z: 6.6, sy: 0.7 });
      lampPost(b, -3.2, 7.5);
      lampPost(b, 3.2, 7.5);
    } else {
      flowerPot(b, -2.2, 6.6, 'tree');
      flowerPot(b, 2.2, 6.6, 'tree');
    }
  }
  yard(b, 'territory_center', level, [
    { x: 0, z: cz, w: w + 1.6, d: d + 1.6 },
    { x: 0, z: 6.6, r: 2.9 },
    { x: 0, z: 5.8, w: 1.6, d: 6.6 },
    { x: 5.6, z: 4.0, r: 0.9 },
    { x: -5.6, z: 4.0, r: 0.9 },
    { x: 3, z: 3.2, r: 1.1 },
    { x: -3.6, z: 3.4, r: 1.5 },
    { x: 3.2, z: 7.5, r: 0.6 },
    { x: -3.2, z: 7.5, r: 0.6 },
  ], 400 + level);
  return b.build();
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage (2 hexes, along +X)
// ─────────────────────────────────────────────────────────────────────────────

function storage(level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  plates(b, 'storage');
  const cx = 5;
  const cz = -0.2;
  const w = 9.6;
  const d = 4.3;
  const floors: BodySpec['floors'] =
    level === 1 ? [{ h: 2.7, mat: 'planks' }] : level === 2 ? [{ h: 2.9, mat: 'brick' }] : [{ h: 2.6, mat: 'brick' }, { h: 2.1, mat: 'planks' }];
  const top = body(b, { cx, cz, w, d, floors, seed: 50 + level });
  // Big barn doors with cross bracing.
  const doorXf = onFace('front', cx, cz, w, d, 0, 1.5);
  b.add(box(2.6, 2.1, 0.14, 0.06), level === 1 ? '#b0703f' : '#7c3f2a', doorXf);
  for (const s of [1, -1]) b.add(box(2.9, 0.16, 0.1, 0.03), PAL.quoin, { ...doorXf, z: (doorXf.z ?? 0) + 0.08, rz: s * 0.62 });
  for (const u of [-3.4, 3.4]) windowAt(b, onFace('front', cx, cz, w, d, u, 1.9), 0.9, 0.8, { frame: PAL.frameCream });
  if (level === 3) {
    // Loft door + hoist beam on the right gable (stays inside the footprint).
    b.add(box(1.3, 1.4, 0.14, 0.05), '#7a5232', onFace('right', cx, cz, w, d, 0, 4.0));
    b.add(box(2.0, 0.25, 0.25, 0.05), PAL.darkWood, { x: cx + w / 2 + 0.7, y: top + 0.3, z: cz });
    b.add(cyl(0.025, 0.025, 1.6, 4), '#5a5f69', { x: cx + w / 2 + 1.4, y: top - 0.55, z: cz });
    crate(b, cx + w / 2 + 1.4, top - 2.0, cz, 0.6);
  }
  gableRoof(
    b,
    { width: w, depth: d, height: 2.2, overhang: 0.5, color: level === 1 ? PAL.shingle : PAL.tile, rows: level === 1 ? 5 : 7, stripe: 0.1, gable: level === 1 ? PAL.plank : PAL.plaster },
    cx,
    top,
    cz
  );
  // Goods outside.
  crate(b, -1.6, 0.12, 2.9, 1, 0.2);
  crate(b, -1.4, 1.0, 2.8, 0.8, 0.6);
  b.add(cyl(0.45, 0.45, 1.0, 12), ['#8a5a32', '#b07a48'], { x: 11.6, y: 0.62, z: 2.4 });
  if (level >= 2) {
    crate(b, 12.2, 0.12, 1.0, 0.9);
    b.add(cyl(0.45, 0.45, 1.0, 12), ['#8a5a32', '#b07a48'], { x: 10.6, y: 0.62, z: 2.9 });
  }
  if (level >= 2) paving(b, 5, 2.4, 8.6, 0.9);
  yard(b, 'storage', level, [
    { x: cx, z: cz, w: w + 1.4, d: d + 1.4 },
    { x: -1.5, z: 2.85, r: 1.2 },
    { x: 11.6, z: 2.4, r: 1.0 },
    { x: 12.2, z: 1.0, r: 1.0 },
    { x: 10.6, z: 2.9, r: 1.0 },
    { x: cx + w / 2 + 1.4, z: cz, r: 1.0 },
  ], 500 + level);
  return b.build();
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinic (2 hexes)
// ─────────────────────────────────────────────────────────────────────────────

function redCross(b: ModelBuilder, x: number, y: number, z: number, s = 1): void {
  b.add(cyl(0.75 * s, 0.75 * s, 0.12, 20), PAL.frameWhite, { x, y, z, rx: Math.PI / 2 });
  b.add(box(0.95 * s, 0.3 * s, 0.1, 0.03), '#e0453a', { x, y, z: z + 0.07 });
  b.add(box(0.3 * s, 0.95 * s, 0.1, 0.03), '#e0453a', { x, y, z: z + 0.07 });
}

function clinic(level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  plates(b, 'clinic');
  const cx = 4.6;
  const cz = -0.25;
  const w = 8.6;
  const d = 4.3;
  const floors: BodySpec['floors'] =
    level === 1 ? [{ h: 2.5, mat: 'whitewash' }] : level === 2 ? [{ h: 2.7, mat: 'plaster' }] : [{ h: 2.6, mat: 'brick' }, { h: 2.3, mat: 'plaster' }];
  const top = body(b, { cx, cz, w, d, floors, seed: 60 + level });
  const win = { frame: PAL.frameWhite, shutters: level === 1 ? '#5fa6c9' : undefined, flowerBox: level > 1 };
  doorAt(b, onFace('front', cx, cz, w, d, -1.2, 1.35), 1.2, 1.6, '#5fa6c9', PAL.frameWhite, '#e0453a');
  for (const u of [-3.2, 1.2, 3.1]) windowAt(b, onFace('front', cx, cz, w, d, u, 1.85), 1.0, 1.05, win);
  if (level === 3) for (const u of [-2.6, 0, 2.6]) windowAt(b, onFace('front', cx, cz, w, d, u, 4.3), 0.9, 1.0, { frame: PAL.frameWhite });
  gableRoof(
    b,
    { width: w, depth: d, height: 2.2, overhang: 0.5, color: level === 1 ? '#5f9fc4' : level === 2 ? PAL.tile : PAL.tileDeep, rows: level === 1 ? 5 : 7, stripe: 0.1, gable: PAL.plaster },
    cx,
    top,
    cz
  );
  redCross(b, cx + w / 2 + 0.15 + 0.06, top + 0.8, cz, 0.9);
  redCross(b, cx - 1.2, top - 0.05 + 0.75, cz + d / 2 + 0.12, 0.6);
  // Herb garden beds.
  const beds = level === 3 ? 3 : level === 2 ? 2 : 1;
  for (let i = 0; i < beds; i += 1) {
    const x = 6.5 + i * 1.6;
    b.add(box(1.3, 0.3, 1.0, 0.06), ['#7a5232', '#94663f'], { x, y: 0.2, z: 2.8 });
    for (let k = 0; k < 4; k += 1) b.add(ball(0.17, 0), ['#3f8f3c', '#a6e07a'], { x: x - 0.4 + (k % 2) * 0.8, y: 0.45, z: 2.6 + Math.floor(k / 2) * 0.4 });
  }
  flowerPatch(b, -1.4, 2.6, 61, ['#ffffff', '#ff8fb1', '#7fd6ff']);
  if (level === 3) lampPost(b, -2.2, 2.0);
  yard(b, 'clinic', level, [
    { x: cx, z: cz, w: w + 1.4, d: d + 1.4 },
    { x: 6.5 + 0.8 * (beds - 1), z: 2.8, w: 1.6 * beds + 0.6, d: 1.6 },
    { x: -1.4, z: 2.6, r: 1.0 },
    { x: -2.2, z: 2.0, r: 0.6 },
    { x: cx + w / 2 + 0.3, z: cz, r: 1.0 },
  ], 600 + level);
  return b.build();
}

// ─────────────────────────────────────────────────────────────────────────────
// Market (3 hexes: (0,0), (1,0), (0,1))
// ─────────────────────────────────────────────────────────────────────────────

function market(level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  plates(b, 'market');
  const C = axialToWorld(0, 1); // (5, 8.66)
  const fruit = ['#ff6b5a', '#ffb43c', '#9edc5e', '#ff6b5a', '#ffd45c'];
  if (level === 1) {
    stall(b, 0, 0, ['#ff8f7a', '#fff3e6'], fruit);
    stall(b, 10, 0, ['#7fb9e8', '#ffffff'], ['#c08c5a', '#e0b07a', '#c08c5a', '#f2d3a0', '#c08c5a']);
    stall(b, C.x, C.z, ['#9edc5e', '#ffffff'], ['#9edc5e', '#3f8f3c', '#c4ec74', '#9edc5e', '#3f8f3c']);
    crate(b, 5, 0.12, 3.4, 0.9, 0.4);
    b.add(cyl(0.4, 0.35, 0.6, 10), ['#c08c5a', '#e0b07a'], { x: 3.8, y: 0.42, z: 4.6 });
    yard(b, 'market', level, [
      { x: 0, z: 0, r: 1.9 },
      { x: 10, z: 0, r: 1.9 },
      { x: C.x, z: C.z, r: 1.9 },
      { x: 5, z: 3.4, r: 1.0 },
      { x: 3.8, z: 4.6, r: 0.8 },
    ], 700 + level);
  } else {
    paving(b, 5, -0.1, 11.6, 4.8);
    // Market hall over hexes A–B: tiled roof on posts, stalls underneath.
    const cx = 5;
    const cz = -0.1;
    const w = 11;
    const d = 4.4;
    const postH = level === 3 ? 2.9 : 2.7;
    for (const x of [-0.5, 3.2, 6.8, 10.5]) {
      for (const z of [cz - d / 2 + 0.2, cz + d / 2 - 0.2]) {
        b.add(cyl(0.18, 0.22, postH, 8), level === 3 ? ['#b04a3a', '#d06a52'] : [PAL.darkWood, '#a06c40'], { x, y: postH / 2 + 0.12, z });
      }
    }
    let top = postH + 0.12;
    if (level === 3) {
      b.add(box(w + 0.3, 0.3, d + 0.3, 0.08), PAL.quoin, { x: cx, y: top + 0.15, z: cz });
      top += 0.3;
      top += 1.8;
      b.add(box(6, 1.8, 3.6, 0.1), [PAL.plaster, '#fff7ea'], { x: cx, y: top - 0.9, z: cz });
      for (const u of [-1.8, 0, 1.8]) windowAt(b, onFace('front', cx, cz, 6, 3.6, u, top - 0.9), 0.8, 0.8, { frame: PAL.frameWhite });
      // Lower skirt roof around the upper pavilion.
      for (const s of [1, -1]) {
        b.add(box(w + 0.8, 0.18, 1.6, 0.06), [shade(PAL.tile, 0.85), PAL.tile], { x: cx, y: top - 1.75, z: cz + s * (d / 2 - 0.2), rx: s * 0.45 });
      }
      for (const x of [0.5, 9.5]) b.add(ball(0.32, 1), ['#ff5a3c', '#ffb43c'], { x, y: postH - 0.3, z: cz + d / 2 - 0.2 });
    }
    gableRoof(
      b,
      {
        width: level === 3 ? 6 : w,
        depth: level === 3 ? 3.6 : d,
        height: level === 3 ? 1.8 : 2.0,
        overhang: 0.55,
        color: level === 3 ? PAL.tileDeep : PAL.tile,
        rows: 6,
        stripe: 0.12,
        gable: PAL.plaster,
      },
      cx,
      top,
      cz
    );
    stall(b, 1.6, cz + 0.3, ['#ff8f7a', '#fff3e6'], fruit);
    stall(b, 8.4, cz + 0.3, ['#7fb9e8', '#ffffff'], ['#c08c5a', '#e0b07a', '#c08c5a', '#f2d3a0', '#c08c5a']);
    stall(b, C.x, C.z - 0.2, ['#9edc5e', '#ffffff'], ['#9edc5e', '#3f8f3c', '#c4ec74', '#9edc5e', '#3f8f3c']);
    if (level === 3) {
      stall(b, C.x - 2.6, C.z + 1.2, ['#c08cff', '#ffffff'], ['#ff8fb1', '#ffffff', '#b48cff', '#ffd45c', '#ff8fb1']);
      lampPost(b, C.x + 2.6, C.z + 0.8);
    }
    crate(b, 5, 0.12, 4.0, 0.9, 0.4);
    b.add(cyl(0.4, 0.35, 0.6, 10), ['#c08c5a', '#e0b07a'], { x: 3.6, y: 0.42, z: 4.8 });
    yard(b, 'market', level, [
      { x: 5, z: -0.1, w: 12.8, d: 6.0 },
      { x: C.x, z: C.z - 0.2, r: 1.9 },
      { x: C.x - 2.6, z: C.z + 1.2, r: level === 3 ? 1.9 : 0 },
      { x: C.x + 2.6, z: C.z + 0.8, r: level === 3 ? 0.6 : 0 },
      { x: 5, z: 4.0, r: 1.0 },
      { x: 3.6, z: 4.8, r: 0.8 },
    ], 700 + level);
  }
  return b.build();
}

// ─────────────────────────────────────────────────────────────────────────────
// Carpentry (3 hexes)
// ─────────────────────────────────────────────────────────────────────────────

function sawTable(b: ModelBuilder, x: number, z: number): void {
  b.add(box(2.2, 0.16, 1.0, 0.04), ['#b07a48', '#d39a5b'], { x, y: 0.95, z });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.add(box(0.14, 0.85, 0.14, 0.03), PAL.darkWood, { x: x + sx * 0.95, y: 0.5, z: z + sz * 0.38 });
  b.add(cyl(0.42, 0.42, 0.05, 20), ['#b9bec7', '#e4e8ee'], { x, y: 1.25, z, rx: Math.PI / 2 });
  b.add(box(1.6, 0.2, 0.3, 0.05), '#d9b07a', { x: x - 0.2, y: 1.12, z: z + 0.2 });
}

function carpentry(level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  plates(b, 'carpentry');
  const C = axialToWorld(0, 1);
  const cx = 5;
  const cz = -0.2;
  const w = 10.4;
  const d = 4.4;
  if (level === 1) {
    // Open shed on posts with a plank roof.
    for (const x of [0, 5, 10]) for (const z of [cz - d / 2 + 0.2, cz + d / 2 - 0.2]) b.add(cyl(0.18, 0.2, 2.8, 7), [PAL.darkWood, '#a06c40'], { x, y: 1.5, z });
    gableRoof(b, { width: w, depth: d, height: 1.6, overhang: 0.5, color: '#b0703f', rows: 4, stripe: 0.14, gable: PAL.plank }, cx, 2.9, cz);
    sawTable(b, 2.5, cz);
    sawTable(b, 7.6, cz + 0.2);
  } else {
    const floors: BodySpec['floors'] = level === 2 ? [{ h: 2.8, mat: 'planks' }] : [{ h: 2.7, mat: 'brick' }, { h: 2.2, mat: 'plaster' }];
    const top = body(b, { cx, cz, w, d, floors, seed: 80 + level });
    const doorXf = onFace('front', cx, cz, w, d, -1.5, 1.45);
    b.add(box(2.4, 2.0, 0.14, 0.06), '#8a5a32', doorXf);
    for (const u of [-4, 1.6, 3.8]) windowAt(b, onFace('front', cx, cz, w, d, u, 1.9), 0.95, 0.9, { frame: PAL.frameCream });
    if (level === 3) for (const u of [-3, 0, 3]) windowAt(b, onFace('front', cx, cz, w, d, u, 4.3), 0.9, 0.9, { frame: PAL.frameWhite });
    gableRoof(b, { width: w, depth: d, height: 2.2, overhang: 0.5, color: level === 2 ? PAL.tile : PAL.tileDeep, rows: 7, stripe: 0.12, gable: PAL.plank }, cx, top, cz);
    chimney(b, 8.2, top + 0.4, cz - 0.8, '#8a8f99', 1.4);
    // Mechanical saw wheel on the side (level 2+).
    b.add(cyl(1.3, 1.3, 0.25, 16), ['#8a5a32', '#b07a48'], { x: -0.6, y: 1.6, z: cz, rz: Math.PI / 2 });
    for (let i = 0; i < 4; i += 1) b.add(box(0.15, 2.5, 0.15, 0.03), PAL.darkWood, { x: -0.72, y: 1.6, z: cz, rx: (i * Math.PI) / 4 });
    sawTable(b, 3.2, 2.9);
  }
  // Timber yard on hex C (sawdust ground).
  b.add(cyl(2.7, 2.7, 0.08, 18), ['#cfae80', '#e2c696'], { x: C.x, y: 0.16, z: C.z });
  logPile(b, C.x - 1.1, C.z - 0.3, 0.15);
  if (level >= 2) logPile(b, C.x + 1.5, C.z + 0.6, -0.2);
  if (level === 3) {
    for (let i = 0; i < 4; i += 1) b.add(box(2.6, 0.12, 0.5, 0.03), ['#d9b07a', '#f0cf9a'], { x: C.x, y: 0.25 + i * 0.13, z: C.z + 2.4 });
    lampPost(b, C.x + 2.6, C.z - 1.4);
  }
  crate(b, C.x + 2.2, 0.12, C.z - 2.2, 0.8, 0.5);
  yard(b, 'carpentry', level, [
    { x: cx, z: cz, w: w + 1.4, d: d + 1.4 },
    { x: C.x, z: C.z, r: 3.3 },
    { x: 3.2, z: 2.9, r: 1.4 },
    { x: -0.6, z: cz, r: 1.6 },
    { x: C.x + 2.2, z: C.z - 2.2, r: 1.0 },
    { x: C.x, z: C.z + 2.4, r: 1.7 },
  ], 800 + level);
  return b.build();
}

// ─────────────────────────────────────────────────────────────────────────────

const BUILDERS: Record<BuildingTypeCode, (level: number) => THREE.BufferGeometry> = {
  radar: (l) => {
    const b = new ModelBuilder();
    b.add(box(4, 1 + l, 4, 0.2), ['#b48b58', '#c77861', '#a8b6c4'][l - 1], { y: (1 + l) / 2 });
    b.add(cyl(0.2, 0.3, 3, 8), '#536c7e', { y: l + 2 });
    b.add(cyl(1.7, 0.4, 0.6, 12), l === 3 ? '#9df2ed' : '#ddd9bb', { y: l + 3.6 });
    b.add(box(0.15, 1.5, 0.15), '#567580', { y: l + 4 });
    if (l >= 2) for (const x of [-1.8, 1.8]) b.add(box(0.4, l + 1, 0.4), '#ece1ca', { x, y: (l + 1) / 2, z: 1.8 });
    return b.build();
  },
  house: (l) => (l === 1 ? houseL1() : l === 2 ? houseL2() : houseL3()),
  territory_center: territoryCenter,
  storage,
  clinic,
  market,
  carpentry,
  quarry: quarryModel,
  smithy: smithyModel,
  well: wellModel,
  road: roadModel,
  sword_barracks: (l) => militaryModel('sword_barracks', l),
  spear_barracks: (l) => militaryModel('spear_barracks', l),
  archery_range: (l) => militaryModel('archery_range', l),
  crossbow_range: (l) => militaryModel('crossbow_range', l),
  military_forge: (l) => militaryModel('military_forge', l),
  training_ground: (l) => militaryModel('training_ground', l),
  military_depot: (l) => militaryModel('military_depot', l),
};

export function buildBuildingGeometry(code: BuildingTypeCode, level: number): THREE.BufferGeometry {
  const lv = Math.min(3, Math.max(1, level));
  const model = BUILDERS[code](lv);
  if (code === 'road') return model;
  const entrance = entranceGeometry(code, lv);
  const merged = mergeGeometries([model, entrance], false)!;
  model.dispose(); entrance.dispose();
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  return merged;
}

/** Geometry cache shared by renderer and preview (models are immutable). */
export class BuildingModelCache {
  private readonly cache = new Map<string, THREE.BufferGeometry>();

  get(code: BuildingTypeCode, level: number): THREE.BufferGeometry {
    const key = `${code}:${level}`;
    let geo = this.cache.get(key);
    if (!geo) {
      geo = buildBuildingGeometry(code, level);
      this.cache.set(key, geo);
    }
    return geo;
  }

  dispose(): void {
    this.cache.forEach((g) => g.dispose());
    this.cache.clear();
  }
}
