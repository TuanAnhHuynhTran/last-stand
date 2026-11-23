import { create } from 'zustand';
import type { AxialCoord, BattleAction, BattleDTO, BattleSkillCode, BattleState } from '@cityverse/shared';

export type BattleMode = { kind: 'move' } | { kind: 'skill'; skill: BattleSkillCode } | { kind: 'item' } | { kind: 'interact' };

interface BattleStore {
  /** Last server DTO (authoritative) */
  battle: BattleDTO | null;
  /** State the HUD shows — updated when the animation of the last action ends */
  shown: BattleState | null;
  playing: boolean;
  selectedId: string | null;
  mode: BattleMode;
  hover: AxialCoord | null;
  banner: { text: string; tone: string; id: number } | null;
  log: string[];
  /** Action whose response was lost (re-sent with the same id) */
  pending: { clientActionId: string; version: number; action: BattleAction } | null;
  error: string | null;
  setBattle: (b: BattleDTO) => void;
  setShown: (s: BattleState) => void;
  setPlaying: (p: boolean) => void;
  select: (id: string | null) => void;
  setMode: (m: BattleMode) => void;
  setHover: (h: AxialCoord | null) => void;
  showBanner: (text: string, tone: string) => void;
  addLog: (lines: string[]) => void;
  setPending: (p: BattleStore['pending']) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

const initial = { battle: null, shown: null, playing: false, selectedId: null, mode: { kind: 'move' } as BattleMode, hover: null, banner: null, log: [], pending: null, error: null };

export const useBattleStore = create<BattleStore>((set, get) => ({
  ...initial,
  setBattle: (battle) => set({ battle }),
  setShown: (shown) => set({ shown }),
  setPlaying: (playing) => set({ playing }),
  select: (selectedId) => set({ selectedId, mode: { kind: 'move' } }),
  setMode: (mode) => set({ mode }),
  setHover: (hover) => {
    const h = get().hover;
    if (h?.q !== hover?.q || h?.r !== hover?.r) set({ hover });
  },
  showBanner: (text, tone) => {
    const id = Date.now() + Math.random();
    set({ banner: { text, tone, id } });
    setTimeout(() => {
      if (get().banner?.id === id) set({ banner: null });
    }, 1800);
  },
  addLog: (lines) => set({ log: [...lines.reverse(), ...get().log].slice(0, 40) }),
  setPending: (pending) => set({ pending }),
  setError: (error) => set({ error }),
  reset: () => set({ ...initial }),
}));
