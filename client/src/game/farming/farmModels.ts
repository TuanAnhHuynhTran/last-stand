/**
 * Chibi agriculture models (procedural, vertex-coloured, one merged geometry each):
 *  - crop plants per crop × growth stage (instanced in bulk by FarmRenderer)
 *  - chibi farmer with a conical "nón lá" hat
 *  - field structures: thatched hut, pump station, windmill, scarecrow, flag, hay bale
 *
 * Local frame: ground at y = 0, structures face +Z.
 */
import * as THREE from 'three';
import { createRng, type CropTypeCode } from '@cityverse/shared';
import { ModelBuilder, ball, box, cone, cyl, gablePrism, gableRoof, shade } from '../buildings/modelKit';

export type StageIndex = 0 | 1 | 2 | 3;

const G = {
  sprout: '#9be86a',
  young: '#6fd34f',
  leaf: '#4fb53d',
  deep: '#3a9a35',
  gold: '#f2c84b',
  goldDeep: '#d9a332',
  straw: '#e8cf7a',
};

// ─────────────────────────────────────────────────────────────────────────────
// Crops
// ─────────────────────────────────────────────────────────────────────────────

/** Fan of tapered blades (rice, grass, corn leaves). */
function blades(b: ModelBuilder, n: number, h: number, w: number, colors: [string, string], spread: number, seed: number, tilt = 0.32): void {
  const rng = createRng(seed);
  for (let i = 0; i < n; i += 1) {
    const a = (Math.PI * 2 * i) / n + rng() * 0.5;
    const hh = h * (0.8 + rng() * 0.35);
    const t = tilt * (0.7 + rng() * 0.6);
    b.add(cone(w, hh, 4), colors, {
      x: Math.cos(a) * spread,
      y: hh / 2 * Math.cos(t),
      z: Math.sin(a) * spread,
      rx: Math.sin(a) * t,
      rz: -Math.cos(a) * t,
    });
  }
}

function rice(stage: StageIndex): THREE.BufferGeometry {
  const b = new ModelBuilder();
  if (stage === 0) {
    // Freshly sown: tiny bright sprouts poking out of the paddy water.
    blades(b, 4, 0.55, 0.06, [G.young, G.sprout], 0.08, 11, 0.4);
  } else if (stage === 1) {
    blades(b, 7, 0.8, 0.09, [G.leaf, G.sprout], 0.12, 12, 0.35);
  } else if (stage === 2) {
    blades(b, 12, 1.45, 0.12, [G.deep, G.young], 0.2, 13, 0.32);
  } else {
    blades(b, 12, 1.45, 0.12, [G.goldDeep, G.gold], 0.2, 14, 0.32);
    // Drooping golden panicles.
    for (let i = 0; i < 4; i += 1) {
      const a = (Math.PI * 2 * i) / 4 + 0.4;
      for (let k = 0; k < 3; k += 1) {
        const r = 0.24 + k * 0.11;
        b.add(ball(0.1, 0), ['#e9b93c', '#fbe08a'], { x: Math.cos(a) * r, y: 1.55 - k * 0.13, z: Math.sin(a) * r, sy: 1.3 });
      }
    }
  }
  return b.build();
}

function corn(stage: StageIndex): THREE.BufferGeometry {
  const g = new ModelBuilder();
  if (stage === 0) {
    blades(g, 2, 0.35, 0.06, [G.young, G.sprout], 0.04, 21, 0.5);
    g.add(ball(0.12, 0), '#7a5534', { y: 0.02, sy: 0.4 });
    return g.build();
  }
  const h = stage === 1 ? 0.9 : stage === 2 ? 2.3 : 2.5;
  const leafColor: [string, string] = stage === 3 ? ['#9ab33f', '#d6d36a'] : [G.deep, G.young];
  const leaves = stage === 1 ? 4 : 7;
  const len = stage === 1 ? 0.55 : 0.95;
  g.add(cyl(0.06, 0.1, h, 6), stage === 3 ? ['#8fa040', '#c9c060'] : ['#3f9a35', '#79cf55'], { y: h / 2 });
  for (let i = 0; i < leaves; i += 1) {
    const a = i * 2.4;
    const y = h * (0.2 + (i / leaves) * 0.65);
    g.add(box(len, 0.04, 0.2, 0.02), leafColor, { x: Math.cos(a) * len * 0.45, y, z: Math.sin(a) * len * 0.45, ry: -a, rz: 0.45 });
  }
  if (stage >= 2) {
    // Tassel
    for (let i = 0; i < 5; i += 1) {
      const a = (Math.PI * 2 * i) / 5;
      g.add(cone(0.035, 0.45, 4), stage === 3 ? ['#b07a3a', '#e0b060'] : ['#c9d76a', '#f2f0a0'], {
        x: Math.cos(a) * 0.08,
        y: h + 0.15,
        z: Math.sin(a) * 0.08,
        rx: Math.sin(a) * 0.5,
        rz: -Math.cos(a) * 0.5,
      });
    }
  }
  if (stage === 2) {
    g.add(ball(0.13, 1), ['#7fbf4a', '#b6e07a'], { x: 0.14, y: h * 0.55, z: 0.05, sy: 1.9 });
  } else if (stage === 3) {
    for (const [dx, y, ry] of [[0.16, 0.5, 0], [-0.15, 0.62, 2.6]] as const) {
      g.add(ball(0.17, 1), ['#f0b52e', '#ffe27a'], { x: dx, y: h * y, z: 0.04, sy: 1.9, rz: dx > 0 ? -0.35 : 0.35, ry });
      g.add(cone(0.15, 0.36, 5), ['#9ab33f', '#c8d86a'], { x: dx * 1.1, y: h * y - 0.32, z: 0.04, rx: Math.PI });
    }
  }
  return g.build();
}

function cabbage(stage: StageIndex): THREE.BufferGeometry {
  const b = new ModelBuilder();
  if (stage === 0) {
    b.add(ball(0.07, 0), G.young, { x: 0.06, y: 0.05 });
    b.add(ball(0.06, 0), G.sprout, { x: -0.05, y: 0.05, z: 0.03 });
    return b.build();
  }
  const leaves = stage === 1 ? 3 : 6;
  const r = stage === 1 ? 0.16 : stage === 2 ? 0.3 : 0.36;
  for (let i = 0; i < leaves; i += 1) {
    const a = (Math.PI * 2 * i) / leaves;
    b.add(ball(r, 1), ['#4aa84a', '#9fe08a'], {
      x: Math.cos(a) * r * 0.9,
      y: r * 0.35,
      z: Math.sin(a) * r * 0.9,
      sy: 0.35,
      rx: Math.sin(a) * 0.5,
      rz: -Math.cos(a) * 0.5,
    });
  }
  if (stage === 2) b.add(ball(0.2, 1), ['#8fd47a', '#d4f5b8'], { y: 0.22 });
  if (stage === 3) {
    b.add(ball(0.33, 1), ['#9ad882', '#e6fbd2'], { y: 0.34, sy: 0.92 });
    b.add(ball(0.2, 1), ['#bfeaa6', '#f2fde6'], { y: 0.52, sy: 0.7 });
  }
  return b.build();
}

function carrot(stage: StageIndex): THREE.BufferGeometry {
  const b = new ModelBuilder();
  if (stage === 0) {
    blades(b, 2, 0.18, 0.04, [G.young, G.sprout], 0.03, 41, 0.4);
    return b.build();
  }
  const n = stage === 1 ? 3 : 6;
  const h = stage === 1 ? 0.35 : 0.65;
  blades(b, n, h, 0.07, ['#3f9a35', '#8fe06a'], 0.05, 42 + stage, 0.45);
  for (let i = 0; i < n; i += 1) {
    const a = (Math.PI * 2 * i) / n;
    b.add(ball(0.08, 0), '#8fe06a', { x: Math.cos(a) * h * 0.35, y: h * 0.85, z: Math.sin(a) * h * 0.35 });
  }
  if (stage === 3) {
    // Chibi orange shoulder poking out of the soil.
    b.add(cone(0.2, 0.55, 8), ['#e8661f', '#ff9a3c'], { y: -0.12, rx: Math.PI });
    b.add(cyl(0.2, 0.2, 0.08, 8), '#ff9a3c', { y: 0.15 });
  }
  return b.build();
}

function orange(stage: StageIndex): THREE.BufferGeometry {
  const b = new ModelBuilder();
  if (stage === 0) {
    b.add(cyl(0.04, 0.05, 0.9, 5), '#8a5a32', { y: 0.45 });
    b.add(cyl(0.03, 0.03, 1.1, 4), '#c9a46c', { x: 0.18, y: 0.55 }); // stake
    b.add(ball(0.18, 0), ['#4fb53d', '#8fe06a'], { y: 0.92, sy: 0.7 });
    b.add(ball(0.12, 0), ['#4fb53d', '#8fe06a'], { x: 0.1, y: 0.8, sy: 0.6 });
    return b.build();
  }
  const trunkH = stage === 1 ? 0.9 : 1.3;
  const r = stage === 1 ? 0.85 : stage === 2 ? 1.35 : 1.5;
  b.add(cyl(0.12, 0.18, trunkH + r * 0.4, 7), ['#7a5232', '#a07048'], { y: (trunkH + r * 0.4) / 2 });
  b.add(ball(r, 1), ['#2f8a3a', '#6fcf55'], { y: trunkH + r * 0.75 });
  b.add(ball(r * 0.6, 1), ['#3d9a3f', '#86dc62'], { x: r * 0.55, y: trunkH + r * 0.5, z: r * 0.2 });
  b.add(ball(r * 0.55, 1), ['#3d9a3f', '#86dc62'], { x: -r * 0.5, y: trunkH + r * 0.55, z: -r * 0.25 });
  const rng = createRng(50 + stage);
  if (stage >= 2) {
    const n = stage === 2 ? 10 : 12;
    for (let i = 0; i < n; i += 1) {
      const u = rng() * Math.PI * 2;
      const v = 0.25 + rng() * 0.9;
      const p = new THREE.Vector3(Math.cos(u) * Math.sin(v), Math.cos(v), Math.sin(u) * Math.sin(v)).multiplyScalar(r * 0.98);
      if (stage === 2) {
        b.add(ball(0.12, 0), ['#ffffff', '#fff6fb'], { x: p.x, y: trunkH + r * 0.75 + p.y, z: p.z });
      } else {
        b.add(ball(0.22, 1), ['#f07a12', '#ffb340'], { x: p.x, y: trunkH + r * 0.75 + p.y * 0.9, z: p.z });
      }
    }
  }
  return b.build();
}

function clover(stage: StageIndex): THREE.BufferGeometry {
  const b = new ModelBuilder();
  if (stage === 0) {
    blades(b, 3, 0.14, 0.04, [G.young, G.sprout], 0.06, 61, 0.5);
    return b.build();
  }
  const h = stage === 1 ? 0.4 : stage === 2 ? 0.75 : 0.85;
  const colors: [string, string] = stage === 3 ? ['#c9a43c', '#f3dc84'] : stage === 2 ? ['#4fb53d', '#a6ec7a'] : [G.leaf, G.sprout];
  blades(b, stage === 1 ? 8 : 14, h, 0.11, colors, 0.2, 62 + stage, 0.5);
  if (stage === 2) {
    for (const [dx, dz, c] of [[0.18, 0.05, '#ffffff'], [-0.12, -0.14, '#ffb7d5']] as const) {
      b.add(ball(0.09, 0), c, { x: dx, y: h * 0.8, z: dz });
    }
  }
  if (stage === 3) {
    for (const [dx, dz] of [[0.15, 0.04], [-0.1, -0.12], [0.02, 0.17]] as const) {
      b.add(ball(0.06, 0), '#ffe9a0', { x: dx, y: h * 0.95, z: dz, sy: 1.6 });
    }
  }
  return b.build();
}

const CROP_BUILDERS: Record<CropTypeCode, (stage: StageIndex) => THREE.BufferGeometry> = {
  rice,
  corn,
  cabbage,
  carrot,
  orange,
  clover,
};

/** Trees sway less than herbaceous crops. */
export const CROP_WIND: Record<CropTypeCode, number> = {
  rice: 0.14,
  corn: 0.07,
  cabbage: 0.03,
  carrot: 0.09,
  orange: 0.02,
  clover: 0.16,
};

export function buildCropGeometry(crop: CropTypeCode, stage: StageIndex): THREE.BufferGeometry {
  return CROP_BUILDERS[crop](stage);
}

// ─────────────────────────────────────────────────────────────────────────────
// Farmer
// ─────────────────────────────────────────────────────────────────────────────

/** Chibi farmer (~1.6 m): big head, nón lá, hoe over the shoulder. Faces +Z. */
export function buildFarmerGeometry(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  // Legs
  for (const s of [-1, 1]) b.add(box(0.2, 0.42, 0.22, 0.08), ['#3d4a66', '#4f5f80'], { x: s * 0.13, y: 0.21 });
  // Body (indigo "áo bà ba")
  b.add(box(0.56, 0.55, 0.4, 0.16), ['#3f5fa8', '#5a7fd0'], { y: 0.66 });
  b.add(box(0.6, 0.08, 0.44, 0.04), '#d9b46a', { y: 0.47 }); // sash
  // Arms
  for (const s of [-1, 1]) b.add(box(0.16, 0.4, 0.16, 0.07), ['#3f5fa8', '#5a7fd0'], { x: s * 0.36, y: 0.68, rz: s * 0.25 });
  for (const s of [-1, 1]) b.add(ball(0.09, 0), '#f6c9a0', { x: s * 0.42, y: 0.47 });
  // Head (big chibi head)
  b.add(ball(0.33, 1), ['#f2bf94', '#ffd9b8'], { y: 1.18 });
  for (const s of [-1, 1]) b.add(ball(0.045, 0), '#2b2116', { x: s * 0.12, y: 1.2, z: 0.3 });
  b.add(ball(0.05, 0), '#ff9f8f', { x: 0.18, y: 1.1, z: 0.27, sy: 0.6 });
  b.add(ball(0.05, 0), '#ff9f8f', { x: -0.18, y: 1.1, z: 0.27, sy: 0.6 });
  // Nón lá (conical hat)
  b.add(cone(0.62, 0.42, 16), ['#d9be7c', '#f6e6b4'], { y: 1.55 });
  // Hoe over the shoulder
  b.add(cyl(0.035, 0.035, 1.5, 5), ['#8a5a32', '#b07a48'], { x: 0.3, y: 0.95, z: -0.12, rx: -0.9, rz: -0.2 });
  b.add(box(0.28, 0.06, 0.2, 0.02), '#9aa3ad', { x: 0.33, y: 1.5, z: -0.6, rx: -0.9 });
  return b.build();
}

// ─────────────────────────────────────────────────────────────────────────────
// Structures (local frame, facing +Z)
// ─────────────────────────────────────────────────────────────────────────────

/** Chòi canh: bamboo stilts, platform, thatched roof, ladder. */
export function buildHut(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const bamboo: [string, string] = ['#a8913f', '#d6c06a'];
  for (const [x, z] of [[-1, -0.9], [1, -0.9], [-1, 0.9], [1, 0.9]] as const) {
    b.add(cyl(0.09, 0.1, 1.9, 6), bamboo, { x, y: 0.95, z });
  }
  b.add(box(2.4, 0.16, 2.2, 0.05), ['#9b7a45', '#c49a5a'], { y: 1.5 });
  for (let i = 0; i < 5; i += 1) b.add(box(0.06, 0.5, 0.06, 0.02), bamboo, { x: -1.1 + i * 0.55, y: 1.82, z: -1.05 });
  b.add(box(2.3, 0.06, 0.06, 0.02), bamboo, { y: 2.05, z: -1.05 });
  for (const x of [-1, 1]) b.add(cyl(0.07, 0.07, 1.3, 5), bamboo, { x, y: 2.2, z: 0 });
  gableRoof(
    b,
    { width: 2.3, depth: 2.2, height: 1.15, overhang: 0.45, color: '#e2c46e', rows: 3, stripe: 0.12, gable: '#c9a44e' },
    0,
    2.75,
    0,
    Math.PI / 2
  );
  // Ladder
  for (const x of [-0.25, 0.25]) b.add(cyl(0.04, 0.04, 1.7, 4), bamboo, { x, y: 0.75, z: 1.45, rx: -0.35 });
  for (let i = 0; i < 4; i += 1) b.add(cyl(0.03, 0.03, 0.5, 4), bamboo, { y: 0.25 + i * 0.36, z: 1.62 - i * 0.13, rz: Math.PI / 2 });
  // Water jar
  b.add(ball(0.32, 1), ['#8a4f2c', '#c07a48'], { x: 1.45, y: 0.3, z: 0.7, sy: 0.95 });
  return b.build();
}

/** Trạm bơm chibi: small whitewashed house, red tile roof, blue pipe into the canal. */
export function buildPumpStation(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(box(3.0, 0.3, 2.6, 0.08), ['#9d958a', '#c9c1b5'], { y: 0.15 });
  b.add(box(2.6, 2.0, 2.2, 0.16), ['#e9dfcc', '#fffaf0'], { y: 1.3 });
  b.add(box(0.8, 1.3, 0.1, 0.05), ['#2f6fa8', '#4f98d8'], { y: 0.95, z: 1.12 });
  b.add(box(0.7, 0.55, 0.1, 0.05), ['#8fd3f0', '#e6f8ff'], { x: -1.31, y: 1.5, ry: Math.PI / 2 });
  gableRoof(
    b,
    { width: 2.7, depth: 2.3, height: 1.1, overhang: 0.35, color: '#d9603b', rows: 3, gable: '#efe4d0' },
    0,
    2.3,
    0
  );
  // Pipe out of the side wall, bending down into the canal (toward +Z / outside).
  b.add(cyl(0.22, 0.22, 1.6, 10), ['#3b7fb8', '#6fb2e8'], { x: 1.9, y: 0.9, rz: Math.PI / 2 });
  b.add(cyl(0.22, 0.22, 1.1, 10), ['#3b7fb8', '#6fb2e8'], { x: 2.7, y: 0.45 });
  b.add(cyl(0.3, 0.3, 0.16, 10), '#2f5f88', { x: 1.3, y: 0.9, rz: Math.PI / 2 });
  // Pump wheel (static part; the hub turns in FarmRenderer)
  b.add(cyl(0.5, 0.5, 0.12, 14), ['#6b6f78', '#9aa0aa'], { x: -0.7, y: 1.2, z: 1.2, rx: Math.PI / 2 });
  b.add(ball(0.12, 0), '#f2c14e', { x: -0.7, y: 1.2, z: 1.3 });
  return b.build();
}

/** Windmill tower (the blades are a separate, rotating mesh). */
export function buildWindmillTower(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(cyl(0.75, 1.15, 4.6, 8), ['#e7dcc6', '#fffaf0'], { y: 2.3 });
  b.add(cone(1.05, 1.1, 8), ['#c4553a', '#e27a52'], { y: 5.1 });
  b.add(box(0.7, 1.0, 0.1, 0.05), ['#8a5a32', '#b07a48'], { y: 0.5, z: 1.0, rx: -0.08 });
  b.add(box(0.5, 0.5, 0.1, 0.05), ['#8fd3f0', '#e6f8ff'], { y: 3.0, z: 0.86, rx: -0.08 });
  b.add(cyl(0.18, 0.18, 0.6, 8), '#6b4a2e', { y: 4.55, z: 0.95, rx: Math.PI / 2 });
  // Trough
  b.add(box(1.6, 0.4, 0.6, 0.08), ['#8a5a32', '#b07a48'], { x: 1.6, y: 0.2, z: 0.6 });
  b.add(box(1.4, 0.06, 0.44, 0.03), '#7fd0ee', { x: 1.6, y: 0.38, z: 0.6 });
  return b.build();
}

/** Four chibi sails around the origin in the XY plane (rotate around Z). */
export function buildWindmillBlades(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(ball(0.26, 1), '#f2c14e', {});
  for (let i = 0; i < 4; i += 1) {
    const a = (Math.PI / 2) * i;
    b.add(box(0.16, 1.9, 0.08, 0.03), '#7a5232', { x: Math.sin(a) * 1.0, y: Math.cos(a) * 1.0, rz: -a });
    b.add(box(0.55, 1.4, 0.05, 0.04), ['#f6eee0', '#ffffff'], { x: Math.sin(a) * 1.15 + Math.cos(a) * 0.3, y: Math.cos(a) * 1.15 - Math.sin(a) * 0.3, rz: -a });
  }
  return b.build();
}

/** Bù nhìn: post, straw head, conical hat, patched shirt. */
export function buildScarecrow(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(cyl(0.06, 0.07, 2.0, 5), ['#7a5232', '#9c6b43'], { y: 1.0 });
  b.add(cyl(0.05, 0.05, 1.6, 5), ['#7a5232', '#9c6b43'], { y: 1.45, rz: Math.PI / 2 });
  b.add(box(0.7, 0.75, 0.32, 0.12), ['#c0473a', '#e46a55'], { y: 1.3 });
  b.add(box(0.2, 0.2, 0.05, 0.03), '#f2c14e', { x: 0.15, y: 1.35, z: 0.17 });
  b.add(ball(0.3, 1), [G.straw, '#f7e8b0'], { y: 2.0 });
  for (const s of [-1, 1]) b.add(ball(0.04, 0), '#2b2116', { x: s * 0.1, y: 2.03, z: 0.27 });
  b.add(cone(0.55, 0.35, 12), ['#cfae62', '#ecd592'], { y: 2.35 });
  for (const s of [-1, 1]) b.add(cone(0.1, 0.3, 4), G.straw, { x: s * 0.85, y: 1.45, rz: s * Math.PI / 2 });
  return b.build();
}

export function buildFlag(color: string): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(cyl(0.05, 0.06, 2.6, 5), ['#8a5a32', '#b07a48'], { y: 1.3 });
  b.add(ball(0.08, 0), '#f2c14e', { y: 2.65 });
  b.add(gablePrism(0.06, 0.7, 0.9), [shade(color, 0.85), color], { x: 0, y: 2.0, z: 0.03, rz: -Math.PI / 2, ry: Math.PI / 2 });
  return b.build();
}

/** Rolled hay bale lying on its side. */
export function buildHayBale(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(cyl(0.6, 0.6, 1.0, 12), [G.goldDeep, G.straw], { y: 0.6, rz: Math.PI / 2 });
  b.add(cyl(0.45, 0.45, 1.02, 12), '#f7e8b0', { y: 0.6, rz: Math.PI / 2 });
  return b.build();
}

/** Basket of produce (orchard L3, garden). */
export function buildBasket(fill: string): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(cyl(0.38, 0.3, 0.4, 10), ['#a8743f', '#d39a5b'], { y: 0.2 });
  for (let i = 0; i < 5; i += 1) {
    const a = (Math.PI * 2 * i) / 5;
    b.add(ball(0.15, 0), fill, { x: Math.cos(a) * 0.16, y: 0.45, z: Math.sin(a) * 0.16 });
  }
  b.add(ball(0.15, 0), fill, { y: 0.55 });
  return b.build();
}
