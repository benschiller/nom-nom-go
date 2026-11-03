import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // 8 parallel headless WebKit browsers (the default on a 16-core Mac) stall
  // frame production on the game page, hanging clicks. 4 is reliable.
  workers: 4,
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'iphone15-webkit',
      use: { ...devices['iPhone 15'], browserName: 'webkit', viewport: { width: 852, height: 393 } },
    },
    {
      name: 'ipad-webkit',
      use: { ...devices['iPad Pro 11'], browserName: 'webkit', viewport: { width: 1194, height: 834 } },
    },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
  ],
});
