import { describe, expect, it } from 'vitest';
import { getConnectedHexes, hexDistance, hexKey, hexNeighbors, type AxialCoord } from '../src/hex/hexMath.js';
import { WorldGenerator } from '../src/worldgen/WorldGenerator.js';
import { checkPlacement } from '../src/buildings/footprint.js';
import {
  CROP_TYPE_DEFINITIONS,
  FARM_ZONE_DEFINITIONS,
  MIN_FARM_ZONE_HEXES,
  getCropDefinition,
  getFarmZoneDefinition,
} from '../src/farming/definitions.js';
import {
  checkFarmZoneShape,
  computeCropOutcome,
  cropProgress,
  cropStageAt,
  evaluateIrrigation,
  farmCreateCost,
  farmExpandCost,
  farmOccupant,
  farmUpgradeCost,
} from '../src/farming/zone.js';

const world = new WorldGenerator('CV-COA-AABBCC112233');
const spawn = { q: world.spawn.q, r: world.spawn.r };
const farmable = (h: AxialCoord) => world.isOwned(h.q, h.r) && world.getHexTile(h.q, h.r).buildable;

/** n connected farmable hexes grown from spawn. */
function region(n: number, start: AxialCoord = spawn): AxialCoord[] {
  return getConnectedHexes(start, farmable, n);
}

describe('Farm catalogue', () => {
  it('has the 5 zone types, each with 3 levels and at least one crop', () => {
    expect(FARM_ZONE_DEFINITIONS.map((d) => d.code).sort()).toEqual(
      ['corn_field', 'orchard', 'pasture', 'rice_paddy', 'vegetable_garden'].sort()
    );
    for (const def of FARM_ZONE_DEFINITIONS) {
      expect(def.levels.map((l) => l.level)).toEqual([1, 2, 3]);
      expect(def.crops.length).toBeGreaterThan(0);
      for (const c of def.crops) expect(getCropDefinition(c).zoneType).toBe(def.code);
      // Each level is strictly better.
      for (let i = 1; i < 3; i += 1) {
        expect(def.levels[i].yieldMultiplier).toBeGreaterThan(def.levels[i - 1].yieldMultiplier);
        expect(def.levels[i].growthSpeed).toBeGreaterThan(def.levels[i - 1].growthSpeed);
        expect(def.levels[i].irrigationBonus).toBeGreaterThan(def.levels[i - 1].irrigationBonus);
      }
    }
  });

  it('every crop has growth stages, yield, duration and water need; rice has the 4 required stages', () => {
    for (const crop of CROP_TYPE_DEFINITIONS) {
      expect(crop.stages.length).toBeGreaterThanOrEqual(4);
      expect(crop.yieldPerHex).toBeGreaterThan(0);
      expect(crop.growSeconds).toBeGreaterThan(0);
      expect(crop.waterNeed).toBeGreaterThan(0);
      expect(crop.stages[crop.stages.length - 1].startsAt).toBe(1);
    }
    const rice = getCropDefinition('rice');
    expect(rice.stages.map((s) => s.key)).toEqual(['seeded', 'seedling', 'growing', 'ripe']);
    expect([0, 0.3, 0.7, 0.999, 1].map((p) => cropStageAt(rice, p).key)).toEqual([
      'seeded',
      'seedling',
      'growing',
      'growing',
      'ripe',
    ]);
    expect(cropProgress(1000, 3000, 2000)).toBe(0.5);
    expect(cropProgress(1000, 3000, 9000)).toBe(1);
  });
});

describe('Farm zone shape', () => {
  const none = new Map<string, string>();

  it('rejects zones under 6 hexes and accepts 6 connected owned hexes', () => {
    const five = checkFarmZoneShape(world, region(5), none);
    expect(five.valid).toBe(false);
    expect(five.issues).toContain('TOO_SMALL');
    const six = checkFarmZoneShape(world, region(MIN_FARM_ZONE_HEXES), none);
    expect(six.valid).toBe(true);
    expect(six.totalHexes).toBe(6);
  });

  it('rejects disconnected regions', () => {
    const a = region(3);
    const keys = new Set(a.map((h) => hexKey(h.q, h.r)));
    // Another 3-hex cluster at least 3 hexes away.
    const far = world.getStarterTerritory().find((h) => a.every((x) => hexDistance(x, h) >= 3) && farmable(h))!;
    const b = getConnectedHexes(far, (h) => farmable(h) && !keys.has(hexKey(h.q, h.r)) && a.every((x) => hexDistance(x, h) >= 2), 3);
    const check = checkFarmZoneShape(world, [...a, ...b], none);
    expect(check.valid).toBe(false);
    expect(check.issues).toContain('DISCONNECTED');
  });

  it('rejects hexes outside the territory, under buildings or in another zone', () => {
    const hexes = region(7);
    const outside = world.getStarterTerritory().flatMap((h) => hexNeighbors(h)).find((n) => !world.isOwned(n.q, n.r))!;
    expect(checkFarmZoneShape(world, [...hexes.slice(0, 6), outside], none).issues).toContain('NOT_OWNED');

    const occupied = new Map([[hexKey(hexes[2].q, hexes[2].r), 'building-1']]);
    const c1 = checkFarmZoneShape(world, hexes, occupied);
    expect(c1.issues).toContain('OCCUPIED');
    expect(c1.hexes[2].issue).toBe('OCCUPIED');

    const farmed = new Map([[hexKey(hexes[3].q, hexes[3].r), farmOccupant('zone-a')]]);
    expect(checkFarmZoneShape(world, hexes, farmed).issues).toContain('FARMLAND');
    // The zone itself does not block its own expansion.
    expect(checkFarmZoneShape(world, hexes, farmed, { zoneId: 'zone-a' }).issues).not.toContain('FARMLAND');
  });

  it('validates expansion: new hexes must keep the zone connected', () => {
    const base = region(6);
    const baseKeys = new Set(base.map((h) => hexKey(h.q, h.r)));
    const adjacent = base.flatMap((h) => hexNeighbors(h)).find((n) => farmable(n) && !baseKeys.has(hexKey(n.q, n.r)))!;
    const ok = checkFarmZoneShape(world, [adjacent], new Map(), { zoneId: 'z', baseHexes: base });
    expect(ok.valid).toBe(true);
    expect(ok.totalHexes).toBe(7);

    const far = world.getStarterTerritory().find((h) => farmable(h) && base.every((b) => hexDistance(b, h) >= 3))!;
    const bad = checkFarmZoneShape(world, [far], new Map(), { zoneId: 'z', baseHexes: base });
    expect(bad.issues).toContain('DISCONNECTED');
    const dup = checkFarmZoneShape(world, [base[0]], new Map(), { zoneId: 'z', baseHexes: base });
    expect(dup.issues).toContain('ALREADY_IN_ZONE');
  });

  it('buildings cannot be placed on farmland', () => {
    const occ = new Map([[hexKey(spawn.q, spawn.r), farmOccupant('z')]]);
    const check = checkPlacement(world, 'house', spawn, 0, occ);
    expect(check.valid).toBe(false);
    expect(check.issues).toEqual(['FARMLAND']);
  });
});

describe('Irrigation, yield and costs', () => {
  const hexes = region(8);

  it('irrigation improves with level and is deterministic', () => {
    const [l1, l2, l3] = [1, 2, 3].map((lvl) => evaluateIrrigation(world, 'rice_paddy', lvl, hexes));
    expect(l1.kind).toBe('none');
    expect(l2.kind).toBe('canal');
    expect(l3.kind).toBe('pump');
    expect(l2.supply).toBeGreaterThan(l1.supply);
    expect(l3.supply).toBeGreaterThan(l2.supply);
    expect(evaluateIrrigation(world, 'rice_paddy', 2, hexes)).toEqual(l2);
  });

  it('higher levels grow faster and yield more; thirsty crops suffer without irrigation', () => {
    const rice = getCropDefinition('rice');
    const out = [1, 2, 3].map((lvl) =>
      computeCropOutcome(rice, 'rice_paddy', lvl, hexes.length, evaluateIrrigation(world, 'rice_paddy', lvl, hexes))
    );
    expect(out[1].expectedYield).toBeGreaterThan(out[0].expectedYield);
    expect(out[2].expectedYield).toBeGreaterThan(out[1].expectedYield);
    expect(out[2].growSeconds).toBeLessThan(out[0].growSeconds);
    const dry = { supply: 0.3, fertility: 1 };
    const wet = { supply: 1, fertility: 1 };
    expect(computeCropOutcome(rice, 'rice_paddy', 1, 6, dry).expectedYield).toBeLessThan(
      computeCropOutcome(rice, 'rice_paddy', 1, 6, wet).expectedYield
    );
    // Pasture barely needs water.
    expect(computeCropOutcome(getCropDefinition('clover'), 'pasture', 1, 6, dry).waterFactor).toBe(1);
  });

  it('upgrade and expansion are priced separately', () => {
    const def = getFarmZoneDefinition('rice_paddy');
    expect(farmCreateCost('rice_paddy', 6).coins).toBe(def.levels[0].cost.coins + 6 * def.levels[0].costPerHex.coins);
    expect(farmUpgradeCost('rice_paddy', 1, 6)).toBeNull();
    expect(farmUpgradeCost('rice_paddy', 3, 6)!.coins).toBeGreaterThan(farmUpgradeCost('rice_paddy', 2, 6)!.coins);
    expect(farmExpandCost('rice_paddy', 3, 2).coins).toBeGreaterThan(farmExpandCost('rice_paddy', 1, 2).coins);
    expect(farmExpandCost('rice_paddy', 1, 0).coins).toBe(0);
  });
});
