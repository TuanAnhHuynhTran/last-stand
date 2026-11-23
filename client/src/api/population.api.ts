import axios from 'axios';
import type {
  ApiSuccessResponse,
  AssignJobInput,
  EconomyStatsDTO,
  PopulationMutationResultDTO,
  PopulationSettingsInput,
  PopulationStateDTO,
} from '@cityverse/shared';
import { IS_AUTO_ADMIN_ENABLED, OFFLINE_ADMIN_TOKEN } from '../config/devAdmin';
import { useAuthStore } from '../stores/authStore';
import { buildingErrorMessage } from './building.api';
import { httpClient } from './httpClient';

function assertOnline(): void {
  if (IS_AUTO_ADMIN_ENABLED && useAuthStore.getState().accessToken === OFFLINE_ADMIN_TOKEN) {
    throw new Error('Chế độ offline: hãy chạy server (npm run dev) để quản lý dân cư.');
  }
}

const base = (cityId: string) => `/cities/${cityId}/population`;
type Mutation = Promise<PopulationMutationResultDTO>;

async function call(method: 'post' | 'patch' | 'delete', url: string, body?: unknown): Mutation {
  assertOnline();
  const { data } =
    method === 'delete'
      ? await httpClient.delete<ApiSuccessResponse<PopulationMutationResultDTO>>(url)
      : await httpClient[method]<ApiSuccessResponse<PopulationMutationResultDTO>>(url, body);
  return data.data;
}

export const populationApi = {
  async state(cityId: string): Promise<PopulationStateDTO> {
    assertOnline();
    const { data } = await httpClient.get<ApiSuccessResponse<PopulationStateDTO>>(base(cityId));
    return data.data;
  },
  async economy(cityId: string, days = 3): Promise<EconomyStatsDTO> {
    assertOnline();
    const { data } = await httpClient.get<ApiSuccessResponse<EconomyStatsDTO>>(`${base(cityId)}/economy`, { params: { days } });
    return data.data;
  },
  assign: (cityId: string, input: AssignJobInput) => call('post', `${base(cityId)}/assign`, input),
  unassign: (cityId: string, survivorId: string) => call('delete', `${base(cityId)}/assign/${survivorId}`),
  autoAssign: (cityId: string) => call('post', `${base(cityId)}/auto-assign`),
  moveHome: (cityId: string, survivorId: string, buildingId: string) => call('post', `${base(cityId)}/survivors/${survivorId}/home`, { buildingId }),
  setRecipe: (cityId: string, buildingId: string, recipeCode: string) => call('post', `${base(cityId)}/production/${buildingId}/recipe`, { recipeCode }),
  collect: (cityId: string, buildingId: string) => call('post', `${base(cityId)}/production/${buildingId}/collect`),
  settings: (cityId: string, input: PopulationSettingsInput) => call('patch', `${base(cityId)}/settings`, input),
  rescue: (cityId: string) => call('post', `${base(cityId)}/rescue`),
};

const ERRORS: Record<string, string> = {
  SURVIVOR_NOT_FOUND: 'Cư dân không còn ở lãnh địa.',
  WORKPLACE_NOT_FOUND: 'Nơi làm việc không còn tồn tại.',
  WORKPLACE_NOT_READY: 'Công trình đang xây — chưa làm việc được.',
  WORKPLACE_FULL: 'Nơi làm việc đã đủ người.',
  ALREADY_THERE: 'Cư dân đã ở đó rồi.',
  ALREADY_EMPLOYED: 'Cư dân đã có việc.',
  NOT_EMPLOYED: 'Cư dân đang không có việc.',
  HOUSE_FULL: 'Nhà đã kín chỗ.',
  HOUSE_NOT_READY: 'Nhà đang xây.',
  HOUSE_NOT_FOUND: 'Nhà không còn tồn tại.',
  RECIPE_NOT_ALLOWED: 'Công thức không dùng được ở xưởng này.',
  RECIPE_LOCKED: 'Cần nâng cấp xưởng để mở công thức này.',
  NOTHING_TO_COLLECT: 'Xưởng chưa có sản phẩm (hoặc kho đã đầy).',
  RESCUE_IN_PROGRESS: 'Đội cứu hộ đang làm nhiệm vụ.',
  NOT_ENOUGH_FOOD: 'Không đủ lương thực cho đội cứu hộ.',
};

export function populationErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const code = (error.response?.data as { error?: { code?: string } } | undefined)?.error?.code;
    if (code && ERRORS[code]) return ERRORS[code];
  }
  return buildingErrorMessage(error);
}
