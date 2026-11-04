import type { Page } from '@playwright/test';
import { test, expect, AUTH_FILE } from '../../fixtures/base.fixture';
import { isoDate } from '../../utils/dates';

/*
 * Who can reach Conversation Logs and its data. 104 needs no account. 106 and 107 need accounts
 * that do not exist yet (see the Not automatable / Open Questions sheets): they are written
 * against environment variables and skipped, with the reason, until those are set (names in .env.example).
 */
const NO_STORAGE = { cookies: [], origins: [] };

test.describe('Conversation Logs - access without a session', () => {
  test.use({ storageState: NO_STORAGE });

  test(
    'should send a visitor without a session to sign-in and answer the APIs with 401',
    { tag: ['@regression', '@security', '@AT-CLOG-104'] },
    async ({
      page,
      request,
      conversationLogsPage: logs,
      conversationLogsData: data,
      loginData,
    }) => {
      const { access, page: item } = data;
      const start = isoDate(access.exportRangeDaysAgo);
      const end = isoDate();
      const listUrl = `${access.callListPath}?connect=v1&encoding=json&message=${encodeURIComponent(
        JSON.stringify(access.callListMessage),
      )}`;
      const range = `start_date=${start}&end_date=${end}&tz=${encodeURIComponent(access.exportTimezone)}`;

      await test.step('The page redirects to sign-in and never shows the table', async () => {
        await page.goto(item.path);
        await expect(page).toHaveURL(new RegExp(loginData.signInUrlPattern));
        // Not logs.table: the Overview has a table of its own, so that locator would match it.
        await expect(logs.pageHeading).toBeHidden();
      });

      await test.step('The Call list API answers 401 unauthenticated', async () => {
        const response = await request.get(listUrl);
        expect(response.status()).toBe(401);
        expect(((await response.json()) as { code: string }).code).toBe(access.unauthenticatedCode);
      });

      await test.step('The Call export count answers 401', async () => {
        const response = await request.get(`${access.callExportCountPath}?${range}`);
        expect(response.status()).toBe(401);
      });

      await test.step('The Chat CSV export answers 401', async () => {
        const response = await request.get(`${access.chatExportPath}?${range}`);
        expect(response.status()).toBe(401);
      });
    },
  );
});

test.describe('Conversation Logs - access by role and organisation', () => {
  test.use({ storageState: NO_STORAGE });

  test(
    'should keep a role without Conversation Logs permission out of the page and its APIs',
    {
      tag: ['@regression', '@security', '@AT-CLOG-106'],
      annotation: {
        type: 'pending-po',
        description:
          'OQ21: which roles may view and export Conversation Logs is not defined; the expectation below is the plain "no access" one',
      },
    },
    async ({ page, loginPage, conversationLogsPage: logs, conversationLogsData: data }) => {
      const email = process.env.NO_ACCESS_EMAIL;
      const password = process.env.NO_ACCESS_PASSWORD;
      test.skip(
        !email || !password,
        'Blocked: needs an account whose role has no Conversation Logs access (NO_ACCESS_EMAIL, NO_ACCESS_PASSWORD)',
      );

      await loginPage.goto();
      await loginPage.login(email!, password!, process.env.NO_ACCESS_ORGANIZATION || undefined);

      await test.step('The page sends the user back to the overview and the menu has no Conversation Logs', async () => {
        await page.goto(data.page.path);
        // Positive signals first: a signed-in overview proves the page finished loading and this is a block, not a bounce to sign-in.
        await loginPage.sidebar.expectLoaded(new RegExp(data.access.noAccessHomePattern));
        await expect(loginPage.sidebar.link(data.access.homeSidebarLabel)).toBeVisible();
        await expect(loginPage.sidebar.link(data.page.label)).toHaveCount(0);
        // Not logs.table: the Overview has a table of its own, so that locator would match it.
        await expect(logs.pageHeading).toBeHidden();
      });

      await test.step('The Call list API answers 403 permission denied for this signed-in user', async () => {
        // The app authenticates with its session cookie, which page.request shares. The list call
        // also carries the active organisation, so replay it with the real one; without it every
        // account gets 403 and the check proves nothing.
        const profile = await page.request.get(
          `${data.access.profilePath}?connect=v1&encoding=json&message=%7B%7D`,
        );
        expect(profile.status(), 'the session is accepted by the API').toBe(200);
        const { activeOrganizationId } = (await profile.json()) as { activeOrganizationId: string };
        const message = { organizationId: activeOrganizationId, ...data.access.callListMessage };
        const response = await page.request.get(
          `${data.access.callListPath}?connect=v1&encoding=json&message=${encodeURIComponent(JSON.stringify(message))}`,
        );
        expect(response.status()).toBe(403);
        expect(((await response.json()) as { code: string }).code).toBe(
          data.access.permissionDeniedCode,
        );
      });
    },
  );

  test(
    'should show an admin of another organisation none of this organisation conversations',
    { tag: ['@regression', '@security', '@AT-CLOG-107'] },
    async ({
      page,
      browser,
      loginPage,
      conversationLogsPage: logs,
      conversationLogsData: data,
    }) => {
      const email = process.env.OTHER_ORG_EMAIL;
      const password = process.env.OTHER_ORG_PASSWORD;
      test.skip(
        !email || !password,
        'Blocked: needs an Org Admin account of another organisation (OTHER_ORG_EMAIL, OTHER_ORG_PASSWORD)',
      );

      const { access } = data;
      const rpc = (path: string, message: Record<string, unknown>) =>
        `${path}?connect=v1&encoding=json&message=${encodeURIComponent(JSON.stringify(message))}`;
      const listMessage = (organizationId: string, extra: Record<string, unknown> = {}) => ({
        organizationId,
        ...access.callListMessage,
        ...extra,
      });
      const readProfile = async (source: Page) => {
        const profile = await source.request.get(rpc(access.profilePath, {}));
        expect(profile.status(), 'the session is accepted by the API').toBe(200);
        return ((await profile.json()) as { activeOrganizationId: string }).activeOrganizationId;
      };

      // Conversations of the main organisation, read with the main account's saved session.
      const mainContext = await browser.newContext({ storageState: AUTH_FILE });
      const mainPage = await mainContext.newPage();
      await mainPage.goto(data.page.path);
      const mainOrgId = await readProfile(mainPage);
      const mainList = await mainPage.request.get(rpc(access.callListPath, listMessage(mainOrgId)));
      expect(mainList.status(), 'the main organisation list is readable').toBe(200);
      const mainIds = ((await mainList.json()) as { data: { id: string }[] }).data.map((row) =>
        String(row.id),
      );
      await mainContext.close();
      expect(mainIds.length, 'the main organisation has conversations to look for').toBeGreaterThan(
        0,
      );
      const foreignId = mainIds[0];

      await loginPage.goto();
      await loginPage.login(email!, password!, process.env.OTHER_ORG_ORGANIZATION || undefined);

      const otherOrgId =
        await test.step('The account is signed in to an organisation of its own and its page loads', async () => {
          const id = await readProfile(page);
          expect(id, 'the other account is not in the main organisation').not.toBe(mainOrgId);
          // Not goto(): that waits for a first row, and the other organisation may have none.
          // gotoWithQuery already requires the list call to succeed, so an empty result below is
          // not a broken page.
          await logs.gotoWithQuery('', 'call');
          await expect(logs.pageHeading).toBeVisible();
          await expect(logs.callTab).toHaveAttribute('aria-selected', 'true');
          return id;
        });

      await test.step('None of the main organisation conversations is in its own list', async () => {
        const response = await page.request.get(rpc(access.callListPath, listMessage(otherOrgId)));
        expect(response.status()).toBe(200);
        const own = ((await response.json()) as { data?: { id: string }[] }).data ?? [];
        const ownIds = own.map((row) => String(row.id));
        for (const id of mainIds) expect(ownIds).not.toContain(id);
        expect(logs.latestList.data.map((row) => String(row.id))).not.toContain(foreignId);
      });

      await test.step('Searching the foreign ID finds nothing', async () => {
        const result = await logs.search(foreignId);
        expect(result.total).toBe(0);
        await logs.expectEmptyState();
      });

      await test.step('Opening the foreign ID shows no details', async () => {
        await logs.gotoWithQuery(`?tab=call&id=${foreignId}`, 'call');
        // The deep link asks the list for exactly that ID; the answer must be empty.
        expect(logs.latestList.request.callId).toBe(foreignId);
        expect(logs.latestList.total).toBe(0);
        await logs.expectEmptyState();
        await expect(logs.callDetails.dialog).toBeHidden();
      });

      await test.step('The list and details APIs refuse or return nothing for the foreign ID', async () => {
        const own = await page.request.get(
          rpc(access.callListPath, listMessage(otherOrgId, { callId: foreignId })),
        );
        expect(own.status()).toBe(200);
        expect(((await own.json()) as { data?: unknown[] }).data ?? []).toHaveLength(0);

        const claimed = await page.request.get(
          rpc(access.callListPath, listMessage(mainOrgId, { callId: foreignId })),
        );
        expect(claimed.status()).toBe(403);
        expect(((await claimed.json()) as { code: string }).code).toBe(access.permissionDeniedCode);

        for (const path of [access.callSummaryPath, access.callToolCallsPath]) {
          const details = await page.request.get(rpc(path, { callLogId: foreignId }));
          expect(details.status(), path).toBe(403);
          expect(((await details.json()) as { code: string }).code).toBe(
            access.permissionDeniedCode,
          );
        }
      });

      await test.step('The export count request is refused or counts nothing', async () => {
        const range = `start_date=${isoDate(data.access.exportRangeDaysAgo)}&end_date=${isoDate()}`;
        const response = await page.request.get(`${data.access.callExportCountPath}?${range}`);
        // The expected result accepts either answer (a refusal or a count of 0), hence the branch.
        /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect */
        if (response.ok()) {
          const body = (await response.json()) as { count?: number | string };
          expect(Number(body.count ?? 0)).toBe(0);
        } else {
          expect(response.status()).toBeGreaterThanOrEqual(400);
        }
        /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
      });
    },
  );
});
