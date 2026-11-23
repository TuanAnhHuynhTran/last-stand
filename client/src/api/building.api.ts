import axios from 'axios';
import {
  RESOURCE_LABELS,
  type ApiSuccessResponse,
  type BuildingMutationResultDTO,
  type BuildingsStateDTO,
  type MoveBuildingInput,
  type PlaceBuildingInput,
  type ResourceBag,
  type ResourceCode,
} from '@cityverse/shared';
import { IS_AUTO_ADMIN_ENABLED, OFFLINE_ADMIN_TOKEN } from '../config/devAdmin';
import { useAuthStore } from '../stores/authStore';
import { httpClient } from './httpClient';

function assertOnline(): void {
  if (IS_AUTO_ADMIN_ENABLED && useAuthStore.getState().accessToken === OFFLINE_ADMIN_TOKEN) {
    throw new Error('Chế độ offline: hãy chạy server (npm run dev) để xây dựng và lưu công trình.');
  }
}

export const buildingApi = {
  async list(cityId: string): Promise<BuildingsStateDTO> {
    assertOnline();
    const { data } = await httpClient.get<ApiSuccessResponse<BuildingsStateDTO>>(`/cities/${cityId}/buildings`);
    return data.data;
  },

  async place(cityId: string, input: PlaceBuildingInput): Promise<BuildingMutationResultDTO> {
    assertOnline();
    const { data } = await httpClient.post<ApiSuccessResponse<BuildingMutationResultDTO>>(`/cities/${cityId}/buildings`, input);
    return data.data;
  },

  async upgrade(cityId: string, buildingId: string): Promise<BuildingMutationResultDTO> {
    assertOnline();
    const { data } = await httpClient.post<ApiSuccessResponse<BuildingMutationResultDTO>>(
      `/cities/${cityId}/buildings/${buildingId}/upgrade`
    );
    return data.data;
  },

  async move(cityId: string, buildingId: string, input: MoveBuildingInput): Promise<BuildingMutationResultDTO> {
    assertOnline();
    const { data } = await httpClient.post<ApiSuccessResponse<BuildingMutationResultDTO>>(
      `/cities/${cityId}/buildings/${buildingId}/move`,
      input
    );
    return data.data;
  },

  async demolish(cityId: string, buildingId: string): Promise<BuildingMutationResultDTO & { refunded: ResourceBag }> {
    assertOnline();
    const { data } = await httpClient.delete<ApiSuccessResponse<BuildingMutationResultDTO & { refunded: ResourceBag }>>(
      `/cities/${cityId}/buildings/${buildingId}`
    );
    return data.data;
  },
};

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_PLACEMENT: 'Vị trí không hợp lệ.',
  HEX_OCCUPIED: 'Ô hex đã có công trình khác.',
  BUILDING_BUSY: 'Công trình đang thi công.',
  CONSTRUCTION_QUEUE_FULL: 'Đã đạt số công trình thi công cùng lúc tối đa.',
  BUILDING_LIMIT_REACHED: 'Đã đạt giới hạn số lượng công trình loại này.',
  MAX_LEVEL_REACHED: 'Công trình đã đạt cấp tối đa.',
  BUILD_FORBIDDEN: 'Bạn không có quyền xây dựng ở lãnh địa này.',
  BUILDING_NOT_FOUND: 'Công trình không còn tồn tại.',
};

/** Friendly Vietnamese message for a building API error. */
export function buildingErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as
      | { error?: { code?: string; message?: string; details?: Record<string, string[]> } }
      | undefined;
    const code = body?.error?.code;
    if (code === 'INSUFFICIENT_RESOURCES') {
      const missing = (body?.error?.details?.missing ?? []) as ResourceCode[];
      return `Không đủ tài nguyên: thiếu ${missing.map((m) => RESOURCE_LABELS[m] ?? m).join(', ')}.`;
    }
    if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    if (body?.error?.message) return body.error.message;
    if (!error.response) return 'Không kết nối được server.';
  }
  return error instanceof Error ? error.message : 'Đã có lỗi xảy ra.';
}
