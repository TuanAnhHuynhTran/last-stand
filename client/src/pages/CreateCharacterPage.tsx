import { useEffect, useState } from 'react';
import { CheckCircleFilled, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Form, Input, Row, Space, Tag, Typography } from 'antd';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  ALLOWED_ACCENT_COLORS,
  ALLOWED_SKIN_TONES,
  type CharacterAppearance,
  type CharacterPreset,
} from '@cityverse/shared';
import { characterApi } from '../api/character.api';
import { getApiErrorMessage } from '../api/httpClient';
import { AppLayout } from '../components/AppLayout';
import { CharacterAvatarPreview } from '../components/CharacterAvatarPreview';
import { FullPageLoader } from '../components/FullPageLoader';
import { useGameStore } from '../stores/gameStore';

export function CreateCharacterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const existingCharacter = useGameStore((state) => state.character);
  const existingCity = useGameStore((state) => state.city);
  const setCharacter = useGameStore((state) => state.setCharacter);

  const [selectedPreset, setSelectedPreset] = useState<CharacterPreset | null>(null);
  const [appearance, setAppearance] = useState<CharacterAppearance | null>(null);

  const presetsQuery = useQuery({
    queryKey: ['character-presets'],
    queryFn: characterApi.getPresets,
  });

  useEffect(() => {
    if (presetsQuery.data && presetsQuery.data.length > 0 && !selectedPreset) {
      const firstPreset = presetsQuery.data[0];
      setSelectedPreset(firstPreset);
      setAppearance({ ...firstPreset.appearance });
    }
  }, [presetsQuery.data, selectedPreset]);

  const createMutation = useMutation({
    mutationFn: (name: string) => {
      if (!selectedPreset || !appearance) {
        throw new Error('Vui long chon preset ngoai hinh');
      }
      return characterApi.createCharacter({
        name,
        presetId: selectedPreset.id,
        appearance,
      });
    },
    onSuccess: (character) => {
      setCharacter(character);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate(existingCity ? '/dashboard' : '/city/create', { replace: true });
    },
  });

  if (existingCharacter) {
    return <Navigate to={existingCity ? '/dashboard' : '/city/create'} replace />;
  }

  if (presetsQuery.isLoading || !selectedPreset || !appearance) {
    return <FullPageLoader tip="Dang tai danh sach preset nhan vat..." />;
  }

  const handleSelectPreset = (preset: CharacterPreset) => {
    setSelectedPreset(preset);
    setAppearance({ ...preset.appearance });
  };

  return (
    <AppLayout>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <div>
          <Tag color="cyan" style={{ marginBottom: 8 }}>
            BUOC 1 / 2 — KHOI TAO NHAN VAT 3D
          </Tag>
          <Typography.Title level={2} style={{ margin: 0 }}>
            Tao Nhan Vat Cua Ban
          </Typography.Title>
          <Typography.Text type="secondary">
            Moi tai khoan so huu 1 nhan vat 3D doc lap de kham pha va xay dung thanh pho.
          </Typography.Text>
        </div>

        {presetsQuery.isError && (
          <Alert
            type="error"
            showIcon
            message={getApiErrorMessage(presetsQuery.error, 'Khong tai duoc preset nhan vat')}
          />
        )}

        {createMutation.isError && (
          <Alert
            type="error"
            showIcon
            message={getApiErrorMessage(createMutation.error, 'Khong the tao nhan vat')}
          />
        )}

        <Row gutter={[24, 24]}>
          <Col xs={24} lg={15}>
            <Card className="cv-glass-card" title="Chon Preset Ngoai Hinh">
              <Row gutter={[16, 16]}>
                {presetsQuery.data?.map((preset) => {
                  const isActive = preset.id === selectedPreset.id;
                  return (
                    <Col xs={24} sm={12} key={preset.id}>
                      <Card
                        size="small"
                        className={`cv-selectable-card ${isActive ? 'cv-selectable-card--active' : ''}`}
                        onClick={() => handleSelectPreset(preset)}
                      >
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography.Text strong style={{ fontSize: 15 }}>
                              {preset.name}
                            </Typography.Text>
                            {isActive && <CheckCircleFilled style={{ color: '#00d4aa' }} />}
                          </div>
                          <Tag color="blue" style={{ width: 'fit-content' }}>
                            {preset.title}
                          </Tag>
                          <Typography.Paragraph
                            type="secondary"
                            style={{ margin: 0, fontSize: 13 }}
                          >
                            {preset.description}
                          </Typography.Paragraph>
                        </Space>
                      </Card>
                    </Col>
                  );
                })}
              </Row>

              <div style={{ marginTop: 24 }}>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  Tuy chinh mau da
                </Typography.Text>
                <Space wrap size={10}>
                  {ALLOWED_SKIN_TONES.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      aria-label={`Chon mau da ${tone}`}
                      className={`cv-color-swatch ${appearance.skinTone === tone ? 'cv-color-swatch--active' : ''}`}
                      style={{ backgroundColor: tone }}
                      onClick={() => setAppearance({ ...appearance, skinTone: tone })}
                    />
                  ))}
                </Space>
              </div>

              <div style={{ marginTop: 18 }}>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  Tuy chinh mau trang phuc chinh
                </Typography.Text>
                <Space wrap size={10}>
                  {ALLOWED_ACCENT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Chon mau trang phuc ${color}`}
                      className={`cv-color-swatch ${appearance.outfitPrimaryColor === color ? 'cv-color-swatch--active' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setAppearance({ ...appearance, outfitPrimaryColor: color })}
                    />
                  ))}
                </Space>
              </div>
            </Card>
          </Col>

          <Col xs={24} lg={9}>
            <Card className="cv-glass-card" title="Ho So Nhan Vat">
              <Space direction="vertical" size={20} style={{ width: '100%' }}>
                <CharacterAvatarPreview appearance={appearance} size="lg" />

                <Form<{ name: string }>
                  layout="vertical"
                  onFinish={(values) => createMutation.mutate(values.name)}
                  requiredMark={false}
                >
                  <Form.Item
                    label="Ten nhan vat"
                    name="name"
                    extra="2-32 ky tu, hien thi trong the gioi 3D va multiplayer"
                    rules={[
                      { required: true, message: 'Vui long nhap ten nhan vat' },
                      { min: 2, message: 'Toi thieu 2 ky tu' },
                      { max: 32, message: 'Toi da 32 ky tu' },
                    ]}
                  >
                    <Input placeholder="VD: Alex Horizon" size="large" maxLength={32} />
                  </Form.Item>

                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<UserAddOutlined />}
                    block
                    size="large"
                    loading={createMutation.isPending}
                  >
                    Xac nhan & Tiep tuc tao thanh pho
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
