/**
 * Chibi models for the Phase 7 economy buildings: road (3 surface levels), well, quarry, smithy.
 * Same conventions as buildingModels.ts: local frame around the anchor hex, +Z = front.
 */
import * as THREE from 'three';
import { axialToWorld, createRng, HEX_RADIUS, PATH_WIDTH } from '@cityverse/shared';
import { ModelBuilder, ball, box, cone, crate, cyl, gableRoof, hexPlate, logPile, windowAt } from './modelKit';

const STONE: [string, string] = ['#8d8a83', '#b8b3a9'];
const WOOD: [string, string] = ['#8a5a32', '#b07a48'];

/** Road: dirt (L1), gravel with wooden kerbs (L2), paved stones with lamps & planters (L3). */
export function roadModel(level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const top = level === 1 ? '#c9a878' : level === 2 ? '#b9b2a6' : '#d8d0c2';
  // East edge, subdivided so the renderer can drape it over terrain.
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const z = -HEX_RADIUS / 2 + (i + 0.5) * HEX_RADIUS / steps;
    b.add(box(PATH_WIDTH, 0.08, HEX_RADIUS / steps + 0.015), top, { x: 5, y: 0.12, z });
    if (level >= 2) for (const side of [-1, 1]) {
      b.add(box(0.09, 0.07, HEX_RADIUS / steps + 0.015), '#918472', { x: 5 + side * (PATH_WIDTH / 2 - 0.045), y: 0.17, z });
    }
    if (level === 3) b.add(box(PATH_WIDTH - 0.24, 0.035, HEX_RADIUS / steps - 0.06, 0.02), ['#c9c1b2', '#ece6da'], { x: 5, y: 0.18, z });
  }
  // Rounded joins meet adjacent sides without gaps or a full-hex paving slab.
  for (const z of [-HEX_RADIUS / 2, HEX_RADIUS / 2]) b.add(cyl(PATH_WIDTH / 2, PATH_WIDTH / 2, 0.08, 12), top, { x: 5, y: 0.12, z });
  return b.build();
}

export function wellModel(level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  hexPlate(b, 0, 0, '#7fcb5c');
  b.add(cyl(4.2, 4.2, 0.08, 18), ['#cfc4b2', '#e4dac8'], { y: 0.2 });
  // Stone ring + water
  b.add(cyl(1.4, 1.5, 1.0, 16), STONE, { y: 0.7 });
  b.add(cyl(1.1, 1.1, 0.05, 16), '#4a9ee0', { y: 1.15 });
  if (level === 1) {
    for (const s of [-1, 1]) b.add(cyl(0.1, 0.1, 2.0, 6), WOOD, { x: s * 1.25, y: 2.0 });
    gableRoof(b, { width: 3.0, depth: 1.8, height: 0.8, overhang: 0.2, color: '#d6b45e', rows: 2, gable: '#a8743f' }, 0, 3.0, 0);
    b.add(cyl(0.2, 0.18, 0.3, 8), '#7f8a96', { x: 0.3, y: 1.6 }); // bucket
  } else {
    for (const s of [-1, 1]) b.add(box(0.25, 2.2, 0.25, 0.05), STONE, { x: s * 1.3, y: 2.1 });
    b.add(cyl(0.12, 0.12, 2.9, 8), '#6d4a2c', { y: 2.6, rz: Math.PI / 2 }); // winch
    b.add(cyl(0.45, 0.45, 0.08, 12), '#c94f3a', { x: 1.55, y: 2.6, rz: Math.PI / 2 });
    gableRoof(b, { width: 3.2, depth: 2.0, height: 0.9, overhang: 0.25, color: '#d9603b', rows: 3, gable: '#e8e2d6' }, 0, 3.2, 0);
    b.add(box(1.6, 0.7, 1.0, 0.1), STONE, { x: 2.6, y: 0.55, z: 1.4 }); // trough
    b.add(box(1.4, 0.05, 0.8, 0.02), '#6fb2e8', { x: 2.6, y: 0.9, z: 1.4 });
  }
  if (level === 3) {
    // Water tower and pump
    for (const [x, z] of [[-2.8, -1.6], [-1.6, -1.6], [-2.8, -2.8], [-1.6, -2.8]] as const) b.add(cyl(0.1, 0.12, 3.2, 6), WOOD, { x, y: 1.8, z });
    b.add(cyl(1.0, 1.0, 1.3, 14), ['#3f7fb0', '#6fb2e8'], { x: -2.2, y: 4.0, z: -2.2 });
    b.add(cone(1.1, 0.6, 14), '#c94f3a', { x: -2.2, y: 5.0, z: -2.2 });
    b.add(box(0.4, 1.2, 0.4, 0.05), '#2f5f86', { x: 2.4, y: 0.8, z: -1.6 });
    b.add(cyl(0.05, 0.05, 1.0, 4), '#9aa3ad', { x: 2.4, y: 1.6, z: -1.6, rx: 0.8 });
  }
  return b.build();
}

export function quarryModel(level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const B = axialToWorld(1, 0);
  for (const c of [{ x: 0, z: 0 }, B]) hexPlate(b, c.x, c.z, '#b9a88a', '#8d7a5a');
  const rng = createRng(700 + level);
  // Rock face with cut blocks
  for (let i = 0; i < 7; i += 1) b.add(ball(1.2 + rng() * 0.8, 1), STONE, { x: -2.6 + rng() * 2, y: 0.8 + rng() * 0.6, z: -2.4 + rng() * 1.2, sy: 0.75 });
  for (let i = 0; i < 6; i += 1) b.add(box(0.9, 0.6, 0.9, 0.06), ['#a39f96', '#cbc6bb'], { x: B.x - 1.5 + (i % 3) * 1.0, y: 0.5 + Math.floor(i / 3) * 0.62, z: B.z + 1.6 });
  // Wheelbarrow + pickaxe rack
  b.add(box(1.0, 0.4, 0.7, 0.08), '#7f8a96', { x: 1.8, y: 0.6, z: 1.8 });
  b.add(cyl(0.22, 0.22, 0.1, 10), '#3b3030', { x: 2.35, y: 0.32, z: 1.8, rz: Math.PI / 2 });
  for (const s of [-1, 1]) b.add(cyl(0.04, 0.04, 1.0, 4), WOOD[0], { x: 1.3, y: 0.7, z: 1.8 + s * 0.25, rz: 1.2 });
  if (level >= 2) {
    // Brick kiln (dome + chimney)
    b.add(ball(1.5, 1), ['#b4553b', '#d9744f'], { x: B.x + 1.2, y: 0.9, z: B.z - 1.4, sy: 0.85 });
    b.add(box(0.6, 0.7, 0.2, 0.05), '#2b2116', { x: B.x + 1.2, y: 0.6, z: B.z - 0.1 });
    b.add(cyl(0.3, 0.35, 2.4, 8), ['#8d857a', '#b9b1a5'], { x: B.x + 2.0, y: 2.0, z: B.z - 2.0 });
    for (let i = 0; i < 4; i += 1) b.add(box(1.6, 0.3, 0.6, 0.04), ['#c0603f', '#d9744f'], { x: B.x - 1.0, y: 0.35 + i * 0.32, z: B.z - 2.4 });
  }
  if (level >= 3) {
    // Wooden crane
    b.add(box(0.4, 5, 0.4, 0.05), WOOD, { x: 0.4, y: 2.6, z: -0.6 });
    b.add(box(4.2, 0.3, 0.3, 0.05), WOOD, { x: -1.2, y: 5.0, z: -0.6 });
    b.add(cyl(0.03, 0.03, 2.4, 4), '#3c3f46', { x: -3.0, y: 3.8, z: -0.6 });
    b.add(box(0.8, 0.6, 0.8, 0.06), STONE, { x: -3.0, y: 2.4, z: -0.6 });
    b.add(box(1.4, 1.2, 1.2, 0.1), ['#3f5f86', '#5a7fd0'], { x: B.x + 2.6, y: 0.8, z: B.z + 1.4 }); // crusher
  }
  crate(b, B.x + 2.4, 0.12, B.z - 0.2, 0.8, 0.3);
  return b.build();
}

export function smithyModel(level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  hexPlate(b, 0, 0, '#9a8f80', '#7a6a58');
  const w = level >= 3 ? 5.6 : 4.6;
  const d = 3.8;
  if (level === 1) {
    for (const [x, z] of [[-2.1, -1.7], [2.1, -1.7], [-2.1, 1.7], [2.1, 1.7]] as const) b.add(cyl(0.16, 0.18, 2.6, 7), WOOD, { x, y: 1.4, z });
    gableRoof(b, { width: w, depth: d, height: 1.2, overhang: 0.4, color: '#d6b45e', rows: 3, gable: '#a8743f' }, 0, 2.7, 0);
  } else {
    b.add(box(w, 2.6, d, 0.12), level === 2 ? ['#b4553b', '#d9744f'] : ['#8d857a', '#cfc9bd'], { y: 1.45, z: -0.3 });
    windowAt(b, { x: w / 2 + 0.06, y: 1.8, z: -0.3, ry: Math.PI / 2 }, 0.8, 0.7, { frame: '#f4ede0' });
    gableRoof(b, { width: w, depth: d, height: 1.4, overhang: 0.45, color: level === 2 ? '#d9603b' : '#3f5f86', rows: 4, gable: '#e8e2d6' }, 0, 2.75, -0.3);
  }
  // Forge with glowing coals, chimney
  b.add(box(1.4, 1.0, 1.2, 0.1), STONE, { x: -1.2, y: 0.7, z: 0.2 });
  b.add(box(1.0, 0.15, 0.8, 0.05), '#ff7a2a', { x: -1.2, y: 1.25, z: 0.2 });
  b.add(cyl(0.35, 0.4, 3.6, 8), STONE, { x: -1.6, y: 2.8, z: -1.0 });
  // Anvil + quench bucket + bellows
  b.add(box(0.9, 0.35, 0.45, 0.05), '#3c3f46', { x: 1.0, y: 1.0, z: 1.2 });
  b.add(box(0.4, 0.6, 0.35, 0.05), '#3c3f46', { x: 1.0, y: 0.55, z: 1.2 });
  b.add(cyl(0.35, 0.3, 0.6, 10), WOOD, { x: 2.0, y: 0.5, z: 2.0 });
  b.add(cyl(0.3, 0.3, 0.04, 10), '#4a9ee0', { x: 2.0, y: 0.8, z: 2.0 });
  b.add(box(0.9, 0.3, 0.6, 0.1), ['#7a5232', '#a8743f'], { x: -2.4, y: 0.7, z: 1.0 });
  if (level >= 2) {
    // Weapon rack
    b.add(box(1.6, 0.1, 0.1, 0.02), WOOD[0], { x: 2.6, y: 1.6, z: -1.4 });
    for (let i = 0; i < 3; i += 1) b.add(box(0.08, 1.2, 0.08, 0.02), '#b9bec7', { x: 2.1 + i * 0.5, y: 1.1, z: -1.35 });
  }
  if (level >= 3) {
    // Second forge + trip hammer
    b.add(box(1.2, 0.9, 1.0, 0.1), STONE, { x: 0.2, y: 0.6, z: -1.6 });
    b.add(box(0.15, 0.15, 2.2, 0.03), WOOD[0], { x: 2.6, y: 1.7, z: 0.4, rx: 0.2 });
    b.add(box(0.5, 0.5, 0.5, 0.05), '#3c3f46', { x: 2.6, y: 1.5, z: 1.5 });
    logPile(b, -2.6, -2.4, 0.4);
  }
  return b.build();
}
