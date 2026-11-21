import { create } from 'zustand';
import type {
  BiomeType,
  GridSelection,
  TerrainMetadataDTO,
} from '@cityverse/shared';

export type WorldInteractionTool = 'pan' | 'select' | 'raise' | 'lower' | 'flatten';

export interface HoveredTileInfo {
  gx: number;
  gz: number;
  cx: number;
  cz: number;
  height: number;
  biome: BiomeType;
  buildable: boolean;
  revision: number;
}

export interface CameraTelemetry {
  targetX: number;
  targetZ: number;
  chunkX: number;
  chunkZ: number;
  distance: number;
  polarDeg: number;
}

export interface PendingTerrainAction {
  id: number;
  type: 'raise' | 'lower' | 'flatten' | 'clear_props';
  selection: GridSelection;
  amount?: number;
}

interface WorldStoreState {
  metadata: TerrainMetadataDTO | null;
  showGrid: boolean;
  interactionTool: WorldInteractionTool;
  hoveredTile: HoveredTileInfo | null;
  selection: GridSelection | null;
  isDraggingSelection: boolean;
  cameraTelemetry: CameraTelemetry;
  loadedChunkKeys: string[];
  chunkRevisions: Record<string, number>;
  loadingChunkCount: number;
  isSavingDelta: boolean;
  lastError: string | null;
  cameraResetCounter: number;
  pendingAction: PendingTerrainAction | null;

  setMetadata: (metadata: TerrainMetadataDTO | null) => void;
  toggleGrid: () => void;
  setShowGrid: (visible: boolean) => void;
  setInteractionTool: (tool: WorldInteractionTool) => void;
  setHoveredTile: (tile: HoveredTileInfo | null) => void;
  setSelection: (selection: GridSelection | null) => void;
  setIsDraggingSelection: (dragging: boolean) => void;
  setCameraTelemetry: (telemetry: CameraTelemetry) => void;
  setLoadedChunksSnapshot: (keys: string[], revisions: Record<string, number>) => void;
  setLoadingChunkCount: (count: number) => void;
  setIsSavingDelta: (saving: boolean) => void;
  setLastError: (error: string | null) => void;
  requestCameraReset: () => void;
  triggerTerrainAction: (
    type: PendingTerrainAction['type'],
    selection: GridSelection,
    amount?: number
  ) => void;
  clearPendingAction: () => void;
  resetWorldStore: () => void;
}

const initialCameraTelemetry: CameraTelemetry = {
  targetX: 256,
  targetZ: 256,
  chunkX: 2,
  chunkZ: 2,
  distance: 82,
  polarDeg: 45,
};

let actionSeq = 1;

export const useWorldStore = create<WorldStoreState>((set) => ({
  metadata: null,
  showGrid: false,
  interactionTool: 'pan',
  hoveredTile: null,
  selection: null,
  isDraggingSelection: false,
  cameraTelemetry: initialCameraTelemetry,
  loadedChunkKeys: [],
  chunkRevisions: {},
  loadingChunkCount: 0,
  isSavingDelta: false,
  lastError: null,
  cameraResetCounter: 0,
  pendingAction: null,

  setMetadata: (metadata) => set({ metadata }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  setShowGrid: (showGrid) => set({ showGrid }),
  setInteractionTool: (interactionTool) => set({ interactionTool }),
  setHoveredTile: (hoveredTile) => set({ hoveredTile }),
  setSelection: (selection) => set({ selection }),
  setIsDraggingSelection: (isDraggingSelection) => set({ isDraggingSelection }),
  setCameraTelemetry: (cameraTelemetry) => set({ cameraTelemetry }),
  setLoadedChunksSnapshot: (loadedChunkKeys, chunkRevisions) =>
    set({ loadedChunkKeys, chunkRevisions }),
  setLoadingChunkCount: (loadingChunkCount) => set({ loadingChunkCount }),
  setIsSavingDelta: (isSavingDelta) => set({ isSavingDelta }),
  setLastError: (lastError) => set({ lastError }),
  requestCameraReset: () => set((state) => ({ cameraResetCounter: state.cameraResetCounter + 1 })),
  triggerTerrainAction: (type, selection, amount) => {
    actionSeq += 1;
    set({ pendingAction: { id: actionSeq, type, selection, amount } });
  },
  clearPendingAction: () => set({ pendingAction: null }),
  resetWorldStore: () =>
    set({
      metadata: null,
      showGrid: false,
      interactionTool: 'pan',
      hoveredTile: null,
      selection: null,
      isDraggingSelection: false,
      cameraTelemetry: initialCameraTelemetry,
      loadedChunkKeys: [],
      chunkRevisions: {},
      loadingChunkCount: 0,
      isSavingDelta: false,
      lastError: null,
      pendingAction: null,
    }),
}));
