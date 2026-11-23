import { create } from 'zustand';
import {
  hexKey,
  type AnimalTypeCode,
  type AxialCoord,
  type FarmZoneCheck,
  type FeedRecipeCode,
  type HerdStatusDTO,
  type HerdSummaryDTO,
  type LivestockFarmDTO,
  type LivestockFarmTypeCode,
  type LivestockProductBag,
  type LivestockStateDTO,
} from '@cityverse/shared';

export interface RanchDraft {
  farmType: LivestockFarmTypeCode;
  /** New hexes painted (for an expansion: only the added ones) */
  hexes: AxialCoord[];
  /** Set when expanding an existing farm */
  expandFarmId?: string;
}

export interface LivestockHandlers {
  commitDraft: () => void;
  buy: (farmId: string, animal: AnimalTypeCode, count: number, breed?: string) => void;
  sell: (farmId: string, animalId: string) => void;
  harvest: (farmId: string, animalId: string) => void;
  transfer: (farmId: string, animalId: string, targetFarmId: string) => void;
  feed: (farmId: string, recipe: FeedRecipeCode, batches: number) => void;
  water: (farmId: string) => void;
  setCaretakers: (farmId: string, count: number) => void;
  collect: (farmId: string) => void;
  breed: (farmId: string, animal: AnimalTypeCode) => void;
  upgrade: (farmId: string) => void;
  remove: (farmId: string) => void;
}

interface LivestockState {
  farms: LivestockFarmDTO[];
  products: LivestockProductBag | null;
  serverOffsetMs: number;
  loaded: boolean;
  busy: boolean;
  selectedFarmId: string | null;
  /** Herd summary of the selected farm (synced when it is opened) */
  herd: HerdSummaryDTO | null;
  draft: RanchDraft | null;
  draftCheck: FarmZoneCheck | null;
  handlers: LivestockHandlers | null;

  applyServerState: (dto: LivestockStateDTO) => void;
  applyHerd: (dto: HerdStatusDTO) => void;
  applyFarm: (farm: LivestockFarmDTO) => void;
  applyProducts: (products: LivestockProductBag, serverTime: string) => void;
  startDraft: (farmType: LivestockFarmTypeCode) => void;
  startExpand: (farmId: string) => void;
  paintDraftHex: (hex: AxialCoord, add: boolean) => void;
  clearDraft: () => void;
  cancelDraft: () => void;
  setDraftCheck: (check: FarmZoneCheck | null) => void;
  selectFarm: (id: string | null) => void;
  setBusy: (busy: boolean) => void;
  setHandlers: (handlers: LivestockHandlers | null) => void;
  reset: () => void;
}

const initial = {
  farms: [] as LivestockFarmDTO[],
  products: null,
  serverOffsetMs: 0,
  loaded: false,
  busy: false,
  selectedFarmId: null,
  herd: null,
  draft: null,
  draftCheck: null,
  handlers: null,
};

export const useLivestockStore = create<LivestockState>((set, get) => ({
  ...initial,

  applyServerState: (dto) =>
    set({
      farms: dto.farms,
      products: dto.products,
      serverOffsetMs: new Date(dto.serverTime).getTime() - Date.now(),
      loaded: true,
      selectedFarmId: dto.farms.some((f) => f.id === get().selectedFarmId) ? get().selectedFarmId : null,
    }),
  applyHerd: (dto) => {
    get().applyFarm(dto.farm);
    set({ herd: get().selectedFarmId === dto.farm.id ? dto.summary : get().herd, serverOffsetMs: new Date(dto.serverTime).getTime() - Date.now() });
  },
  applyFarm: (farm) => {
    const list = get().farms;
    const i = list.findIndex((f) => f.id === farm.id);
    set({ farms: i < 0 ? [...list, farm] : list.map((f) => (f.id === farm.id ? farm : f)) });
  },
  applyProducts: (products, serverTime) => set({ products, serverOffsetMs: new Date(serverTime).getTime() - Date.now() }),
  startDraft: (farmType) => set({ draft: { farmType, hexes: [] }, draftCheck: null, selectedFarmId: null }),
  startExpand: (farmId) => {
    const farm = get().farms.find((f) => f.id === farmId);
    if (!farm) return;
    set({ draft: { farmType: farm.farmType, hexes: [], expandFarmId: farmId }, draftCheck: null });
  },
  paintDraftHex: (hex, add) => {
    const d = get().draft;
    if (!d) return;
    const key = hexKey(hex.q, hex.r);
    if (d.expandFarmId && get().farms.find((f) => f.id === d.expandFarmId)?.hexes.some((h) => hexKey(h.q, h.r) === key)) return;
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
  selectFarm: (selectedFarmId) => set({ selectedFarmId, herd: selectedFarmId === get().selectedFarmId ? get().herd : null }),
  setBusy: (busy) => set({ busy }),
  setHandlers: (handlers) => set({ handlers }),
  reset: () => set({ ...initial }),
}));
