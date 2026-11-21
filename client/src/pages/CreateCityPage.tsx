import { useState } from 'react';
import {
  BankOutlined,
  CheckCircleFilled,
  DollarCircleOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Row,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { Navigate, useNavigate } from 'react-router-dom';
import type { TerrainType } from '@cityverse/shared';
import { cityApi } from '../api/city.api';
import { getApiErrorMessage } from '../api/httpClient';
import { AppLayout } from '../components/AppLayout';
import { FullPageLoader } from '../components/FullPageLoader';
import { useGameStore } from '../stores/gameStore';

interface CreateCityFormValues {
  name: string;
  isPublic: boolean;
}

export function CreateCityPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const character = useGameStore((state) => state.character);
  const existingCity = useGameStore((state) => state.city);
  const setCity = useGameStore((state) => state.setCity);

  const [selectedTerrain, setSelectedTerrain] = useState<TerrainType>('plains');

  const terrainsQuery = useQuery({
    queryKey: ['city-terrains'],
    queryFn: cityApi.getTerrains,
  });

  const createCityMutation = useMutation({
    mutationFn: (values: CreateCityFormValues) =>
      cityApi.createCity({
        name: values.name,
        terrainType: selectedTerrain,
        isPublic: values.isPublic,
      }),
    onSuccess: (city) => {
      setCity(city);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate('/dashboard', { replace: true });
    },
  });

  if (!character) {
    return <Navigate to="/character/create" replace />;
  }

  if (existingCity) {
    return <Navigate to="/dashboard" replace />;
  }

  if (terrainsQuery.isLoading || !terrainsQuery.data) {
    return <FullPageLoader tip="Dang tai du lieu dia hinh..." />;
  }

  const { terrains, config } = terrainsQuery.data;
  const activeTerrain = terrains.find((t) => t.id === selectedTerrain) ?? terrains[0];

  return (
    <AppLayout>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <div>
          <Tag color="green" style={{ marginBottom: 8 }}>
            BUOC 2 / 2 — KHOI TAO THANH PHO
          </Tag>
          <Typography.Title level={2} style={{ margin: 0 }}>
            Thanh Lap Thanh Pho Moi
          </Typography.Title>
          <Typography.Text type="secondary">
            Chon dia hinh va dat ten cho the gioi do thi 3D doc lap cua ban.
          </Typography.Text>
        </div>

        {createCityMutation.isError && (
          <Alert
            type="error"
            showIcon
            message={getApiErrorMessage(createCityMutation.error, 'Khong the tao thanh pho')}
          />
        )}

        <Row gutter={[24, 24]}>
          <Col xs={24} lg={15}>
            <Card className="cv-glass-card" title="Chon Kieu Dia Hinh">
              <Row gutter={[16, 16]}>
                {terrains.map((terrain) => {
                  const isActive = terrain.id === selectedTerrain;
                  return (
                    <Col xs={24} sm={12} key={terrain.id}>
                      <Card
                        size="small"
                        className={`cv-selectable-card ${isActive ? 'cv-selectable-card--active' : ''}`}
                        onClick={() => setSelectedTerrain(terrain.id)}
                      >
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                          <div
                            style={{
                              height: 54,
                              borderRadius: 8,
                              background: `linear-gradient(120deg, ${terrain.previewPalette.ground} 0%, ${terrain.previewPalette.accent} 58%, ${terrain.previewPalette.water} 100%)`,
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography.Text strong style={{ fontSize: 15 }}>
                              {terrain.name}
                            </Typography.Text>
                            {isActive && <CheckCircleFilled style={{ color: '#00d4aa' }} />}
                          </div>
                          <Space size={6} wrap>
                            <Tag color="geekblue">{terrain.climate}</Tag>
                            <Tag color="cyan">
                              Dat xay dung: {Math.round(terrain.buildableRatio * 100)}%
                            </Tag>
                          </Space>
                          <Typography.Paragraph
                            type="secondary"
                            style={{ margin: 0, fontSize: 13 }}
                          >
                            {terrain.description}
                          </Typography.Paragraph>
                        </Space>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            </Card>
          </Col>

          <Col xs={24} lg={9}>
            <Card className="cv-glass-card" title="Thong So Khoi Tao">
              <Space direction="vertical" size={20} style={{ width: '100%' }}>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="Dia hinh da chon">
                    <EnvironmentOutlined style={{ color: '#00d4aa', marginRight: 6 }} />
                    {activeTerrain.name}
                  </Descriptions.Item>
                  <Descriptions.Item label="Kich thuoc ban do">
                    {config.MAP_WIDTH} x {config.MAP_HEIGHT} o
                  </Descriptions.Item>
                  <Descriptions.Item label="Ngan sach khoi diem">
                    <Typography.Text strong style={{ color: '#f59e0b' }}>
                      <DollarCircleOutlined style={{ marginRight: 6 }} />
                      {config.INITIAL_COINS.toLocaleString('en-US')} City Coins
                    </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="World Seed">
                    Tu dong sinh tai backend
                  </Descriptions.Item>
                  <Descriptions.Item label="Quyen so huu">Owner (Chu thanh pho)</Descriptions.Item>
                </Descriptions>

                <Form<CreateCityFormValues>
                  layout="vertical"
                  initialValues={{ isPublic: true }}
                  onFinish={(values) => createCityMutation.mutate(values)}
                  requiredMark={false}
                >
                  <Form.Item
                    label="Ten thanh pho"
                    name="name"
                    extra="3-50 ky tu"
                    rules={[
                      { required: true, message: 'Vui long nhap ten thanh pho' },
                      { min: 3, message: 'Ten thanh pho toi thieu 3 ky tu' },
                      { max: 50, message: 'Ten thanh pho toi da 50 ky tu' },
                    ]}
                  >
                    <Input placeholder="VD: Neo Saigon" size="large" maxLength={50} />
                  </Form.Item>

                  <Form.Item
                    label="Cho phep nguoi choi khac tham quan"
                    name="isPublic"
                    valuePropName="checked"
                  >
                    <Switch checkedChildren="Cong khai" unCheckedChildren="Rieng tu" />
                  </Form.Item>

                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<BankOutlined />}
                    block
                    size="large"
                    loading={createCityMutation.isPending}
                  >
                    Khoi tao thanh pho
                  </Button>
                </Form>
              </Space>
            </Card>
          </Col>
        </Row>
      </Space>
    </AppLayout>
  );
}
