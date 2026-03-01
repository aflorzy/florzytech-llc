import { defineConfig } from '@playwright/test';
import { loadTestEnv } from './tests/utils/env-loader';

const env = loadTestEnv();
const baseURL = env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  retries: 0,
  fullyParallel: false,
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: baseURL,
    timeout: 120000,
    reuseExistingServer: true,
    env: {
      ...process.env,
      DATABASE_URL: env.DATABASE_URL_TEST,
      DATABASE_URL_TEST: env.DATABASE_URL_TEST
    }
  }
});
