/**
 * Browser smoke tests (Phase 12). Starts the real API (SQLite file, fresh each run) and the
 * Vite client, then drives Chromium. Run: `npm run test:e2e` (first time:
 * `npx playwright install chromium`).
 */
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const db = path.resolve(__dirname, '.data', `e2e-${Date.now()}.sqlite`);

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: path.resolve(__dirname, '../server'),
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'development',
        PORT: '4000',
        DB_DIALECT: 'sqlite',
        DB_STORAGE: db,
        DEV_AUTO_ADMIN: 'false',
        BCRYPT_SALT_ROUNDS: '4',
        AUTH_RATE_LIMIT_MAX_ATTEMPTS: '1000',
      },
    },
    {
      command: 'npx vite --port 5173 --strictPort',
      cwd: path.resolve(__dirname, '../client'),
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_AUTO_ADMIN_LOGIN: 'false' },
    },
  ],
});
