/**
 * Timestamp-driven livestock simulation (pure, deterministic — no per-frame AI).
 *
 * The server runs it from `lastSimulatedAt` to "now" whenever a city's farms are read or
 * changed, so time spent offline is accounted for; the client runs the same function to
 * extrapolate the bars in the HUD between syncs.
 *
 * Per step:
 *  - water flows in from the source (well: only while caretakers draw it; lake; piped at L3)
 *  - animals eat from the feed store and drink from the troughs; shortages lower satiety /
 *    raise thirst, and a hungry or thirsty animal loses health (breed resilience softens it)
 *  - every adult adds to the running production batch:
 *      product × level yield × breed × health × feed × water × age × labour × feed quality
 *    so missing feed or water means less (or no) output — never infinite production
 *  - a batch finishes after one cycle; at most `readyBatches` can wait to be collected, then
 *    production pauses until the player collects
 *  - breeding jobs end with a newborn if there is still room
 */
import {
  animalAgeFactor,
  caretakersNeeded,
  effectiveWaterSource,
  feedCapacity,
  getAnimalBreed,
  getAnimalDefinition,
  laborFactor,
  livestockCapacity,
  livestockCycleSeconds,
  livestockLevel,
  waterCapacity,
  waterSupplyPerMinute,
  type AnimalTypeCode,
  type LivestockFarmTypeCode,
  type LivestockProductCode,
  type ProductAmounts,
  type WaterSource,
} from './definitions.js';

/** Satiety / thirst follow the supply with these time constants (s). */
export const SATIETY_TAU_SECONDS = 180;
export const THIRST_TAU_SECONDS = 150;
/** Health change per second (stressed / recovering). */
export const HEALTH_DECAY_PER_SECOND = 1 / 900;
export const HEALTH_RECOVERY_PER_SECOND = 1 / 1200;
export const MIN_HEALTH = 0.05;
/** Young animals eat / drink this share of an adult. */
export const YOUNG_INTAKE = 0.6;
/** Breeding needs parents at least this healthy / fed. */
export const BREED_MIN_HEALTH = 0.6;
export const BREED_MIN_SATIETY = 0.5;
/** Nursery (level 3): breeding time and growth time multipliers. */
export const NURSERY_BREED_FACTOR = 0.6;
export const NURSERY_GROWTH_FACTOR = 0.75;
/** Simulation steps per call (long offline spans use longer steps). */
const MAX_STEPS = 480;
const MIN_STEP_SECONDS = 2;

export type AnimalStatus = 'healthy' | 'hungry' | 'thirsty' | 'sick' | 'young';
export const ANIMAL_STATUS_LABELS: Record<AnimalStatus, string> = {
  healthy: 'Khỏe mạnh',
  hungry: 'Đói',
  thirsty: 'Khát',
  sick: 'Ốm yếu',
  young: 'Con non',
};

export interface SimAnimalState {
  id: string;
  species: AnimalTypeCode;
  breed: string | null;
  bornAtMs: number;
  growsUpAtMs: number;
  /** 0..1 */
  health: number;
  /** 0..1 (1 = full) */
  satiety: number;
  /** 0..1 (1 = very thirsty) */
  thirst: number;
  /** Seconds spent starving at minimum health (species with a starvation limit only) */
  starving?: number;
}

export interface SimProductionBatch {
  /** null = started inside this simulation (not persisted yet) */
  id: string | null;
  startedAtMs: number;
  finishesAtMs: number;
  /** Fractional products accrued so far */
  progress: ProductAmounts;
  /** Σ productivity · dt and Σ adults · dt — for the batch's average efficiency */
  work: number;
  exposure: number;
}

export interface SimBreedingJob {
  id: string;
  species: AnimalTypeCode;
  breed: string | null;
  finishesAtMs: number;
}

export interface LivestockSimState {
  farmType: LivestockFarmTypeCode;
  level: number;
  hexCount: number;
  caretakers: number;
  /** Natural source; level 3 upgrades it to piped */
  waterSource: WaterSource;
  feedStock: number;
  /** 0..0.3 */
  feedQuality: number;
  waterStock: number;
  animals: SimAnimalState[];
  batch: SimProductionBatch | null;
  /** Finished batches waiting to be collected */
  readyBatches: number;
  breeding: SimBreedingJob[];
}

export interface FinishedBatch {
  batch: SimProductionBatch;
  output: ProductAmounts;
  /** 0..1 average productivity of the adults during the batch */
  efficiency: number;
}

export interface Birth {
  tempId: string;
  breedingJobId: string;
  species: AnimalTypeCode;
  breed: string | null;
  bornAtMs: number;
  growsUpAtMs: number;
}

export interface LivestockSimResult {
  state: LivestockSimState;
  finished: FinishedBatch[];
  births: Birth[];
  /** Breeding jobs that ended (with or without a birth) */
  endedBreeding: string[];
  /** Animals that died of hunger / thirst (ids) — never kept alive without food forever */
  deaths: { id: string; atMs: number }[];
  /** Feed / water used during the span */
  feedUsed: number;
  waterUsed: number;
  /** Time actually reached (== toMs unless the step guard tripped) */
  simulatedToMs: number;
}

export interface LevelChange {
  atMs: number;
  level: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function animalStatus(a: Pick<SimAnimalState, 'health' | 'satiety' | 'thirst' | 'growsUpAtMs'>, nowMs: number): AnimalStatus {
  if (a.health < 0.4) return 'sick';
  if (a.thirst > 0.6) return 'thirsty';
  if (a.satiety < 0.35) return 'hungry';
  if (nowMs < a.growsUpAtMs) return 'young';
  return 'healthy';
}

/** Productivity of one adult (0 for young animals). Level yield and breed are applied per product. */
export function animalProductivity(a: SimAnimalState, nowMs: number, labor: number, feedQuality: number): number {
  const age = animalAgeFactor(a.species, a.bornAtMs, a.growsUpAtMs, nowMs);
  if (age <= 0) return 0;
  const feed = clamp01(a.satiety / 0.7);
  const water = clamp01((1 - a.thirst) / 0.7);
  return a.health * feed * water * age * labor * (1 + feedQuality);
}

export function feedPerMinute(animals: readonly Pick<SimAnimalState, 'species' | 'growsUpAtMs'>[], nowMs: number): number {
  return animals.reduce((s, a) => s + getAnimalDefinition(a.species).feedPerMinute * (nowMs < a.growsUpAtMs ? YOUNG_INTAKE : 1), 0);
}

export function waterPerMinute(animals: readonly Pick<SimAnimalState, 'species' | 'growsUpAtMs'>[], nowMs: number): number {
  return animals.reduce((s, a) => s + getAnimalDefinition(a.species).waterPerMinute * (nowMs < a.growsUpAtMs ? YOUNG_INTAKE : 1), 0);
}

function cloneState(s: LivestockSimState): LivestockSimState {
  return {
    ...s,
    animals: s.animals.map((a) => ({ ...a })),
    batch: s.batch ? { ...s.batch, progress: { ...s.batch.progress } } : null,
    breeding: s.breeding.map((b) => ({ ...b })),
  };
}

/** Advances a farm from `fromMs` to `toMs`. `levelChanges` = upgrades that completed in between. */
export function simulateLivestock(
  input: LivestockSimState,
  fromMs: number,
  toMs: number,
  levelChanges: readonly LevelChange[] = []
): LivestockSimResult {
  const s = cloneState(input);
  const result: LivestockSimResult = { state: s, finished: [], births: [], endedBreeding: [], deaths: [], feedUsed: 0, waterUsed: 0, simulatedToMs: fromMs };
  if (!(toMs > fromMs)) return result;
  const changes = [...levelChanges].filter((c) => c.atMs > fromMs && c.atMs <= toMs).sort((a, b) => a.atMs - b.atMs);
  const maxStep = Math.max(MIN_STEP_SECONDS * 1000, (toMs - fromMs) / MAX_STEPS);
  let births = 0;
  let t = fromMs;
  let guard = 0;

  while (t < toMs && guard < MAX_STEPS * 4) {
    guard += 1;
    maybeStartBatch(s, t);
    let next = Math.min(toMs, t + maxStep);
    if (s.batch) next = Math.min(next, s.batch.finishesAtMs);
    for (const b of s.breeding) next = Math.min(next, b.finishesAtMs);
    if (changes.length) next = Math.min(next, changes[0].atMs);
    next = Math.max(next, Math.min(toMs, t + 1)); // always progress
    step(s, t, next, result);
    t = next;
    // Starvation: animals past their limit die (and stop eating from the store).
    for (const a of [...s.animals]) {
      const limit = getAnimalDefinition(a.species).starvationDeathSeconds;
      if (limit === undefined || (a.starving ?? 0) < limit) continue;
      s.animals = s.animals.filter((x) => x !== a);
      result.deaths.push({ id: a.id, atMs: t });
    }

    // Events at t
    while (changes.length && changes[0].atMs <= t) s.level = changes.shift()!.level;
    if (s.batch && s.batch.finishesAtMs <= t) finishBatch(s, result);
    for (const b of [...s.breeding]) {
      if (b.finishesAtMs > t) continue;
      s.breeding = s.breeding.filter((x) => x !== b);
      result.endedBreeding.push(b.id);
      if (s.animals.length < livestockCapacity(s.farmType, s.level, s.hexCount)) {
        births += 1;
        const growMs = getAnimalDefinition(b.species).growSeconds * 1000 * (livestockLevel(s.farmType, s.level).nursery ? NURSERY_GROWTH_FACTOR : 1);
        const birth: Birth = {
          tempId: `new:${b.id}:${births}`,
          breedingJobId: b.id,
          species: b.species,
          breed: b.breed,
          bornAtMs: b.finishesAtMs,
          growsUpAtMs: b.finishesAtMs + Math.round(growMs),
        };
        result.births.push(birth);
        s.animals.push({
          id: birth.tempId,
          species: b.species,
          breed: b.breed,
          bornAtMs: birth.bornAtMs,
          growsUpAtMs: birth.growsUpAtMs,
          health: 1,
          satiety: 0.8,
          thirst: 0.2,
        });
      }
    }
  }
  result.simulatedToMs = Math.max(fromMs, t);
  // Start the next batch right away when conditions hold now (e.g. hens just grew up).
  if (t >= toMs) maybeStartBatch(s, toMs);
  return result;
}

function adultsAt(s: LivestockSimState, t: number): SimAnimalState[] {
  return s.animals.filter((a) => t >= a.growsUpAtMs);
}

function maybeStartBatch(s: LivestockSimState, t: number): void {
  if (s.batch || s.readyBatches >= livestockLevel(s.farmType, s.level).readyBatches) return;
  const adults = adultsAt(s, t);
  if (!adults.length) return;
  // Only start when someone can actually produce (fed & watered) — no empty batches.
  const labor = laborFactor(s.caretakers, caretakersNeeded(s.animals.map((a) => a.species)));
  if (!adults.some((a) => animalProductivity(a, t, labor, s.feedQuality) > 0.05)) return;
  const species = [...new Set(adults.map((a) => a.species))];
  s.batch = {
    id: null,
    startedAtMs: t,
    finishesAtMs: t + livestockCycleSeconds(s.farmType, s.level, species) * 1000,
    progress: {},
    work: 0,
    exposure: 0,
  };
}

function finishBatch(s: LivestockSimState, result: LivestockSimResult): void {
  const batch = s.batch!;
  s.batch = null;
  const output: ProductAmounts = {};
  let total = 0;
  for (const [code, v] of Object.entries(batch.progress) as [LivestockProductCode, number][]) {
    const n = Math.floor(v + 1e-6);
    if (n > 0) {
      output[code] = n;
      total += n;
    }
  }
  const efficiency = batch.exposure > 0 ? batch.work / batch.exposure : 0;
  result.finished.push({ batch, output, efficiency: Math.round(efficiency * 1000) / 1000 });
  if (total > 0) s.readyBatches += 1;
}

function step(s: LivestockSimState, t0: number, t1: number, result: LivestockSimResult): void {
  const dt = (t1 - t0) / 1000;
  if (dt <= 0) return;
  const tm = (t0 + t1) / 2;
  const lvl = livestockLevel(s.farmType, s.level);
  const source = effectiveWaterSource(s.farmType, s.level, s.waterSource);
  const waterCap = waterCapacity(s.farmType, s.level, s.hexCount);
  const feedCap = feedCapacity(s.farmType, s.level, s.hexCount);
  s.feedStock = Math.min(s.feedStock, feedCap);

  // Water inflow, then shared intake (everyone gets the same share of what is available).
  s.waterStock = Math.min(waterCap, s.waterStock + (waterSupplyPerMinute(source, s.caretakers) * dt) / 60);
  const feedNeed = (feedPerMinute(s.animals, tm) * dt) / 60;
  const waterNeed = (waterPerMinute(s.animals, tm) * dt) / 60;
  const fFeed = feedNeed > 0 ? Math.min(1, s.feedStock / feedNeed) : 1;
  const fWater = waterNeed > 0 ? Math.min(1, s.waterStock / waterNeed) : 1;
  s.feedStock = Math.max(0, s.feedStock - fFeed * feedNeed);
  s.waterStock = Math.max(0, s.waterStock - fWater * waterNeed);
  result.feedUsed += fFeed * feedNeed;
  result.waterUsed += fWater * waterNeed;

  const needed = caretakersNeeded(s.animals.map((a) => a.species));
  const labor = laborFactor(s.caretakers, needed);
  const care = needed <= 0 ? 1 : Math.min(1, s.caretakers / needed);
  const kS = 1 - Math.exp(-dt / SATIETY_TAU_SECONDS);
  const kT = 1 - Math.exp(-dt / THIRST_TAU_SECONDS);
  const batch = s.batch;
  const cycle = batch ? (batch.finishesAtMs - batch.startedAtMs) / 1000 : 1;

  for (const a of s.animals) {
    if (a.bornAtMs > tm) continue;
    a.satiety = clamp01(a.satiety + (fFeed - a.satiety) * kS);
    a.thirst = clamp01(a.thirst + (1 - fWater - a.thirst) * kT);
    const stressed = a.satiety < 0.35 || a.thirst > 0.65;
    const resilience = getAnimalBreed(a.species, a.breed).resilience;
    if (stressed) a.health -= dt * HEALTH_DECAY_PER_SECOND * (1 - resilience) * (1.15 - 0.3 * care);
    else a.health += dt * HEALTH_RECOVERY_PER_SECOND * (1 + 2 * s.feedQuality) * (0.5 + 0.5 * care);
    a.health = Math.min(1, Math.max(MIN_HEALTH, a.health));
    if (getAnimalDefinition(a.species).starvationDeathSeconds !== undefined) {
      a.starving = stressed && a.health <= MIN_HEALTH + 1e-9 ? (a.starving ?? 0) + dt : 0;
    }

    if (!batch || tm < a.growsUpAtMs || tm < batch.startedAtMs) continue;
    const p = animalProductivity(a, tm, labor, s.feedQuality);
    batch.work += p * dt;
    batch.exposure += dt;
    if (p <= 0) continue;
    const def = getAnimalDefinition(a.species);
    const br = getAnimalBreed(a.species, a.breed);
    for (const [code, per] of Object.entries(def.products) as [LivestockProductCode, number][]) {
      const k = br.productMultiplier[code] ?? 1;
      batch.progress[code] = (batch.progress[code] ?? 0) + (per * k * lvl.yieldMultiplier * p * dt) / cycle;
    }
  }
}

/** Minutes the current feed / water lasts at the herd's intake (Infinity if nothing eats). */
export function suppliesLeft(s: Pick<LivestockSimState, 'animals' | 'feedStock' | 'waterStock'>, nowMs: number): { feedMinutes: number; waterMinutes: number } {
  const f = feedPerMinute(s.animals, nowMs);
  const w = waterPerMinute(s.animals, nowMs);
  return { feedMinutes: f > 0 ? s.feedStock / f : Infinity, waterMinutes: w > 0 ? s.waterStock / w : Infinity };
}

/** Whether two adults of a species are fit to breed. */
export function canBreed(animals: readonly SimAnimalState[], species: AnimalTypeCode, nowMs: number): boolean {
  return (
    animals.filter((a) => a.species === species && nowMs >= a.growsUpAtMs && a.health >= BREED_MIN_HEALTH && a.satiety >= BREED_MIN_SATIETY)
      .length >= 2
  );
}

/** Meat from taking an adult to the butcher (healthier = more). */
export function meatFromAnimal(a: Pick<SimAnimalState, 'species' | 'breed' | 'health'>): number {
  const def = getAnimalDefinition(a.species);
  const k = getAnimalBreed(a.species, a.breed).productMultiplier.meat ?? 1;
  return Math.max(1, Math.round(def.meatYield * k * (0.5 + 0.5 * a.health)));
}
