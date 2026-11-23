import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { installAudioUnlock } from './audio/AudioManager';
import { connectRealtime } from './realtime/socket';
import { useAuthStore } from './stores/authStore';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AppRouter } from './routes/AppRouter';
import { cityverseTheme } from './theme/gameTheme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/** Audio unlock on the first gesture; one realtime socket while signed in. */
function Runtime() {
  const token = useAuthStore((s) => s.accessToken);
  useEffect(() => installAudioUnlock(), []);
  useEffect(() => {
    if (token) connectRealtime();
  }, [token]);
  return null;
}

export function App() {
  return (
    <ConfigProvider theme={cityverseTheme}>
      <AntdApp>
        <AppErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <Runtime />
              <AppRouter />
            </BrowserRouter>
          </QueryClientProvider>
        </AppErrorBoundary>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
