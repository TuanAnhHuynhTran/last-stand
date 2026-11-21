import type { ReactNode } from 'react';
import { Layout } from 'antd';
import { GameNavbar } from './GameNavbar';

const { Content } = Layout;

interface AppLayoutProps {
  children: ReactNode;
  fullBleed?: boolean;
}

export function AppLayout({ children, fullBleed = false }: AppLayoutProps) {
  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <GameNavbar />
      <Content style={fullBleed ? { padding: 0 } : undefined}>
        {fullBleed ? children : <div className="cv-page-container">{children}</div>}
      </Content>
    </Layout>
  );
}
