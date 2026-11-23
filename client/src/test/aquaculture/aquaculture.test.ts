import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  FISH_SPECIES_CODES,
  WorldGenerator,
  axialToWorld,
  getConnectedHexes,
  hexKey,
  hexNeighbors,
  planPondLevels,
  regionBorder,
  type AxialCoord,
  type FishSpeciesCode,
  type WaterBodyDTO,
  type WaterBodyTypeCode,
} from '@cityverse/shared';
import { buildFishParts } from '../../game/aquaculture/fishModels';
import { FishSchool } from '../../game/aquaculture/FishSchool';
import { computePondLayout } from '../../game/aquaculture/pondLayout';
import { buildPondScenery } from '../../game/aquaculture/pondScenery';
import { MAX_FISH_PER_POND, PondRenderer, displayFish, effectiveSurface } from '../../game/aquaculture/PondRenderer';
import { buildTerrainChunk, buildWaterChunk } from '../../game/world/chunkBuilder';
import { QUALITY_PRESETS } from '../../game/world/qualitySettings';
import { WorldEngine } from '../../game/world/WorldEngine';

const SEED = 'CV-COA-AABBCC112233';
const T0 = Date.UTC(2026, 10, 22, 10, 0, 0);
const probe = new WorldGenerator(SEED);
const farmable = (h: AxialCoord) => probe.isOwned(h.q, h.r) && probe.getHexTile(h.q, h.r).buildable;
const hexes6 = getConnectedHexes({ q: probe.spawn.q, r: probe.spawn.r }, farmable, 6);
const hexes9 = (() => {
  const keys = new Set(hexes6.map((h) => hexKey(h.q, h.r)));
  const ring = hexes6.flatMap((h) => hexNeighbors(h)).filter((h) => farmable(h) && !keys.has(hexKey(h.q, h.r)));
  const add = ring.filter((h, i, a) => a.findIndex((x) => x.q === h.q && x.r === h.r) === i).slice(0, 3);
  return [...hexes6, ...add];
})();

function body(hexes: AxialCoord[], over: Partial<WaterBodyDTO> = {}, type: WaterBodyTypeCode = 'fish_pond'): WaterBodyDTO {
  const l = planPondLevels((x, z) => probe.terrain.baseHeightAt(x, z), hexes, type);
  return {
    id: '00000000-0000-4000-8000-00000000p0nd',
    buildingId: 'b',
    cityId: 'c',
    type,
    name: 'Ao',
    level: 1,
    status: 'active',
    upgradeStartedAt: null,
    upgradeFinishesAt: null,
    hexes,
    surfaceHeight: l.surface,
    bottomHeight: l.bottom,
    area: 300,
    volume: 400,
    shoreline: 60,
    waterLevel: 1,
    waterQuality: 0.8,
    feedStock: 50,
    feedCapacity: 120,
    feedQuality: 0,
    fillStartedAt: null,
    fillFinishesAt: null,
    readyAt: null,
    capacity: 180,
    fishCount: 0,
    density: 0,
    batches: [],
    cycle: null,
    records: [],
    simulatedAt: new Date(T0).toISOString(),
    totalHarvested: 0,
    invested: { coins: 0, wood: 0, stone: 0 },
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

const batch = (species: FishSpeciesCode, alive: number, weight: number) => ({
  id: `b-${species}`,
  species,
  stocked: alive,
  alive,
  weight,
  health: 1,
  satiety: 1,
  stage: 'growing' as const,
  stockedAt: '',
  status: 'growing' as const,
});

describe('Digging a pond in the world engine', () => {
  let engine: WorldEngine | null = null;
  afterEach(() => {
    engine?.dispose();
    engine = null;
  });

  it('lowers the real terrain mesh inside the pond and leaves no gap at the shore or between chunks', () => {
    const world = new WorldGenerator(SEED);
    engine = new WorldEngine(world, QUALITY_PRESETS.low);
    const c = axialToWorld(hexes6[2].q, hexes6[2].r);
    const before = engine.manager.sampleHeight(c.x, c.z);
    const pond = body(hexes6);
    engine.setWaterBodies([pond], 0);
    const after = engine.manager.sampleHeight(c.x, c.z);
    expect(after).toBeLessThan(before - 1);
    expect(after).toBeLessThan(pond.surfaceHeight);
    // Dug hexes now classify as water; vegetation and buildings are blocked there.
    expect(world.getHexTile(hexes6[2].q, hexes6[2].r).isWater).toBe(true);
    expect(engine.occupancy().get(hexKey(hexes6[2].q, hexes6[2].r))).toMatch(/^pond:/);

    // Shore: on the border the edited surface equals the seed terrain (continuous).
    for (const s of regionBorder(hexes6)) {
      const x = (s.ax + s.bx) / 2;
      const z = (s.az + s.bz) / 2;
      expect(Math.abs(world.terrain.heightAt(x, z) - world.terrain.baseHeightAt(x, z))).toBeLessThan(1e-6);
    }
    // Chunk seams through the pond still match vertex for vertex.
    const cx = Math.floor((c.x + 500) / 100);
    const cz = Math.floor((c.z + 500) / 100);
    const a = buildTerrainChunk(world, cx, cz, 2.5, 0);
    const right = buildTerrainChunk(world, cx + 1, cz, 2.5, 0);
    const n = a.segments;
    for (let j = 0; j <= n; j += 1) expect(a.heights[j * (n + 1) + n]).toBeCloseTo(right.heights[j * (n + 1)], 5);
    // Natural (sea-level) water never shows inside the dug pond.
    const w = buildWaterChunk(a, world);
    if (w) {
      for (let k = 0; k < w.indices.length; k += 3) {
        const [i0, i1, i2] = [w.indices[k], w.indices[k + 1], w.indices[k + 2]];
        const x = (w.positions[i0 * 3] + w.positions[i1 * 3] + w.positions[i2 * 3]) / 3;
        const z = (w.positions[i0 * 3 + 2] + w.positions[i1 * 3 + 2] + w.positions[i2 * 3 + 2]) / 3;
        expect(world.isDugWaterAt(x, z)).toBe(false);
      }
    }
  });

  it('expanding merges the water: the old shoreline becomes pond bed; removing restores the land', () => {
    const world = new WorldGenerator(SEED);
    engine = new WorldEngine(world, QUALITY_PRESETS.low);
    engine.setWaterBodies([body(hexes6)], 0);
    const added = hexes9.slice(6);
    const shared = regionBorder(hexes6).find((s) => {
      const mx = (s.ax + s.bx) / 2;
      const mz = (s.az + s.bz) / 2;
      return added.some((h) => {
        const c = axialToWorld(h.q, h.r);
        return Math.hypot(c.x - mx, c.z - mz) < 6;
      });
    })!;
    const mx = (shared.ax + shared.bx) / 2;
    const mz = (shared.az + shared.bz) / 2;
    const rim = engine.manager.sampleHeight(mx, mz);
    const big = body(hexes9);
    engine.setWaterBodies([big], 0);
    expect(engine.manager.sampleHeight(mx, mz)).toBeLessThan(rim - 0.8);
    expect(engine.ponds.getEntry(big.id)!.layout.frame.sorted).toHaveLength(9);
    // Filling the pond in brings the seed terrain back.
    engine.setWaterBodies([], 0);
    expect(Math.abs(engine.manager.sampleHeight(mx, mz) - world.terrain.baseHeightAt(mx, mz))).toBeLessThan(0.05);
    expect(world.getHexTile(hexes6[2].q, hexes6[2].r).isWater).toBe(false);
  });

  it('dig tool: ≥ 6 free owned hexes, never on a house; cages need natural water; expansions are checked against the pond', () => {
    const world = new WorldGenerator(SEED);
    engine = new WorldEngine(world, QUALITY_PRESETS.low);
    let last: { valid: boolean; issues: string[] } | null = null;
    engine.attach(document.createElement('div'), new THREE.PerspectiveCamera(), {
      onHover: () => {},
      onSelect: () => {},
      onFocus: () => {},
      isBuildMode: () => true,
      onStats: () => {},
      onPlacementCheck: () => {},
      onPlaceAt: () => {},
      onSelectBuilding: () => {},
      onFarmDraftCheck: () => {},
      onPaintDraft: () => {},
      onSelectFarm: () => {},
      onRanchDraftCheck: () => {},
      onSelectRanch: () => {},
      onPondDraftCheck: (c) => {
        last = c;
      },
    });
    engine.setPondDraft({ type: 'fish_pond', hexes: hexes6.slice(0, 5) });
    expect(last!.issues).toContain('TOO_SMALL');
    engine.setPondDraft({ type: 'fish_pond', hexes: hexes6 });
    expect(last!.valid).toBe(true);
    engine.setBuildings(
      [
        {
          id: 'house-1',
          cityId: 'c',
          typeCode: 'house',
          level: 1,
          status: 'active',
          anchorQ: hexes6[1].q,
          anchorR: hexes6[1].r,
          rotation: 0,
          footprint: [hexes6[1]],
          activeJob: null,
          createdAt: '',
          updatedAt: '',
        },
      ],
      0
    );
    engine.setPondDraft({ type: 'fish_pond', hexes: hexes6 });
    expect(last!.issues).toContain('OCCUPIED');
    engine.setPondDraft({ type: 'fish_cage', hexes: hexes6 });
    expect(last!.issues).toContain('NOT_WATER');
    engine.setBuildings([], 0);
    engine.setWaterBodies([body(hexes6)], 0);
    engine.setPondDraft({ type: 'fish_pond', hexes: hexes9.slice(6), expandId: body(hexes6).id });
    expect(last!.valid).toBe(true);
    engine.setPondDraft(null);
    expect(last).toBeNull();
  });
});

describe('Fish', () => {
  it('chibi fish: every species has a body and a separate tail', () => {
    for (const s of FISH_SPECIES_CODES) {
      const p = buildFishParts(s);
      expect(p.body.getAttribute('position').count).toBeGreaterThan(50);
      expect(p.tail.getAttribute('position').count).toBeGreaterThan(10);
      expect(p.rig.tailZ).toBeLessThan(0);
    }
  });

  function pondWorld(hexes: AxialCoord[]) {
    const world = new WorldGenerator(SEED);
    const r = new PondRenderer();
    const b = body(hexes);
    r.edits.setPonds(PondRenderer.specs([b]));
    world.setTerrainEdits(r.edits);
    const ground = (x: number, z: number) => world.terrain.heightAt(x, z);
    const layout = computePondLayout(
      { id: b.id, type: b.type, level: b.level, hexes: b.hexes, surface: b.surfaceHeight, bottom: b.bottomHeight },
      ground,
      (x, z) => r.edits.pondAt(x, z)?.id === b.id
    );
    return { world, r, b, layout, ground };
  }

  it('never leave the water or cross the bank — even while feeding and after the water drops', () => {
    const { layout, ground, r } = pondWorld(hexes9);
    const school = new FishSchool(layout, (s) => buildFishParts(s).rig, 'seed', ground);
    school.sync(Array.from({ length: 24 }, (_, i) => ({ id: `f${i}`, species: FISH_SPECIES_CODES[i % 4], scale: 0.5 + (i % 5) * 0.1 })));
    for (let t = 0; t < 3000; t += 1) {
      if (t === 800) school.feed();
      if (t === 1600) {
        // Water level drops (not full): the swimmable area shrinks.
        const y = layout.surface - 0.6;
        layout.setSurface(y);
        school.surfaceY = y;
      }
      school.update(1 / 30);
      if (t % 10 === 0) {
        for (const p of school.positions()) {
          // After the drop the stranded ones get a few seconds to reach open water.
          if (t < 1600 || t > 1900) expect(layout.swimmable(p.x, p.z)).toBe(true);
          expect(r.edits.pondAt(p.x, p.z)).not.toBeNull();
        }
      }
    }
    // Poses stay under the surface and above the bed.
    school.forEachPose((_id, _s, pose) => {
      expect(pose.y).toBeLessThan(layout.surface);
      expect(pose.y).toBeGreaterThan(ground(pose.x, pose.z) - 0.05);
    });
    r.dispose();
  });

  it('gather at the feeder when fed', () => {
    const { layout, ground, r } = pondWorld(hexes9);
    const school = new FishSchool(layout, (s) => buildFishParts(s).rig, 'seed', ground);
    school.sync(Array.from({ length: 12 }, (_, i) => ({ id: `f${i}`, species: 'tilapia' as const, scale: 0.8 })));
    for (let t = 0; t < 300; t += 1) school.update(1 / 30);
    const mean = () => {
      const ps = school.positions();
      return ps.reduce((s, p) => s + Math.hypot(p.x - layout.feeder.x, p.z - layout.feeder.z), 0) / ps.length;
    };
    const before = mean();
    school.feed(8);
    for (let t = 0; t < 150; t += 1) school.update(1 / 30);
    expect(mean()).toBeLessThan(before * 0.8);
    r.dispose();
  });

  it('cage fish stay inside their nets', () => {
    const world = new WorldGenerator(SEED);
    const water: AxialCoord[] = [];
    for (let q = world.spawn.q - 30; q <= world.spawn.q + 30 && water.length < 1; q += 1) {
      for (let r = world.spawn.r - 30; r <= world.spawn.r + 30; r += 1) if (world.getHexTile(q, r).isWater) water.push({ q, r });
    }
    if (!water.length) return;
    const set = new Set<string>();
    for (let q = water[0].q - 6; q <= water[0].q + 6; q += 1) for (let r = water[0].r - 6; r <= water[0].r + 6; r += 1) if (world.getHexTile(q, r).isWater) set.add(hexKey(q, r));
    const cage = getConnectedHexes(water[0], (h) => set.has(hexKey(h.q, h.r)), 6);
    const b = body(cage, {}, 'fish_cage');
    const layout = computePondLayout({ id: b.id, type: 'fish_cage', level: 1, hexes: cage, surface: 0, bottom: -3 }, (x, z) => world.terrain.heightAt(x, z), () => true);
    const school = new FishSchool(layout, (s) => buildFishParts(s).rig, 'cage', (x, z) => world.terrain.heightAt(x, z));
    school.sync(Array.from({ length: 16 }, (_, i) => ({ id: `c${i}`, species: 'carp' as const, scale: 0.7 })));
    for (let t = 0; t < 1500; t += 1) {
      school.update(1 / 30);
      if (t % 15 === 0) for (const p of school.positions()) expect(layout.swimmable(p.x, p.z)).toBe(true);
    }
  });

  it('displays at most MAX_FISH_PER_POND fish, bigger as they grow', () => {
    const shown = displayFish(body(hexes6, { batches: [batch('carp', 300, 0.1), batch('catfish', 100, 1.0)] }));
    expect(shown.length).toBeLessThanOrEqual(MAX_FISH_PER_POND);
    const carp = shown.find((f) => f.species === 'carp')!;
    const cat = shown.find((f) => f.species === 'catfish')!;
    expect(cat.scale).toBeGreaterThan(carp.scale);
    expect(shown.filter((f) => f.species === 'carp').length).toBeGreaterThan(shown.filter((f) => f.species === 'catfish').length);
  });
});

describe('Pond scenery and water level', () => {
  it('each level adds detail; upgrades keep the designed shape', () => {
    const world = new WorldGenerator(SEED);
    const r = new PondRenderer();
    const b = body(hexes9);
    r.edits.setPonds(PondRenderer.specs([b]));
    world.setTerrainEdits(r.edits);
    const ground = (x: number, z: number) => world.terrain.heightAt(x, z);
    const counts = [1, 2, 3].map((level) => {
      const layout = computePondLayout({ id: b.id, type: b.type, level, hexes: b.hexes, surface: b.surfaceHeight, bottom: b.bottomHeight }, ground, (x, z) => r.edits.pondAt(x, z) !== null);
      const s = buildPondScenery(layout, ground);
      return { verts: s.solid.getAttribute('position').count, hexes: layout.frame.sorted.map((h) => hexKey(h.q, h.r)).join(';'), swim: layout.swimPoints.length, wheels: s.wheels.length };
    });
    expect(counts[1].verts).toBeGreaterThan(counts[0].verts);
    expect(counts[2].verts).toBeGreaterThan(counts[1].verts);
    expect(counts[2].wheels).toBeGreaterThan(0); // aerators at level 3
    expect(new Set(counts.map((c) => c.hexes)).size).toBe(1);
    expect(new Set(counts.map((c) => c.swim)).size).toBe(1);
    r.dispose();
  });

  it('the water surface rises while filling and sits lower when the pond is not full', () => {
    const b = body(hexes6, { waterLevel: 0, fillStartedAt: new Date(T0).toISOString(), fillFinishesAt: new Date(T0 + 20_000).toISOString() });
    expect(effectiveSurface(b, T0)).toBeCloseTo(b.bottomHeight, 5);
    expect(effectiveSurface(b, T0 + 10_000)).toBeCloseTo((b.bottomHeight + b.surfaceHeight) / 2, 3);
    expect(effectiveSurface(b, T0 + 30_000)).toBeCloseTo(b.surfaceHeight, 5);
    expect(effectiveSurface(body(hexes6, { waterLevel: 0.5 }), T0)).toBeLessThan(b.surfaceHeight);
  });

  it('renderer: water mesh per dug pond, fish culled off-screen', () => {
    const world = new WorldGenerator(SEED);
    const r = new PondRenderer();
    const b = body(hexes6, { batches: [batch('tilapia', 40, 0.5)], fishCount: 40 });
    r.edits.setPonds(PondRenderer.specs([b]));
    world.setTerrainEdits(r.edits);
    const height = (x: number, z: number) => world.terrain.heightAt(x, z);
    r.sync([b], height);
    const entry = r.getEntry(b.id)!;
    expect(entry.root.children.some((o) => o.name.startsWith('PondWater:'))).toBe(true);
    const c = entry.layout.frame.centroid;
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 2000);
    cam.position.set(c.x + 25, entry.layout.surface + 30, c.z + 25);
    cam.lookAt(c.x, entry.layout.surface, c.z);
    r.update(0.016, 1, cam, new THREE.Vector3(0.5, 0.8, 0.3), T0);
    expect(r.stats.fishDrawn).toBeGreaterThan(0);
    expect(r.stats.fishDrawn).toBeLessThanOrEqual(MAX_FISH_PER_POND);
    cam.lookAt(c.x, entry.layout.surface, c.z + 2000);
    cam.position.set(c.x, entry.layout.surface + 30, c.z + 80);
    cam.lookAt(c.x, entry.layout.surface, c.z + 400);
    r.update(0.016, 1.1, cam, new THREE.Vector3(0.5, 0.8, 0.3), T0);
    expect(r.stats.fishDrawn).toBe(0);
    expect(r.stats.culled).toBeGreaterThan(0);
    r.dispose();
  });
});
