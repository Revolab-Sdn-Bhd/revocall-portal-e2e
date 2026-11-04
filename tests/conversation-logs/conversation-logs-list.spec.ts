import { test, expect } from '../../fixtures/base.fixture';

/*
 * Starts already logged in (session from auth.setup.ts). The data on staging is live, so these tests
 * check the shape of the list (columns, formats, allowed values), never exact rows or counts.
 * Column labels are the ones staging shows today ("#", "Agent outcome"); the PRD says "No." and "Outcome"
 * (see the Open Questions sheet of the automation workbook).
 */
test.describe('Conversation Logs - list', () => {
  test(
    'should show the Call tab list with all columns and rows',
    { tag: ['@smoke', '@AT-CLOG-001'] },
    async ({
      page,
      dashboardPage,
      sidebar,
      conversationLogsPage: logs,
      conversationLogsData: data,
    }) => {
      await test.step('Open Conversation Logs from the sidebar', async () => {
        await dashboardPage.goto();
        await dashboardPage.expectLoaded();
        await sidebar.openFromSidebar(data.page);
        await sidebar.expectPageLoaded(data.page);
      });

      await test.step('Call tab is selected by default', async () => {
        await expect(logs.callTab).toHaveAttribute('aria-selected', 'true');
        await expect(page).toHaveURL(/tab=call/);
        await logs.expectListLoaded();
      });

      await test.step('Columns are in order', async () => {
        await logs.expectColumns(data.columns.call);
      });

      await test.step('Rows have the expected formats', async () => {
        await expect(logs.dataRows.first().getByRole('cell').first()).toHaveText('1');
        await logs.expectEveryRowMatches('Date & time', new RegExp(data.formats.dateTimePattern));
        await logs.expectEveryRowMatches('Duration', new RegExp(data.formats.durationPattern));
        await logs.expectEveryRowMatches('Call disposition', /\S/);
        await logs.expectEveryRowMatches('Agent outcome', data.outcomeValues.call);
      });

      await test.step('Footer and pager are shown', async () => {
        await expect(logs.footerText).toBeVisible();
        await expect(logs.pageIndicator).toBeVisible();
        await expect(logs.nextPageButton).toBeVisible();
      });
    },
  );

  test(
    'should show the Chat tab list with all columns and rows',
    { tag: ['@smoke', '@AT-CLOG-002'] },
    async ({ page, conversationLogsPage: logs, conversationLogsData: data }) => {
      await test.step('Open the Chat tab', async () => {
        await logs.goto();
        await logs.selectTab('chat');
        await expect(page).toHaveURL(/tab=chat/);
      });

      await test.step('Columns are in order', async () => {
        await logs.expectColumns(data.columns.chat);
      });

      await test.step('Rows have the expected formats', async () => {
        await expect(logs.dataRows.first().getByRole('cell').first()).toHaveText('1');
        await logs.expectEveryRowMatches('Messages', new RegExp(data.formats.numberPattern));
        await logs.expectEveryRowMatches('Date & time', new RegExp(data.formats.dateTimePattern));
        await logs.expectEveryRowMatches('Agent outcome', data.outcomeValues.chat);
      });

      await test.step('Footer is shown', async () => {
        await expect(logs.footerText).toBeVisible();
      });
    },
  );
});
