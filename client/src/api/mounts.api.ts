import axios from 'axios';
import type {
  AnimalEquipInput,
  ApiSuccessResponse,
  AnimalTaskKind,
  CareAction,
  MountMutationResultDTO,
  MountStateDTO,
  TrainingProgramCode,
} from '@cityverse/shared';
import { IS_AUTO_ADMIN_ENABLED, OFFLINE_ADMIN_TOKEN } from '../config/devAdmin';
import { useAuthStore } from '../stores/authStore';
import { buildingErrorMessage } from './building.api';
import { httpClient } from './httpClient';

function assertOnline(): void {
  if (IS_AUTO_ADMIN_ENABLED && useAuthStore.getState().accessToken === OFFLINE_ADMIN_TOKEN) {
    throw new Error('Chế độ offline: hãy chạy server (npm run dev) để quản lý ngựa, voi.');
  }
}

const base = (cityId: string) => `/cities/${cityId}/mounts`;
const animal = (cityId: string, id: string) => `${base(cityId)}/animals/${id}`;

async function call(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<MountMutationResultDTO> {
  assertOnline();
  const { data } =
    method === 'delete'
      ? await httpClient.delete<ApiSuccessResponse<MountMutationResultDTO>>(url)
      : await httpClient[method]<ApiSuccessResponse<MountMutationResultDTO>>(url, body);
  return data.data;
}

export const mountsApi = {
  async state(cityId: string): Promise<MountStateDTO> {
    assertOnline();
    const { data } = await httpClient.get<ApiSuccessResponse<MountStateDTO>>(base(cityId));
    return data.data;
  },
  train: (cityId: string, id: string, program: TrainingProgramCode) => call('post', `${animal(cityId, id)}/training`, { program }),
  care: (cityId: string, id: string, action: CareAction) => call('post', `${animal(cityId, id)}/care`, { action }),
  equip: (cityId: string, id: string, input: AnimalEquipInput) => call('put', `${animal(cityId, id)}/equipment`, input),
  mount: (cityId: string, id: string, unitId: string) => call('post', `${animal(cityId, id)}/mount`, { unitId }),
  dismount: (cityId: string, id: string) => call('delete', `${animal(cityId, id)}/mount`),
  task: (cityId: string, id: string, kind: AnimalTaskKind) => call('post', `${animal(cityId, id)}/task`, { kind }),
  endTask: (cityId: string, id: string) => call('delete', `${animal(cityId, id)}/task`),
};

const ERRORS: Record<string, string> = {
  ANIMAL_NOT_FOUND: 'Con vật không còn ở trại.',
  NOT_A_WORKING_ANIMAL: 'Chỉ ngựa và voi mới huấn luyện / phân công được.',
  WRONG_SPECIES: 'Bài tập này không dành cho loài này.',
  ANIMAL_YOUNG: 'Con non chưa trưởng thành.',
  ANIMAL_TOO_WEAK: 'Con vật quá yếu — hãy chăm sóc / cho khám thú y trước.',
  ANIMAL_HUNGRY: 'Con vật đang đói — hãy cho ăn trước.',
  NOT_TAME: 'Chưa thuần hóa — không thể làm thú cưỡi chiến đấu hay làm việc.',
  STABLE_LEVEL_TOO_LOW: 'Cần nâng trại lên cấp 2 để có sân huấn luyện.',
  MAX_TRAINED: 'Đã đạt mức tối đa của bài tập này.',
  ANIMAL_IN_USE: 'Con vật đang được sử dụng (có người cưỡi / đang làm nhiệm vụ).',
  ANIMAL_TRAINING: 'Con vật đang huấn luyện.',
  INSUFFICIENT_FARM_FEED: 'Kho thức ăn của trại không đủ cho buổi tập.',
  NO_SADDLE: 'Ngựa cần đeo yên trước khi giao cho binh sĩ.',
  NOT_A_HORSE: 'Chỉ ngựa mới làm thú cưỡi.',
  RIDER_NOT_SUITABLE: 'Nỏ binh không cưỡi ngựa (chỉ đao, thương, cung).',
  UNIT_HAS_MOUNT: 'Binh sĩ này đã có ngựa.',
  UNIT_NOT_TRAINED: 'Tân binh chưa huấn luyện xong.',
  UNIT_NOT_FOUND: 'Binh sĩ không còn trong quân đội.',
  NOT_MOUNTED: 'Ngựa chưa được giao cho ai.',
  NO_HARNESS: 'Cần đeo đai chở hàng.',
  NOT_WAR_TRAINED: 'Voi cần trình độ 2 (Luyện chiến) để vào dự bị quân sự.',
  NOT_AN_ELEPHANT: 'Chỉ voi mới vào dự bị quân sự.',
  NO_TASK: 'Con vật không có nhiệm vụ.',
  GROOM_COOLDOWN: 'Vừa chải lông xong, chờ một lát.',
  VET_UNAVAILABLE: 'Cần khu chăm sóc (trại cấp 2) để khám thú y.',
  EQUIPMENT_NOT_ALLOWED: 'Trang bị không hợp với loài / ô này.',
  ALREADY_EQUIPPED: 'Đã đeo món này rồi.',
  MISSING_EQUIPMENT: 'Kho không còn trang bị này — hãy làm ở Lò rèn quân sự.',
};

export function mountErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const code = (error.response?.data as { error?: { code?: string } } | undefined)?.error?.code;
    if (code && ERRORS[code]) return ERRORS[code];
  }
  return buildingErrorMessage(error);
}
