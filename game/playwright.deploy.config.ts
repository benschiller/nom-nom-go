import { defineConfig } from '@playwright/test';
import base from './playwright.offline.config';

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    command: 'node scripts/preview-deployment.mjs',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
});
