/**
 * Battlefield geometry (pure): a separate small hex board — never the player's own world map.
 * Hex spacing is chosen so chibi soldiers (≈2 m) read clearly one per hex.
 */
import { axialToWorld, TERRAIN_DEFINITIONS, type AxialCoord, type BattleState, type BattleTile } from '@cityverse/shared';

export const BATTLE_HEX = 4.2;
export const TILE_BASE = 0.45;
export const HILL_STEP = 1.1;

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export function hexCenter(h: AxialCoord): { x: number; z: number } {
  return axialToWorld(h.q, h.r, BATTLE_HEX);
}

/** Height of the walkable top of a tile. */
export function tileTop(t: Pick<BattleTile, 'height' | 'terrain'> | undefined): number {
  if (!t) return TILE_BASE;
  const h = t.terrain === 'rock' ? 0 : t.height;
  return TILE_BASE + h * HILL_STEP + (t.terrain === 'water' ? -0.25 : 0);
}

export function tileMap(s: BattleState): Map<string, BattleTile> {
  return new Map(s.tiles.map((t) => [`${t.q},${t.r}`, t]));
}

export function standPoint(tiles: Map<string, BattleTile>, h: AxialCoord): V3 {
  const c = hexCenter(h);
  return { x: c.x, y: tileTop(tiles.get(`${h.q},${h.r}`)), z: c.z };
}

/** Yaw that faces from a to b (chibi rigs face +Z at yaw 0). */
export function yawTo(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}

export const isPassable = (t: BattleTile | undefined): boolean => Boolean(t && TERRAIN_DEFINITIONS[t.terrain].passable);
