import axios from 'axios';
import {
  FARM_ZONE_ISSUE_LABELS,
  PRODUCE_LABELS,
  WATER_BODY_ISSUE_LABELS,
  type ApiSuccessResponse,
  type AquacultureMutationResultDTO,
  type AquacultureStateDTO,
  type CreateWaterBodyInput,
  type FarmZoneIssue,
  type FeedFishInput,
  type ProduceCode,
  type StockFishInput,
  type WaterBodyIssue,
} from '@cityverse/shared';
import { IS_AUTO_ADMIN_ENABLED, OFFLINE_ADMIN_TOKEN } from '../config/devAdmin';
import { useAuthStore } from '../stores/authStore';
import { buildingErrorMessage } from './building.api';
import { httpClient } from './httpClient';

function assertOnline(): void {
  if (IS_AUTO_ADMIN_ENABLED && useAuthStore.getState().accessToken === OFFLINE_ADMIN_TOKEN) {
    throw new Error('Chế độ offline: hãy chạy server (npm run dev) để đào ao và nuôi cá.');
  }
}

const base = (cityId: string) => `/cities/${cityId}/water-bodies`;
const one = (cityId: string, id: string) => `${base(cityId)}/${id}`;

type Mutation = Promise<AquacultureMutationResultDTO>;

const send = async (method: 'post' | 'delete' | 'get', url: string, body?: unknown): Mutation => {
  assertOnline();
  const { data } =
    method === 'post'
      ? await httpClient.post<ApiSuccessResponse<AquacultureMutationResultDTO>>(url, body)
      : await httpClient[method]<ApiSuccessResponse<AquacultureMutationResultDTO>>(url);
  return data.data;
};

export const aquacultureApi = {
  async list(cityId: string): Promise<AquacultureStateDTO> {
    assertOnline();
    const { data } = await httpClient.get<ApiSuccessResponse<AquacultureStateDTO>>(base(cityId));
    return data.data;
  },
  /** One water body, simulated to now on the server. */
  get: (cityId: string, id: string) => send('get', one(cityId, id)),
  create: (cityId: string, input: CreateWaterBodyInput) => send('post', base(cityId), input),
  expand: (cityId: string, id: string, hexes: { q: number; r: number }[]) => send('post', `${one(cityId, id)}/expand`, { hexes }),
  upgrade: (cityId: string, id: string) => send('post', `${one(cityId, id)}/upgrade`),
  fill: (cityId: string, id: string) => send('post', `${one(cityId, id)}/fill`),
  stock: (cityId: string, id: string, input: StockFishInput) => send('post', `${one(cityId, id)}/stock`, input),
  feed: (cityId: string, id: string, input: FeedFishInput) => send('post', `${one(cityId, id)}/feed`, input),
  harvest: (cityId: string, id: string) => send('post', `${one(cityId, id)}/harvest`),
  remove: (cityId: string, id: string) => send('delete', one(cityId, id)),
};

const ERRORS: Record<string, string> = {
  WATER_BODY_BUSY: 'Ao đang nâng cấp.',
  WATER_BODY_NOT_FOUND: 'Ao không còn tồn tại.',
  NATURAL_WATER: 'Khu cá lồng dùng nước tự nhiên — không cần cấp nước.',
  ALREADY_FILLING: 'Ao đang được cấp nước.',
  WATER_FULL: 'Ao đã đầy nước.',
  NOT_ENOUGH_WATER: 'Ao chưa đủ nước để thả cá — hãy cấp nước trước.',
  POND_PREPARING: 'Ao đang được vệ sinh, chuẩn bị vụ mới.',
  POND_FULL: 'Ao đã đủ cá — mật độ cao sẽ làm nước bẩn.',
  NOT_ENOUGH_FRY: 'Không đủ cá giống từ khu ươm.',
  FISH_NOT_READY: 'Cá chưa đủ lớn để thu hoạch.',
  NO_FISH: 'Ao chưa có cá.',
  MANAGED_BY_AQUACULTURE: 'Ao được quản lý ở bảng Thủy sản.',
};

export function aquacultureErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { error?: { code?: string; details?: { issues?: string[]; missing?: string[]; maxBatches?: string[] } } } | undefined;
    const code = body?.error?.code;
    if (code === 'INVALID_WATER_BODY') {
      const issues = (body?.error?.details?.issues ?? []) as WaterBodyIssue[];
      return `Vùng đào ao không hợp lệ: ${issues.map(waterIssueLabel).join(', ')}.`;
    }
    if (code === 'INSUFFICIENT_FEED') {
      const missing = (body?.error?.details?.missing ?? []) as ProduceCode[];
      return `Không đủ nông sản làm thức ăn cá: thiếu ${missing.map((m) => PRODUCE_LABELS[m] ?? m).join(', ')}.`;
    }
    if (code === 'FEED_STORAGE_FULL') {
      const n = Number(body?.error?.details?.maxBatches?.[0] ?? 0);
      return n > 0 ? `Máy cho ăn chỉ còn chỗ cho ${n} mẻ.` : 'Máy cho ăn đã đầy.';
    }
    if (code && ERRORS[code]) return ERRORS[code];
  }
  return buildingErrorMessage(error);
}

export function waterIssueLabel(i: WaterBodyIssue): string {
  return (WATER_BODY_ISSUE_LABELS as Record<string, string>)[i] ?? FARM_ZONE_ISSUE_LABELS[i as FarmZoneIssue] ?? i;
}
