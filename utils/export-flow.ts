import { expect, type Response } from '@playwright/test';
import type { ConversationLogsPage } from '../pages/conversation-logs/ConversationLogsPage';
import { isCallLogListCall, isCallLogExportCountCall, isCallLogExportCall } from './api';
import { inspectDownload } from './download';
import { listDate, shiftDate } from './export-dates';
import { readCsvFile } from './export-files';
import { readExportCount } from './export-requests';

/**
 * Orchestration shared by the Call and Chat export specs. It only drives the page objects (no
 * assertions about the scenario), so the specs keep what is being tested in plain sight.
 */

/** Date (yyyy-mm-dd, as the list shows it in the organisation's time zone) of the newest row. */
export async function newestRowDate(logs: ConversationLogsPage, dateColumn: string) {
  const values = await logs.columnValues(dateColumn);
  expect(values.length, 'the list has rows').toBeGreaterThan(0);
  return listDate(values[0]);
}

/** A range that ends on the newest conversation and starts `spanDays` earlier. */
export async function rangeEndingAtNewest(
  logs: ConversationLogsPage,
  dateColumn: string,
  spanDays: number,
) {
  const to = await newestRowDate(logs, dateColumn);
  return { from: shiftDate(to, -spanDays), to };
}

/** Opens the Call tab (already the default) and its Export dialog; resolves with the first count. */
export async function openCallExport(logs: ConversationLogsPage): Promise<Response> {
  const counted = logs.page.waitForResponse(isCallLogExportCountCall);
  await logs.openExport();
  await logs.exportDialog.expectOpen();
  const response = await counted;
  await expect(logs.exportDialog.exportCallsButton).toBeVisible();
  return response;
}

/** N in the "Export N calls" button. */
export async function exportButtonCount(logs: ConversationLogsPage): Promise<number> {
  const label = (await logs.exportDialog.exportCallsButton.innerText()).trim();
  const match = /^Export (\d+) calls?$/.exec(label);
  expect(match, `button label "${label}" carries a count`).not.toBeNull();
  return Number(match![1]);
}

/** Waits until the button shows `count`, then returns it (the label follows the count request). */
export async function expectButtonCount(logs: ConversationLogsPage, count: number) {
  await expect(logs.exportDialog.exportCallsButton).toHaveText(
    new RegExp(`^Export ${count} calls?$`),
  );
}

/** Reads the first Call list response (the page loads it on open) so the test can use its rows' ids. */
export function waitForCallList(logs: ConversationLogsPage) {
  return logs.page.waitForResponse(isCallLogListCall);
}

/**
 * After a count request, waits until the "Export N calls" button shows the number the request
 * returned (the label follows the response a moment later) and returns N.
 */
export async function expectButtonFollows(logs: ConversationLogsPage, response: Response) {
  const { call_count: count } = await readExportCount(response);
  await expectButtonCount(logs, count);
  return count;
}

export type CallListRow = { id: string; createdAt: string };

/**
 * Sorts the Call list by a column and returns the first row of the response (the row that is now
 * on top), read from the response so the check cannot race the table re-render.
 */
export async function sortCallListBy(
  logs: ConversationLogsPage,
  column: string,
  direction: 'ascending' | 'descending',
): Promise<CallListRow> {
  const header = logs.page.getByRole('columnheader', { name: column });
  let first: CallListRow | undefined;
  for (
    let attempt = 0;
    attempt < 2 && (await header.getAttribute('aria-sort')) !== direction;
    attempt++
  ) {
    const reloaded = logs.page.waitForResponse(isCallLogListCall);
    await header.getByRole('button').click();
    const body = (await (await reloaded).json()) as { data: CallListRow[] };
    first = body.data[0];
  }
  await expect(header).toHaveAttribute('aria-sort', direction);
  if (!first) throw new Error('The list was already sorted, so no response was captured');
  return first;
}

/** Types in the list search box and waits for the list to reload. */
export async function searchCallList(logs: ConversationLogsPage, text: string) {
  const reloaded = logs.page.waitForResponse(isCallLogListCall);
  await logs.page.getByRole('textbox', { name: /^Search/ }).fill(text);
  await reloaded;
}

/**
 * With the Call export dialog open (and the page filters already set): picks the widest range, drops
 * the optional sections and exports a single conversations CSV. Resolves with the count the dialog
 * showed for that range, the count request, the export request and the parsed rows, so a spec can
 * compare the file with the list. Nothing is left on disk.
 */
export async function exportFilteredConversations(
  logs: ConversationLogsPage,
  range: { from: string; to: string },
  timeoutMs: number,
) {
  const dialog = logs.exportDialog;
  const counted = await dialog.chooseDateRange(range.from, range.to);
  const count = await expectButtonFollows(logs, counted);
  await dialog.clearSections();
  await dialog.chooseFormat('csv');
  const { response, download } = await dialog.submit(
    dialog.exportCallsButton,
    isCallLogExportCall,
    timeoutMs,
  );
  expect(response.status()).toBe(200);
  const { rows } = await inspectDownload(download, (file) => readCsvFile(file.path));
  return { count, counted, request: response.request(), rows };
}
