import {
  CITY_CONFIG,
  TERRAIN_PRESETS,
  type ApiSuccessResponse,
  type CityDTO,
  type CreateCityInput,
  type TerrainPreset,
} from '@cityverse/shared';
import {
  IS_AUTO_ADMIN_ENABLED,
  OFFLINE_ADMIN_AUTH,
  OFFLINE_ADMIN_TOKEN,
} from '../config/devAdmin';
import { useAuthStore } from '../stores/authStore';
import { httpClient } from './httpClient';

export interface TerrainsResponse {
  terrains: TerrainPreset[];
  config: typeof CITY_CONFIG;
}

function isOfflineAdmin(): boolean {
  return IS_AUTO_ADMIN_ENABLED && useAuthStore.getState().accessToken === OFFLINE_ADMIN_TOKEN;
}

export const cityApi = {
  async getTerrains(): Promise<TerrainsResponse> {
    if (isOfflineAdmin()) {
      return {
        terrains: [...TERRAIN_PRESETS],
        config: CITY_CONFIG,
      };
    }
    const { data } = await httpClient.get<ApiSuccessResponse<TerrainsResponse>>('/cities/terrains');
    return data.data;
  },

  async getMyCity(): Promise<CityDTO> {
    if (isOfflineAdmin() && OFFLINE_ADMIN_AUTH.city) {
      return OFFLINE_ADMIN_AUTH.city;
    }
    const { data } = await httpClient.get<ApiSuccessResponse<CityDTO>>('/cities/my');
    return data.data;
  },

  async createCity(payload: CreateCityInput): Promise<CityDTO> {
    const { data } = await httpClient.post<ApiSuccessResponse<CityDTO>>('/cities', payload);
    return data.data;
  },

  async getCityById(cityId: string): Promise<CityDTO> {
    if (isOfflineAdmin() && OFFLINE_ADMIN_AUTH.city) {
      return OFFLINE_ADMIN_AUTH.city;
    }
    const { data } = await httpClient.get<ApiSuccessResponse<CityDTO>>(`/cities/${cityId}`);
    return data.data;
  },
};
