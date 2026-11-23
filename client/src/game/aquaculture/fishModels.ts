/**
 * Chibi fish: round soft bodies, big eyes, species colours. Two animatable parts, both
 * vertex-coloured and merged:
 *   body – torso, head, eyes, fins (origin at the body centre, facing +Z)
 *   tail – caudal fin with its pivot at the tail root (placed at `rig.tailZ`), swung on yaw
 * Sizes are for a market-sized fish (~0.9 m long — big enough to read under water).
 */
import * as THREE from 'three';
import { getFishSpecies, type FishSpeciesCode } from '@cityverse/shared';
import { ModelBuilder, ball, cone, cyl } from '../buildings/modelKit';

export interface FishRig {
  /** z of the tail pivot (negative = behind) */
  tailZ: number;
  /** Swim speed (m/s) and tail beat frequency */
  speed: number;
  beat: number;
  /** Body length (m) */
  length: number;
}

export interface FishParts {
  body: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
  rig: FishRig;
}

interface FishBuild {
  rig: FishRig;
  body: (b: ModelBuilder, c: { body: string; belly: string; fin: string }) => void;
  tail: (b: ModelBuilder, c: { body: string; belly: string; fin: string }) => void;
}

function eyes(b: ModelBuilder, z: number, y: number, spread: number, r: number): void {
  for (const s of [-1, 1]) {
    b.add(ball(r, 1), '#ffffff', { x: s * spread, y, z, sx: 0.7 });
    b.add(ball(r * 0.62, 1), '#1f1a16', { x: s * (spread + r * 0.25), y, z: z + r * 0.12, sx: 0.7 });
    b.add(ball(r * 0.22, 0), '#ffffff', { x: s * (spread + r * 0.42), y: y + r * 0.25, z: z + r * 0.3 });
  }
}

const SPECIES: Record<FishSpeciesCode, FishBuild> = {
  carp: {
    rig: { tailZ: -0.42, speed: 0.9, beat: 6, length: 0.95 },
    body: (b, c) => {
      b.add(ball(0.42, 2), [c.belly, c.body], { sx: 0.62, sy: 0.78, sz: 1.08 });
      b.add(ball(0.3, 1), [c.belly, c.body], { z: 0.3, y: 0.02, sx: 0.66, sy: 0.72 }); // head
      for (const s of [-1, 1]) b.add(cyl(0.012, 0.012, 0.14, 4), c.fin, { x: s * 0.06, y: -0.12, z: 0.52, rx: 0.9 }); // barbels
      b.add(cone(0.14, 0.3, 6), c.fin, { y: 0.36, z: -0.02, sx: 0.25 }); // dorsal fin
      for (const s of [-1, 1]) b.add(cone(0.09, 0.2, 5), c.fin, { x: s * 0.24, y: -0.12, z: 0.12, rz: s * 1.2, sx: 0.35 });
      eyes(b, 0.44, 0.1, 0.15, 0.085);
      b.add(ball(0.05, 0), '#c0503a', { z: 0.58, y: -0.02, sy: 0.6 }); // mouth
    },
    tail: (b, c) => {
      for (const s of [-1, 1]) b.add(cone(0.18, 0.34, 5), c.fin, { y: s * 0.1, z: -0.15, rx: -Math.PI / 2 + s * 0.5, sx: 0.25 });
    },
  },
  tilapia: {
    rig: { tailZ: -0.36, speed: 1.1, beat: 7.5, length: 0.8 },
    body: (b, c) => {
      b.add(ball(0.4, 2), [c.belly, c.body], { sx: 0.5, sy: 0.92, sz: 0.98 }); // tall, flat body
      for (let i = 0; i < 4; i += 1) b.add(ball(0.06, 0), '#5f6c78', { x: 0.17, y: 0.1 - i * 0.02, z: 0.15 - i * 0.14, sy: 3, sx: 0.3 }); // stripes
      for (let i = 0; i < 4; i += 1) b.add(ball(0.06, 0), '#5f6c78', { x: -0.17, y: 0.1 - i * 0.02, z: 0.15 - i * 0.14, sy: 3, sx: 0.3 });
      b.add(cone(0.24, 0.32, 6), c.fin, { y: 0.4, z: -0.05, sx: 0.2, sz: 1.6 }); // long dorsal
      eyes(b, 0.32, 0.12, 0.14, 0.08);
    },
    tail: (b, c) => {
      b.add(cone(0.22, 0.3, 6), c.fin, { z: -0.13, rx: -Math.PI / 2, sx: 0.22 });
    },
  },
  catfish: {
    rig: { tailZ: -0.5, speed: 0.7, beat: 4.5, length: 1.0 },
    body: (b, c) => {
      b.add(ball(0.4, 2), [c.belly, c.body], { sx: 0.68, sy: 0.55, sz: 1.3 }); // long, flat
      b.add(ball(0.32, 1), [c.belly, c.body], { z: 0.36, sx: 0.85, sy: 0.6 }); // broad head
      // Long whiskers
      for (const s of [-1, 1]) {
        b.add(cyl(0.014, 0.008, 0.5, 4), '#2b2520', { x: s * 0.2, y: 0.02, z: 0.62, rz: s * 1.1, rx: 0.2 });
        b.add(cyl(0.012, 0.008, 0.34, 4), '#2b2520', { x: s * 0.1, y: -0.08, z: 0.64, rz: s * 0.6, rx: 0.8 });
      }
      b.add(cone(0.08, 0.16, 5), c.fin, { y: 0.24, z: 0.05, sx: 0.3 });
      eyes(b, 0.52, 0.1, 0.17, 0.06);
    },
    tail: (b, c) => {
      b.add(cone(0.16, 0.36, 6), c.fin, { z: -0.16, rx: -Math.PI / 2, sx: 0.22 });
    },
  },
  snakehead: {
    rig: { tailZ: -0.6, speed: 1.0, beat: 5.5, length: 1.2 },
    body: (b, c) => {
      b.add(ball(0.36, 2), [c.belly, c.body], { sx: 0.6, sy: 0.66, sz: 1.7 }); // long torpedo
      b.add(ball(0.3, 1), [c.belly, c.body], { z: 0.48, sx: 0.72, sy: 0.66 }); // snake-like head
      for (let i = 0; i < 5; i += 1) b.add(ball(0.07, 0), '#2a3a24', { x: 0.2, z: 0.3 - i * 0.18, y: 0.02, sx: 0.3, sz: 1.4 });
      for (let i = 0; i < 5; i += 1) b.add(ball(0.07, 0), '#2a3a24', { x: -0.2, z: 0.3 - i * 0.18, y: 0.02, sx: 0.3, sz: 1.4 });
      b.add(cone(0.12, 0.2, 5), c.fin, { y: 0.24, z: -0.05, sx: 0.2, sz: 3.2 }); // long dorsal ridge
      eyes(b, 0.64, 0.1, 0.15, 0.07);
    },
    tail: (b, c) => {
      b.add(ball(0.16, 1), c.fin, { z: -0.14, sx: 0.22, sy: 1.0, sz: 0.9 });
    },
  },
};

function build(fn: (b: ModelBuilder) => void): THREE.BufferGeometry {
  const b = new ModelBuilder();
  fn(b);
  return b.build();
}

export function buildFishParts(code: FishSpeciesCode): FishParts {
  const s = SPECIES[code];
  const colors = getFishSpecies(code).colors;
  return { body: build((b) => s.body(b, colors)), tail: build((b) => s.tail(b, colors)), rig: s.rig };
}

export class FishModelCache {
  private readonly cache = new Map<FishSpeciesCode, FishParts>();

  get(code: FishSpeciesCode): FishParts {
    let p = this.cache.get(code);
    if (!p) {
      p = buildFishParts(code);
      this.cache.set(code, p);
    }
    return p;
  }

  dispose(): void {
    for (const p of this.cache.values()) {
      p.body.dispose();
      p.tail.dispose();
    }
    this.cache.clear();
  }
}
