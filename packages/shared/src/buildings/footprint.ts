/**
 * BuildingFootprint — footprint geometry and placement validation shared by client preview
 * and server authority, so green/red in the preview means exactly what the API will accept.
 */
import { pathEdgeKey, pathNeighbor, pathTouchedHexes } from './paths.js';
import { hexKey, isWithinWorldBounds, type AxialCoord } from '../hex/hexMath.js';
import type { HexTile } from '../worldgen/WorldGenerator.js';
import { getBuildingDefinition, type BuildingTypeCode } from './definitions.js';

/** Rotation in 60° steps, 0..5. */
export type HexRotation = 0 | 1 | 2 | 3 | 4 | 5;

export function normalizeRotation(rotation: number): HexRotation {
  return ((((Math.round(rotation) % 6) + 6) % 6) as HexRotation);
}

/** Rotates an axial offset by `steps` × 60° (cube rotation (q,r,s) → (−r,−s,−q)). */
export function rotateAxial(offset: AxialCoord, steps: number): AxialCoord {
  let q = offset.q;
  let r = offset.r;
  for (let i = 0; i < normalizeRotation(steps); i += 1) {
    const nq = -r;
    const nr = q + r;
    q = nq;
    r = nr;
  }
  return { q: q === 0 ? 0 : q, r: r === 0 ? 0 : r };
}

/**
 * Model yaw (radians, Three.js Y-rotation) matching `rotateAxial`, so a model authored for
 * rotation 0 lines up with its rotated footprint.
 */
export function rotationToYaw(rotation: number): number {
  return -normalizeRotation(rotation) * (Math.PI / 3);
}

export function getFootprintHexes(code: BuildingTypeCode, anchor: AxialCoord, rotation: number): AxialCoord[] {
  return getBuildingDefinition(code).footprint.map((o) => {
    const r = rotateAxial(o, rotation);
    return { q: anchor.q + r.q, r: anchor.r + r.r };
  });
}

export type PlacementIssue = 'OUT_OF_BOUNDS' | 'NOT_OWNED' | 'TERRAIN_BLOCKED' | 'OCCUPIED' | 'FARMLAND';

export const PLACEMENT_ISSUE_LABELS: Record<PlacementIssue, string> = {
  OUT_OF_BOUNDS: 'Ngoài ranh giới thế giới',
  NOT_OWNED: 'Đất chưa sở hữu',
  TERRAIN_BLOCKED: 'Địa hình không xây được',
  OCCUPIED: 'Đã có công trình',
  FARMLAND: 'Đất đang canh tác',
};

export interface PlacementHexResult extends AxialCoord {
  issue: PlacementIssue | null;
}

export interface PlacementCheck {
  valid: boolean;
  hexes: PlacementHexResult[];
  issues: PlacementIssue[];
}

export interface PlacementWorld {
  getHexTile(q: number, r: number): HexTile;
  isOwned(q: number, r: number): boolean;
}

/**
 * Validates a footprint. `occupied` maps hex key → building id (or `farm:<zoneId>` for
 * farmland); hexes occupied by
 * `ignoreBuildingId` (the building being moved) count as free.
 */
export function checkPlacement(
  world: PlacementWorld,
  code: BuildingTypeCode,
  anchor: AxialCoord,
  rotation: number,
  occupied: ReadonlyMap<string, string>,
  ignoreBuildingId?: string
): PlacementCheck {
  if (code === 'road') {
    const neighbor = pathNeighbor(anchor, rotation);
    const edge = occupied.get(pathEdgeKey(anchor, rotation));
    const a = occupied.get(hexKey(anchor.q, anchor.r));
    const b = occupied.get(hexKey(neighbor.q, neighbor.r));
    const hexes = pathTouchedHexes(anchor, rotation).map<PlacementHexResult>((h) => {
      const occupant = occupied.get(hexKey(h.q, h.r));
      let issue: PlacementIssue | null = null;
      if (!isWithinWorldBounds(h.q, h.r)) issue = 'OUT_OF_BOUNDS';
      else if (!world.isOwned(h.q, h.r)) issue = 'NOT_OWNED';
      else if (!world.getHexTile(h.q, h.r).buildable) issue = 'TERRAIN_BLOCKED';
      else if (occupant?.startsWith('farm:')) issue = 'FARMLAND';
      else if (occupant?.startsWith('ranch:') || occupant?.startsWith('pond:')) issue = 'OCCUPIED';
      else if ((edge && edge !== ignoreBuildingId) || (a && a === b)) issue = 'OCCUPIED';
      return { ...h, issue };
    });
    const issues = [...new Set(hexes.flatMap(h => h.issue ? [h.issue] : []))];
    return { valid: issues.length === 0, hexes, issues };
  }
  const hexes = getFootprintHexes(code, anchor, rotation).map<PlacementHexResult>((h) => {
    let issue: PlacementIssue | null = null;
    const occupant = occupied.get(hexKey(h.q, h.r));
    if (!isWithinWorldBounds(h.q, h.r)) issue = 'OUT_OF_BOUNDS';
    else if (!world.isOwned(h.q, h.r)) issue = 'NOT_OWNED';
    else if (!world.getHexTile(h.q, h.r).buildable) issue = 'TERRAIN_BLOCKED';
    else if (getFootprintHexes(code, anchor, rotation).some(other => {
      for (let edge = 0; edge < 6; edge++) {
        const n = pathNeighbor(h, edge);
        const path = occupied.get(pathEdgeKey(h, edge));
        if (path && n.q === other.q && n.r === other.r) return true;
      }
      return false;
    })) issue = 'OCCUPIED';
    else if (occupant && occupant !== ignoreBuildingId) issue = occupant.startsWith('farm:') ? 'FARMLAND' : 'OCCUPIED';
    return { q: h.q, r: h.r, issue };
  });
  const issues = [...new Set(hexes.map((h) => h.issue).filter((i): i is PlacementIssue => i !== null))];
  return { valid: issues.length === 0, hexes, issues };
}
