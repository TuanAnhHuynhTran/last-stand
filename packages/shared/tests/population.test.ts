import { describe, expect, it } from 'vitest';
import {
  PROFESSION_CODES,
  PROFESSION_DEFINITIONS,
  activityAt,
  gameClock,
  houseCapacity,
  isWorkHour,
  moodOf,
  phaseAt,
  recipesFor,
  survivorIdentity,
  workerEfficiency,
  workplaceProfession,
  workplaceSlots,
} from '../src/population/definitions.js';
import { foodStock, simulateEconomy, supplyDays, type EconState, type EconSurvivor } from '../src/population/simulation.js';

const DAY = 720;

function villager(id: string, over: Partial<EconSurvivor> = {}): EconSurvivor {
  return { id, profession: 'carpenter', employed: true, homeId: 'h1', health: 1, stamina: 1, satisfaction: 0.7, skills: { carpenter: 0.5 }, ...over };
}

function econ(over: Partial<EconState> = {}): EconState {
  return {
    daySeconds: DAY,
    seed: 42,
    stock: { wood: 100, vegetables: 200, water: 200 },
    storageCap: 3000,
    survivors: [villager('a'), villager('b')],
    producers: [{ id: 'carp', level: 1, recipe: 'logging', progress: 0, buffer: {}, workerIds: ['a', 'b'], status: 'idle', batches: 0 }],
    housingCapacity: 4,
    transporters: 1,
    naturalGrowth: false,
    rescue: null,
    ...over,
  };
}

describe('Villager catalogue', () => {
  it('eight professions, each with an outfit, a tool and work animations', () => {
    expect(PROFESSION_CODES).toHaveLength(8);
    for (const p of PROFESSION_DEFINITIONS) {
      expect(p.workClips.length).toBeGreaterThan(0);
      expect(p.outfit.shirt).toMatch(/^#/);
    }
    expect(new Set(PROFESSION_DEFINITIONS.map((p) => p.outfit.hat)).size).toBeGreaterThanOrEqual(6);
  });

  it('house capacity by level is 4 / 6 / 10', () => {
    expect([1, 2, 3].map(houseCapacity)).toEqual([4, 6, 10]);
  });

  it('workplaces employ the right profession with level-dependent slots', () => {
    expect(workplaceProfession('farm_zone', 'rice_paddy')).toBe('farmer');
    expect(workplaceProfession('livestock_farm', 'pig_farm')).toBe('herder');
    expect(workplaceProfession('water_body', 'fish_pond')).toBe('fisher');
    expect(workplaceProfession('building', 'carpentry')).toBe('carpenter');
    expect(workplaceProfession('building', 'quarry')).toBe('mason');
    expect(workplaceProfession('building', 'smithy')).toBe('blacksmith');
    expect(workplaceProfession('building', 'market')).toBe('transporter');
    expect(workplaceProfession('building', 'storage')).toBe('warehouse');
    expect(workplaceProfession('building', 'house')).toBeNull();
    expect(workplaceSlots('building', 'carpentry', 3)).toBeGreaterThan(workplaceSlots('building', 'carpentry', 1));
    expect(recipesFor('quarry', 1).map((r) => r.code)).toEqual(['quarrying']);
    expect(recipesFor('quarry', 2).map((r) => r.code)).toContain('bricks');
  });

  it('identity is deterministic and varied', () => {
    expect(survivorIdentity(7)).toEqual(survivorIdentity(7));
    const looks = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(survivorIdentity(i).appearance)));
    expect(looks.size).toBeGreaterThan(20);
  });

  it('clock and schedule: work in the day, sleep at night', () => {
    const c = gameClock(0, DAY, (DAY / 24) * 5 * 1000); // epoch starts at 07:00
    expect(Math.round(c.hour)).toBe(12);
    expect(phaseAt(3)).toBe('night');
    expect(phaseAt(9)).toBe('work');
    expect(activityAt(23, true, 'farmer', false)).toBe('sleep');
    expect(activityAt(7.5, true, 'farmer', false)).toBe('commute');
    expect(activityAt(10, true, 'farmer', false)).toBe('work');
    expect(activityAt(17, true, 'transporter', false)).toBe('haul');
    expect(activityAt(19, true, 'farmer', false)).toBe('leisure');
    expect(isWorkHour(17, 'transporter')).toBe(true);
    expect(isWorkHour(17, 'farmer')).toBe(false);
    expect(moodOf({ satisfaction: 0.9, stamina: 1, health: 1 })).toBe('happy');
    expect(moodOf({ satisfaction: 0.9, stamina: 0.1, health: 1 })).toBe('tired');
    expect(moodOf({ satisfaction: 0.2, stamina: 1, health: 1 })).toBe('sad');
    expect(workerEfficiency(1, 1, 1)).toBeGreaterThan(workerEfficiency(0.1, 1, 1));
  });
});

describe('Economy simulation', () => {
  it('produces only during work hours with workers, moving goods into storage', () => {
    const night = simulateEconomy(econ(), 22, 22 + 7); // 22:00 → 05:00
    expect(night.state.stock.wood).toBe(100);
    const day = simulateEconomy(econ(), 8, 12);
    expect(day.state.stock.wood).toBeGreaterThan(100);
    expect(day.transactions.production.wood).toBeGreaterThan(0);
    const none = simulateEconomy(econ({ producers: [{ id: 'c', level: 1, recipe: 'logging', progress: 0, buffer: {}, workerIds: [], status: 'idle', batches: 0 }] }), 8, 12);
    expect(none.state.producers[0].status).toBe('no_workers');
    expect(none.state.stock.wood).toBe(100);
  });

  it('a recipe consumes its inputs; without inputs the building is blocked', () => {
    const planks = econ({ producers: [{ id: 'c', level: 2, recipe: 'planks', progress: 0, buffer: {}, workerIds: ['a', 'b'], status: 'idle', batches: 0 }] });
    const ok = simulateEconomy(planks, 8, 12);
    expect(ok.state.stock.planks).toBeGreaterThan(0);
    expect(ok.state.stock.wood).toBeLessThan(100);
    expect(ok.transactions.production_input.wood).toBeLessThan(0);
    const empty = simulateEconomy({ ...planks, stock: { ...planks.stock, wood: 0 } }, 8, 12);
    expect(empty.state.producers[0].status).toBe('missing_input');
    expect(empty.state.stock.planks ?? 0).toBe(0);
  });

  it('level-1 buildings need transporters; full storage keeps goods in the buffer', () => {
    const noHaul = simulateEconomy(econ({ transporters: 0 }), 8, 12);
    expect(noHaul.state.stock.wood).toBe(100);
    expect(noHaul.state.producers[0].buffer.wood).toBeGreaterThan(0);
    const full = simulateEconomy(econ({ storageCap: 100 }), 8, 12);
    expect(full.state.stock.wood).toBe(100);
    // Buffer fills up and the building stops.
    const long = simulateEconomy(econ({ storageCap: 100 }), 8, 8 + 24 * 3);
    expect(long.state.producers[0].status).toBe('buffer_full');
  });

  it('villagers eat and drink; shortages lower health and satisfaction', () => {
    const fed = simulateEconomy(econ(), 0, 48);
    const hungry = simulateEconomy(econ({ stock: { wood: 100, water: 0 } }), 0, 48);
    expect(fed.transactions.consumption.vegetables).toBeLessThan(0);
    expect(hungry.foodRatio).toBe(0);
    expect(hungry.state.survivors[0].health).toBeLessThan(fed.state.survivors[0].health);
    expect(hungry.state.survivors[0].satisfaction).toBeLessThan(fed.state.survivors[0].satisfaction);
    expect(foodStock({ vegetables: 10, meat: 2 })).toBe(14);
    expect(supplyDays({ vegetables: 30, water: 8 }, 2)).toEqual({ food: 10, water: 2 });
  });

  it('migrants need free housing and food; rescues return on time', () => {
    const roomy = simulateEconomy(econ({ housingCapacity: 10 }), 0, 24 * 6);
    expect(roomy.arrivals.filter((a) => a.reason !== 'rescue').length).toBeGreaterThan(0);
    const full = simulateEconomy(econ({ housingCapacity: 2 }), 0, 24 * 6);
    expect(full.arrivals).toHaveLength(0);
    const starving = simulateEconomy(econ({ housingCapacity: 10, stock: { water: 500 } }), 0, 24 * 6);
    expect(starving.arrivals).toHaveLength(0);
    const rescue = simulateEconomy(econ({ housingCapacity: 2, rescue: { arrivesAtHour: 20, count: 2 } }), 0, 30);
    expect(rescue.arrivals.filter((a) => a.reason === 'rescue')).toHaveLength(2);
    expect(rescue.state.rescue).toBeNull();
  });

  it('stamina drains at work and recovers at night; long offline spans are bounded', () => {
    const work = simulateEconomy(econ(), 8, 16);
    expect(work.state.survivors[0].stamina).toBeLessThan(1);
    const sleep = simulateEconomy(work.state, 21, 30);
    expect(sleep.state.survivors[0].stamina).toBeGreaterThan(work.state.survivors[0].stamina);
    const year = simulateEconomy(econ(), 0, 24 * 365);
    expect(year.hoursSimulated).toBe(24 * 7);
    expect(simulateEconomy(econ(), 0, 50).state).toEqual(simulateEconomy(econ(), 0, 50).state);
  });
});
