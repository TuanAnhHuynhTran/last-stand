/**
 * Chibi soldier kit on top of the villager body: armour, helmets, rank accessories, weapons,
 * ammo, projectiles and the training props (straw dummy, thrust post, archery target).
 *
 * Held items use a common convention: the hand socket is the origin and the item's LONG AXIS
 * points along +Z (blade, shaft, bow limbs, crossbow stock). Tinted white parts take the class
 * colour (tunic / trim) from instance colours; everything else has fixed colours.
 */
import * as THREE from 'three';
import { RIG } from '../population/villagerModels';
import { ModelBuilder, ball, box, cone, cyl, shade } from '../buildings/modelKit';

const W = '#ffffff';
const W2: [string, string] = ['#d8d8d8', '#ffffff'];
const WOOD = '#8a5a32';
const WOOD_LIGHT = '#b07a48';
const STEEL = '#c9d0d8';
const IRON = '#8e97a2';
const LEATHER = '#7a5232';
const ALONG_Z = Math.PI / 2; // rx that turns a Y-cylinder into a Z-cylinder

const build = (fn: (b: ModelBuilder) => void): THREE.BufferGeometry => {
  const b = new ModelBuilder();
  fn(b);
  return b.build();
};

export interface SoldierParts {
  /** Tinted (trim): belt + collar band */
  belt: THREE.BufferGeometry;
  armor: { leather: THREE.BufferGeometry; iron: THREE.BufferGeometry };
  helmet: { leather: THREE.BufferGeometry; iron: THREE.BufferGeometry };
  /** Rank accessories (tinted with the trim colour where it makes sense) */
  scarf: THREE.BufferGeometry;
  plume: THREE.BufferGeometry;
  pauldron: THREE.BufferGeometry;
  cape: THREE.BufferGeometry;
  saber: THREE.BufferGeometry;
  scabbard: THREE.BufferGeometry;
  /** Tinted (tunic): shield face */
  shield: THREE.BufferGeometry;
  spear: THREE.BufferGeometry;
  bow: THREE.BufferGeometry;
  /** Unit-length bow string segment along +Z (scaled per frame) */
  string: THREE.BufferGeometry;
  arrow: THREE.BufferGeometry;
  quiver: THREE.BufferGeometry;
  boltCase: THREE.BufferGeometry;
  crossbow: THREE.BufferGeometry;
  bolt: THREE.BufferGeometry;
  /** Props (origin on the ground, facing +Z) */
  dummy: THREE.BufferGeometry;
  post: THREE.BufferGeometry;
  target: THREE.BufferGeometry;
  /** Effects */
  chip: THREE.BufferGeometry;
  /** Far LOD soldier (tinted tunic) */
  lod: THREE.BufferGeometry;
}

export function buildSoldierParts(): SoldierParts {
  const belt = build((b) => {
    b.add(box(0.53, 0.07, 0.37, 0.03), W, { y: 0.05 });
    b.add(box(0.1, 0.08, 0.02, 0.01), '#e8c65a', { y: 0.05, z: 0.19 });
  });
  const armor = {
    leather: build((b) => {
      b.add(box(0.55, 0.42, 0.38, 0.12), [shade(LEATHER, 0.85), LEATHER], { y: 0.33 });
      for (const x of [-0.12, 0.12]) b.add(box(0.05, 0.42, 0.02, 0.01), '#4e3420', { x, y: 0.33, z: 0.195 });
    }),
    iron: build((b) => {
      b.add(box(0.56, 0.44, 0.39, 0.14), [IRON, '#c3cad3'], { y: 0.33 });
      b.add(box(0.36, 0.06, 0.02, 0.01), '#6d757f', { y: 0.38, z: 0.2 });
      for (const x of [-0.16, 0, 0.16]) b.add(ball(0.025, 0), '#e6ebf0', { x, y: 0.2, z: 0.2 });
    }),
  };
  const helmet = {
    leather: build((b) => {
      b.add(ball(0.36, 2), [shade(LEATHER, 0.8), LEATHER], { y: RIG.headY + 0.1, sy: 0.72 });
      b.add(cyl(0.37, 0.37, 0.05, 14), '#4e3420', { y: RIG.headY + 0.06 });
    }),
    iron: build((b) => {
      b.add(ball(0.375, 2), [IRON, '#d7dde4'], { y: RIG.headY + 0.1, sy: 0.78 });
      b.add(cyl(0.4, 0.4, 0.05, 16), '#6d757f', { y: RIG.headY + 0.05 });
      b.add(box(0.05, 0.2, 0.04, 0.01), '#6d757f', { y: RIG.headY - 0.02, z: 0.37 }); // nose guard
      b.add(cone(0.05, 0.12, 6), '#e6ebf0', { y: RIG.headY + 0.42 });
    }),
  };
  const scarf = build((b) => {
    b.add(cyl(0.15, 0.17, 0.09, 12), W2, { y: 0.6 });
    b.add(box(0.1, 0.22, 0.03, 0.02), W, { x: 0.08, y: 0.46, z: 0.17, rz: 0.2 });
  });
  const plume = build((b) => {
    b.add(cyl(0.02, 0.02, 0.14, 5), '#e8c65a', { y: RIG.headY * 2 + 0.06 });
    b.add(ball(0.1, 1), '#d23c3c', { y: RIG.headY * 2 + 0.2, z: -0.06, sy: 1.6, sz: 0.7, rx: -0.5 });
    b.add(ball(0.07, 1), '#ff6a5a', { y: RIG.headY * 2 + 0.12, z: -0.18, sy: 1.3, sz: 0.6, rx: -0.9 });
  });
  // On the arm frame (shoulder pivot).
  const pauldron = build((b) => {
    b.add(ball(0.13, 1), ['#b8902e', '#e8c65a'], { y: 0.0, sy: 0.65 });
    b.add(cyl(0.13, 0.13, 0.03, 10), '#8a6a20', { y: -0.05 });
  });
  // On the hips frame: hangs from the shoulders down the back.
  const cape = build((b) => {
    b.add(box(0.5, 0.95, 0.04, 0.02), ['#6a1420', '#a32235'], { y: 0.12, z: -0.21, rx: 0.12 });
    b.add(box(0.54, 0.06, 0.08, 0.02), '#e8c65a', { y: 0.6, z: -0.19 });
  });
  const saber = build((b) => {
    b.add(cyl(0.028, 0.028, 0.16, 6), '#3d2a1c', { z: 0.02, rx: ALONG_Z }); // grip
    b.add(box(0.2, 0.04, 0.05, 0.015), '#d8b04a', { z: 0.11 }); // guard
    // Slightly curved blade (three segments).
    for (let i = 0; i < 3; i += 1) b.add(box(0.035, 0.07 - i * 0.012, 0.26, 0.01), [STEEL, '#eef3f7'], { y: i * i * 0.012, z: 0.25 + i * 0.25, rx: -i * 0.07 });
  });
  const scabbard = build((b) => b.add(box(0.05, 0.08, 0.72, 0.02), LEATHER, { x: -0.27, y: 0.0, z: 0.05, rx: 1.15, ry: 0.15 }));
  const shield = build((b) => {
    b.add(cyl(0.3, 0.3, 0.05, 18), W2, { z: 0.06, rx: ALONG_Z });
    b.add(cyl(0.32, 0.32, 0.03, 18), '#6d4a2c', { z: 0.05, rx: ALONG_Z });
    b.add(ball(0.08, 1), '#c9d0d8', { z: 0.1, sz: 0.5 });
  });
  shield.translate(0, 0, 0.03);
  const spear = build((b) => {
    b.add(cyl(0.025, 0.025, 2.5, 6), [shade(WOOD, 0.85), WOOD_LIGHT], { z: 0.45, rx: ALONG_Z });
    b.add(cone(0.06, 0.3, 6), [STEEL, '#eef3f7'], { z: 1.85, rx: ALONG_Z });
    b.add(cyl(0.04, 0.04, 0.06, 6), '#d8b04a', { z: 1.68, rx: ALONG_Z });
    b.add(ball(0.035, 0), '#5a5f66', { z: -0.8 });
  });
  // Limbs along ±Z, belly bulging towards −Y (= forward when the bow is held up).
  const bow = build((b) => {
    const n = 7;
    for (let i = 0; i < n; i += 1) {
      const t = (i / (n - 1)) * 2 - 1; // −1..1
      const z = t * 0.6;
      const y = -(1 - t * t) * 0.16;
      b.add(cyl(0.022, 0.022, 0.22, 5), [shade(WOOD, 0.8), WOOD_LIGHT], { y, z, rx: ALONG_Z + t * 0.5 });
    }
    b.add(box(0.05, 0.06, 0.14, 0.02), LEATHER, { y: -0.16 }); // grip wrap
  });
  const string = build((b) => b.add(cyl(0.006, 0.006, 1, 3), '#f4efe2', { z: 0.5, rx: ALONG_Z }));
  // Arrow along −Y in the bow frame (nock at origin, tip forward).
  const arrow = build((b) => {
    b.add(cyl(0.012, 0.012, 0.75, 4), WOOD_LIGHT, { y: -0.37 });
    b.add(cone(0.03, 0.08, 4), STEEL, { y: -0.78, rx: Math.PI });
    for (const r of [0, Math.PI / 2]) b.add(box(0.05, 0.12, 0.005, 0.002), '#f4f4f4', { y: -0.04, ry: r });
  });
  const quiver = build((b) => {
    b.add(cyl(0.08, 0.07, 0.5, 8), [shade(LEATHER, 0.8), LEATHER], { y: 0.33, z: -0.22, rz: 0.4 });
    for (let i = 0; i < 4; i += 1) b.add(box(0.035, 0.1, 0.006, 0.002), i % 2 ? '#f4f4f4' : '#d23c3c', { x: 0.13 + i * 0.012, y: 0.63, z: -0.22 + (i - 1.5) * 0.025, rz: 0.4 });
  });
  const boltCase = build((b) => {
    b.add(box(0.12, 0.2, 0.09, 0.03), LEATHER, { x: 0.27, y: 0.0, z: -0.04 });
    for (let i = 0; i < 3; i += 1) b.add(box(0.02, 0.06, 0.02, 0.005), '#b9bec7', { x: 0.24 + i * 0.03, y: 0.12, z: -0.04 });
  });
  const crossbow = build((b) => {
    b.add(box(0.07, 0.08, 0.72, 0.02), [shade(WOOD, 0.8), WOOD_LIGHT], { z: 0.08 }); // stock
    b.add(box(0.7, 0.04, 0.05, 0.015), ['#6d757f', '#b9bec7'], { z: 0.42, ry: 0 }); // steel prod
    for (const s of [-1, 1]) b.add(cyl(0.005, 0.005, 0.38, 3), '#f4efe2', { x: s * 0.18, z: 0.33, rz: Math.PI / 2, ry: s * 0.45 });
    b.add(box(0.05, 0.06, 0.06, 0.01), '#3d2a1c', { y: -0.06, z: -0.04 }); // trigger
    b.add(cyl(0.03, 0.03, 0.12, 6), '#6d757f', { z: 0.5, rx: ALONG_Z }); // stirrup
  });
  const bolt = build((b) => {
    b.add(cyl(0.016, 0.016, 0.38, 4), WOOD_LIGHT, { y: 0.06, z: 0.22, rx: ALONG_Z });
    b.add(cone(0.035, 0.08, 4), STEEL, { y: 0.06, z: 0.45, rx: ALONG_Z });
  });
  const dummy = build((b) => {
    b.add(cyl(0.06, 0.07, 1.7, 7), WOOD, { y: 0.85 });
    b.add(cyl(0.3, 0.26, 0.75, 9), ['#c99a3c', '#e8c46a'], { y: 1.2 });
    b.add(ball(0.24, 1), ['#d9c49a', '#efe0bf'], { y: 1.8 });
    b.add(cyl(0.04, 0.04, 1.0, 5), WOOD, { y: 1.45, rz: Math.PI / 2 });
    for (const s of [-1, 1]) b.add(ball(0.1, 0), '#e8c46a', { x: s * 0.52, y: 1.45 });
    b.add(box(0.5, 0.06, 0.5, 0.02), shade(WOOD, 0.8), { y: 0.03 });
    b.add(cyl(0.31, 0.31, 0.05, 9), '#8a5a32', { y: 1.05 }); // rope
  });
  const post = build((b) => {
    b.add(cyl(0.13, 0.15, 1.9, 8), [shade(WOOD, 0.75), WOOD], { y: 0.95 });
    b.add(cyl(0.22, 0.22, 0.45, 9), ['#c99a3c', '#e8c46a'], { y: 1.3 });
    for (const y of [1.1, 1.5]) b.add(cyl(0.23, 0.23, 0.04, 9), '#8a5a32', { y });
    b.add(box(0.55, 0.08, 0.55, 0.02), shade(WOOD, 0.8), { y: 0.04 });
  });
  const target = build((b) => {
    for (const s of [-1, 1]) b.add(cyl(0.04, 0.04, 1.75, 5), WOOD, { x: s * 0.4, y: 0.85, z: -0.12, rx: -0.18 });
    b.add(cyl(0.04, 0.04, 1.5, 5), WOOD, { y: 0.8, z: -0.45, rx: 0.45 });
    const rings: [number, string][] = [[0.6, '#f4efe2'], [0.48, '#d23c3c'], [0.34, '#f4efe2'], [0.2, '#d23c3c'], [0.09, '#f2c14e']];
    for (const [i, [r, c]] of rings.entries()) b.add(cyl(r, r, 0.1, 18), c, { y: 1.35, z: 0.02 + i * 0.012, rx: ALONG_Z });
  });
  const chip = build((b) => b.add(box(0.08, 0.03, 0.05, 0.01), W, {}));
  const lod = build((b) => {
    b.add(cyl(0.24, 0.22, 0.65, 6), W2, { y: 0.31 + 0.25 });
    b.add(ball(0.37, 1), '#f2d2b4', { y: RIG.neckY + RIG.headY });
    b.add(cyl(0.16, 0.16, 0.55, 5), '#3d3d4a', { y: 0.27 });
    b.add(cyl(0.03, 0.03, 1.6, 4), '#9aa3ad', { x: 0.36, y: 1.0 });
  });
  return { belt, armor, helmet, scarf, plume, pauldron, cape, saber, scabbard, shield, spear, bow, string, arrow, quiver, boltCase, crossbow, bolt, dummy, post, target, chip, lod };
}

export function disposeSoldierParts(p: SoldierParts): void {
  const all = [
    p.belt, p.armor.leather, p.armor.iron, p.helmet.leather, p.helmet.iron, p.scarf, p.plume, p.pauldron, p.cape,
    p.saber, p.scabbard, p.shield, p.spear, p.bow, p.string, p.arrow, p.quiver, p.boltCase, p.crossbow, p.bolt,
    p.dummy, p.post, p.target, p.chip, p.lod,
  ];
  for (const g of all) g.dispose();
}
