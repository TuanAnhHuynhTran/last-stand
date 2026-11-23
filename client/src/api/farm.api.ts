import axios from 'axios';
import {
  FARM_ZONE_ISSUE_LABELS,
  type ApiSuccessResponse,
  type CreateFarmZoneInput,
  type ExpandFarmZoneInput,
  type FarmMutationResultDTO,
  type FarmStateDTO,
  type FarmZoneIssue,
  type PlantCropInput,
} from '@cityverse/shared';
import { IS_AUTO_ADMIN_ENABLED, OFFLINE_ADMIN_TOKEN } from '../config/devAdmin';
import { useAuthStore } from '../stores/authStore';
import { buildingErrorMessage } from './building.api';
import { httpClient } from './httpClient';

function assertOnline(): void {
  if (IS_AUTO_ADMIN_ENABLED && useAuthStore.getState().accessToken === OFFLINE_ADMIN_TOKEN) {
    throw new Error('Chế độ offline: hãy chạy server (npm run dev) để canh tác và lưu mùa vụ.');
  }
}

const post = async (url: string, body?: unknown): Promise<FarmMutationResultDTO> => {
  assertOnline();
  const { data } = await httpClient.post<ApiSuccessResponse<FarmMutationResultDTO>>(url, body);
  return data.data;
};

export const farmApi = {
  async list(cityId: string): Promise<FarmStateDTO> {
    assertOnline();
    const { data } = await httpClient.get<ApiSuccessResponse<FarmStateDTO>>(`/cities/${cityId}/farms`);
    return data.data;
  },
  create: (cityId: string, input: CreateFarmZoneInput) => post(`/cities/${cityId}/farms`, input),
  expand: (cityId: string, zoneId: string, input: ExpandFarmZoneInput) => post(`/cities/${cityId}/farms/${zoneId}/expand`, input),
  upgrade: (cityId: string, zoneId: string) => post(`/cities/${cityId}/farms/${zoneId}/upgrade`),
  plant: (cityId: string, zoneId: string, input: PlantCropInput) => post(`/cities/${cityId}/farms/${zoneId}/plant`, input),
  harvest: (cityId: string, zoneId: string) => post(`/cities/${cityId}/farms/${zoneId}/harvest`),
  async remove(cityId: string, zoneId: string): Promise<FarmMutationResultDTO> {
    assertOnline();
    const { data } = await httpClient.delete<ApiSuccessResponse<FarmMutationResultDTO>>(`/cities/${cityId}/farms/${zoneId}`);
    return data.data;
  },
};

const FARM_ERRORS: Record<string, string> = {
  FARM_ZONE_BUSY: 'Khu canh tác đang nâng cấp.',
  FARM_ZONE_HAS_CROP: 'Khu đang có vụ mùa — hãy thu hoạch trước.',
  CROP_NOT_READY: 'Cây chưa chín.',
  NO_CROP: 'Khu chưa gieo trồng.',
  CROP_NOT_ALLOWED: 'Cây trồng không phù hợp với khu này.',
  FARM_ZONE_NOT_FOUND: 'Khu canh tác không còn tồn tại.',
};

/** Friendly Vietnamese message for a farm API error. */
export function farmErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { error?: { code?: string; details?: { issues?: string[] } } } | undefined;
    const code = body?.error?.code;
    if (code === 'INVALID_FARM_ZONE') {
      const issues = (body?.error?.details?.issues ?? []) as FarmZoneIssue[];
      return `Khu không hợp lệ: ${issues.map((i) => FARM_ZONE_ISSUE_LABELS[i] ?? i).join(', ')}.`;
    }
    if (code && FARM_ERRORS[code]) return FARM_ERRORS[code];
  }
  return buildingErrorMessage(error);
}
