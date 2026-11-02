/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Read environment variables (e.g. LOGIN_EMAIL, LOGIN_PASSWORD) from a local .env file.
 * Uses Node's built-in loader, so no extra package is needed. The .env file is git-ignored.
 */
const envFile = path.resolve(__dirname, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Extra time per test only in demo mode (slow motion + highlighted checks). */
  timeout: process.env.DEMO ? 120_000 : 30_000,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Run one test at a time so only one browser window is open. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Demo mode only (DEMO=1): slow down each click/typing by 1s so the run is easy to follow.
       Checks are also highlighted and paused on (see utils/show-check.ts).
       Normal runs have no delays, same timing as CI, so race conditions are not hidden. */
    launchOptions: {
      slowMo: process.env.DEMO && !process.env.CI ? 1000 : 0,
    },
  },

  /* Configure projects for major browsers */
  projects: [
    /* Logs in once and saves the session to playwright/.auth/user.json (git-ignored). */
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    /* All tests start already logged in, using the session saved by "setup". */
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.resolve(__dirname, 'playwright/.auth/user.json'),
      },
      dependencies: ['setup'],
    },

    /* Firefox and WebKit disabled - run on Chrome only. Uncomment to test other browsers. */
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
