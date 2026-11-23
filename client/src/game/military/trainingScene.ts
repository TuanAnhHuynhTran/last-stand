/**
 * Where every soldier is in the military compounds (pure, from the server state):
 *  - soldiers of a running training job stand at that building's ACTIVE stations and drill
 *    (stations = training slots of the level: 2 / 4 / 6, ground 4 / 8 / 12);
 *  - everyone else of that barracks stands at attention on its parade ground.
 * Layout is in the building's local frame; it is placed exactly like the building model
 * (anchor hex world position + rotationToYaw(rotation)).
 */
import { axialToWorld, rotationToYaw, type BuildingTypeCode, type MilitaryStateDTO, type MilitaryUnitDTO } from '@cityverse/shared';
import type { XZ } from '../farming/farmLayout';
import { activeStations, militaryLayout, type PropKind } from './militaryLayout';

export interface WorldStation {
  x: number;
  z: number;
  yaw: number;
  prop: { kind: PropKind; x: number; z: number; yaw: number } | null;
}

export interface CompoundPlan {
  buildingId: string;
  code: BuildingTypeCode;
  level: number;
  origin: XZ;
  yaw: number;
  hexes: { q: number; r: number }[];
  stations: WorldStation[];
  parade: (XZ & { yaw: number })[];
}

export interface SoldierPlan {
  unit: MilitaryUnitDTO;
  buildingId: string;
  /** Station index in its compound, null on the parade ground */
  station: number | null;
  x: number;
  z: number;
  yaw: number;
  /** ride = on its horse (Phase 9): drawn on the horse's seat socket, wherever the horse is */
  mode: 'drill' | 'idle' | 'ride';
  mountId?: string;
}

export function toWorld(p: XZ, origin: XZ, yaw: number): XZ {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: origin.x + p.x * c + p.z * s, z: origin.z - p.x * s + p.z * c };
}

/** Yaw facing from a to b (rig faces +Z at yaw 0). */
export function yawTowards(a: XZ, b: XZ): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}

export function planTrainingScene(state: MilitaryStateDTO | null): { compounds: CompoundPlan[]; soldiers: SoldierPlan[] } {
  if (!state) return { compounds: [], soldiers: [] };
  const compounds: CompoundPlan[] = [];
  for (const b of state.barracks) {
    const code = b.typeCode as BuildingTypeCode;
    const layout = militaryLayout(code, b.level);
    const origin = axialToWorld(b.anchor.q, b.anchor.r);
    const yaw = rotationToYaw(b.rotation);
    const hall = toWorld(layout.hall, origin, yaw);
    compounds.push({
      buildingId: b.buildingId,
      code,
      level: b.level,
      origin,
      yaw,
      hexes: b.hexes,
      stations: activeStations(layout, b.slots).map((s) => {
        const w = toWorld(s, origin, yaw);
        const prop = s.prop ? { kind: s.prop.kind, ...toWorld(s.prop, origin, yaw), yaw } : null;
        return { x: w.x, z: w.z, yaw: s.ry + yaw, prop };
      }),
      parade: layout.parade.map((p) => {
        const w = toWorld(p, origin, yaw);
        return { ...w, yaw: yawTowards(w, hall) };
      }),
    });
  }
  const byId = new Map(compounds.map((c) => [c.buildingId, c]));
  const units = new Map(state.units.map((u) => [u.id, u]));
  const placed = new Set<string>();
  const soldiers: SoldierPlan[] = [];
  // 1. Running jobs → stations (job order = arrival order).
  const used = new Map<string, number>();
  for (const job of state.jobs) {
    const c = byId.get(job.buildingId);
    if (!c) continue;
    for (const id of job.unitIds) {
      const unit = units.get(id);
      if (!unit || placed.has(id)) continue;
      const i = used.get(c.buildingId) ?? 0;
      if (i >= c.stations.length) break;
      used.set(c.buildingId, i + 1);
      const st = c.stations[i];
      soldiers.push({ unit, buildingId: c.buildingId, station: i, x: st.x, z: st.z, yaw: st.yaw, mode: 'drill' });
      placed.add(id);
    }
  }
  // 2. Mounted soldiers who are not drilling ride their horse (it carries them in the stable yard).
  for (const unit of state.units) {
    if (placed.has(unit.id) || !unit.mount) continue;
    soldiers.push({ unit, buildingId: unit.buildingId, station: null, x: 0, z: 0, yaw: 0, mode: 'ride', mountId: unit.mount.animalId });
    placed.add(unit.id);
  }
  // 3. Everyone else → parade ground of their barracks.
  const paradeUsed = new Map<string, number>();
  for (const unit of state.units) {
    if (placed.has(unit.id)) continue;
    const c = byId.get(unit.buildingId);
    if (!c) continue;
    const i = paradeUsed.get(c.buildingId) ?? 0;
    if (i >= c.parade.length) continue;
    paradeUsed.set(c.buildingId, i + 1);
    const p = c.parade[i];
    soldiers.push({ unit, buildingId: c.buildingId, station: null, x: p.x, z: p.z, yaw: p.yaw, mode: 'idle' });
    placed.add(unit.id);
  }
  return { compounds, soldiers };
}
