import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Read variables (LOGIN_EMAIL, BASE_URL, ...) from the git-ignored .env file, using Node's built-in loader.
const envFile = path.resolve(__dirname, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

// ENV-01: staging is the default; set BASE_URL to run against another environment.
const STAGING_URL = 'https://admin.stg.revocall-staging.com';

export default defineConfig({
  testDir: './tests',
  // Demo mode (slow motion + highlighted checks) needs more time per test.
  timeout: process.env.DEMO ? 120_000 : 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CFG-03 accepted exception: the tests share staging accounts, so they run one at a time (see README).
  workers: 1,
  // In CI the github reporter puts flaky (failed then passed on retry) tests in the run summary.
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'html',
  use: {
    // BASE_URL may be set but empty in CI when the variable is not defined, hence || and not ??.
    baseURL: process.env.BASE_URL || STAGING_URL,

    // Users are in Malaysia, and exports label times in the browser's time zone. CI runners are UTC.
    timezoneId: 'Asia/Kuala_Lumpur',

    // CFG-01: keep evidence of failures.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Demo mode only (DEMO=1): slow each action by 1s. Normal runs have no delay, same as CI,
    // so race conditions are not hidden.
    launchOptions: {
      slowMo: process.env.DEMO && !process.env.CI ? 1000 : 0,
    },
  },

  projects: [
    // Logs in once and saves the session to playwright/.auth/user.json (git-ignored).
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // All tests start already logged in, using the session saved by "setup". Chrome only.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.resolve(__dirname, 'playwright/.auth/user.json'),
      },
      dependencies: ['setup'],
    },
  ],
});
