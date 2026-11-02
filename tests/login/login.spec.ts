import {
  test,
  expect,
  requireCredentials,
  requireFailedLoginEmail,
} from '../../fixtures/login.fixture';
import { isDiscoverCall } from '../../utils/api';

/*
 * Every test here starts logged out on the sign-in page (see login.fixture.ts),
 * so each one can run on its own and in any order.
 */

test.describe('Login - happy flow', { tag: '@smoke' }, () => {
  test.beforeEach(async ({ loginData }) => {
    requireCredentials(loginData.validUser);
  });

  test(
    'should log in and show the dashboard',
    { tag: '@AT-LOGIN-001' },
    async ({ loginPage, loginData, dashboardPage, sidebar }) => {
      const { email, password, organization, displayName } = loginData.validUser;

      await test.step('Enter email and continue', async () => {
        await loginPage.enterEmail(email);
        await loginPage.expectOnPasswordStep(email);
      });

      await test.step('Enter password and sign in', async () => {
        await loginPage.submitPassword(password);
        await loginPage.finishSignIn(organization);
      });

      await test.step('Verify dashboard is shown', async () => {
        await dashboardPage.expectLoaded(new RegExp(loginData.successUrlPattern));

        // Sign-in form is gone.
        await expect(loginPage.signInHeading).toBeHidden();
        await expect(loginPage.passwordInput).toBeHidden();

        // Signed-in user's name is shown (only checked when displayName is set).
        await sidebar.expectUserName(displayName);
      });
    },
  );

  test(
    'should stay logged in after page reload',
    { tag: '@AT-LOGIN-003' },
    async ({ loginPage, loginData, dashboardPage, page }) => {
      const { email, password, organization } = loginData.validUser;

      await test.step('Log in', async () => {
        await loginPage.login(email, password, organization);
        await dashboardPage.expectLoaded(new RegExp(loginData.successUrlPattern));
      });

      await test.step('Reload and verify still logged in', async () => {
        await page.reload();
        await dashboardPage.expectLoaded(new RegExp(loginData.successUrlPattern));
        await expect(loginPage.signInHeading).toBeHidden();
      });
    },
  );
});

test.describe('Login - errors and validation', { tag: '@regression' }, () => {
  test('should block an empty email', { tag: '@AT-LOGIN-007' }, async ({ loginPage, page }) => {
    const discoverCalls: string[] = [];
    page.on('request', (request) => {
      if (isDiscoverCall(request)) discoverCalls.push(request.url());
    });

    await loginPage.continueButton.click();

    // The browser blocks the submit and moves focus to the invalid field.
    await expect(loginPage.emailInput).toBeFocused();
    await loginPage.expectEmailInvalid('valueMissing');
    await loginPage.expectOnEmailStep();
    // The form was not submitted: no email check was sent to the server.
    expect(discoverCalls).toHaveLength(0);
  });

  test(
    'should block an invalid email format',
    { tag: '@AT-LOGIN-008' },
    async ({ loginPage, loginData, page }) => {
      const discoverCalls: string[] = [];
      page.on('request', (request) => {
        if (isDiscoverCall(request)) discoverCalls.push(request.url());
      });

      await loginPage.submitEmail(loginData.invalidEmailFormat);

      await expect(loginPage.emailInput).toBeFocused();
      await loginPage.expectEmailInvalid('typeMismatch');
      await loginPage.expectOnEmailStep();
      expect(discoverCalls).toHaveLength(0);
    },
  );

  test(
    'should show an error for an unknown email',
    { tag: '@AT-LOGIN-009' },
    async ({ loginPage, loginData, sidebar, page }) => {
      await loginPage.enterEmail(loginData.unknownUser.email);
      await loginPage.submitPassword(loginData.unknownUser.password);

      await loginPage.expectErrorMessage(loginData.messages.invalidCredentials);
      // Still on the password step, not signed in.
      await expect(loginPage.passwordInput).toBeVisible();
      await expect(page).toHaveURL(new RegExp(loginData.signInUrlPattern));
      await expect(sidebar.signOutButton).toBeHidden();
    },
  );

  // DATA-03: uses the dedicated failed-login account (FAILED_LOGIN_EMAIL), never the main account,
  // because staging may lock an account after repeated failures. Only the email is needed.
  test(
    'should show an error for a wrong password',
    { tag: '@AT-LOGIN-010' },
    async ({ loginPage, loginData, sidebar, page }) => {
      requireFailedLoginEmail(loginData.failedLoginEmail);

      await loginPage.enterEmail(loginData.failedLoginEmail);
      await loginPage.submitPassword(loginData.wrongPassword);

      await loginPage.expectErrorMessage(loginData.messages.invalidCredentials);
      await expect(loginPage.passwordInput).toBeVisible();
      await expect(page).toHaveURL(new RegExp(loginData.signInUrlPattern));
      await expect(sidebar.signOutButton).toBeHidden();
    },
  );
});
