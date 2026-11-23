import { create } from 'zustand';
import type { HexTerrainType, HexTile, WorldGenerator } from '@cityverse/shared';
import type { QualityLevel } from './qualitySettings';
import type { WeatherMode } from './weather';

export type WorldViewMode = 'normal' | 'build';
export type CameraPreset = 'near' | 'default' | 'far';

export interface HexInfo {
  q: number;
  r: number;
  key: string;
  type: HexTerrainType;
  height: number;
  slope: number;
  buildable: boolean;
  owned: boolean;
  chunkX: number;
  chunkZ: number;
}

export interface WorldPerfStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  loadedChunks: number;
  pendingChunks: number;
  totalChunks: number;
  vegetationInstances: number;
  /** Phase 12 extras (GPU memory proxies, scene counts, weather) */
  textures?: number;
  programs?: number;
  buildings?: number;
  villagers?: number;
  animals?: number;
  soldiers?: number;
  lamps?: number;
  rainDrops?: number;
  weather?: string;
  /** ms from engine creation until the start area finished streaming */
  loadMs?: number | null;
}

export type CameraCommand =
  | { id: number; type: 'focus'; x: number; z: number; distance?: number }
  | { id: number; type: 'preset'; preset: CameraPreset }
  | { id: number; type: 'home' };

type CameraCommandInput =
  | { type: 'focus'; x: number; z: number; distance?: number }
  | { type: 'preset'; preset: CameraPreset }
  | { type: 'home' };

const QUALITY_STORAGE_KEY = 'lh.world.quality';

function readStoredQuality(): QualityLevel {
  try {
    const v = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    if (v === 'low' || v === 'medium' || v === 'high') return v;
  } catch {
    // storage unavailable (private mode, tests) → default
  }
  return 'medium';
}

interface WorldViewState {
  mode: WorldViewMode;
  quality: QualityLevel;
  /** Phase 12: auto (seeded schedule) or a forced look — visual only */
  weatherMode: WeatherMode;
  setWeatherMode: (mode: WeatherMode) => void;
  cameraPreset: CameraPreset;
  showPerf: boolean;
  hovered: HexInfo | null;
  selected: HexInfo[];
  stats: WorldPerfStats;
  cameraCommand: CameraCommand | null;
  ready: boolean;

  setMode: (mode: WorldViewMode) => void;
  toggleMode: () => void;
  setQuality: (quality: QualityLevel) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  togglePerf: () => void;
  setHovered: (hex: HexInfo | null) => void;
  selectHex: (hex: HexInfo, additive: boolean) => void;
  clearSelection: () => void;
  setStats: (stats: WorldPerfStats) => void;
  issueCameraCommand: (cmd: CameraCommandInput) => void;
  setReady: (ready: boolean) => void;
  reset: () => void;
}

const EMPTY_STATS: WorldPerfStats = {
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  loadedChunks: 0,
  pendingChunks: 0,
  totalChunks: 0,
  vegetationInstances: 0,
};

let commandId = 0;

export const useWorldViewStore = create<WorldViewState>((set, get) => ({
  mode: 'normal',
  quality: readStoredQuality(),
  weatherMode: 'auto',
  setWeatherMode: (weatherMode) => set({ weatherMode }),
  cameraPreset: 'default',
  showPerf: false,
  hovered: null,
  selected: [],
  stats: EMPTY_STATS,
  cameraCommand: null,
  ready: false,

  setMode: (mode) => set({ mode, ...(mode === 'normal' ? { selected: [] } : {}) }),
  toggleMode: () => get().setMode(get().mode === 'build' ? 'normal' : 'build'),
  setQuality: (quality) => {
    try {
      window.localStorage.setItem(QUALITY_STORAGE_KEY, quality);
    } catch {
      // ignore – preference simply isn't remembered
    }
    set({ quality });
  },
  setCameraPreset: (preset) => {
    set({ cameraPreset: preset });
    get().issueCameraCommand({ type: 'preset', preset });
  },
  togglePerf: () => set({ showPerf: !get().showPerf }),
  setHovered: (hovered) => {
    const prev = get().hovered;
    if (prev?.key === hovered?.key) return;
    set({ hovered });
  },
  selectHex: (hex, additive) => {
    const cur = get().selected;
    const exists = cur.some((h) => h.key === hex.key);
    if (additive) {
      set({ selected: exists ? cur.filter((h) => h.key !== hex.key) : [...cur, hex] });
    } else {
      set({ selected: exists && cur.length === 1 ? [] : [hex] });
    }
  },
  clearSelection: () => set({ selected: [] }),
  setStats: (stats) => set({ stats }),
  issueCameraCommand: (cmd) => {
    commandId += 1;
    set({ cameraCommand: { ...cmd, id: commandId } as CameraCommand });
  },
  setReady: (ready) => set({ ready }),
  reset: () =>
    set({
      mode: 'normal',
      cameraPreset: 'default',
      hovered: null,
      selected: [],
      stats: EMPTY_STATS,
      cameraCommand: null,
      ready: false,
    }),
}));

export function toHexInfo(world: WorldGenerator, tile: HexTile): HexInfo {
  return {
    q: tile.q,
    r: tile.r,
    key: tile.key,
    type: tile.type,
    height: tile.height,
    slope: tile.slope,
    buildable: tile.buildable,
    owned: world.isOwned(tile.q, tile.r),
    chunkX: tile.chunkX,
    chunkZ: tile.chunkZ,
  };
}
