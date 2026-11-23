/**
 * Chibi villagers on ONE normalised skeleton (≈1.85 m, head ≈0.66 m → ~2.8 heads tall; never
 * realistic proportions). Every villager shares the rig, so every animation works for all.
 *
 * Parts are separate instanced meshes so colours can vary per villager via instance colour:
 *   tinted white parts: head (skin), hand (skin), hair ×4 styles (hair), torso + arm (shirt),
 *                       hips + leg (pants), apron, hats ×8 styles (profession colour)
 *   fixed-colour parts: face (eyes, blush), mouths ×4 moods, tools ×8, cart, crate, far LOD
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HatStyle, Mood, ToolStyle } from '@cityverse/shared';
import { ModelBuilder, ball, box, cone, cyl } from '../buildings/modelKit';

const W = '#ffffff';
const W2: [string, string] = ['#dcdcdc', '#ffffff'];

/** The shared skeleton (local metres, feet at y = 0, facing +Z). */
export const RIG = {
  hipY: 0.55,
  hipX: 0.12,
  legLength: 0.5,
  neckY: 1.15,
  headY: 0.33,
  shoulderY: 1.06,
  shoulderX: 0.27,
  armLength: 0.42,
  height: 1.85,
} as const;

export interface VillagerParts {
  head: THREE.BufferGeometry;
  face: THREE.BufferGeometry;
  mouths: Record<Mood, THREE.BufferGeometry>;
  hair: THREE.BufferGeometry[];
  torso: THREE.BufferGeometry;
  hips: THREE.BufferGeometry;
  apron: THREE.BufferGeometry;
  arm: THREE.BufferGeometry;
  hand: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
  hats: Record<Exclude<HatStyle, 'none'>, THREE.BufferGeometry>;
  tools: Record<Exclude<ToolStyle, 'none' | 'cart'>, THREE.BufferGeometry>;
  cart: THREE.BufferGeometry;
  crate: THREE.BufferGeometry;
  lod: THREE.BufferGeometry;
}

const build = (fn: (b: ModelBuilder) => void): THREE.BufferGeometry => {
  const b = new ModelBuilder();
  fn(b);
  return b.build();
};

/** All parts (built once and shared by every villager). */
export function buildVillagerParts(): VillagerParts {
  const head = build((b) => {
    b.add(ball(RIG.headY, 2), W2, { y: RIG.headY, sx: 1.05, sz: 0.98 });
    for (const s of [-1, 1]) b.add(ball(0.07, 1), W, { x: s * 0.33, y: RIG.headY, z: 0 });
  });
  const face = build((b) => {
    for (const s of [-1, 1]) {
      b.add(ball(0.075, 1), '#2b2116', { x: s * 0.12, y: RIG.headY + 0.04, z: 0.29, sy: 1.25, sz: 0.5 });
      b.add(ball(0.025, 0), '#ffffff', { x: s * 0.12 + 0.025, y: RIG.headY + 0.08, z: 0.325 });
      b.add(ball(0.055, 0), '#ff9f8f', { x: s * 0.2, y: RIG.headY - 0.07, z: 0.27, sy: 0.55, sz: 0.4 });
    }
  });
  const arc = (b: ModelBuilder, curve: number, color = '#7a3a2a') => {
    for (let i = -2; i <= 2; i += 1) b.add(ball(0.018, 0), color, { x: i * 0.028, y: RIG.headY - 0.13 + curve * (i * i) * 0.008, z: 0.31 });
  };
  const mouths: Record<Mood, THREE.BufferGeometry> = {
    happy: build((b) => {
      arc(b, 1.6);
      b.add(ball(0.035, 0), '#e06a6a', { y: RIG.headY - 0.12, z: 0.305, sx: 1.4, sy: 0.6 });
    }),
    content: build((b) => arc(b, 0.8)),
    tired: build((b) => {
      b.add(ball(0.035, 0), '#7a3a2a', { y: RIG.headY - 0.13, z: 0.31, sy: 1.2 });
      b.add(ball(0.04, 0), '#9fd6ff', { x: 0.27, y: RIG.headY + 0.14, z: 0.2, sy: 1.5 }); // sweat drop
    }),
    sad: build((b) => {
      arc(b, -1.2);
      b.add(ball(0.03, 0), '#9fd6ff', { x: -0.13, y: RIG.headY - 0.04, z: 0.3, sy: 1.6 }); // tear
    }),
  };
  const hair = [
    // 0 short
    build((b) => b.add(ball(0.35, 2), W2, { y: RIG.headY + 0.09, z: -0.03, sy: 0.75 })),
    // 1 bob with fringe
    build((b) => {
      b.add(ball(0.37, 2), W2, { y: RIG.headY + 0.04, z: -0.05, sy: 0.9 });
      b.add(box(0.5, 0.12, 0.12, 0.05), W, { y: RIG.headY + 0.2, z: 0.25 });
    }),
    // 2 ponytail
    build((b) => {
      b.add(ball(0.35, 2), W2, { y: RIG.headY + 0.09, z: -0.03, sy: 0.75 });
      b.add(ball(0.13, 1), W, { y: RIG.headY + 0.02, z: -0.38 });
      b.add(ball(0.11, 1), W, { y: RIG.headY - 0.15, z: -0.42, sy: 1.4 });
    }),
    // 3 spiky
    build((b) => {
      b.add(ball(0.34, 1), W2, { y: RIG.headY + 0.1, z: -0.03, sy: 0.7 });
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        b.add(cone(0.08, 0.22, 4), W, { x: Math.cos(a) * 0.18, y: RIG.headY + 0.3, z: Math.sin(a) * 0.18 - 0.04, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5 });
      }
    }),
  ];
  const torso = build((b) => {
    // Pivot = hips; the torso spans hips → neck (0 … 0.6).
    b.add(box(0.5, 0.56, 0.34, 0.15), W2, { y: 0.3 });
    b.add(cyl(0.09, 0.1, 0.08, 8), W, { y: 0.6 }); // neck / collar
  });
  const hips = build((b) => b.add(box(0.46, 0.16, 0.32, 0.08), W2, { y: 0.06 }));
  const apron = build((b) => b.add(box(0.44, 0.5, 0.04, 0.02), W, { y: 0.1, z: 0.18 }));
  const arm = build((b) => b.add(cyl(0.075, 0.065, RIG.armLength - 0.05, 7), W2, { y: -(RIG.armLength - 0.05) / 2 }));
  const hand = build((b) => b.add(ball(0.085, 1), W, {}));
  const leg = build((b) => {
    b.add(cyl(0.09, 0.08, RIG.legLength - 0.08, 7), W2, { y: -(RIG.legLength - 0.08) / 2 });
    b.add(box(0.15, 0.09, 0.22, 0.04), '#4a3424', { y: -RIG.legLength + 0.045, z: 0.03 });
  });
  const hats: VillagerParts['hats'] = {
    non_la: build((b) => b.add(cone(0.62, 0.34, 16), W2, { y: RIG.headY * 2 + 0.02 })),
    cap: build((b) => {
      b.add(ball(0.34, 2), W2, { y: RIG.headY + 0.13, sy: 0.55 });
      b.add(box(0.36, 0.04, 0.22, 0.02), W, { y: RIG.headY + 0.12, z: 0.33 });
    }),
    bucket: build((b) => {
      b.add(cyl(0.3, 0.34, 0.2, 14), W2, { y: RIG.headY + 0.3 });
      b.add(cyl(0.46, 0.46, 0.04, 14), W, { y: RIG.headY + 0.2 });
    }),
    headband: build((b) => b.add(cyl(0.345, 0.345, 0.08, 14), W, { y: RIG.headY + 0.12 })),
    helmet: build((b) => {
      b.add(ball(0.37, 2), W2, { y: RIG.headY + 0.1, sy: 0.75 });
      b.add(cyl(0.44, 0.44, 0.04, 14), W, { y: RIG.headY + 0.08 });
    }),
    bandana: build((b) => {
      b.add(ball(0.35, 2), W2, { y: RIG.headY + 0.1, sy: 0.65 });
      b.add(cone(0.07, 0.18, 4), W, { y: RIG.headY + 0.05, z: -0.36, rx: -1.2 });
    }),
    straw: build((b) => {
      b.add(cyl(0.24, 0.3, 0.22, 12), W2, { y: RIG.headY + 0.32 });
      b.add(cyl(0.55, 0.55, 0.04, 16), W, { y: RIG.headY + 0.2 });
    }),
    beret: build((b) => b.add(ball(0.36, 2), W2, { x: 0.05, y: RIG.headY + 0.22, sy: 0.35 })),
  };
  // Tools are held at the right hand (origin = hand), pointing down/forward.
  const tools: VillagerParts['tools'] = {
    hoe: build((b) => {
      b.add(cyl(0.025, 0.025, 1.2, 5), '#8a5a32', { y: -0.2, z: 0.05 });
      b.add(box(0.22, 0.06, 0.16, 0.02), '#9aa3ad', { y: -0.8, z: 0.12 });
    }),
    pitchfork: build((b) => {
      b.add(cyl(0.025, 0.025, 1.2, 5), '#8a5a32', { y: -0.2 });
      for (const x of [-0.06, 0, 0.06]) b.add(cyl(0.012, 0.012, 0.22, 4), '#9aa3ad', { x, y: -0.9 });
    }),
    net: build((b) => {
      b.add(cyl(0.02, 0.02, 0.9, 5), '#8a5a32', { y: -0.15 });
      b.add(cyl(0.25, 0.25, 0.02, 12), '#4a5a5a', { y: -0.65, z: 0.15, rx: 1.2 });
    }),
    saw: build((b) => {
      b.add(box(0.06, 0.12, 0.12, 0.02), '#8a5a32', {});
      b.add(box(0.02, 0.12, 0.55, 0.01), '#c9ced6', { z: 0.32 });
    }),
    trowel: build((b) => {
      b.add(cyl(0.025, 0.025, 0.14, 5), '#8a5a32', {});
      b.add(box(0.12, 0.02, 0.18, 0.01), '#9aa3ad', { z: 0.14 });
    }),
    hammer: build((b) => {
      b.add(cyl(0.025, 0.025, 0.42, 5), '#8a5a32', { z: 0.12, rx: Math.PI / 2 });
      b.add(box(0.12, 0.12, 0.2, 0.02), '#5a5f66', { z: 0.34, rx: Math.PI / 2 });
    }),
    clipboard: build((b) => {
      b.add(box(0.2, 0.26, 0.02, 0.01), '#a8743f', { z: 0.05 });
      b.add(box(0.16, 0.2, 0.01, 0.005), '#ffffff', { z: 0.062 });
    }),
  };
  const cart = build((b) => {
    b.add(box(0.8, 0.35, 0.9, 0.05), ['#8a5a32', '#b07a48'], { y: 0.45 });
    b.add(cyl(0.22, 0.22, 0.08, 12), '#3b3030', { x: 0, y: 0.22, z: 0.35, rz: Math.PI / 2 });
    for (const s of [-1, 1]) b.add(cyl(0.025, 0.025, 0.8, 5), '#6d4a2c', { x: s * 0.3, y: 0.6, z: -0.7, rx: 1.2 });
    b.add(box(0.6, 0.25, 0.6, 0.05), ['#c49a5a', '#e2bd7c'], { y: 0.72 });
  });
  const crate = build((b) => {
    b.add(box(0.46, 0.34, 0.36, 0.04), ['#c49a5a', '#e2bd7c'], {});
    b.add(box(0.48, 0.04, 0.38, 0.01), '#8a5a32', { y: 0.12 });
  });
  const lod = (() => {
    const g = [
      build((b) => b.add(cyl(0.22, 0.2, 0.62, 6), W2, { y: 0.31 + 0.25 })),
      build((b) => b.add(ball(0.36, 1), '#f2d2b4', { y: RIG.neckY + RIG.headY })),
      build((b) => b.add(cyl(0.16, 0.16, 0.55, 5), '#4a4a5a', { y: 0.27 })),
    ];
    const m = mergeGeometries(g, false)!;
    g.forEach((x) => x.dispose());
    return m;
  })();
  return { head, face, mouths, hair, torso, hips, apron, arm, hand, leg, hats, tools, cart, crate, lod };
}

export function disposeVillagerParts(p: VillagerParts): void {
  const all = [p.head, p.face, ...Object.values(p.mouths), ...p.hair, p.torso, p.hips, p.apron, p.arm, p.hand, p.leg, ...Object.values(p.hats), ...Object.values(p.tools), p.cart, p.crate, p.lod];
  for (const g of all) g.dispose();
}
