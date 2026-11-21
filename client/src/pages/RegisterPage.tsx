import { BankOutlined, LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { RegisterInput } from '@cityverse/shared';
import { authApi } from '../api/auth.api';
import { getApiErrorMessage } from '../api/httpClient';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';

interface RegisterFormValues extends RegisterInput {
  confirmPassword: string;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setSession = useAuthStore((state) => state.setSession);
  const setCharacter = useGameStore((state) => state.setCharacter);
  const setCity = useGameStore((state) => state.setCity);

  const registerMutation = useMutation({
    mutationFn: (values: RegisterInput) => authApi.register(values),
    onSuccess: (data) => {
      setSession(data.user, data.tokens);
      setCharacter(null);
      setCity(null);
      navigate('/character/create', { replace: true });
    },
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="cv-auth-shell">
      <Card className="cv-glass-card" style={{ width: '100%', maxWidth: 460 }}>
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <BankOutlined style={{ fontSize: 40, color: '#00d4aa', marginBottom: 8 }} />
            <Typography.Title level={2} style={{ margin: 0, letterSpacing: 1.5 }}>
              TAO TAI KHOAN
            </Typography.Title>
            <Typography.Text type="secondary">
              Bat dau hanh trinh xay dung thanh pho 3D trong CITYVERSE
            </Typography.Text>
          </div>

          {registerMutation.isError && (
            <Alert
              type="error"
              showIcon
              message={getApiErrorMessage(registerMutation.error, 'Dang ky that bai')}
            />
          )}

          <Form<RegisterFormValues>
            layout="vertical"
            onFinish={({ email, username, password }) =>
              registerMutation.mutate({ email, username, password })
            }
            requiredMark={false}
          >
            <Form.Item
              label="Ten tai khoan"
              name="username"
              extra="3-32 ky tu, chi gom chu, so va dau gach duoi (_)"
              rules={[
                { required: true, message: 'Vui long nhap ten tai khoan' },
                { min: 3, message: 'Toi thieu 3 ky tu' },
                { max: 32, message: 'Toi da 32 ky tu' },
                { pattern: /^[a-zA-Z0-9_]+$/, message: 'Chi gom chu, so va dau gach duoi' },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                autoComplete="username"
                placeholder="mayor_alex"
                size="large"
              />
            </Form.Item>

            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Vui long nhap email' },
                { type: 'email', message: 'Email khong hop le' },
              ]}
            >
              <Input
                prefix={<MailOutlined />}
                type="email"
                autoComplete="email"
                placeholder="mayor@cityverse.io"
                size="large"
              />
            </Form.Item>

            <Form.Item
              label="Mat khau"
              name="password"
              extra="Toi thieu 8 ky tu, gom chu hoa, chu thuong va chu so"
              rules={[
                { required: true, message: 'Vui long nhap mat khau' },
                { min: 8, message: 'Mat khau toi thieu 8 ky tu' },
                {
                  pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
                  message: 'Can it nhat 1 chu hoa, 1 chu thuong va 1 chu so',
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                autoComplete="new-password"
                placeholder="CityVerse2026"
                size="large"
              />
            </Form.Item>

            <Form.Item
              label="Xac nhan mat khau"
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: 'Vui long xac nhan mat khau' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('Mat khau xac nhan khong khop'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                autoComplete="new-password"
                placeholder="Nhap lai mat khau"
                size="large"
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={registerMutation.isPending}
            >
              Dang ky tai khoan
            </Button>
          </Form>

          <Typography.Text style={{ textAlign: 'center', display: 'block', color: '#94a3b8' }}>
            Da co tai khoan?{' '}
            <Link to="/login" style={{ color: '#00d4aa', fontWeight: 600 }}>
              Dang nhap
            </Link>
          </Typography.Text>
        </Space>
      </Card>
    </div>
  );
}
