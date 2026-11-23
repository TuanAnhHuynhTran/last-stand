/**
 * Static chibi models of the military compounds (local frame around the anchor hex, +Z front).
 * Live props that react to hits (dummies, archery targets) are drawn by the training scene, at
 * the positions of militaryLayout(), so the static model leaves those spots free.
 *
 *  L1  wooden tents, dirt yard, simple weapon rack
 *  L2  brick hall with a tiled roof, gravel yard, rest area (benches, campfire), banner
 *  L3  fortified two-storey hall with battlements, paved yard, flags, watchtower
 */
import * as THREE from 'three';
import type { BuildingTypeCode } from '@cityverse/shared';
import { militaryLayout, type MilitaryLayout } from '../military/militaryLayout';
import { ModelBuilder, ball, box, cone, crate, cyl, gableRoof, hexPlate, logPile, windowAt } from './modelKit';

const WOOD: [string, string] = ['#8a5a32', '#b07a48'];
const STONE: [string, string] = ['#8d8a83', '#b8b3a9'];
const BRICK: [string, string] = ['#b4553b', '#d9744f'];

export const MILITARY_COLORS: Partial<Record<BuildingTypeCode, string>> = {
  sword_barracks: '#b8463a',
  spear_barracks: '#3f6fa8',
  archery_range: '#4f8a3a',
  crossbow_range: '#6a4a8a',
  military_forge: '#d9773a',
  training_ground: '#d9a62e',
  military_depot: '#8a6a42',
};

const YARD = ['#c9a878', '#cfc4b0', '#d8d0c2'];

function hall(b: ModelBuilder, L: MilitaryLayout, color: string, wide = false): void {
  const { x, z } = L.hall;
  const w = wide ? 6.4 : 6.0;
  const d = 4.6;
  if (L.level === 1) {
    // Canvas tent on a wooden frame.
    b.add(box(w, 0.2, d, 0.05), WOOD, { x, y: 0.25, z });
    gableRoof(b, { width: w - 0.4, depth: d - 0.4, height: 2.6, overhang: 0.2, color: '#e8dcb8', rows: 3, gable: '#d9c79a' }, x, 0.35, z);
    for (const s of [-1, 1]) b.add(cyl(0.08, 0.08, 3.2, 5), WOOD[0], { x: x + s * (w / 2 - 0.4), y: 1.8, z: z + d / 2 - 0.3 });
    b.add(box(1.2, 1.8, 0.05, 0.02), '#5b3a22', { x, y: 1.1, z: z + d / 2 - 0.15 });
    b.add(box(1.4, 0.5, 0.05, 0.02), color, { x, y: 2.4, z: z + d / 2 - 0.12 }); // class banner on the tent
    return;
  }
  const floors = L.level === 3 ? 2 : 1;
  const fh = 2.5;
  b.add(box(w + 0.3, 0.3, d + 0.3, 0.08), STONE, { x, y: 0.3, z });
  for (let f = 0; f < floors; f += 1) {
    b.add(box(w, fh, d, 0.12), f === 0 ? BRICK : ['#e8dcc4', '#fff6e2'], { x, y: 0.45 + fh / 2 + f * fh, z });
    for (const u of [-1.8, 1.8]) windowAt(b, { x: x + u, y: 1.7 + f * fh, z: z + d / 2 + 0.06, ry: 0 }, 0.8, 0.7, { frame: '#f4ede0', shutters: color });
  }
  b.add(box(1.3, 1.9, 0.12, 0.03), '#5b3a22', { x, y: 1.4, z: z + d / 2 + 0.06 });
  const top = 0.45 + floors * fh;
  if (L.level === 3) {
    // Battlements instead of a pitched roof on the fortified hall.
    b.add(box(w + 0.3, 0.3, d + 0.3, 0.05), STONE, { x, y: top + 0.1, z });
    for (let i = 0; i < 6; i += 1) {
      for (const s of [-1, 1]) b.add(box(0.55, 0.55, 0.4, 0.05), STONE, { x: x - w / 2 + 0.5 + i * ((w - 1) / 5), y: top + 0.5, z: z + s * (d / 2) });
    }
    b.add(box(1.6, 0.6, 0.06, 0.02), color, { x, y: top - 0.6, z: z + d / 2 + 0.08 });
  } else {
    gableRoof(b, { width: w, depth: d, height: 1.8, overhang: 0.35, color: '#d9603b', rows: 5, gable: BRICK[0] }, x, top, z);
    b.add(box(1.2, 0.45, 0.06, 0.02), color, { x, y: top - 0.5, z: z + d / 2 + 0.08 });
  }
}

function weaponRack(b: ModelBuilder, L: MilitaryLayout, code: BuildingTypeCode): void {
  const { x, z } = L.rack;
  b.add(box(0.2, 1.3, 2.0, 0.04), WOOD, { x, y: 0.85, z });
  b.add(box(0.3, 0.1, 2.2, 0.03), WOOD[0], { x, y: 1.45, z });
  const n = L.level >= 2 ? 5 : 3;
  for (let i = 0; i < n; i += 1) {
    const zz = z - 0.8 + (i * 1.6) / (n - 1);
    if (code === 'spear_barracks') b.add(cyl(0.03, 0.03, 2.6, 5), WOOD[0], { x: x + 0.1, y: 1.5, z: zz });
    else if (code === 'archery_range') b.add(cyl(0.45, 0.45, 0.05, 10), '#7a5232', { x: x + 0.15, y: 1.0, z: zz, rz: Math.PI / 2, sz: 0.4 });
    else if (code === 'crossbow_range') b.add(box(0.15, 0.25, 0.7, 0.03), '#5a4636', { x: x + 0.15, y: 1.0, z: zz });
    else b.add(box(0.05, 1.0, 0.1, 0.01), '#c9ced6', { x: x + 0.12, y: 1.1, z: zz });
  }
}

function restArea(b: ModelBuilder, p: { x: number; z: number }): void {
  for (const s of [-1, 1]) b.add(box(2.2, 0.15, 0.5, 0.04), WOOD, { x: p.x, y: 0.55, z: p.z + s * 1.6 });
  for (const s of [-1, 1]) for (const e of [-0.9, 0.9]) b.add(box(0.12, 0.45, 0.4, 0.02), WOOD[0], { x: p.x + e, y: 0.3, z: p.z + s * 1.6 });
  // Campfire with stones
  for (let i = 0; i < 8; i += 1) b.add(ball(0.15, 0), STONE, { x: p.x + Math.cos(i * 0.785) * 0.55, y: 0.25, z: p.z + Math.sin(i * 0.785) * 0.55, sy: 0.7 });
  b.add(cone(0.3, 0.6, 6), '#ff8a3a', { x: p.x, y: 0.5, z: p.z });
  b.add(cyl(0.35, 0.3, 0.8, 10), WOOD, { x: p.x + 2.4, y: 0.6, z: p.z }); // water barrel
}

function tower(b: ModelBuilder, p: { x: number; z: number }, color: string): void {
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as const) b.add(cyl(0.12, 0.15, 5, 6), WOOD[0], { x: p.x + dx, y: 2.7, z: p.z + dz });
  b.add(box(2.2, 0.15, 2.2, 0.04), WOOD, { x: p.x, y: 5.2, z: p.z });
  for (const s of [-1, 1]) {
    b.add(box(2.2, 0.6, 0.1, 0.02), WOOD[0], { x: p.x, y: 5.6, z: p.z + s * 1.05 });
    b.add(box(0.1, 0.6, 2.2, 0.02), WOOD[0], { x: p.x + s * 1.05, y: 5.6, z: p.z });
  }
  b.add(cone(1.5, 1.2, 4), '#c94f3a', { x: p.x, y: 6.6, z: p.z, ry: Math.PI / 4 });
  b.add(box(0.7, 0.45, 0.04, 0.01), color, { x: p.x, y: 7.6, z: p.z + 0.35 });
  b.add(cyl(0.03, 0.03, 1.4, 4), '#3c3f46', { x: p.x, y: 7.6, z: p.z });
}

function flag(b: ModelBuilder, p: { x: number; z: number }, color: string): void {
  b.add(cyl(0.06, 0.07, 4.6, 6), '#e8e2d6', { x: p.x, y: 2.5, z: p.z });
  b.add(box(1.3, 0.8, 0.04, 0.02), color, { x: p.x + 0.7, y: 4.3, z: p.z });
  b.add(ball(0.12, 0), '#f2c14e', { x: p.x, y: 4.85, z: p.z });
}

function forgeExtras(b: ModelBuilder, L: MilitaryLayout): void {
  for (const h of L.yard.slice(0, 3)) {
    b.add(box(1.6, 1.0, 1.2, 0.1), STONE, { x: h.x - 1.6, y: 0.65, z: h.z });
    b.add(box(1.1, 0.15, 0.8, 0.05), '#ff7a2a', { x: h.x - 1.6, y: 1.2, z: h.z });
    b.add(cyl(0.3, 0.38, 3.4 + L.level * 0.6, 8), STONE, { x: h.x - 1.9, y: 2.2 + L.level * 0.3, z: h.z - 0.5 });
    b.add(box(0.9, 0.35, 0.45, 0.05), '#3c3f46', { x: h.x + 1.0, y: 0.95, z: h.z + 0.8 });
    b.add(box(0.4, 0.6, 0.35, 0.05), '#3c3f46', { x: h.x + 1.0, y: 0.5, z: h.z + 0.8 });
    b.add(cyl(0.35, 0.3, 0.6, 10), WOOD, { x: h.x + 1.9, y: 0.5, z: h.z - 1.2 });
  }
  // Finished weapons on display, more with each level.
  for (let i = 0; i < L.level * 2; i += 1) {
    const h = L.yard[3 + (i % 2)] ?? L.yard[0];
    crate(b, h.x - 1.5 + (i % 3) * 1.2, 0.12, h.z - 1 + Math.floor(i / 3) * 1.4, 0.9, 0.2 * i);
  }
  logPile(b, L.yard[L.yard.length - 1].x + 1, L.yard[L.yard.length - 1].z + 1, 0.3);
}

function depotExtras(b: ModelBuilder, L: MilitaryLayout): void {
  // Long store on the second hex, stacks of crates and barrels on the others.
  const h = L.yard[0];
  b.add(box(6, 2.6 + (L.level - 1) * 0.8, 4.4, 0.12), L.level === 1 ? WOOD : BRICK, { x: h.x, y: 1.6 + (L.level - 1) * 0.4, z: h.z });
  gableRoof(b, { width: 6, depth: 4.4, height: 1.6, overhang: 0.3, color: L.level === 1 ? '#b0703f' : '#d9603b', rows: 4, gable: WOOD[0] }, h.x, 2.9 + (L.level - 1) * 0.8, h.z);
  b.add(box(2.0, 2.0, 0.1, 0.03), '#5b3a22', { x: h.x, y: 1.3, z: h.z + 2.25 });
  for (const [k, yh] of L.yard.slice(1).entries()) {
    for (let i = 0; i < 2 + L.level; i += 1) crate(b, yh.x - 2 + (i % 3) * 1.4, 0.12 + Math.floor(i / 3) * 0.7, yh.z - 1 + (k % 2) * 1.2, 0.95, i * 0.4);
    b.add(cyl(0.35, 0.32, 0.8, 10), WOOD, { x: yh.x + 2.2, y: 0.55, z: yh.z + 1.4 });
  }
}

function groundExtras(b: ModelBuilder, L: MilitaryLayout): void {
  // Obstacle course on the (0, 1) hex: hurdles, a climbing wall and a log beam.
  const h = L.hexes[3];
  for (let i = 0; i < 3; i += 1) {
    for (const s of [-1, 1]) b.add(cyl(0.06, 0.06, 0.8, 5), WOOD[0], { x: h.x - 2.4 + i * 1.8 + s * 0.7, y: 0.55, z: h.z - 1.5 });
    b.add(box(1.5, 0.08, 0.08, 0.02), WOOD[1], { x: h.x - 2.4 + i * 1.8, y: 0.9, z: h.z - 1.5 });
  }
  b.add(box(2.6, 1.8 + L.level * 0.3, 0.3, 0.05), WOOD, { x: h.x, y: 1.2, z: h.z + 1.2 });
  b.add(cyl(0.18, 0.18, 3.4, 8), WOOD, { x: h.x + 0.3, y: 0.6, z: h.z + 2.8, rz: Math.PI / 2 });
}

export function militaryModel(code: BuildingTypeCode, level: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const L = militaryLayout(code, level);
  const color = MILITARY_COLORS[code] ?? '#b8463a';
  for (const h of L.hexes) hexPlate(b, h.x, h.z, YARD[L.level - 1], '#8d7a5a');
  if (L.level === 3) {
    // Paved yard stones (kept inside every hex)
    for (const h of L.yard) for (let i = 0; i < 6; i += 1) b.add(box(1.4, 0.05, 1.4, 0.04), ['#c9c1b2', '#ece6da'], { x: h.x + Math.cos(i * 1.047) * 2.6, y: 0.2, z: h.z + Math.sin(i * 1.047) * 2.6, ry: i * 0.3 });
  }
  hall(b, L, color, code === 'military_depot');
  if (code === 'military_forge') forgeExtras(b, L);
  else if (code === 'military_depot') depotExtras(b, L);
  else {
    weaponRack(b, L, code);
    if (code === 'training_ground') groundExtras(b, L);
  }
  if (L.rest) restArea(b, L.rest);
  if (L.tower) tower(b, L.tower, color);
  for (const f of L.flags) flag(b, f, color);
  return b.build();
}
