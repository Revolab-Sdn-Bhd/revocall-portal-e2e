import { test, expect, requireCredentials } from '../../fixtures/login.fixture';

/*
 * Uses the login fixture, so this test logs in with its own fresh session.
 * Signing out here does not affect the shared session saved by auth.setup.ts,
 * so it can run in any order with the other tests.
 */
test.describe('Logout', { tag: '@smoke' }, () => {
  test('should sign out and block the dashboard', { tag: '@AT-LOGIN-005' }, async ({ loginPage, loginData, dashboardPage, page }) => {
    const { email, password, organization } = loginData.validUser;
    requireCredentials(loginData.validUser);

    await test.step('Log in', async () => {
      await loginPage.login(email, password, organization);
      await dashboardPage.expectLoaded(new RegExp(loginData.successUrlPattern));
    });

    await test.step('Sign out', async () => {
      // Waits for the confirmation dialog, the logout response and the dialog closing.
      await dashboardPage.signOut();

      await expect(page).toHaveURL(/\/auth\/sign-in/);
      await expect(loginPage.signInHeading).toBeVisible();
      await expect(dashboardPage.signOutButton).toBeHidden();
    });

    await test.step('Dashboard is no longer reachable', async () => {
      await dashboardPage.goto('/dashboard');

      await expect(page).toHaveURL(/\/auth\/sign-in/);
      await expect(loginPage.signInHeading).toBeVisible();
      await expect(dashboardPage.sidebarNavigation).toBeHidden();
    });
  });
});
