import type { ApiSuccessResponse, DashboardDTO } from '@cityverse/shared';
import {
  IS_AUTO_ADMIN_ENABLED,
  OFFLINE_ADMIN_DASHBOARD,
  OFFLINE_ADMIN_TOKEN,
} from '../config/devAdmin';
import { useAuthStore } from '../stores/authStore';
import { httpClient } from './httpClient';

export const dashboardApi = {
  async getDashboard(): Promise<DashboardDTO> {
    if (IS_AUTO_ADMIN_ENABLED && useAuthStore.getState().accessToken === OFFLINE_ADMIN_TOKEN) {
      return OFFLINE_ADMIN_DASHBOARD;
    }
    const { data } = await httpClient.get<ApiSuccessResponse<DashboardDTO>>('/dashboard');
    return data.data;
  },
};
