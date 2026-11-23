/**
 * Villager behaviour + animation (frontend only; gameplay lives on the server).
 *
 * Behaviour: the server tells us WHO lives where and works where; the game clock + the shared
 * schedule (activityAt) tell each villager WHAT to do now. A small state machine turns that into
 * goals and hex A* routes (VillageNav):
 *
 *   INSIDE (asleep at home) ─wake→ EAT at the door ─commute→ MOVING → WORK (profession clips)
 *   WORK ─12:00→ EAT (lunch, sitting) ─13:00→ WORK ─16:00→ HAUL loop (transporters) / WORK
 *   ─18:00→ MOVING → TALK / SIT at a gathering spot ─20:30→ MOVING home → INSIDE
 *   no route → BLOCKED (reported, retried) · homeless → SLEEP outside
 *
 * Animation: clip weights cross-fade (AnimationMixer-style) so state changes never snap. Common
 * clips: idle, walk, run, sit, eat, sleep, talk, carry, push; profession clips: hoe, sow,
 * harvest, feed, net, saw, build, hammer, stack.
 */
import {
  activityAt,
  createRng,
  getProfession,
  hashSeed,
  hexKey,
  worldToAxial,
  type Activity,
  type AxialCoord,
  type Mood,
  type SurvivorDTO,
  type WorkClip,
  type WorkplaceKind,
} from '@cityverse/shared';
import type { XZ } from '../farming/farmLayout';
import type { VillageNav } from './villageNav';

export type VillagerState = 'INSIDE' | 'MOVING' | 'WORK' | 'EAT' | 'SIT' | 'TALK' | 'SLEEP' | 'IDLE' | 'HAUL_PICK' | 'HAUL_DROP' | 'BLOCKED';
export const VILLAGER_STATES: readonly VillagerState[] = ['INSIDE', 'MOVING', 'WORK', 'EAT', 'SIT', 'TALK', 'SLEEP', 'IDLE', 'HAUL_PICK', 'HAUL_DROP', 'BLOCKED'];

export type VillagerClip = 'idle' | 'walk' | 'run' | 'sit' | 'eat' | 'sleep' | 'talk' | 'carry' | 'push' | WorkClip;
export const VILLAGER_CLIPS: readonly VillagerClip[] = ['idle', 'walk', 'run', 'sit', 'eat', 'sleep', 'talk', 'carry', 'push', 'hoe', 'sow', 'harvest', 'feed', 'net', 'saw', 'build', 'hammer', 'stack'];

const FADE: Partial<Record<VillagerClip, number>> = { walk: 0.25, run: 0.2, sit: 0.5, sleep: 0.8, eat: 0.4, talk: 0.35 };
const WALK_SPEED = 1.35;

export interface VillagerPose {
  x: number;
  z: number;
  yaw: number;
  lift: number;
  pitch: number;
  roll: number;
  headPitch: number;
  headYaw: number;
  armLPitch: number;
  armLRoll: number;
  armRPitch: number;
  armRRoll: number;
  legL: number;
  legR: number;
  /** 0..1 */
  sit: number;
  lie: number;
  carry: number;
  cart: number;
  tool: number;
}

/** What the renderer / HUD knows about the village (rebuilt when buildings change). */
export interface VillageContext {
  nav: VillageNav;
  /** house building id → footprint */
  homes: Map<string, readonly AxialCoord[]>;
  /** `${kind}:${id}` → workplace */
  workplaces: Map<string, { kind: WorkplaceKind; typeCode: string; hexes: readonly AxialCoord[] }>;
  /** Footprints of places goods are hauled from (production) and to (storage / market) */
  haulFrom: readonly (readonly AxialCoord[])[];
  haulTo: readonly (readonly AxialCoord[])[];
  /** Footprints of gathering places (territory centre, market, well) */
  gathering: readonly (readonly AxialCoord[])[];
  fallback: AxialCoord;
}

interface Goal {
  /** Hexes that satisfy the goal (A* targets) and the exact spot inside the chosen one */
  hexes: AxialCoord[];
  spot: (hex: AxialCoord) => XZ;
  face: (hex: AxialCoord) => XZ;
  arrive: VillagerState;
  label: string;
}

interface Agent {
  dto: SurvivorDTO;
  rng: () => number;
  lane: number;
  jitter: number;
  x: number;
  z: number;
  yaw: number;
  faceTo: XZ | null;
  state: VillagerState;
  activity: Activity | null;
  goal: Goal | null;
  path: XZ[];
  run: boolean;
  timer: number;
  t: number;
  clip: VillagerClip;
  weights: Map<VillagerClip, number>;
  workIdx: number;
  carrying: boolean;
  haulLeg: 'from' | 'to';
  blocked: string | null;
  retry: number;
  navVersion: string;
  endHex: AxialCoord | null;
}

const goalKey = (j: SurvivorDTO['job']): string | null => (j ? `${j.kind}:${j.id}` : null);

export class VillagerBrain {
  private readonly agents = new Map<string, Agent>();
  private ctx: VillageContext;
  private pathBudget = 0;
  /** Planned routes (tests check them for blocked hexes). */
  readonly routeLog: { id: string; points: XZ[] }[] = [];
  logRoutes = false;

  constructor(ctx: VillageContext) {
    this.ctx = ctx;
  }

  get size(): number {
    return this.agents.size;
  }

  setContext(ctx: VillageContext): void {
    this.ctx = ctx;
  }

  /** Adds / updates villagers; new ones are spawned where their schedule puts them now. */
  sync(list: readonly SurvivorDTO[], hour: number): void {
    const seen = new Set<string>();
    for (const dto of list) {
      seen.add(dto.id);
      const a = this.agents.get(dto.id);
      if (a) {
        const moved = goalKey(a.dto.job) !== goalKey(dto.job) || a.dto.homeId !== dto.homeId;
        a.dto = dto;
        if (moved) a.activity = null; // re-plan with the new home / job
        continue;
      }
      this.agents.set(dto.id, this.spawn(dto, hour));
    }
    for (const id of [...this.agents.keys()]) if (!seen.has(id)) this.agents.delete(id);
  }

  states(): Record<VillagerState, number> {
    const out = Object.fromEntries(VILLAGER_STATES.map((s) => [s, 0])) as Record<VillagerState, number>;
    for (const a of this.agents.values()) out[a.state] += 1;
    return out;
  }

  unreachable(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const a of this.agents.values()) if (a.blocked) out[a.dto.id] = a.blocked;
    return out;
  }

  positions(): { id: string; x: number; z: number; visible: boolean }[] {
    return [...this.agents.values()].map((a) => ({ id: a.dto.id, x: a.x, z: a.z, visible: a.state !== 'INSIDE' }));
  }

  stateOf(id: string): VillagerState | null {
    return this.agents.get(id)?.state ?? null;
  }

  update(dt: number, hour: number, pathBudget = 6): void {
    this.pathBudget = pathBudget;
    const step = Math.min(dt, 0.2);
    for (const a of this.agents.values()) {
      a.t += step;
      if (a.navVersion !== this.ctx.nav.version) this.onNavChange(a);
      const activity = activityAt((hour + a.jitter + 24) % 24, Boolean(a.dto.job), a.dto.profession, !a.dto.homeId);
      if (activity !== a.activity && this.pathBudget > 0) this.plan(a, activity, hour);
      this.tick(a, step, hour);
      this.mix(a, step);
    }
  }

  /** Visits every visible villager's blended pose (shared object). */
  forEachPose(fn: (dto: SurvivorDTO, pose: VillagerPose, mood: Mood) => void): void {
    const pose = blank();
    const tmp = blank();
    for (const a of this.agents.values()) {
      if (a.state === 'INSIDE') continue;
      for (const k of KEYS) pose[k] = 0;
      for (const [clip, w] of a.weights) {
        if (w < 1e-3) continue;
        clipPose(clip, a.t + a.lane * 3, tmp);
        for (const k of KEYS) pose[k] += tmp[k] * w;
      }
      pose.x = a.x;
      pose.z = a.z;
      pose.yaw = a.yaw;
      fn(a.dto, pose, a.dto.mood);
    }
  }

  // ── Planning ─────────────────────────────────────────────────────────────
  private spawn(dto: SurvivorDTO, hour: number): Agent {
    const rng = createRng(hashSeed(`villager:${dto.id}`));
    const a: Agent = {
      dto,
      rng,
      lane: (rng() - 0.5) * 1.4,
      jitter: (rng() - 0.5) * 0.6,
      x: 0,
      z: 0,
      yaw: rng() * Math.PI * 2,
      faceTo: null,
      state: 'IDLE',
      activity: null,
      goal: null,
      path: [],
      run: false,
      timer: 0,
      t: rng() * 10,
      clip: 'idle',
      weights: new Map([['idle', 1]]),
      workIdx: 0,
      carrying: false,
      haulLeg: 'from',
      blocked: null,
      retry: 0,
      navVersion: this.ctx.nav.version,
      endHex: null,
    };
    // Reasonable display position for the current activity (login / reload).
    const activity = activityAt((hour + a.jitter + 24) % 24, Boolean(dto.job), dto.profession, !dto.homeId);
    const goal = this.goalFor(a, activity);
    const target = goal ? this.pickHex(a, goal.hexes) : null;
    const p = target && goal ? goal.spot(target) : this.center(this.ctx.fallback);
    a.x = p.x;
    a.z = p.z;
    if (goal && target) {
      a.activity = activity;
      a.goal = goal;
      this.arrive(a, target);
    }
    return a;
  }

  private center(h: AxialCoord): XZ {
    const n = this.ctx.nav.nearestWalkable(h) ?? h;
    return this.ctx.nav.spotToward(n, n, 0);
  }

  private pickHex(a: Agent, hexes: readonly AxialCoord[]): AxialCoord | null {
    const ok = hexes.filter((h) => this.ctx.nav.isWalkable(hexKey(h.q, h.r)));
    if (!ok.length) return null;
    return ok[Math.floor(a.rng() * ok.length)];
  }

  /** Where an activity takes a villager. */
  private goalFor(a: Agent, activity: Activity): Goal | null {
    const nav = this.ctx.nav;
    const approachGoal = (footprint: readonly AxialCoord[], arriveState: VillagerState, label: string, dist = 3.2): Goal | null => {
      const hexes = nav.approachHexes(footprint);
      if (!hexes.length) return null;
      const near = (h: AxialCoord) =>
        footprint.reduce((best, f) => (Math.abs(f.q - h.q) + Math.abs(f.r - h.r) < Math.abs(best.q - h.q) + Math.abs(best.r - h.r) ? f : best), footprint[0]);
      return { hexes, spot: (h) => nav.spotToward(h, near(h), dist + a.lane * 0.3), face: (h) => nav.spotToward(h, near(h), 8), arrive: arriveState, label };
    };
    const gather = (arriveState: VillagerState, label: string): Goal | null => {
      const places = this.ctx.gathering.length ? this.ctx.gathering : [[this.ctx.fallback]];
      const place = places[Math.floor(a.rng() * places.length)];
      const g = approachGoal(place, arriveState, label, 2.2 + a.rng() * 1.5);
      if (g) return g;
      const n = nav.nearestWalkable(this.ctx.fallback);
      return n ? { hexes: [n], spot: () => this.jitterAt(n, a), face: () => this.center(n), arrive: arriveState, label } : null;
    };
    const home = a.dto.homeId ? this.ctx.homes.get(a.dto.homeId) : undefined;
    const job = a.dto.job ? this.ctx.workplaces.get(`${a.dto.job.kind}:${a.dto.job.id}`) : undefined;
    const work = (): Goal | null => {
      if (!job) return null;
      if (job.kind === 'farm_zone') {
        // Farmers walk into the field rows.
        const hexes = job.hexes.filter((h) => nav.isWalkable(hexKey(h.q, h.r)));
        return hexes.length ? { hexes, spot: (h) => this.jitterAt(h, a), face: (h) => this.jitterAt(h, a), arrive: 'WORK', label: 'nơi làm việc' } : null;
      }
      return approachGoal(job.hexes, 'WORK', 'nơi làm việc');
    };
    switch (activity) {
      case 'sleep':
      case 'return_home':
        return home ? approachGoal(home, 'INSIDE', 'nhà') : gather('SLEEP', 'chỗ ngủ');
      case 'wake':
        return home ? approachGoal(home, 'EAT', 'nhà', 2.6) : gather('EAT', 'chỗ ăn');
      case 'commute':
      case 'work':
        // A job without any way in is reported (BLOCKED) rather than silently skipped.
        return job ? work() : gather('IDLE', 'quảng trường');
      case 'lunch': {
        // Lunch next to the workplace (or on the square).
        const g = (job ? work() : null) ?? gather('EAT', 'chỗ ăn');
        return g ? { ...g, arrive: 'EAT' } : null;
      }
      case 'haul': {
        const list = a.haulLeg === 'from' ? this.ctx.haulFrom : this.ctx.haulTo;
        if (!list.length) return work();
        const g = approachGoal(list[Math.floor(a.rng() * list.length)], a.haulLeg === 'from' ? 'HAUL_PICK' : 'HAUL_DROP', 'kho');
        return g ?? work();
      }
      case 'leisure':
        return gather(a.rng() < 0.5 ? 'TALK' : 'SIT', 'quảng trường');
      default:
        return gather('IDLE', 'quảng trường');
    }
  }

  private jitterAt(h: AxialCoord, a: Agent): XZ {
    const c = this.ctx.nav.spotToward(h, h, 0);
    const ang = a.rng() * Math.PI * 2;
    const r = 1 + a.rng() * 2.5;
    return { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r };
  }

  private plan(a: Agent, activity: Activity, hour: number): void {
    a.activity = activity;
    const goal = this.goalFor(a, activity);
    if (!goal) {
      a.blocked = activity === 'work' || activity === 'commute' ? 'Nơi làm việc không có lối vào' : null;
      a.goal = null;
      a.retry = 4;
      this.enter(a, a.blocked ? 'BLOCKED' : 'IDLE');
      return;
    }
    this.route(a, goal, (activity === 'work' && hour > 8.25) || activity === 'haul');
  }

  private route(a: Agent, goal: Goal, run: boolean): void {
    this.pathBudget -= 1;
    const from = worldToAxial(a.x, a.z);
    const hexPath = this.ctx.nav.findPath(from, goal.hexes);
    a.goal = goal;
    a.navVersion = this.ctx.nav.version;
    if (!hexPath) {
      // Report instead of walking through walls; retry later (roads may get built).
      a.blocked = `Không thể tới ${goal.label}`;
      a.retry = 4;
      this.enter(a, 'BLOCKED');
      return;
    }
    a.blocked = null;
    const end = hexPath[hexPath.length - 1];
    const target = goal.spot(end);
    a.path = this.ctx.nav.smooth(hexPath, { x: a.x, z: a.z }, target, a.lane);
    if (this.logRoutes) this.routeLog.push({ id: a.dto.id, points: [...a.path] });
    a.faceTo = goal.face(end);
    a.run = run;
    a.endHex = end;
    // Leaving the house: the villager appears at the door and walks off.
    this.enter(a, 'MOVING');
  }

  private onNavChange(a: Agent): void {
    a.navVersion = this.ctx.nav.version;
    if (a.state === 'MOVING' || a.state === 'BLOCKED') {
      if (a.goal) this.route(a, a.goal, a.run);
    } else if (a.state !== 'INSIDE' && !this.ctx.nav.walkableAt(a.x, a.z)) {
      // Something was built where the villager stands: step out and re-plan.
      const n = this.ctx.nav.nearestWalkable(worldToAxial(a.x, a.z));
      if (n) {
        const c = this.center(n);
        a.x = c.x;
        a.z = c.z;
      }
      a.activity = null;
    }
  }

  // ── Per frame ────────────────────────────────────────────────────────────
  private enter(a: Agent, s: VillagerState): void {
    a.state = s;
    a.timer = 0;
    a.clip = this.clipFor(a);
  }

  private clipFor(a: Agent): VillagerClip {
    const prof = a.dto.profession ? getProfession(a.dto.profession) : null;
    switch (a.state) {
      case 'MOVING':
        if (a.carrying) return prof?.outfit.tool === 'cart' ? 'push' : 'carry';
        return a.run ? 'run' : 'walk';
      case 'WORK': {
        const clips = prof?.workClips ?? ['build'];
        return clips[a.workIdx % clips.length];
      }
      case 'EAT':
        return 'eat';
      case 'SIT':
        return 'sit';
      case 'TALK':
        return 'talk';
      case 'SLEEP':
        return 'sleep';
      case 'HAUL_PICK':
      case 'HAUL_DROP':
        return 'stack';
      default:
        return 'idle';
    }
  }

  private tick(a: Agent, dt: number, hour: number): void {
    a.timer += dt;
    switch (a.state) {
      case 'MOVING':
        return this.move(a, dt);
      case 'BLOCKED':
        a.retry -= dt;
        if (a.retry <= 0 && this.pathBudget > 0) {
          if (a.goal) this.route(a, a.goal, false);
          else a.activity = null; // re-plan from scratch (a road / door may exist now)
        }
        return;
      case 'WORK':
        // Cycle through the profession's clips (sow → hoe → harvest …).
        if (a.timer > 6) {
          a.workIdx += 1;
          a.timer = 0;
          a.clip = this.clipFor(a);
        }
        return;
      case 'HAUL_PICK':
      case 'HAUL_DROP':
        if (a.timer > 2.2) {
          a.carrying = a.state === 'HAUL_PICK';
          a.haulLeg = a.state === 'HAUL_PICK' ? 'to' : 'from';
          a.activity = null; // pick the next leg
          if (this.pathBudget > 0) this.plan(a, 'haul', hour);
        }
        return;
      case 'IDLE':
        // Unemployed / waiting villagers stroll a little now and then.
        if (a.timer > 5 + a.rng() * 4 && a.activity === 'idle' && this.pathBudget > 0) a.activity = null;
        return;
      default:
    }
  }

  private move(a: Agent, dt: number): void {
    const target = a.path[0];
    if (!target) return this.finish(a);
    const speed = WALK_SPEED * this.ctx.nav.speedAt(a.x, a.z) * (a.run ? 1.8 : 1) * (a.carrying ? 0.85 : 1);
    const dx = target.x - a.x;
    const dz = target.z - a.z;
    const d = Math.hypot(dx, dz);
    const s = speed * dt;
    if (d <= s) {
      a.x = target.x;
      a.z = target.z;
      a.path.shift();
      if (!a.path.length) this.finish(a);
    } else {
      a.x += (dx / d) * s;
      a.z += (dz / d) * s;
    }
    if (d > 0.01) turnToward(a, Math.atan2(dx, dz), dt * 6);
  }

  private finish(a: Agent): void {
    if (a.goal && a.endHex) this.arrive(a, a.endHex);
    else this.enter(a, 'IDLE');
  }

  private arrive(a: Agent, hex: AxialCoord): void {
    const g = a.goal!;
    const face = g.face(hex);
    a.yaw = Math.atan2(face.x - a.x, face.z - a.z);
    if (g.arrive !== 'HAUL_PICK' && g.arrive !== 'HAUL_DROP' && a.activity !== 'haul') a.carrying = false;
    this.enter(a, g.arrive);
  }

  private mix(a: Agent, dt: number): void {
    const k = Math.min(1, dt / (FADE[a.clip] ?? 0.3));
    let sum = 0;
    if (!a.weights.has(a.clip)) a.weights.set(a.clip, 0);
    for (const [c, w] of a.weights) {
      const nw = w + ((c === a.clip ? 1 : 0) - w) * k;
      if (nw < 1e-4 && c !== a.clip) a.weights.delete(c);
      else {
        a.weights.set(c, nw);
        sum += nw;
      }
    }
    if (sum > 0) for (const [c, w] of a.weights) a.weights.set(c, w / sum);
  }

  /** Clip weights of one villager (tests). */
  weightsOf(id: string): Map<VillagerClip, number> | null {
    const a = this.agents.get(id);
    return a ? new Map(a.weights) : null;
  }
}

function turnToward(a: { yaw: number }, want: number, k: number): void {
  let diff = want - a.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  a.yaw += diff * Math.min(1, k);
}

const KEYS = ['lift', 'pitch', 'roll', 'headPitch', 'headYaw', 'armLPitch', 'armLRoll', 'armRPitch', 'armRRoll', 'legL', 'legR', 'sit', 'lie', 'carry', 'cart', 'tool'] as const;

function blank(): VillagerPose {
  return { x: 0, z: 0, yaw: 0, lift: 0, pitch: 0, roll: 0, headPitch: 0, headYaw: 0, armLPitch: 0, armLRoll: 0, armRPitch: 0, armRRoll: 0, legL: 0, legR: 0, sit: 0, lie: 0, carry: 0, cart: 0, tool: 0 };
}

/** One clip's pose at time t (radians; arm pitch negative = forward / up). */
function clipPose(c: VillagerClip, t: number, o: VillagerPose): void {
  for (const k of KEYS) o[k] = 0;
  const walkLegs = (f: number, amp: number) => {
    o.legL = Math.sin(t * f) * amp;
    o.legR = -Math.sin(t * f) * amp;
    o.lift = Math.abs(Math.sin(t * f)) * 0.05;
  };
  switch (c) {
    case 'idle':
      o.headYaw = Math.sin(t * 0.6) * 0.35;
      o.armLRoll = 0.08 + Math.sin(t * 1.5) * 0.03;
      o.armRRoll = -0.08 - Math.sin(t * 1.5) * 0.03;
      o.lift = Math.sin(t * 2) * 0.008;
      break;
    case 'walk':
      walkLegs(7, 0.6);
      o.armLPitch = -Math.sin(t * 7) * 0.5;
      o.armRPitch = Math.sin(t * 7) * 0.5;
      break;
    case 'run':
      walkLegs(11, 0.9);
      o.armLPitch = -Math.sin(t * 11) * 0.9 - 0.3;
      o.armRPitch = Math.sin(t * 11) * 0.9 - 0.3;
      o.pitch = 0.18;
      o.lift = Math.abs(Math.sin(t * 11)) * 0.12;
      break;
    case 'carry':
      walkLegs(6.5, 0.5);
      o.armLPitch = -1.2;
      o.armRPitch = -1.2;
      o.carry = 1;
      break;
    case 'push':
      walkLegs(6, 0.5);
      o.armLPitch = -1.0;
      o.armRPitch = -1.0;
      o.pitch = 0.22;
      o.cart = 1;
      break;
    case 'sit':
      o.sit = 1;
      o.armLPitch = -0.5;
      o.armRPitch = -0.5;
      o.headYaw = Math.sin(t * 0.5) * 0.3;
      break;
    case 'eat':
      o.sit = 1;
      o.armLPitch = -0.6;
      o.armRPitch = -2.0 + Math.max(0, Math.sin(t * 2.2)) * 0.6; // spoon to mouth
      o.headPitch = 0.12 + Math.max(0, Math.sin(t * 2.2)) * 0.08;
      break;
    case 'sleep':
      o.lie = 1;
      o.lift = Math.sin(t * 1.1) * 0.01;
      o.headYaw = 0.3;
      break;
    case 'talk':
      o.headPitch = Math.sin(t * 3) * 0.08;
      o.headYaw = Math.sin(t * 0.8) * 0.2;
      o.armRPitch = -0.7 + Math.sin(t * 2.6) * 0.35;
      o.armRRoll = -0.3;
      o.armLRoll = 0.1;
      break;
    case 'hoe': {
      const s = Math.max(0, Math.sin(t * 2.4));
      o.armLPitch = -2.4 + s * 1.8;
      o.armRPitch = -2.4 + s * 1.8;
      o.pitch = 0.15 + s * 0.25;
      o.tool = 1;
      break;
    }
    case 'sow':
      o.pitch = 0.2;
      o.armLPitch = -0.9;
      o.armRPitch = -1.3 + Math.sin(t * 3) * 0.5;
      o.armRRoll = -0.4 - Math.sin(t * 3) * 0.3;
      o.legL = Math.sin(t * 1.5) * 0.2;
      o.legR = -Math.sin(t * 1.5) * 0.2;
      break;
    case 'harvest':
      o.lift = -0.22;
      o.pitch = 0.55;
      o.sit = 0.35;
      o.armLPitch = -0.7 + Math.sin(t * 2.8) * 0.3;
      o.armRPitch = -0.7 - Math.sin(t * 2.8) * 0.3;
      break;
    case 'feed':
      o.pitch = 0.15;
      o.armRPitch = -1.0 + Math.sin(t * 2.6) * 0.5;
      o.armRRoll = -0.5;
      o.armLPitch = -0.8;
      o.tool = 1;
      break;
    case 'net': {
      const s = Math.sin(t * 1.8);
      o.armLPitch = -1.1 + s * 0.6;
      o.armRPitch = -1.1 + s * 0.6;
      o.pitch = -0.15 + s * 0.2;
      o.tool = 1;
      break;
    }
    case 'saw':
      o.pitch = 0.28;
      o.armRPitch = -1.15 + Math.sin(t * 6) * 0.35;
      o.armLPitch = -0.9;
      o.tool = 1;
      break;
    case 'build':
      o.lift = -0.12;
      o.sit = 0.25;
      o.pitch = 0.3;
      o.armRPitch = -1.0 + Math.sin(t * 4) * 0.25;
      o.armRRoll = -0.2 + Math.cos(t * 4) * 0.25;
      o.tool = 1;
      break;
    case 'hammer': {
      const s = Math.pow(Math.max(0, Math.sin(t * 3.2)), 3);
      o.armRPitch = -2.6 + s * 2.2;
      o.armLPitch = -0.7;
      o.pitch = 0.18 + s * 0.12;
      o.tool = 1;
      break;
    }
    case 'stack': {
      const s = Math.sin(t * 2.4);
      o.lift = -0.1 - s * 0.08;
      o.sit = 0.2 + s * 0.15;
      o.armLPitch = -1.2 + s * 0.4;
      o.armRPitch = -1.2 + s * 0.4;
      o.carry = 1;
      break;
    }
    default:
  }
}

