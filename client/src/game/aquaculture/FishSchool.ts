/**
 * Fish behaviour for one water body (frontend only, nothing persisted).
 *
 * Schooling boids per species (cohesion, alignment, separation) plus a wander target picked from
 * the pond's deep points. Before every move the fish looks ahead: if the look-ahead point is not
 * swimmable it turns toward open water, and a move that would leave the swimmable area is never
 * applied — fish cannot leave the water or cross the bank / cage net.
 *
 * Feeding: `feed()` sends every fish to the feeding point at speed (they gather, nibble at the
 * surface and splash) for a few seconds.
 */
import { createRng, hashSeed, type FishSpeciesCode } from '@cityverse/shared';
import type { XZ } from '../farming/farmLayout';
import type { FishRig } from './fishModels';
import type { PondLayout } from './pondLayout';

export interface SchoolFish {
  id: string;
  species: FishSpeciesCode;
  /** Display scale (0.45 fry … 1 market size) */
  scale: number;
}

export interface FishPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
  pitch: number;
  tailYaw: number;
  scale: number;
}

interface Agent extends SchoolFish {
  rig: FishRig;
  rng: () => number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  roll: number;
  /** 0 = just under the surface, 1 = near the bed */
  depthK: number;
  target: XZ;
  retarget: number;
  phase: number;
}

const LOOKAHEAD = 1.4;
const SEPARATION = 0.9;

export class FishSchool {
  private readonly agents = new Map<string, Agent>();
  private feedTimer = 0;
  private time = 0;
  /** Moves refused because they would leave the water (tests) */
  refusedMoves = 0;

  /** Current water surface (set by the renderer from the water level). */
  surfaceY: number | null = null;

  private surface(): number {
    return this.surfaceY ?? this.layout.surface;
  }

  constructor(
    readonly layout: PondLayout,
    private readonly rigFor: (s: FishSpeciesCode) => FishRig,
    private readonly seed: string,
    private readonly ground: (x: number, z: number) => number
  ) {}

  get size(): number {
    return this.agents.size;
  }

  get feeding(): boolean {
    return this.feedTimer > 0;
  }

  sync(list: readonly SchoolFish[]): void {
    const seen = new Set<string>();
    for (const f of list) {
      seen.add(f.id);
      const a = this.agents.get(f.id);
      if (a) {
        a.scale = f.scale;
        continue;
      }
      const rng = createRng(hashSeed(`${this.seed}:${f.id}`));
      const p = this.layout.swimPoints[Math.floor(rng() * this.layout.swimPoints.length)];
      const ang = rng() * Math.PI * 2;
      this.agents.set(f.id, {
        ...f,
        rig: this.rigFor(f.species),
        rng,
        x: p.x,
        z: p.z,
        vx: Math.sin(ang) * 0.3,
        vz: Math.cos(ang) * 0.3,
        yaw: ang,
        roll: 0,
        depthK: 0.2 + rng() * 0.6,
        target: this.randomTarget(rng),
        retarget: 2 + rng() * 5,
        phase: rng() * 10,
      });
    }
    for (const id of [...this.agents.keys()]) if (!seen.has(id)) this.agents.delete(id);
  }

  /** Everyone rushes to the feeding point for a few seconds. */
  feed(seconds = 7): void {
    this.feedTimer = seconds;
    for (const a of this.agents.values()) a.target = this.jitter(this.layout.feeder, a.rng, 1.6);
  }

  positions(): XZ[] {
    return [...this.agents.values()].map((a) => ({ x: a.x, z: a.z }));
  }

  update(dt: number): void {
    const step = Math.min(dt, 0.1);
    this.time += step;
    this.feedTimer = Math.max(0, this.feedTimer - step);
    const list = [...this.agents.values()];
    for (const a of list) this.steer(a, list, step);
  }

  forEachPose(fn: (id: string, species: FishSpeciesCode, pose: FishPose) => void): void {
    const pose: FishPose = { x: 0, y: 0, z: 0, yaw: 0, roll: 0, pitch: 0, tailYaw: 0, scale: 1 };
    const L = this.layout;
    for (const a of this.agents.values()) {
      const speed = Math.hypot(a.vx, a.vz);
      const t = this.time + a.phase;
      const surface = this.surface();
      const depth = L.dug ? Math.max(0, surface - this.ground(a.x, a.z)) : 2.5;
      // Stay between just-under-the-surface and just-above-the-bed.
      const room = Math.max(0, depth - 0.5);
      const feedingRise = this.feedTimer > 0 ? 0.7 : 0;
      const k = Math.max(0, a.depthK * (1 - feedingRise) + Math.sin(t * 0.4) * 0.08);
      pose.x = a.x;
      pose.z = a.z;
      pose.y = surface - 0.28 - k * room;
      pose.yaw = a.yaw;
      pose.roll = a.roll;
      pose.pitch = Math.sin(t * 0.9) * 0.06;
      // Tail beats faster when swimming fast; a gentle idle wag otherwise.
      pose.tailYaw = Math.sin(t * a.rig.beat * (0.5 + speed / a.rig.speed)) * (0.25 + 0.35 * Math.min(1, speed / a.rig.speed));
      pose.scale = a.scale;
      fn(a.id, a.species, pose);
    }
  }

  // ── Behaviour ────────────────────────────────────────────────────────────
  private steer(a: Agent, all: readonly Agent[], dt: number): void {
    const L = this.layout;
    const feeding = this.feedTimer > 0;
    a.retarget -= dt;
    if (!feeding && (a.retarget <= 0 || Math.hypot(a.target.x - a.x, a.target.z - a.z) < 0.8)) {
      a.target = this.randomTarget(a.rng);
      a.retarget = 4 + a.rng() * 6;
    }
    const maxSpeed = a.rig.speed * (feeding ? 1.8 : 0.55 + 0.25 * Math.sin(this.time * 0.3 + a.phase)) * (0.7 + 0.3 * a.scale);

    // Seek target
    let ax = a.target.x - a.x;
    let az = a.target.z - a.z;
    const td = Math.hypot(ax, az) || 1;
    ax = (ax / td) * 1.2;
    az = (az / td) * 1.2;

    // Schooling with the same species
    let cx = 0;
    let cz = 0;
    let vx = 0;
    let vz = 0;
    let n = 0;
    for (const o of all) {
      if (o === a || o.species !== a.species) continue;
      const dx = o.x - a.x;
      const dz = o.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > 5) continue;
      n += 1;
      cx += o.x;
      cz += o.z;
      vx += o.vx;
      vz += o.vz;
      if (d < SEPARATION && d > 1e-4) {
        ax -= (dx / d) * (SEPARATION - d) * 3;
        az -= (dz / d) * (SEPARATION - d) * 3;
      }
    }
    if (n) {
      ax += (cx / n - a.x) * 0.15 + (vx / n - a.vx) * 0.4;
      az += (cz / n - a.z) * 0.15 + (vz / n - a.vz) * 0.4;
    }

    // Look ahead: steer away from the bank / net before reaching it.
    const sp = Math.hypot(a.vx, a.vz) || 1e-3;
    const lx = a.x + (a.vx / sp) * LOOKAHEAD;
    const lz = a.z + (a.vz / sp) * LOOKAHEAD;
    if (!L.swimmable(lx, lz)) {
      const open = this.openWater(a);
      ax += (open.x - a.x) * 2.5;
      az += (open.z - a.z) * 2.5;
      if (!feeding) a.target = open;
    }

    a.vx += ax * dt * 1.6;
    a.vz += az * dt * 1.6;
    const s = Math.hypot(a.vx, a.vz);
    if (s > maxSpeed) {
      a.vx = (a.vx / s) * maxSpeed;
      a.vz = (a.vz / s) * maxSpeed;
    }

    const nx = a.x + a.vx * dt;
    const nz = a.z + a.vz * dt;
    if (!L.swimmable(a.x, a.z)) {
      // Stranded by falling water: swim straight to open water, never out of the pond.
      const open = this.openWater(a);
      const d = Math.hypot(open.x - a.x, open.z - a.z) || 1;
      const sx = a.x + ((open.x - a.x) / d) * a.rig.speed * dt;
      const sz = a.z + ((open.z - a.z) / d) * a.rig.speed * dt;
      if (L.depthAt(sx, sz) > 0) {
        a.x = sx;
        a.z = sz;
        a.vx = ((open.x - a.x) / d) * a.rig.speed;
        a.vz = ((open.z - a.z) / d) * a.rig.speed;
      }
    } else if (L.swimmable(nx, nz)) {
      a.x = nx;
      a.z = nz;
    } else {
      // Never leave the water: turn around instead.
      this.refusedMoves += 1;
      a.vx = -a.vx * 0.5;
      a.vz = -a.vz * 0.5;
      a.target = this.openWater(a);
    }

    // Heading + banking into turns
    if (Math.hypot(a.vx, a.vz) > 0.02) {
      let diff = Math.atan2(a.vx, a.vz) - a.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.yaw += diff * Math.min(1, dt * 5);
      a.roll += (-diff * 0.8 - a.roll) * Math.min(1, dt * 4);
    }
  }

  private randomTarget(rng: () => number): XZ {
    const pts = this.layout.swimPoints;
    return pts[Math.floor(rng() * pts.length)];
  }

  /** Nearest deep point roughly ahead / away from the bank. */
  private openWater(a: Agent): XZ {
    let best = this.layout.swimPoints[0];
    let bd = Infinity;
    for (const p of this.layout.swimPoints) {
      if (!this.layout.swimmable(p.x, p.z)) continue;
      const d = Math.hypot(p.x - a.x, p.z - a.z);
      if (d > 1.5 && d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private jitter(p: XZ, rng: () => number, r: number): XZ {
    for (let k = 0; k < 8; k += 1) {
      const q = { x: p.x + (rng() - 0.5) * 2 * r, z: p.z + (rng() - 0.5) * 2 * r };
      if (this.layout.swimmable(q.x, q.z)) return q;
    }
    return p;
  }
}
