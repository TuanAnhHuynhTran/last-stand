import axios from 'axios';
import type {
  ApiSuccessResponse,
  CreateSquadInput,
  EquipInput,
  MilitaryMutationResultDTO,
  MilitaryStateDTO,
  RecruitInput,
  StartTrainingInput,
  UpdateSquadInput,
} from '@cityverse/shared';
import { EQUIPMENT_DEFINITIONS } from '@cityverse/shared';
import { IS_AUTO_ADMIN_ENABLED, OFFLINE_ADMIN_TOKEN } from '../config/devAdmin';
import { useAuthStore } from '../stores/authStore';
import { buildingErrorMessage } from './building.api';
import { httpClient } from './httpClient';

function assertOnline(): void {
  if (IS_AUTO_ADMIN_ENABLED && useAuthStore.getState().accessToken === OFFLINE_ADMIN_TOKEN) {
    throw new Error('Chế độ offline: hãy chạy server (npm run dev) để quản lý quân đội.');
  }
}

const base = (cityId: string) => `/cities/${cityId}/military`;
type Mutation = Promise<MilitaryMutationResultDTO>;

async function call(method: 'post' | 'patch' | 'put' | 'delete', url: string, body?: unknown): Mutation {
  assertOnline();
  const { data } =
    method === 'delete'
      ? await httpClient.delete<ApiSuccessResponse<MilitaryMutationResultDTO>>(url)
      : await httpClient[method]<ApiSuccessResponse<MilitaryMutationResultDTO>>(url, body);
  return data.data;
}

export const militaryApi = {
  async state(cityId: string): Promise<MilitaryStateDTO> {
    assertOnline();
    const { data } = await httpClient.get<ApiSuccessResponse<MilitaryStateDTO>>(base(cityId));
    return data.data;
  },
  recruit: (cityId: string, input: RecruitInput) => call('post', `${base(cityId)}/recruit`, input),
  train: (cityId: string, input: StartTrainingInput) => call('post', `${base(cityId)}/training`, input),
  equip: (cityId: string, unitId: string, input: EquipInput) => call('put', `${base(cityId)}/units/${unitId}/equipment`, input),
  discharge: (cityId: string, unitId: string) => call('delete', `${base(cityId)}/units/${unitId}`),
  createSquad: (cityId: string, input: CreateSquadInput) => call('post', `${base(cityId)}/squads`, input),
  updateSquad: (cityId: string, squadId: string, input: UpdateSquadInput) => call('patch', `${base(cityId)}/squads/${squadId}`, input),
  deleteSquad: (cityId: string, squadId: string) => call('delete', `${base(cityId)}/squads/${squadId}`),
  addMembers: (cityId: string, squadId: string, unitIds: string[]) => call('post', `${base(cityId)}/squads/${squadId}/members`, { unitIds }),
  removeMember: (cityId: string, squadId: string, unitId: string) => call('delete', `${base(cityId)}/squads/${squadId}/members/${unitId}`),
};

const ERRORS: Record<string, string> = {
  BARRACKS_NOT_FOUND: 'Doanh trại không còn tồn tại.',
  BARRACKS_NOT_READY: 'Doanh trại đang xây — chưa huấn luyện được.',
  BARRACKS_FULL: 'Doanh trại đã kín chỗ huấn luyện.',
  WRONG_BARRACKS: 'Doanh trại này không huấn luyện binh chủng đó.',
  NOT_ENOUGH_CITIZENS: 'Không đủ cư dân để tuyển quân.',
  NOT_ENOUGH_FOOD: 'Không đủ lương thực cho tân binh.',
  NO_UNITS: 'Không có binh sĩ nào để huấn luyện.',
  UNITS_UNAVAILABLE: 'Có binh sĩ không thể tập lúc này.',
  UNIT_NOT_FOUND: 'Binh sĩ không còn trong quân đội.',
  UNIT_BUSY: 'Binh sĩ đang tập luyện.',
  UNIT_ON_MISSION: 'Binh sĩ đang làm nhiệm vụ ở đội khác.',
  EQUIPMENT_NOT_ALLOWED: 'Trang bị không hợp với binh chủng / ô này.',
  ALREADY_EQUIPPED: 'Đã trang bị món này rồi.',
  SQUAD_NOT_FOUND: 'Đội không còn tồn tại.',
  SQUAD_FULL: 'Đội đã đủ quân số.',
  SQUAD_EMPTY: 'Đội chưa có binh sĩ.',
  SQUAD_NOT_READY: 'Có binh sĩ chưa sẵn sàng (đang tập hoặc thiếu trang bị).',
  SQUAD_DEPLOYED: 'Đội đang làm nhiệm vụ.',
  NOT_A_MEMBER: 'Binh sĩ không ở đội này.',
};

const EQ_NAME = new Map(EQUIPMENT_DEFINITIONS.map((e) => [e.code as string, e.name]));

export function militaryErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { error?: { code?: string; details?: { missing?: string[] } } } | undefined;
    const code = body?.error?.code;
    if (code === 'MISSING_EQUIPMENT') {
      const names = (body?.error?.details?.missing ?? []).map((c) => EQ_NAME.get(c)).filter(Boolean);
      return names.length ? `Thiếu trang bị trong kho: ${names.join(', ')}. Hãy rèn ở Lò rèn quân sự.` : 'Binh sĩ chưa đủ trang bị.';
    }
    if (code && ERRORS[code]) return ERRORS[code];
  }
  return buildingErrorMessage(error);
}
