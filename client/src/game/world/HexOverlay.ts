/**
 * HexOverlay — the hex grid as a visual layer on top of the seamless terrain.
 *
 *  Normal mode: only the territory border ribbon is visible.
 *  Build mode : per-chunk hex edge lines (owned / buildable / blocked / water colours),
 *               owned-land tint, hover highlight and selection.
 *
 * All geometry is draped on the rendered terrain via WorldChunkManager.sampleHeight, and lives
 * in its own group so terrain meshes are never modified.
 */
import * as THREE from 'three';
import {
  HEX_DIRECTIONS,
  axialToWorld,
  getHexEdgeCorners,
  getHexPolygon,
  hexKey,
  isWithinWorldBounds,
  type AxialCoord,
  type HexTile,
  type WorldGenerator,
} from '@cityverse/shared';
import type { ChunkEvent, WorldChunkManager } from './WorldChunkManager';

export type HeightSampler = (x: number, z: number) => number;

const LINE_LIFT = 0.16;
const FILL_LIFT = 0.1;
const GRID_RADIUS = 260;

const COLORS = {
  owned: new THREE.Color('#fff3c4'),
  buildable: new THREE.Color('#ffffff'),
  blocked: new THREE.Color('#ff8f7a'),
  water: new THREE.Color('#bdefff'),
  border: new THREE.Color('#ffc94d'),
  ownedFill: new THREE.Color('#7ef0b0'),
  hoverOk: new THREE.Color('#7dff9c'),
  hoverClaim: new THREE.Color('#ffe066'),
  hoverBlocked: new THREE.Color('#ff6b5a'),
  selected: new THREE.Color('#5fd4ff'),
};

/** Triangulated, terrain-following hex fill (6 sectors × k² triangles). */
export function buildDrapedHexFill(hexes: readonly AxialCoord[], height: HeightSampler, lift: number, k = 3, scale = 0.97): Float32Array {
  const out: number[] = [];
  const pt = (x: number, z: number): void => {
    out.push(x, height(x, z) + lift, z);
  };
  for (const h of hexes) {
    const c = axialToWorld(h.q, h.r);
    const poly = getHexPolygon(h.q, h.r, undefined, scale);
    for (let s = 0; s < 6; s += 1) {
      const a = poly[s];
      const b = poly[(s + 1) % 6];
      // Barycentric subdivision of triangle (c, a, b).
      const P = (i: number, j: number): [number, number] => {
        const u = i / k;
        const v = j / k;
        return [c.x + (a.x - c.x) * u + (b.x - c.x) * v, c.z + (a.z - c.z) * u + (b.z - c.z) * v];
      };
      for (let i = 0; i < k; i += 1) {
        for (let j = 0; j < k - i; j += 1) {
          const p0 = P(i, j);
          const p1 = P(i + 1, j);
          const p2 = P(i, j + 1);
          pt(p0[0], p0[1]);
          pt(p2[0], p2[1]);
          pt(p1[0], p1[1]);
          if (j < k - i - 1) {
            const p3 = P(i + 1, j + 1);
            pt(p1[0], p1[1]);
            pt(p2[0], p2[1]);
            pt(p3[0], p3[1]);
          }
        }
      }
    }
  }
  return Float32Array.from(out);
}

/** Appends a terrain-following polyline segment list for one edge. */
function pushDrapedEdge(
  out: number[],
  colors: number[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  height: HeightSampler,
  color: THREE.Color,
  segments = 4
): void {
  let px = x0;
  let pz = z0;
  let py = height(px, pz) + LINE_LIFT;
  for (let s = 1; s <= segments; s += 1) {
    const t = s / segments;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const y = height(x, z) + LINE_LIFT;
    out.push(px, py, pz, x, y, z);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    px = x;
    py = y;
    pz = z;
  }
}

function edgeColor(a: HexTile, b: HexTile | null, owned: (t: HexTile) => boolean): THREE.Color {
  const ao = owned(a);
  const bo = b ? owned(b) : false;
  if (ao && bo) return COLORS.owned;
  if (ao !== bo) return COLORS.border;
  if (a.isWater && (!b || b.isWater)) return COLORS.water;
  if (!a.buildable || (b && !b.buildable)) return COLORS.blocked;
  return COLORS.buildable;
}

export class HexOverlay {
  readonly group = new THREE.Group();
  private readonly buildGroup = new THREE.Group();
  private readonly gridLines = new Map<string, THREE.LineSegments>();
  private readonly lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  private readonly fillMaterial = (color: THREE.Color, opacity: number): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  private readonly borderMesh: THREE.Mesh;
  private readonly borderLine: THREE.LineSegments;
  private readonly ownedFill: THREE.Mesh;
  private readonly hoverFill: THREE.Mesh;
  private readonly hoverLine: THREE.LineSegments;
  private readonly selectionFill: THREE.Mesh;
  private readonly dirtyChunks = new Set<string>();
  private territoryDirty = true;
  private mode: 'normal' | 'build' = 'normal';
  private hoverKey: string | null = null;
  private selectionKeys = '';
  private readonly unsubscribe: () => void;
  private readonly territoryChunks: Set<string>;

  constructor(
    private readonly world: WorldGenerator,
    private readonly manager: WorldChunkManager
  ) {
    this.group.name = 'HexOverlay';
    this.buildGroup.name = 'HexOverlay:build';
    this.buildGroup.visible = false;
    this.group.add(this.buildGroup);

    this.borderMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.fillMaterial(COLORS.border, 0.92));
    this.borderMesh.renderOrder = 5;
    this.borderLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#fff8e0', transparent: true, opacity: 0.9, depthWrite: false })
    );
    this.borderLine.renderOrder = 6;
    this.ownedFill = new THREE.Mesh(new THREE.BufferGeometry(), this.fillMaterial(COLORS.ownedFill, 0.16));
    this.ownedFill.renderOrder = 3;
    this.hoverFill = new THREE.Mesh(new THREE.BufferGeometry(), this.fillMaterial(COLORS.hoverOk, 0.38));
    this.hoverFill.renderOrder = 7;
    this.hoverLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false })
    );
    this.hoverLine.renderOrder = 8;
    this.selectionFill = new THREE.Mesh(new THREE.BufferGeometry(), this.fillMaterial(COLORS.selected, 0.42));
    this.selectionFill.renderOrder = 7;
    for (const o of [this.borderMesh, this.borderLine, this.ownedFill, this.hoverFill, this.hoverLine, this.selectionFill]) {
      o.frustumCulled = false;
      o.matrixAutoUpdate = false;
    }
    this.group.add(this.borderMesh, this.borderLine);
    this.buildGroup.add(this.ownedFill, this.hoverFill, this.hoverLine, this.selectionFill);

    this.territoryChunks = new Set(
      world.getStarterTerritory().map((h) => {
        const t = world.getHexTile(h.q, h.r);
        return `${t.chunkX}:${t.chunkZ}`;
      })
    );
    this.unsubscribe = manager.subscribe((e) => this.onChunkEvent(e));
  }

  refreshTerritory(): void {
    this.territoryDirty = true;
    for (const c of this.manager.getLiveChunks()) this.dirtyChunks.add(c.key);
  }

  setMode(mode: 'normal' | 'build'): void {
    this.mode = mode;
    this.buildGroup.visible = mode === 'build';
    if (mode === 'build') for (const c of this.manager.getLiveChunks()) this.dirtyChunks.add(c.key);
  }

  setHover(tile: HexTile | null): void {
    const key = tile?.key ?? null;
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    if (!tile) {
      this.hoverFill.visible = false;
      this.hoverLine.visible = false;
      return;
    }
    const height = this.height;
    const owned = this.world.isOwned(tile.q, tile.r);
    const color = !tile.buildable ? COLORS.hoverBlocked : owned ? COLORS.hoverOk : COLORS.hoverClaim;
    (this.hoverFill.material as THREE.MeshBasicMaterial).color.copy(color);
    setPositions(this.hoverFill.geometry, buildDrapedHexFill([tile], height, FILL_LIFT + 0.02, 4, 0.94));
    const lines: number[] = [];
    const cols: number[] = [];
    const poly = getHexPolygon(tile.q, tile.r, undefined, 0.97);
    for (let i = 0; i < 6; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % 6];
      pushDrapedEdge(lines, cols, a.x, a.z, b.x, b.z, height, COLORS.buildable, 5);
    }
    setPositions(this.hoverLine.geometry, Float32Array.from(lines));
    this.hoverFill.visible = true;
    this.hoverLine.visible = true;
  }

  setSelection(hexes: readonly AxialCoord[]): void {
    const keys = hexes.map((h) => hexKey(h.q, h.r)).join('|');
    if (keys === this.selectionKeys) return;
    this.selectionKeys = keys;
    setPositions(this.selectionFill.geometry, buildDrapedHexFill(hexes, this.height, FILL_LIFT + 0.01, 3, 0.9));
    this.selectionFill.visible = hexes.length > 0;
  }

  /** Rebuilds dirty overlay pieces (bounded work per frame); call once per frame. */
  update(): void {
    if (this.territoryDirty) {
      this.territoryDirty = false;
      this.rebuildTerritory();
    }
    if (this.mode !== 'build') return;

    for (const [key, lines] of this.gridLines) {
      const live = this.manager.getChunk(key);
      if (!live || live.distance > GRID_RADIUS + 60) {
        this.buildGroup.remove(lines);
        lines.geometry.dispose();
        this.gridLines.delete(key);
      }
    }
    let budget = 2; // chunks per frame
    for (const chunk of this.manager.getLiveChunks()) {
      if (budget <= 0) break;
      if (!chunk.terrain || chunk.distance > GRID_RADIUS) continue;
      if (this.gridLines.has(chunk.key) && !this.dirtyChunks.has(chunk.key)) continue;
      this.dirtyChunks.delete(chunk.key);
      this.rebuildChunkGrid(chunk.key, chunk.tiles);
      budget -= 1;
    }
  }

  get gridChunkCount(): number {
    return this.gridLines.size;
  }

  dispose(): void {
    this.unsubscribe();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
    this.gridLines.clear();
  }

  private readonly height: HeightSampler = (x, z) => this.manager.sampleHeight(x, z);

  private onChunkEvent(e: ChunkEvent): void {
    if (e.type === 'terrain') {
      this.dirtyChunks.add(e.chunk.key);
      if (this.territoryChunks.has(e.chunk.key)) this.territoryDirty = true;
      if (this.hoverKey) {
        // Re-drape hover on the new surface.
        const k = this.hoverKey;
        this.hoverKey = null;
        const [q, r] = k.split(',').map(Number);
        this.setHover(this.world.getHexTile(q, r));
      }
    } else if (e.type === 'unload') {
      const lines = this.gridLines.get(e.key);
      if (lines) {
        this.buildGroup.remove(lines);
        lines.geometry.dispose();
        this.gridLines.delete(e.key);
      }
    }
  }

  private rebuildChunkGrid(key: string, tiles: readonly HexTile[]): void {
    const positions: number[] = [];
    const colors: number[] = [];
    const owned = (t: HexTile): boolean => this.world.isOwned(t.q, t.r);
    for (const tile of tiles) {
      const poly = getHexPolygon(tile.q, tile.r);
      for (let dir = 0; dir < 6; dir += 1) {
        const d = HEX_DIRECTIONS[dir];
        const nq = tile.q + d.q;
        const nr = tile.r + d.r;
        const neighbourExists = isWithinWorldBounds(nq, nr);
        // Each shared edge is drawn once (by directions 0–2); world-edge sides are always drawn.
        if (dir > 2 && neighbourExists) continue;
        const nb = neighbourExists ? this.world.getHexTile(nq, nr) : null;
        const [ia, ib] = getHexEdgeCorners(dir);
        pushDrapedEdge(positions, colors, poly[ia].x, poly[ia].z, poly[ib].x, poly[ib].z, this.height, edgeColor(tile, nb, owned), 3);
      }
    }
    let lines = this.gridLines.get(key);
    if (!lines) {
      lines = new THREE.LineSegments(new THREE.BufferGeometry(), this.lineMaterial);
      lines.name = `grid:${key}`;
      lines.renderOrder = 4;
      lines.matrixAutoUpdate = false;
      this.gridLines.set(key, lines);
      this.buildGroup.add(lines);
    }
    lines.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    lines.geometry = geo;
  }

  private rebuildTerritory(): void {
    const territory = this.world.getOwnedTerritory();
    setPositions(this.ownedFill.geometry, buildDrapedHexFill(territory, this.height, FILL_LIFT, 2, 1));

    // Border ribbon: quad strip on the inner side of each border edge.
    const ribbon: number[] = [];
    const outline: number[] = [];
    const outlineColors: number[] = [];
    const width = 0.85;
    const seg = 4;
    for (const e of this.world.getTerritoryBorderEdges()) {
      const poly = getHexPolygon(e.q, e.r);
      const inner = getHexPolygon(e.q, e.r, undefined, 1 - width / 5.7735);
      const [ia, ib] = e.corners;
      for (let s = 0; s < seg; s += 1) {
        const t0 = s / seg;
        const t1 = (s + 1) / seg;
        const ox0 = poly[ia].x + (poly[ib].x - poly[ia].x) * t0;
        const oz0 = poly[ia].z + (poly[ib].z - poly[ia].z) * t0;
        const ox1 = poly[ia].x + (poly[ib].x - poly[ia].x) * t1;
        const oz1 = poly[ia].z + (poly[ib].z - poly[ia].z) * t1;
        const ix0 = inner[ia].x + (inner[ib].x - inner[ia].x) * t0;
        const iz0 = inner[ia].z + (inner[ib].z - inner[ia].z) * t0;
        const ix1 = inner[ia].x + (inner[ib].x - inner[ia].x) * t1;
        const iz1 = inner[ia].z + (inner[ib].z - inner[ia].z) * t1;
        const y = (x: number, z: number): number => this.height(x, z) + LINE_LIFT;
        ribbon.push(ox0, y(ox0, oz0), oz0, ix0, y(ix0, iz0), iz0, ox1, y(ox1, oz1), oz1);
        ribbon.push(ox1, y(ox1, oz1), oz1, ix0, y(ix0, iz0), iz0, ix1, y(ix1, iz1), iz1);
      }
      pushDrapedEdge(outline, outlineColors, poly[ia].x, poly[ia].z, poly[ib].x, poly[ib].z, this.height, COLORS.border, seg);
    }
    setPositions(this.borderMesh.geometry, Float32Array.from(ribbon));
    setPositions(this.borderLine.geometry, Float32Array.from(outline));
    (this.borderMesh.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
  }
}

function setPositions(geo: THREE.BufferGeometry, positions: Float32Array): void {
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeBoundingSphere();
}
