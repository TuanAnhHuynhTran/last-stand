/**
 * Village navigation: A* over the territory's hex graph.
 *
 *  walkable  owned land; roads are cheap (villagers prefer them), fields are slow (rows)
 *  blocked   buildings, buildings under construction, fenced livestock farms, ponds, water,
 *            anything outside the territory
 *
 * Workplaces / houses are reached through an "approach" hex next to them (their door side);
 * fields are walked into. Routes are hex-centre polylines with a per-villager lane offset,
 * smoothed with one Chaikin pass — every smoothed point stays inside the two hexes of its
 * segment, so a route never cuts through a blocked hex.
 */
import {
  HEX_DIRECTIONS,
  axialToWorld,
  getBuildingLevel,
  hexDistance,
  hexKey,
  parseHexKey,
  worldToAxial,
  type AxialCoord,
  type BuildingTypeCode,
  type WorldBuildingDTO,
  type WorldGenerator,
} from '@cityverse/shared';
import type { XZ } from '../farming/farmLayout';

export type BlockReason = 'building' | 'construction' | 'fence' | 'water' | 'outside';

export interface NavInputs {
  world: WorldGenerator;
  buildings: readonly Pick<WorldBuildingDTO, 'id' | 'typeCode' | 'status' | 'level' | 'footprint'>[];
  fields: readonly (readonly AxialCoord[])[];
  ranches: readonly (readonly AxialCoord[])[];
  ponds: readonly (readonly AxialCoord[])[];
}

const FIELD_COST = 1.6;
const GRASS_COST = 1;

export class VillageNav {
  /** walkable hex key → step cost */
  readonly cost = new Map<string, number>();
  readonly blocked = new Map<string, BlockReason>();
  readonly roads = new Set<string>();
  readonly version: string;

  constructor(input: NavInputs) {
    const { world } = input;
    for (const h of world.getStarterTerritory()) {
      const k = hexKey(h.q, h.r);
      const tile = world.getHexTile(h.q, h.r);
      if (tile.isWater) this.blocked.set(k, 'water');
      else this.cost.set(k, GRASS_COST);
    }
    for (const f of input.fields) for (const h of f) if (this.cost.has(hexKey(h.q, h.r))) this.cost.set(hexKey(h.q, h.r), FIELD_COST);
    const block = (hexes: readonly AxialCoord[], why: BlockReason) => {
      for (const h of hexes) {
        const k = hexKey(h.q, h.r);
        this.cost.delete(k);
        this.blocked.set(k, why);
      }
    };
    for (const r of input.ranches) block(r, 'fence');
    for (const p of input.ponds) block(p, 'water');
    for (const b of [...input.buildings].sort((a, b) => Number(a.typeCode === 'road') - Number(b.typeCode === 'road'))) {
      if (b.typeCode === 'road') {
        if (b.status === 'constructing') {
          continue;
        }
        const speed = getBuildingLevel('road', b.level)?.stats.speed ?? 1.4;
        for (const h of b.footprint) {
          const k = hexKey(h.q, h.r);
          if (this.blocked.has(k)) continue;
          this.cost.set(k, 1 / speed);
          this.roads.add(k);
        }
        continue;
      }
      block(b.footprint, b.status === 'constructing' ? 'construction' : 'building');
    }
    this.version = [...this.cost.entries()].map(([k, c]) => `${k}:${c}`).join('|');
  }

  isWalkable(key: string): boolean {
    return this.cost.has(key);
  }

  walkableAt(x: number, z: number): boolean {
    const a = worldToAxial(x, z);
    return this.cost.has(hexKey(a.q, a.r));
  }

  /** Walkable hexes next to a footprint (road first) — where people stand to enter / work. */
  approachHexes(footprint: readonly AxialCoord[]): AxialCoord[] {
    const own = new Set(footprint.map((h) => hexKey(h.q, h.r)));
    const out = new Map<string, AxialCoord>();
    for (const h of footprint) {
      for (const d of HEX_DIRECTIONS) {
        const n = { q: h.q + d.q, r: h.r + d.r };
        const k = hexKey(n.q, n.r);
        if (!own.has(k) && this.cost.has(k)) out.set(k, n);
      }
    }
    return [...out.values()].sort((a, b) => Number(this.roads.has(hexKey(b.q, b.r))) - Number(this.roads.has(hexKey(a.q, a.r))) || a.q - b.q || a.r - b.r);
  }

  nearestWalkable(from: AxialCoord): AxialCoord | null {
    if (this.cost.has(hexKey(from.q, from.r))) return from;
    let best: AxialCoord | null = null;
    let bd = Infinity;
    for (const k of this.cost.keys()) {
      const h = parseHexKey(k);
      const d = hexDistance(h, from);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  /** A* from a hex to the cheapest of several goal hexes. */
  findPath(from: AxialCoord, goals: readonly AxialCoord[]): AxialCoord[] | null {
    const start = this.nearestWalkable(from);
    const goalKeys = new Set(goals.filter((g) => this.cost.has(hexKey(g.q, g.r))).map((g) => hexKey(g.q, g.r)));
    if (!start || !goalKeys.size) return null;
    const goalList = [...goalKeys].map(parseHexKey);
    const hfn = (h: AxialCoord) => Math.min(...goalList.map((g) => hexDistance(g, h))) * 0.5; // 0.5 = cheapest road step
    const sk = hexKey(start.q, start.r);
    const g = new Map<string, number>([[sk, 0]]);
    const came = new Map<string, string>();
    const open: { k: string; f: number }[] = [{ k: sk, f: hfn(start) }];
    const closed = new Set<string>();
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i += 1) if (open[i].f < open[bi].f) bi = i;
      const { k } = open.splice(bi, 1)[0];
      if (closed.has(k)) continue;
      if (goalKeys.has(k)) {
        const out = [parseHexKey(k)];
        for (let c = k; came.has(c); c = came.get(c)!) out.push(parseHexKey(came.get(c)!));
        return out.reverse();
      }
      closed.add(k);
      const cur = parseHexKey(k);
      for (const d of HEX_DIRECTIONS) {
        const n = { q: cur.q + d.q, r: cur.r + d.r };
        const nk = hexKey(n.q, n.r);
        const step = this.cost.get(nk);
        if (step === undefined || closed.has(nk)) continue;
        // Moving costs the average of both hexes (a road only helps if you walk on it).
        const ng = g.get(k)! + (step + this.cost.get(k)!) / 2;
        if (ng < (g.get(nk) ?? Infinity)) {
          g.set(nk, ng);
          came.set(nk, k);
          open.push({ k: nk, f: ng + hfn(n) });
        }
      }
    }
    return null;
  }

  /** Point inside `from` hex, `dist` metres toward `toward`. */
  spotToward(from: AxialCoord, toward: AxialCoord, dist = 3.2): XZ {
    const a = axialToWorld(from.q, from.r);
    const b = axialToWorld(toward.q, toward.r);
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: a.x + ((b.x - a.x) / l) * dist, z: a.z + ((b.z - a.z) / l) * dist };
  }

  /** Smoothed world-space route along a hex path (lane = sideways offset, metres). */
  smooth(path: readonly AxialCoord[], start: XZ, end: XZ, lane: number): XZ[] {
    // Start → centre of the start hex and last centre → end stay inside one (convex) hex;
    // centre-to-centre legs only cross the shared edge of two neighbours.
    const pts: XZ[] = [start];
    if (path.length > 1) pts.push(axialToWorld(path[0].q, path[0].r));
    for (let i = 1; i < path.length - 1; i += 1) {
      const c = axialToWorld(path[i].q, path[i].r);
      const p = axialToWorld(path[i - 1].q, path[i - 1].r);
      const n = axialToWorld(path[i + 1].q, path[i + 1].r);
      const dx = n.x - p.x;
      const dz = n.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      pts.push({ x: c.x - (dz / l) * lane, z: c.z + (dx / l) * lane });
    }
    if (path.length > 1) pts.push(axialToWorld(path[path.length - 1].q, path[path.length - 1].r));
    pts.push(end);
    if (pts.length < 3) return pts;
    // One Chaikin pass: points at 1/4 and 3/4 of every segment.
    const out: XZ[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      if (i > 0) out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      if (i < pts.length - 2) out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  speedAt(x: number, z: number): number {
    const a = worldToAxial(x, z);
    const c = this.cost.get(hexKey(a.q, a.r));
    return c ? Math.min(2, 1 / c) : 1;
  }
}

/** Buildings / types a villager may enter: houses (sleep) and workplaces. */
export function isEnterable(typeCode: string): boolean {
  return (typeCode as BuildingTypeCode) !== 'road';
}
