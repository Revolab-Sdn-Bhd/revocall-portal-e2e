import { test, expect, requireCredentials } from '../../fixtures/login.fixture';
import { isDiscoverCall } from '../../utils/api';

/*
 * Starts logged out (login.fixture.ts) so the sign-in under test is a fresh one made by this test.
 * The Audit Log is shared by the whole organization and other tests sign in too, so the list is
 * filtered to this user and to the sign-in action before checking.
 */
test.describe('Audit Log - sign-in events', { tag: '@regression' }, () => {
  test('should record a sign-in in the Audit Log', { tag: '@AT-LOGIN-006' }, async ({
    loginPage, loginData, dashboardPage, auditLogPage, auditLogData, page,
  }) => {
    const { email, password, organization, displayName } = loginData.validUser;
    requireCredentials(loginData.validUser);
    // The Audit Log shows the user's display name, so it is needed to filter by actor.
    expect(displayName, 'Set LOGIN_DISPLAY_NAME in .env').toBeTruthy();

    // Reference time comes from the server clock (Date header of the email check, just before sign-in),
    // so a skewed clock on this machine cannot cause a false pass or fail. It is rounded down to the
    // second, so it is never later than the real sign-in time.
    let signInStartedAt = 0;

    await test.step('Sign in', async () => {
      const emailCheck = page.waitForResponse(isDiscoverCall);
      await loginPage.enterEmail(email);
      signInStartedAt = Date.parse((await emailCheck).headers()['date']);
      expect(signInStartedAt).toBeGreaterThan(0);

      await loginPage.submitPassword(password);
      await loginPage.finishSignIn(organization);
      await dashboardPage.expectLoaded(new RegExp(loginData.successUrlPattern));
    });

    await test.step('Open the Audit Log and filter to this user\'s sign-ins', async () => {
      await dashboardPage.openFromSidebar(auditLogData.page);
      await dashboardPage.expectPageLoaded(auditLogData.page);
      await auditLogPage.expectLoaded();

      await auditLogPage.filterByActor(displayName!);
      await auditLogPage.filterByAction(auditLogData.signIn.filterLabel);
    });

    await test.step('Verify a new sign-in entry exists', async () => {
      // Polls the API (same filtered request the UI made) because the entry is written by the server
      // shortly after the sign-in. No page reload, so no response can belong to a replaced page.
      await expect
        .poll(() => auditLogPage.getLatestEventTime(auditLogData.signIn.verb), {
          message: 'a sign-in event for this user newer than the sign-in start time',
          timeout: auditLogData.pollTimeoutMs,
          intervals: [500, 1_000, 2_000, 3_000],
        })
        .toBeGreaterThanOrEqual(signInStartedAt);

      // One reload to see the entry in the UI; the rows are web-first assertions, no response is read.
      await auditLogPage.reload();
      await auditLogPage.expectLatestRow({
        actor: displayName!,
        event: auditLogData.signIn.eventLabel,
        result: auditLogData.signIn.resultLabel,
      });
    });
  });
});
