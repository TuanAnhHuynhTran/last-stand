import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokensDTO, UserDTO } from '@cityverse/shared';

interface AuthState {
  user: UserDTO | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isSessionChecked: boolean;
  setSession: (user: UserDTO, tokens: AuthTokensDTO) => void;
  setTokens: (tokens: AuthTokensDTO) => void;
  setUser: (user: UserDTO) => void;
  setSessionChecked: (checked: boolean) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isSessionChecked: false,
      setSession: (user, tokens) =>
        set({
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthenticated: true,
          isSessionChecked: true,
        }),
      setTokens: (tokens) =>
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthenticated: true,
        }),
      setUser: (user) =>
        set((state) => ({
          user,
          isAuthenticated: Boolean(state.accessToken),
        })),
      setSessionChecked: (checked) => set({ isSessionChecked: checked }),
      clearSession: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isSessionChecked: true,
        }),
    }),
    {
      name: 'cityverse-auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
