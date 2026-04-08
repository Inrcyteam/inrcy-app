import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const isCI = !!process.env.CI;

// Si E2E_BASE_URL est fourni, on vise un environnement déjà déployé.
// Sinon, on démarre le serveur local.
const shouldStartWebServer = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,

  reporter: isCI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  webServer: shouldStartWebServer
    ? {
        command: isCI ? 'sh -c "if [ -f .next/BUILD_ID ]; then npm run start -- -p 3000; else npm run dev -- -p 3000; fi"' : 'npm run dev -- -p 3000',
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 300_000,
      }
    : undefined,

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});