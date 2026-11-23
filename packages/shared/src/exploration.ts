import { z } from 'zod';
import type { AxialCoord } from './hex/hexMath.js';
import type { HexTerrainType } from './worldgen/WorldGenerator.js';
export type TerritoryStatus = 'hidden' | 'scanned' | 'claiming' | 'claimed' | 'blocked';
export interface TerritoryTile extends AxialCoord {
  status: TerritoryStatus;
  terrain?: HexTerrainType;
  poi?: string;
  reason?: string;
}
export const RADAR_RANGES = [0, 12, 22, 34] as const;
export const explorationInput = z.object({
  idempotencyKey: z.string().uuid(),
  radarId: z.string().uuid().optional(),
  mode: z.enum(['directional', 'area', 'drone', 'rare']).default('directional'),
  hexes: z.array(z.object({ q: z.number().int().min(-100).max(100), r: z.number().int().min(-100).max(100) })).min(1).max(19),
});
export type ExplorationInput = z.infer<typeof explorationInput>;
export interface ExplorationJob {
  id: string; kind: 'scan' | 'claim'; hexes: AxialCoord[]; finishesAt: string; status: string;
}
export interface ExplorationState {
  cityId: string; serverTime: string; tiles: TerritoryTile[]; jobs: ExplorationJob[];
  radars: Array<AxialCoord & { id: string; level: number; range: number }>;
}
export function explorationCost(kind: 'scan' | 'claim', count: number, mode: ExplorationInput['mode'] = 'directional') {
  const multiplier = mode === 'rare' ? 3 : mode === 'drone' ? 2 : 1;
  return { coins: count * (kind === 'scan' ? 5 * multiplier : 10), wood: count * (kind === 'scan' ? 0 : 15), stone: count * (kind === 'scan' ? 0 : 5) };
}
