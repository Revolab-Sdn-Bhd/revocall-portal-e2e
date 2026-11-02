import { test as base } from './base.fixture';

/**
 * Fixture for tests that exercise the sign-in page itself (login, logout).
 * - Starts every test logged out, ignoring the saved session from auth.setup.ts.
 * - Opens the sign-in page before each test.
 */
export const test = base.extend({
  storageState: async ({}, use) => {
    await use({ cookies: [], origins: [] });
  },

  loginPage: async ({ loginPage }, use) => {
    await loginPage.goto();
    await use(loginPage);
  },
});

export { expect, requireCredentials } from './base.fixture';
export type { LoginData, LoginUser } from './base.fixture';
