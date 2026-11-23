/**
 * Timestamp-driven aquaculture simulation (pure, deterministic). The server runs it from
 * `last_simulated_at` to now before every read / write; the client runs it to extrapolate.
 *
 * Per step:
 *  - water level: filling after digging; evaporation on level-1 earth ponds; the inlet sluice
 *    (L2+) and natural water (cages) keep it full
 *  - water quality drifts toward a target: the level's base quality (aerators / filter at L3)
 *    minus overcrowding, low water and dirty feed
 *  - fish eat from the feeder (kg feed per kg fish), satiety follows the supply; growth depends
 *    on feed, water quality, density, health and pond level; stress lowers health, and very
 *    unhealthy fish die off slowly
 */
import {
  getFishFeed,
  getFishSpecies,
  getWaterBodyDefinition,
  waterBodyCapacity,
  waterBodyLevel,
  fishFeedCapacity,
  type FishFeedCode,
  type FishSpeciesCode,
  type WaterBodyTypeCode,
} from './definitions.js';

export const FISH_SATIETY_TAU = 120;
export const QUALITY_TAU = 300;
/** Earth ponds lose this share of water per second (L1 only). */
export const EVAPORATION_PER_SECOND = 1 / 5400;
export const FISH_HEALTH_DECAY = 1 / 600;
export const FISH_HEALTH_RECOVERY = 1 / 900;
/** Water level needed to stock fish. */
export const MIN_STOCKING_WATER = 0.8;
const MAX_STEPS = 400;
const MAX_RECORDS = 24;

export type FishStage = 'fry' | 'growing' | 'harvestable';
export const FISH_STAGE_LABELS: Record<FishStage, string> = { fry: 'Cá bột', growing: 'Đang lớn', harvestable: 'Thu hoạch được' };

export interface SimFishBatch {
  id: string;
  species: FishSpeciesCode;
  /** Fish alive (fractional while dying off) */
  alive: number;
  /** kg per fish */
  weight: number;
  health: number;
  satiety: number;
}

export interface AquaSimState {
  type: WaterBodyTypeCode;
  level: number;
  hexCount: number;
  /** 0..1 */
  waterLevel: number;
  /** 0..1 */
  quality: number;
  /** kg in the feeder */
  feedStock: number;
  feedQuality: number;
  /** Filling after digging (null when not filling) */
  fill: { startedAtMs: number; finishesAtMs: number } | null;
  batches: SimFishBatch[];
}

export interface QualitySample {
  atMs: number;
  quality: number;
  waterLevel: number;
  density: number;
  feedStock: number;
}

export interface AquaSimResult {
  state: AquaSimState;
  records: QualitySample[];
  feedUsed: number;
  died: number;
  simulatedToMs: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function fishCount(batches: readonly Pick<SimFishBatch, 'alive'>[]): number {
  return batches.reduce((s, b) => s + b.alive, 0);
}

export function pondDensity(s: Pick<AquaSimState, 'type' | 'level' | 'hexCount' | 'batches'>): number {
  const cap = waterBodyCapacity(s.type, s.level, s.hexCount);
  return cap > 0 ? fishCount(s.batches) / cap : 0;
}

/** Target weight: market weight, or fingerling weight in a hatchery. */
export function targetWeight(type: WaterBodyTypeCode, species: FishSpeciesCode): number {
  const f = getFishSpecies(species);
  return getWaterBodyDefinition(type).hatchery ? f.fingerlingWeight : f.marketWeight;
}

export function fishStage(type: WaterBodyTypeCode, b: Pick<SimFishBatch, 'species' | 'weight'>): FishStage {
  const target = targetWeight(type, b.species);
  if (b.weight >= target - 1e-6) return 'harvestable';
  return b.weight < target * 0.3 ? 'fry' : 'growing';
}

/** Quality the water drifts toward. */
export function qualityTarget(s: Pick<AquaSimState, 'type' | 'level' | 'hexCount' | 'batches' | 'waterLevel' | 'feedQuality'>): number {
  const lvl = waterBodyLevel(s.type, s.level);
  const density = pondDensity(s);
  let q = lvl.baseQuality + 0.08 * s.feedQuality;
  q -= 0.45 * Math.max(0, density - 0.6);
  if (s.waterLevel < 0.5) q -= (0.5 - s.waterLevel) * 0.8;
  return Math.min(1, Math.max(0.05, q));
}

/** 0..~1.3 — how well a batch grows right now. */
export function growthFactor(s: Pick<AquaSimState, 'type' | 'level' | 'hexCount' | 'batches' | 'quality' | 'feedQuality'>, b: SimFishBatch): number {
  const f = getFishSpecies(b.species);
  const density = pondDensity(s);
  const qf = clamp01((s.quality - f.minQuality) / Math.max(0.05, 0.75 - f.minQuality));
  const df = density <= 0.8 ? 1 : Math.max(0.25, 1 - (density - 0.8) * 2.5);
  return clamp01(b.satiety / 0.7) * qf * df * b.health * (1 + s.feedQuality);
}

export function simulateAquaculture(
  input: AquaSimState,
  fromMs: number,
  toMs: number,
  levelChanges: readonly { atMs: number; level: number }[] = []
): AquaSimResult {
  const s: AquaSimState = { ...input, fill: input.fill ? { ...input.fill } : null, batches: input.batches.map((b) => ({ ...b })) };
  const result: AquaSimResult = { state: s, records: [], feedUsed: 0, died: 0, simulatedToMs: fromMs };
  if (!(toMs > fromMs)) return result;
  const changes = [...levelChanges].filter((c) => c.atMs > fromMs && c.atMs <= toMs).sort((a, b) => a.atMs - b.atMs);
  const maxStep = Math.max(2000, (toMs - fromMs) / MAX_STEPS);
  const recordEvery = Math.max(60_000, (toMs - fromMs) / MAX_RECORDS);
  let nextRecord = fromMs + recordEvery;
  let t = fromMs;
  let guard = 0;
  while (t < toMs && guard < MAX_STEPS * 3) {
    guard += 1;
    let next = Math.min(toMs, t + maxStep);
    if (changes.length) next = Math.min(next, changes[0].atMs);
    if (s.fill) next = Math.min(next, Math.max(t + 1, s.fill.finishesAtMs));
    step(s, t, next, result);
    t = next;
    while (changes.length && changes[0].atMs <= t) s.level = changes.shift()!.level;
    if (t >= nextRecord) {
      result.records.push(sample(s, t));
      nextRecord += recordEvery;
    }
  }
  result.simulatedToMs = Math.max(fromMs, t);
  return result;
}

function sample(s: AquaSimState, atMs: number): QualitySample {
  return {
    atMs,
    quality: Math.round(s.quality * 1000) / 1000,
    waterLevel: Math.round(s.waterLevel * 1000) / 1000,
    density: Math.round(pondDensity(s) * 1000) / 1000,
    feedStock: Math.round(s.feedStock * 10) / 10,
  };
}

function step(s: AquaSimState, t0: number, t1: number, result: AquaSimResult): void {
  const dt = (t1 - t0) / 1000;
  if (dt <= 0) return;
  const def = getWaterBodyDefinition(s.type);
  const lvl = waterBodyLevel(s.type, s.level);

  // Water level
  if (s.fill) {
    const span = Math.max(1, s.fill.finishesAtMs - s.fill.startedAtMs);
    s.waterLevel = Math.max(s.waterLevel, clamp01((t1 - s.fill.startedAtMs) / span));
    if (t1 >= s.fill.finishesAtMs) {
      s.waterLevel = 1;
      s.fill = null;
    }
  } else if (!def.dug || lvl.autoRefill) {
    if (s.waterLevel > 0) s.waterLevel = Math.min(1, s.waterLevel + dt / 60);
    if (!def.dug) s.waterLevel = 1;
  } else {
    s.waterLevel = Math.max(0, s.waterLevel - dt * EVAPORATION_PER_SECOND);
  }

  // Water quality
  const kq = 1 - Math.exp(-dt / QUALITY_TAU);
  s.quality = clamp01(s.quality + (qualityTarget(s) - s.quality) * kq);
  s.feedStock = Math.min(s.feedStock, fishFeedCapacity(s.type, s.level, s.hexCount));

  // Feeding (shared feeder)
  let need = 0;
  for (const b of s.batches) need += (b.alive * b.weight * getFishSpecies(b.species).feedRate * dt) / 60;
  const fFeed = need > 0 ? Math.min(1, s.feedStock / need) : 1;
  s.feedStock = Math.max(0, s.feedStock - fFeed * need);
  result.feedUsed += fFeed * need;

  const kS = 1 - Math.exp(-dt / FISH_SATIETY_TAU);
  const boost = def.hatchery ? 1.6 : 1;
  for (const b of s.batches) {
    if (b.alive <= 0) continue;
    const f = getFishSpecies(b.species);
    b.satiety = clamp01(b.satiety + (fFeed - b.satiety) * kS);
    const stressed = s.quality < f.minQuality || s.waterLevel < 0.35 || b.satiety < 0.3;
    b.health = clamp01(b.health + dt * (stressed ? -FISH_HEALTH_DECAY : FISH_HEALTH_RECOVERY * (1 + s.feedQuality)));
    const target = targetWeight(s.type, b.species);
    const top = target * 1.1;
    if (b.weight < target) {
      const k = (Math.log((top - f.fryWeight) / (top - target)) / f.growSeconds) * lvl.growthSpeed * boost;
      const w = b.weight + (top - b.weight) * (1 - Math.exp(-k * growthFactor(s, b) * dt));
      b.weight = Math.min(target, w);
    }
    let die = 0;
    if (b.health < 0.3) die += b.alive * 0.003 * dt * (1 - b.health / 0.3);
    if (s.waterLevel < 0.1) die += b.alive * 0.01 * dt;
    die = Math.min(b.alive, die);
    b.alive -= die;
    result.died += die;
  }
}

/** What a harvest gives: kg of fish (ponds / cages) or fry (hatcheries). */
export function harvestYield(type: WaterBodyTypeCode, level: number, quality: number, b: Pick<SimFishBatch, 'species' | 'alive' | 'weight'>): number {
  const alive = Math.floor(b.alive + 1e-6);
  if (getWaterBodyDefinition(type).hatchery) return alive;
  return Math.floor(alive * b.weight * waterBodyLevel(type, level).yieldMultiplier * (0.8 + 0.3 * quality));
}

/** Feed (kg) the herd needs per minute right now. */
export function fishFeedPerMinute(batches: readonly SimFishBatch[]): number {
  return batches.reduce((s, b) => s + b.alive * b.weight * getFishSpecies(b.species).feedRate, 0);
}

/** kg of feed added and the new feed quality after pouring `batches` of a feed. */
export function addFishFeed(stock: number, quality: number, feed: FishFeedCode, batches: number): { stock: number; quality: number } {
  const f = getFishFeed(feed);
  const add = f.kg * batches;
  const total = stock + add;
  return { stock: total, quality: total > 0 ? (stock * quality + add * f.quality) / total : f.quality };
}
