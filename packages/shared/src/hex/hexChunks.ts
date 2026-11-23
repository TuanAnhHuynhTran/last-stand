/**
 * Hex-compatible world chunks.
 *
 * The 1000 × 1000 world is split into square chunks on the XZ plane. A hex belongs to
 * exactly one chunk: the one containing its centre (half-open intervals). Chunks are only a
 * streaming / rendering unit; every gameplay rule keeps using hex coordinates.
 */
import type { ChunkCoord, WorldBounds } from '../types.js';
import {
  HEX_RADIUS,
  HEX_ROW_STEP,
  HEX_SPACING,
  HEX_WORLD_SIZE,
  axialToWorld,
  getWorldBounds,
  isWithinWorldBounds,
  type AxialCoord,
} from './hexMath.js';

export const WORLD_CHUNK_SIZE = 100;
export const WORLD_CHUNKS_PER_SIDE = HEX_WORLD_SIZE / WORLD_CHUNK_SIZE;
export const WORLD_TOTAL_CHUNKS = WORLD_CHUNKS_PER_SIDE * WORLD_CHUNKS_PER_SIDE;

export function worldChunkKey(cx: number, cz: number): string {
  return `${cx}:${cz}`;
}

export function isValidWorldChunk(cx: number, cz: number): boolean {
  return cx >= 0 && cz >= 0 && cx < WORLD_CHUNKS_PER_SIDE && cz < WORLD_CHUNKS_PER_SIDE;
}

export function getWorldChunkBounds(cx: number, cz: number): WorldBounds {
  const world = getWorldBounds();
  const minX = world.minX + cx * WORLD_CHUNK_SIZE;
  const minZ = world.minZ + cz * WORLD_CHUNK_SIZE;
  return { minX, maxX: minX + WORLD_CHUNK_SIZE, minZ, maxZ: minZ + WORLD_CHUNK_SIZE };
}

/** Chunk containing a world point (clamped into the world). */
export function worldPointToChunk(x: number, z: number): ChunkCoord {
  const world = getWorldBounds();
  const max = WORLD_CHUNKS_PER_SIDE - 1;
  return {
    cx: Math.min(max, Math.max(0, Math.floor((x - world.minX) / WORLD_CHUNK_SIZE))),
    cz: Math.min(max, Math.max(0, Math.floor((z - world.minZ) / WORLD_CHUNK_SIZE))),
  };
}

export function hexToChunk(q: number, r: number): ChunkCoord {
  const c = axialToWorld(q, r);
  return worldPointToChunk(c.x, c.z);
}

/** All in-world hexes owned by a chunk (centre inside the chunk rectangle). */
export function getChunkHexes(cx: number, cz: number): AxialCoord[] {
  const b = getWorldChunkBounds(cx, cz);
  const world = getWorldBounds();
  const out: AxialCoord[] = [];
  const rMin = Math.ceil(b.minZ / HEX_ROW_STEP) - 1;
  const rMax = Math.floor(b.maxZ / HEX_ROW_STEP) + 1;
  for (let r = rMin; r <= rMax; r += 1) {
    const qMin = Math.floor(b.minX / HEX_SPACING - r / 2) - 1;
    const qMax = Math.ceil(b.maxX / HEX_SPACING - r / 2) + 1;
    for (let q = qMin; q <= qMax; q += 1) {
      const c = axialToWorld(q, r);
      const inX = c.x >= b.minX && (c.x < b.maxX || (cx === WORLD_CHUNKS_PER_SIDE - 1 && c.x <= b.maxX));
      const inZ = c.z >= b.minZ && (c.z < b.maxZ || (cz === WORLD_CHUNKS_PER_SIDE - 1 && c.z <= b.maxZ));
      if (inX && inZ && isWithinWorldBounds(q, r, world)) {
        out.push({ q: q === 0 ? 0 : q, r: r === 0 ? 0 : r });
      }
    }
  }
  return out;
}

/** Chunks whose rectangle intersects the circle (x, z, radius). Sorted nearest first. */
export function getWorldChunksInRadius(x: number, z: number, radius: number): ChunkCoord[] {
  const out: { c: ChunkCoord; d: number }[] = [];
  for (let cz = 0; cz < WORLD_CHUNKS_PER_SIDE; cz += 1) {
    for (let cx = 0; cx < WORLD_CHUNKS_PER_SIDE; cx += 1) {
      const d = distanceToWorldChunk(cx, cz, x, z);
      if (d <= radius) out.push({ c: { cx, cz }, d });
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out.map((o) => o.c);
}

/** Distance from a point to the nearest point of a chunk rectangle (0 when inside). */
export function distanceToWorldChunk(cx: number, cz: number, x: number, z: number): number {
  const b = getWorldChunkBounds(cx, cz);
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

/** Bounding margin a hex polygon can overhang its chunk rectangle. */
export const HEX_CHUNK_OVERHANG = HEX_RADIUS;
