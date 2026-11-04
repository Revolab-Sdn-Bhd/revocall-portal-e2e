import { test, expect } from '../../fixtures/base.fixture';
import type { Locator } from '@playwright/test';
import { isCallLogRpc, isRecordingAudioCall } from '../../utils/api';

/*
 * The Call details and Chat details side panels in depth: every tab, the recording, closing, and
 * that the panel always belongs to the row that was clicked. The panel tabs have no tabpanel role,
 * so tab content is read from the dialog text once the tab's request has returned. Summary and
 * transcript text is live data: only its presence is checked, never its wording.
 */

const ERROR_TEXT = /something went wrong|failed to load|error loading|unable to load/i;

test.describe('Conversation Logs - details panel tabs', () => {
  test(
    'should open every Call details tab and show its content',
    { tag: ['@regression', '@AT-CLOG-070'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      const { callDetails: panel } = logs;
      const { detailsTabs, filters, outcomeValues } = data;

      await logs.goto();
      await logs.selectFilterValues('outcome', [filters.outcome]);
      await logs.expectEveryRowMatches('Agent outcome', [filters.outcome]);
      await logs.openFirstRow();
      await panel.expectOpen();

      await test.step('The tabs are in order and Summary is selected', async () => {
        await expect(panel.tabs).toHaveText(detailsTabs.call);
        await expect(panel.selectedTab).toHaveText(detailsTabs.call[0]);
      });

      await test.step('Summary: outcome chip, summary text and an explanation', async () => {
        await expect(panel.outcomeChips(outcomeValues.call).first()).toBeVisible();
        await expect(panel.summaryExplanation).toBeVisible();
      });

      await test.step('Transcript: at least one turn with text', async () => {
        await panel.openTab('Transcript', isCallLogRpc('GetTranscription'));
        await expect(panel.summaryExplanation).toBeHidden();
        // Emotion labels are not asserted: whether a turn has one depends on the call.
        await expectContent(panel, detailsTabs.call, /\S{2,}\s+\S{2,}/);
      });

      await test.step('Insights: extracted fields or the "no extraction" text', async () => {
        await panel.openTab('Insights', isCallLogRpc('GetCallOutputExtraction'));
        await expectContent(panel, detailsTabs.call);
      });

      await test.step('Sentiment: a label and its reason', async () => {
        await panel.openTab('Sentiment', isCallLogRpc('GetCallSentiment'));
        await expect(panel.dialog).toContainText(sentimentWithReason(detailsTabs.sentimentLabels));
      });

      await test.step('Rating: a rating or the "not collected" text', async () => {
        await panel.openTab('Rating', isCallLogRpc('GetCallRating'));
        await expectContent(panel, detailsTabs.call);
      });

      await expect(panel.dialog).not.toContainText(ERROR_TEXT);
    },
  );

  test(
    'should open every Chat details tab and show its content',
    { tag: ['@regression', '@AT-CLOG-071'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      const { chatDetails: panel } = logs;
      const { detailsTabs, filters, outcomeValues } = data;

      await logs.goto();
      await logs.selectTab('chat');
      await logs.selectFilterValues('journey', [filters.chatJourney]);
      await logs.selectFilterValues('outcome', [filters.outcome]);
      await logs.expectEveryRowMatches('Agent outcome', [filters.outcome]);
      await logs.openFirstRow();
      await panel.expectOpen();

      await test.step('The tabs are in order and Summary is selected', async () => {
        await expect(panel.tabs).toHaveText(detailsTabs.chat);
        await expect(panel.selectedTab).toHaveText(detailsTabs.chat[0]);
      });

      await test.step('Summary: outcome chip, summary text and an explanation', async () => {
        await expect(panel.outcomeChips(outcomeValues.chat).first()).toBeVisible();
        await expect(panel.summaryExplanation).toBeVisible();
      });

      await test.step('Transcription: message turns with text', async () => {
        await panel.openTab('Transcription');
        await expect(panel.summaryExplanation).toBeHidden();
        await expect(panel.dialog.getByText(/\S{2,}\s+\S{2,}/).last()).toBeVisible();
      });

      await test.step('Tools: tool names, each with a duration in ms', async () => {
        await panel.openTab('Tools');
        await expect(panel.dialog.getByText(/^\d+ ms$/).first()).toBeVisible();
      });

      await test.step('Insights: extracted fields or one of the two status texts', async () => {
        await panel.openTab('Insights');
        await expectContent(panel, detailsTabs.chat);
      });

      await test.step('Sentiment: a label and its reason', async () => {
        await panel.openTab('Sentiment');
        await expect(panel.dialog).toContainText(sentimentWithReason(detailsTabs.sentimentLabels));
      });

      await test.step('Rating: a rating or the "not collected" text', async () => {
        await panel.openTab('Rating');
        await expectContent(panel, detailsTabs.chat);
      });

      await expect(panel.dialog).not.toContainText(ERROR_TEXT);
    },
  );

  test(
    'should show the audio player and a downloadable recording in Call details',
    { tag: ['@regression', '@AT-CLOG-072'] },
    async ({ page, conversationLogsPage: logs, conversationLogsData: data }) => {
      const { callDetails: panel } = logs;
      const { filters, formats, detailsTabs } = data;

      await logs.goto();
      await logs.selectFilterValues('outcome', [filters.outcome]);
      await logs.expectEveryRowMatches('Agent outcome', [filters.outcome]);

      const audioRequested = page.waitForResponse(isRecordingAudioCall);
      await logs.openFirstRow();
      await panel.expectOpen();
      await audioRequested;

      await test.step('The Audio section has a seek slider and a time label', async () => {
        await expect(panel.dialog.getByText(detailsTabs.audioLabel, { exact: true })).toBeVisible();
        await expect(panel.seekSlider).toBeVisible();
        await expect(panel.dialog.getByText(/^\d+:\d{2}$/).first()).toBeVisible();
      });

      await test.step('The download link points at this call and starts a download', async () => {
        const id = await panel.readConversationId(formats.conversationIdPattern);
        await expect(panel.downloadRecordingLink).toHaveAttribute(
          'href',
          new RegExp(`^/api/calllog/v2/recordings/${id}/download\\?organization_id=`),
        );
        // The server only answers a real download (a plain request gets 403), so the link is clicked.
        // The download is cancelled at once: nothing is saved and the recording is not played.
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          panel.downloadRecordingLink.click(),
        ]);
        expect(new URL(download.url()).pathname).toBe(`/api/calllog/v2/recordings/${id}/download`);
        expect(download.suggestedFilename()).toContain(id);
        await download.cancel();
      });
    },
  );

  test(
    'should close the Call and Chat details with Close, Escape and a click outside',
    { tag: ['@regression', '@AT-CLOG-073'] },
    async ({ conversationLogsPage: logs }) => {
      for (const tab of ['call', 'chat'] as const) {
        await test.step(`${tab} tab`, async () => {
          await logs.goto();
          await logs.selectTab(tab);
          const panel = { call: logs.callDetails, chat: logs.chatDetails }[tab];
          const footerBefore = await logs.footerText.textContent();
          const rowBefore = await logs.rowValues(0);

          const ways: Array<[string, () => Promise<void>]> = [
            ['Close button', () => panel.close()],
            ['Escape', () => logs.page.keyboard.press('Escape')],
            ['click outside', () => panel.closeByOutsideClick()],
          ];
          for (const [name, close] of ways) {
            await logs.openRow(0, panel);
            await panel.expectOpen();
            await close();
            await panel.expectClosed();
            // The list behind the panel is untouched.
            await expect(logs.footerText, `footer after ${name}`).toHaveText(footerBefore ?? '');
            expect(await logs.rowValues(0), `first row after ${name}`).toEqual(rowBefore);
          }
        });
      }
    },
  );

  test(
    'should open the panel of the clicked row on page 2 and in a filtered list',
    { tag: ['@regression', '@AT-CLOG-074'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      const { columns, filters, formats, pageSize } = data;
      const { callDetails: panel } = logs;

      /** Compares the open panel with the cells of the clicked row and with the response row's ID. */
      const expectPanelIsRow = async (row: string[], id: string) => {
        await panel.expectOpen();
        expect(await panel.readConversationId(formats.conversationIdPattern)).toBe(id);
        await panel.expectMetadata('Journey', row[columns.call.indexOf('Journey name')]);
        await panel.expectMetadata('Disposition', row[columns.call.indexOf('Call disposition')]);
        await panel.expectMetadata('Agent outcome', row[columns.call.indexOf('Agent outcome')]);
        await panel.expectMetadata('Date & Time', row[columns.call.indexOf('Date & time')]);
      };

      await test.step('Third row of page 2', async () => {
        await logs.goto();
        expect(await logs.getTotal()).toBeGreaterThan(pageSize.call);
        await logs.nextPage();
        const ids = logs.latestList.data.map((row) => String(row.id));
        const row = await logs.openRow(2, panel);
        await expectPanelIsRow(row, ids[2]);
        await panel.close();
        await panel.expectClosed();
      });

      await test.step('First row of the Escalated list', async () => {
        await logs.goto();
        await logs.selectFilterValues('outcome', [filters.escalatedOutcome]);
        await logs.expectEveryRowMatches('Agent outcome', [filters.escalatedOutcome]);
        const id = String(logs.latestList.data[0].id);
        const row = await logs.openFirstRow();
        await expectPanelIsRow(row, id);
      });
    },
  );

  test(
    'should show the placeholder and no outcome chip in Call details for a call without an outcome',
    { tag: ['@regression', '@AT-CLOG-075'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      const { filters, messages, detailsTabs, outcomeValues } = data;
      const { callDetails: panel } = logs;

      await logs.goto();
      const [result] = await logs.selectFilterValues('disposition', [
        filters.noResponseDisposition,
      ]);
      test.skip(result.total === 0, `No "${filters.noResponseDisposition}" calls on staging`);
      await logs.expectEveryRowMatches('Call disposition', [filters.noResponseDisposition]);

      await logs.openFirstRow();
      await panel.expectOpen();

      await panel.expectMetadata('Disposition', filters.noResponseDisposition);
      await panel.expectMetadata('Agent outcome', messages.placeholder);
      await panel.expectMetadata('Credits used', detailsTabs.noCredits);
      await expect(panel.selectedTab).toHaveText(detailsTabs.call[0]);
      await expect(panel.outcomeChips(outcomeValues.call)).toHaveCount(0);
      await expect(panel.dialog.getByText(detailsTabs.audioLabel, { exact: true })).toBeVisible();
      await expect(panel.dialog).not.toContainText(ERROR_TEXT);
    },
  );

  test(
    'should open Call details straight from a link with the call ID',
    {
      tag: ['@regression', '@AT-CLOG-076'],
      annotation: {
        type: 'pending-po',
        description:
          'OQ17: should ?tab=chat&id=<id> open Chat details too? Staging does not; only the Call link is checked',
      },
    },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      const { callDetails: panel } = logs;
      await logs.goto();
      const id = String(logs.latestList.data[0].id);

      await logs.gotoWithQuery(`?tab=call&id=${id}`, 'call');

      await panel.expectOpen();
      expect(await panel.readConversationId(data.formats.conversationIdPattern)).toBe(id);
      await expect(panel.selectedTab).toHaveText(data.detailsTabs.call[0]);
      expect(logs.latestList.request.callId).toBe(id);

      await panel.close();
      await panel.expectClosed();
      await expect(logs.dataRows.first()).toBeVisible();
      await expect(logs.pageHeading).toBeVisible();
    },
  );

  test(
    'should show the data of the second row when another row is opened after closing the first',
    { tag: ['@regression', '@AT-CLOG-077'] },
    async ({ page, conversationLogsPage: logs, conversationLogsData: data }) => {
      const { columns, filters, formats } = data;
      const { callDetails: panel } = logs;

      await logs.goto();
      await logs.selectFilterValues('outcome', [filters.outcome]);
      await logs.expectEveryRowMatches('Agent outcome', [filters.outcome]);
      const ids = logs.latestList.data.map((row) => String(row.id));
      const dates = await logs.columnValues('Date & time');
      // Two rows with different dates, so the "Date & Time" line tells them apart.
      const first = 1;
      const second = dates.findIndex((date, index) => index > first && date !== dates[first]);
      expect(second, 'two rows with different Date & time').toBeGreaterThan(first);

      const summaryLoaded = page.waitForResponse(isCallLogRpc('GetCallSummary'));
      const firstRow = await logs.openRow(first, panel);
      await summaryLoaded;
      await panel.expectOpen();
      await expect(panel.summaryExplanation).toBeVisible();
      expect(await panel.readConversationId(formats.conversationIdPattern)).toBe(ids[first]);
      const firstText = (await panel.dialog.textContent()) ?? '';
      await panel.close();
      await panel.expectClosed();

      const secondSummaryLoaded = page.waitForResponse(isCallLogRpc('GetCallSummary'));
      const secondRow = await logs.openRow(second, panel);
      await secondSummaryLoaded;
      await panel.expectOpen();
      await expect(panel.summaryExplanation).toBeVisible();

      expect(await panel.readConversationId(formats.conversationIdPattern)).toBe(ids[second]);
      expect(ids[second]).not.toBe(ids[first]);
      await panel.expectMetadata('Date & Time', secondRow[columns.call.indexOf('Date & time')]);
      expect(firstRow[columns.call.indexOf('Date & time')]).not.toBe(
        secondRow[columns.call.indexOf('Date & time')],
      );
      // The whole panel text differs from the first row's: nothing is left over from it.
      await expect(panel.dialog).not.toHaveText(firstText);
    },
  );
});

/**
 * The text of the open tab: whatever follows the tab names in the dialog. Polled, because the content
 * arrives after the tab is selected. Insights and Rating may legitimately say "nothing extracted" or
 * "no rating", so any text counts there; an error text never does (checked at the end of each test).
 */
async function expectContent(panel: { dialog: Locator }, tabs: string[], pattern = /\S/) {
  await expect
    .poll(
      async () => {
        const text = await panel.dialog.innerText();
        const marker = tabs.join('\n');
        const at = text.indexOf(marker);
        return at < 0 ? '' : text.slice(at + marker.length).trim();
      },
      { message: 'the tab shows content' },
    )
    .toMatch(pattern);
}

/** A label (lower case in the page text, capitalised by CSS) followed by a reason of some length (live text: only its presence counts). */
function sentimentWithReason(labels: string[]) {
  return new RegExp(`(${labels.join('|')})\\s*\\S[^\\n]{20,}`, 'i');
}
