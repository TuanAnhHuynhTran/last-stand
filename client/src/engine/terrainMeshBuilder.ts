import * as THREE from 'three';
import {
  getHexCornerOffsets,
  gridToWorldCenter,
  type BiomeType,
  type ChunkDataDTO,
} from '@cityverse/shared';

// Reference-matched Dorfromantik low-poly hexagonal palette
const HEX_BIOME_TOP_COLORS: Record<BiomeType, THREE.Color> = {
  deep_water: new THREE.Color('#188cb0'),
  shallow_water: new THREE.Color('#25a9c9'),
  sand: new THREE.Color('#d9c282'),
  grass: new THREE.Color('#86ad2c'),
  meadow: new THREE.Color('#97bc38'),
  forest: new THREE.Color('#6f9824'),
  hill: new THREE.Color('#7ca32e'),
  mountain: new THREE.Color('#8c9298'),
  snow: new THREE.Color('#eff3f7'),
};

const HEX_RIM_DARKEN = new THREE.Color('#678822');
const HEX_SHORE_CLIFF = new THREE.Color('#8c673f');
const HEX_STONE_CLIFF = new THREE.Color('#777f87');
const HEX_WATER_SHALLOW = new THREE.Color('#35dcf4');
const HEX_WATER_DEEP = new THREE.Color('#23bee6');

const PINE_PALETTE = [
  new THREE.Color('#2b5d24'),
  new THREE.Color('#3c782c'),
  new THREE.Color('#4a8a30'),
  new THREE.Color('#244f21'),
];

const DECIDUOUS_PALETTE = [
  new THREE.Color('#5f8e2a'),
  new THREE.Color('#79a632'),
  new THREE.Color('#4e7d26'),
  new THREE.Color('#8eb53b'),
];

const AUTUMN_PALETTE = [
  new THREE.Color('#c84d22'),
  new THREE.Color('#e07324'),
  new THREE.Color('#b03a1c'),
  new THREE.Color('#e9972d'),
];

// Iconic pale-grey / white-stone faceted boulders from the reference image
const ROCK_PALETTE = [
  new THREE.Color('#d8dce0'),
  new THREE.Color('#c4c9cf'),
  new THREE.Color('#e4e7eb'),
  new THREE.Color('#b4bbc2'),
];

const GRASS_PALETTE = [
  new THREE.Color('#7aa328'),
  new THREE.Color('#91ba36'),
  new THREE.Color('#6a9121'),
  new THREE.Color('#a4c845'),
];

const FARM_PLOT_PALETTE = [
  new THREE.Color('#86684b'),
  new THREE.Color('#785c42'),
  new THREE.Color('#947454'),
  new THREE.Color('#6f553c'),
];

const TRUNK_COLOR = new THREE.Color('#5e3f28');

export interface PropInstanceBatch {
  matrices: THREE.Matrix4[];
  colors: THREE.Color[];
}

export interface ChunkPropBatches {
  trunks: PropInstanceBatch;
  pineCanopies: PropInstanceBatch;
  roundCanopies: PropInstanceBatch;
  rocks: PropInstanceBatch;
  grassTufts: PropInstanceBatch;
  farmPlots: PropInstanceBatch;
}

/** Deterministic per-hex hash in [0, 1) using global (gx, gz) */
function hashHex(gx: number, gz: number, salt = 0): number {
  let n = Math.imul(gx, 374761393) + Math.imul(gz, 668265263) + Math.imul(salt, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * Computes stylized hex tile top elevation: gently terraced on dry land for crisp board-tile clarity
 * while remaining continuous enough to reflect terrain deltas accurately.
 */
export function resolveHexSurfaceHeight(height: number, waterLevel: number): number {
  if (height < waterLevel) {
    return height;
  }
  return Math.max(waterLevel + 0.45, height);
}

/**
 * Builds ONE merged hexagonal prism BufferGeometry for all 32x32 hex tiles in a chunk.
 * Each hex has:
 * - Inner flat hexagonal cap (6 triangles)
 * - Subtle darker beveled outer rim (12 triangles) so the hexagonal mosaic reads naturally
 * - 6 vertical cliff/shoreline skirt quads (12 triangles) for crisp hexagonal coastlines & terraces
 * Uses exact global pointy-top odd-r hex positions -> ZERO seams across adjacent chunks!
 */
export function buildChunkTerrainGeometry(chunk: ChunkDataDTO): THREE.BufferGeometry {
  const { chunkX, chunkZ, chunkSize, tileSize, tileHeights, tileBiomes, waterLevel } = chunk;
  const originGx = chunkX * chunkSize;
  const originGz = chunkZ * chunkSize;

  const innerCorners = getHexCornerOffsets(tileSize, 0.945);
  const outerCorners = getHexCornerOffsets(tileSize, 1.003); // tiny overlap eliminates sub-pixel hairline gaps

  const tileCount = chunkSize * chunkSize;
  // Per hex: 6 inner cap tris + 12 bevel rim tris + 12 side skirt tris = 30 tris = 90 vertices
  const vertsPerHex = 90;
  const totalVerts = tileCount * vertsPerHex;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);

  let ptr = 0;
  const topColor = new THREE.Color();
  const rimColor = new THREE.Color();
  const sideColor = new THREE.Color();

  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    nx: number,
    ny: number,
    nz: number,
    col: THREE.Color
  ) => {
    positions[ptr] = ax;
    positions[ptr + 1] = ay;
    positions[ptr + 2] = az;
    normals[ptr] = nx;
    normals[ptr + 1] = ny;
    normals[ptr + 2] = nz;
    colors[ptr] = col.r;
    colors[ptr + 1] = col.g;
    colors[ptr + 2] = col.b;
    ptr += 3;

    positions[ptr] = bx;
    positions[ptr + 1] = by;
    positions[ptr + 2] = bz;
    normals[ptr] = nx;
    normals[ptr + 1] = ny;
    normals[ptr + 2] = nz;
    colors[ptr] = col.r;
    colors[ptr + 1] = col.g;
    colors[ptr + 2] = col.b;
    ptr += 3;

    positions[ptr] = cx;
    positions[ptr + 1] = cy;
    positions[ptr + 2] = cz;
    normals[ptr] = nx;
    normals[ptr + 1] = ny;
    normals[ptr + 2] = nz;
    colors[ptr] = col.r;
    colors[ptr + 1] = col.g;
    colors[ptr + 2] = col.b;
    ptr += 3;
  };

  for (let lz = 0; lz < chunkSize; lz += 1) {
    const gz = originGz + lz;
    for (let lx = 0; lx < chunkSize; lx += 1) {
      const gx = originGx + lx;
      const idx = lz * chunkSize + lx;

      const rawH = tileHeights[idx] ?? 0;
      const biome = tileBiomes[idx] ?? 'grass';
      const isWater = biome === 'deep_water' || biome === 'shallow_water' || rawH < waterLevel;
      const topY = isWater ? Math.min(waterLevel - 0.65, rawH) : resolveHexSurfaceHeight(rawH, waterLevel);
      const rimY = topY - 0.05;
      const skirtBottomY = Math.min(waterLevel - 2.8, topY - 3.6);

      const center = gridToWorldCenter(gx, gz, tileSize);
      const tint = (hashHex(gx, gz, 19) - 0.5) * 0.06;

      topColor.copy(HEX_BIOME_TOP_COLORS[biome]);
      topColor.offsetHSL(tint * 0.25, tint * 0.35, tint);

      rimColor.copy(topColor);
      if (!isWater) {
        rimColor.lerp(HEX_RIM_DARKEN, 0.24);
      }

      if (biome === 'mountain' || biome === 'snow') {
        sideColor.copy(HEX_STONE_CLIFF);
      } else {
        sideColor.copy(HEX_SHORE_CLIFF);
      }
      sideColor.offsetHSL(0, 0, tint * 0.5);

      for (let i = 0; i < 6; i += 1) {
        const next = (i + 1) % 6;
        const [ix0, iz0] = innerCorners[i];
        const [ix1, iz1] = innerCorners[next];
        const [ox0, oz0] = outerCorners[i];
        const [ox1, oz1] = outerCorners[next];

        const pIx0 = center.x + ix0;
        const pIz0 = center.z + iz0;
        const pIx1 = center.x + ix1;
        const pIz1 = center.z + iz1;
        const pOx0 = center.x + ox0;
        const pOz0 = center.z + oz0;
        const pOx1 = center.x + ox1;
        const pOz1 = center.z + oz1;

        // 1. Inner hex top triangle (CCW facing +Y up)
        pushTri(
          center.x,
          topY,
          center.z,
          pIx1,
          topY,
          pIz1,
          pIx0,
          topY,
          pIz0,
          0,
          1,
          0,
          topColor
        );

        // 2. Subtle beveled hex border rim (2 triangles)
        pushTri(pIx0, topY, pIz0, pIx1, topY, pIz1, pOx0, rimY, pOz0, 0, 0.96, 0, rimColor);
        pushTri(pIx1, topY, pIz1, pOx1, rimY, pOz1, pOx0, rimY, pOz0, 0, 0.96, 0, rimColor);

        // 3. Outer hexagonal side wall skirt (2 triangles)
        const edgeMidX = (ox0 + ox1) * 0.5;
        const edgeMidZ = (oz0 + oz1) * 0.5;
        const edgeLen = Math.hypot(edgeMidX, edgeMidZ) || 1;
        const snx = edgeMidX / edgeLen;
        const snz = edgeMidZ / edgeLen;

        pushTri(
          pOx0,
          rimY,
          pOz0,
          pOx1,
          rimY,
          pOz1,
          pOx0,
          skirtBottomY,
          pOz0,
          snx,
          0,
          snz,
          sideColor
        );
        pushTri(
          pOx1,
          rimY,
          pOz1,
          pOx1,
          skirtBottomY,
          pOz1,
          pOx0,
          skirtBottomY,
          pOz0,
          snx,
          0,
          snz,
          sideColor
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Builds ONE merged hexagonal water surface BufferGeometry for ONLY water hexes in the chunk,
 * yielding crisp turquoise hexagonal rivers, lakes, and coastal bays like the reference image.
 */
export function buildChunkWaterGeometry(chunk: ChunkDataDTO): THREE.BufferGeometry | null {
  const { chunkX, chunkZ, chunkSize, tileSize, tileHeights, tileBiomes, waterLevel } = chunk;
  const originGx = chunkX * chunkSize;
  const originGz = chunkZ * chunkSize;

  const waterHexIndices: number[] = [];
  for (let i = 0; i < chunkSize * chunkSize; i += 1) {
    const b = tileBiomes[i];
    if (b === 'shallow_water' || b === 'deep_water' || (tileHeights[i] ?? 0) < waterLevel) {
      waterHexIndices.push(i);
    }
  }

  if (waterHexIndices.length === 0) {
    return null;
  }

  const corners = getHexCornerOffsets(tileSize, 1.008);
  const vertCount = waterHexIndices.length * 18; // 6 tris * 3 verts per hex
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const col = new THREE.Color();

  let ptr = 0;
  for (const idx of waterHexIndices) {
    const lz = Math.floor(idx / chunkSize);
    const lx = idx - lz * chunkSize;
    const gx = originGx + lx;
    const gz = originGz + lz;

    const center = gridToWorldCenter(gx, gz, tileSize);
    const biome = tileBiomes[idx];
    const shimmer = (hashHex(gx, gz, 88) - 0.5) * 0.05;

    col.copy(biome === 'deep_water' ? HEX_WATER_DEEP : HEX_WATER_SHALLOW);
    col.offsetHSL(shimmer * 0.15, 0, shimmer);

    for (let i = 0; i < 6; i += 1) {
      const next = (i + 1) % 6;
      const [x0, z0] = corners[i];
      const [x1, z1] = corners[next];

      const verts: [number, number, number][] = [
        [center.x, waterLevel, center.z],
        [center.x + x1, waterLevel, center.z + z1],
        [center.x + x0, waterLevel, center.z + z0],
      ];

      for (const [vx, vy, vz] of verts) {
        positions[ptr] = vx;
        positions[ptr + 1] = vy;
        positions[ptr + 2] = vz;
        normals[ptr] = 0;
        normals[ptr + 1] = 1;
        normals[ptr + 2] = 0;
        colors[ptr] = col.r;
        colors[ptr + 1] = col.g;
        colors[ptr + 2] = col.b;
        ptr += 3;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Builds crisp hexagonal wireframe LineSegments for every hex in the chunk (toggled via [G] key)
 * plus distinct chunk-perimeter hex highlight segments.
 */
export function buildChunkGridGeometry(chunk: ChunkDataDTO): {
  tileLines: THREE.BufferGeometry;
  borderLines: THREE.BufferGeometry;
} {
  const { chunkX, chunkZ, chunkSize, tileSize, tileHeights, tileBiomes, waterLevel } = chunk;
  const originGx = chunkX * chunkSize;
  const originGz = chunkZ * chunkSize;
  const corners = getHexCornerOffsets(tileSize, 0.992);

  const tileCount = chunkSize * chunkSize;
  // 6 edges * 2 endpoints * 3 floats per hex
  const tilePositions = new Float32Array(tileCount * 6 * 2 * 3);
  const borderPositions: number[] = [];
  let ptr = 0;

  for (let lz = 0; lz < chunkSize; lz += 1) {
    const gz = originGz + lz;
    for (let lx = 0; lx < chunkSize; lx += 1) {
      const gx = originGx + lx;
      const idx = lz * chunkSize + lx;
      const rawH = tileHeights[idx] ?? 0;
      const biome = tileBiomes[idx] ?? 'grass';
      const isWater = biome === 'deep_water' || biome === 'shallow_water' || rawH < waterLevel;
      const y = (isWater ? waterLevel : resolveHexSurfaceHeight(rawH, waterLevel)) + 0.08;
      const center = gridToWorldCenter(gx, gz, tileSize);

      const isPerimeterHex =
        lx === 0 || lx === chunkSize - 1 || lz === 0 || lz === chunkSize - 1;

      for (let i = 0; i < 6; i += 1) {
        const next = (i + 1) % 6;
        const ax = center.x + corners[i][0];
        const az = center.z + corners[i][1];
        const bx = center.x + corners[next][0];
        const bz = center.z + corners[next][1];

        tilePositions[ptr++] = ax;
        tilePositions[ptr++] = y;
        tilePositions[ptr++] = az;
        tilePositions[ptr++] = bx;
        tilePositions[ptr++] = y;
        tilePositions[ptr++] = bz;

        if (isPerimeterHex) {
          borderPositions.push(ax, y + 0.05, az, bx, y + 0.05, bz);
        }
      }
    }
  }

  const tileLines = new THREE.BufferGeometry();
  tileLines.setAttribute('position', new THREE.BufferAttribute(tilePositions, 3));

  const borderLines = new THREE.BufferGeometry();
  borderLines.setAttribute('position', new THREE.Float32BufferAttribute(borderPositions, 3));

  return { tileLines, borderLines };
}

/**
 * Groups chunk terrain props + decorative hexagonal plowed farm plots into InstancedMesh batches.
 */
export function buildChunkPropBatches(chunk: ChunkDataDTO): ChunkPropBatches {
  const trunks: PropInstanceBatch = { matrices: [], colors: [] };
  const pineCanopies: PropInstanceBatch = { matrices: [], colors: [] };
  const roundCanopies: PropInstanceBatch = { matrices: [], colors: [] };
  const rocks: PropInstanceBatch = { matrices: [], colors: [] };
  const grassTufts: PropInstanceBatch = { matrices: [], colors: [] };
  const farmPlots: PropInstanceBatch = { matrices: [], colors: [] };

  const dummy = new THREE.Object3D();
  const occupiedTiles = new Set<string>();

  for (const prop of chunk.props) {
    occupiedTiles.add(`${prop.gx},${prop.gz}`);
    const variantIdx = Math.abs(prop.colorVariant) % 4;
    const baseY = resolveHexSurfaceHeight(prop.worldY, chunk.waterLevel);

    if (prop.type === 'pine_tree') {
      const s = prop.scale;
      dummy.position.set(prop.worldX, baseY + 0.55 * s, prop.worldZ);
      dummy.rotation.set(0, prop.rotationY, 0);
      dummy.scale.set(0.32 * s, 1.1 * s, 0.32 * s);
      dummy.updateMatrix();
      trunks.matrices.push(dummy.matrix.clone());
      trunks.colors.push(TRUNK_COLOR);

      dummy.position.set(prop.worldX, baseY + 2.25 * s, prop.worldZ);
      dummy.rotation.set(0, prop.rotationY, 0);
      dummy.scale.set(1.12 * s, 2.75 * s, 1.12 * s);
      dummy.updateMatrix();
      pineCanopies.matrices.push(dummy.matrix.clone());
      pineCanopies.colors.push(PINE_PALETTE[variantIdx]);
    } else if (prop.type === 'deciduous_tree' || prop.type === 'autumn_tree') {
      const s = prop.scale;
      dummy.position.set(prop.worldX, baseY + 0.62 * s, prop.worldZ);
      dummy.rotation.set(0, prop.rotationY, 0);
      dummy.scale.set(0.34 * s, 1.25 * s, 0.34 * s);
      dummy.updateMatrix();
      trunks.matrices.push(dummy.matrix.clone());
      trunks.colors.push(TRUNK_COLOR);

      dummy.position.set(prop.worldX, baseY + 2.0 * s, prop.worldZ);
      dummy.rotation.set(0.15, prop.rotationY, 0.1);
      dummy.scale.set(1.24 * s, 1.32 * s, 1.24 * s);
      dummy.updateMatrix();
      roundCanopies.matrices.push(dummy.matrix.clone());
      roundCanopies.colors.push(
        prop.type === 'autumn_tree' ? AUTUMN_PALETTE[variantIdx] : DECIDUOUS_PALETTE[variantIdx]
      );
    } else if (prop.type === 'rock') {
      const s = prop.scale;
      // Large chunky low-poly white-grey boulders like in the reference image
      dummy.position.set(prop.worldX, baseY + 0.52 * s, prop.worldZ);
      dummy.rotation.set(prop.rotationY * 0.25, prop.rotationY, prop.rotationY * 0.18);
      dummy.scale.set(1.45 * s, 1.05 * s, 1.25 * s);
      dummy.updateMatrix();
      rocks.matrices.push(dummy.matrix.clone());
      rocks.colors.push(ROCK_PALETTE[variantIdx]);
    } else if (prop.type === 'grass_tuft') {
      const s = prop.scale;
      dummy.position.set(prop.worldX, baseY + 0.16 * s, prop.worldZ);
      dummy.rotation.set(0, prop.rotationY, 0);
      dummy.scale.set(0.62 * s, 0.45 * s, 0.62 * s);
      dummy.updateMatrix();
      grassTufts.matrices.push(dummy.matrix.clone());
      grassTufts.colors.push(GRASS_PALETTE[variantIdx]);
    }
  }

  // Add charming hexagonal plowed farm plots on select open buildable meadow/grass hexes (like the reference image!)
  const originGx = chunk.chunkX * chunk.chunkSize;
  const originGz = chunk.chunkZ * chunk.chunkSize;
  for (let lz = 0; lz < chunk.chunkSize; lz += 1) {
    const gz = originGz + lz;
    for (let lx = 0; lx < chunk.chunkSize; lx += 1) {
      const gx = originGx + lx;
      const idx = lz * chunk.chunkSize + lx;
      const biome = chunk.tileBiomes[idx];
      if (!chunk.buildableMask[idx] || (biome !== 'grass' && biome !== 'meadow')) continue;
      if (occupiedTiles.has(`${gx},${gz}`)) continue;

      const farmRoll = hashHex(gx, gz, 991);
      if (farmRoll < 0.042) {
        const center = gridToWorldCenter(gx, gz, chunk.tileSize);
        const h = resolveHexSurfaceHeight(chunk.tileHeights[idx] ?? 0, chunk.waterLevel);
        const colorIdx = Math.floor(hashHex(gx, gz, 997) * 4);

        dummy.position.set(center.x, h + 0.08, center.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        farmPlots.matrices.push(dummy.matrix.clone());
        farmPlots.colors.push(FARM_PLOT_PALETTE[colorIdx]);
      }
    }
  }

  return {
    trunks,
    pineCanopies,
    roundCanopies,
    rocks,
    grassTufts,
    farmPlots,
  };
}
