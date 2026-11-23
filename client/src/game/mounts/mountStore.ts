import { create } from 'zustand';
import type { AnimalEquipInput, AnimalTaskKind, CareAction, MountStateDTO, TrainingProgramCode } from '@cityverse/shared';

export interface MountHandlers {
  train: (animalId: string, program: TrainingProgramCode) => void;
  care: (animalId: string, action: CareAction) => void;
  equip: (animalId: string, input: AnimalEquipInput) => void;
  mount: (animalId: string, unitId: string) => void;
  dismount: (animalId: string) => void;
  task: (animalId: string, kind: AnimalTaskKind) => void;
  endTask: (animalId: string) => void;
}

interface MountStore {
  state: MountStateDTO | null;
  serverOffsetMs: number;
  busy: boolean;
  handlers: MountHandlers | null;
  apply: (s: MountStateDTO) => void;
  setBusy: (b: boolean) => void;
  setHandlers: (h: MountHandlers | null) => void;
  reset: () => void;
}

const initial = { state: null, serverOffsetMs: 0, busy: false, handlers: null };

export const useMountStore = create<MountStore>((set) => ({
  ...initial,
  apply: (state) => set({ state, serverOffsetMs: new Date(state.serverTime).getTime() - Date.now() }),
  setBusy: (busy) => set({ busy }),
  setHandlers: (handlers) => set({ handlers }),
  reset: () => set({ ...initial }),
}));
