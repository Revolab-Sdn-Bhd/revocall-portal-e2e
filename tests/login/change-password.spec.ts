import { test, expect } from '../../fixtures/change-password.fixture';

/*
 * Uses a dedicated account (CHANGE_PWD_* in .env), never the LOGIN_* one.
 * The change-password fixture always restores the original password afterwards
 * (see fixtures/change-password.fixture.ts for the password rule).
 */
test.describe('Login - change password', { tag: '@regression' }, () => {
  test(
    'should sign in with the new password after changing it',
    { tag: '@AT-LOGIN-004' },
    async ({ loginPage, loginData, dashboardPage, changePasswordDialog, changePwdUser, passwordGuard }) => {
      const { email, originalPassword, temporaryPassword, organization } = changePwdUser;
      const dashboardUrl = new RegExp(loginData.successUrlPattern);

      await test.step('Sign in with the original password', async () => {
        await loginPage.login(email, originalPassword, organization);
        await dashboardPage.expectLoaded(dashboardUrl);
      });

      await test.step('Change the password to the temporary one', async () => {
        await changePasswordDialog.open();
        // Unknown until the server answers: tells the fixture to check which password is active.
        passwordGuard.state = 'unknown';
        await changePasswordDialog.changePassword(originalPassword, temporaryPassword);
        passwordGuard.state = 'temporary';
        await dashboardPage.expectLoaded(dashboardUrl);
      });

      await test.step('Sign out', async () => {
        await dashboardPage.signOut();
        await expect(loginPage.signInHeading).toBeVisible();
      });

      await test.step('Sign in with the new password and see the dashboard', async () => {
        await loginPage.login(email, temporaryPassword, organization);
        await dashboardPage.expectLoaded(dashboardUrl);
      });
    },
  );
});
