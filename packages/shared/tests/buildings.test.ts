import { describe, expect, it } from 'vitest';
import { axialToWorld, hexDistance, hexKey, isConnectedRegion } from '../src/hex/hexMath.js';
import { WorldGenerator } from '../src/worldgen/WorldGenerator.js';
import {
  BUILDING_DEFINITIONS,
  getBuildingDefinition,
  missingResources,
} from '../src/buildings/definitions.js';
import {
  checkPlacement,
  getFootprintHexes,
  rotateAxial,
  rotationToYaw,
} from '../src/buildings/footprint.js';

const world = new WorldGenerator('CV-COA-AABBCC112233');
const spawn = { q: world.spawn.q, r: world.spawn.r };

describe('Building catalogue', () => {
  it('has the required building types (incl. Phase 7 economy) with 3 levels each', () => {
    expect(BUILDING_DEFINITIONS.map((d) => d.code).sort()).toEqual(
      ['carpentry', 'clinic', 'house', 'market', 'quarry', 'radar', 'road', 'smithy', 'storage', 'territory_center', 'well', 'sword_barracks', 'spear_barracks', 'archery_range', 'crossbow_range', 'military_forge', 'training_ground', 'military_depot'].sort()
    );
    for (const def of BUILDING_DEFINITIONS) {
      expect(def.levels.map((l) => l.level)).toEqual([1, 2, 3]);
      expect(def.footprint[0]).toEqual({ q: 0, r: 0 });
      expect(isConnectedRegion([...def.footprint])).toBe(true);
    }
  });

  it('house is always exactly 1 hex and capacity grows 4 → 6 → 10', () => {
    const house = getBuildingDefinition('house');
    expect(house.footprint).toHaveLength(1);
    expect(house.levels.map((l) => l.stats.residents)).toEqual([4, 6, 10]);
    for (let rot = 0; rot < 6; rot += 1) {
      expect(getFootprintHexes('house', { q: 3, r: -2 }, rot)).toEqual([{ q: 3, r: -2 }]);
    }
  });

  it('reports missing resources', () => {
    expect(missingResources({ coins: 10, wood: 5, stone: 0 }, { coins: 5, wood: 6, stone: 0 })).toEqual(['wood']);
    expect(missingResources({ coins: 10, wood: 6, stone: 1 }, { coins: 5, wood: 6, stone: 1 })).toEqual([]);
  });
});

describe('Footprint rotation', () => {
  it('six 60° steps return to the start and keep distances', () => {
    const o = { q: 2, r: -1 };
    let cur = o;
    for (let i = 0; i < 6; i += 1) {
      const next = rotateAxial(cur, 1);
      expect(hexDistance({ q: 0, r: 0 }, next)).toBe(hexDistance({ q: 0, r: 0 }, o));
      cur = next;
    }
    expect(cur).toEqual(o);
  });

  it('model yaw matches the footprint rotation in world space', () => {
    for (let rot = 0; rot < 6; rot += 1) {
      const off = rotateAxial({ q: 1, r: 0 }, rot);
      const expected = axialToWorld(off.q, off.r);
      const yaw = rotationToYaw(rot);
      // Three.js Y rotation of the vector (10, 0, 0)
      const x = 10 * Math.cos(yaw);
      const z = -10 * Math.sin(yaw);
      expect(x).toBeCloseTo(expected.x, 6);
      expect(z).toBeCloseTo(expected.z, 6);
    }
  });

  it('multi-hex footprints stay connected for every rotation', () => {
    for (const def of BUILDING_DEFINITIONS) {
      for (let rot = 0; rot < 6; rot += 1) {
        const hexes = getFootprintHexes(def.code, spawn, rot);
        expect(hexes).toHaveLength(def.footprint.length);
        expect(isConnectedRegion(hexes)).toBe(true);
      }
    }
  });
});

describe('Placement validation', () => {
  it('accepts owned, buildable, free land', () => {
    const r = checkPlacement(world, 'house', spawn, 0, new Map());
    expect(r.valid).toBe(true);
  });

  it('rejects building on top of another building, but not on itself while moving', () => {
    const occupied = new Map([[hexKey(spawn.q, spawn.r), 'b1']]);
    const r = checkPlacement(world, 'house', spawn, 0, occupied);
    expect(r.valid).toBe(false);
    expect(r.issues).toEqual(['OCCUPIED']);
    expect(checkPlacement(world, 'house', spawn, 0, occupied, 'b1').valid).toBe(true);
  });

  it('rejects land outside the territory and outside the world', () => {
    const far = { q: spawn.q + 20, r: spawn.r };
    expect(checkPlacement(world, 'house', far, 0, new Map()).issues).toContain('NOT_OWNED');
    expect(checkPlacement(world, 'house', { q: 60, r: 0 }, 0, new Map()).issues).toContain('OUT_OF_BOUNDS');
  });

  it('flags only the offending hexes of a multi-hex footprint', () => {
    const occupied = new Map([[hexKey(spawn.q + 1, spawn.r), 'b2']]);
    const r = checkPlacement(world, 'storage', spawn, 0, occupied);
    expect(r.valid).toBe(false);
    expect(r.hexes.filter((h) => h.issue === 'OCCUPIED')).toEqual([{ q: spawn.q + 1, r: spawn.r, issue: 'OCCUPIED' }]);
  });
});
