/**
 * Per-farm animal behaviour (frontend only — nothing here is persisted).
 *
 * AnimalStateMachine, one agent per animal:
 *
 *        ┌──────────── WANDER ◀──────────┐
 *        ▼                               │
 *      IDLE ──hungry──▶ SEEK_FOOD ──arrive──▶ EAT ──full──▶ IDLE
 *        │  ──thirsty─▶ SEEK_WATER ─arrive──▶ DRINK ─────▶ IDLE
 *        │  ──tired───▶ REST ───rested──────────────────▶ IDLE
 *        └── REACT (empty trough / selected by the player) ─▶ IDLE
 *
 * Needs are seeded from the server stats (satiety, thirst, health): a hungry herd heads to the
 * feeder often, a sick one rests more, and if the feeder or trough is empty the animal reacts
 * (sad head shake) instead of eating. Targets are chosen inside the farm; routes go over the
 * farm's hex graph and are refined on the fence-aware nav grid, so animals never cross fences
 * or buildings.
 *
 * Animation: each agent owns an AnimationMixer-like set of clip weights (idle, walk, run, eat,
 * drink, rest, sleep, react, happy). A state change only changes the target clip; weights
 * cross-fade over a short time, so poses never snap.
 *
 * Phase 9 working animals (horses / elephants) add three server-driven activities:
 *   IDLE ──training job──▶ TRAIN   laps of the training yard (horses trot / gallop; elephants
 *                                   stop at each post for a drill: trunk up, front raised)
 *        ──mount assigned─▶ RIDDEN  laps carrying the rider (clip "ride"; the rider sits on the seat)
 *        ──transport duty─▶ WORK    loaded with crates, slow laps (clip "cargo")
 * and clips trot, gallop, rear (horses) / trunk swing, train, cargo, bathe (elephants spray water
 * in the pond). Laps follow the layout's walkable loop through the same fence-aware routing.
 */
import { createRng, hashSeed, type AnimalTypeCode } from '@cityverse/shared';
import type { XZ } from '../farming/farmLayout';
import type { AnimalRig } from './animalModels';
import { routePath, type RanchLayout } from './ranchLayout';

export type AnimalBehaviorState = 'IDLE' | 'WANDER' | 'SEEK_FOOD' | 'EAT' | 'SEEK_WATER' | 'DRINK' | 'REST' | 'REACT' | 'TRAIN' | 'RIDDEN' | 'WORK';
export const ANIMAL_BEHAVIOR_STATES: readonly AnimalBehaviorState[] = ['IDLE', 'WANDER', 'SEEK_FOOD', 'EAT', 'SEEK_WATER', 'DRINK', 'REST', 'REACT', 'TRAIN', 'RIDDEN', 'WORK'];

/** Allowed transitions — anything else is a bug (tests assert this). */
export const ANIMAL_TRANSITIONS: Record<AnimalBehaviorState, readonly AnimalBehaviorState[]> = {
  IDLE: ['WANDER', 'SEEK_FOOD', 'SEEK_WATER', 'REST', 'REACT', 'IDLE', 'TRAIN', 'RIDDEN', 'WORK'],
  WANDER: ['IDLE', 'REACT'],
  SEEK_FOOD: ['EAT', 'REACT', 'IDLE'],
  EAT: ['IDLE', 'REACT'],
  SEEK_WATER: ['DRINK', 'REACT', 'IDLE'],
  DRINK: ['IDLE', 'REACT'],
  REST: ['IDLE', 'REACT'],
  REACT: ['IDLE'],
  TRAIN: ['IDLE'],
  RIDDEN: ['IDLE'],
  WORK: ['IDLE'],
};

/** Server-driven activity of a working animal (training job / rider / transport duty). */
export type AnimalActivity = 'train' | 'ride' | 'cargo';
const ACTIVITY_STATE: Record<AnimalActivity, AnimalBehaviorState> = { train: 'TRAIN', ride: 'RIDDEN', cargo: 'WORK' };

export type AnimationClip =
  | 'idle'
  | 'walk'
  | 'run'
  | 'eat'
  | 'drink'
  | 'rest'
  | 'sleep'
  | 'react'
  | 'happy'
  | 'trot'
  | 'gallop'
  | 'rear'
  | 'ride'
  | 'trunk'
  | 'train'
  | 'cargo'
  | 'bathe';
export const ANIMATION_CLIPS: readonly AnimationClip[] = ['idle', 'walk', 'run', 'eat', 'drink', 'rest', 'sleep', 'react', 'happy', 'trot', 'gallop', 'rear', 'ride', 'trunk', 'train', 'cargo', 'bathe'];

/** Clips each working species uses (tests: horses / elephants have their own set). */
export const HORSE_CLIPS: readonly AnimationClip[] = ['idle', 'walk', 'trot', 'gallop', 'eat', 'drink', 'rest', 'rear', 'ride'];
export const ELEPHANT_CLIPS: readonly AnimationClip[] = ['idle', 'walk', 'eat', 'drink', 'trunk', 'rest', 'train', 'cargo', 'bathe'];

/** Cross-fade time into each clip (s). */
const FADE: Record<AnimationClip, number> = {
  idle: 0.3,
  walk: 0.25,
  run: 0.2,
  eat: 0.35,
  drink: 0.35,
  rest: 0.6,
  sleep: 0.9,
  react: 0.15,
  happy: 0.15,
  trot: 0.22,
  gallop: 0.2,
  rear: 0.15,
  ride: 0.25,
  trunk: 0.4,
  train: 0.3,
  cargo: 0.3,
  bathe: 0.4,
};

/** Speed multiplier while a clip plays (on top of the rig's walk speed). */
const CLIP_SPEED: Partial<Record<AnimationClip, number>> = { run: 1.9, trot: 1.7, gallop: 2.8, ride: 1.6, cargo: 0.8 };

export interface AnimalPose {
  x: number;
  z: number;
  yaw: number;
  /** Vertical body offset (bob / hop) */
  lift: number;
  /** Body pitch (rad) */
  pitch: number;
  /** Body roll (rad) */
  roll: number;
  headPitch: number;
  headYaw: number;
  /** Leg swing amplitude (rad) and phase */
  legSwing: number;
  legPhase: number;
  /** 0 = standing, 1 = lying down */
  lying: number;
  /** Uniform scale (young animals are smaller) */
  scale: number;
  /** Elephant trunk curl (rad, negative = raised), ear flap (rad); horse tail swish (rad) */
  trunk: number;
  ear: number;
  tail: number;
}

export interface SimAnimal {
  id: string;
  code: AnimalTypeCode;
  adult: boolean;
  /** Server stats 0..1 (optional — defaults are a contented animal) */
  satiety?: number;
  thirst?: number;
  health?: number;
  /** Breed tint (multiplied with the model colours) */
  tint?: string | null;
  /** Working animals: what the server says it is doing */
  activity?: AnimalActivity | null;
}

export interface FarmSupplies {
  feed: boolean;
  water: boolean;
}

interface Agent {
  id: string;
  code: AnimalTypeCode;
  adult: boolean;
  tint: string | null;
  rig: AnimalRig;
  rng: () => number;
  x: number;
  z: number;
  yaw: number;
  state: AnimalBehaviorState;
  /** Clip the state wants, current clip weights and the clip's local time */
  clip: AnimationClip;
  weights: Record<AnimationClip, number>;
  path: XZ[];
  run: boolean;
  /** Walking to a rest spot: lie down on arrival */
  restOnArrival: boolean;
  timer: number;
  stateTime: number;
  hunger: number;
  thirst: number;
  energy: number;
  /** Server-driven need multipliers */
  hungerRate: number;
  thirstRate: number;
  tiredRate: number;
  phase: number;
  lying: number;
  /** Seconds before trying the empty feeder / trough again */
  foodCooldown: number;
  waterCooldown: number;
  reactHappy: boolean;
  transitions: number;
  activity: AnimalActivity | null;
  /** Next point of the lap (training / riding / cargo) */
  loopIndex: number;
  /** Horses: trotting instead of walking */
  trot: boolean;
  /** Elephants: drilling at a lap post (stationary "train" clip) */
  drilling: boolean;
}

const BASE = { hunger: 1 / 55, thirst: 1 / 70, tired: 1 / 90 };

const zeroWeights = (): Record<AnimationClip, number> => Object.fromEntries(ANIMATION_CLIPS.map((c) => [c, c === 'idle' ? 1 : 0])) as Record<AnimationClip, number>;

export class AnimalStateMachine {
  private readonly agents = new Map<string, Agent>();
  private supplies: FarmSupplies = { feed: true, water: true };
  /** Paths computed per update (spreads A* cost over frames). */
  private pathBudget = 0;
  /** Optional transition log (tests) */
  onTransition: ((id: string, from: AnimalBehaviorState, to: AnimalBehaviorState) => void) | null = null;

  constructor(
    private readonly layout: RanchLayout,
    private readonly rigFor: (code: AnimalTypeCode) => AnimalRig,
    private readonly seed: string
  ) {}

  get size(): number {
    return this.agents.size;
  }

  setSupplies(s: FarmSupplies): void {
    this.supplies = s;
  }

  /** Adds new animals (spawned near the barn door), removes gone ones, updates growth & needs. */
  sync(animals: readonly SimAnimal[]): void {
    const seen = new Set<string>();
    for (const a of animals) {
      seen.add(a.id);
      let ag = this.agents.get(a.id);
      if (!ag) {
        ag = this.spawn(a);
        this.agents.set(a.id, ag);
      }
      ag.adult = a.adult;
      ag.tint = a.tint ?? null;
      const activity = a.adult ? (a.activity ?? null) : null;
      if (activity !== ag.activity) {
        ag.activity = activity;
        // Leave the current behaviour: the next decision starts the new activity (or normal life).
        if (ag.state !== 'IDLE') this.enter(ag, 'IDLE', 0.1);
        else ag.timer = Math.min(ag.timer, 0.1);
        ag.path = [];
      }
      const satiety = a.satiety ?? 0.9;
      const thirst = a.thirst ?? 0.1;
      const health = a.health ?? 1;
      // Hungry / thirsty herds seek the troughs more often; sick animals tire quickly.
      ag.hungerRate = BASE.hunger * (1 + 2.5 * (1 - satiety));
      ag.thirstRate = BASE.thirst * (1 + 2.5 * thirst);
      ag.tiredRate = BASE.tired * (1 + 2 * (1 - health));
    }
    for (const id of [...this.agents.keys()]) if (!seen.has(id)) this.agents.delete(id);
  }

  private spawn(a: SimAnimal): Agent {
    const L = this.layout;
    const rng = createRng(hashSeed(`${this.seed}:${a.id}`));
    const door = L.nav.nearestWalkable(L.barn.x + Math.sin(L.barn.ry) * 4, L.barn.z + Math.cos(L.barn.ry) * 4) ?? L.nav.randomWalkable(rng);
    const p = L.nav.randomWalkable(rng);
    let x = (door.x + p.x) / 2;
    let z = (door.z + p.z) / 2;
    if (!L.nav.isWalkable(x, z)) ({ x, z } = L.nav.nearestWalkable(x, z) ?? p);
    return {
      id: a.id,
      code: a.code,
      adult: a.adult,
      tint: a.tint ?? null,
      rig: this.rigFor(a.code),
      rng,
      x,
      z,
      yaw: rng() * Math.PI * 2,
      state: 'IDLE',
      clip: 'idle',
      weights: zeroWeights(),
      path: [],
      run: false,
      restOnArrival: false,
      timer: 0.5 + rng() * 2,
      stateTime: 0,
      hunger: rng() * 0.6,
      thirst: rng() * 0.6,
      energy: 0.5 + rng() * 0.5,
      hungerRate: BASE.hunger,
      thirstRate: BASE.thirst,
      tiredRate: BASE.tired,
      phase: rng() * 10,
      lying: 0,
      foodCooldown: 0,
      waterCooldown: 0,
      reactHappy: false,
      transitions: 0,
      activity: a.adult ? (a.activity ?? null) : null,
      loopIndex: Math.floor(rng() * Math.max(1, L.loop.length)),
      trot: false,
      drilling: false,
    };
  }

  /** Everyone reacts happily (farm selected / products collected). */
  react(): void {
    for (const a of this.agents.values()) {
      // Working animals (training lap, rider, cargo) keep working.
      if (a.state === 'TRAIN' || a.state === 'RIDDEN' || a.state === 'WORK') continue;
      a.path = [];
      a.restOnArrival = false;
      if (a.state === 'REACT') a.timer = 1.2 + a.rng() * 0.8;
      else this.enter(a, 'REACT', 1.2 + a.rng() * 0.8);
      a.reactHappy = true;
      a.clip = 'happy';
    }
  }

  stateCounts(): Record<AnimalBehaviorState, number> {
    const out = Object.fromEntries(ANIMAL_BEHAVIOR_STATES.map((s) => [s, 0])) as Record<AnimalBehaviorState, number>;
    for (const a of this.agents.values()) out[a.state] += 1;
    return out;
  }

  clipCounts(): Record<AnimationClip, number> {
    const out = Object.fromEntries(ANIMATION_CLIPS.map((c) => [c, 0])) as Record<AnimationClip, number>;
    for (const a of this.agents.values()) out[a.clip] += 1;
    return out;
  }

  /** Weights of one agent's clips (tests / debugging). */
  weightsOf(id: string): Record<AnimationClip, number> | null {
    const a = this.agents.get(id);
    return a ? { ...a.weights } : null;
  }

  positions(): XZ[] {
    return [...this.agents.values()].map((a) => ({ x: a.x, z: a.z }));
  }

  /** Behaviour state and current clip of one animal (tests / HUD). */
  stateOf(id: string): { state: AnimalBehaviorState; clip: AnimationClip; x: number; z: number } | null {
    const a = this.agents.get(id);
    return a ? { state: a.state, clip: a.clip, x: a.x, z: a.z } : null;
  }

  update(dt: number, pathBudget = 4): void {
    this.pathBudget = pathBudget;
    const step = Math.min(dt, 0.25);
    for (const a of this.agents.values()) {
      this.step(a, step);
      this.mix(a, step);
    }
  }

  /** Visits every animal's blended pose (one shared pose object — copy if you keep it). */
  forEachPose(time: number, fn: (id: string, code: AnimalTypeCode, pose: AnimalPose, tint: string | null, clip: AnimationClip) => void): void {
    const pose = blankPose();
    const clip = blankPose();
    for (const a of this.agents.values()) {
      const t = time + a.phase;
      for (const k of POSE_KEYS) pose[k] = 0;
      let legPhase = 0;
      let legW = 0;
      for (const c of ANIMATION_CLIPS) {
        const w = a.weights[c];
        if (w < 1e-3) continue;
        clipPose(c, a, t, clip);
        for (const k of POSE_KEYS) pose[k] += clip[k] * w;
        if (clip.legSwing > 0) {
          legPhase += clip.legPhase * w;
          legW += w;
        }
      }
      pose.x = a.x;
      pose.z = a.z;
      pose.yaw += a.yaw;
      pose.legPhase = legW > 0 ? legPhase / legW : t * a.rig.gait;
      pose.lying = a.lying;
      pose.scale = a.adult ? 1 : 0.68;
      // Always-on secondary motion: ears fan, tails swish (on top of the clips).
      if (a.code === 'elephant') pose.ear += Math.sin(t * 1.3) * 0.18;
      if (a.code === 'horse') pose.tail += Math.sin(t * 1.7) * 0.3;
      fn(a.id, a.code, pose, a.tint, a.clip);
    }
  }

  // ── Behaviour ────────────────────────────────────────────────────────────
  private enter(a: Agent, next: AnimalBehaviorState, timer = 0): void {
    if (!ANIMAL_TRANSITIONS[a.state].includes(next)) throw new Error(`Invalid animal transition ${a.state} → ${next}`);
    const from = a.state;
    a.state = next;
    a.timer = timer;
    a.stateTime = 0;
    a.reactHappy = false;
    a.transitions += 1;
    a.clip = clipFor(a);
    this.onTransition?.(a.id, from, next);
  }

  private step(a: Agent, dt: number): void {
    a.hunger = Math.min(1, a.hunger + dt * a.hungerRate);
    a.thirst = Math.min(1, a.thirst + dt * a.thirstRate);
    a.foodCooldown = Math.max(0, a.foodCooldown - dt);
    a.waterCooldown = Math.max(0, a.waterCooldown - dt);
    const resting = a.state === 'REST';
    a.energy = Math.max(0, Math.min(1, a.energy + dt * (resting ? a.tiredRate * 6 : -a.tiredRate)));
    a.lying += ((resting ? 1 : 0) - a.lying) * Math.min(1, dt * 2.2);
    a.stateTime += dt;

    switch (a.state) {
      case 'WANDER':
      case 'SEEK_FOOD':
      case 'SEEK_WATER':
        this.move(a, dt);
        return;
      case 'TRAIN':
      case 'RIDDEN':
      case 'WORK':
        return this.lap(a, dt);
      case 'EAT':
        if (this.supplies.feed) a.hunger = Math.max(0, a.hunger - dt * 0.18);
        break;
      case 'DRINK':
        if (this.supplies.water) a.thirst = Math.max(0, a.thirst - dt * 0.25);
        break;
      case 'REST':
        // Deep rest turns into sleep after a while.
        if (a.stateTime > 6 && a.clip === 'rest') a.clip = 'sleep';
        break;
      default:
    }
    a.timer -= dt;
    if (a.timer > 0) return;
    if (a.state === 'REST' && a.energy < 0.95) {
      a.timer = 1;
      return;
    }
    if (a.state !== 'IDLE') return this.enter(a, 'IDLE', 0.3 + a.rng() * 1.2);
    this.decide(a);
  }

  private decide(a: Agent): void {
    const L = this.layout;
    // Working animals: the server's activity wins over grazing (they are fed at the barn).
    if (a.activity && L.loop.length) {
      a.drilling = false;
      return this.enter(a, ACTIVITY_STATE[a.activity]);
    }
    const pick = (pts: XZ[]): XZ => pts[Math.floor(a.rng() * pts.length)];
    if (a.thirst > 0.72 && a.waterCooldown <= 0) return this.goTo(a, pick(L.drinkPoints), 'SEEK_WATER', a.thirst > 0.92);
    if (a.hunger > 0.68 && a.foodCooldown <= 0) return this.goTo(a, pick(L.feedPoints), 'SEEK_FOOD', a.hunger > 0.92);
    if (a.energy < 0.25) {
      // Young animals rest in the nursery when there is one.
      const spots = !a.adult && L.nurseryPoints.length ? L.nurseryPoints : L.restPoints;
      return this.goTo(a, pick(spots), 'REST', false, true);
    }
    const r = a.rng();
    if (r < 0.5) return this.enter(a, 'IDLE', 2 + a.rng() * 4);
    let target: XZ;
    if (!a.adult && r < 0.75) {
      // Young ones trot after an adult of the same species.
      const parent = [...this.agents.values()].find((o) => o.adult && o.code === a.code && o.id !== a.id);
      target = parent ? { x: parent.x + (a.rng() - 0.5) * 2, z: parent.z + (a.rng() - 0.5) * 2 } : { x: a.x, z: a.z };
    } else {
      target = { x: a.x + (a.rng() - 0.5) * 16, z: a.z + (a.rng() - 0.5) * 16 };
    }
    const w = L.nav.nearestWalkable(target.x, target.z) ?? L.nav.randomWalkable(a.rng);
    // Horses sometimes trot or gallop across the paddock.
    const horse = a.code === 'horse';
    a.trot = horse && a.rng() < 0.35;
    this.goTo(a, w, 'WANDER', (!a.adult && a.rng() < 0.5) || (horse && a.rng() < 0.15));
  }

  /** One lap step of a working animal (training yard / riding / cargo). */
  private lap(a: Agent, dt: number): void {
    const L = this.layout;
    if (a.drilling) {
      // Elephant drill at a post: trunk up, front raised, then on to the next post.
      a.timer -= dt;
      if (a.timer > 0) return;
      a.drilling = false;
      a.clip = clipFor(a);
    }
    if (!a.path.length) {
      if (this.pathBudget <= 0) return;
      this.pathBudget -= 1;
      a.loopIndex = (a.loopIndex + 1) % L.loop.length;
      const path = routePath(L, { x: a.x, z: a.z }, L.loop[a.loopIndex]);
      if (!path || !path.length) return;
      a.path = path;
      // Training horses alternate trot and gallop laps.
      if (a.state === 'TRAIN' && a.code === 'horse' && a.loopIndex === 0) a.run = !a.run;
      a.clip = clipFor(a);
    }
    const target = a.path[0];
    const speed = a.rig.speed * 1.3 * (CLIP_SPEED[a.clip] ?? 1);
    const dx = target.x - a.x;
    const dz = target.z - a.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d <= step) {
      a.x = target.x;
      a.z = target.z;
      a.path.shift();
      if (!a.path.length && a.state === 'TRAIN' && a.code === 'elephant' && a.loopIndex % 4 === 0) {
        a.drilling = true;
        a.timer = 2.2 + a.rng();
        a.clip = 'train';
      }
    } else {
      a.x += (dx / d) * step;
      a.z += (dz / d) * step;
    }
    if (d > 0.01) {
      let diff = Math.atan2(dx, dz) - a.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.yaw += diff * Math.min(1, dt * 7);
    }
  }

  /** Starts walking to `target`; REST is entered on arrival (walking uses the WANDER state). */
  private goTo(a: Agent, target: XZ, state: AnimalBehaviorState, run: boolean, restOnArrival = false): void {
    if (this.pathBudget <= 0) {
      // Out of path budget this frame: try again shortly.
      return this.enter(a, 'IDLE', 0.1 + a.rng() * 0.3);
    }
    this.pathBudget -= 1;
    const path = routePath(this.layout, { x: a.x, z: a.z }, target);
    if (!path || path.length === 0) return this.enter(a, 'IDLE', 1 + a.rng());
    a.path = path;
    a.run = run;
    a.restOnArrival = restOnArrival;
    this.enter(a, restOnArrival ? 'WANDER' : state);
  }

  private move(a: Agent, dt: number): void {
    const target = a.path[0];
    if (!target) return this.arrive(a);
    // Scaled with the chibi display size so gaits still look right; chickens trot in short steps.
    const speed = a.rig.speed * 1.3 * (CLIP_SPEED[a.clip] ?? 1) * (a.adult ? 1 : 0.9);
    const dx = target.x - a.x;
    const dz = target.z - a.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d <= step) {
      a.x = target.x;
      a.z = target.z;
      a.path.shift();
      if (!a.path.length) this.arrive(a);
    } else {
      a.x += (dx / d) * step;
      a.z += (dz / d) * step;
    }
    if (d > 0.01) {
      let diff = Math.atan2(dx, dz) - a.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.yaw += diff * Math.min(1, dt * 7);
    }
  }

  private arrive(a: Agent): void {
    const L = this.layout;
    const face = (p: XZ): void => {
      a.yaw = Math.atan2(p.x - a.x, p.z - a.z);
    };
    a.run = false;
    if (a.restOnArrival) {
      a.restOnArrival = false;
      this.enter(a, 'IDLE', 0);
      return this.enter(a, 'REST', 8 + a.rng() * 8);
    }
    switch (a.state) {
      case 'SEEK_FOOD':
        face(L.feeder);
        if (!this.supplies.feed) {
          a.foodCooldown = 8 + a.rng() * 8;
          return this.enter(a, 'REACT', 1.4);
        }
        return this.enter(a, 'EAT', 4 + a.rng() * 4);
      case 'SEEK_WATER':
        face(L.water);
        if (!this.supplies.water) {
          a.waterCooldown = 8 + a.rng() * 8;
          return this.enter(a, 'REACT', 1.4);
        }
        this.enter(a, 'DRINK', 3 + a.rng() * 3);
        // Elephants in the pond often bathe: trunk sprays water over the back.
        if (a.code === 'elephant' && this.layout.pond > 0 && a.rng() < 0.6) {
          a.clip = 'bathe';
          a.timer += 3;
        }
        return;
      default:
        return this.enter(a, 'IDLE', 1 + a.rng() * 3);
    }
  }

  /** Cross-fades clip weights toward the agent's current clip. */
  private mix(a: Agent, dt: number): void {
    const k = Math.min(1, dt / FADE[a.clip]);
    let sum = 0;
    for (const c of ANIMATION_CLIPS) {
      const target = c === a.clip ? 1 : 0;
      a.weights[c] += (target - a.weights[c]) * k;
      if (a.weights[c] < 1e-4) a.weights[c] = 0;
      sum += a.weights[c];
    }
    if (sum > 0) for (const c of ANIMATION_CLIPS) a.weights[c] /= sum;
  }
}

function clipFor(a: Agent): AnimationClip {
  const horse = a.code === 'horse';
  const elephant = a.code === 'elephant';
  switch (a.state) {
    case 'WANDER':
    case 'SEEK_FOOD':
    case 'SEEK_WATER':
      if (horse) return a.run ? 'gallop' : a.trot ? 'trot' : 'walk';
      // Elephants never sprint: a heavy, steady walk.
      if (elephant) return 'walk';
      return a.run ? 'run' : 'walk';
    case 'EAT':
      return 'eat';
    case 'DRINK':
      return 'drink';
    case 'REST':
      return 'rest';
    case 'REACT':
      // Startled horses rear up.
      return horse ? 'rear' : 'react';
    case 'TRAIN':
      if (horse) return a.run ? 'gallop' : 'trot';
      return a.drilling ? 'train' : 'walk';
    case 'RIDDEN':
      return 'ride';
    case 'WORK':
      return 'cargo';
    default:
      // Idle elephants swing their trunk now and then.
      if (elephant && Math.abs(Math.sin(a.phase * 7 + a.transitions)) > 0.6) return 'trunk';
      return 'idle';
  }
}

const POSE_KEYS = ['yaw', 'lift', 'pitch', 'roll', 'headPitch', 'headYaw', 'legSwing', 'trunk', 'ear', 'tail'] as const;

function blankPose(): AnimalPose {
  return { x: 0, z: 0, yaw: 0, lift: 0, pitch: 0, roll: 0, headPitch: 0, headYaw: 0, legSwing: 0, legPhase: 0, lying: 0, scale: 1, trunk: 0, ear: 0, tail: 0 };
}

/** One clip's pose at local time t (offsets — yaw is relative to the agent's heading). */
function clipPose(c: AnimationClip, a: Agent, t: number, out: AnimalPose): void {
  out.yaw = 0;
  out.lift = 0;
  out.pitch = 0;
  out.roll = 0;
  out.headPitch = 0;
  out.headYaw = 0;
  out.legSwing = 0;
  out.legPhase = 0;
  out.trunk = 0;
  out.ear = 0;
  out.tail = 0;
  const g = a.rig.gait;
  const chicken = a.code === 'chicken';
  switch (c) {
    case 'walk':
      // Chickens: quick short steps with a head bob; the others amble.
      out.legSwing = chicken ? 0.45 : 0.55;
      out.legPhase = t * g * (chicken ? 1.4 : 1);
      out.lift = Math.abs(Math.sin(t * g * (chicken ? 1.4 : 1))) * (chicken ? 0.05 : 0.06);
      out.headPitch = Math.sin(t * g * 2) * (chicken ? 0.12 : 0.05);
      break;
    case 'run':
      out.legSwing = 0.85;
      out.legPhase = t * g * 1.7;
      out.lift = Math.abs(Math.sin(t * g * 1.7)) * 0.16;
      out.pitch = 0.08;
      break;
    case 'eat': {
      // Chickens peck, pigs root, cows / sheep / goats graze and chew.
      out.pitch = 0.08;
      if (chicken) out.headPitch = a.rig.eatPitch * (0.7 + 0.3 * Math.max(0, Math.sin(t * 9)));
      else {
        out.headPitch = a.rig.eatPitch * (0.9 + 0.06 * Math.sin(t * 4));
        out.headYaw = Math.sin(t * 6) * 0.06; // chewing
      }
      break;
    }
    case 'drink':
      out.headPitch = a.rig.eatPitch * 0.85 + 0.05 * Math.sin(t * 2.5);
      out.pitch = 0.1;
      break;
    case 'rest':
      out.headPitch = 0.25 + Math.sin(t * 0.8) * 0.04;
      out.lift = Math.sin(t * 1.6) * 0.015; // breathing
      break;
    case 'sleep':
      out.headPitch = 0.45;
      out.headYaw = 0.35;
      out.lift = Math.sin(t * 1.1) * 0.012;
      break;
    case 'react':
      // Sad / startled: head shake and a little step back.
      out.headYaw = Math.sin(t * 14) * 0.45;
      out.headPitch = 0.15;
      out.roll = Math.sin(t * 7) * 0.05;
      break;
    case 'happy':
      out.lift = Math.abs(Math.sin(t * 7)) * 0.45;
      out.legSwing = 0.4;
      out.legPhase = t * 7;
      out.headPitch = -0.25;
      out.yaw = Math.sin(t * 5) * 0.4;
      break;
    case 'trot':
      out.legSwing = 0.7;
      out.legPhase = t * g * 1.35;
      out.lift = Math.abs(Math.sin(t * g * 1.35)) * 0.09;
      out.headPitch = Math.sin(t * g * 2.7) * 0.06;
      out.tail = 0.25;
      break;
    case 'gallop':
      out.legSwing = 1.0;
      out.legPhase = t * g * 1.9;
      out.lift = Math.abs(Math.sin(t * g * 1.9)) * 0.22;
      out.pitch = Math.sin(t * g * 1.9) * 0.08;
      out.headPitch = -0.12 + Math.sin(t * g * 1.9) * 0.08;
      out.tail = 0.6;
      break;
    case 'rear': {
      // Up on the hind legs, front legs kicking, head thrown back.
      const up = Math.min(1, Math.sin(Math.min(Math.PI, (t % 2.2) * 2)) * 1.3);
      out.pitch = -0.62 * Math.max(0, up);
      out.lift = 0.3 * Math.max(0, up);
      out.legSwing = 0.6;
      out.legPhase = t * 9;
      out.headPitch = -0.45;
      out.tail = 0.4;
      break;
    }
    case 'ride':
      // Steady working trot under a rider.
      out.legSwing = 0.62;
      out.legPhase = t * g * 1.3;
      out.lift = Math.abs(Math.sin(t * g * 1.3)) * 0.05;
      out.headPitch = 0.08 + Math.sin(t * g * 2.6) * 0.04;
      out.tail = 0.2;
      break;
    case 'trunk':
      out.trunk = Math.sin(t * 1.6) * 0.9;
      out.headYaw = Math.sin(t * 0.8) * 0.15;
      out.ear = Math.sin(t * 2.4) * 0.25;
      out.lift = Math.sin(t * 1.4) * 0.01;
      break;
    case 'train':
      // Elephant drill: front raised, trunk lifted high, ears spread.
      out.pitch = -0.2 - Math.max(0, Math.sin(t * 2.2)) * 0.12;
      out.trunk = -1.6;
      out.headPitch = -0.3;
      out.ear = 0.5 + Math.sin(t * 6) * 0.2;
      out.legSwing = 0.25;
      out.legPhase = t * 4;
      break;
    case 'cargo':
      out.legSwing = 0.45;
      out.legPhase = t * g * 0.85;
      out.lift = Math.abs(Math.sin(t * g * 0.85)) * 0.03;
      out.headPitch = 0.12;
      out.trunk = Math.sin(t * 1.1) * 0.25;
      break;
    case 'bathe':
      // Trunk dips and sprays water over the back.
      out.headPitch = a.rig.eatPitch * 0.8;
      out.trunk = -2.1 * Math.max(0, Math.sin(t * 1.4));
      out.ear = Math.sin(t * 3) * 0.3;
      out.pitch = 0.06;
      break;
    default:
      // Idle: looking around, tiny weight shift.
      out.headYaw = Math.sin(t * 0.7) * 0.5;
      out.headPitch = Math.sin(t * 0.45) * 0.1;
      out.lift = Math.sin(t * 1.8) * 0.01;
  }
}
