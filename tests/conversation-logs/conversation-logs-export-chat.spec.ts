import { test, expect } from '../../fixtures/export.fixture';
import type { ConversationLogsPage } from '../../pages/conversation-logs/ConversationLogsPage';
import { isChatLogExportCall, isChatLogListCall } from '../../utils/api';
import { isoDate } from '../../utils/dates';
import { shiftDate, todayIn } from '../../utils/export-dates';
import { inspectDownload } from '../../utils/download';
import { rangeEndingAtNewest } from '../../utils/export-flow';
import { UUID_PATTERN, readCsvFile } from '../../utils/export-files';
import { exportParams } from '../../utils/export-requests';
import type { ExportData } from '../../fixtures/export.fixture';

/*
 * Chat export (Conversation Logs, Chat tab). Exports only read data: files are saved to a temp folder,
 * parsed and deleted right away. Staging data is live, so checks are relations (rows vs range, journey
 * and the list total), never fixed counts.
 */

const LIST_DATE_COLUMN = 'Date & time';

/** Opens the Chat export dialog, fills it, exports, and returns the parsed file. */
async function exportChat(
  logs: ConversationLogsPage,
  data: ExportData,
  range: { from: string; to: string },
  journey?: string,
) {
  const dialog = logs.exportDialog;
  await logs.openExport();
  await dialog.expectOpen();
  await dialog.fillDates(range.from, range.to);
  if (journey) await dialog.chooseChatJourney(journey);
  const { response, download } = await dialog.submit(
    dialog.exportCsvButton,
    isChatLogExportCall,
    data.downloadTimeoutMs,
  );
  const table = await inspectDownload(download, (file) => readCsvFile(file.path));
  await dialog.expectClosed();
  return { response, filename: download.suggestedFilename(), table };
}

test.describe('Conversation Logs - Chat export', () => {
  test.beforeEach(async ({ conversationLogsPage: logs }) => {
    await logs.goto();
    await logs.selectTab('chat');
  });

  test(
    'should export chat logs as CSV for a date range',
    { tag: ['@smoke', '@AT-CLOG-011'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      const range = { from: isoDate(data.chat.fromDaysAgo), to: isoDate(0) };
      const dialog = logs.exportDialog;

      await test.step('Open the dialog and read the note', async () => {
        await logs.openExport();
        await dialog.expectOpen();
        await expect(dialog.dialog).toContainText(data.chat.note);
      });

      await dialog.fillDates(range.from, range.to);
      const { response, download } = await dialog.submit(
        dialog.exportCsvButton,
        isChatLogExportCall,
        data.downloadTimeoutMs,
      );

      await test.step('Response and file name', async () => {
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('text/csv');
        expect(download.suggestedFilename()).toBe(
          `${data.filenames.chatPrefix}${range.from}-to-${range.to}.csv`,
        );
      });

      await test.step('CSV header, numbering and dates', async () => {
        const { header, rows } = await inspectDownload(download, (file) => readCsvFile(file.path));
        expect(header).toEqual(data.chat.columns);
        expect(rows.length, 'at least one chat in the range').toBeGreaterThan(0);
        expect(
          rows.map((row) => Number(row['No.'])),
          'No. runs 1..n',
        ).toEqual(rows.map((_, index) => index + 1));
        const outside = rows.filter((row) => {
          const day = row['Date & Time'].slice(0, 10);
          return day < range.from || day > range.to;
        });
        expect(outside, 'rows outside the range').toEqual([]);
      });

      await dialog.expectClosed();
    },
  );

  test(
    'should show From, To, Journey, the filter note and Export CSV in the Chat export dialog',
    { tag: ['@regression', '@AT-CLOG-096'] },
    async ({ page, conversationLogsPage: logs, exportData: data }) => {
      const dialog = logs.exportDialog;
      let downloads = 0;
      page.on('download', () => downloads++);

      await logs.openExport();
      await dialog.expectOpen();

      await test.step('Fields, journey picker, note and buttons', async () => {
        await expect(dialog.fromLabel).toHaveText(data.chat.requiredFrom);
        await expect(dialog.toLabel).toHaveText(data.chat.requiredTo);
        await expect(dialog.fromInput).toBeVisible();
        await expect(dialog.toInput).toBeVisible();
        await expect(dialog.chatJourneyButton).toHaveAccessibleName(data.chat.journeyPickerName);
        await expect(dialog.dialog).toContainText(data.chat.note);
        await expect(dialog.cancelButton).toBeVisible();
        await expect(dialog.exportCsvButton).toBeVisible();
      });

      await test.step('Cancel and Close both close the dialog without a download', async () => {
        await dialog.cancelButton.click();
        await dialog.expectClosed();
        await logs.openExport();
        await dialog.expectOpen();
        await dialog.closeButton.click();
        await dialog.expectClosed();
        expect(downloads, 'no download started').toBe(0);
      });
    },
  );

  test(
    'should export a custom date range and one journey with the expected CSV content',
    { tag: ['@smoke', '@AT-CLOG-097'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      const journey = data.journeys.chat;

      // The range ends on the newest chat of this journey, so the check has rows near its edges.
      await logs.selectFilterValues('journey', [journey]);
      const range = await rangeEndingAtNewest(logs, LIST_DATE_COLUMN, data.chat.journeySpanDays);
      // A fresh page, so the journey is chosen in the dialog.
      await logs.goto();
      await logs.selectTab('chat');

      const { response, filename, table } = await exportChat(logs, data, range, journey);

      await test.step('Request, response and file name', async () => {
        const params = exportParams(response.request());
        expect(params.get('start_date')).toBe(range.from);
        expect(params.get('end_date')).toBe(range.to);
        expect(params.get('tz')).toBe(data.timeZone);
        expect(params.has('journey_id'), 'journey_id is sent').toBe(true);
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('text/csv');
        expect(filename).toBe(`${data.filenames.chatPrefix}${range.from}-to-${range.to}.csv`);
      });

      await test.step('Header, numbering, journey, ids, messages and dates', async () => {
        expect(table.header).toEqual(data.chat.columns);
        const { rows } = table;
        expect(rows.length, 'at least one chat').toBeGreaterThan(0);
        expect(rows.map((row) => Number(row['No.']))).toEqual(rows.map((_, index) => index + 1));
        expect(
          rows.filter((row) => row['Journey'] !== journey),
          'other journeys',
        ).toEqual([]);
        const ids = rows.map((row) => row['Conversation ID']);
        expect(new Set(ids).size, 'unique ids').toBe(rows.length);
        expect(
          ids.filter((id) => !UUID_PATTERN.test(id)),
          'ids that are not UUIDs',
        ).toEqual([]);
        expect(
          rows.filter((row) => !/^\d+$/.test(row['Messages'])),
          'non-integer Messages',
        ).toEqual([]);
        const outside = rows.filter((row) => {
          const day = row['Date & Time'].slice(0, 10);
          return day < range.from || day > range.to;
        });
        expect(outside, 'rows outside the range').toEqual([]);
      });
    },
  );

  test(
    'should export every chat in a wide date range (no truncation)',
    { tag: ['@smoke', '@AT-CLOG-098'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      const range = { from: data.wideFrom, to: todayIn(data.timeZone) };
      const allTotal = await logs.getTotal();
      const [journeyList] = await logs.selectFilterValues('journey', [data.journeys.chat]);

      await logs.goto();
      await logs.selectTab('chat');

      await test.step('All journeys: rows equal the unfiltered list total', async () => {
        const { table } = await exportChat(logs, data, range);
        expect(table.rows).toHaveLength(allTotal);
        expect(new Set(table.rows.map((row) => row['Conversation ID'])).size).toBe(allTotal);
      });

      await test.step('One journey: rows equal the journey-filtered list total', async () => {
        const { table } = await exportChat(logs, data, range, data.journeys.chat);
        expect(table.rows).toHaveLength(journeyList.total);
      });
    },
  );

  test(
    'should reject empty dates and a From date after To in the Chat export',
    { tag: ['@regression', '@AT-CLOG-099'] },
    async ({ page, conversationLogsPage: logs, exportData: data }) => {
      const dialog = logs.exportDialog;
      let downloads = 0;
      page.on('download', () => downloads++);
      const today = todayIn(data.timeZone);

      await logs.openExport();
      await dialog.expectOpen();

      await test.step('Empty dates', async () => {
        await dialog.exportCsvButton.click();
        await expect(dialog.dialog.getByText(data.chat.messages.bothRequired)).toBeVisible();
        await expect(dialog.dialog).toBeVisible();
      });

      await test.step('From after To', async () => {
        await dialog.fillDates(today, shiftDate(today, -data.chat.invalidRangeSpanDays));
        await dialog.exportCsvButton.click();
        await expect(dialog.dialog.getByText(data.chat.messages.fromAfterTo)).toBeVisible();
        await expect(dialog.dialog).toBeVisible();
        expect(downloads, 'neither attempt downloaded a file').toBe(0);
      });

      await test.step('A valid range then exports normally', async () => {
        await dialog.fillDates(shiftDate(today, -data.chat.journeySpanDays), today);
        const { response } = await dialog.submit(
          dialog.exportCsvButton,
          isChatLogExportCall,
          data.downloadTimeoutMs,
        );
        expect(response.status()).toBe(200);
        await dialog.expectClosed();
      });
    },
  );

  test(
    'should ignore the page Agent outcome filter and search in the Chat export',
    { tag: ['@regression', '@AT-CLOG-100'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      const range = { from: data.wideFrom, to: todayIn(data.timeZone) };

      const unfiltered = await test.step('Export without page filters', async () => {
        return exportChat(logs, data, range);
      });

      await test.step('Apply the outcome filter and a search term on the page', async () => {
        await logs.selectFilterValues('outcome', [data.chat.filters.outcome]);
        const reloaded = logs.page.waitForResponse(isChatLogListCall);
        await logs.page.getByRole('textbox', { name: /^Search/ }).fill(data.chat.filters.search);
        await reloaded;
      });

      const filtered = await exportChat(logs, data, range);

      const params = exportParams(filtered.response.request());
      for (const name of ['resolutions', 'resolution', 'outcome', 'search']) {
        expect(params.has(name), `export request has no "${name}"`).toBe(false);
      }
      const outcomes = new Set(filtered.table.rows.map((row) => row['Agent Outcome']));
      expect(
        [...outcomes].filter((outcome) => outcome !== data.chat.filters.outcome).length,
      ).toBeGreaterThan(0);
      expect(filtered.table.rows.map((row) => row['Conversation ID'])).toEqual(
        unfiltered.table.rows.map((row) => row['Conversation ID']),
      );
    },
  );

  test(
    'should download a header-only CSV for a Chat range with no chats',
    {
      tag: ['@regression', '@AT-CLOG-101'],
      // If Product wants the Call behaviour ("Nothing to export", no download), flip: expect that
      // message and no download event instead of the header-only file.
      annotation: {
        type: 'pending-po',
        description:
          'OQ15: should an empty Chat range be blocked like the Call dialog? Asserts today: header-only CSV',
      },
    },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      const range = data.chat.emptyRange;
      const { response, filename, table } = await exportChat(logs, data, range);

      expect(response.status()).toBe(200);
      expect(filename).toBe(`${data.filenames.chatPrefix}${range.from}-to-${range.to}.csv`);
      expect(table.header).toEqual(data.chat.columns);
      expect(table.rows, 'no data rows').toEqual([]);
    },
  );

  test(
    'should write Chat CSV Date & Time and missing outcomes in the format staging uses today',
    {
      tag: ['@regression', '@AT-CLOG-102'],
      // Possible bug B3 (not filed): "07:57:pm" has a colon before am/pm and does not parse. If Product
      // confirms an ISO-like format, change dateTimePattern in export.json (and the outcome placeholder
      // noOutcomeValue if it is not "-") and this becomes the passing check.
      annotation: {
        type: 'pending-po',
        description:
          'OQ11: Chat CSV time looks like "07:57:pm" and a missing outcome is "-"; asserts today (possible bug B3)',
      },
    },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      const range = { from: data.wideFrom, to: todayIn(data.timeZone) };
      const { table } = await exportChat(logs, data, range);
      const { rows } = table;
      expect(rows.length).toBeGreaterThan(0);

      const pattern = new RegExp(data.chat.dateTimePattern);
      expect(
        rows.map((row) => row['Date & Time']).filter((value) => !pattern.test(value)),
        'Date & Time values in another format',
      ).toEqual([]);

      expect(
        rows.filter((row) => row['Agent Outcome'] === ''),
        'a missing outcome is never an empty cell',
      ).toEqual([]);
      const withoutOutcome = rows.filter(
        (row) => row['Agent Outcome'] === data.chat.noOutcomeValue,
      );
      test.skip(
        withoutOutcome.length === 0,
        'No chat without an outcome exists on staging right now',
      );
      expect(withoutOutcome.length).toBeGreaterThan(0);
    },
  );

  test(
    'should list All Journeys first and the page Journey options in the Chat export picker',
    { tag: ['@regression', '@AT-CLOG-103'] },
    async ({ page, conversationLogsPage: logs, exportData: data }) => {
      const dialog = logs.exportDialog;

      await logs.filterButton('journey').click();
      const pageOptions = page.getByRole('menuitemcheckbox');
      await expect(pageOptions.first()).toBeVisible();
      const expected = (await pageOptions.allInnerTexts()).map((text) => text.trim());
      await page.keyboard.press('Escape');
      await expect(pageOptions.first()).toBeHidden();

      await logs.openExport();
      await dialog.expectOpen();
      const menu = await dialog.openChatJourneyMenu();

      await test.step('Items: All Journeys first, then the page options in the same order', async () => {
        await expect(menu.getByRole('menuitem').first()).toHaveText(data.chat.allJourneys);
        await expect(menu.getByRole('menuitem')).toHaveText([data.chat.allJourneys, ...expected]);
      });

      await test.step('Choosing a journey closes the picker and updates the button', async () => {
        await menu.getByRole('menuitem', { name: data.journeys.chat, exact: true }).click();
        await expect(menu).toBeHidden();
        await expect(dialog.chatJourneyButton).toHaveText(data.journeys.chat);
      });
    },
  );
});
