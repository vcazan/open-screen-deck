import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite for the companion app (simulator mode — no hardware needed).
 * Runs against a dedicated Vite dev server so it never fights the one you
 * have open in a browser.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false, // simulator state lives in browser storage per test
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:5175',
    viewport: { width: 1440, height: 860 },
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5175 --strictPort',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
