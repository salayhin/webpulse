import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/screenshots',
  snapshotDir: './tests/screenshots',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/playwright-report', open: 'never' }],
  ],
  use: {
    // Chrome extensions require a real browser window — always headed.
    // Set PWHEADLESS=true to move the window off-screen (background mode).
    headless: false,
    screenshot: 'on',
    video: 'off',
    trace: 'off',
  },
  timeout: 40_000,
  globalSetup: './tests/e2e/global-setup.ts',
  projects: [
    {
      name: 'smoke',
      testMatch: '**/smoke.spec.ts',
    },
    {
      name: 'extension',
      use: { viewport: { width: 1280, height: 820 } },
      testMatch: ['**/dashboard.spec.ts', '**/youtube-screenshot.spec.ts'],
    },
    {
      name: 'popup',
      use: { viewport: { width: 440, height: 680 } },
      testMatch: '**/popup.spec.ts',
    },
    {
      name: 'store',
      use: { viewport: { width: 1280, height: 800 } },
      testMatch: '**/store-screenshots.spec.ts',
    },
    {
      // No extension needed — opens local HTML files only. Can run headless.
      name: 'store-promo',
      use: { headless: true },
      testMatch: '**/store-promo.spec.ts',
    },
  ],
});
