import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'offline.spec.ts',
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:4173', ...devices['Desktop Chrome'] },
  projects: [{ name: 'offline-chromium', use: { browserName: 'chromium' } }],
});
