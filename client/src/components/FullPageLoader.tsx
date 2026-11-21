import { Spin, Typography } from 'antd';

interface FullPageLoaderProps {
  tip?: string;
}

export function FullPageLoader({ tip = 'Dang tai du lieu CITYVERSE...' }: FullPageLoaderProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
      role="status"
      aria-live="polite"
    >
      <Spin size="large" />
      <Typography.Text style={{ color: '#94a3b8' }}>{tip}</Typography.Text>
    </div>
  );
}
