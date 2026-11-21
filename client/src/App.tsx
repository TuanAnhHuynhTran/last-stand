import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import { BrowserRouter } from 'react-router-dom';
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

export function App() {
  return (
    <ConfigProvider theme={cityverseTheme}>
      <AntdApp>
        <AppErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <AppRouter />
            </BrowserRouter>
          </QueryClientProvider>
        </AppErrorBoundary>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
