import { theme, type ThemeConfig } from 'antd';

export const cityverseTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#00d4aa',
    colorInfo: '#38bdf8',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#f43f5e',
    colorBgBase: '#09101d',
    colorBgContainer: '#111b2e',
    colorBgElevated: '#16233a',
    colorBorder: '#243554',
    colorTextBase: '#e6edf8',
    borderRadius: 10,
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  },
  components: {
    Layout: {
      headerBg: '#0c1526',
      bodyBg: '#09101d',
    },
    Card: {
      colorBgContainer: '#111b2e',
      colorBorderSecondary: '#233452',
    },
    Button: {
      primaryColor: '#041417',
      fontWeight: 600,
    },
    Input: {
      colorBgContainer: '#0b1424',
      activeBorderColor: '#00d4aa',
      hoverBorderColor: '#38bdf8',
    },
    Tag: {
      borderRadiusSM: 6,
    },
  },
};
