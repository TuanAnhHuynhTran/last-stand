import { useEffect } from 'react';
import {
  BankOutlined,
  CompassOutlined,
  DollarCircleOutlined,
  EnvironmentOutlined,
  SmileOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Row,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import { Navigate, useNavigate } from 'react-router-dom';
import { dashboardApi } from '../api/dashboard.api';
import { getApiErrorMessage } from '../api/httpClient';
import { AppLayout } from '../components/AppLayout';
import { CharacterAvatarPreview } from '../components/CharacterAvatarPreview';
import { FullPageLoader } from '../components/FullPageLoader';
import { useGameStore } from '../stores/gameStore';

export function DashboardPage() {
  const navigate = useNavigate();
  const setCharacter = useGameStore((state) => state.setCharacter);
  const setCity = useGameStore((state) => state.setCity);

  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.getDashboard,
  });

  useEffect(() => {
    if (dashboardQuery.data) {
      setCharacter(dashboardQuery.data.character);
      setCity(dashboardQuery.data.city);
    }
  }, [dashboardQuery.data, setCharacter, setCity]);

  if (dashboardQuery.isLoading) {
    return <FullPageLoader tip="Dang tai Dashboard thanh pho..." />;
  }

  if (dashboardQuery.isError) {
    return (
      <AppLayout>
        <Alert
          type="error"
          showIcon
          message="Khong the tai du lieu Dashboard"
          description={getApiErrorMessage(dashboardQuery.error)}
          action={
            <Button size="small" onClick={() => dashboardQuery.refetch()}>
              Thu lai
            </Button>
          }
        />
      </AppLayout>
    );
  }

  const data = dashboardQuery.data;
  if (!data) {
    return <FullPageLoader />;
  }

  if (!data.character) {
    return <Navigate to="/character/create" replace />;
  }

  if (!data.city) {
    return <Navigate to="/city/create" replace />;
  }

  const { character, city } = data;

  return (
    <AppLayout>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <Tag color="cyan" style={{ marginBottom: 8 }}>
              TRUNG TAM DIEU HANH CITYVERSE
            </Tag>
            <Typography.Title level={2} style={{ margin: 0 }}>
              Chao mung, {character.name}
            </Typography.Title>
            <Typography.Text type="secondary">
              Tai khoan: @{data.user.username} — San sang phat trien thanh pho cua ban.
            </Typography.Text>
          </div>

          <Button
            type="primary"
            size="large"
            icon={<CompassOutlined />}
            onClick={() => navigate(`/game/${city.id}`)}
            style={{ height: 48, paddingInline: 28, fontSize: 16 }}
          >
            Vào thành phố
          </Button>
        </div>

        {/* Key City Metrics */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card className="cv-glass-card">
              <Statistic
                title="Cap do thanh pho"
                value={city.level}
                prefix={<TrophyOutlined style={{ color: '#38bdf8' }} />}
                suffix="Lv"
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="cv-glass-card">
              <Statistic
                title="Ngan sach (City Coins)"
                value={city.economy.cityCoins}
                prefix={<DollarCircleOutlined style={{ color: '#f59e0b' }} />}
                valueStyle={{ color: '#fbbf24' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="cv-glass-card">
              <Statistic
                title="Dan so"
                value={city.economy.population}
                prefix={<TeamOutlined style={{ color: '#00d4aa' }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="cv-glass-card">
              <Statistic
                title="Chi so hanh phuc"
                value={city.economy.happiness}
                prefix={<SmileOutlined style={{ color: '#10b981' }} />}
                suffix="%"
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[24, 24]}>
          {/* Character Summary */}
          <Col xs={24} lg={9}>
            <Card className="cv-glass-card" title="Nhan Vat 3D Cua Ban">
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <CharacterAvatarPreview name={character.name} appearance={character.appearance} />

                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="Ten nhan vat">
                    <Typography.Text strong>{character.name}</Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Preset">{character.presetId}</Descriptions.Item>
                  <Descriptions.Item label="Phong cach">
                    <Tag color="cyan">{character.appearance.outfitStyle}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Phu kien">
                    <Tag color="purple">{character.appearance.accessory}</Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>
          </Col>

          {/* City Summary */}
          <Col xs={24} lg={15}>
            <Card
              className="cv-glass-card"
              title={
                <Space>
                  <BankOutlined style={{ color: '#00d4aa' }} />
                  <span>{city.name}</span>
                  <Tag color="gold">Level {city.level}</Tag>
                  <Tag color={city.isPublic ? 'green' : 'default'}>
                    {city.isPublic ? 'Cong khai' : 'Rieng tu'}
                  </Tag>
                </Space>
              }
            >
              <Space direction="vertical" size={20} style={{ width: '100%' }}>
                <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
                  <Descriptions.Item label="Ma thanh pho">{city.id}</Descriptions.Item>
                  <Descriptions.Item label="Vai tro">
                    <Tag color="cyan">{city.role.toUpperCase()}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Dia hinh">
                    <EnvironmentOutlined style={{ color: '#00d4aa', marginRight: 6 }} />
                    {city.terrainType}
                  </Descriptions.Item>
                  <Descriptions.Item label="Kich thuoc ban do">
                    {city.mapWidth} x {city.mapHeight} o
                  </Descriptions.Item>
                  <Descriptions.Item label="World Seed">
                    <code>{city.worldSeed}</code>
                  </Descriptions.Item>
                  <Descriptions.Item label="Thue suat">
                    {city.economy.taxRate.toFixed(1)}%
                  </Descriptions.Item>
                </Descriptions>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    paddingTop: 8,
                  }}
                >
                  <Button
                    type="primary"
                    size="large"
                    icon={<CompassOutlined />}
                    onClick={() => navigate(`/game/${city.id}`)}
                  >
                    Vào thành phố {city.name}
                  </Button>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>
      </Space>
    </AppLayout>
  );
}
