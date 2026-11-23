import { describe, expect, it } from 'vitest';
import { WORLD_CHUNK_SIZE, WATER_LEVEL, WorldGenerator } from '@cityverse/shared';
import {
  SKIRT_DEPTH,
  VEG_STRIDE,
  buildTerrainChunk,
  buildVegetationChunk,
  buildWaterChunk,
  countVegetation,
  sampleTerrainChunkHeight,
  type TerrainChunkData,
} from '../../game/world/chunkBuilder';
import { QUALITY_PRESETS } from '../../game/world/qualitySettings';

const world = new WorldGenerator('CV-COA-AABBCC112233');

function vertex(c: TerrainChunkData, i: number, j: number) {
  const v = j * (c.segments + 1) + i;
  return {
    p: [c.positions[v * 3], c.positions[v * 3 + 1], c.positions[v * 3 + 2]],
    n: [c.normals[v * 3], c.normals[v * 3 + 1], c.normals[v * 3 + 2]],
  };
}

describe('Terrain chunks – no gaps between chunks', () => {
  it('quality cell sizes tile the chunk exactly', () => {
    for (const q of Object.values(QUALITY_PRESETS)) {
      expect(Number.isInteger(WORLD_CHUNK_SIZE / q.terrainCell)).toBe(true);
      expect(Number.isInteger(WORLD_CHUNK_SIZE / q.terrainFarCell)).toBe(true);
    }
  });

  it('shared edges of neighbouring chunks (same LOD) are bit-identical in position and normal', () => {
    const cell = 2.5;
    const a = buildTerrainChunk(world, 4, 4, cell, 0);
    const right = buildTerrainChunk(world, 5, 4, cell, 0);
    const below = buildTerrainChunk(world, 4, 5, cell, 0);
    const n = a.segments;
    for (let k = 0; k <= n; k += 1) {
      expect(vertex(a, n, k)).toEqual(vertex(right, 0, k));
      expect(vertex(a, k, n)).toEqual(vertex(below, k, 0));
    }
  });

  it('chunks at different LODs meet at the same height on shared vertices and have skirts', () => {
    const near = buildTerrainChunk(world, 4, 4, 2, 0);
    const far = buildTerrainChunk(world, 5, 4, 4, 1);
    for (let k = 0; k <= far.segments; k += 1) {
      const a = vertex(near, near.segments, k * 2).p;
      const b = vertex(far, 0, k).p;
      expect(a).toEqual(b);
    }
    // Skirt vertices hang SKIRT_DEPTH below every perimeter vertex.
    const perimeter = 4 * near.segments;
    expect(near.positions.length / 3).toBe(near.surfaceVertexCount + perimeter);
    const firstSkirt = near.surfaceVertexCount;
    expect(near.positions[firstSkirt * 3 + 1]).toBeCloseTo(near.positions[1] - SKIRT_DEPTH, 5);
  });

  it('sampled surface height matches mesh vertices and is continuous across chunk borders', () => {
    const a = buildTerrainChunk(world, 3, 6, 2.5, 0);
    const b = buildTerrainChunk(world, 4, 6, 2.5, 0);
    const v = vertex(a, 7, 9).p;
    expect(sampleTerrainChunkHeight(a, v[0], v[2])).toBeCloseTo(v[1], 5);
    const edgeX = a.bounds.maxX;
    for (let z = a.bounds.minZ; z <= a.bounds.maxZ; z += 3.3) {
      expect(sampleTerrainChunkHeight(a, edgeX, z)!).toBeCloseTo(sampleTerrainChunkHeight(b, edgeX, z)!, 4);
    }
  });

  it('terrain colours are valid and vary (not a flat single colour)', () => {
    const c = buildTerrainChunk(world, 4, 4, 4, 1);
    const unique = new Set<string>();
    for (let i = 0; i < c.colors.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        expect(c.colors[i + k]).toBeGreaterThanOrEqual(0);
        expect(c.colors[i + k]).toBeLessThanOrEqual(1);
      }
      unique.add(`${c.colors[i].toFixed(2)},${c.colors[i + 1].toFixed(2)}`);
    }
    expect(unique.size).toBeGreaterThan(40);
  });
});

describe('Water chunks', () => {
  it('water only covers cells where the terrain dips below the water level', () => {
    let found = 0;
    for (let cz = 0; cz < 10 && found < 3; cz += 1) {
      for (let cx = 0; cx < 10 && found < 3; cx += 1) {
        const t = buildTerrainChunk(world, cx, cz, 5, 1);
        const w = buildWaterChunk(t);
        if (t.minHeight >= WATER_LEVEL) {
          expect(w).toBeNull();
          continue;
        }
        if (!w) continue;
        found += 1;
        for (let i = 1; i < w.positions.length; i += 3) expect(w.positions[i]).toBe(WATER_LEVEL);
        expect(Math.max(...w.depths)).toBeGreaterThan(0.5);
        expect(w.indices.length % 3).toBe(0);
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('Vegetation placement', () => {
  it('is deterministic per seed and chunk', () => {
    const a = buildVegetationChunk(world, 3, 3, { grassSpacing: 2.4 });
    const b = buildVegetationChunk(new WorldGenerator('CV-COA-AABBCC112233'), 3, 3, { grassSpacing: 2.4 });
    expect(a).toEqual(b);
  });

  it('places 4–6 tree species, bushes, rocks, flowers and grass, never in water', () => {
    const kinds = new Set<string>();
    let instances = 0;
    for (const [cx, cz] of [
      [2, 2],
      [3, 4],
      [5, 5],
      [6, 3],
      [4, 7],
      [7, 6],
    ]) {
      const veg = buildVegetationChunk(world, cx, cz, { grassSpacing: 2.4 });
      instances += countVegetation(veg);
      for (const [kind, data] of Object.entries(veg)) {
        if (!data || data.length === 0) continue;
        kinds.add(kind);
        for (let i = 0; i < data.length; i += VEG_STRIDE) {
          const x = data[i];
          const z = data[i + 2];
          const h = world.terrain.heightAt(x, z);
          if (kind !== 'rock') expect(h, `${kind} at ${x},${z}`).toBeGreaterThan(WATER_LEVEL);
          // Controlled size variation
          expect(data[i + 4]).toBeGreaterThan(0.3);
          expect(data[i + 4]).toBeLessThan(3.5);
        }
      }
    }
    const trees = [...kinds].filter((k) => k.startsWith('tree_'));
    expect(trees.length).toBeGreaterThanOrEqual(4);
    for (const k of ['bush', 'rock', 'grass']) expect(kinds.has(k), k).toBe(true);
    expect(kinds.has('flower_warm') || kinds.has('flower_cool')).toBe(true);
    expect(instances).toBeGreaterThan(1000);
  });

  it('keeps the starter territory open (no trees on owned land)', () => {
    const t = world.getHexTile(world.spawn.q, world.spawn.r);
    const veg = buildVegetationChunk(world, t.chunkX, t.chunkZ, { grassSpacing: 0 });
    for (const [kind, data] of Object.entries(veg)) {
      if (!kind.startsWith('tree_') || !data) continue;
      for (let i = 0; i < data.length; i += VEG_STRIDE) {
        expect(Math.hypot(data[i] - world.spawn.x, data[i + 2] - world.spawn.z)).toBeGreaterThan(55);
      }
    }
  });
});
