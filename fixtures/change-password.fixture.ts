import { type Browser } from '@playwright/test';
import { test as loginTest, expect } from './login.fixture';
import { readTestData } from './base.fixture';
import { LoginPage } from '../pages/login/LoginPage';
import { SidebarComponent } from '../pages/components/SidebarComponent';
import { ChangePasswordDialogComponent } from '../pages/components/ChangePasswordDialogComponent';

/*
 * Fixture for the change-password test (AT-LOGIN-004). Starts logged out (login.fixture).
 *
 * Password rule (so a crashed run can always be recovered, by the next run or by hand):
 *   ORIGINAL  = CHANGE_PWD_PASSWORD from .env (the account's real password)
 *   TEMPORARY = ORIGINAL + TEMP_SUFFIX
 * The suffix adds a special character, a letter and a number, so TEMPORARY meets the password policy
 * whenever ORIGINAL does, and it always differs from ORIGINAL.
 *
 * The account must never be left on TEMPORARY. An auto fixture restores ORIGINAL after every test,
 * pass or fail, and also before every test (in case a previous run crashed). It works out which
 * password is active: it tracks the state the test reports, and when the state is unknown it tries
 * ORIGINAL first, then TEMPORARY.
 */
const TEMP_SUFFIX = '#Tmp1';

type ChangePasswordData = { organization: string };

export type ChangePwdUser = {
  email: string;
  originalPassword: string;
  temporaryPassword: string;
  organization?: string;
};

/** Which password the account is on. The test updates it around the change, the fixture reads it. */
export type PasswordGuard = { state: 'original' | 'temporary' | 'unknown' };

function loadChangePwdUser(): ChangePwdUser {
  const data = readTestData<ChangePasswordData>('login/change-password.json');
  const email = process.env.CHANGE_PWD_EMAIL;
  const originalPassword = process.env.CHANGE_PWD_PASSWORD;
  if (!email || !originalPassword) {
    throw new Error(
      'Missing credentials: set CHANGE_PWD_EMAIL and CHANGE_PWD_PASSWORD in .env (see .env.example).',
    );
  }
  return {
    email,
    originalPassword,
    temporaryPassword: originalPassword + TEMP_SUFFIX,
    organization: process.env.CHANGE_PWD_ORGANIZATION || data.organization,
  };
}

/**
 * Makes sure the account is on its ORIGINAL password, in a separate browser context so it does not
 * depend on the state of the test's own page. Never logs or prints passwords.
 */
async function ensureOriginalPassword(
  browser: Browser,
  baseURL: string | undefined,
  loginUrl: string,
  user: ChangePwdUser,
  state: PasswordGuard['state'],
) {
  if (state === 'original') return;

  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    const loginPage = new LoginPage(page, loginUrl);
    const sidebar = new SidebarComponent(page);
    const dialog = new ChangePasswordDialogComponent(page);

    await loginPage.goto();
    await loginPage.enterEmail(user.email);

    // state 'temporary' = known, go straight there. 'unknown' = try ORIGINAL first.
    let activePassword = user.originalPassword;
    if (state === 'temporary') {
      activePassword = user.temporaryPassword;
    }
    let response = await loginPage.submitPassword(activePassword);
    if (!response.ok() && state === 'unknown') {
      activePassword = user.temporaryPassword;
      response = await loginPage.submitPassword(activePassword);
    }
    if (!response.ok()) {
      throw new Error(
        'Cannot sign in with ORIGINAL (CHANGE_PWD_PASSWORD) or TEMPORARY (CHANGE_PWD_PASSWORD + suffix): ' +
          'recover the account by hand.',
      );
    }
    await loginPage.finishSignIn(user.organization);

    if (activePassword === user.temporaryPassword) {
      await sidebar.openChangePassword();
      await dialog.expectOpen();
      await dialog.changePassword(user.temporaryPassword, user.originalPassword);
    }
    await expect(sidebar.signOutButton).toBeVisible();
  } finally {
    await context.close();
  }
}

type ChangePasswordFixtures = {
  changePwdUser: ChangePwdUser;
  passwordGuard: PasswordGuard;
  changePasswordDialog: ChangePasswordDialogComponent;
  /* Auto fixture: recovers before the test and restores the original password after it. */
  restoreOriginalPassword: void;
};

export const test = loginTest.extend<ChangePasswordFixtures>({
  changePwdUser: async ({}, use) => {
    await use(loadChangePwdUser());
  },

  passwordGuard: async ({}, use) => {
    await use({ state: 'original' });
  },

  changePasswordDialog: async ({ page }, use) => {
    await use(new ChangePasswordDialogComponent(page));
  },

  restoreOriginalPassword: [
    async ({ browser, baseURL, loginData, changePwdUser, passwordGuard }, use) => {
      // Before: a crashed earlier run may have left the account on TEMPORARY.
      await ensureOriginalPassword(browser, baseURL, loginData.url, changePwdUser, 'unknown');
      await use();
      // After: always, even when the test failed half way.
      await ensureOriginalPassword(
        browser,
        baseURL,
        loginData.url,
        changePwdUser,
        passwordGuard.state,
      );
    },
    { auto: true, timeout: 90_000 },
  ],
});

export { expect };
