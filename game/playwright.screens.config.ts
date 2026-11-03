import { defineConfig, devices } from '@playwright/test';

/** Screen-QA captures (art-integration skill). Not part of the e2e gate.
 *  Driven by tools/art/screen.py capture; reuses a running dev server. */
export default defineConfig({
  testDir: './screens',
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:5173', reducedMotion: 'reduce' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2 } }],
});
