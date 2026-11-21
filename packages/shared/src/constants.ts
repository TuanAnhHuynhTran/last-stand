import type { CharacterPreset, TerrainPreset } from './types.js';

const HEX_TILE_WIDTH = 4;
const HEX_TILE_RADIUS = HEX_TILE_WIDTH / Math.sqrt(3);
const HEX_TILE_ROW_STEP = HEX_TILE_RADIUS * 1.5;

export const WORLD_CONFIG = {
  GRID_SHAPE: 'hex' as const,
  MAP_WIDTH: 128,
  MAP_HEIGHT: 128,
  TILE_SIZE: HEX_TILE_WIDTH,
  HEX_WIDTH: HEX_TILE_WIDTH,
  HEX_RADIUS: HEX_TILE_RADIUS,
  HEX_ROW_STEP: HEX_TILE_ROW_STEP,
  CHUNK_SIZE: 32,
  CHUNKS_X: 4,
  CHUNKS_Z: 4,
  WORLD_WIDTH: (128 + 0.5) * HEX_TILE_WIDTH,
  WORLD_DEPTH: HEX_TILE_RADIUS * 2 + (128 - 1) * HEX_TILE_ROW_STEP,
  WATER_LEVEL: 0,
  DEFAULT_LOAD_RADIUS: 1,
  DEFAULT_UNLOAD_RADIUS: 1,
  MIN_HEIGHT_DELTA: -10,
  MAX_HEIGHT_DELTA: 18,
  MIN_TERRAIN_HEIGHT: -4.5,
  MAX_TERRAIN_HEIGHT: 26,
  GENERATOR_VERSION: 'v2.1-hex',
} as const;

export const CITY_CONFIG = {
  MAP_WIDTH: WORLD_CONFIG.MAP_WIDTH,
  MAP_HEIGHT: WORLD_CONFIG.MAP_HEIGHT,
  TILE_SIZE: WORLD_CONFIG.TILE_SIZE,
  CHUNK_SIZE: WORLD_CONFIG.CHUNK_SIZE,
  INITIAL_COINS: 250000,
  INITIAL_POPULATION: 0,
  INITIAL_LEVEL: 1,
  INITIAL_HAPPINESS: 75,
  INITIAL_TAX_RATE: 8.0,
  MAX_CITIES_PER_USER: 1,
  MAX_CHARACTERS_PER_USER: 1,
} as const;

export const CHARACTER_PRESETS: readonly CharacterPreset[] = [
  {
    id: 'urban-architect',
    name: 'Kien Truc Su Do Thi',
    title: 'Urban Architect',
    description: 'Phong cach hien dai voi ao khoac cong nghe va kinh thiet ke quy hoach.',
    appearance: {
      bodyType: 'athletic',
      skinTone: '#e8be9e',
      hairStyle: 'slick',
      hairColor: '#1f2937',
      outfitStyle: 'architect',
      outfitPrimaryColor: '#0ea5e9',
      outfitSecondaryColor: '#0f172a',
      accessory: 'glasses',
      modelKey: 'character_architect_v1',
    },
  },
  {
    id: 'visionary-mayor',
    name: 'Thi Truong Tien Phong',
    title: 'Visionary Mayor',
    description: 'Trang phuc lich lam cua nha lanh dao thanh pho tuong lai.',
    appearance: {
      bodyType: 'classic',
      skinTone: '#d9a077',
      hairStyle: 'wavy',
      hairColor: '#3b2f2f',
      outfitStyle: 'mayor',
      outfitPrimaryColor: '#10b981',
      outfitSecondaryColor: '#1e293b',
      accessory: 'scarf',
      modelKey: 'character_mayor_v1',
    },
  },
  {
    id: 'chief-engineer',
    name: 'Ky Su Ha Tang',
    title: 'Chief Engineer',
    description: 'Chuyen gia xay dung ha tang voi mu bao ho va dong phuc ky thuat.',
    appearance: {
      bodyType: 'athletic',
      skinTone: '#f1c9a5',
      hairStyle: 'short',
      hairColor: '#4a3728',
      outfitStyle: 'engineer',
      outfitPrimaryColor: '#f59e0b',
      outfitSecondaryColor: '#334155',
      accessory: 'hard_hat',
      modelKey: 'character_engineer_v1',
    },
  },
  {
    id: 'metro-explorer',
    name: 'Nha Tham Hiem Do Thi',
    title: 'Metro Explorer',
    description: 'Nang dong, phu hop tham quan va ket noi giua cac thanh pho.',
    appearance: {
      bodyType: 'compact',
      skinTone: '#c6865c',
      hairStyle: 'bob',
      hairColor: '#111827',
      outfitStyle: 'explorer',
      outfitPrimaryColor: '#8b5cf6',
      outfitSecondaryColor: '#1e1b4b',
      accessory: 'visor',
      modelKey: 'character_explorer_v1',
    },
  },
] as const;

export const TERRAIN_PRESETS: readonly TerrainPreset[] = [
  {
    id: 'plains',
    name: 'Dong Bang Xanh',
    description: 'Dia hinh bang phang rong lon, ly tuong de quy hoach do thi nhanh va mo rong ha tang.',
    climate: 'On hoa',
    buildableRatio: 0.92,
    waterLevel: 0.1,
    elevationScale: 0.25,
    previewPalette: {
      ground: '#3d7a4a',
      accent: '#6bbf59',
      water: '#2b8cbe',
    },
    biomeAssetKey: 'biome_plains_v1',
  },
  {
    id: 'coastal',
    name: 'Vinh Duyen Hai',
    description: 'Duong bo bien tho mong thuan loi cho thuong mai, cang bien va du lich.',
    climate: 'Nhiet doi bien',
    buildableRatio: 0.78,
    waterLevel: 0.35,
    elevationScale: 0.35,
    previewPalette: {
      ground: '#4c8b5a',
      accent: '#d4b483',
      water: '#0ea5e9',
    },
    biomeAssetKey: 'biome_coastal_v1',
  },
  {
    id: 'highlands',
    name: 'Cao Nguyen Da',
    description: 'Dia hinh phan tang hung vi, giau tiem nang cong nghiep va nang luong gio.',
    climate: 'Mat me',
    buildableRatio: 0.74,
    waterLevel: 0.15,
    elevationScale: 0.8,
    previewPalette: {
      ground: '#5b6e58',
      accent: '#94a3b8',
      water: '#38bdf8',
    },
    biomeAssetKey: 'biome_highlands_v1',
  },
  {
    id: 'valley',
    name: 'Thung Lung Song',
    description: 'Dong song uon luon giua hai suon doi, can bang giua khu dan cu va canh quan.',
    climate: 'On hoa am',
    buildableRatio: 0.84,
    waterLevel: 0.25,
    elevationScale: 0.55,
    previewPalette: {
      ground: '#3f7d58',
      accent: '#84cc16',
      water: '#0284c7',
    },
    biomeAssetKey: 'biome_valley_v1',
  },
] as const;

export const ALLOWED_SKIN_TONES = [
  '#f6d5b8',
  '#f1c9a5',
  '#e8be9e',
  '#d9a077',
  '#c6865c',
  '#8d5524',
] as const;

export const ALLOWED_ACCENT_COLORS = [
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#ec4899',
  '#1f2937',
  '#334155',
] as const;
