/**
 * Military compound layout in the building's LOCAL frame (anchor hex at the origin, rotation 0).
 * Shared by the static model (buildings/militaryModels.ts) and the live training scene
 * (dummies / targets that react, soldiers at their stations), so both always line up.
 *
 * Footprints: 6 hexes (q 0..2, r 0..1) for barracks / ranges / forge / depot; 9 hexes
 * (q 0..2, r 0..2) for the combined training ground. Levels never change the footprint —
 * a higher level reorganises the same ground (more stations, rest area, tower …).
 */
import { axialToWorld, getBuildingDefinition, type BuildingTypeCode } from '@cityverse/shared';
import type { XZ } from '../farming/farmLayout';

export type PropKind = 'dummy' | 'target' | 'post';

export interface Station {
  /** Where the soldier stands, facing `ry` */
  x: number;
  z: number;
  ry: number;
  /** What the soldier trains against (dummy / archery target), null for formation drills */
  prop: { kind: PropKind; x: number; z: number } | null;
}

export interface MilitaryLayout {
  code: BuildingTypeCode;
  level: number;
  /** Hex centres of the footprint (local) */
  hexes: XZ[];
  /** Main hall on the anchor hex */
  hall: XZ;
  rack: XZ & { ry: number };
  rest: XZ | null;
  tower: XZ | null;
  flags: XZ[];
  stations: Station[];
  /** Where extra (non-training) soldiers stand in formation */
  parade: XZ[];
  /** Hexes used as yard (everything except the hall) */
  yard: XZ[];
}

const c = (q: number, r: number): XZ => axialToWorld(q, r);

export function militaryLayout(code: BuildingTypeCode, level: number): MilitaryLayout {
  const fp = getBuildingDefinition(code).footprint;
  const hexes = fp.map((h) => c(h.q, h.r));
  const hall = c(0, 0);
  const yard = hexes.slice(1);
  const lv = Math.min(3, Math.max(1, level));
  const stations: Station[] = [];
  const ranged = code === 'archery_range' || code === 'crossbow_range';

  if (ranged) {
    // Shooting line on the r = 1 hexes facing the targets on the r = 0 row (≈ 12 m away).
    for (let i = 0; i < 6; i += 1) {
      const x = c(1, 1).x - 4 + i * 3.2;
      stations.push({ x, z: c(0, 1).z + 2.2, ry: Math.PI, prop: { kind: 'target', x: x - 2.5, z: -2.6 } });
    }
  } else if (code === 'training_ground') {
    // Two dummies on each of four yard hexes + a formation field on the last row.
    for (const [q, r] of [[1, 0], [2, 0], [1, 1], [2, 1]] as const) {
      const h = c(q, r);
      for (const dx of [-1.9, 1.9]) stations.push({ x: h.x + dx, z: h.z + 1.6, ry: Math.PI, prop: { kind: 'dummy', x: h.x + dx, z: h.z - 0.5 } });
    }
    for (const [q, dx] of [[1, -1.6], [1, 1.6], [2, -1.6], [2, 1.6]] as const) {
      const h = c(q, 2);
      stations.push({ x: h.x + dx, z: h.z, ry: Math.PI, prop: null });
    }
  } else if (code === 'sword_barracks' || code === 'spear_barracks') {
    // Two practice spots per yard hex: soldier in front, straw dummy (swords) / thrust post (spears).
    const spear = code === 'spear_barracks';
    for (const [q, r] of [[1, 0], [2, 0], [1, 1]] as const) {
      const h = c(q, r);
      for (const dx of [-1.8, 1.8]) {
        stations.push({ x: h.x + dx, z: h.z + 1.6, ry: Math.PI, prop: { kind: spear ? 'post' : 'dummy', x: h.x + dx, z: h.z + 1.6 - (spear ? 2.7 : 2.1) } });
      }
    }
  }

  const rest = lv >= 2 ? (code === 'training_ground' ? c(0, 2) : c(0, 1)) : null;
  const tower = lv >= 3 ? { x: c(2, 1).x + 2.6, z: c(2, 1).z + 1.4 } : null;
  const flags = lv >= 3 ? [{ x: hall.x + 3.6, z: hall.z + 2.6 }, { x: c(2, 0).x + 3, z: c(2, 0).z - 2.4 }] : lv === 2 ? [{ x: hall.x + 3.6, z: hall.z + 2.6 }] : [];
  // Soldiers not at a station line up on the parade ground (last hex of the footprint).
  const last = hexes[hexes.length - 1];
  const parade: XZ[] = [];
  for (let i = 0; i < 24; i += 1) parade.push({ x: last.x - 3 + (i % 5) * 1.5, z: last.z - 2.2 + Math.floor(i / 5) * 1.3 });
  return {
    code,
    level: lv,
    hexes,
    hall,
    rack: { x: hall.x + 3.3, z: hall.z - 1.6, ry: Math.PI / 2 },
    rest,
    tower,
    flags,
    stations,
    parade,
    yard,
  };
}

/** Stations used at a level (barracks: 2 / 4 / 6; ground: 4 / 8 / 12). */
export function activeStations(layout: MilitaryLayout, slots: number): Station[] {
  return layout.stations.slice(0, Math.max(0, Math.min(layout.stations.length, slots)));
}
