/**
 * Combat clips (pure). Humanoids (soldiers, bandits, zombies, robots, captives) reuse the
 * Phase 8 chibi rig and its class drills, so each class fights its own way:
 *   swordsman  sabre swing (shield up when defending)     spearman  thrust
 *   archer     draw → loose (arrow flies on the cue)       crossbow  aim → shoot, reload = span + load
 * Clips: idle, walk, run, attack, hit, dodge, defend, knockout, victory (+ reload, stunned, cheer).
 * Creatures (wolf, spitter, behemoth) use a whole-body pose (bob, lean, lunge, squash, fall).
 */
import { clipPose, idlePose, type SoldierPose } from '../military/soldierAnimation';

export type CombatClip = 'idle' | 'walk' | 'run' | 'attack' | 'hit' | 'dodge' | 'defend' | 'knockout' | 'victory' | 'reload' | 'stunned' | 'cheer';
export const COMBAT_CLIPS: readonly CombatClip[] = ['idle', 'walk', 'run', 'attack', 'hit', 'dodge', 'defend', 'knockout', 'victory', 'reload', 'stunned', 'cheer'];

/** Weapon style of a humanoid on the battlefield. */
export type FightStyle = 'swordsman' | 'spearman' | 'archer' | 'crossbowman' | 'zombie' | 'captive';

export function styleOf(kind: string): FightStyle {
  switch (kind) {
    case 'swordsman':
    case 'bandit':
      return 'swordsman';
    case 'spearman':
      return 'spearman';
    case 'archer':
    case 'bandit_archer':
      return 'archer';
    case 'crossbowman':
    case 'robot':
      return 'crossbowman';
    case 'zombie':
      return 'zombie';
    default:
      return 'captive';
  }
}

export const isCreature = (kind: string): boolean => kind === 'wolf' || kind === 'spitter' || kind === 'behemoth';

export interface HumanoidFrame {
  pose: SoldierPose;
  /** Root: vertical bounce and knock-out fall (0 standing … 1 lying on the back) */
  lift: number;
  fall: number;
}

const bump = (p: number) => Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);
const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));

function base(style: FightStyle, t: number): SoldierPose {
  if (style === 'zombie') return { ...idlePose('swordsman', t), armLPitch: -1.35, armRPitch: -1.3, armLRoll: 0.1, armRRoll: -0.1, lean: 0.12 + Math.sin(t * 1.3) * 0.05, headYaw: Math.sin(t * 0.9) * 0.3, weapon: 1.4 };
  if (style === 'captive') return { ...idlePose('swordsman', t), armLPitch: 0.45, armRPitch: 0.45, armLRoll: -0.25, armRRoll: 0.25, lean: 0.08, headPitch: 0.25 };
  return idlePose(style, t);
}

/** Humanoid pose of a clip at local time t, phase p (0..1). */
export function humanoidFrame(style: FightStyle, clip: CombatClip, t: number, p: number): HumanoidFrame {
  const b = base(style, t);
  switch (clip) {
    case 'walk':
    case 'run': {
      const w = clip === 'run' ? 13 : 9;
      const a = clip === 'run' ? 0.85 : 0.55;
      const sw = Math.sin(t * w);
      return {
        pose: { ...b, legL: sw * a, legR: -sw * a, armLPitch: style === 'zombie' ? b.armLPitch : -sw * a * 0.7 + (style === 'archer' ? -0.3 : 0), armRPitch: style === 'zombie' ? b.armRPitch : sw * a * 0.6 + b.armRPitch * 0.5, lean: clip === 'run' ? 0.2 : 0.06 },
        lift: Math.abs(Math.cos(t * w)) * (clip === 'run' ? 0.14 : 0.06),
        fall: 0,
      };
    }
    case 'attack': {
      let pose: SoldierPose;
      if (style === 'swordsman') pose = clipPose('swordsman', 'swing', p);
      else if (style === 'spearman') pose = p < 0.55 ? clipPose('spearman', 'thrust', p / 0.55) : clipPose('spearman', 'retract', (p - 0.55) / 0.45);
      else if (style === 'archer') pose = p < 0.55 ? clipPose('archer', 'aim', p / 0.55) : clipPose('archer', 'shoot', (p - 0.55) / 0.45);
      else if (style === 'crossbowman') pose = p < 0.55 ? clipPose('crossbowman', 'aim', p / 0.55) : clipPose('crossbowman', 'shoot', (p - 0.55) / 0.45);
      else pose = { ...b, armLPitch: -1.6 - bump(p) * 0.4, armRPitch: -1.6 - bump(p) * 0.4, stepZ: bump(p) * 0.45, lean: 0.15 + bump(p) * 0.25 }; // zombie lunge / bite
      return { pose, lift: 0, fall: 0 };
    }
    case 'hit':
      return { pose: { ...b, lean: -0.35 * bump(p), headPitch: -0.3 * bump(p), armLRoll: b.armLRoll + 0.6 * bump(p), armRRoll: b.armRRoll - 0.6 * bump(p), stepZ: -0.2 * bump(p) }, lift: 0, fall: 0 };
    case 'dodge':
      return { pose: { ...b, stepZ: -0.35 * bump(p), twist: 0.75 * bump(p), crouch: 0.18 * bump(p), lean: -0.1 * bump(p) }, lift: 0.05 * bump(p), fall: 0 };
    case 'defend':
      if (style === 'swordsman') return { pose: clipPose('swordsman', 'block', 0.5), lift: 0, fall: 0 };
      return { pose: { ...b, crouch: 0.15, armLPitch: -1.25, armRPitch: -1.1, armLRoll: -0.2, armRRoll: 0.2, headPitch: 0.15 }, lift: 0, fall: 0 };
    case 'knockout':
      return { pose: { ...b, armLPitch: -0.3, armLRoll: 1.1, armRPitch: -0.3, armRRoll: -1.1, legL: -0.15, legR: 0.15, headYaw: 0.5, lean: 0, crouch: 0 }, lift: 0, fall: Math.min(1, p * 1.8) };
    case 'victory': {
      const j = Math.abs(Math.sin(t * 6));
      return { pose: { ...b, armLPitch: -2.9, armRPitch: -2.7, armLRoll: -0.3, armRRoll: 0.3, headPitch: -0.25 }, lift: j * 0.35, fall: 0 };
    }
    case 'cheer': {
      const j = Math.abs(Math.sin(t * 7));
      return { pose: { ...b, armLPitch: -2.8, armRPitch: -2.8, headPitch: -0.2 }, lift: j * 0.4, fall: 0 };
    }
    case 'reload':
      return { pose: p < 0.6 ? clipPose('crossbowman', 'span', p / 0.6) : clipPose('crossbowman', 'load', (p - 0.6) / 0.4), lift: 0, fall: 0 };
    case 'stunned':
      return { pose: { ...b, headYaw: Math.sin(t * 9) * 0.4, lean: 0.12, armLPitch: 0.1, armRPitch: 0.1 }, lift: 0, fall: 0 };
    default:
      return { pose: b, lift: Math.sin(t * 1.7) * 0.01, fall: 0 };
  }
}

export interface CreatureFrame {
  bob: number;
  lean: number;
  lunge: number;
  squash: number;
  wobble: number;
  fall: number;
}

/** Whole-body creature pose (wolf pounce, spitter heave, behemoth slam). */
export function creatureFrame(kind: string, clip: CombatClip, t: number, p: number): CreatureFrame {
  const f: CreatureFrame = { bob: Math.sin(t * 2.2) * 0.04, lean: 0, lunge: 0, squash: 1 + Math.sin(t * 2.2) * 0.02, wobble: 0, fall: 0 };
  const heavy = kind === 'behemoth';
  switch (clip) {
    case 'walk':
    case 'run': {
      const w = kind === 'wolf' ? 14 : heavy ? 5 : 8;
      f.bob = Math.abs(Math.sin(t * w)) * (kind === 'wolf' ? 0.25 : 0.15);
      f.wobble = Math.sin(t * w) * 0.08;
      f.lean = kind === 'wolf' ? 0.12 : 0.05;
      return f;
    }
    case 'attack':
      if (kind === 'spitter') {
        f.squash = 1 - 0.25 * bump(seg(p, 0, 0.5)) + 0.2 * bump(seg(p, 0.5, 0.8));
        f.lean = -0.25 * bump(seg(p, 0, 0.5)) + 0.35 * bump(seg(p, 0.5, 0.9));
      } else {
        f.lunge = bump(p) * (kind === 'wolf' ? 1.1 : 0.6);
        f.lean = 0.3 * bump(p);
        f.bob = (kind === 'wolf' ? 0.5 : 0.2) * bump(p);
        if (heavy) f.squash = 1 + 0.15 * bump(seg(p, 0, 0.5)) - 0.2 * bump(seg(p, 0.5, 1));
      }
      return f;
    case 'hit':
      f.lean = -0.3 * bump(p);
      f.squash = 1 - 0.12 * bump(p);
      return f;
    case 'dodge':
      f.lunge = -0.5 * bump(p);
      f.wobble = 0.4 * bump(p);
      return f;
    case 'defend':
      f.squash = 0.85;
      f.lean = -0.1;
      return f;
    case 'knockout':
      f.fall = Math.min(1, p * 1.8);
      f.squash = 1 - 0.2 * f.fall;
      return f;
    case 'victory':
      f.bob = Math.abs(Math.sin(t * 5)) * 0.4;
      return f;
    case 'stunned':
      f.wobble = Math.sin(t * 9) * 0.3;
      return f;
    default:
      return f;
  }
}
