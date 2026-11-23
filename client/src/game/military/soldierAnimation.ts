/**
 * Chibi soldier drills — pure functions (no Three.js), so they are cheap and testable.
 *
 * Each class loops its OWN drill cycle, built from the drills listed in the shared catalogue:
 *   swordsman   draw → swing → block → strike           (hits the straw dummy twice)
 *   spearman    guard → thrust → retract → formation    (hits the thrust post)
 *   archer      nock → raise → aim → shoot → lower       (looses an arrow at the target)
 *   crossbowman span → load → aim → shoot → reload       (slow, heavy bolt)
 * Clips cross-fade (clip weights) so there is no popping between them. Every soldier gets a
 * phase offset so a barracks never moves in lock-step.
 *
 * Arm angles use the villager rig convention: pitch 0 = arm hanging, negative = raised forward.
 * `weapon` / `off` are the DESIRED pitches of the held item's long axis in the body frame
 * (0 = pointing forward, −π/2 = pointing up); the renderer converts them to hand-relative.
 */
import { getUnitType, type UnitTypeCode } from '@cityverse/shared';

export interface SoldierPose {
  /** Body */
  lean: number;
  twist: number;
  crouch: number;
  stepZ: number;
  headPitch: number;
  headYaw: number;
  armLPitch: number;
  armLRoll: number;
  armRPitch: number;
  armRRoll: number;
  legL: number;
  legR: number;
  /** Desired pitch of the main weapon's long axis (body frame) */
  weapon: number;
  /** Desired pitch of the off-hand item (shield / bow) */
  off: number;
  /** Bow draw 0..1 */
  draw: number;
  /** Arrow / bolt nocked 0..1 */
  loaded: number;
  /** Legs spread sideways (riding astride), rad */
  straddle: number;
}

export type DrillEventKind = 'hit' | 'shoot' | 'swing' | 'clack' | 'stomp';
export interface DrillEvent {
  clip: string;
  /** Phase inside the clip (0..1) */
  at: number;
  kind: DrillEventKind;
}

export interface DrillClip {
  name: string;
  seconds: number;
}

export const CROSSFADE_SECONDS = 0.16;

const NEUTRAL: SoldierPose = {
  lean: 0,
  twist: 0,
  crouch: 0,
  stepZ: 0,
  headPitch: 0,
  headYaw: 0,
  armLPitch: 0,
  armLRoll: 0.08,
  armRPitch: 0,
  armRRoll: -0.08,
  legL: 0,
  legR: 0,
  weapon: 1.45,
  off: 0,
  draw: 0,
  loaded: 0,
  straddle: 0,
};

const CLIP_SECONDS: Record<UnitTypeCode, Record<string, number>> = {
  swordsman: { draw: 0.7, swing: 0.8, block: 0.9, strike: 0.65 },
  spearman: { guard: 0.9, thrust: 0.5, retract: 0.55, formation: 1.5 },
  archer: { nock: 0.9, raise: 0.6, aim: 1.1, shoot: 0.3, lower: 0.7 },
  crossbowman: { span: 1.3, load: 0.9, aim: 0.9, shoot: 0.3, reload: 1.0 },
};

const EVENTS: Record<UnitTypeCode, readonly DrillEvent[]> = {
  swordsman: [
    { clip: 'swing', at: 0.45, kind: 'swing' },
    { clip: 'swing', at: 0.66, kind: 'hit' },
    { clip: 'strike', at: 0.5, kind: 'hit' },
  ],
  spearman: [
    { clip: 'thrust', at: 0.6, kind: 'hit' },
    { clip: 'formation', at: 0.5, kind: 'stomp' },
  ],
  archer: [{ clip: 'shoot', at: 0.02, kind: 'shoot' }],
  crossbowman: [
    { clip: 'span', at: 0.92, kind: 'clack' },
    { clip: 'shoot', at: 0.02, kind: 'shoot' },
  ],
};

/** The drill cycle of a class (order = shared catalogue's drills). */
export function drillCycle(type: UnitTypeCode): DrillClip[] {
  return getUnitType(type).drills.map((name) => ({ name, seconds: CLIP_SECONDS[type][name] ?? 0.8 }));
}

export function cycleSeconds(type: UnitTypeCode): number {
  return drillCycle(type).reduce((a, c) => a + c.seconds, 0);
}

export function drillEvents(type: UnitTypeCode): readonly DrillEvent[] {
  return EVENTS[type];
}

/** Which clip plays at time t (seconds) and the phase inside it. */
export function clipAt(type: UnitTypeCode, t: number): { index: number; clip: DrillClip; phase: number; local: number } {
  const cycle = drillCycle(type);
  const total = cycle.reduce((a, c) => a + c.seconds, 0);
  let x = ((t % total) + total) % total;
  for (const [index, clip] of cycle.entries()) {
    if (x < clip.seconds) return { index, clip, phase: x / clip.seconds, local: x };
    x -= clip.seconds;
  }
  const last = cycle.length - 1;
  return { index: last, clip: cycle[last], phase: 1, local: cycle[last].seconds };
}

/** Events whose time falls in (t0, t1] — used to trigger hits, arrows and sounds. */
export function eventsBetween(type: UnitTypeCode, t0: number, t1: number): DrillEvent[] {
  if (t1 <= t0) return [];
  const cycle = drillCycle(type);
  const total = cycle.reduce((a, c) => a + c.seconds, 0);
  const starts = new Map<string, number>();
  let acc = 0;
  for (const c of cycle) {
    starts.set(c.name, acc);
    acc += c.seconds;
  }
  const out: DrillEvent[] = [];
  const span = Math.min(t1 - t0, total); // never fire a whole cycle's events twice per frame
  const from = t1 - span;
  for (const e of EVENTS[type]) {
    const at = (starts.get(e.clip) ?? 0) + e.at * (CLIP_SECONDS[type][e.clip] ?? 0.8);
    // First occurrence at + k·total strictly after `from`; it fires if it is not after t1.
    const k = Math.floor((from - at) / total) + 1;
    if (at + k * total <= t1 && at + k * total > from) out.push(e);
  }
  return out;
}

// ── Clip poses ───────────────────────────────────────────────────────────────
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** 0→1→0 bump */
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
const seg = (t: number, a: number, b: number) => ease(clamp01((t - a) / (b - a)));

function pose(over: Partial<SoldierPose>): SoldierPose {
  return { ...NEUTRAL, ...over };
}

/** Guard stances each class returns to. */
const SWORD_GUARD = pose({ armRPitch: -1.0, armRRoll: -0.15, weapon: -0.9, armLPitch: -0.65, armLRoll: 0.25, off: 0, legL: -0.18, legR: 0.18 });
const SPEAR_GUARD = pose({ armRPitch: -0.55, armLPitch: -0.95, armLRoll: 0.35, weapon: -0.1, crouch: 0.1, legL: -0.3, legR: 0.25, twist: 0.12 });
const BOW_LOW = pose({ armLPitch: -0.45, armLRoll: 0.1, off: 0.5, armRPitch: -0.1 });
const BOW_AIM = pose({ armLPitch: -1.52, armLRoll: 0.05, off: -1.5, armRPitch: -1.45, armRRoll: 0.18, twist: 0.35, headYaw: -0.3, loaded: 1 });
const XBOW_AIM = pose({ armRPitch: -1.3, armRRoll: 0.18, armLPitch: -1.35, armLRoll: 0.3, weapon: 0, headPitch: 0.15, twist: 0.1, loaded: 1 });

function blend(a: SoldierPose, b: SoldierPose, t: number): SoldierPose {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof SoldierPose)[]) out[k] = lerp(a[k], b[k], t);
  return out;
}

/** The pose of one clip at phase p (0..1). */
export function clipPose(type: UnitTypeCode, clip: string, p: number): SoldierPose {
  switch (type) {
    case 'swordsman': {
      if (clip === 'draw') {
        // From the scabbard at the left hip to the guard.
        const sheathed = pose({ armRPitch: -0.35, armRRoll: 0.45, weapon: 1.4, armLPitch: -0.2 });
        return blend(sheathed, SWORD_GUARD, seg(p, 0.1, 0.9));
      }
      if (clip === 'swing') {
        // Wind-up overhead, then a fast diagonal cut onto the dummy.
        const up = pose({ ...SWORD_GUARD, armRPitch: -2.75, weapon: -2.5, lean: -0.08, twist: -0.2 });
        const down = pose({ ...SWORD_GUARD, armRPitch: -0.55, weapon: 0.2, lean: 0.18, twist: 0.25, stepZ: 0.18, legL: -0.4, legR: 0.3 });
        if (p < 0.45) return blend(SWORD_GUARD, up, seg(p, 0, 0.45));
        return blend(blend(up, down, seg(p, 0.45, 0.7)), SWORD_GUARD, seg(p, 0.8, 1));
      }
      if (clip === 'block') {
        // Shield up in front of the face, crouched, sword drawn back.
        const b = pose({ ...SWORD_GUARD, armLPitch: -1.9, armLRoll: -0.25, armRPitch: -0.6, weapon: -1.2, crouch: 0.12, headPitch: 0.12 });
        return blend(SWORD_GUARD, b, Math.min(1, bump(p, 0, 1) * 1.6));
      }
      // strike: straight thrust with a lunge.
      const lunge = pose({ ...SWORD_GUARD, armRPitch: -1.55, weapon: 0, stepZ: 0.4, lean: 0.22, legL: -0.55, legR: 0.4 });
      return blend(SWORD_GUARD, lunge, bump(p, 0.05, 0.95) ** 0.7);
    }
    case 'spearman': {
      if (clip === 'guard') return blend(SPEAR_GUARD, pose({ ...SPEAR_GUARD, crouch: 0.16 }), bump(p, 0, 1) * 0.6);
      const extended = pose({ ...SPEAR_GUARD, armRPitch: -1.35, armLPitch: -1.55, weapon: 0, stepZ: 0.5, lean: 0.28, legL: -0.6, legR: 0.4 });
      if (clip === 'thrust') return blend(SPEAR_GUARD, extended, seg(p, 0, 0.6));
      if (clip === 'retract') return blend(extended, SPEAR_GUARD, seg(p, 0, 1));
      // formation: spear upright, stomp in place, then level the spear again.
      const upright = pose({ armRPitch: -0.5, armLPitch: -0.3, weapon: -1.5, legL: -bump(p, 0.25, 0.5) * 0.6 });
      if (p < 0.2) return blend(SPEAR_GUARD, upright, seg(p, 0, 0.2));
      if (p < 0.75) return upright;
      return blend(upright, SPEAR_GUARD, seg(p, 0.75, 1));
    }
    case 'archer': {
      if (clip === 'nock') {
        // Reach back to the quiver, bring the arrow to the bow.
        const reach = pose({ ...BOW_LOW, armRPitch: 0.9, armRRoll: -0.4, headYaw: 0.3 });
        const nocked = pose({ ...BOW_LOW, armRPitch: -0.5, armRRoll: 0.2, loaded: 1 });
        return p < 0.5 ? blend(BOW_LOW, reach, seg(p, 0, 0.5)) : blend({ ...reach, loaded: 1 }, nocked, seg(p, 0.5, 1));
      }
      if (clip === 'raise') return blend(pose({ ...BOW_LOW, armRPitch: -0.5, armRRoll: 0.2, loaded: 1 }), BOW_AIM, seg(p, 0, 1));
      if (clip === 'aim') return { ...BOW_AIM, draw: seg(p, 0, 0.7), headPitch: 0.05 };
      if (clip === 'shoot') {
        // Release: string snaps forward, the hand flicks back.
        const release = pose({ ...BOW_AIM, draw: 0, loaded: 0, armRPitch: -1.25, armRRoll: 0.45 });
        return blend({ ...BOW_AIM, draw: 1, loaded: 0 }, release, seg(p, 0, 0.5));
      }
      return blend(pose({ ...BOW_AIM, loaded: 0, armRPitch: -1.25, armRRoll: 0.45 }), BOW_LOW, seg(p, 0, 1));
    }
    case 'crossbowman': {
      const low = pose({ armRPitch: -0.5, armLPitch: -0.6, armLRoll: 0.35, weapon: 0.6 });
      if (clip === 'span') {
        // Foot in the stirrup, bow pointing down, pull the string up to the latch.
        const down = pose({ crouch: 0.32, lean: 0.38, armRPitch: 0.1, armLPitch: -0.25, armLRoll: 0.3, weapon: 1.25, legL: -0.5, headPitch: 0.3 });
        const pulled = pose({ ...down, armRPitch: -0.75, crouch: 0.22 });
        return p < 0.3 ? blend(low, down, seg(p, 0, 0.3)) : blend(down, pulled, seg(p, 0.3, 0.92));
      }
      if (clip === 'load') {
        const pulled = pose({ crouch: 0.22, lean: 0.38, armRPitch: -0.75, armLPitch: -0.25, armLRoll: 0.3, weapon: 1.25, legL: -0.5, headPitch: 0.3 });
        const loaded = pose({ ...low, armLPitch: -0.9, loaded: seg(p, 0.5, 0.6), headPitch: 0.25 });
        return blend(pulled, loaded, seg(p, 0, 0.8));
      }
      if (clip === 'aim') return blend(pose({ ...low, loaded: 1 }), XBOW_AIM, seg(p, 0, 0.7));
      if (clip === 'shoot') {
        const kick = pose({ ...XBOW_AIM, loaded: 0, lean: -0.12, weapon: -0.22 });
        return blend({ ...XBOW_AIM, loaded: 0 }, kick, bump(p, 0, 1));
      }
      return blend(pose({ ...XBOW_AIM, loaded: 0 }), low, seg(p, 0, 1));
    }
  }
}

/** Drill pose at time t with a cross-fade from the previous clip's end. */
export function drillPose(type: UnitTypeCode, t: number): { pose: SoldierPose; clip: string } {
  const cur = clipAt(type, t);
  const target = clipPose(type, cur.clip.name, cur.phase);
  if (cur.local >= CROSSFADE_SECONDS) return { pose: target, clip: cur.clip.name };
  const cycle = drillCycle(type);
  const prev = cycle[(cur.index - 1 + cycle.length) % cycle.length];
  const w = ease(cur.local / CROSSFADE_SECONDS);
  return { pose: blend(clipPose(type, prev.name, 1), target, w), clip: cur.clip.name };
}

/** Standing at attention (parade) / at ease, with breathing. Weapon held per class. */
export function idlePose(type: UnitTypeCode, t: number): SoldierPose {
  const breathe = Math.sin(t * 1.7) * 0.02;
  const base = pose({ lean: breathe, headPitch: Math.sin(t * 0.6) * 0.04, headYaw: Math.sin(t * 0.37) * 0.12 });
  switch (type) {
    case 'swordsman':
      return { ...base, armRPitch: -0.25, weapon: -1.3, armLPitch: -0.35, armLRoll: 0.2, off: 0 };
    case 'spearman':
      // Spear grounded and upright at the right side.
      return { ...base, armRPitch: -0.45, armRRoll: -0.1, weapon: -1.52 };
    case 'archer':
      return { ...base, armLPitch: -0.2, off: 0.9 };
    case 'crossbowman':
      return { ...base, armRPitch: -0.55, armLPitch: -0.6, armLRoll: 0.35, weapon: -1.1 };
  }
}

/** Height of the rider's hips above the saddle seat socket (rider-local metres). */
export const RIDER_SEAT_OFFSET = 0.12;

/**
 * Riding pose (Phase 9): sitting astride (thighs forward, legs spread round the horse), reins in
 * one hand, the weapon held high / outside the horse so it never cuts through its body; the
 * torso bobs with the horse's gait. `gait` = the horse's step frequency.
 */
export function ridingPose(type: UnitTypeCode, t: number, gait = 6): SoldierPose {
  const bob = Math.sin(t * gait * 1.3);
  const base = pose({
    lean: 0.12 + bob * 0.04,
    headPitch: -0.05 - bob * 0.03,
    legL: -1.15,
    legR: -1.15,
    straddle: 0.6,
    armLPitch: -0.95,
    armLRoll: 0.15,
    armRPitch: -0.95,
    armRRoll: -0.15,
  });
  switch (type) {
    case 'spearman':
      // Lance raised and pointing forward-up over the horse's head.
      return { ...base, armRPitch: -2.2, armRRoll: 0.35, weapon: -0.55 };
    case 'swordsman':
      // Sabre up, shield on the left arm clear of the horse's neck.
      return { ...base, armRPitch: -2.4, armRRoll: 0.3, weapon: -1.35, armLPitch: -0.95, armLRoll: -1.0, off: 0 };
    case 'archer':
      // Bow upright in the left hand, right hand on the reins.
      return { ...base, armLPitch: -1.75, armLRoll: -0.9, off: -1.5, armRPitch: -0.9, loaded: 0 };
    default:
      return base;
  }
}

/** Which held items a class shows (only when actually equipped). */
export function heldItems(type: UnitTypeCode): { main: 'saber' | 'spear' | 'crossbow' | null; off: 'shield' | 'bow' | null; quiver: 'arrows' | 'bolts' | null } {
  switch (type) {
    case 'swordsman':
      return { main: 'saber', off: 'shield', quiver: null };
    case 'spearman':
      return { main: 'spear', off: null, quiver: null };
    case 'archer':
      return { main: null, off: 'bow', quiver: 'arrows' };
    case 'crossbowman':
      return { main: 'crossbow', off: null, quiver: 'bolts' };
  }
}

/** Stable per-soldier phase offset (seconds) from its id. */
export function phaseOffset(id: string, type: UnitTypeCode): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000 * cycleSeconds(type);
}
