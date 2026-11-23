import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthMeResponseDTO, DashboardDTO } from '@cityverse/shared';
import { authApi } from '../api/auth.api';
import { cityApi } from '../api/city.api';
import { dashboardApi } from '../api/dashboard.api';
import { AppRouter } from '../routes/AppRouter';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { cityverseTheme } from '../theme/gameTheme';

// Stub 3D WebGL canvas in jsdom unit tests
vi.mock('../game/world/WorldCanvas', () => ({
  WorldCanvas: ({ worldSeed }: { worldSeed: string }) => (
    <div data-testid="world-canvas">3D World: {worldSeed}</div>
  ),
}));

const sampleAuthMe: AuthMeResponseDTO = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'mayor@cityverse.io',
    username: 'mayor_one',
    status: 'active',
    createdAt: '2026-11-19T00:00:00.000Z',
  },
  character: {
    id: '22222222-2222-4222-8222-222222222222',
    userId: '11111111-1111-4111-8111-111111111111',
    name: 'Alex Horizon',
    presetId: 'urban-architect',
    appearance: {
      bodyType: 'athletic',
      skinTone: '#e8be9e',
      hairStyle: 'slick',
      hairColor: '#1f2937',
      outfitStyle: 'architect',
      outfitPrimaryColor: '#0ea5e9',
      outfitSecondaryColor: '#0f172a',
      accessory: 'glasses',
      modelKey: 'character_architect_v1',
    },
    createdAt: '2026-11-19T00:00:00.000Z',
    updatedAt: '2026-11-19T00:00:00.000Z',
  },
  city: {
    id: '33333333-3333-4333-8333-333333333333',
    ownerId: '11111111-1111-4111-8111-111111111111',
    name: 'Neo Saigon',
    terrainType: 'coastal',
    worldSeed: 'CV-COA-AABBCC112233',
    mapWidth: 128,
    mapHeight: 128,
    level: 1,
    isPublic: true,
    visibility: 'public',
    role: 'owner',
    economy: {
      id: '44444444-4444-4444-8444-444444444444',
      cityId: '33333333-3333-4333-8333-333333333333',
      cityCoins: 250000,
      population: 0,
      happiness: 75,
      taxRate: 8,
      powerCapacity: 0,
      powerUsage: 0,
      waterCapacity: 0,
      waterUsage: 0,
      lastTickAt: null,
    },
    createdAt: '2026-11-19T00:00:00.000Z',
    updatedAt: '2026-11-19T00:00:00.000Z',
  },
};

const sampleDashboard: DashboardDTO = {
  ...sampleAuthMe,
  onboarding: {
    hasCharacter: true,
    hasCity: true,
    isReadyToPlay: true,
  },
};

function renderAppAt(initialRoute: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <ConfigProvider theme={cityverseTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <AppRouter />
        </MemoryRouter>
      </QueryClientProvider>
    </ConfigProvider>
  );
}

describe('CITYVERSE Frontend Phase 1 Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isSessionChecked: false,
    });
    useGameStore.getState().resetGameState();
  });

  it('chuyen huong ve /login khi chua dang nhap', async () => {
    renderAppAt('/dashboard');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /dang nhap/i })).toBeInTheDocument();
    });
  });

  it('reload van giu trang thai hop le va hien thi day du thong tin Dashboard', async () => {
    // Simulate persisted tokens after browser reload (isSessionChecked starts as false)
    useAuthStore.setState({
      user: sampleAuthMe.user,
      accessToken: 'valid-access-token',
      refreshToken: 'valid-refresh-token',
      isAuthenticated: true,
      isSessionChecked: false,
    });

    vi.spyOn(authApi, 'getMe').mockResolvedValue(sampleAuthMe);
    vi.spyOn(dashboardApi, 'getDashboard').mockResolvedValue(sampleDashboard);

    renderAppAt('/dashboard');

    await waitFor(() => {
      expect(screen.getByText(/Chao mung, Alex Horizon/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Neo Saigon/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/250,000/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Vào thành phố$/i })).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().isSessionChecked).toBe(true);
  });

  it('khong cho vao thanh pho khong ton tai (404)', async () => {
    useAuthStore.setState({
      user: sampleAuthMe.user,
      accessToken: 'valid-access-token',
      refreshToken: 'valid-refresh-token',
      isAuthenticated: true,
      isSessionChecked: true,
    });

    vi.spyOn(cityApi, 'getCityById').mockRejectedValue(new Error('Thanh pho khong ton tai'));

    renderAppAt('/game/99999999-9999-4999-8999-999999999999');

    await waitFor(() => {
      expect(screen.getAllByText(/Thanh pho khong ton tai/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('button', { name: /Quay lai Dashboard/i })).toBeInTheDocument();
  });
});
