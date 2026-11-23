import { create } from 'zustand';
import type { ExplorationState } from '@cityverse/shared';
export const useExplorationStore = create<{
  state: ExplorationState | null; active: boolean; scanMode: boolean; radarId: string | null; drone: boolean;
}>(() => ({ state: null, active: false, scanMode: false, radarId: null, drone: false }));
