/**
 * Procedural chibi assets. Each asset is ONE merged BufferGeometry with baked vertex colours
 * (soft vertical gradients for a hand-painted volume look), so it can be drawn with a single
 * InstancedMesh draw call. Two detail levels: 'hi' near the camera, 'lo' far away.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRng } from '@cityverse/shared';
import type { VegetationKind } from '../chunkBuilder';

export type AssetDetail = 'hi' | 'lo';

type Hex = string;

/** Colours a geometry with a vertical gradient (bottom → top) in its local space. */
function paintGradient(geo: THREE.BufferGeometry, bottom: Hex, top: Hex, y0?: number, y1?: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  geo.computeBoundingBox();
  const lo = y0 ?? geo.boundingBox!.min.y;
  const hi = y1 ?? geo.boundingBox!.max.y;
  const cb = new THREE.Color(bottom);
  const ct = new THREE.Color(top);
  const c = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const t = hi > lo ? Math.min(1, Math.max(0, (pos.getY(i) - lo) / (hi - lo))) : 0.5;
    c.copy(cb).lerp(ct, t * t * (3 - 2 * t));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function nonIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  return g;
}

/** Lumpy foliage blob: icosphere with gentle deterministic bumps, smooth normals. */
function blob(radius: number, detail: number, seed: number, squashY = 1): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const rng = createRng(seed);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    const k = 1 + (rng() - 0.5) * 0.16;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * squashY, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function part(geo: THREE.BufferGeometry, x: number, y: number, z: number, bottom: Hex, top: Hex): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const lo = geo.boundingBox!.min.y;
  const hi = geo.boundingBox!.max.y;
  geo.translate(x, y, z);
  paintGradient(geo, bottom, top, lo + y, hi + y);
  return nonIndexed(geo);
}

function trunk(height: number, rBottom: number, rTop: number, detail: AssetDetail, color: Hex, colorTop: Hex): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, height, detail === 'hi' ? 8 : 5, 1);
  return part(geo, 0, height / 2, 0, color, colorTop);
}

interface CanopyBlob {
  x: number;
  y: number;
  z: number;
  r: number;
  sy?: number;
}

function tree(
  detail: AssetDetail,
  seed: number,
  trunkSpec: { h: number; rb: number; rt: number; c0: Hex; c1: Hex },
  blobs: CanopyBlob[],
  leaf: { dark: Hex; light: Hex },
  extras: THREE.BufferGeometry[] = []
): THREE.BufferGeometry {
  const d = detail === 'hi' ? 1 : 0;
  const parts = [trunk(trunkSpec.h, trunkSpec.rb, trunkSpec.rt, detail, trunkSpec.c0, trunkSpec.c1)];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const b of blobs) {
    minY = Math.min(minY, b.y - b.r);
    maxY = Math.max(maxY, b.y + b.r);
  }
  blobs.forEach((b, i) => {
    const g = blob(b.r, d, seed * 31 + i, b.sy ?? 1);
    g.translate(b.x, b.y, b.z);
    paintGradient(g, leaf.dark, leaf.light, minY, maxY);
    parts.push(nonIndexed(g));
  });
  parts.push(...extras);
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('Failed to merge tree geometry');
  return merged;
}

const BARK = { c0: '#7a5232', c1: '#9a6a42' };

function buildTree(kind: VegetationKind, detail: AssetDetail): THREE.BufferGeometry {
  switch (kind) {
    case 'tree_oak':
      return tree(
        detail,
        11,
        { h: 1.9, rb: 0.55, rt: 0.38, ...BARK },
        [
          { x: 0, y: 3.2, z: 0, r: 1.95 },
          { x: 1.3, y: 2.75, z: 0.35, r: 1.3 },
          { x: -1.2, y: 2.85, z: -0.4, r: 1.35 },
          { x: 0.3, y: 4.25, z: -0.25, r: 1.3 },
          { x: -0.4, y: 2.7, z: 1.1, r: 1.1 },
        ],
        { dark: '#3f8f3a', light: '#9edc5e' }
      );
    case 'tree_round':
      return tree(
        detail,
        12,
        { h: 2.2, rb: 0.5, rt: 0.34, ...BARK },
        [
          { x: 0, y: 3.4, z: 0, r: 1.7 },
          { x: 0.1, y: 4.65, z: 0.1, r: 1.3 },
          { x: 0.75, y: 3.85, z: 0.7, r: 1.05 },
          { x: -0.8, y: 3.7, z: -0.5, r: 1.0 },
        ],
        { dark: '#2f7f45', light: '#7fd06a' }
      );
    case 'tree_pine':
      return tree(
        detail,
        13,
        { h: 1.4, rb: 0.42, rt: 0.3, ...BARK },
        [
          { x: 0, y: 2.1, z: 0, r: 1.8, sy: 0.62 },
          { x: 0, y: 3.2, z: 0, r: 1.4, sy: 0.66 },
          { x: 0, y: 4.15, z: 0, r: 1.0, sy: 0.72 },
          { x: 0, y: 4.9, z: 0, r: 0.58, sy: 0.9 },
        ],
        { dark: '#24704f', light: '#68c08a' }
      );
    case 'tree_fruit': {
      const rng = createRng(77);
      const fruits: THREE.BufferGeometry[] = [];
      for (let i = 0; i < (detail === 'hi' ? 9 : 5); i += 1) {
        const a = rng() * Math.PI * 2;
        const y = 2.6 + rng() * 1.6;
        const rad = 1.75 - Math.abs(y - 3.3) * 0.45;
        const f = new THREE.IcosahedronGeometry(0.24, 0);
        fruits.push(part(f, Math.cos(a) * rad, y, Math.sin(a) * rad, '#e8553f', '#ff9a6a'));
      }
      return tree(
        detail,
        14,
        { h: 1.7, rb: 0.5, rt: 0.36, ...BARK },
        [
          { x: 0, y: 3.2, z: 0, r: 1.85 },
          { x: 0.9, y: 2.9, z: -0.6, r: 1.15 },
          { x: -0.9, y: 3.0, z: 0.5, r: 1.2 },
        ],
        { dark: '#4a9a3c', light: '#a8e06a' },
        fruits
      );
    }
    case 'tree_birch':
      return tree(
        detail,
        15,
        { h: 2.6, rb: 0.36, rt: 0.26, c0: '#d9cfbf', c1: '#f6f0e4' },
        [
          { x: 0, y: 3.7, z: 0, r: 1.35 },
          { x: 0.7, y: 3.25, z: 0.3, r: 0.95 },
          { x: -0.6, y: 4.3, z: -0.2, r: 0.95 },
          { x: 0.1, y: 4.9, z: 0.3, r: 0.75 },
        ],
        { dark: '#8cbc3c', light: '#dcef84' }
      );
    case 'tree_autumn':
      return tree(
        detail,
        16,
        { h: 1.8, rb: 0.52, rt: 0.36, ...BARK },
        [
          { x: 0, y: 3.1, z: 0, r: 1.85 },
          { x: 1.15, y: 2.8, z: -0.3, r: 1.2 },
          { x: -1.1, y: 2.9, z: 0.4, r: 1.25 },
          { x: 0.1, y: 4.15, z: 0.1, r: 1.2 },
        ],
        { dark: '#d06a2c', light: '#ffc95a' }
      );
    default:
      throw new Error(`Not a tree: ${kind}`);
  }
}

function buildBush(detail: AssetDetail): THREE.BufferGeometry {
  const d = detail === 'hi' ? 1 : 0;
  const specs = [
    { x: 0, y: 0.55, z: 0, r: 0.85 },
    { x: 0.7, y: 0.45, z: 0.25, r: 0.62 },
    { x: -0.6, y: 0.42, z: -0.3, r: 0.6 },
    { x: 0.1, y: 0.4, z: -0.65, r: 0.5 },
  ];
  const parts = specs.map((s, i) => {
    const g = blob(s.r, d, 200 + i, 0.85);
    g.translate(s.x, s.y, s.z);
    paintGradient(g, '#3d8a36', '#95d660', -0.2, 1.4);
    return nonIndexed(g);
  });
  return mergeGeometries(parts, false)!;
}

function buildRock(detail: AssetDetail): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail === 'hi' ? 2 : 1);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const rng = createRng(4242);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    const k = 1 + (rng() - 0.5) * 0.28;
    const y = pos.getY(i);
    // Flattened base, rounded top: pebble/boulder shape.
    pos.setXYZ(i, pos.getX(i) * k * 1.1, (y < 0 ? y * 0.45 : y) * k, pos.getZ(i) * k * 0.95);
  }
  geo.translate(0, 0.35, 0);
  geo.computeVertexNormals();
  paintGradient(geo, '#8d877e', '#d8d2c6');
  return geo;
}

function buildFlowers(detail: AssetDetail, palette: Hex[]): THREE.BufferGeometry {
  const rng = createRng(palette.length * 97 + palette[0].length);
  const parts: THREE.BufferGeometry[] = [];
  const count = detail === 'hi' ? 6 : 4;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.6;
    const r = i === 0 ? 0 : 0.3 + rng() * 0.35;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.38 + rng() * 0.3;
    parts.push(part(new THREE.CylinderGeometry(0.025, 0.035, h, 4), x, h / 2, z, '#3f8a34', '#6cbf4a'));
    const color = palette[i % palette.length];
    const head = new THREE.IcosahedronGeometry(0.13 + rng() * 0.05, detail === 'hi' ? 1 : 0);
    head.scale(1, 0.7, 1);
    parts.push(part(head, x, h + 0.04, z, color, '#fffaf0'));
  }
  const merged = mergeGeometries(parts, false)!;
  // Up-facing normals: flowers are lit like the ground they grow on.
  const n = merged.getAttribute('normal');
  for (let i = 0; i < n.count; i += 1) n.setXYZ(i, 0, 1, 0);
  return merged;
}

function buildGrassTuft(detail: AssetDetail): THREE.BufferGeometry {
  const rng = createRng(909);
  const blades = detail === 'hi' ? 7 : 4;
  const positions: number[] = [];
  const colors: number[] = [];
  const base = new THREE.Color('#4f9a34');
  const tip = new THREE.Color('#c4ec74');
  for (let b = 0; b < blades; b += 1) {
    const a = (b / blades) * Math.PI * 2 + rng() * 0.5;
    const ox = Math.cos(a) * 0.12;
    const oz = Math.sin(a) * 0.12;
    const lean = 0.18 + rng() * 0.2;
    const h = 0.45 + rng() * 0.35;
    const w = 0.07;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    const tx = ox + Math.cos(a) * lean;
    const tz = oz + Math.sin(a) * lean;
    // Two triangles: wide base → narrow tip, gently bent.
    const mx = ox + Math.cos(a) * lean * 0.45;
    const mz = oz + Math.sin(a) * lean * 0.45;
    const verts = [
      [ox - px, 0, oz - pz, 0],
      [ox + px, 0, oz + pz, 0],
      [mx + px * 0.6, h * 0.55, mz + pz * 0.6, 0.55],
      [ox - px, 0, oz - pz, 0],
      [mx + px * 0.6, h * 0.55, mz + pz * 0.6, 0.55],
      [mx - px * 0.6, h * 0.55, mz - pz * 0.6, 0.55],
      [mx - px * 0.6, h * 0.55, mz - pz * 0.6, 0.55],
      [mx + px * 0.6, h * 0.55, mz + pz * 0.6, 0.55],
      [tx, h, tz, 1],
    ];
    for (const [x, y, z, t] of verts) {
      positions.push(x, y, z);
      const c = base.clone().lerp(tip, t);
      colors.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geo;
}

function roundedBlock(w: number, h: number, d: number, detail: AssetDetail): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  // Pull corners inward → soft, chibi-rounded stone blocks.
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  const k = detail === 'hi' ? 0.22 : 0.15;
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const nx = Math.abs(v.x) / (w / 2);
    const ny = Math.abs(v.y) / (h / 2);
    const nz = Math.abs(v.z) / (d / 2);
    const corner = (nx > 0.99 ? 1 : 0) + (ny > 0.99 ? 1 : 0) + (nz > 0.99 ? 1 : 0);
    if (corner >= 2) v.multiplyScalar(1 - k * (corner - 1) * 0.5);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildRuinWall(detail: AssetDetail): THREE.BufferGeometry {
  const stone = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0): THREE.BufferGeometry => {
    geo.rotateY(ry);
    return part(geo, x, y, z, '#9d907f', '#d2c6b2');
  };
  const parts = [
    stone(roundedBlock(3.2, 1.0, 0.9, detail), 0, 0.5, 0),
    stone(roundedBlock(1.5, 1.0, 0.85, detail), -0.75, 1.5, 0),
    stone(roundedBlock(0.9, 0.8, 0.8, detail), -1.0, 2.4, 0.02),
    stone(roundedBlock(0.8, 0.55, 0.7, detail), 2.1, 0.28, 0.9, 0.5),
    part(new THREE.IcosahedronGeometry(0.42, 1), 0.6, 1.08, 0, '#6f9a48', '#9cc864'), // moss tuft
  ];
  return mergeGeometries(parts.map(nonIndexed), false)!;
}

function buildRuinPillar(detail: AssetDetail): THREE.BufferGeometry {
  const seg = detail === 'hi' ? 8 : 6;
  const parts = [
    part(roundedBlock(1.5, 0.45, 1.5, detail), 0, 0.22, 0, '#93887a', '#c7bcab'),
    part(new THREE.CylinderGeometry(0.5, 0.58, 2.6, seg), 0, 1.75, 0, '#a89a87', '#ddd2bf'),
    part(new THREE.CylinderGeometry(0.42, 0.5, 0.5, seg), 0.9, 0.25, 0.8, '#a89a87', '#ddd2bf'),
    // Rusty machine scrap: post-apocalyptic touch.
    part(roundedBlock(0.8, 0.5, 0.6, detail), -1.0, 0.25, 0.6, '#8a4f34', '#c07850'),
  ];
  return mergeGeometries(parts.map(nonIndexed), false)!;
}

export function buildVegetationGeometry(kind: VegetationKind, detail: AssetDetail): THREE.BufferGeometry {
  switch (kind) {
    case 'bush':
      return buildBush(detail);
    case 'rock':
      return buildRock(detail);
    case 'flower_warm':
      return buildFlowers(detail, ['#ff8fb1', '#ffd45c', '#ffffff', '#ff6f6f']);
    case 'flower_cool':
      return buildFlowers(detail, ['#8fa8ff', '#c08cff', '#ffffff', '#7fd6ff']);
    case 'grass':
      return buildGrassTuft(detail);
    case 'ruin_wall':
      return buildRuinWall(detail);
    case 'ruin_pillar':
      return buildRuinPillar(detail);
    default:
      return buildTree(kind, detail);
  }
}

