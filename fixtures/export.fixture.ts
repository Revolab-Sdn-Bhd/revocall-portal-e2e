import { test as base, expect, readTestData } from './base.fixture';

type DateRange = { from: string; to: string };

export type ExportData = {
  dialogName: string;
  callHeading: string;
  downloadTimeoutMs: number;
  timeZone: string;
  defaultRangeDays: number;
  wideFrom: string;
  journeys: { call: string; chat: string };
  filenames: { callExcel: string; callZip: string; callPrefix: string; chatPrefix: string };
  call: {
    filtersNone: string;
    alwaysIncluded: string;
    zipHint: string;
    excelHint: string;
    nothingToExport: string;
    rangeError: string;
    sections: string[];
    sectionParams: Record<string, string>;
    excelSheets: string[];
    excelSheetsHint: string;
    csvEntries: string[];
    columns: string[];
    summaryColumns: string[];
    sentimentColumns: string[];
    ratingColumns: string[];
    transcriptColumns: string[];
    keyColumn: string;
    callbackKeyColumn: string;
    callbacksColumns: string[];
    startedAtColumn: string;
    aboutSheet: string;
    about: {
      labels: string[];
      channel: string;
      timezone: string;
      noFilters: string;
      testCallsOff: string;
      rowsPerSheet: string;
      glossary: string;
    };
    listColumns: {
      contact: string;
      journey: string;
      dateTime: string;
      duration: string;
      disposition: string;
      outcome: string;
    };
    noOutcomeInList: string;
    filters: {
      outcome: string;
      outcomeSummary: string;
      outcomeParam: string;
      disposition: string;
      dispositionSummary: string;
      dispositionParam: string;
    };
    ranges: { from: string; to: string; label: string; filenamePart: string }[];
    emptyRangePast: DateRange;
    futureRangeStartDays: number;
    futureRangeLengthDays: number;
    invalidRangeSpanDays: number;
  };
  chat: {
    columns: string[];
    note: string;
    journeyPickerName: string;
    allJourneys: string;
    requiredFrom: string;
    requiredTo: string;
    messages: { bothRequired: string; fromAfterTo: string };
    fromDaysAgo: number;
    journeySpanDays: number;
    emptyRange: DateRange;
    invalidRangeSpanDays: number;
    filters: { outcome: string; search: string };
    dateTimePattern: string;
    noOutcomeValue: string;
    outcomes: string[];
  };
};

type ExportFixtures = { exportData: ExportData };

/**
 * Extends the shared fixtures with the export test data (FIX-01: only the data is new; the page
 * objects come from base.fixture.ts).
 */
export const test = base.extend<ExportFixtures>({
  exportData: async ({}, use) => {
    await use(readTestData<ExportData>('conversation-logs/export.json'));
  },
});

export { expect };
