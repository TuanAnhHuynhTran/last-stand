/**
 * Chibi animals: big heads, round bodies, stubby legs, readable from the isometric camera
 * (adults ≈ 1.4–2.6 m tall — deliberately not real-world proportions).
 *
 * Each species is split into animatable parts, all merged & vertex-coloured:
 *   body – torso (+ tail, wings, udder…), origin on the ground below the torso
 *   head – pivot at the neck joint (placed at `rig.head`)
 *   leg  – pivot at the hip, hanging down `rig.legLength` (placed at each `rig.hips`)
 * plus a merged rest-pose low-poly model for the far LOD.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AnimalEquipmentSlot, AnimalTypeCode } from '@cityverse/shared';
import { ModelBuilder, ball, box, cone, cyl } from '../buildings/modelKit';

export interface AnimalRig {
  head: { x: number; y: number; z: number };
  hips: { x: number; z: number }[];
  hipY: number;
  legLength: number;
  /** Walk speed (m/s) and gait frequency */
  speed: number;
  gait: number;
  /** Head pitch while eating (rad, positive = down) */
  eatPitch: number;
  /** Approx. height for markers / picking */
  height: number;
  /** Phase 9: saddle seat socket on the back (body frame, unscaled) */
  seat?: { y: number; z: number };
  /** Elephant trunk root (head frame) and segment length */
  trunk?: { y: number; z: number; segment: number };
  /** Elephant ear pivots (head frame) */
  ears?: { x: number; y: number; z: number }[];
  /** Horse tail root (body frame) */
  tail?: { y: number; z: number };
}

export interface AnimalParts {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
  lod: THREE.BufferGeometry;
  rig: AnimalRig;
  /** Optional animated parts (trunk segment hangs along -Y, ear hinge at its front edge, tail along -Z) */
  trunk?: THREE.BufferGeometry;
  ear?: THREE.BufferGeometry;
  tail?: THREE.BufferGeometry;
  /** Tack placed at the seat socket (body frame, origin = seat) */
  tack?: Partial<Record<AnimalEquipmentSlot | 'crates', THREE.BufferGeometry>>;
}

type Detail = 0 | 1;

function eyes(b: ModelBuilder, z: number, y: number, spread: number, r = 0.075): void {
  for (const s of [-1, 1]) {
    b.add(ball(r, 1), '#2b2116', { x: s * spread, y, z });
    b.add(ball(r * 0.38, 0), '#ffffff', { x: s * spread + 0.02, y: y + r * 0.35, z: z + r * 0.6 });
  }
}

function blush(b: ModelBuilder, z: number, y: number, spread: number): void {
  for (const s of [-1, 1]) b.add(ball(0.07, 0), '#ff9f9f', { x: s * spread, y, z, sy: 0.5 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Species
// ─────────────────────────────────────────────────────────────────────────────
interface SpeciesBuild {
  body: (b: ModelBuilder, d: Detail) => void;
  head: (b: ModelBuilder, d: Detail) => void;
  leg: (b: ModelBuilder, d: Detail) => void;
  rig: AnimalRig;
  trunk?: (b: ModelBuilder) => void;
  ear?: (b: ModelBuilder) => void;
  tail?: (b: ModelBuilder) => void;
  tack?: Partial<Record<AnimalEquipmentSlot | 'crates', (b: ModelBuilder) => void>>;
}

const W: [string, string] = ['#dcdcdc', '#ffffff'];
const MANE = '#3a2a22';
const LEATHER = '#7a4a2a';
const BRASS = '#d8b04a';

const SPECIES: Record<AnimalTypeCode, SpeciesBuild> = {
  chicken: {
    rig: { head: { x: 0, y: 1.05, z: 0.3 }, hips: [{ x: -0.18, z: 0 }, { x: 0.18, z: 0 }], hipY: 0.45, legLength: 0.45, speed: 1.4, gait: 9, eatPitch: 1.0, height: 1.7 },
    body: (b, d) => {
      b.add(ball(0.55, d), ['#f2ece0', '#ffffff'], { y: 0.78, sz: 1.1 });
      for (const s of [-1, 1]) b.add(ball(0.3, d), ['#e6dccb', '#fff8ee'], { x: s * 0.5, y: 0.8, z: -0.05, sx: 0.5, sz: 1.2 });
      b.add(cone(0.24, 0.45, 5), ['#e6dccb', '#ffffff'], { y: 1.05, z: -0.55, rx: -0.9 }); // tail
    },
    head: (b, d) => {
      b.add(cyl(0.14, 0.2, 0.25, 8), '#ffffff', { y: 0.05 });
      b.add(ball(0.42, d), ['#f2ece0', '#ffffff'], { y: 0.42 });
      for (const [z, y, r] of [[0.05, 0.86, 0.11], [-0.08, 0.84, 0.1], [0.17, 0.8, 0.09]] as const) b.add(ball(r, 0), '#e8433a', { y, z });
      b.add(cone(0.11, 0.24, 6), '#ffb22e', { y: 0.36, z: 0.46, rx: Math.PI / 2 });
      b.add(ball(0.08, 0), '#e8433a', { y: 0.22, z: 0.38, sy: 1.4 });
      eyes(b, 0.36, 0.5, 0.17, 0.07);
      blush(b, 0.33, 0.37, 0.27);
    },
    leg: (b) => {
      b.add(cyl(0.045, 0.045, 0.42, 5), '#ffa62b', { y: -0.21 });
      b.add(box(0.2, 0.05, 0.22, 0.02), '#ffa62b', { y: -0.43, z: 0.06 });
    },
  },
  pig: {
    rig: { head: { x: 0, y: 0.95, z: 0.62 }, hips: [{ x: -0.32, z: 0.38 }, { x: 0.32, z: 0.38 }, { x: -0.32, z: -0.38 }, { x: 0.32, z: -0.38 }], hipY: 0.5, legLength: 0.46, speed: 1.1, gait: 7, eatPitch: 0.75, height: 1.7 },
    body: (b, d) => {
      b.add(ball(0.68, d), ['#f39bb0', '#ffc6d3'], { y: 0.9, sx: 1, sy: 0.9, sz: 1.25 });
      b.add(ball(0.2, 0), '#ffb6c6', { x: 0.42, y: 1.15, z: -0.1 }); // patch
      // Curly tail
      for (let i = 0; i < 4; i += 1) {
        const a = i * 1.6;
        b.add(ball(0.06, 0), '#f39bb0', { x: Math.cos(a) * 0.08, y: 1.05 + Math.sin(a) * 0.08, z: -0.84 - i * 0.02 });
      }
    },
    head: (b, d) => {
      b.add(ball(0.56, d), ['#f39bb0', '#ffc6d3'], { y: 0.18, z: 0.12 });
      b.add(cyl(0.22, 0.24, 0.18, 12), ['#e7839c', '#ff9fb5'], { y: 0.05, z: 0.66, rx: Math.PI / 2 });
      for (const s of [-1, 1]) b.add(ball(0.045, 0), '#a8445c', { x: s * 0.08, y: 0.05, z: 0.76 });
      for (const s of [-1, 1]) b.add(cone(0.17, 0.3, 4), ['#e7839c', '#ffb6c6'], { x: s * 0.33, y: 0.66, z: 0.0, rz: -s * 0.5, rx: 0.4 });
      eyes(b, 0.58, 0.3, 0.2, 0.07);
      blush(b, 0.52, 0.12, 0.36);
    },
    leg: (b) => {
      b.add(cyl(0.12, 0.13, 0.4, 7), ['#e7839c', '#f39bb0'], { y: -0.2 });
      b.add(cyl(0.135, 0.135, 0.08, 7), '#8a4a5a', { y: -0.42 });
    },
  },
  cow: {
    rig: { head: { x: 0, y: 1.75, z: 0.95 }, hips: [{ x: -0.45, z: 0.62 }, { x: 0.45, z: 0.62 }, { x: -0.45, z: -0.62 }, { x: 0.45, z: -0.62 }], hipY: 0.85, legLength: 0.82, speed: 1.0, gait: 5.5, eatPitch: 0.9, height: 2.7 },
    body: (b, d) => {
      b.add(box(1.4, 1.05, 1.9, 0.45), ['#ece6dc', '#ffffff'], { y: 1.35 });
      for (const [x, y, z, r] of [[0.71, 1.45, 0.3, 0.32], [-0.71, 1.25, -0.4, 0.38], [0.2, 1.88, -0.5, 0.35], [-0.4, 1.86, 0.45, 0.25], [0.71, 1.2, -0.6, 0.22]] as const) {
        b.add(ball(r, d), '#2f2a2a', { x, y, z, sx: Math.abs(x) > 0.6 ? 0.25 : 1, sy: Math.abs(x) > 0.6 ? 1 : 0.22 });
      }
      b.add(ball(0.28, d), ['#f2a2b0', '#ffc3cd'], { y: 0.78, z: -0.3, sy: 0.7 }); // udder
      b.add(cyl(0.05, 0.05, 0.85, 5), '#ece6dc', { y: 1.4, z: -1.02, rx: 0.25 });
      b.add(ball(0.12, 0), '#2f2a2a', { y: 0.98, z: -1.12 });
    },
    head: (b, d) => {
      b.add(ball(0.66, d), ['#ece6dc', '#ffffff'], { y: 0.35, z: 0.2 });
      b.add(ball(0.24, 0), '#2f2a2a', { x: 0.3, y: 0.62, z: 0.25, sx: 0.8 });
      b.add(box(0.78, 0.42, 0.42, 0.18), ['#f2a2b0', '#ffc3cd'], { y: 0.08, z: 0.68 });
      for (const s of [-1, 1]) b.add(ball(0.05, 0), '#a8445c', { x: s * 0.16, y: 0.12, z: 0.9 });
      for (const s of [-1, 1]) b.add(cone(0.08, 0.32, 6), ['#d9c7a0', '#fff6dc'], { x: s * 0.42, y: 0.92, z: 0.1, rz: -s * 0.6 });
      for (const s of [-1, 1]) b.add(ball(0.17, 0), ['#d9cfc4', '#ece6dc'], { x: s * 0.68, y: 0.55, z: 0.05, sx: 1.4, sy: 0.6 });
      eyes(b, 0.7, 0.48, 0.25, 0.085);
      blush(b, 0.62, 0.3, 0.44);
    },
    leg: (b) => {
      b.add(cyl(0.16, 0.17, 0.72, 8), ['#ddd6cc', '#ece6dc'], { y: -0.36 });
      b.add(cyl(0.18, 0.18, 0.14, 8), '#3b3030', { y: -0.76 });
    },
  },
  sheep: {
    rig: { head: { x: 0, y: 1.2, z: 0.62 }, hips: [{ x: -0.3, z: 0.35 }, { x: 0.3, z: 0.35 }, { x: -0.3, z: -0.35 }, { x: 0.3, z: -0.35 }], hipY: 0.58, legLength: 0.55, speed: 1.1, gait: 7, eatPitch: 0.9, height: 2.0 },
    body: (b, d) => {
      const puffs: [number, number, number, number][] = [
        [0, 1.05, 0, 0.62],
        [0.38, 1.0, 0.3, 0.42],
        [-0.38, 1.0, 0.3, 0.42],
        [0.38, 1.0, -0.32, 0.42],
        [-0.38, 1.0, -0.32, 0.42],
        [0, 1.4, 0.1, 0.42],
        [0, 1.32, -0.35, 0.4],
        [0, 1.0, -0.6, 0.36],
      ];
      for (const [x, y, z, r] of puffs) b.add(ball(r, d), ['#ece8e2', '#ffffff'], { x, y, z });
    },
    head: (b, d) => {
      b.add(ball(0.42, d), ['#5b5350', '#7a706b'], { y: 0.12, z: 0.18, sz: 1.1 });
      b.add(ball(0.3, d), ['#ece8e2', '#ffffff'], { y: 0.45, z: 0.1 }); // fluffy top
      for (const s of [-1, 1]) b.add(ball(0.16, 0), '#5b5350', { x: s * 0.44, y: 0.15, z: 0.05, sx: 1.5, sy: 0.55 });
      eyes(b, 0.52, 0.2, 0.15, 0.075);
      blush(b, 0.48, 0.04, 0.26);
    },
    leg: (b) => {
      b.add(cyl(0.085, 0.085, 0.5, 6), '#4a4341', { y: -0.25 });
      b.add(cyl(0.1, 0.1, 0.08, 6), '#2b2523', { y: -0.52 });
    },
  },
  goat: {
    rig: { head: { x: 0, y: 1.35, z: 0.62 }, hips: [{ x: -0.28, z: 0.4 }, { x: 0.28, z: 0.4 }, { x: -0.28, z: -0.4 }, { x: 0.28, z: -0.4 }], hipY: 0.72, legLength: 0.68, speed: 1.4, gait: 7.5, eatPitch: 1.0, height: 2.3 },
    body: (b, d) => {
      b.add(ball(0.6, d), ['#cfa77a', '#ead0aa'], { y: 1.1, sz: 1.3, sy: 0.85 });
      b.add(ball(0.3, 0), '#f4e6d0', { y: 1.0, z: 0.55, sy: 0.8 }); // chest
      b.add(cone(0.12, 0.3, 5), '#8f6a45', { y: 1.35, z: -0.8, rx: -0.8 });
    },
    head: (b, d) => {
      b.add(ball(0.4, d), ['#cfa77a', '#ead0aa'], { y: 0.2, z: 0.2, sz: 1.15 });
      b.add(ball(0.2, 0), '#f4e6d0', { y: 0.05, z: 0.55 });
      b.add(cone(0.08, 0.3, 5), '#f4e6d0', { y: -0.25, z: 0.45, rx: Math.PI }); // beard
      for (const s of [-1, 1]) {
        b.add(cone(0.07, 0.42, 6), ['#8f7a62', '#c9b79a'], { x: s * 0.17, y: 0.65, z: 0.0, rx: -0.6, rz: -s * 0.25 });
        b.add(ball(0.13, 0), '#b88f62', { x: s * 0.42, y: 0.28, z: 0.05, sx: 1.6, sy: 0.5 });
      }
      eyes(b, 0.53, 0.3, 0.15, 0.07);
      blush(b, 0.48, 0.12, 0.26);
    },
    leg: (b) => {
      b.add(cyl(0.08, 0.085, 0.64, 6), ['#b88f62', '#cfa77a'], { y: -0.32 });
      b.add(cyl(0.09, 0.09, 0.08, 6), '#4a3a2a', { y: -0.66 });
    },
  },
  // Chibi horse: big head, short balanced body, legs not too long, clear eyes, stylised mane / tail.
  // White coat -> tinted per breed (bay, black, white, chestnut, dapple).
  horse: {
    rig: {
      head: { x: 0, y: 1.72, z: 0.72 },
      hips: [{ x: -0.3, z: 0.5 }, { x: 0.3, z: 0.5 }, { x: -0.3, z: -0.5 }, { x: 0.3, z: -0.5 }],
      hipY: 0.92,
      legLength: 0.88,
      speed: 1.6,
      gait: 6,
      eatPitch: 1.05,
      height: 2.7,
      seat: { y: 1.62, z: -0.05 },
      tail: { y: 1.5, z: -0.82 },
    },
    body: (b, d) => {
      b.add(box(0.95, 0.82, 1.55, 0.38), W, { y: 1.3 });
      b.add(ball(0.42, d), W, { y: 1.42, z: 0.6, sx: 1.05 }); // chest
      b.add(cyl(0.26, 0.34, 0.62, 10), W, { y: 1.68, z: 0.66, rx: -0.5 }); // neck
      for (let i = 0; i < 5; i += 1) b.add(ball(0.13, 0), MANE, { y: 1.62 + i * 0.09, z: 0.38 + i * 0.09, sx: 0.55 }); // mane
    },
    head: (b, d) => {
      b.add(ball(0.5, d), W, { y: 0.28, z: 0.12, sy: 1.05 });
      b.add(box(0.5, 0.4, 0.5, 0.18), W, { y: 0.06, z: 0.52 }); // muzzle
      b.add(box(0.46, 0.14, 0.2, 0.06), ['#e9c7b4', '#f6dccd'], { y: -0.06, z: 0.74 });
      for (const s of [-1, 1]) b.add(ball(0.04, 0), '#4a3434', { x: s * 0.1, y: 0.02, z: 0.79 });
      for (const s of [-1, 1]) b.add(cone(0.1, 0.28, 5), W, { x: s * 0.22, y: 0.78, z: 0.02, rz: -s * 0.25 });
      b.add(ball(0.2, 0), MANE, { y: 0.72, z: 0.32, sy: 0.6, sz: 0.8 }); // forelock
      b.add(ball(0.14, 0), MANE, { y: 0.58, z: 0.5, sy: 0.6 });
      eyes(b, 0.5, 0.36, 0.24, 0.095);
      blush(b, 0.48, 0.16, 0.34);
    },
    leg: (b) => {
      b.add(cyl(0.12, 0.11, 0.74, 8), W, { y: -0.37 });
      b.add(cyl(0.135, 0.13, 0.14, 8), '#3a302a', { y: -0.8 }); // hoof
    },
    tail: (b) => {
      b.add(ball(0.16, 1), MANE, { z: -0.12, sy: 0.9 });
      b.add(ball(0.2, 1), MANE, { y: -0.25, z: -0.3, sx: 0.8, sy: 1.4 });
      b.add(ball(0.17, 1), MANE, { y: -0.6, z: -0.38, sx: 0.7, sy: 1.3 });
    },
    tack: {
      saddle: (b) => {
        b.add(box(0.72, 0.12, 0.7, 0.06), ['#8f2f2a', '#c24a3a'], { y: -0.02 }); // blanket
        b.add(box(0.5, 0.16, 0.52, 0.08), [LEATHER, '#a06a3a'], { y: 0.08 });
        b.add(box(0.42, 0.18, 0.1, 0.05), LEATHER, { y: 0.18, z: 0.24 }); // pommel
        b.add(box(0.46, 0.16, 0.1, 0.05), LEATHER, { y: 0.16, z: -0.24 }); // cantle
        for (const s of [-1, 1]) {
          b.add(box(0.03, 0.5, 0.05, 0.01), '#4e3420', { x: s * 0.3, y: -0.26 }); // stirrup leather
          b.add(box(0.12, 0.05, 0.12, 0.02), BRASS, { x: s * 0.31, y: -0.52 }); // stirrup
        }
      },
      armor: (b) => {
        for (const s of [-1, 1]) b.add(box(0.06, 0.62, 1.3, 0.05), ['#7c858f', '#c3cad3'], { x: s * 0.52, y: -0.42, z: 0 });
        b.add(box(0.9, 0.6, 0.08, 0.05), ['#7c858f', '#c3cad3'], { y: -0.3, z: 0.85 });
        b.add(box(0.98, 0.06, 0.06, 0.02), BRASS, { y: -0.12, z: 0.88 });
      },
      harness: (b) => {
        b.add(box(1.0, 0.06, 0.22, 0.02), LEATHER, { y: -0.08, z: 0.15 });
        for (const s of [-1, 1]) b.add(box(0.05, 0.55, 0.12, 0.02), LEATHER, { x: s * 0.5, y: -0.32, z: 0.15 });
      },
      crates: (b) => {
        for (const s of [-1, 1]) {
          b.add(box(0.34, 0.4, 0.5, 0.05), ['#c49a5a', '#e2bd7c'], { x: s * 0.62, y: -0.2 });
          b.add(box(0.36, 0.04, 0.52, 0.01), '#8a5a32', { x: s * 0.62, y: -0.06 });
        }
      },
    },
  },
  // Chibi elephant: round body, big head, clear ears, soft trunk (3 segments), short heavy legs,
  // much bigger than a chibi villager.
  elephant: {
    rig: {
      head: { x: 0, y: 2.25, z: 1.15 },
      hips: [{ x: -0.62, z: 0.72 }, { x: 0.62, z: 0.72 }, { x: -0.62, z: -0.72 }, { x: 0.62, z: -0.72 }],
      hipY: 1.12,
      legLength: 1.05,
      speed: 0.85,
      gait: 3.6,
      eatPitch: 0.45,
      height: 4.2,
      seat: { y: 3.12, z: 0.05 },
      trunk: { y: -0.12, z: 0.88, segment: 0.48 },
      ears: [{ x: -0.72, y: 0.4, z: 0.15 }, { x: 0.72, y: 0.4, z: 0.15 }],
    },
    body: (b, d) => {
      b.add(ball(1.28, d), W, { y: 2.05, sx: 1.02, sy: 0.92, sz: 1.22 });
      b.add(cone(0.08, 0.55, 5), W, { y: 2.1, z: -1.55, rx: -2.3 }); // tail
      b.add(ball(0.09, 0), '#3b3438', { y: 1.72, z: -1.72 });
    },
    head: (b, d) => {
      b.add(ball(0.95, d), W, { y: 0.3, z: 0.38, sx: 1.02 });
      b.add(ball(0.5, d), W, { y: -0.02, z: 0.86 }); // trunk base
      for (const s of [-1, 1]) b.add(cone(0.09, 0.5, 6), ['#efe7d6', '#fffaf0'], { x: s * 0.36, y: -0.32, z: 1.05, rx: 1.9 }); // tusks
      eyes(b, 1.06, 0.48, 0.38, 0.11);
      blush(b, 1.0, 0.2, 0.58);
      b.add(ball(0.26, 0), ['#e6c7cf', '#f4dde2'], { y: 1.02, z: 0.42, sy: 0.4 });
    },
    leg: (b) => {
      b.add(cyl(0.32, 0.3, 0.92, 10), W, { y: -0.46 });
      b.add(cyl(0.34, 0.34, 0.14, 10), W, { y: -0.98 });
      for (const x of [-0.16, 0, 0.16]) b.add(ball(0.08, 0), '#f1ece2', { x, y: -1.0, z: 0.3, sy: 0.7 }); // toenails
    },
    trunk: (b) => b.add(cyl(0.2, 0.17, 0.5, 10), W, { y: -0.25 }),
    ear: (b) => {
      b.add(cyl(0.62, 0.62, 0.1, 14), W, { z: -0.1, rz: Math.PI / 2 });
      b.add(cyl(0.48, 0.48, 0.11, 14), ['#e6c7cf', '#f4dde2'], { z: -0.08, rz: Math.PI / 2 });
    },
    tack: {
      harness: (b) => {
        b.add(box(2.1, 0.1, 0.35, 0.04), LEATHER, { y: -0.12, z: 0.1 });
        for (const s of [-1, 1]) b.add(box(0.08, 1.2, 0.2, 0.03), LEATHER, { x: s * 1.1, y: -0.65, z: 0.1 });
      },
      crates: (b) => {
        for (const s of [-1, 1]) {
          b.add(box(0.6, 0.8, 0.9, 0.08), ['#c49a5a', '#e2bd7c'], { x: s * 1.25, y: -0.55 });
          b.add(box(0.62, 0.06, 0.92, 0.02), '#8a5a32', { x: s * 1.25, y: -0.3 });
          b.add(ball(0.28, 1), ['#3d8a36', '#86cc5c'], { x: s * 1.25, y: -0.05, z: 0.2 }); // greens
        }
      },
      howdah: (b) => {
        b.add(box(1.3, 0.16, 1.4, 0.06), ['#8f2f2a', '#c24a3a'], { y: 0.02 }); // carpet
        b.add(box(1.1, 0.5, 1.1, 0.08), ['#a8743f', '#d39a5b'], { y: 0.33 });
        for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) b.add(cyl(0.05, 0.05, 1.0, 6), '#7a5232', { x, y: 0.95, z });
        b.add(cone(0.95, 0.5, 4), ['#c94f3a', '#e86b55'], { y: 1.65, ry: Math.PI / 4 });
        b.add(ball(0.1, 0), BRASS, { y: 1.95 });
      },
    },
  },
};

function build(fn: (b: ModelBuilder) => void): THREE.BufferGeometry {
  const b = new ModelBuilder();
  fn(b);
  return b.build();
}

export function buildAnimalParts(code: AnimalTypeCode): AnimalParts {
  const s = SPECIES[code];
  const body = build((b) => s.body(b, 1));
  const head = build((b) => s.head(b, 1));
  const leg = build((b) => s.leg(b, 1));
  // Far LOD: low-detail parts merged in the rest pose (one geometry per species).
  const lodParts: THREE.BufferGeometry[] = [build((b) => s.body(b, 0))];
  const h = build((b) => s.head(b, 0));
  h.translate(s.rig.head.x, s.rig.head.y, s.rig.head.z);
  lodParts.push(h);
  for (const hip of s.rig.hips) {
    const l = build((b) => s.leg(b, 0));
    l.translate(hip.x, s.rig.hipY, hip.z);
    lodParts.push(l);
  }
  // Optional parts in their rest pose for the LOD (trunk straight down, ears flat, tail hanging).
  if (s.trunk && s.rig.trunk) {
    for (let i = 0; i < 3; i += 1) {
      const g = build(s.trunk);
      const k = 1 - i * 0.18;
      g.scale(k, k, k);
      g.translate(s.rig.head.x, s.rig.head.y + s.rig.trunk.y - i * s.rig.trunk.segment * 0.9, s.rig.head.z + s.rig.trunk.z);
      lodParts.push(g);
    }
  }
  if (s.ear && s.rig.ears) {
    for (const e of s.rig.ears) {
      const g = build(s.ear);
      g.translate(s.rig.head.x + e.x, s.rig.head.y + e.y, s.rig.head.z + e.z);
      lodParts.push(g);
    }
  }
  if (s.tail && s.rig.tail) {
    const g = build(s.tail);
    g.translate(0, s.rig.tail.y, s.rig.tail.z);
    lodParts.push(g);
  }
  const lod = mergeGeometries(lodParts, false)!;
  lodParts.forEach((p) => p.dispose());
  lod.computeBoundingSphere();
  let tack: AnimalParts['tack'];
  if (s.tack) {
    tack = {};
    for (const [k, fn] of Object.entries(s.tack)) if (fn) tack[k as keyof typeof tack] = build(fn);
  }
  return {
    body,
    head,
    leg,
    lod,
    rig: s.rig,
    trunk: s.trunk ? build(s.trunk) : undefined,
    ear: s.ear ? build(s.ear) : undefined,
    tail: s.tail ? build(s.tail) : undefined,
    tack,
  };
}

/** Cached parts per species. */
export class AnimalModelCache {
  private readonly cache = new Map<AnimalTypeCode, AnimalParts>();

  get(code: AnimalTypeCode): AnimalParts {
    let p = this.cache.get(code);
    if (!p) {
      p = buildAnimalParts(code);
      this.cache.set(code, p);
    }
    return p;
  }

  dispose(): void {
    for (const p of this.cache.values()) {
      p.body.dispose();
      p.head.dispose();
      p.leg.dispose();
      p.lod.dispose();
      p.trunk?.dispose();
      p.ear?.dispose();
      p.tail?.dispose();
      for (const g of Object.values(p.tack ?? {})) g?.dispose();
    }
    this.cache.clear();
  }
}
