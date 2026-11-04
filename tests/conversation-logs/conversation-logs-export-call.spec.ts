import { test, expect } from '../../fixtures/export.fixture';
import { isCallLogExportCall } from '../../utils/api';
import {
  compactDate,
  daysBetween,
  listDateTime,
  listDurationSeconds,
  rangeFilenamePart,
  rangeLabel,
  shiftDate,
  todayIn,
  toWallClock,
} from '../../utils/export-dates';
import { inspectDownload } from '../../utils/download';
import {
  expectButtonCount,
  expectButtonFollows,
  exportButtonCount,
  exportFilteredConversations,
  newestRowDate,
  openCallExport,
  rangeEndingAtNewest,
  searchCallList,
  sortCallListBy,
  waitForCallList,
} from '../../utils/export-flow';
import {
  UUID_PATTERN,
  parseCsv,
  readCsvFile,
  readAbout,
  readWorkbook,
  readZipEntries,
  sheetByName,
} from '../../utils/export-files';
import { exportParams, exportSections, readExportCount } from '../../utils/export-requests';

/*
 * Call export (Conversation Logs, Call tab). Exports only read data: every file is saved to a temp
 * folder, parsed, and deleted right away. Staging data is live, so ranges are computed from the newest
 * call and the checks are relations (rows vs range, rows vs the button count, file vs list), never
 * fixed counts.
 *
 * The dialog is taller than the default 720 px viewport, which clips its lower half (the Callbacks
 * switch and the Export button end up outside the viewport), so these tests use a taller one.
 */
test.use({ viewport: { width: 1280, height: 1400 } });

// Default range (30 days) as Excel takes about 40 s on staging; everything else uses small ranges.
const SLOW_EXPORT_EXTRA_MS = 30_000;

test.describe('Conversation Logs - Call export', () => {
  test.beforeEach(async ({ conversationLogsPage: logs }) => {
    await logs.goto();
  });

  test(
    'should export call logs with the default range as an Excel file',
    { tag: ['@smoke', '@AT-CLOG-012'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.setTimeout(data.downloadTimeoutMs + SLOW_EXPORT_EXTRA_MS);
      const dialog = logs.exportDialog;
      let buttonCount = 0;

      await test.step('Open the Call export dialog', async () => {
        await openCallExport(logs);
        await expect(dialog.callsHeading).toBeVisible();
        await expect(dialog.dateRangeButton).toBeVisible();
        await expect(dialog.journeyButton).toBeVisible();
        await expect(dialog.excelFormatButton).toHaveAttribute('aria-pressed', 'true');
        await expect(dialog.filenameHint).toHaveText(
          new RegExp(data.filenames.callExcel.slice(1, -1)),
        );
        // The count is compared with the file below (and with the list in AT-CLOG-095).
        await expect(dialog.exportCallsButton).toHaveAccessibleName(/^Export [1-9]\d* calls?$/);
        buttonCount = await exportButtonCount(logs);
      });

      await test.step('Export and check the downloaded file', async () => {
        const { response, download } = await dialog.submit(
          dialog.exportCallsButton,
          isCallLogExportCall,
          data.downloadTimeoutMs,
        );

        expect(response.status()).toBe(200);
        expect(download.suggestedFilename()).toMatch(new RegExp(data.filenames.callExcel));

        const sheets = await inspectDownload(download, (file) => readWorkbook(file.path));
        expect(sheets.map((sheet) => sheet.name)).toEqual(data.call.excelSheets);
        expect(sheetByName(sheets, 'Conversations').rows, 'one row per call').toHaveLength(
          buttonCount,
        );
      });

      await test.step('Dialog closes after the download', async () => {
        await dialog.expectClosed();
      });
    },
  );

  test(
    'should export call logs as CSV and get a zip with one CSV per sheet, each keyed by conversation ID',
    {
      tag: ['@regression', '@AT-CLOG-013'],
      // RV-3672 supersedes PRD Story 5 for the Call export; the Conversations header is the one in
      // the RV-3672 sample export (answers OQ6).
      annotation: {
        type: 'requirement',
        description:
          'RV-3672: CSV zip has a CSV per sheet; Conversation ID on every sheet (Callbacks: Original conversation ID); no tool calls',
      },
    },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;
      const range = await rangeEndingAtNewest(logs, data.call.listColumns.dateTime, 1);

      await openCallExport(logs);
      const counted = await dialog.chooseDateRange(range.from, range.to);
      const count = await expectButtonFollows(logs, counted);

      await test.step('Switch the format to CSV', async () => {
        await dialog.chooseFormat('csv');
        await expect(dialog.dialog.getByText(data.call.zipHint)).toBeVisible();
        await expect(dialog.filenameHint).toHaveText(
          `${data.filenames.callPrefix}${rangeFilenamePart(range.from, range.to)}.zip`,
        );
      });

      const { response, download } = await dialog.submit(
        dialog.exportCallsButton,
        isCallLogExportCall,
        data.downloadTimeoutMs,
      );
      expect(response.status()).toBe(200);
      expect(download.suggestedFilename()).toMatch(new RegExp(data.filenames.callZip));

      const entries = await inspectDownload(download, (file) => readZipEntries(file.path));
      // One CSV per sheet; tool calls are no longer exported, so there is no file for them.
      expect(Object.keys(entries).sort()).toEqual([...data.call.csvEntries].sort());
      const conversations = parseCsv(entries['conversations.csv']);

      expect(conversations.rows, 'one row per call in the button').toHaveLength(count);
      expect(conversations.header).toEqual(data.call.columns);
      expect(conversations.header, 'no "No." column').not.toContain('No.');

      await test.step('Every sheet carries the conversation ID', async () => {
        expect(parseCsv(entries['insights.csv']).header[0]).toBe(data.call.keyColumn);
        expect(parseCsv(entries['transcript.csv']).header).toEqual(data.call.transcriptColumns);
        // The Callbacks sheet is keyed by "Original conversation ID" (accepted in RV-3672).
        expect(parseCsv(entries['callbacks.csv']).header).toEqual(data.call.callbacksColumns);
        expect(data.call.callbacksColumns[0]).toBe(data.call.callbackKeyColumn);
      });

      await dialog.expectClosed();
    },
  );

  test(
    'should carry the page Agent outcome filter into the Call export request and file',
    {
      tag: ['@regression', '@AT-CLOG-014'],
      annotation: {
        type: 'requirement',
        description: 'RV-3672: page filters carry into the Call export',
      },
    },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;

      const [filtered] = await logs.selectFilterValues('outcome', [data.call.filters.outcome]);
      await openCallExport(logs);

      await expect(dialog.filtersSummary).toHaveText(
        new RegExp(`^Filters from this page\\s*${data.call.filters.outcomeSummary}$`),
      );
      const exported = await exportFilteredConversations(
        logs,
        { from: data.wideFrom, to: todayIn(data.timeZone) },
        data.downloadTimeoutMs,
      );

      expect(exportParams(exported.request).get('outcome'), 'export request outcome').toBe(
        data.call.filters.outcomeParam,
      );
      expect(exported.rows.length, 'export has rows').toBeGreaterThan(0);
      expect(
        exported.rows.filter((row) => row['Agent outcome'] !== data.call.filters.outcome),
        'rows that are not Resolved',
      ).toEqual([]);
      expect(exported.count, 'export count equals the filtered list total').toBe(filtered.total);
      expect(exported.rows).toHaveLength(filtered.total);
    },
  );

  test(
    'should show the default scope, options and format in the Call export dialog',
    { tag: ['@regression', '@AT-CLOG-078'] },
    async ({ page, conversationLogsPage: logs, exportData: data }) => {
      const dialog = logs.exportDialog;
      let downloads = 0;
      page.on('download', () => downloads++);

      const counted = await openCallExport(logs);
      const params = exportParams(counted.request());
      const start = params.get('start_date')!;
      const end = params.get('end_date')!;
      const { call_count: count } = await readExportCount(counted);

      await test.step('Scope: last 30 days, all journeys, no page filters, no test calls', async () => {
        await expect(dialog.callsHeading).toBeVisible();
        // The app takes "today" from the browser or the organisation, so either day is accepted.
        expect([todayIn(data.timeZone), todayIn('UTC')]).toContain(end);
        expect(daysBetween(start, end)).toBe(data.defaultRangeDays - 1);
        expect(params.get('tz')).toBe(data.timeZone);
        await expect(dialog.dateRangeButton).toHaveText(rangeLabel(start, end));
        await expect(dialog.journeyButton).toBeVisible();
        await expect(dialog.filtersSummary).toHaveText(
          new RegExp(`^Filters from this page\\s*${data.call.filtersNone}$`),
        );
        await expect(dialog.testCallsSwitch).not.toBeChecked();
      });

      await test.step('Include section: call details always, every optional section on', async () => {
        await expect(dialog.dialog.getByText(data.call.alwaysIncluded)).toBeVisible();
        for (const section of data.call.sections) {
          await expect(dialog.sectionSwitch(section)).toBeChecked();
        }
        expect(exportSections(counted.request())).toEqual(
          data.call.sections.map((section) => data.call.sectionParams[section]),
        );
      });

      await test.step('Format: Excel, file name and sheets', async () => {
        await expect(dialog.excelFormatButton).toHaveAttribute('aria-pressed', 'true');
        await expect(dialog.filenameHint).toHaveText(
          `${data.filenames.callPrefix}${rangeFilenamePart(start, end)}.xlsx`,
        );
        await expect(dialog.formatsHint).toHaveText(data.call.excelSheetsHint);
        await expect(dialog.dialog.getByText(data.call.excelHint)).toBeVisible();
      });

      await test.step('Button count equals the count request; Cancel closes without a download', async () => {
        await expectButtonCount(logs, count);
        await dialog.cancelButton.click();
        await dialog.expectClosed();
        expect(downloads, 'Cancel starts no download').toBe(0);
      });
    },
  );

  test(
    'should export a custom date range as Excel with every row inside the range',
    { tag: ['@smoke', '@AT-CLOG-079'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;
      const range = await rangeEndingAtNewest(logs, data.call.listColumns.dateTime, 1);
      let count = 0;

      await test.step('Choose the range in the dialog', async () => {
        await openCallExport(logs);
        const counted = await dialog.chooseDateRange(range.from, range.to);
        const params = exportParams(counted.request());
        expect(params.get('start_date')).toBe(range.from);
        expect(params.get('end_date')).toBe(range.to);
        count = await expectButtonFollows(logs, counted);
        await expect(dialog.dateRangeButton).toHaveText(rangeLabel(range.from, range.to));
        await expect(dialog.filenameHint).toHaveText(
          `${data.filenames.callPrefix}${rangeFilenamePart(range.from, range.to)}.xlsx`,
        );
      });

      const { response, download } = await dialog.submit(
        dialog.exportCallsButton,
        isCallLogExportCall,
        data.downloadTimeoutMs,
      );
      expect(response.status()).toBe(200);
      expect(download.suggestedFilename()).toBe(
        `${data.filenames.callPrefix}${rangeFilenamePart(range.from, range.to)}.xlsx`,
      );
      const sheets = await inspectDownload(download, (file) => readWorkbook(file.path));

      await test.step('Conversations sheet: columns, row count, ids and dates', async () => {
        const conversations = sheetByName(sheets, 'Conversations');
        expect(conversations.header.slice(0, 8)).toEqual(data.call.columns.slice(0, 8));
        expect(conversations.rows, 'one row per call in the button').toHaveLength(count);

        const ids = conversations.rows.map((row) => String(row['Conversation ID']));
        expect(new Set(ids).size, 'every Conversation ID is unique').toBe(count);
        expect(
          ids.filter((id) => !UUID_PATTERN.test(id)),
          'ids that are not UUIDs',
        ).toEqual([]);

        // Excel stores the GMT+8 wall clock time as if it were UTC, so no offset is applied.
        const start = Date.parse(`${range.from}T00:00:00Z`);
        const end = Date.parse(`${range.to}T23:59:59Z`);
        const outside = conversations.rows
          .map((row) => row[data.call.startedAtColumn])
          .filter(
            (value) => !(value instanceof Date) || value.getTime() < start || value.getTime() > end,
          );
        expect(outside, 'rows outside the range').toEqual([]);
      });

      await test.step('About sheet describes the export', async () => {
        const about = readAbout(
          sheetByName(sheets, data.call.aboutSheet),
          data.call.about.rowsPerSheet,
          data.call.about.glossary,
        );
        expect(about.fields['Channel']).toBe(data.call.about.channel);
        expect(about.fields['Date range']).toBe(`${range.from} to ${range.to}`);
        expect(about.fields['Timezone']).toBe(data.call.about.timezone);
        expect(about.rowsPerSheet['Conversations']).toBe(count);
      });

      await dialog.expectClosed();
    },
  );

  test(
    'should export one journey as CSV with every row in that journey and the list count',
    { tag: ['@smoke', '@AT-CLOG-080'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;
      const journey = data.journeys.call;

      const [filtered] = await logs.selectFilterValues('journey', [journey]);
      // A fresh page, so the dialog's journey is chosen in the dialog and not pre-filled from the page.
      await logs.goto();

      await openCallExport(logs);
      await dialog.chooseDateRange(data.wideFrom, todayIn(data.timeZone));
      const counted = await dialog.chooseCallJourney(journey);
      expect(exportParams(counted.request()).has('journey_id'), 'count carries journey_id').toBe(
        true,
      );
      const count = await expectButtonFollows(logs, counted);
      expect(count, 'button equals the list total for the journey').toBe(filtered.total);

      await dialog.chooseFormat('csv');
      const { response, download } = await dialog.submit(
        dialog.exportCallsButton,
        isCallLogExportCall,
        data.downloadTimeoutMs,
      );
      expect(response.status()).toBe(200);
      expect(download.suggestedFilename()).toMatch(new RegExp(data.filenames.callZip));

      const entries = await inspectDownload(download, (file) => readZipEntries(file.path));
      const conversations = parseCsv(entries['conversations.csv']);
      expect(conversations.rows).toHaveLength(count);
      expect(
        conversations.rows.filter((row) => row['Journey'] !== journey),
        'rows of another journey',
      ).toEqual([]);
    },
  );

  test(
    'should export a CSV zip with one CSV per section and a consistent conversations.csv',
    { tag: ['@regression', '@AT-CLOG-081'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;
      const range = await rangeEndingAtNewest(logs, data.call.listColumns.dateTime, 1);

      await openCallExport(logs);
      const counted = await dialog.chooseDateRange(range.from, range.to);
      const count = await expectButtonFollows(logs, counted);
      await dialog.chooseFormat('csv');
      await expect(dialog.dialog.getByText(data.call.zipHint)).toBeVisible();

      const { response, download } = await dialog.submit(
        dialog.exportCallsButton,
        isCallLogExportCall,
        data.downloadTimeoutMs,
      );
      expect(response.status()).toBe(200);
      expect(download.suggestedFilename()).toBe(
        `${data.filenames.callPrefix}${rangeFilenamePart(range.from, range.to)}.zip`,
      );
      const entries = await inspectDownload(download, (file) => readZipEntries(file.path));

      await test.step('Zip has one CSV per ticked section', async () => {
        expect(Object.keys(entries).sort()).toEqual([...data.call.csvEntries].sort());
      });

      const conversations = parseCsv(entries['conversations.csv']);

      await test.step('conversations.csv: BOM, header, row count and formats', async () => {
        expect(conversations.hasBom, 'UTF-8 BOM').toBe(true);
        expect(conversations.rows).toHaveLength(count);
        const ids = conversations.rows.map((row) => row['Conversation ID']);
        expect(new Set(ids).size, 'unique Conversation IDs').toBe(count);
        expect(
          conversations.rows.filter((row) => !/^\d+$/.test(row['Duration (s)'])),
          'rows whose Duration (s) is not an integer',
        ).toEqual([]);
        expect(
          conversations.rows.filter(
            (row) => !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row[data.call.startedAtColumn]),
          ),
          'rows whose start time is not yyyy-mm-dd HH:mm:ss',
        ).toEqual([]);
      });

      await test.step('transcript.csv header and ids belong to conversations.csv', async () => {
        const transcript = parseCsv(entries['transcript.csv']);
        expect(transcript.header).toEqual(data.call.transcriptColumns);
        const known = new Set(conversations.rows.map((row) => row['Conversation ID']));
        expect(
          transcript.rows.filter((row) => !known.has(row['Conversation ID'])),
          'transcript rows of unknown conversations',
        ).toEqual([]);
      });
    },
  );

  test(
    'should export every call in a wide date range (no truncation)',
    { tag: ['@regression', '@AT-CLOG-082'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;
      const total = await logs.getTotal();
      const oldest = await sortCallListBy(logs, data.call.listColumns.dateTime, 'ascending');
      await logs.goto();
      const newestDate = await newestRowDate(logs, data.call.listColumns.dateTime);

      await openCallExport(logs);
      const counted = await dialog.chooseDateRange(data.wideFrom, todayIn(data.timeZone));
      // Optional sections off, so the file is quick to build (and is one plain .csv, not a zip).
      await dialog.clearSections();
      await dialog.chooseFormat('csv');
      const count = await expectButtonFollows(logs, counted);
      expect(count, 'button equals the list total').toBe(total);

      const { response, download } = await dialog.submit(
        dialog.exportCallsButton,
        isCallLogExportCall,
        data.downloadTimeoutMs,
      );
      expect(response.status()).toBe(200);
      expect(download.suggestedFilename(), 'one file left, so a plain CSV').toMatch(/\.csv$/);
      const conversations = await inspectDownload(download, (file) => readCsvFile(file.path));

      expect(conversations.rows, 'one row per call').toHaveLength(total);
      const ids = conversations.rows.map((row) => row['Conversation ID']);
      expect(new Set(ids).size, 'unique Conversation IDs').toBe(total);

      const times = conversations.rows.map((row) => row[data.call.startedAtColumn]).sort();
      expect(times[0], 'oldest call in the file is the oldest in the list').toBe(
        toWallClock(oldest.createdAt, data.timeZone).slice(0, 19),
      );
      expect(times[times.length - 1].slice(0, 10), 'newest call in the file').toBe(newestDate);
    },
  );

  test(
    'should write the Excel sheets, About metadata and row counts the dialog announces',
    { tag: ['@regression', '@AT-CLOG-083'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;
      const day = await newestRowDate(logs, data.call.listColumns.dateTime);

      await openCallExport(logs);
      await dialog.chooseDateRange(day, day);
      await expect(dialog.formatsHint).toHaveText(data.call.excelSheetsHint);

      const { response, download } = await dialog.submit(
        dialog.exportCallsButton,
        isCallLogExportCall,
        data.downloadTimeoutMs,
      );
      expect(response.status()).toBe(200);
      const sheets = await inspectDownload(download, (file) => readWorkbook(file.path));

      // The dialog says "About" for the sheet the file calls "About this export".
      expect(sheets.map((sheet) => sheet.name)).toEqual(data.call.excelSheets);

      const about = readAbout(
        sheetByName(sheets, data.call.aboutSheet),
        data.call.about.rowsPerSheet,
        data.call.about.glossary,
      );
      // Exported by / on carry the user and the time of the run, so only their presence is checked.
      for (const label of data.call.about.labels) {
        expect(about.fields[label], `About row "${label}"`).toBeTruthy();
      }
      expect(about.fields['Channel']).toBe(data.call.about.channel);
      expect(about.fields['Filters applied']).toBe(data.call.about.noFilters);
      expect(about.fields['Test calls']).toBe(data.call.about.testCallsOff);

      for (const name of data.call.excelSheets.slice(1)) {
        expect(about.rowsPerSheet[name], `Rows per sheet: ${name}`).toBe(
          sheetByName(sheets, name).rows.length,
        );
      }
      expect(about.glossary, 'glossary lists every Conversations column').toEqual(
        sheetByName(sheets, 'Conversations').header,
      );
    },
  );

  test(
    'should match the first export rows with the same conversations in the list',
    { tag: ['@regression', '@AT-CLOG-084'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;
      const columns = data.call.listColumns;

      // Reload so the list response (with the ids) is captured for the five newest rows.
      const listed = waitForCallList(logs);
      await logs.goto();
      const listBody = (await (await listed).json()) as { data: { id: string }[] };
      const ids = listBody.data.slice(0, 5).map((row) => row.id);
      const listRows = [];
      for (let index = 0; index < 5; index++) listRows.push(await logs.rowValues(index));
      const headers = (await logs.columnHeaders.allInnerTexts()).map((text) => text.trim());
      const cell = (row: string[], column: string) => row[headers.indexOf(column)];

      const from = shiftDate(await newestRowDate(logs, columns.dateTime), -1);
      await openCallExport(logs);
      await dialog.chooseDateRange(from, todayIn(data.timeZone));
      await dialog.chooseFormat('csv');
      const { download } = await dialog.submit(
        dialog.exportCallsButton,
        isCallLogExportCall,
        data.downloadTimeoutMs,
      );
      const entries = await inspectDownload(download, (file) => readZipEntries(file.path));
      const byId = new Map(
        parseCsv(entries['conversations.csv']).rows.map((row) => [row['Conversation ID'], row]),
      );

      // Matched by id, never by position: the export has no "No." column.
      listRows.forEach((listRow, index) => {
        const exported = byId.get(ids[index]);
        expect(exported, `export has list row ${index + 1}`).toBeDefined();
        expect(exported!['Journey']).toBe(cell(listRow, columns.journey));
        expect(exported!['Call disposition']).toBe(cell(listRow, columns.disposition));
        const outcome = cell(listRow, columns.outcome);
        expect(exported!['Agent outcome']).toBe(
          outcome === data.call.noOutcomeInList ? '' : outcome,
        );
        expect(Number(exported!['Duration (s)'])).toBe(
          listDurationSeconds(cell(listRow, columns.duration)),
        );
        expect(exported![data.call.startedAtColumn].slice(0, 16)).toBe(
          listDateTime(cell(listRow, columns.dateTime)),
        );
        expect(exported!['Contact number']).toBe(`+${cell(listRow, columns.contact)}`);
      });
    },
  );

  test(
    'should change the section list, the count request and the file columns with each section switch',
    { tag: ['@regression', '@AT-CLOG-085'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;
      const range = await rangeEndingAtNewest(logs, data.call.listColumns.dateTime, 1);
      const param = (name: string) => data.call.sectionParams[name];

      await openCallExport(logs);
      await dialog.chooseDateRange(range.from, range.to);

      await test.step('Insights off drops its sheet and its request parameter', async () => {
        const counted = await dialog.setSection('Insights', false);
        expect(exportSections(counted.request())).toEqual(
          data.call.sections.filter((name) => name !== 'Insights').map(param),
        );
        await expect(dialog.formatsHint).toHaveText(
          'Sheets: About, Conversations, Transcript, Callbacks',
        );
      });

      await test.step('Transcript and Summary off', async () => {
        await dialog.setSection('Transcript', false);
        const counted = await dialog.setSection('Summary', false);
        expect(exportSections(counted.request())).toEqual(
          ['Sentiment', 'Rating', 'Callbacks'].map(param),
        );
      });

      await test.step('The CSV zip leaves out those files and columns', async () => {
        await dialog.chooseFormat('csv');
        const { download } = await dialog.submit(
          dialog.exportCallsButton,
          isCallLogExportCall,
          data.downloadTimeoutMs,
        );
        const entries = await inspectDownload(download, (file) => readZipEntries(file.path));
        expect(Object.keys(entries).sort()).toEqual(['callbacks.csv', 'conversations.csv']);
        const header = parseCsv(entries['conversations.csv']).header;
        expect(header).toEqual(
          data.call.columns.filter((column) => !data.call.summaryColumns.includes(column)),
        );
        expect(header).toContain(data.call.sentimentColumns[0]);
        expect(header).toContain(data.call.ratingColumns[0]);
      });

      await test.step('With every section on, "Clear all" switches them off', async () => {
        await dialog.expectClosed();
        await openCallExport(logs);
        // The dialog may keep the earlier choice, so first make sure every section is on.
        await dialog.selectAllSections();
        const cleared = await dialog.toggleAllSections();
        expect(exportSections(cleared.request()), 'no sections requested').toEqual([]);
        for (const section of data.call.sections) {
          await expect(dialog.sectionSwitch(section)).not.toBeChecked();
        }
        await expect(dialog.sectionsToggleAllButton).toHaveText('Select all');
      });
    },
  );

  test(
    'should still allow an export when every optional section is switched off',
    {
      tag: ['@regression', '@AT-CLOG-086'],
      // RV-3672: only the conversation details are always included; the optional sections can all be off.
      annotation: {
        type: 'requirement',
        description: 'RV-3672: every optional section can be switched off (answers OQ14)',
      },
    },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      const dialog = logs.exportDialog;
      await openCallExport(logs);

      let last: Awaited<ReturnType<typeof dialog.setSection>> | undefined;
      for (const section of data.call.sections) {
        last = await dialog.setSection(section, false);
        await expect(dialog.sectionSwitch(section)).not.toBeChecked();
      }
      expect(exportSections(last!.request()), 'no sections requested').toEqual([]);
      await expect(dialog.formatsHint).toHaveText('Sheets: About, Conversations');
      await expect(dialog.exportCallsButton).toBeEnabled();
    },
  );

  test(
    'should add test calls to the Call export when "Include test calls" is on',
    {
      tag: ['@regression', '@AT-CLOG-087'],
      // The number beside the switch ("N in this range") is not asserted: it is a count of test calls
      // in the range, not of the extra rows (answers OQ13).
      annotation: {
        type: 'requirement',
        description:
          'RV-3672: include/exclude test calls. RV-4016 (Not a bug): the extra "Gaps E2E" calls with Test call = No come from an automated test script (dirty test data), so only the superset is asserted',
      },
    },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;
      const exportCsv = async () => {
        const { download } = await dialog.submit(
          dialog.exportCallsButton,
          isCallLogExportCall,
          data.downloadTimeoutMs,
        );
        return (await inspectDownload(download, (file) => readCsvFile(file.path))).rows;
      };

      const first = await openCallExport(logs);
      expect(exportParams(first.request()).has('include_test'), 'off: no include_test').toBe(false);
      const offCount = await expectButtonFollows(logs, first);
      // Optional sections off, so the two exports are quick (and are plain .csv files).
      await dialog.clearSections();
      await dialog.chooseFormat('csv');

      const offRows = await exportCsv();
      expect(offRows.filter((row) => row['Test call'] === 'Yes')).toEqual([]);
      expect(offRows).toHaveLength(offCount);
      await dialog.expectClosed();

      await openCallExport(logs);
      await dialog.clearSections();
      const counted = await dialog.setIncludeTestCalls(true);
      expect(exportParams(counted.request()).get('include_test')).toBe('1');
      const onCount = await expectButtonFollows(logs, counted);
      expect(onCount, 'test calls increase the count').toBeGreaterThan(offCount);

      await dialog.chooseFormat('csv');
      const onRows = await exportCsv();
      expect(onRows.filter((row) => row['Test call'] === 'Yes').length).toBeGreaterThan(0);
      // Every call of the first export is still there. Not "the non-test rows are exactly the first
      // export": RV-4016 (Not a bug) - "Gaps E2E" calls come from an automated test script (dirty test
      // data) and show up only when the switch is on, so only the superset is asserted.
      const onIds = new Set(onRows.map((row) => row['Conversation ID']));
      expect(
        offRows.filter((row) => !onIds.has(row['Conversation ID'])),
        'calls of the first export missing from the second',
      ).toEqual([]);
    },
  );

  test(
    'should reject a date range that starts after it ends and empty dates',
    { tag: ['@regression', '@AT-CLOG-088'] },
    async ({ page, conversationLogsPage: logs, exportData: data }) => {
      const dialog = logs.exportDialog;
      let countRequests = 0;
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/calllog/v2/export/count') countRequests++;
      });

      await openCallExport(logs);
      const labelBefore = await dialog.dateRangeButton.innerText();
      const buttonBefore = await dialog.exportCallsButton.innerText();
      const today = todayIn(data.timeZone);
      const requestsBefore = countRequests;

      await test.step('From after To shows the message and disables Apply', async () => {
        await dialog.typeDateRange(today, shiftDate(today, -data.call.invalidRangeSpanDays));
        await expect(dialog.dialog.getByText(data.call.rangeError)).toBeVisible();
        await expect(dialog.rangeApplyButton).toBeDisabled();
      });

      await test.step('Empty dates disable Apply', async () => {
        await dialog.fromInput.fill('');
        await dialog.toInput.fill('');
        await expect(dialog.rangeApplyButton).toBeDisabled();
      });

      await test.step('Cancel keeps the earlier range and sends no new count request', async () => {
        await dialog.rangeCancelButton.click();
        await expect(dialog.rangeApplyButton).toBeHidden();
        await expect(dialog.dateRangeButton).toHaveText(labelBefore);
        await expect(dialog.exportCallsButton).toHaveText(buttonBefore);
        expect(countRequests, 'no count request while the range was invalid').toBe(requestsBefore);
      });
    },
  );

  test(
    'should disable the export when the date range has no calls',
    { tag: ['@regression', '@AT-CLOG-089'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      const dialog = logs.exportDialog;
      const today = todayIn(data.timeZone);
      const future = {
        from: shiftDate(today, data.call.futureRangeStartDays),
        to: shiftDate(today, data.call.futureRangeStartDays + data.call.futureRangeLengthDays),
      };
      await openCallExport(logs);

      for (const range of [data.call.emptyRangePast, future]) {
        await test.step(`Range ${range.from} to ${range.to}`, async () => {
          const counted = await dialog.chooseDateRange(range.from, range.to);
          expect((await readExportCount(counted)).call_count).toBe(0);
          await expect(dialog.nothingToExportButton).toBeDisabled();
          await expect(dialog.filenameHint).toHaveText(
            `${data.filenames.callPrefix}${rangeFilenamePart(range.from, range.to)}.xlsx`,
          );
        });
      }
    },
  );

  test(
    'should format the date range label and the file name for single-day, same-month and cross-year ranges',
    { tag: ['@regression', '@AT-CLOG-090'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      const dialog = logs.exportDialog;
      await openCallExport(logs);

      for (const range of data.call.ranges) {
        await test.step(`Range ${range.from} to ${range.to}`, async () => {
          await dialog.chooseDateRange(range.from, range.to);
          await expect(dialog.dateRangeButton).toHaveText(range.label);
          expect(rangeLabel(range.from, range.to), 'label helper agrees with the data').toBe(
            range.label,
          );
          await expect(dialog.filenameHint).toHaveText(
            `${data.filenames.callPrefix}${range.filenamePart}.xlsx`,
          );
          expect(compactDate(range.from)).toBe(range.filenamePart.slice(0, 8));
        });
      }
    },
  );

  test(
    'should pre-fill the dialog journey from the page Journey filter',
    { tag: ['@regression', '@AT-CLOG-091'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      const dialog = logs.exportDialog;
      const journey = data.journeys.call;

      const [filtered] = await logs.selectFilterValues('journey', [journey]);
      const first = await openCallExport(logs);

      await expect(dialog.journeyButtonNamed(journey)).toBeVisible();
      expect(exportParams(first.request()).has('journey_id'), 'count carries journey_id').toBe(
        true,
      );

      // Equal to the filtered list only when the range covers all the data.
      const counted = await dialog.chooseDateRange(data.wideFrom, todayIn(data.timeZone));
      expect(await expectButtonFollows(logs, counted)).toBe(filtered.total);
    },
  );

  test(
    'should carry the page Agent outcome filter into the Call export and match the list',
    {
      tag: ['@smoke', '@AT-CLOG-092'],
      annotation: {
        type: 'requirement',
        description: 'RV-3672: page filters carry into the Call export',
      },
    },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;

      const [filtered] = await logs.selectFilterValues('outcome', [data.call.filters.outcome]);
      const counted = await openCallExport(logs);

      await expect(dialog.filtersSummary).toHaveText(
        new RegExp(`^Filters from this page\\s*${data.call.filters.outcomeSummary}$`),
      );
      expect(exportParams(counted.request()).get('outcome'), 'count request outcome').toBe(
        data.call.filters.outcomeParam,
      );

      // The default 30 days may not cover the whole list, so the widest range is used for the comparison.
      const exported = await exportFilteredConversations(
        logs,
        { from: data.wideFrom, to: todayIn(data.timeZone) },
        data.downloadTimeoutMs,
      );
      expect(exported.count, 'export count equals the filtered list total').toBe(filtered.total);
      expect(exported.rows).toHaveLength(filtered.total);
      expect(
        exported.rows.filter((row) => row['Agent outcome'] !== data.call.filters.outcome),
        'rows that are not Resolved',
      ).toEqual([]);
    },
  );

  test(
    'should carry the page search text into the Call export and match the list',
    {
      tag: ['@regression', '@AT-CLOG-093'],
      annotation: {
        type: 'requirement',
        description: 'RV-3672: page filters carry into the Call export',
      },
    },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;
      const [contact] = await logs.columnValues(data.call.listColumns.contact);

      await searchCallList(logs, contact);
      const total = await logs.getTotal();
      const counted = await openCallExport(logs);

      await expect(dialog.filtersSummary).toContainText(contact);
      expect(exportParams(counted.request()).get('search'), 'count request search').toBe(contact);

      const exported = await exportFilteredConversations(
        logs,
        { from: data.wideFrom, to: todayIn(data.timeZone) },
        data.downloadTimeoutMs,
      );
      expect(exported.count, 'export count equals the searched list total').toBe(total);
      expect(exported.rows).toHaveLength(total);
      const digits = (value: string) => value.replace(/\D/g, '');
      expect(
        exported.rows.filter((row) => !digits(row['Contact number']).includes(digits(contact))),
        'rows whose contact number does not match the search',
      ).toEqual([]);
    },
  );

  test(
    'should carry the page Call disposition filter into the Call export and match the list',
    {
      tag: ['@regression', '@AT-CLOG-094'],
      annotation: {
        type: 'requirement',
        description: 'RV-3672: page filters carry into the Call export',
      },
    },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      test.slow();
      const dialog = logs.exportDialog;

      const [filtered] = await logs.selectFilterValues('disposition', [
        data.call.filters.disposition,
      ]);
      const counted = await openCallExport(logs);

      await expect(dialog.filtersSummary).toContainText(data.call.filters.dispositionSummary);
      expect(exportParams(counted.request()).get('disposition'), 'count request disposition').toBe(
        data.call.filters.dispositionParam,
      );

      const exported = await exportFilteredConversations(
        logs,
        { from: data.wideFrom, to: todayIn(data.timeZone) },
        data.downloadTimeoutMs,
      );
      expect(exported.count, 'export count equals the filtered list total').toBe(filtered.total);
      expect(exported.rows).toHaveLength(filtered.total);
      expect(
        exported.rows.filter((row) => row['Call disposition'] !== data.call.filters.disposition),
        'rows with another disposition',
      ).toEqual([]);
    },
  );

  test(
    'should show an Export button count equal to the list total for the same data',
    { tag: ['@regression', '@AT-CLOG-095'] },
    async ({ conversationLogsPage: logs, exportData: data }) => {
      const dialog = logs.exportDialog;
      const total = await logs.getTotal();
      const [journeyList] = await logs.selectFilterValues('journey', [data.journeys.call]);

      // A fresh page so the journey is chosen in the dialog.
      await logs.goto();
      await openCallExport(logs);
      const wide = await dialog.chooseDateRange(data.wideFrom, todayIn(data.timeZone));
      expect(await expectButtonFollows(logs, wide), 'all journeys').toBe(total);

      const journey = await dialog.chooseCallJourney(data.journeys.call);
      expect(await expectButtonFollows(logs, journey), 'one journey').toBe(journeyList.total);
    },
  );
});
