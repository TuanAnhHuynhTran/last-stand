import type {
  ApiSuccessResponse,
  ChunkRangeResponseDTO,
  SaveTerrainDeltaResponseDTO,
  SeedTerrainInput,
  SeedTerrainResponseDTO,
  TerrainMetadataDTO,
  TerrainTileDeltaInput,
} from '@cityverse/shared';
import {
  IS_AUTO_ADMIN_ENABLED,
  OFFLINE_ADMIN_TOKEN,
  getOfflineChunksInRange,
  getOfflineTerrainMetadata,
  saveOfflineTerrainDelta,
} from '../config/devAdmin';
import { useAuthStore } from '../stores/authStore';
import { httpClient } from './httpClient';

export interface ChunkRangeParams {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function isOfflineAdmin(): boolean {
  return IS_AUTO_ADMIN_ENABLED && useAuthStore.getState().accessToken === OFFLINE_ADMIN_TOKEN;
}

export const worldApi = {
  async getTerrainMetadata(cityId: string): Promise<TerrainMetadataDTO> {
    if (isOfflineAdmin()) {
      return getOfflineTerrainMetadata();
    }
    const { data } = await httpClient.get<ApiSuccessResponse<TerrainMetadataDTO>>(
      `/cities/${cityId}/terrain`
    );
    return data.data;
  },

  async getChunksInRange(
    cityId: string,
    range: ChunkRangeParams
  ): Promise<ChunkRangeResponseDTO> {
    if (isOfflineAdmin()) {
      return getOfflineChunksInRange(range);
    }
    const { data } = await httpClient.get<ApiSuccessResponse<ChunkRangeResponseDTO>>(
      `/cities/${cityId}/chunks`,
      { params: range }
    );
    return data.data;
  },

  async saveTerrainDelta(
    cityId: string,
    tiles: TerrainTileDeltaInput[]
  ): Promise<SaveTerrainDeltaResponseDTO> {
    if (isOfflineAdmin()) {
      return saveOfflineTerrainDelta(tiles);
    }
    const { data } = await httpClient.post<ApiSuccessResponse<SaveTerrainDeltaResponseDTO>>(
      `/cities/${cityId}/terrain/delta`,
      { tiles }
    );
    return data.data;
  },

  async seedTerrain(
    cityId: string,
    options: Partial<SeedTerrainInput> = {}
  ): Promise<SeedTerrainResponseDTO> {
    const { data } = await httpClient.post<ApiSuccessResponse<SeedTerrainResponseDTO>>(
      `/cities/${cityId}/terrain/seed`,
      options
    );
    return data.data;
  },
};
