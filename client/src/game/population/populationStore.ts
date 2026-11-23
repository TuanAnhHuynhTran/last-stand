import { create } from 'zustand';
import { gameClock, type GameClock, type PopulationStateDTO, type WorkplaceKind } from '@cityverse/shared';

export interface PopulationHandlers {
  assign: (survivorId: string, kind: WorkplaceKind, workplaceId: string) => void;
  unassign: (survivorId: string) => void;
  autoAssign: () => void;
  moveHome: (survivorId: string, buildingId: string) => void;
  setRecipe: (buildingId: string, recipe: string) => void;
  collect: (buildingId: string) => void;
  settings: (patch: { autoAssign?: boolean; naturalGrowth?: boolean; daySeconds?: number }) => void;
  rescue: () => void;
}

interface PopulationStore {
  state: PopulationStateDTO | null;
  serverOffsetMs: number;
  busy: boolean;
  handlers: PopulationHandlers | null;
  /** Villagers the client could not route to their workplace (survivor id → reason) */
  unreachable: Record<string, string>;
  selectedSurvivorId: string | null;
  apply: (s: PopulationStateDTO) => void;
  setBusy: (b: boolean) => void;
  setHandlers: (h: PopulationHandlers | null) => void;
  setUnreachable: (u: Record<string, string>) => void;
  selectSurvivor: (id: string | null) => void;
  reset: () => void;
}

const initial = { state: null, serverOffsetMs: 0, busy: false, handlers: null, unreachable: {}, selectedSurvivorId: null };

export const usePopulationStore = create<PopulationStore>((set, get) => ({
  ...initial,
  apply: (state) => set({ state, serverOffsetMs: new Date(state.serverTime).getTime() - Date.now() }),
  setBusy: (busy) => set({ busy }),
  setHandlers: (handlers) => set({ handlers }),
  setUnreachable: (unreachable) => {
    const prev = get().unreachable;
    const same = Object.keys(prev).length === Object.keys(unreachable).length && Object.entries(unreachable).every(([k, v]) => prev[k] === v);
    if (!same) set({ unreachable });
  },
  selectSurvivor: (selectedSurvivorId) => set({ selectedSurvivorId }),
  reset: () => set({ ...initial }),
}));

/** The city's game clock now (server time). */
export function currentClock(state: PopulationStateDTO | null, offsetMs: number, nowMs = Date.now()): GameClock | null {
  if (!state) return null;
  return gameClock(new Date(state.clock.epoch).getTime(), state.clock.daySeconds, nowMs + offsetMs);
}
