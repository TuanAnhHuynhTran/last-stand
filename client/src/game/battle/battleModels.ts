/**
 * Battlefield art (chibi, readable from the tactical camera):
 *  terrain   one hex prism per tile (top colour per terrain, darker rim so every hex reads) plus
 *            props: grass tufts, road stones, round chibi trees, boulders, sandbag forts, broken
 *            brick walls, raised hills, sunken water (own transparent mesh) and toxic puddles
 *            (own glowing mesh with bubbles)
 *  looks     humanoid outfits for soldiers / bandits / zombies / robots / captives (Phase 8 rig)
 *  creatures merged wolf, acid spitter and the mutant behemoth (whole-body animation)
 */
import * as THREE from 'three';
import { UNIT_TYPE_DEFINITIONS, type BattleState, type BattleTerrain } from '@cityverse/shared';
import { ModelBuilder, ball, box, cone, cyl, shade, type Paint } from '../buildings/modelKit';
import { BATTLE_HEX, hexCenter, tileTop } from './battleLayout';

const R = BATTLE_HEX / Math.sqrt(3);

const TOP: Record<BattleTerrain, string> = {
  ground: '#9fd16a',
  road: '#e2c48c',
  forest: '#6fb554',
  rock: '#a59f96',
  fort: '#c9b07a',
  ruins: '#b9ad9c',
  hill: '#b5dc7a',
  water: '#5c8fb0',
  toxic: '#6d5a86',
};

/** Deterministic jitter per tile. */
function jitter(q: number, r: number, k: number): number {
  const x = Math.sin(q * 127.1 + r * 311.7 + k * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

function tree(b: ModelBuilder, x: number, y: number, z: number, s: number): void {
  b.add(cyl(0.16 * s, 0.22 * s, 1.3 * s, 7), ['#6d4a2c', '#8a5a32'], { x, y: y + 0.65 * s, z });
  b.add(ball(0.95 * s, 1), ['#3f8f3a', '#79c95a'], { x, y: y + 1.75 * s, z });
  b.add(ball(0.6 * s, 1), ['#4fa244', '#8fd66a'], { x: x + 0.35 * s, y: y + 2.35 * s, z: z - 0.2 * s });
}

export interface BattlefieldMeshes {
  solid: THREE.BufferGeometry;
  water: THREE.BufferGeometry;
  toxic: THREE.BufferGeometry;
}

export function buildBattlefield(s: BattleState): BattlefieldMeshes {
  const b = new ModelBuilder();
  const water = new ModelBuilder();
  const toxic = new ModelBuilder();
  // Board skirt (a raised island so the battlefield reads as its own arena).
  b.add(cyl(R * (s.radius * 1.75 + 1.4), R * (s.radius * 1.75 + 2.2), 1.6, 36), ['#6b5a44', '#8a7458'], { y: -0.8 });
  const points = new Set(s.objectives.points.map((p) => `${p.q},${p.r}`));
  for (const t of s.tiles) {
    const c = hexCenter(t);
    const top = tileTop(t);
    const shadeK = 0.96 + jitter(t.q, t.r, 1) * 0.08;
    const color = shade(TOP[t.terrain], shadeK);
    const h = Math.max(0.3, top);
    // Prism with a darker rim around a lighter top (hex outlines stay readable in combat).
    b.add(cyl(R * 0.985, R * 0.985, h, 6), [shade(color, 0.62), shade(color, 0.8)], { x: c.x, y: h / 2, z: c.z });
    b.add(cyl(R * 0.9, R * 0.9, 0.06, 6), color, { x: c.x, y: h + 0.02, z: c.z });
    const y = h + 0.04;
    switch (t.terrain) {
      case 'ground':
        for (let i = 0; i < 3; i += 1) {
          const a = jitter(t.q, t.r, i) * Math.PI * 2;
          b.add(cone(0.12, 0.35, 4), '#6fb04a', { x: c.x + Math.cos(a) * R * 0.55, y: y + 0.15, z: c.z + Math.sin(a) * R * 0.55 });
        }
        break;
      case 'road':
        for (let i = 0; i < 4; i += 1) {
          const a = jitter(t.q, t.r, i + 4) * Math.PI * 2;
          b.add(ball(0.22, 0), '#cfb07a', { x: c.x + Math.cos(a) * R * 0.5, y, z: c.z + Math.sin(a) * R * 0.5, sy: 0.35 });
        }
        break;
      case 'forest':
        tree(b, c.x - 0.7, y, c.z - 0.4, 0.95 + jitter(t.q, t.r, 2) * 0.25);
        tree(b, c.x + 0.8, y, c.z + 0.5, 0.75 + jitter(t.q, t.r, 3) * 0.2);
        break;
      case 'rock':
        b.add(ball(1.25, 1), ['#7f7a73', '#b9b3aa'], { x: c.x, y: y + 0.85, z: c.z, sx: 1.1, sy: 0.95 });
        b.add(ball(0.75, 1), ['#8a857d', '#c6c0b6'], { x: c.x + 0.95, y: y + 0.45, z: c.z + 0.5 });
        b.add(ball(0.5, 0), '#9a948b', { x: c.x - 0.9, y: y + 0.3, z: c.z + 0.7 });
        break;
      case 'fort': {
        // Sandbag walls on four edges (open front / back).
        for (const k of [0, 1, 3, 4]) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          for (let i = -1; i <= 1; i += 1) {
            const ex = c.x + Math.sin(a) * R * 0.72 + Math.cos(a) * i * 0.5;
            const ez = c.z + Math.cos(a) * R * 0.72 - Math.sin(a) * i * 0.5;
            b.add(box(0.62, 0.32, 0.42, 0.14), ['#a8905c', '#d8c08a'], { x: ex, y: y + 0.17, z: ez, ry: a });
            if (i !== 0) b.add(box(0.6, 0.3, 0.4, 0.14), ['#b39a64', '#e2cb92'], { x: ex, y: y + 0.47, z: ez, ry: a });
          }
        }
        if (points.has(`${t.q},${t.r}`)) {
          b.add(cyl(0.06, 0.06, 2.6, 5), '#7a5232', { x: c.x, y: y + 1.3, z: c.z });
          b.add(box(0.9, 0.55, 0.04, 0.02), '#f2c14e', { x: c.x + 0.45, y: y + 2.3, z: c.z });
        }
        break;
      }
      case 'ruins':
        b.add(box(1.6, 1.4 + jitter(t.q, t.r, 5) * 0.8, 0.35, 0.06), ['#9a6a54', '#c9907a'], { x: c.x - 0.3, y: y + 0.8, z: c.z - 0.5, ry: jitter(t.q, t.r, 6) * 2 });
        b.add(box(0.9, 0.8, 0.3, 0.05), ['#a4745e', '#d6a08a'], { x: c.x + 0.8, y: y + 0.4, z: c.z + 0.4, ry: 1.2 });
        for (let i = 0; i < 3; i += 1) b.add(box(0.35, 0.22, 0.3, 0.05), '#b0a090', { x: c.x + (jitter(t.q, t.r, i + 9) - 0.5) * 2, y: y + 0.11, z: c.z + (jitter(t.q, t.r, i + 12) - 0.5) * 2, ry: i });
        break;
      case 'hill':
        b.add(ball(R * 0.75, 1), ['#9ccc68', '#c4e88c'], { x: c.x, y: y - 0.25, z: c.z, sy: 0.35 });
        b.add(ball(0.18, 0), '#ffd45c', { x: c.x + 0.7, y: y + 0.1, z: c.z - 0.6 }); // flower
        break;
      case 'water':
        water.add(cyl(R * 0.9, R * 0.9, 0.08, 6), ['#5ab2e0', '#8fd6ff'], { x: c.x, y: top + 0.18, z: c.z });
        b.add(ball(0.2, 0), '#f4f4f4', { x: c.x + 0.6, y: top + 0.25, z: c.z - 0.3, sy: 0.4 }); // lily
        break;
      case 'toxic':
        toxic.add(cyl(R * 0.7, R * 0.78, 0.06, 10), ['#5fd35a', '#a8ff6a'], { x: c.x, y: y + 0.03, z: c.z });
        for (let i = 0; i < 3; i += 1) toxic.add(ball(0.16 + i * 0.04, 1), '#b8ff7a', { x: c.x + (jitter(t.q, t.r, i) - 0.5) * 1.6, y: y + 0.12, z: c.z + (jitter(t.q, t.r, i + 3) - 0.5) * 1.6 });
        break;
    }
  }
  const safe = (m: ModelBuilder): THREE.BufferGeometry => {
    try {
      return m.build();
    } catch {
      return new THREE.BufferGeometry();
    }
  };
  return { solid: b.build(), water: safe(water), toxic: safe(toxic) };
}

/** Invisible hex prism for picking (one instance per tile). */
export function pickPrism(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(R * 0.98, R * 0.98, 1, 6);
}

/** Flat hex disc for move / target / area highlights. */
export function highlightDisc(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(R * 0.84, R * 0.84, 0.05, 6);
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Humanoid looks
// ─────────────────────────────────────────────────────────────────────────────
export interface HumanLook {
  skin: string;
  hair: string;
  hairStyle: number;
  tunic: string;
  trim: string;
  pants: string;
  helmet: 'none' | 'leather' | 'iron';
  armor: 'none' | 'leather' | 'iron';
  /** Held items */
  main: 'saber' | 'spear' | 'crossbow' | null;
  off: 'shield' | 'bow' | null;
  quiver: 'arrows' | 'bolts' | null;
  /** Small extras */
  extra: 'mask' | 'rope' | 'visor' | 'torn' | null;
}

const HELD: Record<string, Pick<HumanLook, 'main' | 'off' | 'quiver'>> = {
  swordsman: { main: 'saber', off: 'shield', quiver: null },
  spearman: { main: 'spear', off: null, quiver: null },
  archer: { main: null, off: 'bow', quiver: 'arrows' },
  crossbowman: { main: 'crossbow', off: null, quiver: 'bolts' },
};

export function lookFor(kind: string, seed: number): HumanLook {
  const hairs = ['#2b2116', '#5a3a22', '#8a5a32', '#1a1a1a', '#c49a5a'];
  const skins = ['#f6d2b4', '#eac09a', '#d9a77e', '#c08a64'];
  const pick = <T,>(arr: T[], k: number) => arr[Math.abs(Math.floor(Math.sin(seed * 12.9898 + k) * 43758.5453)) % arr.length];
  const soldier = UNIT_TYPE_DEFINITIONS.find((u) => u.code === kind);
  if (soldier) {
    return { skin: pick(skins, 1), hair: pick(hairs, 2), hairStyle: seed % 4, tunic: soldier.look.tunic, trim: soldier.look.trim, pants: '#3a3744', helmet: 'leather', armor: kind === 'archer' ? 'none' : 'leather', ...HELD[kind], extra: null };
  }
  switch (kind) {
    case 'bandit':
      return { skin: pick(skins, 3), hair: '#2b2116', hairStyle: 3, tunic: '#5b4636', trim: '#a8322a', pants: '#2f2a2a', helmet: 'none', armor: 'leather', ...HELD.swordsman, off: null, extra: 'mask' };
    case 'bandit_archer':
      return { skin: pick(skins, 4), hair: '#5a3a22', hairStyle: 2, tunic: '#4a5e3a', trim: '#a8322a', pants: '#2f2a2a', helmet: 'none', armor: 'none', ...HELD.archer, extra: 'mask' };
    case 'zombie':
      return { skin: '#9fbf8a', hair: '#4a4a3a', hairStyle: 3, tunic: '#5d7a9a', trim: '#6b5842', pants: '#4a4048', helmet: 'none', armor: 'none', main: null, off: null, quiver: null, extra: 'torn' };
    case 'robot':
      return { skin: '#9aa3ad', hair: '#5a5f66', hairStyle: 0, tunic: '#6d757f', trim: '#f2c14e', pants: '#4a4f56', helmet: 'iron', armor: 'iron', main: 'crossbow', off: null, quiver: null, extra: 'visor' };
    default:
      return { skin: pick(skins, 5), hair: pick(hairs, 6), hairStyle: (seed + 1) % 4, tunic: '#d9c79a', trim: '#b07a48', pants: '#6b5842', helmet: 'none', armor: 'none', main: null, off: null, quiver: null, extra: 'rope' };
  }
}

/** Extra accessories in the head / hips frames. */
export function buildExtras(): Record<'mask' | 'rope' | 'visor' | 'torn' | 'stars', THREE.BufferGeometry> {
  const g = (fn: (b: ModelBuilder) => void) => {
    const b = new ModelBuilder();
    fn(b);
    return b.build();
  };
  return {
    mask: g((b) => b.add(box(0.62, 0.16, 0.1, 0.04), '#a8322a', { y: 0.27, z: 0.3 })),
    visor: g((b) => b.add(box(0.5, 0.1, 0.08, 0.03), '#ff5a3a', { y: 0.38, z: 0.34 })),
    rope: g((b) => {
      b.add(cyl(0.3, 0.3, 0.06, 12), '#c9a46c', { y: 0.38 });
      b.add(cyl(0.3, 0.3, 0.06, 12), '#c9a46c', { y: 0.22 });
    }),
    torn: g((b) => {
      for (const [x, y] of [[-0.15, 0.1], [0.12, 0.25], [0.0, 0.42]]) b.add(box(0.12, 0.08, 0.02, 0.01), '#3a4a3a', { x, y, z: 0.18 });
    }),
    stars: g((b) => {
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2;
        b.add(ball(0.12, 0), '#ffd45c', { x: Math.cos(a) * 0.45, y: 0, z: Math.sin(a) * 0.45 });
      }
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Creatures (origin on the ground, facing +Z)
// ─────────────────────────────────────────────────────────────────────────────
export function buildCreature(kind: 'wolf' | 'spitter' | 'behemoth'): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const eyes = (x: number, y: number, z: number, r: number, color = '#2b2116') => {
    for (const s of [-1, 1]) {
      b.add(ball(r, 1), color, { x: s * x, y, z });
      b.add(ball(r * 0.4, 0), '#ffffff', { x: s * x + 0.02, y: y + r * 0.35, z: z + r * 0.6 });
    }
  };
  if (kind === 'wolf') {
    const fur: Paint = ['#6d6f78', '#9a9ca6'];
    b.add(box(0.8, 0.7, 1.4, 0.3), fur, { y: 0.95 });
    b.add(ball(0.55, 1), fur, { y: 1.35, z: 0.8 }); // big chibi head
    b.add(box(0.36, 0.28, 0.45, 0.12), ['#8a8c94', '#c4c6cc'], { y: 1.2, z: 1.28 }); // snout
    b.add(ball(0.08, 0), '#2b2116', { y: 1.28, z: 1.5 });
    for (const s of [-1, 1]) b.add(cone(0.15, 0.4, 4), fur, { x: s * 0.3, y: 1.88, z: 0.72, rz: -s * 0.2 });
    eyes(0.2, 1.45, 1.18, 0.08, '#e8b84a');
    for (const [x, z] of [[-0.28, 0.5], [0.28, 0.5], [-0.28, -0.5], [0.28, -0.5]]) b.add(cyl(0.1, 0.09, 0.65, 6), fur, { x, y: 0.33, z });
    b.add(cone(0.16, 0.8, 6), fur, { y: 1.2, z: -0.95, rx: -1.0 }); // tail
  } else if (kind === 'spitter') {
    const skin: Paint = ['#5f7a3a', '#9ccf5a'];
    b.add(ball(0.95, 1), skin, { y: 1.0, sy: 0.9 });
    for (const [x, y, z] of [[0.6, 1.4, -0.3], [-0.55, 1.3, -0.4], [0.1, 1.75, -0.5]]) b.add(ball(0.32, 1), ['#c8ff7a', '#e6ffb0'], { x, y, z }); // acid sacs
    for (const s of [-1, 1]) {
      b.add(cyl(0.05, 0.06, 0.55, 5), skin, { x: s * 0.3, y: 1.95, z: 0.35, rz: -s * 0.3 });
      b.add(ball(0.17, 1), '#ffffff', { x: s * 0.42, y: 2.2, z: 0.38 });
      b.add(ball(0.08, 0), '#2b2116', { x: s * 0.42, y: 2.22, z: 0.52 });
    }
    b.add(cyl(0.28, 0.2, 0.4, 10), '#3f5a2a', { y: 1.0, z: 0.9, rx: Math.PI / 2 }); // spout
    for (const [x, z] of [[-0.5, 0.4], [0.5, 0.4], [0, -0.6]]) b.add(cyl(0.16, 0.12, 0.45, 6), skin, { x, y: 0.22, z });
  } else {
    // Behemoth: huge hunched mutant, horns, glowing spots, long arms.
    const hide: Paint = ['#5a3a6a', '#8a5a9a'];
    b.add(ball(1.9, 1), hide, { y: 2.4, sx: 1.15, sy: 0.95, sz: 1.0 });
    b.add(ball(1.1, 1), hide, { y: 3.8, z: 0.9 });
    for (const s of [-1, 1]) {
      b.add(cone(0.3, 1.1, 6), ['#e8e0c8', '#fff8e0'], { x: s * 0.7, y: 4.7, z: 0.8, rz: -s * 0.5 });
      b.add(cyl(0.45, 0.6, 2.4, 8), hide, { x: s * 1.9, y: 1.6, z: 0.6, rz: s * 0.2 }); // arms
      b.add(ball(0.75, 1), ['#4a2a5a', '#6a4a7a'], { x: s * 2.05, y: 0.45, z: 0.7 }); // fists
      b.add(cyl(0.55, 0.6, 1.0, 8), hide, { x: s * 0.9, y: 0.5, z: -0.3 }); // legs
    }
    for (const [x, y, z] of [[0.9, 2.9, 1.3], [-1.1, 2.2, 1.2], [0.3, 1.8, 1.7], [-0.4, 3.1, -1.4]]) b.add(ball(0.28, 1), '#c8ff7a', { x, y, z });
    eyes(0.38, 3.95, 1.85, 0.18, '#ff5a3a');
    b.add(box(0.9, 0.18, 0.2, 0.06), '#2b1a2a', { y: 3.45, z: 1.85 }); // mouth
  }
  return b.build();
}
