import axios from 'axios';
import {
  FARM_ZONE_ISSUE_LABELS,
  PRODUCE_LABELS,
  type ApiSuccessResponse,
  type BreedAnimalsInput,
  type BuyAnimalsInput,
  type CreateLivestockFarmInput,
  type ExpandLivestockFarmInput,
  type FarmZoneIssue,
  type FeedLivestockInput,
  type HerdStatusDTO,
  type LivestockMutationResultDTO,
  type LivestockStateDTO,
  type ProduceCode,
} from '@cityverse/shared';
import { IS_AUTO_ADMIN_ENABLED, OFFLINE_ADMIN_TOKEN } from '../config/devAdmin';
import { useAuthStore } from '../stores/authStore';
import { buildingErrorMessage } from './building.api';
import { httpClient } from './httpClient';

function assertOnline(): void {
  if (IS_AUTO_ADMIN_ENABLED && useAuthStore.getState().accessToken === OFFLINE_ADMIN_TOKEN) {
    throw new Error('Chế độ offline: hãy chạy server (npm run dev) để chăn nuôi và lưu trang trại.');
  }
}

const base = (cityId: string) => `/cities/${cityId}/livestock`;
const farmUrl = (cityId: string, farmId: string) => `${base(cityId)}/${farmId}`;

type Mutation = Promise<LivestockMutationResultDTO>;

const send = async (method: 'post' | 'put' | 'delete', url: string, body?: unknown): Mutation => {
  assertOnline();
  const { data } =
    method === 'delete'
      ? await httpClient.delete<ApiSuccessResponse<LivestockMutationResultDTO>>(url)
      : await httpClient[method]<ApiSuccessResponse<LivestockMutationResultDTO>>(url, body);
  return data.data;
};

export const livestockApi = {
  async list(cityId: string): Promise<LivestockStateDTO> {
    assertOnline();
    const { data } = await httpClient.get<ApiSuccessResponse<LivestockStateDTO>>(base(cityId));
    return data.data;
  },
  /** Herd status of one farm — the server simulates it up to now first. */
  async herd(cityId: string, farmId: string): Promise<HerdStatusDTO> {
    assertOnline();
    const { data } = await httpClient.get<ApiSuccessResponse<HerdStatusDTO>>(farmUrl(cityId, farmId));
    return data.data;
  },
  create: (cityId: string, input: CreateLivestockFarmInput) => send('post', base(cityId), input),
  expand: (cityId: string, farmId: string, input: ExpandLivestockFarmInput) => send('post', `${farmUrl(cityId, farmId)}/expand`, input),
  upgrade: (cityId: string, farmId: string) => send('post', `${farmUrl(cityId, farmId)}/upgrade`),
  buy: (cityId: string, farmId: string, input: BuyAnimalsInput) => send('post', `${farmUrl(cityId, farmId)}/animals`, input),
  sell: (cityId: string, farmId: string, animalId: string) => send('delete', `${farmUrl(cityId, farmId)}/animals/${animalId}`),
  harvest: (cityId: string, farmId: string, animalId: string) => send('post', `${farmUrl(cityId, farmId)}/animals/${animalId}/harvest`),
  transfer: (cityId: string, farmId: string, animalId: string, targetFarmId: string) =>
    send('post', `${farmUrl(cityId, farmId)}/animals/${animalId}/transfer`, { targetFarmId }),
  feed: (cityId: string, farmId: string, input: FeedLivestockInput) => send('post', `${farmUrl(cityId, farmId)}/feed`, input),
  water: (cityId: string, farmId: string) => send('post', `${farmUrl(cityId, farmId)}/water`),
  caretakers: (cityId: string, farmId: string, count: number) => send('put', `${farmUrl(cityId, farmId)}/caretakers`, { count }),
  collect: (cityId: string, farmId: string) => send('post', `${farmUrl(cityId, farmId)}/collect`),
  breed: (cityId: string, farmId: string, input: BreedAnimalsInput) => send('post', `${farmUrl(cityId, farmId)}/breed`, input),
  remove: (cityId: string, farmId: string) => send('delete', farmUrl(cityId, farmId)),
};

const ERRORS: Record<string, string> = {
  LIVESTOCK_FARM_BUSY: 'Trang trại đang nâng cấp.',
  ANIMAL_NOT_ALLOWED: 'Vật nuôi không phù hợp với trang trại này.',
  INVALID_BREED: 'Giống vật nuôi không hợp lệ.',
  FARM_FULL: 'Trang trại đã đầy — hãy nâng cấp, mở rộng hoặc bán bớt.',
  PRODUCTION_NOT_READY: 'Sản phẩm chưa sẵn sàng.',
  NO_PRODUCTION: 'Chưa có đợt sản xuất nào — cho vật nuôi ăn uống đầy đủ nhé.',
  BREEDING_IN_PROGRESS: 'Khu sinh sản đang bận.',
  NOT_ENOUGH_ADULTS: 'Cần ít nhất 2 con trưởng thành cùng loài.',
  PARENTS_NOT_HEALTHY: 'Bố mẹ cần khỏe (≥ 60%) và no (≥ 50%) để sinh sản.',
  INSUFFICIENT_FARM_FEED: 'Kho thức ăn của trại không đủ cho mẹ bầu — hãy cho ăn thêm.',
  RECIPE_NOT_SUITABLE: 'Vật nuôi của trại không ăn loại thức ăn này.',
  CARETAKER_LIMIT: 'Đã đạt số người chăm sóc tối đa của cấp trại.',
  ANIMAL_NOT_ADULT: 'Chỉ xuất chuồng được con trưởng thành.',
  SAME_FARM: 'Vật nuôi đã ở trang trại này.',
  MANAGED_BY_LIVESTOCK: 'Trang trại được quản lý ở bảng Chăn nuôi.',
  LIVESTOCK_FARM_NOT_FOUND: 'Trang trại không còn tồn tại.',
  ANIMAL_NOT_FOUND: 'Vật nuôi không còn tồn tại.',
};

export function livestockErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as
      | { error?: { code?: string; details?: { issues?: string[]; missing?: string[]; maxBatches?: string[] } } }
      | undefined;
    const code = body?.error?.code;
    if (code === 'INVALID_LIVESTOCK_FARM') {
      const issues = (body?.error?.details?.issues ?? []) as FarmZoneIssue[];
      return `Trang trại không hợp lệ: ${issues.map((i) => FARM_ZONE_ISSUE_LABELS[i] ?? i).join(', ')}.`;
    }
    if (code === 'INSUFFICIENT_FEED') {
      const missing = (body?.error?.details?.missing ?? []) as ProduceCode[];
      return `Không đủ nông sản: thiếu ${missing.map((m) => PRODUCE_LABELS[m] ?? m).join(', ')} (thu hoạch từ ruộng).`;
    }
    if (code === 'FEED_STORAGE_FULL') {
      const n = Number(body?.error?.details?.maxBatches?.[0] ?? 0);
      return n > 0 ? `Kho thức ăn chỉ còn chỗ cho ${n} mẻ.` : 'Kho thức ăn của trại đã đầy.';
    }
    if (code && ERRORS[code]) return ERRORS[code];
  }
  return buildingErrorMessage(error);
}
