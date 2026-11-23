export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset {
  level: QualityLevel;
  /** Terrain grid cell (world units) for near chunks (LOD 0). Must divide the chunk size. */
  terrainCell: number;
  /** Terrain grid cell for far chunks (LOD 1). */
  terrainFarCell: number;
  /** Hard cap for the streaming radius around the camera focus. */
  maxLoadRadius: number;
  /** Chunks closer than this use LOD 0 terrain and high-detail vegetation. */
  nearLodRadius: number;
  /** Bushes, rocks and ruins are drawn within this radius; trees on every loaded chunk. */
  propRadius: number;
  /** Grass and flowers are drawn within this radius. */
  detailRadius: number;
  /** Grass tuft spacing (0 = no grass). */
  grassSpacing: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Device pixel ratio range for the canvas. */
  dpr: [number, number];
  antialias: boolean;
  /** Physically-based terrain material (false = Lambert). */
  pbrTerrain: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    level: 'low',
    terrainCell: 4,
    terrainFarCell: 10,
    maxLoadRadius: 280,
    nearLodRadius: 110,
    propRadius: 150,
    detailRadius: 0,
    grassSpacing: 0,
    shadows: false,
    shadowMapSize: 512,
    dpr: [1, 1],
    antialias: false,
    pbrTerrain: false,
  },
  medium: {
    level: 'medium',
    terrainCell: 2.5,
    terrainFarCell: 5,
    maxLoadRadius: 360,
    nearLodRadius: 160,
    propRadius: 230,
    detailRadius: 120,
    grassSpacing: 2.4,
    shadows: true,
    shadowMapSize: 1024,
    dpr: [1, 1.5],
    antialias: true,
    pbrTerrain: true,
  },
  high: {
    level: 'high',
    terrainCell: 2,
    terrainFarCell: 4,
    maxLoadRadius: 430,
    nearLodRadius: 200,
    propRadius: 300,
    detailRadius: 170,
    grassSpacing: 1.7,
    shadows: true,
    shadowMapSize: 2048,
    dpr: [1, 2],
    antialias: true,
    pbrTerrain: true,
  },
};

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
};
