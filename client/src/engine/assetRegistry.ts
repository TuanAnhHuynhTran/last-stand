import type { TerrainType } from '@cityverse/shared';

export interface AssetManifestEntry {
  key: string;
  /** Set to a .glb/.gltf URL once real 3D assets are imported in future phases */
  glbUrl: string | null;
  fallbackShape: 'character_capsule' | 'city_hall_box' | 'terrain_plane';
  scale: [number, number, number];
}

const ASSET_MANIFEST: Record<string, AssetManifestEntry> = {
  character_architect_v1: {
    key: 'character_architect_v1',
    glbUrl: null,
    fallbackShape: 'character_capsule',
    scale: [1, 1, 1],
  },
  character_mayor_v1: {
    key: 'character_mayor_v1',
    glbUrl: null,
    fallbackShape: 'character_capsule',
    scale: [1, 1, 1],
  },
  character_engineer_v1: {
    key: 'character_engineer_v1',
    glbUrl: null,
    fallbackShape: 'character_capsule',
    scale: [1, 1, 1],
  },
  character_explorer_v1: {
    key: 'character_explorer_v1',
    glbUrl: null,
    fallbackShape: 'character_capsule',
    scale: [0.95, 0.95, 0.95],
  },
  city_hall_foundation_v1: {
    key: 'city_hall_foundation_v1',
    glbUrl: null,
    fallbackShape: 'city_hall_box',
    scale: [4, 3, 4],
  },
};

export function resolveAssetEntry(key: string): AssetManifestEntry {
  return (
    ASSET_MANIFEST[key] ?? {
      key,
      glbUrl: null,
      fallbackShape: 'character_capsule',
      scale: [1, 1, 1],
    }
  );
}

export function getTerrainGroundColor(terrainType: TerrainType): string {
  switch (terrainType) {
    case 'plains':
      return '#2f6a40';
    case 'coastal':
      return '#3a7554';
    case 'highlands':
      return '#4d5f52';
    case 'valley':
      return '#326d4e';
  }
}
