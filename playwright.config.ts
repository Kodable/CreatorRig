import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './bench',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'results/playwright.json' }]],
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1138, height: 640 },
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1138, height: 640 },
        launchOptions: {
          // Headless Chromium renders WebGL through SwiftShader. Keep the GPU blocklist off
          // so the WebGL context is created; numbers are for harness checks, not devices.
          args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
        },
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1138, height: 640 },
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
