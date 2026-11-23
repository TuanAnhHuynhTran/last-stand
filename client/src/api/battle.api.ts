import axios from 'axios';
import type { ApiSuccessResponse, BattleAction, BattleClaimDTO, BattleDTO, BattleLobbyDTO, CreateBattleInput } from '@cityverse/shared';
import { httpClient } from './httpClient';

export const battleApi = {
  lobby: async (cityId: string) => (await httpClient.get<ApiSuccessResponse<BattleLobbyDTO>>(`/cities/${cityId}/battles`)).data.data,
  create: async (cityId: string, body: CreateBattleInput) => (await httpClient.post<ApiSuccessResponse<BattleDTO>>(`/cities/${cityId}/battles`, body)).data.data,
  get: async (battleId: string) => (await httpClient.get<ApiSuccessResponse<BattleDTO>>(`/battles/${battleId}`)).data.data,
  /** Intents only; the same clientActionId may be re-sent after a lost response. */
  act: async (battleId: string, clientActionId: string, expectedVersion: number, action: BattleAction) =>
    (await httpClient.post<ApiSuccessResponse<BattleDTO>>(`/battles/${battleId}/actions`, { clientActionId, expectedVersion, action })).data.data,
  claim: async (battleId: string) => (await httpClient.post<ApiSuccessResponse<BattleClaimDTO>>(`/battles/${battleId}/rewards`)).data.data,
};

const ERRORS: Record<string, string> = {
  NOT_YOUR_UNIT: 'Đơn vị này không thuộc đội của bạn.',
  UNIT_DOWN: 'Đơn vị đã gục.',
  NO_AP: 'Không đủ điểm hành động.',
  NO_MOVE: 'Đã hết điểm di chuyển lượt này.',
  TOO_FAR: 'Ô đó quá xa trong lượt này.',
  BLOCKED: 'Không thể đi vào ô này.',
  OCCUPIED: 'Ô đã có đơn vị.',
  OUT_OF_RANGE: 'Mục tiêu ngoài tầm đánh.',
  NO_LINE_OF_SIGHT: 'Không nhìn thấy mục tiêu (bị che khuất).',
  NOT_LOADED: 'Nỏ chưa nạp tên — hãy nạp lại.',
  COOLDOWN: 'Kỹ năng chưa hồi.',
  NO_TARGETS: 'Không có kẻ địch trong vùng.',
  WRONG_PHASE: 'Chưa đến lượt của bạn.',
  STALE_BATTLE: 'Trận đã thay đổi — đang tải lại.',
  BATTLE_FINISHED: 'Trận đã kết thúc.',
  BATTLE_ACTIVE: 'Đang có một trận chưa kết thúc.',
  MISSION_LOCKED: 'Nhiệm vụ chưa mở.',
  UNIT_UNAVAILABLE: 'Có binh sĩ chưa thể xuất quân.',
  INVALID_ROSTER: 'Đội hình không hợp lệ cho nhiệm vụ.',
  NOT_WON: 'Chỉ nhận thưởng khi chiến thắng.',
};

export function battleErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Mất kết nối tới server — trận vẫn được lưu, hãy gửi lại.';
    const body = error.response.data as { error?: { code?: string; message?: string } } | undefined;
    const code = body?.error?.code;
    if (code && ERRORS[code]) return ERRORS[code];
    if (body?.error?.message) return body.error.message;
  }
  return error instanceof Error ? error.message : 'Lỗi không xác định.';
}

export const isNetworkError = (e: unknown): boolean => axios.isAxiosError(e) && !e.response;
export const errorCode = (e: unknown): string | null =>
  axios.isAxiosError(e) ? ((e.response?.data as { error?: { code?: string } } | undefined)?.error?.code ?? null) : null;
