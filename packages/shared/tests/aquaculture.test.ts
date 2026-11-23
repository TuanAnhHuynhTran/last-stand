import { describe, expect, it } from 'vitest';
import { axialToWorld, getConnectedHexes, getHexPolygon, hexDistance, hexKey, hexNeighbors, type AxialCoord } from '../src/hex/hexMath.js';
import { WorldGenerator } from '../src/worldgen/WorldGenerator.js';
import {
  FISH_SPECIES_DEFINITIONS,
  WATER_BODY_DEFINITIONS,
  getFishSpecies,
  waterBodyCapacity,
  waterBodyCreateCost,
  waterBodyExpandCost,
  waterBodyUpgradeCost,
} from '../src/aquaculture/definitions.js';
import { POND_BANK_WIDTH, PondEditLayer, measurePond, planPondLevels, regionBorder, type PondSpec } from '../src/aquaculture/pondTerrain.js';
import { fishStage, harvestYield, simulateAquaculture, type AquaSimState, type SimFishBatch } from '../src/aquaculture/simulation.js';
import { checkWaterBodyShape } from '../src/aquaculture/api.js';

const SEED = 'CV-COA-AABBCC112233';
const freshWorld = () => new WorldGenerator(SEED);
const world = freshWorld();
const farmable = (h: AxialCoord) => world.isOwned(h.q, h.r) && world.getHexTile(h.q, h.r).buildable;
const region = (n: number, start: AxialCoord = world.spawn) => getConnectedHexes({ q: start.q, r: start.r }, farmable, n);
const base = (x: number, z: number) => world.terrain.baseHeightAt(x, z);

function pondSpec(hexes: AxialCoord[], id = 'p1'): PondSpec {
  const l = planPondLevels(base, hexes, 'fish_pond');
  return { id, hexes, surface: l.surface, bottom: l.bottom, dug: true };
}

/** An L-shaped / irregular region: a line of hexes plus a side arm. */
function irregular(): AxialCoord[] {
  const s = world.spawn;
  const out = [0, 1, 2, 3, 4].map((i) => ({ q: s.q + i, r: s.r }));
  out.push({ q: s.q + 4, r: s.r + 1 }, { q: s.q + 4, r: s.r + 2 }, { q: s.q, r: s.r - 1 });
  return out.filter(farmable);
}

describe('Aquaculture catalogue', () => {
  it('four water body types with the required minimum sizes and three levels', () => {
    expect(Object.fromEntries(WATER_BODY_DEFINITIONS.map((d) => [d.code, d.minHexes]))).toEqual({ fish_pond: 6, fish_lake: 12, hatchery: 6, fish_cage: 6 });
    for (const d of WATER_BODY_DEFINITIONS) {
      expect(d.levels.map((l) => l.level)).toEqual([1, 2, 3]);
      expect(d.levels[2].baseQuality).toBeGreaterThan(d.levels[0].baseQuality);
      expect(waterBodyCapacity(d.code, 3, 6)).toBeGreaterThan(waterBodyCapacity(d.code, 1, 6));
      expect(waterBodyUpgradeCost(d.code, 3, 6)!.coins).toBeGreaterThan(waterBodyUpgradeCost(d.code, 2, 6)!.coins);
    }
    expect(FISH_SPECIES_DEFINITIONS.map((f) => f.code)).toEqual(['carp', 'tilapia', 'catfish', 'snakehead']);
    expect(waterBodyCreateCost('fish_lake', 12).coins).toBeGreaterThan(waterBodyCreateCost('fish_pond', 12).coins);
    expect(waterBodyExpandCost('fish_pond', 3, 2).coins).toBeGreaterThan(waterBodyExpandCost('fish_pond', 1, 2).coins);
  });
});

describe('Pond terrain (real digging)', () => {
  it('the bed is below the surrounding land and the surface sits just below the rim', () => {
    const hexes = region(6);
    const spec = pondSpec(hexes);
    expect(spec.surface).toBeLessThan(Math.min(...hexes.map((h) => world.getHexTile(h.q, h.r).height)));
    const layer = new PondEditLayer();
    layer.setPonds([spec]);
    const w = freshWorld();
    w.setTerrainEdits(layer);
    for (const h of hexes) {
      const c = axialToWorld(h.q, h.r);
      expect(w.terrain.heightAt(c.x, c.z)).toBeLessThan(world.terrain.heightAt(c.x, c.z));
      expect(w.getHexTile(h.q, h.r)).toMatchObject({ isWater: true, buildable: false });
    }
    // Outside the region nothing changes.
    const outside = hexNeighbors(hexes[0]).find((n) => !hexes.some((h) => h.q === n.q && h.r === n.r))!;
    const o = axialToWorld(outside.q, outside.r);
    expect(w.terrain.heightAt(o.x, o.z)).toBe(world.terrain.heightAt(o.x, o.z));
  });

  it('no gap: the carved surface is continuous across the shoreline, and the bank slopes gently', () => {
    const hexes = irregular();
    const spec = pondSpec(hexes);
    const layer = new PondEditLayer();
    layer.setPonds([spec]);
    const w = freshWorld();
    w.setTerrainEdits(layer);
    for (const s of regionBorder(hexes)) {
      for (const t of [0.1, 0.5, 0.9]) {
        const x = s.ax + (s.bx - s.ax) * t;
        const z = s.az + (s.bz - s.az) * t;
        // On the border the edit is zero …
        expect(Math.abs(w.terrain.heightAt(x, z) - world.terrain.heightAt(x, z))).toBeLessThan(1e-6);
        // … and 5 cm to either side the heights still match (continuous, no step / gap).
        const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
        const nx = -(s.bz - s.az) / len;
        const nz = (s.bx - s.ax) / len;
        const a = w.terrain.heightAt(x + nx * 0.05, z + nz * 0.05);
        const b = w.terrain.heightAt(x - nx * 0.05, z - nz * 0.05);
        expect(Math.abs(a - b)).toBeLessThan(0.05);
      }
    }
    // Max slope along a ray from a border edge into the pond stays gentle.
    const c = axialToWorld(hexes[2].q, hexes[2].r);
    const s = regionBorder(hexes)[0];
    const mx = (s.ax + s.bx) / 2;
    const mz = (s.az + s.bz) / 2;
    let prev = w.terrain.heightAt(mx, mz);
    let maxSlope = 0;
    for (let k = 1; k <= 40; k += 1) {
      const t = k / 40;
      const x = mx + (c.x - mx) * t * 0.5;
      const z = mz + (c.z - mz) * t * 0.5;
      const h = w.terrain.heightAt(x, z);
      const step = Math.hypot((c.x - mx) * 0.5, (c.z - mz) * 0.5) / 40;
      maxSlope = Math.max(maxSlope, Math.abs(h - prev) / step);
      prev = h;
    }
    expect(maxSlope).toBeLessThan(1.2); // < ~50°: a soft chibi bank, not a cliff
  });

  it('irregular shapes are dug as drawn; expansion merges water and removes the inner bank', () => {
    const hexes = irregular();
    expect(hexes.length).toBeGreaterThanOrEqual(6);
    const small = pondSpec(hexes.slice(0, 6));
    const layer = new PondEditLayer();
    layer.setPonds([small]);
    // A point on the old border that becomes interior after expanding.
    const keys = new Set(hexes.slice(0, 6).map((h) => hexKey(h.q, h.r)));
    const added = hexes.slice(6);
    const shared = regionBorder(hexes.slice(0, 6)).find((s) => {
      const mx = (s.ax + s.bx) / 2;
      const mz = (s.az + s.bz) / 2;
      return added.some((h) => {
        const c = axialToWorld(h.q, h.r);
        return Math.hypot(c.x - mx, c.z - mz) < 6;
      });
    });
    expect(shared).toBeTruthy();
    const mx = (shared!.ax + shared!.bx) / 2;
    const mz = (shared!.az + shared!.bz) / 2;
    const w = freshWorld();
    w.setTerrainEdits(layer);
    const before = w.terrain.heightAt(mx, mz);
    const changed = layer.setPonds([pondSpec(hexes)]);
    w.setTerrainEdits(layer);
    for (const h of added) expect(changed.has(hexKey(h.q, h.r))).toBe(true);
    expect(keys.size).toBe(6);
    // The old shoreline is now pond bed.
    expect(w.terrain.heightAt(mx, mz)).toBeLessThan(before - 0.8);
  });

  it('measures area, volume and shoreline', () => {
    const m6 = measurePond(base, pondSpec(region(6)));
    const m10 = measurePond(base, pondSpec(region(10)));
    expect(m6.area).toBeGreaterThan(200);
    expect(m6.volume).toBeGreaterThan(m6.area * 0.5);
    expect(m10.volume).toBeGreaterThan(m6.volume);
    expect(m6.maxDepth).toBeGreaterThan(1.2);
    expect(m6.shoreline).toBeGreaterThan(0);
    void getHexPolygon;
  });

  it('shape check: ponds on free owned land only; cages on natural water near the territory', () => {
    const owned = world.getStarterTerritory();
    const none = new Map<string, string>();
    const opts = { baseHeight: base, ownedHexes: owned };
    expect(checkWaterBodyShape(world, 'fish_pond', region(5), none, opts).issues).toContain('TOO_SMALL');
    const ok = checkWaterBodyShape(world, 'fish_pond', region(6), none, opts);
    expect(ok.valid).toBe(true);
    expect(ok.levels!.bottom).toBeLessThan(ok.levels!.surface);
    expect(checkWaterBodyShape(world, 'fish_lake', region(11), none, opts).issues).toContain('TOO_SMALL');
    expect(checkWaterBodyShape(world, 'fish_lake', region(12), none, opts).valid).toBe(true);
    const house = new Map([[hexKey(region(6)[0].q, region(6)[0].r), 'building-1']]);
    expect(checkWaterBodyShape(world, 'fish_pond', region(6), house, opts).issues).toContain('OCCUPIED');
    // Cages: land is refused; natural water near the territory is accepted.
    expect(checkWaterBodyShape(world, 'fish_cage', region(6), none, opts).issues).toContain('NOT_WATER');
    const nearWater: AxialCoord[] = [];
    for (let q = world.spawn.q - 25; q <= world.spawn.q + 25; q += 1) {
      for (let r = world.spawn.r - 25; r <= world.spawn.r + 25; r += 1) {
        if (world.getHexTile(q, r).isWater && owned.some((o) => hexDistance(o, { q, r }) <= 3)) nearWater.push({ q, r });
      }
    }
    if (nearWater.length) {
      const set = new Set(nearWater.map((h) => hexKey(h.q, h.r)));
      const cage = getConnectedHexes(nearWater[0], (h) => set.has(hexKey(h.q, h.r)), 6);
      if (cage.length === 6) expect(checkWaterBodyShape(world, 'fish_cage', cage, none, opts).valid).toBe(true);
    }
  });
});

describe('Aquaculture simulation', () => {
  const MIN = 60_000;
  const batch = (over: Partial<SimFishBatch> = {}): SimFishBatch => ({ id: 'b', species: 'tilapia', alive: 100, weight: 0.02, health: 1, satiety: 0.8, ...over });
  const pond = (over: Partial<AquaSimState> = {}): AquaSimState => ({
    type: 'fish_pond',
    level: 1,
    hexCount: 6,
    waterLevel: 1,
    quality: 0.75,
    feedStock: 1000,
    feedQuality: 0,
    fill: null,
    batches: [batch()],
    ...over,
  });

  it('well-fed fish in good water grow to market weight within about their grow time', () => {
    const t = getFishSpecies('tilapia').growSeconds * 1000;
    const res = simulateAquaculture(pond({ level: 2 }), 0, t * 1.2);
    const b = res.state.batches[0];
    expect(fishStage('fish_pond', b)).toBe('harvestable');
    expect(res.feedUsed).toBeGreaterThan(0);
    expect(harvestYield('fish_pond', 2, res.state.quality, b)).toBeGreaterThan(50);
  });

  it('no feed → slower growth and falling health; overcrowding lowers water quality', () => {
    const t = getFishSpecies('tilapia').growSeconds * 1000;
    const fed = simulateAquaculture(pond(), 0, t).state.batches[0];
    const starved = simulateAquaculture(pond({ feedStock: 0 }), 0, t).state.batches[0];
    expect(starved.weight).toBeLessThan(fed.weight);
    expect(starved.health).toBeLessThan(fed.health);
    const crowded = simulateAquaculture(pond({ batches: [batch({ alive: 400 })] }), 0, 20 * MIN).state;
    const calm = simulateAquaculture(pond({ batches: [batch({ alive: 40 })] }), 0, 20 * MIN).state;
    expect(crowded.quality).toBeLessThan(calm.quality);
  });

  it('earth ponds lose water; the inlet sluice (L2) and aerators (L3) keep water up and clean', () => {
    const dry = simulateAquaculture(pond({ batches: [] }), 0, 60 * MIN).state;
    expect(dry.waterLevel).toBeLessThan(0.5);
    const l2 = simulateAquaculture(pond({ level: 2, batches: [] }), 0, 60 * MIN).state;
    expect(l2.waterLevel).toBe(1);
    const l3 = simulateAquaculture(pond({ level: 3, batches: [] }), 0, 60 * MIN).state;
    expect(l3.quality).toBeGreaterThan(l2.quality);
  });

  it('filling after digging raises the water level to full', () => {
    const res = simulateAquaculture(pond({ waterLevel: 0, fill: { startedAtMs: 0, finishesAtMs: 30_000 }, batches: [] }), 0, 15_000);
    expect(res.state.waterLevel).toBeGreaterThan(0.4);
    expect(res.state.waterLevel).toBeLessThan(0.6);
    const done = simulateAquaculture(res.state, 15_000, 31_000);
    expect(done.state.waterLevel).toBeGreaterThan(0.99);
    expect(done.state.fill).toBeNull();
  });

  it('hatcheries raise fry to fingerlings fast and yield fry, not kg', () => {
    const res = simulateAquaculture(pond({ type: 'hatchery', batches: [batch({ species: 'carp', alive: 300, weight: 0.03 })] }), 0, 3 * MIN);
    const b = res.state.batches[0];
    expect(fishStage('hatchery', b)).toBe('harvestable');
    expect(harvestYield('hatchery', 1, 0.8, b)).toBe(Math.floor(b.alive));
  });

  it('records water quality samples and stays deterministic', () => {
    const a = simulateAquaculture(pond(), 0, 30 * MIN);
    const b = simulateAquaculture(pond(), 0, 30 * MIN);
    expect(a.records.length).toBeGreaterThan(5);
    expect(a.state).toEqual(b.state);
  });

  it('bank width constant is sane', () => {
    expect(POND_BANK_WIDTH).toBeGreaterThan(2);
    expect(POND_BANK_WIDTH).toBeLessThan(5);
  });
});
