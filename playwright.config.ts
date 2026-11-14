import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  projects: [
    { name: 'chrome', use: { browserName: 'chromium', channel: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: 'pnpm dev:preview',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
