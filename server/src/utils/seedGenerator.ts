import crypto from 'node:crypto';
import type { TerrainType } from '@cityverse/shared';

export function generateWorldSeed(terrainType: TerrainType): string {
  const prefix = terrainType.slice(0, 3).toUpperCase();
  const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `CV-${prefix}-${randomPart}`;
}
