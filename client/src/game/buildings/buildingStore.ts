import { create } from 'zustand';
import {
  normalizeRotation,
  type AxialCoord,
  type BuildingTypeCode,
  type BuildingsStateDTO,
  type HexRotation,
  type PlacementIssue,
  type ResourceBag,
  type WorldBuildingDTO,
} from '@cityverse/shared';

export interface PlacingState {
  typeCode: BuildingTypeCode;
  rotation: HexRotation;
  /** Set when moving an existing building (keeps its level/model). */
  movingId: string | null;
  level: number;
}

export interface PlacementPreviewState {
  anchor: AxialCoord;
  valid: boolean;
  issues: PlacementIssue[];
}

export interface BuildingHandlers {
  commitPlacement: (placing: PlacingState, anchor: AxialCoord) => void;
  upgrade: (buildingId: string) => void;
  demolish: (buildingId: string) => void;
}

interface BuildingState {
  buildings: WorldBuildingDTO[];
  resources: ResourceBag | null;
  /** serverTime − Date.now() at the last sync, to show progress without clock drift. */
  serverOffsetMs: number;
  maxConcurrentJobs: number;
  loaded: boolean;
  error: string | null;
  notice: string | null;
  busy: boolean;
  canEdit: boolean;
  placing: PlacingState | null;
  preview: PlacementPreviewState | null;
  selectedId: string | null;
  handlers: BuildingHandlers | null;

  applyServerState: (dto: BuildingsStateDTO) => void;
  applyResources: (resources: ResourceBag, serverTime: string) => void;
  startPlacing: (typeCode: BuildingTypeCode) => void;
  startMoving: (building: WorldBuildingDTO) => void;
  rotatePlacing: (delta?: number) => void;
  cancelPlacing: () => void;
  setPreview: (preview: PlacementPreviewState | null) => void;
  select: (id: string | null) => void;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
  setCanEdit: (canEdit: boolean) => void;
  setHandlers: (handlers: BuildingHandlers | null) => void;
  reset: () => void;
}

const initial = {
  buildings: [] as WorldBuildingDTO[],
  resources: null,
  serverOffsetMs: 0,
  maxConcurrentJobs: 3,
  loaded: false,
  error: null,
  notice: null,
  busy: false,
  canEdit: false,
  placing: null,
  preview: null,
  selectedId: null,
  handlers: null,
};

export const useBuildingStore = create<BuildingState>((set, get) => ({
  ...initial,

  applyServerState: (dto) =>
    set({
      buildings: dto.buildings,
      resources: dto.resources,
      serverOffsetMs: new Date(dto.serverTime).getTime() - Date.now(),
      maxConcurrentJobs: dto.maxConcurrentJobs,
      loaded: true,
      selectedId: dto.buildings.some((b) => b.id === get().selectedId) ? get().selectedId : null,
    }),
  applyResources: (resources, serverTime) =>
    set({ resources, serverOffsetMs: new Date(serverTime).getTime() - Date.now() }),
  startPlacing: (typeCode) =>
    set({ placing: { typeCode, rotation: 0, movingId: null, level: 1 }, preview: null, selectedId: null, error: null }),
  startMoving: (b) =>
    set({ placing: { typeCode: b.typeCode, rotation: b.rotation, movingId: b.id, level: b.level }, preview: null, error: null }),
  rotatePlacing: (delta = 1) => {
    const p = get().placing;
    if (p) set({ placing: { ...p, rotation: normalizeRotation(p.rotation + delta) } });
  },
  cancelPlacing: () => set({ placing: null, preview: null }),
  setPreview: (preview) => set({ preview }),
  select: (selectedId) => set({ selectedId }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
  setNotice: (notice) => set({ notice }),
  setCanEdit: (canEdit) => set({ canEdit }),
  setHandlers: (handlers) => set({ handlers }),
  reset: () => set({ ...initial }),
}));

/** Construction progress 0..1 for a building's active job at "server now". */
export function jobProgress(b: WorldBuildingDTO, serverNowMs: number): number {
  if (!b.activeJob) return 1;
  const start = new Date(b.activeJob.startedAt).getTime();
  const end = new Date(b.activeJob.finishesAt).getTime();
  return end <= start ? 1 : Math.min(1, Math.max(0, (serverNowMs - start) / (end - start)));
}
