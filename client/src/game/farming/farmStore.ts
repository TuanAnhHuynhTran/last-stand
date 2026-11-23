import { create } from 'zustand';
import {
  cropProgress,
  getCropDefinition,
  hexKey,
  type AxialCoord,
  type CropTypeCode,
  type FarmStateDTO,
  type FarmZoneCheck,
  type FarmZoneDTO,
  type FarmZoneTypeCode,
  type ProduceBag,
} from '@cityverse/shared';

/** Hexes being painted for a new zone or an expansion (expansion ≠ upgrade). */
export interface FarmDraft {
  mode: 'create' | 'expand';
  zoneType: FarmZoneTypeCode;
  zoneId: string | null;
  hexes: AxialCoord[];
}

export interface FarmHandlers {
  commitDraft: () => void;
  plant: (zoneId: string, crop?: CropTypeCode) => void;
  harvest: (zoneId: string) => void;
  upgrade: (zoneId: string) => void;
  remove: (zoneId: string) => void;
}

interface FarmState {
  zones: FarmZoneDTO[];
  produce: ProduceBag | null;
  serverOffsetMs: number;
  loaded: boolean;
  busy: boolean;
  selectedZoneId: string | null;
  draft: FarmDraft | null;
  draftCheck: FarmZoneCheck | null;
  handlers: FarmHandlers | null;

  applyServerState: (dto: FarmStateDTO) => void;
  applyProduce: (produce: ProduceBag, serverTime: string) => void;
  startDraft: (zoneType: FarmZoneTypeCode) => void;
  startExpand: (zone: FarmZoneDTO) => void;
  /** Adds (`add` = true) or removes a hex from the draft. */
  paintDraftHex: (hex: AxialCoord, add: boolean) => void;
  clearDraft: () => void;
  cancelDraft: () => void;
  setDraftCheck: (check: FarmZoneCheck | null) => void;
  selectZone: (id: string | null) => void;
  setBusy: (busy: boolean) => void;
  setHandlers: (handlers: FarmHandlers | null) => void;
  reset: () => void;
}

const initial = {
  zones: [] as FarmZoneDTO[],
  produce: null,
  serverOffsetMs: 0,
  loaded: false,
  busy: false,
  selectedZoneId: null,
  draft: null,
  draftCheck: null,
  handlers: null,
};

export const useFarmStore = create<FarmState>((set, get) => ({
  ...initial,

  applyServerState: (dto) =>
    set({
      zones: dto.zones,
      produce: dto.produce,
      serverOffsetMs: new Date(dto.serverTime).getTime() - Date.now(),
      loaded: true,
      selectedZoneId: dto.zones.some((z) => z.id === get().selectedZoneId) ? get().selectedZoneId : null,
    }),
  applyProduce: (produce, serverTime) => set({ produce, serverOffsetMs: new Date(serverTime).getTime() - Date.now() }),
  startDraft: (zoneType) =>
    set({ draft: { mode: 'create', zoneType, zoneId: null, hexes: [] }, draftCheck: null, selectedZoneId: null }),
  startExpand: (zone) =>
    set({ draft: { mode: 'expand', zoneType: zone.zoneType, zoneId: zone.id, hexes: [] }, draftCheck: null }),
  paintDraftHex: (hex, add) => {
    const d = get().draft;
    if (!d) return;
    const key = hexKey(hex.q, hex.r);
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
  selectZone: (selectedZoneId) => set({ selectedZoneId }),
  setBusy: (busy) => set({ busy }),
  setHandlers: (handlers) => set({ handlers }),
  reset: () => set({ ...initial }),
}));

/** Growth progress 0..1 of a zone's crop at "server now" (null when fallow). */
export function zoneCropProgress(zone: FarmZoneDTO, serverNowMs: number): number | null {
  if (!zone.crop) return null;
  return cropProgress(new Date(zone.crop.plantedAt).getTime(), new Date(zone.crop.readyAt).getTime(), serverNowMs);
}

export function isZoneRipe(zone: FarmZoneDTO, serverNowMs: number): boolean {
  return zone.crop !== null && serverNowMs >= new Date(zone.crop.readyAt).getTime();
}

export function zoneUpgradeProgress(zone: FarmZoneDTO, serverNowMs: number): number | null {
  if (zone.status !== 'upgrading' || !zone.upgradeStartedAt || !zone.upgradeFinishesAt) return null;
  return cropProgress(new Date(zone.upgradeStartedAt).getTime(), new Date(zone.upgradeFinishesAt).getTime(), serverNowMs);
}

export function cropName(zone: FarmZoneDTO): string | null {
  return zone.crop ? getCropDefinition(zone.crop.cropCode).name : null;
}
