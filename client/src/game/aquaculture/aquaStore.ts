import { create } from 'zustand';
import {
  hexKey,
  type AquacultureStateDTO,
  type AxialCoord,
  type FishFeedCode,
  type FishSpeciesCode,
  type WaterBodyCheck,
  type WaterBodyDTO,
  type WaterBodyTypeCode,
} from '@cityverse/shared';

/** Dig tool state: hexes painted for a new water body or an expansion. */
export interface PondDraft {
  type: WaterBodyTypeCode;
  hexes: AxialCoord[];
  expandId?: string;
}

export interface AquaHandlers {
  commitDraft: () => void;
  fill: (id: string) => void;
  stock: (id: string, species: FishSpeciesCode, count: number, source: 'market' | 'hatchery') => void;
  feed: (id: string, feed: FishFeedCode, batches: number) => void;
  harvest: (id: string) => void;
  upgrade: (id: string) => void;
  remove: (id: string) => void;
}

interface AquaState {
  bodies: WaterBodyDTO[];
  fish: Record<string, number>;
  serverOffsetMs: number;
  loaded: boolean;
  busy: boolean;
  selectedId: string | null;
  draft: PondDraft | null;
  draftCheck: WaterBodyCheck | null;
  handlers: AquaHandlers | null;
  /** Feeding visual effect requests (pond id → time) consumed by the renderer */
  feedFx: { id: string; at: number } | null;

  applyServerState: (dto: AquacultureStateDTO) => void;
  applyBody: (body: WaterBodyDTO) => void;
  removeBody: (id: string) => void;
  applyFish: (fish: Record<string, number>, serverTime: string) => void;
  startDraft: (type: WaterBodyTypeCode) => void;
  startExpand: (id: string) => void;
  paintDraftHex: (hex: AxialCoord, add: boolean) => void;
  clearDraft: () => void;
  cancelDraft: () => void;
  setDraftCheck: (check: WaterBodyCheck | null) => void;
  select: (id: string | null) => void;
  setBusy: (busy: boolean) => void;
  setHandlers: (h: AquaHandlers | null) => void;
  triggerFeedFx: (id: string) => void;
  reset: () => void;
}

const initial = {
  bodies: [] as WaterBodyDTO[],
  fish: {} as Record<string, number>,
  serverOffsetMs: 0,
  loaded: false,
  busy: false,
  selectedId: null,
  draft: null,
  draftCheck: null,
  handlers: null,
  feedFx: null,
};

export const useAquaStore = create<AquaState>((set, get) => ({
  ...initial,
  applyServerState: (dto) =>
    set({
      bodies: dto.waterBodies,
      fish: dto.fish,
      loaded: true,
      serverOffsetMs: new Date(dto.serverTime).getTime() - Date.now(),
      selectedId: dto.waterBodies.some((b) => b.id === get().selectedId) ? get().selectedId : null,
    }),
  applyBody: (body) => {
    const list = get().bodies;
    set({ bodies: list.some((b) => b.id === body.id) ? list.map((b) => (b.id === body.id ? body : b)) : [...list, body] });
  },
  removeBody: (id) => set({ bodies: get().bodies.filter((b) => b.id !== id), selectedId: get().selectedId === id ? null : get().selectedId }),
  applyFish: (fish, serverTime) => set({ fish, serverOffsetMs: new Date(serverTime).getTime() - Date.now() }),
  startDraft: (type) => set({ draft: { type, hexes: [] }, draftCheck: null, selectedId: null }),
  startExpand: (id) => {
    const b = get().bodies.find((x) => x.id === id);
    if (b) set({ draft: { type: b.type, hexes: [], expandId: id }, draftCheck: null });
  },
  paintDraftHex: (hex, add) => {
    const d = get().draft;
    if (!d) return;
    const key = hexKey(hex.q, hex.r);
    if (d.expandId && get().bodies.find((b) => b.id === d.expandId)?.hexes.some((h) => hexKey(h.q, h.r) === key)) return;
    const has = d.hexes.some((h) => hexKey(h.q, h.r) === key);
    if (add === has) return;
    set({ draft: { ...d, hexes: add ? [...d.hexes, { q: hex.q, r: hex.r }] : d.hexes.filter((h) => hexKey(h.q, h.r) !== key) } });
  },
  clearDraft: () => {
    const d = get().draft;
    if (d) set({ draft: { ...d, hexes: [] } });
  },
  cancelDraft: () => set({ draft: null, draftCheck: null }),
  setDraftCheck: (draftCheck) => set({ draftCheck }),
  select: (selectedId) => set({ selectedId }),
  setBusy: (busy) => set({ busy }),
  setHandlers: (handlers) => set({ handlers }),
  triggerFeedFx: (id) => set({ feedFx: { id, at: Date.now() } }),
  reset: () => set({ ...initial }),
}));
