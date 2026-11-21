export type TerrainType = 'plains' | 'coastal' | 'highlands' | 'valley';

/** Canonical Phase 2 terrain archetypes matching plain, coastal, mountain, river */
export type TerrainArchetype = 'plain' | 'coastal' | 'mountain' | 'river';

export type TerrainTypeInput = TerrainType | TerrainArchetype;

export type BiomeType =
  | 'deep_water'
  | 'shallow_water'
  | 'sand'
  | 'grass'
  | 'meadow'
  | 'forest'
  | 'hill'
  | 'mountain'
  | 'snow';

export type TerrainPropType =
  | 'pine_tree'
  | 'deciduous_tree'
  | 'autumn_tree'
  | 'rock'
  | 'grass_tuft';

export interface GridCoord {
  gx: number;
  gz: number;
}

export interface ChunkCoord {
  cx: number;
  cz: number;
}

export interface WorldPoint2D {
  x: number;
  z: number;
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface GridSelection {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TerrainTileDeltaEntry {
  heightDelta?: number;
  setHeight?: number;
  biome?: BiomeType;
  clearProps?: boolean;
}

export interface TerrainTileDeltaInput extends TerrainTileDeltaEntry {
  gx: number;
  gz: number;
}

export interface ChunkTerrainDelta {
  /** Keyed by local tile coordinates "lx,lz" where lx, lz in [0..chunkSize-1] */
  tiles: Record<string, TerrainTileDeltaEntry>;
}

export interface TerrainPropInstance {
  type: TerrainPropType;
  gx: number;
  gz: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  scale: number;
  rotationY: number;
  colorVariant: number;
}

export interface ChunkDataDTO {
  cityId: string;
  chunkX: number;
  chunkZ: number;
  chunkSize: number;
  tileSize: number;
  revision: number;
  seedHash: string;
  biomeSummary: BiomeType;
  waterLevel: number;
  /** (chunkSize + 1) * (chunkSize + 1) corner heights in row-major order vz * 33 + vx */
  cornerHeights: number[];
  /** (chunkSize + 1) * (chunkSize + 1) * 3 seamless unit normals [nx, ny, nz, ...] */
  cornerNormals: number[];
  /** chunkSize * chunkSize tile center heights in row-major order lz * 32 + lx */
  tileHeights: number[];
  /** chunkSize * chunkSize tile biomes in row-major order lz * 32 + lx */
  tileBiomes: BiomeType[];
  /** chunkSize * chunkSize buildable flags */
  buildableMask: boolean[];
  props: TerrainPropInstance[];
  delta: ChunkTerrainDelta;
  hasWater: boolean;
  updatedAt: string;
}

export interface ChunkRangeResponseDTO {
  cityId: string;
  range: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  totalWorldChunks: number;
  loadedCount: number;
  chunks: ChunkDataDTO[];
}

export interface TerrainMetadataDTO {
  cityId: string;
  worldSeed: string;
  terrainType: TerrainType;
  terrainArchetype: TerrainArchetype;
  generatorVersion: string;
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  chunkSize: number;
  chunksX: number;
  chunksZ: number;
  totalChunks: number;
  persistedChunks: number;
  waterLevel: number;
  elevationScale: number;
  worldBounds: WorldBounds;
  spawnPoint: {
    gx: number;
    gz: number;
    worldX: number;
    worldY: number;
    worldZ: number;
  };
  preset: TerrainPreset;
}

export interface SaveTerrainDeltaResponseDTO {
  cityId: string;
  appliedTiles: number;
  updatedChunks: ChunkDataDTO[];
}

export interface SeedTerrainResponseDTO {
  cityId: string;
  worldSeed: string;
  seededChunks: number;
  totalChunks: number;
  resetDeltas: boolean;
}

export type CityMemberRole = 'owner' | 'co_mayor' | 'visitor';

export type UserStatus = 'active' | 'suspended';

export type GameMode = 'build' | 'character';

export interface CharacterAppearance {
  bodyType: 'athletic' | 'classic' | 'compact';
  skinTone: string;
  hairStyle: 'short' | 'slick' | 'wavy' | 'bob' | 'buzz';
  hairColor: string;
  outfitStyle: 'architect' | 'mayor' | 'explorer' | 'urban' | 'engineer';
  outfitPrimaryColor: string;
  outfitSecondaryColor: string;
  accessory: 'none' | 'glasses' | 'hard_hat' | 'visor' | 'scarf';
  /** Asset key used by the 3D Asset Registry to swap placeholder meshes with GLB/GLTF models */
  modelKey: string;
}

export interface CharacterPreset {
  id: string;
  name: string;
  title: string;
  description: string;
  appearance: CharacterAppearance;
}

export interface TerrainPreset {
  id: TerrainType;
  name: string;
  description: string;
  climate: string;
  buildableRatio: number;
  waterLevel: number;
  elevationScale: number;
  previewPalette: {
    ground: string;
    accent: string;
    water: string;
  };
  /** Asset key for future GLB/GLTF terrain props */
  biomeAssetKey: string;
}

export interface UserDTO {
  id: string;
  email: string;
  username: string;
  status: UserStatus;
  createdAt: string;
}

export interface AuthTokensDTO {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
}

export interface CharacterDTO {
  id: string;
  userId: string;
  name: string;
  presetId: string;
  appearance: CharacterAppearance;
  createdAt: string;
  updatedAt: string;
}

export interface CityEconomyDTO {
  id: string;
  cityId: string;
  cityCoins: number;
  population: number;
  happiness: number;
  taxRate: number;
  powerCapacity: number;
  powerUsage: number;
  waterCapacity: number;
  waterUsage: number;
  lastTickAt: string | null;
}

export interface CityDTO {
  id: string;
  ownerId: string;
  name: string;
  terrainType: TerrainType;
  worldSeed: string;
  mapWidth: number;
  mapHeight: number;
  level: number;
  isPublic: boolean;
  role: CityMemberRole;
  economy: CityEconomyDTO;
  createdAt: string;
  updatedAt: string;
}

export interface AuthMeResponseDTO {
  user: UserDTO;
  character: CharacterDTO | null;
  city: CityDTO | null;
}

export interface AuthResponseDTO extends AuthMeResponseDTO {
  tokens: AuthTokensDTO;
}

export interface DashboardDTO {
  user: UserDTO;
  character: CharacterDTO | null;
  city: CityDTO | null;
  onboarding: {
    hasCharacter: boolean;
    hasCity: boolean;
    isReadyToPlay: boolean;
  };
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}
