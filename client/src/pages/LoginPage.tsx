import { BankOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { LoginInput } from '@cityverse/shared';
import { authApi } from '../api/auth.api';
import { getApiErrorMessage } from '../api/httpClient';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';

export function LoginPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setSession = useAuthStore((state) => state.setSession);
  const setCharacter = useGameStore((state) => state.setCharacter);
  const setCity = useGameStore((state) => state.setCity);

  const loginMutation = useMutation({
    mutationFn: (values: LoginInput) => authApi.login(values),
    onSuccess: (data) => {
      setSession(data.user, data.tokens);
      setCharacter(data.character);
      setCity(data.city);

      if (!data.character) {
        navigate('/character/create', { replace: true });
      } else if (!data.city) {
        navigate('/city/create', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    },
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="cv-auth-shell">
      <Card className="cv-glass-card" style={{ width: '100%', maxWidth: 440 }}>
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <BankOutlined style={{ fontSize: 40, color: '#00d4aa', marginBottom: 8 }} />
            <Typography.Title level={2} style={{ margin: 0, letterSpacing: 1.5 }}>
              CITYVERSE
            </Typography.Title>
            <Typography.Text type="secondary">
              Dang nhap de quan ly thanh pho 3D cua ban
            </Typography.Text>
          </div>

          {loginMutation.isError && (
            <Alert
              type="error"
              showIcon
              message={getApiErrorMessage(loginMutation.error, 'Dang nhap that bai')}
            />
          )}

          <Form<LoginInput>
            layout="vertical"
            onFinish={(values) => loginMutation.mutate(values)}
            requiredMark={false}
          >
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Vui long nhap email' },
                { type: 'email', message: 'Email khong dung dinh dang' },
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
              rules={[{ required: true, message: 'Vui long nhap mat khau' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                autoComplete="current-password"
                placeholder="Nhap mat khau"
                size="large"
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loginMutation.isPending}
              style={{ marginTop: 8 }}
            >
              Dang nhap
            </Button>
          </Form>

          <Typography.Text style={{ textAlign: 'center', display: 'block', color: '#94a3b8' }}>
            Chua co tai khoan?{' '}
            <Link to="/register" style={{ color: '#00d4aa', fontWeight: 600 }}>
              Dang ky ngay
            </Link>
          </Typography.Text>
        </Space>
      </Card>
    </div>
  );
}
