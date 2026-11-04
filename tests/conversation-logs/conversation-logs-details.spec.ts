import { test, expect } from '../../fixtures/base.fixture';

/*
 * Opens a row of the list. The list is first filtered to "Resolved" so the opened row always has a
 * summary, whatever the live data looks like. The tab names after the first two are not checked: staging
 * has Insights / Rating, the PRD has Extraction (open question 3 in the workbook).
 */
test.describe('Conversation Logs - details panel', () => {
  test(
    'should open Call details with the Conversation ID and Summary selected first',
    { tag: ['@smoke', '@AT-CLOG-003'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      const { columns, details, filters, formats } = data;
      let row: string[] = [];

      await test.step('Open the Call list filtered to Resolved', async () => {
        await logs.goto();
        await logs.selectFilterValues('outcome', [filters.outcome]);
        await logs.expectEveryRowMatches('Agent outcome', [filters.outcome]);
      });

      await test.step('Click the first row', async () => {
        row = await logs.openFirstRow();
        await logs.callDetails.expectOpen();
      });

      await test.step('Header shows the Conversation ID and metadata matches the row', async () => {
        await expect(logs.callDetails.conversationId(formats.conversationIdPattern)).toBeVisible();
        await logs.callDetails.expectMetadata(
          'Disposition',
          row[columns.call.indexOf('Call disposition')],
        );
        await logs.callDetails.expectMetadata(
          'Agent outcome',
          row[columns.call.indexOf('Agent outcome')],
        );
        await logs.callDetails.expectMetadata('Journey', row[columns.call.indexOf('Journey name')]);
        await logs.callDetails.expectMetadata(
          'Date & Time',
          row[columns.call.indexOf('Date & time')],
        );
      });

      await test.step('Summary is the first tab, selected, with content; Transcript is second', async () => {
        await logs.callDetails.expectFirstTabs(details.call.tabs);
        await expect(logs.callDetails.selectedTab).toHaveText(details.call.tabs[0]);
        await expect(logs.callDetails.summaryExplanation).toBeVisible();
      });

      await test.step('Close the panel', async () => {
        await logs.callDetails.close();
        await logs.callDetails.expectClosed();
      });
    },
  );

  test(
    'should open Chat details with the Conversation ID and Summary selected first',
    { tag: ['@regression', '@AT-CLOG-004'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      const { columns, details, filters, formats } = data;
      let row: string[] = [];

      await test.step('Open the Chat list filtered to Resolved', async () => {
        await logs.goto();
        await logs.selectTab('chat');
        await logs.selectFilterValues('outcome', [filters.outcome]);
        await logs.expectEveryRowMatches('Agent outcome', [filters.outcome]);
      });

      await test.step('Click the first row', async () => {
        row = await logs.openFirstRow();
        await logs.chatDetails.expectOpen();
      });

      await test.step('Header shows the Conversation ID and metadata matches the row', async () => {
        await expect(logs.chatDetails.conversationId(formats.conversationIdPattern)).toBeVisible();
        await logs.chatDetails.expectMetadata(
          'Agent outcome',
          row[columns.chat.indexOf('Agent outcome')],
        );
        await logs.chatDetails.expectMetadata('Journey', row[columns.chat.indexOf('Journey name')]);
        await logs.chatDetails.expectMetadata('Messages', row[columns.chat.indexOf('Messages')]);
        await logs.chatDetails.expectMetadata(
          'Date & Time',
          row[columns.chat.indexOf('Date & time')],
        );
      });

      await test.step('Summary is the first tab, selected, with content', async () => {
        await logs.chatDetails.expectFirstTabs(details.chat.tabs);
        await expect(logs.chatDetails.selectedTab).toHaveText(details.chat.tabs[0]);
        await expect(logs.chatDetails.summaryExplanation).toBeVisible();
      });

      await test.step('Close the panel', async () => {
        await logs.chatDetails.close();
        await logs.chatDetails.expectClosed();
      });
    },
  );
});
