/**
 * Economy & villager simulation per GAME HOUR (pure, deterministic). The server runs it from the
 * last settled time to now; there is no 3D AI and no position here.
 *
 * Each hour:
 *  1. production buildings with workers advance their recipe during work hours
 *     (Σ worker efficiency); a batch needs its inputs from storage and room in the building's
 *     output buffer, otherwise the building is blocked (missing input / buffer full)
 *  2. goods move from buffers to storage: level 2+ buildings by themselves, level 1 buildings by
 *     transporters (limited per hour); storage capacity caps every resource
 *  3. villagers eat and drink; shortages lower health and satisfaction
 *  4. stamina drains at work and recovers in bed; skills grow with practice
 *  5. at 07:00 every day: migrants may arrive (free housing + food + content village),
 *     population events, natural growth (if enabled), rescue missions returning
 */
import {
  BASE_WATER_PER_DAY,
  FOOD_PER_DAY,
  FOOD_VALUES,
  TRANSPORT_PER_HOUR,
  WATER_PER_DAY,
  autoTransfers,
  getRecipe,
  isWorkHour,
  outputBufferCapacity,
  phaseAt,
  workerEfficiency,
  type ProfessionCode,
} from './definitions.js';

/** Long offline spans: production / needs are simulated for at most this many game hours. */
export const MAX_SIMULATED_HOURS = 24 * 7;

export interface EconSurvivor {
  id: string;
  profession: ProfessionCode | null;
  employed: boolean;
  homeId: string | null;
  health: number;
  stamina: number;
  satisfaction: number;
  skills: Partial<Record<ProfessionCode, number>>;
}

export type ProducerStatus = 'running' | 'no_workers' | 'no_recipe' | 'missing_input' | 'buffer_full' | 'idle';

export interface EconProducer {
  id: string;
  level: number;
  recipe: string | null;
  /** Fraction of the current batch */
  progress: number;
  /** Finished goods waiting for transport */
  buffer: Record<string, number>;
  workerIds: string[];
  status: ProducerStatus;
  /** Batches completed in this span */
  batches: number;
}

export interface EconState {
  daySeconds: number;
  seed: number;
  stock: Record<string, number>;
  storageCap: number;
  survivors: EconSurvivor[];
  producers: EconProducer[];
  housingCapacity: number;
  transporters: number;
  /** Phase 9: goods / game hour hauled by horses & elephants on transport duty */
  animalHaulPerHour?: number;
  naturalGrowth: boolean;
  rescue: { arrivesAtHour: number; count: number } | null;
}

export interface Arrival {
  atHour: number;
  reason: 'migration' | 'event' | 'birth' | 'rescue';
}

export interface EconResult {
  state: EconState;
  /** reason → code → delta */
  transactions: Record<string, Record<string, number>>;
  arrivals: Arrival[];
  /** Shortest food / water supply ratio seen (1 = always enough) */
  foodRatio: number;
  waterRatio: number;
  hoursSimulated: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const hash = (a: number, b: number): number => {
  let x = (Math.imul(a, 2654435761) ^ Math.imul(b + 0x9e3779b9, 40503)) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d) >>> 0;
  x ^= x >>> 12;
  return x >>> 0;
};

function tx(result: EconResult, reason: string, code: string, delta: number): void {
  if (!delta) return;
  const r = (result.transactions[reason] ??= {});
  r[code] = (r[code] ?? 0) + delta;
}

/** Real seconds of a game hour. */
export const hourSeconds = (daySeconds: number): number => daySeconds / 24;

export function foodStock(stock: Record<string, number>): number {
  return FOOD_VALUES.reduce((s, [code, v]) => s + (stock[code] ?? 0) * v, 0);
}

/** Simulates [fromHour, toHour) in game hours. */
export function simulateEconomy(input: EconState, fromHour: number, toHour: number): EconResult {
  const s: EconState = {
    ...input,
    stock: { ...input.stock },
    survivors: input.survivors.map((v) => ({ ...v, skills: { ...v.skills } })),
    producers: input.producers.map((p) => ({ ...p, buffer: { ...p.buffer }, workerIds: [...p.workerIds], batches: 0 })),
    rescue: input.rescue ? { ...input.rescue } : null,
  };
  const result: EconResult = { state: s, transactions: {}, arrivals: [], foodRatio: 1, waterRatio: 1, hoursSimulated: 0 };
  if (!(toHour > fromHour)) return result;
  const start = Math.max(fromHour, toHour - MAX_SIMULATED_HOURS);
  let t = start;
  while (t < toHour - 1e-9) {
    const next = Math.min(toHour, Math.floor(t) + 1);
    const dt = next - t;
    const hour = ((t + dt / 2) % 24 + 24) % 24;
    stepHour(s, hour, dt, result);
    // 07:00 events
    const d0 = Math.floor((t - 7) / 24);
    const d1 = Math.floor((next - 7) / 24);
    if (d1 > d0) dailyEvents(s, d1, next, result);
    if (s.rescue && next >= s.rescue.arrivesAtHour) {
      for (let i = 0; i < s.rescue.count; i += 1) arrive(s, result, next, 'rescue');
      s.rescue = null;
    }
    t = next;
  }
  result.hoursSimulated = toHour - start;
  return result;
}

function stepHour(s: EconState, hour: number, dt: number, result: EconResult): void {
  const byId = new Map(s.survivors.map((v) => [v.id, v]));
  const secs = hourSeconds(s.daySeconds) * dt;

  // 1. Production
  for (const p of s.producers) {
    const recipe = p.recipe ? getRecipe(p.recipe) : null;
    if (!recipe) {
      p.status = 'no_recipe';
      continue;
    }
    const workers = p.workerIds.map((id) => byId.get(id)).filter((v): v is EconSurvivor => Boolean(v));
    if (!workers.length) {
      p.status = 'no_workers';
      continue;
    }
    const prof = workers[0].profession;
    if (!isWorkHour(hour, prof)) {
      if (p.status === 'running') p.status = 'idle';
      continue;
    }
    const rate = workers.reduce((sum, w) => sum + workerEfficiency(w.skills[w.profession ?? 'farmer'] ?? 0.2, w.stamina, w.health), 0);
    const speed = 1 + 0.25 * (Math.min(3, p.level) - 1);
    p.progress += (secs * rate * speed) / recipe.seconds;
    p.status = 'running';
    while (p.progress >= 1) {
      const buffered = Object.values(p.buffer).reduce((a, b) => a + b, 0);
      const produced = Object.values(recipe.outputs).reduce((a, b) => a + (b ?? 0), 0);
      if (buffered + produced > outputBufferCapacity(p.level)) {
        p.status = 'buffer_full';
        p.progress = 1;
        break;
      }
      const missing = Object.entries(recipe.inputs).some(([c, n]) => (s.stock[c] ?? 0) < (n ?? 0));
      if (missing) {
        p.status = 'missing_input';
        p.progress = 1;
        break;
      }
      for (const [c, n] of Object.entries(recipe.inputs)) {
        s.stock[c] = (s.stock[c] ?? 0) - (n ?? 0);
        tx(result, 'production_input', c, -(n ?? 0));
      }
      for (const [c, n] of Object.entries(recipe.outputs)) p.buffer[c] = (p.buffer[c] ?? 0) + (n ?? 0);
      p.progress -= 1;
      p.batches += 1;
    }
    // Skills grow with practice.
    for (const w of workers) if (w.profession) w.skills[w.profession] = Math.min(1, (w.skills[w.profession] ?? 0) + 0.004 * dt);
  }

  // 2. Transport to storage
  const phase = phaseAt(hour);
  let haul = phase === 'work' || phase === 'afternoon' ? (s.transporters * TRANSPORT_PER_HOUR + (s.animalHaulPerHour ?? 0)) * dt : 0;
  for (const p of s.producers) {
    const auto = autoTransfers(p.level);
    for (const [c, n] of Object.entries(p.buffer)) {
      if (n <= 0) continue;
      const room = Math.max(0, s.storageCap - (s.stock[c] ?? 0));
      let move = Math.min(n, room);
      if (!auto) move = Math.min(move, haul);
      if (move <= 0) continue;
      if (!auto) haul -= move;
      p.buffer[c] = n - move;
      s.stock[c] = (s.stock[c] ?? 0) + move;
      tx(result, 'production', c, move);
    }
    if (p.status === 'buffer_full' && Object.values(p.buffer).reduce((a, b) => a + b, 0) < outputBufferCapacity(p.level)) p.status = 'running';
  }

  // 3. Needs
  const rain = Math.min(BASE_WATER_PER_DAY * (dt / 24), Math.max(0, s.storageCap - (s.stock.water ?? 0)));
  s.stock.water = (s.stock.water ?? 0) + rain;
  tx(result, 'rain', 'water', rain);
  const n = s.survivors.length;
  let fed = 1;
  let watered = 1;
  if (n > 0) {
    let needFood = n * FOOD_PER_DAY * (dt / 24);
    const wantFood = needFood;
    for (const [code, value] of FOOD_VALUES) {
      if (needFood <= 1e-9) break;
      const have = s.stock[code] ?? 0;
      if (have <= 0) continue;
      const use = Math.min(have, needFood / value);
      s.stock[code] = have - use;
      needFood -= use * value;
      tx(result, 'consumption', code, -use);
    }
    fed = wantFood > 0 ? clamp01(1 - needFood / wantFood) : 1;
    const needWater = n * WATER_PER_DAY * (dt / 24);
    const useWater = Math.min(s.stock.water ?? 0, needWater);
    s.stock.water = (s.stock.water ?? 0) - useWater;
    tx(result, 'consumption', 'water', -useWater);
    watered = needWater > 0 ? useWater / needWater : 1;
  }
  result.foodRatio = Math.min(result.foodRatio, fed);
  result.waterRatio = Math.min(result.waterRatio, watered);

  // 4. Villagers
  const sleeping = phase === 'night';
  for (const v of s.survivors) {
    const working = v.employed && isWorkHour(hour, v.profession);
    const home = v.homeId !== null;
    v.stamina = clamp01(v.stamina + dt * (sleeping ? (home ? 0.13 : 0.06) : working ? -0.055 : 0.01));
    const ok = Math.min(fed, watered);
    v.health = clamp01(v.health + dt * (ok >= 0.99 ? 0.008 : -0.03 * (1 - ok)));
    const target = 0.3 * (home ? 1 : 0) + 0.25 * fed + 0.2 * watered + 0.15 * (v.employed ? 1 : 0.4) + 0.1 * v.health;
    v.satisfaction = clamp01(v.satisfaction + (target - v.satisfaction) * (1 - Math.exp(-dt / 12)));
  }
}

function dailyEvents(s: EconState, day: number, atHour: number, result: EconResult): void {
  const free = s.housingCapacity - s.survivors.length;
  const avgSat = s.survivors.length ? s.survivors.reduce((a, v) => a + v.satisfaction, 0) / s.survivors.length : 1;
  const foodDays = s.survivors.length ? foodStock(s.stock) / (s.survivors.length * FOOD_PER_DAY) : 99;
  const h = hash(s.seed, day);
  let room = free;
  // Migrants: only into a village with free housing, food for 2 days and content people.
  if (room > 0 && foodDays >= 2 && avgSat >= 0.45 && h % 3 !== 0) {
    const count = Math.min(room, 1 + ((h >>> 3) % 2));
    for (let i = 0; i < count; i += 1) arrive(s, result, atHour, 'migration');
    room -= count;
  }
  // A family shows up now and then (population event).
  if (room >= 2 && day % 5 === 4 && foodDays >= 3) {
    for (let i = 0; i < 2; i += 1) arrive(s, result, atHour, 'event');
    room -= 2;
  }
  // Natural growth (optional)
  if (s.naturalGrowth && room > 0 && s.survivors.length >= 2 && avgSat >= 0.7 && day % 3 === 0) arrive(s, result, atHour, 'birth');
}

function arrive(s: EconState, result: EconResult, atHour: number, reason: Arrival['reason']): void {
  result.arrivals.push({ atHour, reason });
  // Newcomers eat from now on (the server creates the real rows).
  s.survivors.push({
    id: `new:${result.arrivals.length}`,
    profession: null,
    employed: false,
    homeId: null,
    health: 0.85,
    stamina: 0.7,
    satisfaction: 0.6,
    skills: {},
  });
}

/** Days of food / water left for the current population. */
export function supplyDays(stock: Record<string, number>, population: number): { food: number; water: number } {
  if (population <= 0) return { food: Infinity, water: Infinity };
  return { food: foodStock(stock) / (population * FOOD_PER_DAY), water: (stock.water ?? 0) / (population * WATER_PER_DAY) };
}
