/**
 * Livestock farm layout (pure, deterministic):
 *  - structure spots from the server's tile roles (barn, feeder, water trough, caretaker spot,
 *    feed storage at L2+, nursery / waste area / water tower / dividing fences at L3)
 *  - NavGrid: walkable cells strictly inside the fence and outside obstacles and walls
 *  - HexGraph: the farm's hexes as a graph — long routes are planned hex to hex first and then
 *    refined on the nav grid (A*, 8 directions, no corner cutting) with line-of-sight smoothing,
 *    so animals never walk through fences or buildings and long searches stay cheap.
 */
import {
  axialToWorld,
  createRng,
  hashSeed,
  hexDistance,
  hexKey,
  hexNeighbors,
  isMountFarmType,
  parseHexKey,
  planRanchTiles,
  worldToAxial,
  type AxialCoord,
  type LivestockFarmTypeCode,
  type RanchTile,
  type RanchTileRole,
} from '@cityverse/shared';
import { computeZoneFrame, edgeDistance, type EdgeSeg, type Spot, type XZ, type ZoneFrame } from '../farming/farmLayout';

/** Display scale of barns / troughs / pens (chibi: big and readable from the camera). */
export const STRUCTURE_SCALE = { barn: 1.5, trough: 1.4, hay: 1.3, pen: 1.2, waste: 1.3, storage: 1.25, tower: 1.2 } as const;

/** Animals keep this distance from the fence line. */
export const FENCE_MARGIN = 1.05;
export const NAV_CELL = 0.7;
/** Cells closer than this to a wall (dividing fence) are blocked. */
export const WALL_MARGIN = 0.55;

export interface Obstacle extends XZ {
  r: number;
}

export interface Wall {
  a: XZ;
  b: XZ;
}

export interface RanchLayout {
  frame: ZoneFrame;
  tiles: RanchTile[];
  barn: Spot;
  feeder: Spot;
  water: Spot;
  /** Where the caretaker stands (facing the animals) */
  caretaker: Spot;
  /** L2+: feed storage shed */
  storage: Spot | null;
  /** L3: nursery pen for young animals */
  pen: Spot | null;
  /** L3: waste processing */
  waste: Spot | null;
  /** L3: water tower feeding the troughs by pipe */
  tower: Spot | null;
  /** L3: low dividing fences that split the yard into sections */
  walls: Wall[];
  obstacles: Obstacle[];
  nav: NavGrid;
  hexGraph: HexGraph;
  /** Where animals stand to eat / drink / rest */
  feedPoints: XZ[];
  drinkPoints: XZ[];
  restPoints: XZ[];
  /** L3: resting spots inside the nursery (young animals) */
  nurseryPoints: XZ[];
  /** Phase 9 stables / camps: training yard (L2+), its lap, care area and manager house / tower */
  arena: Spot | null;
  /** Walkable lap for training / ridden / cargo animals (around the yard, or the paddock at L1) */
  loop: XZ[];
  vet: Spot | null;
  office: Spot | null;
  /** Elephant camps: the water hex is a bathing pond (radius) instead of a trough */
  pond: number;
  /** Extra clearance kept from fences / buildings (big animals) */
  clearance: number;
}

export interface RanchLayoutInput {
  id: string;
  farmType: LivestockFarmTypeCode;
  level: number;
  hexes: readonly AxialCoord[];
  /** Tile roles from the server (computed locally when missing) */
  tiles?: readonly RanchTile[];
}

/** Barn footprint radius per farm type (cows need a bigger barn). */
export const BARN_RADIUS: Record<LivestockFarmTypeCode, number> = {
  chicken_farm: 2.6 * STRUCTURE_SCALE.barn,
  pig_farm: 2.9 * STRUCTURE_SCALE.barn,
  cattle_farm: 3.4 * STRUCTURE_SCALE.barn,
  sheep_farm: 3.0 * STRUCTURE_SCALE.barn,
  horse_stable: 3.5 * STRUCTURE_SCALE.barn,
  elephant_camp: 3.9 * STRUCTURE_SCALE.barn,
};

/** Extra distance big animals keep from fences and buildings (their body is wider). */
export const NAV_CLEARANCE: Record<LivestockFarmTypeCode, number> = {
  chicken_farm: 0,
  pig_farm: 0,
  cattle_farm: 0,
  sheep_farm: 0,
  horse_stable: 0.35,
  elephant_camp: 1.0,
};

/** Bathing pond radius of an elephant camp by level (bigger at L2+). */
export const pondRadius = (level: number): number => (level >= 2 ? 3.3 : 2.6);

export function computeRanchLayout(input: RanchLayoutInput): RanchLayout {
  const frame = computeZoneFrame(input.hexes);
  const rng = createRng(hashSeed(`ranch:${input.id}`));
  const tiles = input.tiles?.length === input.hexes.length ? [...input.tiles] : planRanchTiles(input.hexes, input.level, input.farmType);
  const mount = isMountFarmType(input.farmType);
  const clearance = NAV_CLEARANCE[input.farmType];
  const pond = input.farmType === 'elephant_camp' ? pondRadius(input.level) : 0;
  const roleHex = (role: RanchTileRole): AxialCoord | null => tiles.find((t) => t.role === role) ?? null;
  const isBoundary = (h: AxialCoord): boolean => (frame.outsideDirs.get(hexKey(h.q, h.r))?.length ?? 0) > 0;
  const center = (h: AxialCoord): Spot => {
    const c = axialToWorld(h.q, h.r);
    return { x: c.x, z: c.z, ry: Math.atan2(frame.centroid.x - c.x, frame.centroid.z - c.z), hex: h };
  };
  /** Spot on a hex: pushed toward the fence on boundary hexes, the hex centre otherwise. */
  const spot = (h: AxialCoord, push: number): Spot => (isBoundary(h) ? frame.spotOn(h, push) : center(h));
  const usedBoundary = new Set<string>();
  const fallbackBoundary = (): AxialCoord => {
    const h = frame.boundary.find((b) => !usedBoundary.has(hexKey(b.q, b.r))) ?? frame.boundary[0];
    usedBoundary.add(hexKey(h.q, h.r));
    return h;
  };
  const claim = (h: AxialCoord | null): AxialCoord | null => {
    if (h) usedBoundary.add(hexKey(h.q, h.r));
    return h;
  };

  const barnHex = claim(roleHex('barn')) ?? fallbackBoundary();
  const barn = spot(barnHex, 0.5);
  const waterHex = claim(roleHex('water')) ?? fallbackBoundary();
  // The elephants' pond needs room: it sits nearer the hex centre than a trough.
  const water = spot(waterHex, pond ? 0.9 : 2.1);
  const feederHex = roleHex('feeder') ?? frame.sorted[Math.floor(frame.sorted.length / 2)];
  const fc = center(feederHex);
  const feeder: Spot = { x: (fc.x + frame.centroid.x) / 2, z: (fc.z + frame.centroid.z) / 2, ry: rng() * Math.PI, hex: feederHex };

  // Caretaker: in front of the barn door, turned toward the yard.
  const doorReach = BARN_RADIUS[input.farmType] + 1.3;
  const door = { x: barn.x + Math.sin(barn.ry) * doorReach, z: barn.z + Math.cos(barn.ry) * doorReach };
  const sideX = Math.cos(barn.ry);
  const sideZ = -Math.sin(barn.ry);
  const caretaker: Spot = {
    x: door.x + sideX * 1.8,
    z: door.z + sideZ * 1.8,
    ry: barn.ry,
    hex: claim(roleHex('caretaker')) ?? barnHex,
  };

  let storage: Spot | null = null;
  if (input.level >= 2) {
    const h = claim(roleHex('storage'));
    // Small farms: the feed store sits right beside the barn.
    storage = h ? spot(h, 1.7) : spotBeside(barn, BARN_RADIUS[input.farmType] + 1.6, -1.2);
  }
  let pen: Spot | null = null;
  let waste: Spot | null = null;
  let tower: Spot | null = null;
  const walls: Wall[] = [];
  let arena: Spot | null = null;
  let vet: Spot | null = null;
  let office: Spot | null = null;
  if (mount) {
    const a = roleHex('arena');
    if (input.level >= 2 && a) arena = center(a);
    const v = input.level >= 2 ? claim(roleHex('vet')) : null;
    if (v) vet = spot(v, 1.8);
    const o = input.level >= 3 ? claim(roleHex('office')) : null;
    if (o) office = spot(o, 1.9);
  }
  if (input.level >= 3 && !mount) {
    pen = spot(claim(roleHex('nursery')) ?? fallbackBoundary(), 1.6);
    waste = spot(claim(roleHex('waste')) ?? fallbackBoundary(), 1.8);
    // Water tower beside the trough, pipe runs to it.
    tower = spotBeside(water, 2.2, 0.4);
  }

  const obstacles: Obstacle[] = [
    { x: barn.x, z: barn.z, r: BARN_RADIUS[input.farmType] },
    { x: feeder.x, z: feeder.z, r: 1.15 * STRUCTURE_SCALE.trough },
    { x: water.x, z: water.z, r: pond || 1.0 * STRUCTURE_SCALE.trough },
    { x: caretaker.x, z: caretaker.z, r: 0.75 },
  ];
  if (storage) obstacles.push({ x: storage.x, z: storage.z, r: 1.15 * STRUCTURE_SCALE.storage });
  if (pen) obstacles.push({ x: pen.x, z: pen.z, r: 2.3 * STRUCTURE_SCALE.pen });
  if (waste) obstacles.push({ x: waste.x, z: waste.z, r: 1.9 * STRUCTURE_SCALE.waste });
  if (tower) obstacles.push({ x: tower.x, z: tower.z, r: 0.95 * STRUCTURE_SCALE.tower });
  // Training yard: open ground with a small jump / log in the middle (horses circle around it).
  if (arena) obstacles.push({ x: arena.x, z: arena.z, r: 0.9 });
  if (vet) obstacles.push({ x: vet.x, z: vet.z, r: 1.6 });
  if (office) obstacles.push({ x: office.x, z: office.z, r: input.farmType === 'elephant_camp' ? 1.2 : 1.7 });

  let nav = new NavGrid(frame, obstacles, walls, NAV_CELL, clearance);
  const regions = nav.componentCount();
  if (input.level >= 3 && !mount) {
    // Dividing fences on interior hex edges (gaps at both ends); keep one only if the yard stays connected.
    const near = (e: EdgeSeg, s: Spot | null) => s !== null && Math.hypot((e.a.x + e.b.x) / 2 - s.x, (e.a.z + e.b.z) / 2 - s.z) < 4.5;
    const candidates = frame.interiorEdges
      .filter((e) => !near(e, feeder) && !near(e, water) && !near(e, barn) && !near(e, caretaker))
      .filter((e, i) => (hashSeed(`${input.id}:${hexKey(e.hex.q, e.hex.r)}:${e.dir}`) + i) % 3 === 0)
      .slice(0, 6);
    for (const e of candidates) {
      const p0 = e.a;
      const p1 = e.b;
      const wall = { a: lerp(p0, p1, 0.22), b: lerp(p0, p1, 0.78) };
      const trial = new NavGrid(frame, obstacles, [...walls, wall], NAV_CELL, clearance);
      // A wall may never cut the yard into more regions than the fence and buildings already do.
      if (trial.componentCount() <= regions && trial.walkableCount > nav.walkableCount * 0.85) {
        walls.push(wall);
        nav = trial;
      }
    }
  }
  nav.pruneToLargest();

  const ring = (c: XZ, r: number, n: number): XZ[] =>
    Array.from({ length: n }, (_, i) => ({ x: c.x + Math.cos((i / n) * Math.PI * 2) * r, z: c.z + Math.sin((i / n) * Math.PI * 2) * r })).filter((p) =>
      nav.isWalkable(p.x, p.z)
    );
  const feedPoints = ring(feeder, 1.15 * STRUCTURE_SCALE.trough + 1.0, 10);
  const drinkPoints = ring(water, (pond || 1.0 * STRUCTURE_SCALE.trough) + 0.95 + clearance, pond ? 12 : 8);
  const restPoints = ring(barn, BARN_RADIUS[input.farmType] + 1.2, 12);
  const nurseryPoints = pen ? ring(pen, 2.3 * STRUCTURE_SCALE.pen + 0.9, 8) : [];
  // Lap for training / riding / cargo: around the yard (L2+) or the middle of the paddock (L1).
  let loop: XZ[] = [];
  if (mount) {
    const c = arena ?? frame.centroid;
    for (const r of [3.8 + clearance, 3.2 + clearance, 4.6 + clearance, 2.6 + clearance]) {
      const pts = ring(c, r, 16);
      if (pts.length >= 6) {
        loop = pts;
        break;
      }
    }
    if (!loop.length) loop = [nav.nearestWalkable(c.x, c.z) ?? nav.randomWalkable(rng)];
  }

  return {
    frame,
    tiles,
    barn,
    feeder,
    water,
    caretaker,
    storage,
    pen,
    waste,
    tower,
    walls,
    obstacles,
    nav,
    hexGraph: new HexGraph(frame, nav),
    feedPoints: feedPoints.length ? feedPoints : [nav.randomWalkable(rng)],
    drinkPoints: drinkPoints.length ? drinkPoints : [nav.randomWalkable(rng)],
    restPoints: restPoints.length ? restPoints : [nav.randomWalkable(rng)],
    nurseryPoints,
    arena,
    loop,
    vet,
    office,
    pond,
    clearance,
  };

  function spotBeside(s: Spot, along: number, side: number): Spot {
    const fx = Math.sin(s.ry);
    const fz = Math.cos(s.ry);
    return { x: s.x + fx * side + fz * along, z: s.z + fz * side - fx * along, ry: s.ry, hex: s.hex };
  }
}

const lerp = (a: XZ, b: XZ, t: number): XZ => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

function segmentDistance(p: XZ, w: Wall): number {
  const vx = w.b.x - w.a.x;
  const vz = w.b.z - w.a.z;
  const len2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * vx + (p.z - w.a.z) * vz) / len2));
  return Math.hypot(p.x - (w.a.x + vx * t), p.z - (w.a.z + vz * t));
}

// ─────────────────────────────────────────────────────────────────────────────
// Hex graph: coarse routing over the farm's hexes
// ─────────────────────────────────────────────────────────────────────────────
export class HexGraph {
  /** Hex key → walkable waypoint near its centre (hexes fully covered by buildings are absent) */
  readonly waypoints = new Map<string, XZ>();

  constructor(frame: ZoneFrame, nav: NavGrid) {
    for (const h of frame.sorted) {
      const c = axialToWorld(h.q, h.r);
      const w = nav.isWalkable(c.x, c.z) ? c : nav.nearestWalkable(c.x, c.z);
      if (!w) continue;
      const a = worldToAxial(w.x, w.z);
      if (a.q === h.q && a.r === h.r) this.waypoints.set(hexKey(h.q, h.r), { x: w.x, z: w.z });
    }
  }

  /** Shortest hex path (keys, inclusive) between two farm hexes, or null. */
  findHexPath(from: string, to: string): string[] | null {
    if (!this.waypoints.has(from) || !this.waypoints.has(to)) return null;
    if (from === to) return [from];
    const prev = new Map<string, string>([[from, from]]);
    const queue = [from];
    const goal = parseHexKey(to);
    while (queue.length) {
      // Greedy-ordered BFS (uniform edge cost) — the graph has at most 40 nodes.
      queue.sort((a, b) => hexDistance(parseHexKey(a), goal) - hexDistance(parseHexKey(b), goal));
      const cur = queue.shift()!;
      if (cur === to) break;
      for (const n of hexNeighbors(parseHexKey(cur))) {
        const k = hexKey(n.q, n.r);
        if (prev.has(k) || !this.waypoints.has(k)) continue;
        prev.set(k, cur);
        queue.push(k);
      }
    }
    if (!prev.has(to)) return null;
    const out = [to];
    for (let k = to; k !== from; k = prev.get(k)!) out.push(prev.get(k)!);
    return out.reverse();
  }
}

/**
 * Route from a to b: hex graph first (far targets), then each leg refined on the nav grid and
 * the whole path string-pulled. Falls back to a single A* search when a leg fails.
 */
export function routePath(layout: RanchLayout, a: XZ, b: XZ): XZ[] | null {
  const ha = worldToAxial(a.x, a.z);
  const hb = worldToAxial(b.x, b.z);
  if (hexDistance(ha, hb) <= 2) return layout.nav.findPath(a, b);
  const keys = layout.hexGraph.findHexPath(hexKey(ha.q, ha.r), hexKey(hb.q, hb.r));
  if (!keys || keys.length < 3) return layout.nav.findPath(a, b);
  const via = keys.slice(1, -1).map((k) => layout.hexGraph.waypoints.get(k)!);
  const cells: XZ[] = [];
  let from = a;
  for (const target of [...via, b]) {
    const leg = layout.nav.findPath(from, target, 1500);
    if (!leg) return layout.nav.findPath(a, b);
    cells.push(...leg);
    from = target;
  }
  return layout.nav.smooth(a, cells);
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation grid + A*
// ─────────────────────────────────────────────────────────────────────────────
const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export class NavGrid {
  readonly x0: number;
  readonly z0: number;
  readonly w: number;
  readonly h: number;
  readonly walk: Uint8Array;
  walkableCount: number;

  constructor(frame: ZoneFrame, obstacles: readonly Obstacle[], walls: readonly Wall[] = [], cell = NAV_CELL, clearance = 0) {
    this.cell = cell;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const c of frame.centers) {
      minX = Math.min(minX, c.x - 6);
      minZ = Math.min(minZ, c.z - 6);
      maxX = Math.max(maxX, c.x + 6);
      maxZ = Math.max(maxZ, c.z + 6);
    }
    this.x0 = minX;
    this.z0 = minZ;
    this.w = Math.ceil((maxX - minX) / cell);
    this.h = Math.ceil((maxZ - minZ) / cell);
    this.walk = new Uint8Array(this.w * this.h);
    let n = 0;
    for (let j = 0; j < this.h; j += 1) {
      for (let i = 0; i < this.w; i += 1) {
        const p = this.center(i, j);
        const a = worldToAxial(p.x, p.z);
        const key = hexKey(a.q, a.r);
        if (!frame.keys.has(key)) continue;
        const outs = frame.outsideDirs.get(key) ?? [];
        const hc = frame.spotOn(a, 0);
        if (outs.some((dir) => edgeDistance(p, hc, dir) < FENCE_MARGIN + clearance)) continue;
        if (obstacles.some((o) => Math.hypot(p.x - o.x, p.z - o.z) < o.r + 0.35 + clearance)) continue;
        if (walls.some((w) => segmentDistance(p, w) < WALL_MARGIN + clearance)) continue;
        this.walk[j * this.w + i] = 1;
        n += 1;
      }
    }
    this.walkableCount = n;
  }

  private readonly cell: number;

  /** Keeps only the largest connected region walkable, so no animal can spawn in a pocket. */
  pruneToLargest(): void {
    const label = new Int32Array(this.walk.length).fill(-1);
    const sizes: number[] = [];
    for (let start = 0; start < this.walk.length; start += 1) {
      if (!this.walk[start] || label[start] >= 0) continue;
      const id = sizes.length;
      let size = 0;
      label[start] = id;
      const stack = [start];
      while (stack.length) {
        const c = stack.pop()!;
        size += 1;
        const i = c % this.w;
        const j = (c - i) / this.w;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (!this.isCellWalkable(i + di, j + dj)) continue;
          const k = (j + dj) * this.w + i + di;
          if (label[k] >= 0) continue;
          label[k] = id;
          stack.push(k);
        }
      }
      sizes.push(size);
    }
    if (sizes.length <= 1) return;
    const keep = sizes.indexOf(Math.max(...sizes));
    let n = 0;
    for (let k = 0; k < this.walk.length; k += 1) {
      if (this.walk[k] && label[k] !== keep) this.walk[k] = 0;
      n += this.walk[k];
    }
    this.walkableCount = n;
  }

  /** Number of 4-connected walkable regions (fence corners can leave tiny pockets). */
  componentCount(): number {
    const seen = new Uint8Array(this.walk.length);
    let count = 0;
    for (let start = 0; start < this.walk.length; start += 1) {
      if (!this.walk[start] || seen[start]) continue;
      count += 1;
      seen[start] = 1;
      const stack = [start];
      while (stack.length) {
        const c = stack.pop()!;
        const i = c % this.w;
        const j = (c - i) / this.w;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = i + di;
          const nj = j + dj;
          if (!this.isCellWalkable(ni, nj)) continue;
          const k = nj * this.w + ni;
          if (seen[k]) continue;
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    return count;
  }

  /** String-pulling: drops points while the straight line from the last kept point stays walkable. */
  smooth(start: XZ, cells: readonly XZ[]): XZ[] {
    const out: XZ[] = [];
    let anchor = start;
    for (let k = 0; k < cells.length; k += 1) {
      const next = cells[k + 1];
      if (next && this.lineOfSight(anchor, next)) continue;
      out.push(cells[k]);
      anchor = cells[k];
    }
    return out;
  }

  center(i: number, j: number): XZ {
    return { x: this.x0 + (i + 0.5) * this.cell, z: this.z0 + (j + 0.5) * this.cell };
  }

  toCell(x: number, z: number): [number, number] {
    return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)];
  }

  isCellWalkable(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.w && j < this.h && this.walk[j * this.w + i] === 1;
  }

  isWalkable(x: number, z: number): boolean {
    const [i, j] = this.toCell(x, z);
    return this.isCellWalkable(i, j);
  }

  /** Nearest walkable cell centre (spiral search). */
  nearestWalkable(x: number, z: number): XZ | null {
    const [ci, cj] = this.toCell(x, z);
    for (let r = 0; r < 40; r += 1) {
      for (let dj = -r; dj <= r; dj += 1) {
        for (let di = -r; di <= r; di += 1) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.isCellWalkable(ci + di, cj + dj)) return this.center(ci + di, cj + dj);
        }
      }
    }
    return null;
  }

  randomWalkable(rng: () => number): XZ {
    for (let k = 0; k < 200; k += 1) {
      const i = Math.floor(rng() * this.w);
      const j = Math.floor(rng() * this.h);
      if (this.isCellWalkable(i, j)) return this.center(i, j);
    }
    for (let idx = 0; idx < this.walk.length; idx += 1) {
      if (this.walk[idx]) return this.center(idx % this.w, Math.floor(idx / this.w));
    }
    return { x: this.x0, z: this.z0 };
  }

  /**
   * True when the straight segment a→b only touches walkable cells. Exact grid traversal
   * (Amanatides–Woo): every cell the segment passes through is checked, and when it passes
   * exactly through a cell corner both side cells must be free (no squeezing past a corner).
   */
  lineOfSight(a: XZ, b: XZ): boolean {
    let [i, j] = this.toCell(a.x, a.z);
    const [ti, tj] = this.toCell(b.x, b.z);
    if (!this.isCellWalkable(i, j)) return false;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const stepI = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepJ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const cellX = (k: number): number => this.x0 + k * this.cell;
    const cellZ = (k: number): number => this.z0 + k * this.cell;
    let tMaxX = stepI === 0 ? Infinity : ((stepI > 0 ? cellX(i + 1) : cellX(i)) - a.x) / dx;
    let tMaxZ = stepJ === 0 ? Infinity : ((stepJ > 0 ? cellZ(j + 1) : cellZ(j)) - a.z) / dz;
    const tDeltaX = stepI === 0 ? Infinity : this.cell / Math.abs(dx);
    const tDeltaZ = stepJ === 0 ? Infinity : this.cell / Math.abs(dz);
    for (let guard = 0; guard < 4096 && (i !== ti || j !== tj); guard += 1) {
      if (Math.abs(tMaxX - tMaxZ) < 1e-9) {
        // Exactly through a corner: both neighbours must be walkable.
        if (!this.isCellWalkable(i + stepI, j) || !this.isCellWalkable(i, j + stepJ)) return false;
        i += stepI;
        j += stepJ;
        tMaxX += tDeltaX;
        tMaxZ += tDeltaZ;
      } else if (tMaxX < tMaxZ) {
        i += stepI;
        tMaxX += tDeltaX;
      } else {
        j += stepJ;
        tMaxZ += tDeltaZ;
      }
      if (tMaxX > 1 + 1e-9 && tMaxZ > 1 + 1e-9 && (i !== ti || j !== tj)) {
        // Numerical guard: we've passed b.
        return this.isCellWalkable(ti, tj);
      }
      if (!this.isCellWalkable(i, j)) return false;
    }
    return true;
  }

  /** A* path from a to b over walkable cells (smoothed); null if unreachable. */
  findPath(a: XZ, b: XZ, maxExpanded = 6000): XZ[] | null {
    const start = this.isWalkable(a.x, a.z) ? a : this.nearestWalkable(a.x, a.z);
    const goal = this.isWalkable(b.x, b.z) ? b : this.nearestWalkable(b.x, b.z);
    if (!start || !goal) return null;
    const [si, sj] = this.toCell(start.x, start.z);
    const [gi, gj] = this.toCell(goal.x, goal.z);
    const W = this.w;
    const sIdx = sj * W + si;
    const gIdx = gj * W + gi;
    if (sIdx === gIdx) return [goal];

    const g = new Float32Array(this.walk.length).fill(Infinity);
    const came = new Int32Array(this.walk.length).fill(-1);
    const closed = new Uint8Array(this.walk.length);
    const heap = new MinHeap();
    const hfn = (i: number, j: number): number => {
      const dx = Math.abs(i - gi);
      const dz = Math.abs(j - gj);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    g[sIdx] = 0;
    heap.push(sIdx, hfn(si, sj));
    let expanded = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === gIdx) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (++expanded > maxExpanded) return null;
      const ci = cur % W;
      const cj = (cur - ci) / W;
      for (const [di, dj, cost] of DIRS) {
        const ni = ci + di;
        const nj = cj + dj;
        if (!this.isCellWalkable(ni, nj)) continue;
        // No corner cutting: a diagonal step needs both orthogonal cells free.
        if (di && dj && (!this.isCellWalkable(ci + di, cj) || !this.isCellWalkable(ci, cj + dj))) continue;
        const ni2 = nj * W + ni;
        const ng = g[cur] + cost;
        if (ng < g[ni2]) {
          g[ni2] = ng;
          came[ni2] = cur;
          heap.push(ni2, ng + hfn(ni, nj));
        }
      }
    }
    if (came[gIdx] === -1) return null;
    const cells: XZ[] = [];
    for (let c = gIdx; c !== sIdx; c = came[c]) cells.push(this.center(c % W, Math.floor(c / W)));
    cells.reverse();
    cells[cells.length - 1] = goal;
    return this.smooth(start, cells);
  }
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.ids.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
