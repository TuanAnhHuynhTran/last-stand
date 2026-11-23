/**
 * PvP perspective (Phase 12). The server stores a duel from the host's side ('player' =
 * host, 'enemy' = guest). For the guest the client mirrors the view so the existing battle
 * UI, input and renderer work unchanged: their soldiers become 'player', the host's 'enemy',
 * bandages and the active side swap, and the outcome is read from the guest's point of view.
 * Actions refer to unit ids / hexes only, so intents sent from a mirrored view stay valid.
 */
import type { BattleEvent, BattleOutcome, BattleState, PvpBattleDTO } from '@cityverse/shared';

type Side = 'player' | 'enemy';
const flip = (s: Side): Side => (s === 'player' ? 'enemy' : 'player');

function flipOutcome(o: BattleOutcome | null | undefined): BattleOutcome | null {
  if (!o) return null;
  const winner = o.winner === undefined || o.winner === null ? o.winner ?? null : flip(o.winner);
  return { ...o, winner, result: winner === 'player' ? 'victory' : 'defeat' };
}

export function mirrorState(s: BattleState): BattleState {
  return {
    ...s,
    units: s.units.map((u) => ({ ...u, side: flip(u.side as Side) })),
    items: s.itemsB ?? s.items,
    itemsB: s.items,
    activeSide: s.activeSide ? flip(s.activeSide) : s.activeSide,
    outcome: flipOutcome(s.outcome),
  };
}

export function mirrorEvents(events: readonly BattleEvent[], s: BattleState): BattleEvent[] {
  return events.map((e) => {
    if (e.type === 'turn') return { ...e, side: flip(e.side) };
    if (e.type === 'outcome') {
      const o = flipOutcome(s.outcome);
      return { ...e, result: o?.result ?? (e.result === 'victory' ? 'defeat' : 'victory') };
    }
    return e;
  });
}

/** The DTO as seen by this player (no change for the host). */
export function viewFor(dto: PvpBattleDTO): PvpBattleDTO {
  if (dto.mySide === 'player') return dto;
  const state = mirrorState(dto.state);
  const phase = dto.phase === 'victory' || dto.phase === 'defeat' ? (state.outcome?.result ?? dto.phase) : dto.phase;
  return { ...dto, state, phase, events: mirrorEvents(dto.events, dto.state) };
}

/** Is it this player's turn (in their own view)? */
export function isMyTurn(view: { state: BattleState; phase: string }): boolean {
  return view.phase === 'player' && !view.state.outcome && (view.state.activeSide ?? 'player') === 'player';
}
