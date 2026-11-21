import {
  BankOutlined,
  CompassOutlined,
  DashboardOutlined,
  DollarCircleOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Layout, Space, Tag, Typography } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';

const { Header } = Layout;

export function GameNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const user = useAuthStore((state) => state.user);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const clearSession = useAuthStore((state) => state.clearSession);

  const character = useGameStore((state) => state.character);
  const city = useGameStore((state) => state.city);
  const resetGameState = useGameStore((state) => state.resetGameState);

  const handleLogout = async () => {
    try {
      await authApi.logout(refreshToken ?? undefined);
    } catch {
      // Clear local session even if server logout fails
    } finally {
      clearSession();
      resetGameState();
      queryClient.clear();
      navigate('/login', { replace: true });
    }
  };

  return (
    <Header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingInline: 24,
        borderBottom: '1px solid rgba(56, 189, 248, 0.16)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <Space size={16}>
        <Button
          type="text"
          onClick={() => navigate('/dashboard')}
          style={{ padding: 0, height: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <BankOutlined style={{ fontSize: 22, color: '#00d4aa' }} />
          <Typography.Title
            level={4}
            style={{ margin: 0, letterSpacing: 1.5, color: '#f8fafc' }}
          >
            CITYVERSE
          </Typography.Title>
        </Button>

        <Button
          type={location.pathname === '/dashboard' ? 'primary' : 'text'}
          icon={<DashboardOutlined />}
          onClick={() => navigate('/dashboard')}
        >
          Dashboard
        </Button>

        {city && (
          <Button
            type={location.pathname.startsWith('/game/') ? 'primary' : 'text'}
            icon={<CompassOutlined />}
            onClick={() => navigate(`/game/${city.id}`)}
          >
            {city.name}
          </Button>
        )}
      </Space>

      <Space size={12}>
        {city && (
          <Tag
            icon={<DollarCircleOutlined />}
            color="gold"
            style={{ fontSize: 13, padding: '4px 10px', margin: 0 }}
          >
            {city.economy.cityCoins.toLocaleString('en-US')} Coins
          </Tag>
        )}

        <Tag
          icon={<UserOutlined />}
          color="cyan"
          style={{ fontSize: 13, padding: '4px 10px', margin: 0 }}
        >
          {character?.name ?? user?.username ?? 'Mayor'}
        </Tag>

        <Button icon={<LogoutOutlined />} onClick={handleLogout} size="middle">
          Dang xuat
        </Button>
      </Space>
    </Header>
  );
}
