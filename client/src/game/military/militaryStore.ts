import { create } from 'zustand';
import type { EquipmentCode, EquipmentSlot, Formation, MilitaryStateDTO, SquadStatus, StartTrainingInput, UnitTypeCode } from '@cityverse/shared';

export interface MilitaryHandlers {
  recruit: (buildingId: string, unitType: UnitTypeCode, count: number) => void;
  train: (buildingId: string, kind: StartTrainingInput['kind']) => void;
  equip: (unitId: string, slot: EquipmentSlot, code: EquipmentCode | null) => void;
  discharge: (unitId: string) => void;
  createSquad: (name: string, formation: Formation) => void;
  updateSquad: (squadId: string, patch: { name?: string; formation?: Formation; status?: SquadStatus }) => void;
  deleteSquad: (squadId: string) => void;
  addMembers: (squadId: string, unitIds: string[]) => void;
  removeMember: (squadId: string, unitId: string) => void;
}

interface MilitaryStore {
  state: MilitaryStateDTO | null;
  serverOffsetMs: number;
  busy: boolean;
  handlers: MilitaryHandlers | null;
  armyOpen: boolean;
  selectedUnitId: string | null;
  /** Training sound effects (WebAudio), off by default */
  sound: boolean;
  apply: (s: MilitaryStateDTO) => void;
  setBusy: (b: boolean) => void;
  setHandlers: (h: MilitaryHandlers | null) => void;
  setArmyOpen: (open: boolean) => void;
  selectUnit: (id: string | null) => void;
  setSound: (on: boolean) => void;
  reset: () => void;
}

const initial = { state: null, serverOffsetMs: 0, busy: false, handlers: null, armyOpen: false, selectedUnitId: null };

export const useMilitaryStore = create<MilitaryStore>((set) => ({
  ...initial,
  sound: false,
  apply: (state) => set({ state, serverOffsetMs: new Date(state.serverTime).getTime() - Date.now() }),
  setBusy: (busy) => set({ busy }),
  setHandlers: (handlers) => set({ handlers }),
  setArmyOpen: (armyOpen) => set({ armyOpen }),
  selectUnit: (selectedUnitId) => set({ selectedUnitId }),
  setSound: (sound) => set({ sound }),
  reset: () => set({ ...initial }),
}));

/** 0..1 progress of a training job at server time. */
export function jobProgress(job: { startedAt: string; finishesAt: string }, serverNowMs: number): number {
  const a = new Date(job.startedAt).getTime();
  const b = new Date(job.finishesAt).getTime();
  return b <= a ? 1 : Math.min(1, Math.max(0, (serverNowMs - a) / (b - a)));
}
