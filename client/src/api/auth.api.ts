import axios from 'axios';
import type {
  ApiSuccessResponse,
  AuthMeResponseDTO,
  AuthResponseDTO,
  LoginInput,
  RegisterInput,
} from '@cityverse/shared';
import {
  IS_AUTO_ADMIN_ENABLED,
  OFFLINE_ADMIN_AUTH,
  OFFLINE_ADMIN_TOKEN,
} from '../config/devAdmin';
import { useAuthStore } from '../stores/authStore';
import { httpClient } from './httpClient';

export const authApi = {
  async register(payload: RegisterInput): Promise<AuthResponseDTO> {
    const { data } = await httpClient.post<ApiSuccessResponse<AuthResponseDTO>>(
      '/auth/register',
      payload
    );
    return data.data;
  },

  async login(payload: LoginInput): Promise<AuthResponseDTO> {
    const { data } = await httpClient.post<ApiSuccessResponse<AuthResponseDTO>>(
      '/auth/login',
      payload
    );
    return data.data;
  },

  async devAdminLogin(): Promise<AuthResponseDTO> {
    try {
      const { data } = await httpClient.post<ApiSuccessResponse<AuthResponseDTO>>(
        '/auth/dev-admin'
      );
      return data.data;
    } catch (error) {
      // Offline demo only when the server cannot be reached at all; if the server answers
      // (e.g. DEV_AUTO_ADMIN=false) the real database is in use, so never fake a session.
      const unreachable = axios.isAxiosError(error) && !error.response;
      if (IS_AUTO_ADMIN_ENABLED && unreachable) {
        return OFFLINE_ADMIN_AUTH;
      }
      throw new Error('Khong the dang nhap nhanh tai khoan Admin');
    }
  },

  async getMe(): Promise<AuthMeResponseDTO> {
    if (IS_AUTO_ADMIN_ENABLED && useAuthStore.getState().accessToken === OFFLINE_ADMIN_TOKEN) {
      return {
        user: OFFLINE_ADMIN_AUTH.user,
        character: OFFLINE_ADMIN_AUTH.character,
        city: OFFLINE_ADMIN_AUTH.city,
      };
    }
    const { data } = await httpClient.get<ApiSuccessResponse<AuthMeResponseDTO>>('/auth/me');
    return data.data;
  },

  async logout(refreshToken?: string): Promise<void> {
    if (useAuthStore.getState().accessToken === OFFLINE_ADMIN_TOKEN) {
      return;
    }
    await httpClient.post('/auth/logout', refreshToken ? { refreshToken } : {});
  },
};
