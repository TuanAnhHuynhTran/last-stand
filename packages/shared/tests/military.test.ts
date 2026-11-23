import { describe, expect, it } from 'vitest';
import { getBuildingDefinition } from '../src/buildings/definitions.js';
import { getRecipe } from '../src/population/definitions.js';
import {
  EQUIPMENT_DEFINITIONS,
  MILITARY_BUILDING_TYPES,
  RANKS,
  UNIT_TYPE_CODES,
  UNIT_TYPE_DEFINITIONS,
  canEquip,
  combatPower,
  getUnitType,
  missingEquipment,
  rankForXp,
  trainingSeconds,
  trainingSlots,
  unitForBuilding,
  unitStats,
} from '../src/military/definitions.js';

describe('Military catalogue', () => {
  it('seven military buildings: ≥ 6 hexes each, the training ground ≥ 9, three levels', () => {
    for (const code of MILITARY_BUILDING_TYPES) {
      const def = getBuildingDefinition(code);
      expect(def.footprint.length, code).toBeGreaterThanOrEqual(code === 'training_ground' ? 9 : 6);
      expect(def.levels.map((l) => l.level)).toEqual([1, 2, 3]);
      expect(def.category).toBe('military');
    }
  });

  it('barracks train 2 / 4 / 6 soldiers per batch; levels do not grow the footprint', () => {
    for (const b of ['sword_barracks', 'spear_barracks', 'archery_range', 'crossbow_range'] as const) {
      expect([1, 2, 3].map((l) => trainingSlots(b, l))).toEqual([2, 4, 6]);
      expect(unitForBuilding(b)).not.toBeNull();
    }
    expect(trainingSlots('training_ground', 3)).toBeGreaterThan(6);
    expect(trainingSeconds('archer', 3)).toBeLessThan(trainingSeconds('archer', 1));
  });

  it('the four classes really differ', () => {
    const s = Object.fromEntries(UNIT_TYPE_CODES.map((c) => [c, getUnitType(c).base]));
    // Swordsmen are the toughest and block; spears out-reach swords and stop charges.
    expect(s.swordsman.hp).toBeGreaterThan(s.spearman.hp);
    expect(s.swordsman.block).toBeGreaterThan(s.spearman.block);
    expect(s.spearman.range).toBeGreaterThan(s.swordsman.range);
    expect(s.spearman.antiCharge).toBeGreaterThan(Math.max(s.swordsman.antiCharge, s.archer.antiCharge, s.crossbowman.antiCharge));
    // Ranged: archers are faster and fire more often, crossbows pierce armour but reload slowly.
    expect(s.archer.range).toBeGreaterThan(10);
    expect(s.crossbowman.range).toBeGreaterThan(10);
    expect(s.archer.reload).toBeLessThan(s.crossbowman.reload);
    expect(s.archer.speed).toBeGreaterThan(s.crossbowman.speed);
    expect(s.crossbowman.armorPierce).toBeGreaterThan(s.archer.armorPierce * 2);
    expect(s.archer.defense).toBeLessThan(s.crossbowman.defense);
    expect(new Set(UNIT_TYPE_DEFINITIONS.map((u) => JSON.stringify(u.base))).size).toBe(4);
    expect(new Set(UNIT_TYPE_DEFINITIONS.map((u) => u.drills.join())).size).toBe(4);
  });

  it('recruits need real equipment that the military forge makes from materials', () => {
    for (const u of UNIT_TYPE_DEFINITIONS) {
      expect(Object.keys(u.required).length).toBeGreaterThan(0);
      expect(u.food).toBeGreaterThan(0);
      for (const [slot, code] of Object.entries(u.required)) {
        expect(canEquip(u.code, slot as never, code!)).toBe(true);
      }
    }
    for (const r of ['forge_saber', 'forge_shield', 'forge_spear', 'craft_bow', 'craft_arrows', 'craft_crossbow', 'craft_bolts', 'leather_armor']) {
      expect(getRecipe(r)?.building).toBe('military_forge');
    }
    expect(missingEquipment('archer', { weapon: 'eq_bow' })).toEqual(['ammo']);
    expect(canEquip('archer', 'armor', 'eq_iron_armor')).toBe(false);
    expect(EQUIPMENT_DEFINITIONS.every((e) => e.units.length > 0)).toBe(true);
  });

  it('five ranks: xp thresholds and growing stats', () => {
    expect(RANKS.map((r) => r.name)).toEqual(['Tân binh', 'Binh sĩ', 'Tinh binh', 'Cận vệ', 'Tinh nhuệ']);
    expect(rankForXp(0)).toBe(1);
    expect(rankForXp(260)).toBe(3);
    expect(rankForXp(5000)).toBe(5);
    const r1 = combatPower(unitStats('spearman', 1, ['eq_spear', 'eq_leather_armor']));
    const r5 = combatPower(unitStats('spearman', 5, ['eq_spear', 'eq_leather_armor']));
    const bare = combatPower(unitStats('spearman', 1, []));
    expect(r5).toBeGreaterThan(r1);
    expect(r1).toBeGreaterThan(bare);
    expect(new Set(RANKS.map((r) => r.accessory)).size).toBe(5);
  });
});
