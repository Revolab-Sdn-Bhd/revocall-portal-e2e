import { test as setup, AUTH_FILE, requireCredentials } from '../../fixtures/base.fixture';

/**
 * Runs once before the other tests (see the "setup" project in playwright.config.ts).
 * Logs in through the UI and saves the session, so other tests start already logged in.
 */
setup('log in and save session', async ({ page, loginPage, dashboardPage, loginData }) => {
  const { email, password, organization } = loginData.validUser;
  requireCredentials(loginData.validUser);

  await loginPage.goto();
  await loginPage.login(email, password, organization);
  // Save only after the dashboard is fully shown, so the session is complete.
  await dashboardPage.expectLoaded(new RegExp(loginData.successUrlPattern));

  await page.context().storageState({ path: AUTH_FILE });
});
