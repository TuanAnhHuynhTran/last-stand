/**
 * Server events → animation timeline (pure). The server has already resolved everything
 * (hits, damage, knock-outs, AI moves); the client only shows it, in order, then snaps to the
 * server's final state — animations can never disagree with the result.
 *
 * Rules:
 *  - events play one after another; strikes of the same area skill (volley, acid, slam) hit
 *    together; a shield-wall counter / brace reaction follows the blow that caused it
 *  - ranged attacks spawn a projectile; the impact (hit / dodge clip, damage number, HP bar)
 *    happens when it lands; melee impacts land mid-swing
 *  - turn changes and the battle result show a short banner
 */
import { BATTLE_SKILLS, type BattleEvent, type BattleSkillCode, type BattleState, type BattleStatusCode, type AxialCoord } from '@cityverse/shared';

export type Cue =
  | { type: 'banner'; start: number; duration: number; text: string; tone: 'player' | 'enemy' | 'victory' | 'defeat' }
  | { type: 'move'; start: number; duration: number; unitId: string; path: AxialCoord[] }
  | { type: 'attack'; start: number; duration: number; unitId: string; targetId: string; skill: BattleSkillCode | null; ranged: boolean; impact: number }
  | { type: 'projectile'; start: number; duration: number; unitId: string; targetId: string; kind: 'arrow' | 'bolt' | 'acid' | 'shell' }
  | { type: 'impact'; start: number; duration: number; unitId: string; by: string; hit: boolean; crit: boolean; blocked: boolean; damage: number; ko: boolean; poison: boolean }
  | { type: 'skill'; start: number; duration: number; unitId: string; skill: BattleSkillCode; at: AxialCoord | null; cinematic: boolean }
  | { type: 'status'; start: number; duration: number; unitId: string; status: BattleStatusCode }
  | { type: 'heal'; start: number; duration: number; unitId: string; amount: number }
  | { type: 'pose'; start: number; duration: number; unitId: string; clip: 'defend' | 'reload' | 'stunned' | 'cheer' }
  | { type: 'free'; start: number; duration: number; unitId: string; captiveId: string }
  | { type: 'outcome'; start: number; duration: number; result: 'victory' | 'defeat' };

export const STEP_SECONDS = 0.26;
const MELEE = 0.75;
const RANGED_DRAW = 0.45;

/** Units whose attacks fly (decided from the state before the action). */
function rangedUnits(s: BattleState): Map<string, 'arrow' | 'bolt' | 'acid' | 'shell'> {
  const m = new Map<string, 'arrow' | 'bolt' | 'acid' | 'shell'>();
  for (const u of s.units) {
    if (u.minRange < 2) continue;
    m.set(u.id, u.kind === 'crossbowman' ? 'bolt' : u.kind === 'spitter' ? 'acid' : u.kind === 'robot' ? 'shell' : 'arrow');
  }
  return m;
}

export function planTimeline(events: readonly BattleEvent[], before: BattleState): { cues: Cue[]; total: number } {
  const cues: Cue[] = [];
  const ranged = rangedUnits(before);
  const pos = new Map(before.units.map((u) => [u.id, { q: u.q, r: u.r }]));
  let t = 0;
  let groupStart: number | null = null; // strikes of one area skill
  let groupEnd = 0;
  const dist = (a: AxialCoord | undefined, b: AxialCoord | undefined) =>
    a && b ? (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2 : 1;

  for (const e of events) {
    // Anything that is not part of an area strike waits for the strikes to finish.
    if (e.type !== 'attack' && e.type !== 'status') flushGroup();
    switch (e.type) {
      case 'turn':
        cues.push({ type: 'banner', start: t, duration: 1.1, text: e.side === 'player' ? `Lượt ${e.turn} — Quân ta` : `Lượt ${e.turn} — Kẻ địch`, tone: e.side });
        t += 0.9;
        break;
      case 'start':
        break;
      case 'deploy':
        cues.push({ type: 'move', start: t, duration: 0.3, unitId: e.unitId, path: [pos.get(e.unitId)!, e.to] });
        pos.set(e.unitId, e.to);
        t += 0.3;
        break;
      case 'move': {
        const d = STEP_SECONDS * Math.max(1, e.path.length - 1);
        cues.push({ type: 'move', start: t, duration: d, unitId: e.unitId, path: e.path });
        pos.set(e.unitId, e.path[e.path.length - 1]);
        t += d;
        break;
      }
      case 'skill': {
        const sk = BATTLE_SKILLS[e.skill];
        cues.push({ type: 'skill', start: t, duration: 0.8, unitId: e.unitId, skill: e.skill, at: e.at, cinematic: sk.cinematic });
        t += sk.target === 'self' && e.skill !== 'ground_slam' ? 0.6 : 0.35;
        groupStart = sk.target === 'area' || e.skill === 'ground_slam' ? t : null;
        groupEnd = t;
        break;
      }
      case 'attack': {
        const start = groupStart ?? t;
        const flying = ranged.get(e.unitId);
        const isRanged = Boolean(flying) && dist(pos.get(e.unitId), pos.get(e.targetId)) > 1;
        const flight = isRanged ? 0.18 + 0.07 * dist(pos.get(e.unitId), pos.get(e.targetId)) : 0;
        const impact = start + (isRanged ? RANGED_DRAW + flight : MELEE * 0.55);
        const duration = isRanged ? RANGED_DRAW + flight + 0.25 : MELEE;
        cues.push({ type: 'attack', start, duration, unitId: e.unitId, targetId: e.targetId, skill: e.skill, ranged: isRanged, impact });
        if (isRanged) cues.push({ type: 'projectile', start: start + RANGED_DRAW, duration: flight, unitId: e.unitId, targetId: e.targetId, kind: flying! });
        cues.push({ type: 'impact', start: impact, duration: 0.6, unitId: e.targetId, by: e.unitId, hit: e.hit, crit: e.crit, blocked: e.blocked, damage: e.damage, ko: e.ko, poison: false });
        const end = Math.max(start + duration, impact + (e.ko ? 0.7 : 0.35));
        if (groupStart !== null) groupEnd = Math.max(groupEnd, end);
        else t = end;
        break;
      }
      case 'poison':
        flushGroup();
        cues.push({ type: 'impact', start: t, duration: 0.6, unitId: e.unitId, by: e.unitId, hit: true, crit: false, blocked: false, damage: e.damage, ko: e.ko, poison: true });
        t += e.ko ? 0.9 : 0.45;
        break;
      case 'status':
        cues.push({ type: 'status', start: groupStart !== null ? groupEnd : t, duration: 0.7, unitId: e.unitId, status: e.status });
        if (groupStart === null) t += 0.2;
        break;
      case 'heal':
        flushGroup();
        cues.push({ type: 'heal', start: t, duration: 0.9, unitId: e.unitId, amount: e.amount });
        t += 0.8;
        break;
      case 'defend':
        flushGroup();
        cues.push({ type: 'pose', start: t, duration: 0.6, unitId: e.unitId, clip: 'defend' });
        t += 0.45;
        break;
      case 'reload':
        flushGroup();
        cues.push({ type: 'pose', start: t, duration: 0.9, unitId: e.unitId, clip: 'reload' });
        t += 0.8;
        break;
      case 'stunned':
        cues.push({ type: 'pose', start: t, duration: 0.6, unitId: e.unitId, clip: 'stunned' });
        t += 0.3;
        break;
      case 'free':
        flushGroup();
        cues.push({ type: 'free', start: t, duration: 1.0, unitId: e.unitId, captiveId: e.captiveId });
        t += 0.9;
        break;
      case 'outcome':
        flushGroup();
        cues.push({ type: 'outcome', start: t, duration: 2.2, result: e.result });
        cues.push({ type: 'banner', start: t, duration: 2.2, text: e.result === 'victory' ? '🏆 Chiến thắng!' : '💀 Thất bại', tone: e.result });
        t += 1.2;
        break;
    }
  }
  flushGroup();
  const total = cues.reduce((m, c) => Math.max(m, c.start + c.duration), t);
  return { cues, total };

  function flushGroup(): void {
    if (groupStart !== null) {
      t = Math.max(t, groupEnd);
      groupStart = null;
    }
  }
}
