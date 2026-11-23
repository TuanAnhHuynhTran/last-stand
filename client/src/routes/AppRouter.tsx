import { BattleLobbyPage } from '../pages/BattleLobbyPage';
import { BattlePage } from '../pages/BattlePage';
import { SocialPage } from '../pages/SocialPage';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { authApi } from '../api/auth.api';
import { FullPageLoader } from '../components/FullPageLoader';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { IS_AUTO_ADMIN_ENABLED, OFFLINE_ADMIN_CITY_ID } from '../config/devAdmin';
import { CreateCharacterPage } from '../pages/CreateCharacterPage';
import { CreateCityPage } from '../pages/CreateCityPage';
import { DashboardPage } from '../pages/DashboardPage';
import { GameWorldPage } from '../pages/GameWorldPage';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { WorldSandboxPage } from '../pages/WorldSandboxPage';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';

function AutoAdminEntry() {
  const existingCity = useGameStore((s) => s.city);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const setCharacter = useGameStore((s) => s.setCharacter);
  const setCity = useGameStore((s) => s.setCity);

  const [targetPath, setTargetPath] = useState<string | null>(() => {
    if (isAuthenticated && accessToken && existingCity) {
      return `/game/${existingCity.id}`;
    }
    return null;
  });

  useEffect(() => {
    if (targetPath) return;
    let active = true;

    async function bootAdmin() {
      try {
        const session = await authApi.devAdminLogin();
        if (!active) return;
        setSession(session.user, session.tokens);
        setCharacter(session.character);
        setCity(session.city);
        setTargetPath(session.city ? `/game/${session.city.id}` : '/dashboard');
      } catch {
        if (!active) return;
        setTargetPath(`/game/${OFFLINE_ADMIN_CITY_ID}`);
      }
    }

    void bootAdmin();
    return () => {
      active = false;
    };
  }, [setCharacter, setCity, setSession, targetPath]);

  if (!targetPath) {
    return <FullPageLoader tip="Dang vao thang thanh pho 3D bang tai khoan Admin..." />;
  }

  return <Navigate to={targetPath} replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/game/:cityId/battles" element={<ProtectedRoute><BattleLobbyPage /></ProtectedRoute>} />
      <Route path="/battle/:battleId" element={<ProtectedRoute><BattlePage /></ProtectedRoute>} />
      <Route path="/pvp/battle/:battleId" element={<ProtectedRoute><BattlePage pvp /></ProtectedRoute>} />
      <Route path="/social" element={<ProtectedRoute><SocialPage /></ProtectedRoute>} />
      <Route
        path="/login"
        element={IS_AUTO_ADMIN_ENABLED ? <AutoAdminEntry /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={IS_AUTO_ADMIN_ENABLED ? <AutoAdminEntry /> : <RegisterPage />}
      />

      <Route
        path="/character/create"
        element={
          <ProtectedRoute>
            <CreateCharacterPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/city/create"
        element={
          <ProtectedRoute>
            <CreateCityPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/game/:cityId"
        element={
          <ProtectedRoute>
            <GameWorldPage />
          </ProtectedRoute>
        }
      />
      {import.meta.env.DEV && <Route path="/dev/world-sandbox" element={<WorldSandboxPage />} />}

      <Route
        path="/"
        element={IS_AUTO_ADMIN_ENABLED ? <AutoAdminEntry /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="*"
        element={IS_AUTO_ADMIN_ENABLED ? <AutoAdminEntry /> : <Navigate to="/dashboard" replace />}
      />
    </Routes>
  );
}
