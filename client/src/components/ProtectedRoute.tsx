import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authApi } from '../api/auth.api';
import { IS_AUTO_ADMIN_ENABLED } from '../config/devAdmin';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { FullPageLoader } from './FullPageLoader';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const setSession = useAuthStore((state) => state.setSession);
  const setUser = useAuthStore((state) => state.setUser);
  const setSessionChecked = useAuthStore((state) => state.setSessionChecked);
  const clearSession = useAuthStore((state) => state.clearSession);

  const setCharacter = useGameStore((state) => state.setCharacter);
  const setCity = useGameStore((state) => state.setCity);
  const resetGameState = useGameStore((state) => state.resetGameState);

  const needsAutoAdmin = IS_AUTO_ADMIN_ENABLED && (!isAuthenticated || !accessToken);
  const [isHydrating, setIsHydrating] = useState(
    needsAutoAdmin || (!isSessionChecked && Boolean(accessToken || refreshToken))
  );

  useEffect(() => {
    let active = true;

    async function hydrateAdminSession(): Promise<boolean> {
      try {
        const adminSession = await authApi.devAdminLogin();
        if (!active) return false;
        setSession(adminSession.user, adminSession.tokens);
        setCharacter(adminSession.character);
        setCity(adminSession.city);
        return true;
      } catch {
        return false;
      }
    }

    async function verifySession() {
      if (isSessionChecked && isAuthenticated && accessToken) {
        setIsHydrating(false);
        return;
      }

      if (!accessToken && !refreshToken) {
        if (IS_AUTO_ADMIN_ENABLED) {
          setIsHydrating(true);
          const ok = await hydrateAdminSession();
          if (active && !ok) {
            clearSession();
            resetGameState();
          }
          if (active) setIsHydrating(false);
          return;
        }

        clearSession();
        resetGameState();
        setIsHydrating(false);
        return;
      }

      setIsHydrating(true);
      try {
        const me = await authApi.getMe();
        if (!active) return;
        setUser(me.user);
        setCharacter(me.character);
        setCity(me.city);
        setSessionChecked(true);
      } catch {
        if (!active) return;
        if (IS_AUTO_ADMIN_ENABLED) {
          const ok = await hydrateAdminSession();
          if (active && !ok) {
            clearSession();
            resetGameState();
          }
        } else {
          clearSession();
          resetGameState();
        }
      } finally {
        if (active) {
          setIsHydrating(false);
        }
      }
    }

    void verifySession();

    return () => {
      active = false;
    };
  }, [
    accessToken,
    refreshToken,
    isAuthenticated,
    isSessionChecked,
    setSession,
    setUser,
    setCharacter,
    setCity,
    setSessionChecked,
    clearSession,
    resetGameState,
  ]);

  if (isHydrating) {
    return (
      <FullPageLoader
        tip={
          IS_AUTO_ADMIN_ENABLED
            ? 'Dang vao thang bang tai khoan Admin...'
            : 'Dang xac thuc phien dang nhap...'
        }
      />
    );
  }

  if (!isAuthenticated || !accessToken) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
