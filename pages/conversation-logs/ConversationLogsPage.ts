import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { showCheck } from '../../utils/show-check';
import { isCallLogListCall, isChatLogListCall, listRequestOf } from '../../utils/api';
import { ConversationDetailsDialogComponent } from '../components/ConversationDetailsDialogComponent';
import { ExportConversationLogsDialogComponent } from '../components/ExportConversationLogsDialogComponent';

export type LogTab = 'call' | 'chat';
export type FilterName = 'journey' | 'disposition' | 'outcome' | 'widget' | 'conversation';
export type SortState = 'ascending' | 'descending' | 'none';

/** What one list request returned: the total count, the rows (with their ids) and the filters the UI sent. */
export type ListResult = {
  total: number;
  request: Record<string, unknown>;
  data: Array<Record<string, unknown> & { id: string }>;
};

/** The footer ("Showing 21–40 of 333") and the pager ("Page 2 of 17") read together. */
export type PagerState = { from: number; to: number; total: number; page: number; pages: number };

export type ConversationLogsNames = {
  path: string;
  heading: string;
  callDetailsName: string;
  chatDetailsName: string;
  exportDialogName: string;
  exportCallsHeading: string;
};

const TAB_LABEL: Record<LogTab, string> = { call: 'Call', chat: 'Chat' };
const isListCall: Record<LogTab, (response: Response) => boolean> = {
  call: isCallLogListCall,
  chat: isChatLogListCall,
};

/**
 * A filter button reads `idle` until a value is chosen, then `active` plus the number of chosen
 * values (e.g. "Journeys 1"), not the chosen value itself.
 */
const FILTER_LABELS: Record<FilterName, { idle: string; active: string }> = {
  journey: { idle: 'All journeys', active: 'Journeys' },
  disposition: { idle: 'All dispositions', active: 'Call Dispositions' },
  outcome: { idle: 'All outcomes', active: 'Agent Outcomes' },
  widget: { idle: 'All widgets', active: 'Widgets' },
  conversation: { idle: 'All conversations', active: 'Callbacks' },
};

/**
 * Page Object for Conversation Logs (/dashboard/conversation-logs): the Call and Chat tabs, their
 * lists, filters and pager. The detail panels and the export dialog are components of this page.
 * Only the disposition filter is kept in the URL; the other filters are not.
 *
 * TODO(dev ask, LOC-02): the page has no data-testid. Wanted: on table rows, on the
 * "Showing x-y of z" and "Page x of y" texts, and an aria-label on the "Show test calls" switch.
 */
export class ConversationLogsPage {
  readonly page: Page;
  private readonly names: ConversationLogsNames;

  readonly pageHeading: Locator;
  readonly callTab: Locator;
  readonly chatTab: Locator;
  readonly exportButton: Locator;
  readonly columnHeaders: Locator;
  readonly dataRows: Locator;
  readonly footerText: Locator;
  readonly pageIndicator: Locator;
  readonly nextPageButton: Locator;
  readonly previousPageButton: Locator;
  readonly searchBox: Locator;
  readonly clearSearchButton: Locator;
  readonly clearAllButton: Locator;
  readonly emptyHint: Locator;
  /** Checkbox items of the open filter menu (e.g. the Journey options). */
  readonly menuOptions: Locator;
  readonly table: Locator;
  /** The element around the table that scrolls sideways on a narrow screen. */
  readonly tableContainer: Locator;
  /** The "Show test calls" switch. TODO(dev ask, LOC-02): it has no accessible name, so it is found by role only. */
  readonly showTestCallsSwitch: Locator;

  readonly callDetails: ConversationDetailsDialogComponent;
  readonly chatDetails: ConversationDetailsDialogComponent;
  readonly exportDialog: ExportConversationLogsDialogComponent;

  /** Tab the page is on, so list requests are matched to the right service. */
  private tab: LogTab = 'call';
  private latest: ListResult | undefined;

  constructor(page: Page, names: ConversationLogsNames) {
    this.page = page;
    this.names = names;

    this.pageHeading = page.getByRole('heading', { level: 1, name: names.heading, exact: true });
    this.callTab = page.getByRole('tab', { name: TAB_LABEL.call, exact: true });
    this.chatTab = page.getByRole('tab', { name: TAB_LABEL.chat, exact: true });
    // Exact, so it is never confused with "Export 12 calls" or "Export CSV" in the dialog.
    this.exportButton = page.getByRole('button', { name: 'Export', exact: true });
    this.columnHeaders = page.getByRole('columnheader');
    // The header row has columnheaders only, so rows that have cells are the data rows.
    this.dataRows = page.getByRole('row').filter({ has: page.getByRole('cell') });
    this.footerText = page.getByText(/^Showing \d+[–-]\d+ of \d+$/);
    this.pageIndicator = page.getByText(/^Page \d+ of \d+$/);
    this.nextPageButton = page.getByRole('button', { name: 'Next page', exact: true });
    this.previousPageButton = page.getByRole('button', { name: 'Previous page', exact: true });
    this.searchBox = page.getByRole('textbox', { name: /^Search/ });
    this.clearSearchButton = page.getByRole('button', { name: 'Clear search', exact: true });
    this.clearAllButton = page.getByRole('button', { name: 'Clear all', exact: true });
    this.emptyHint = page.getByText('Try a different search term or filter.', { exact: true });
    this.menuOptions = page.getByRole('menuitemcheckbox');
    this.showTestCallsSwitch = page.getByRole('switch');
    this.table = page.getByRole('table');
    // CSS parent: the scroll container has no role or name.
    this.tableContainer = this.table.locator('..');

    this.callDetails = new ConversationDetailsDialogComponent(page, names.callDetailsName);
    this.chatDetails = new ConversationDetailsDialogComponent(page, names.chatDetailsName);
    this.exportDialog = new ExportConversationLogsDialogComponent(
      page,
      names.exportDialogName,
      names.exportCallsHeading,
    );
  }

  /** Opens the page directly (Call tab is the default) and waits for the first list. */
  async goto() {
    const listLoaded = this.page.waitForResponse(isListCall.call);
    // The list response below proves the page is ready, so there is no need to wait for the load event
    // (slow third-party assets on a slow staging).
    await this.page.goto(this.names.path, { waitUntil: 'domcontentloaded' });
    this.latest = await this.readListResponse(await listLoaded);
    this.tab = 'call';
    await this.expectListLoaded();
  }

  async selectTab(tab: LogTab) {
    const trigger = tab === 'call' ? this.callTab : this.chatTab;
    if (this.tab !== tab) {
      const listLoaded = this.page.waitForResponse(isListCall[tab]);
      await trigger.click();
      this.latest = await this.readListResponse(await listLoaded);
      this.tab = tab;
    }
    await expect(trigger).toHaveAttribute('aria-selected', 'true');
    await this.expectListLoaded();
  }

  /** Heading, at least one row with its "#" filled in (chat rows are empty while loading), and the footer. */
  async expectListLoaded() {
    await expect(this.pageHeading).toBeVisible();
    await expect(this.dataRows.first().getByRole('cell').first()).toHaveText(/^\d+$/);
    await expect(this.footerText).toBeVisible();
    await showCheck(this.footerText);
  }

  async expectColumns(names: string[]) {
    await expect(this.columnHeaders).toHaveText(names);
    await showCheck(this.columnHeaders.first());
  }

  /** Text of every cell in the named column, one entry per data row. */
  async columnValues(columnName: string): Promise<string[]> {
    const headers = (await this.columnHeaders.allInnerTexts()).map((text) => text.trim());
    const index = headers.indexOf(columnName);
    expect(index, `column "${columnName}" exists`).toBeGreaterThanOrEqual(0);
    // One read of all cells, then split by row, so a list that re-renders mid-way cannot be half read.
    const cells = (await this.dataRows.getByRole('cell').allInnerTexts()).map((t) => t.trim());
    const values: string[] = [];
    for (let i = index; i < cells.length; i += headers.length) values.push(cells[i]);
    return values;
  }

  /** Cell texts of one data row, in column order. */
  async rowValues(rowIndex: number): Promise<string[]> {
    const cells = await this.dataRows.nth(rowIndex).getByRole('cell').allInnerTexts();
    return cells.map((text) => text.trim());
  }

  /** Total number of conversations from the footer ("Showing 1–20 of 333" gives 333). */
  async getTotal(): Promise<number> {
    const text = (await this.footerText.textContent()) ?? '';
    const match = /of (\d+)$/.exec(text.trim());
    expect(match, `footer text "${text}" has a total`).not.toBeNull();
    return Number(match![1]);
  }

  /** Waits until the footer shows `total`, so the UI has rendered the list a response returned. */
  async expectTotal(total: number) {
    // With no rows the footer is replaced by the empty state.
    if (total === 0) {
      await expect(this.emptyTitle()).toBeVisible();
      return;
    }
    await expect(this.footerText).toHaveText(new RegExp(`of ${total}$`));
  }

  /** Waits for a list call to finish and reads its total and the filters it carried. */
  private async readListResponse(response: Response): Promise<ListResult> {
    expect(response.ok(), 'list call status').toBe(true);
    const body = (await response.json()) as { totalSize?: number | string; data?: unknown[] };
    const message = new URL(response.url()).searchParams.get('message');
    expect(message, 'the list call carries its filters in the message parameter').toBeTruthy();
    this.latest = {
      total: Number(body.totalSize ?? 0),
      request: JSON.parse(message!) as Record<string, unknown>,
      data: ((body as { data?: ListResult['data'] }).data ?? []) as ListResult['data'],
    };
    return this.latest;
  }

  filterButton(filter: FilterName) {
    return this.page.getByRole('button', { name: FILTER_LABELS[filter].idle, exact: true });
  }

  /** The filter button once `count` values are chosen, e.g. "Journeys 1". */
  activeFilterButton(filter: FilterName, count: number) {
    return this.page.getByRole('button', {
      name: `${FILTER_LABELS[filter].active} ${count}`,
      exact: true,
    });
  }

  /** A value in the open filter menu. Only one menu is open at a time, so the name is unique. */
  filterMenuItem(value: string) {
    return this.page.getByRole('menuitemcheckbox', { name: value, exact: true });
  }

  /**
   * Opens a filter menu (from its idle or active button) and ticks each value in the same open
   * menu, waiting for the list to reload after every tick (WAIT-03). Returns one result per value.
   */
  async selectFilterValues(
    filter: FilterName,
    values: string[],
    alreadyChosen = 0,
  ): Promise<ListResult[]> {
    const trigger =
      alreadyChosen === 0
        ? this.filterButton(filter)
        : this.activeFilterButton(filter, alreadyChosen);
    await trigger.click();

    const results: ListResult[] = [];
    for (const value of values) {
      const item = this.filterMenuItem(value);
      await expect(item).toBeVisible();
      const reloaded = this.page.waitForResponse(isListCall[this.tab]);
      await item.click();
      results.push(await this.readListResponse(await reloaded));
      await expect(item).toBeChecked();
    }

    // Closes the menu; the filters stay applied.
    await this.page.keyboard.press('Escape');
    await expect(this.filterMenuItem(values[0])).toBeHidden();
    await expect(this.activeFilterButton(filter, alreadyChosen + values.length)).toBeVisible();
    await this.expectTotal(results[results.length - 1].total);
    return results;
  }

  /** Re-opens a filter menu and checks which of `values` are ticked, then closes it. */
  async expectFilterValuesChecked(filter: FilterName, count: number, values: string[]) {
    await this.activeFilterButton(filter, count).click();
    for (const value of values) {
      await expect(this.filterMenuItem(value)).toBeChecked();
    }
    await this.page.keyboard.press('Escape');
    await expect(this.filterMenuItem(values[0])).toBeHidden();
  }

  /**
   * Checks every row of the current list has a value in the named column that is in `allowed` (or
   * matches the pattern), and there is at least one row. Polls because the rows are replaced a
   * moment after the list response.
   */
  async expectEveryRowMatches(columnName: string, allowed: string[] | RegExp) {
    const matches = (value: string) =>
      Array.isArray(allowed) ? allowed.includes(value) : allowed.test(value);
    await expect
      .poll(async () => (await this.columnValues(columnName)).length, {
        message: 'the list has at least one row',
      })
      .toBeGreaterThan(0);
    await expect
      .poll(async () => (await this.columnValues(columnName)).filter((v) => !matches(v)), {
        message: `rows whose "${columnName}" does not match ${allowed}`,
      })
      .toEqual([]);
    await showCheck(this.dataRows.first());
  }

  /**
   * Unticks one value of a filter that has `chosen` values ticked, and waits for the list to reload.
   * Returns the reloaded list.
   */
  async deselectFilterValue(
    filter: FilterName,
    value: string,
    chosen: number,
  ): Promise<ListResult> {
    await this.activeFilterButton(filter, chosen).click();
    const item = this.filterMenuItem(value);
    await expect(item).toBeChecked();
    const reloaded = this.page.waitForResponse(isListCall[this.tab]);
    await item.click();
    const result = await this.readListResponse(await reloaded);
    await expect(item).not.toBeChecked();
    await this.page.keyboard.press('Escape');
    await expect(item).toBeHidden();
    await this.expectTotal(result.total);
    return result;
  }

  /** Clicks the first row and returns its cell texts (for comparing with the opened panel). */
  async openFirstRow(): Promise<string[]> {
    const values = await this.rowValues(0);
    await this.dataRows.first().click();
    return values;
  }

  async openExport() {
    await this.exportButton.click();
  }

  /** Opens the page at `/dashboard/conversation-logs<query>` (e.g. "?tab=chat") and waits for the list of `tab`. */
  async gotoWithQuery(query: string, tab: LogTab) {
    const listLoaded = this.page.waitForResponse(isListCall[tab]);
    await this.page.goto(`${this.names.path}${query}`, { waitUntil: 'domcontentloaded' });
    this.latest = await this.readListResponse(await listLoaded);
    this.tab = tab;
  }

  /** Reloads the page and waits for the list; the filters that are not kept in the URL go back to idle. */
  async reload() {
    const listLoaded = this.page.waitForResponse(isListCall[this.tab]);
    await this.page.reload();
    this.latest = await this.readListResponse(await listLoaded);
  }

  /** The newest list call this page object saw (open, tab switch, reload, filter, search, paging, sort). */
  get latestList(): ListResult {
    expect(this.latest, 'a list has been loaded').toBeDefined();
    return this.latest!;
  }

  /** The tab the page object believes is open, for callers that need the matching list endpoint. */
  get currentTab(): LogTab {
    return this.tab;
  }

  /**
   * Runs `action` and returns the list call it triggers (started waiting before the action, WAIT-03).
   * `accept` picks the call by what it carried, e.g. a search term, when other calls may fire too.
   */
  async captureList(
    action: () => Promise<unknown>,
    accept: (request: Record<string, unknown>) => boolean = () => true,
    timeout?: number,
  ): Promise<ListResult> {
    const loaded = this.page.waitForResponse(
      (response) => isListCall[this.tab](response) && accept(listRequestOf(response)),
      { timeout },
    );
    await action();
    this.latest = await this.readListResponse(await loaded);
    return this.latest;
  }

  /** Waits for the list to show the response `result` (total in the footer, first row from this page). */
  async expectListShows(result: ListResult) {
    if (result.total === 0) {
      await expect(this.emptyTitle()).toBeVisible();
      return;
    }
    await this.expectTotal(result.total);
    const skip = Number(result.request.skip ?? 0);
    await expect(this.footerText).toHaveText(new RegExp(`^Showing ${skip + 1}[–-]`));
    // The rows are replaced a moment after the footer, so wait until they are the ones of this response.
    if (result.data.every((row) => typeof row.journeyName === 'string' && row.journeyName)) {
      await expect
        .poll(() => this.columnValues('Journey name'), { message: 'rows are the ones just loaded' })
        .toEqual(result.data.map((row) => String(row.journeyName)));
    }
  }

  /** "No calls match your filters" / "No chats match your filters" for the open tab. */
  emptyTitle() {
    return this.page.getByText(
      this.tab === 'call' ? /^No calls match your/ : /^No chats match your/,
    );
  }

  /** An empty-state text from the test data (exact by default); `message` is the title or the hint line. */
  emptyMessage(message: string, options: { exact?: boolean } = { exact: true }) {
    return this.page.getByText(message, options);
  }

  async expectEmptyState() {
    await expect(this.emptyTitle()).toBeVisible();
    await expect(this.emptyHint).toBeVisible();
    // The empty-state message sits in a table row of its own, so it is left out of the count.
    await expect(this.dataRows.filter({ hasNot: this.emptyTitle() })).toHaveCount(0);
    await expect(this.footerText).toBeHidden();
    await expect(this.pageIndicator).toBeHidden();
    await showCheck(this.emptyTitle());
  }

  /**
   * Types in the search box and returns the list call that carries the (trimmed) term. A full
   * conversation ID is not sent as `search`: the Call tab sends it as `callId` and the Chat tab as `sessionId`.
   */
  async search(term: string): Promise<ListResult> {
    const wanted = term.trim();
    const result = await this.captureList(
      () => this.searchBox.fill(term),
      (request) =>
        (typeof request.search === 'string' && request.search.trim() === wanted) ||
        request.callId === wanted ||
        request.sessionId === wanted,
    );
    await this.expectListShows(result);
    return result;
  }

  /** Clicks "Clear search" and returns the list call without a search term. */
  async clearSearch(): Promise<ListResult> {
    const result = await this.captureList(
      () => this.clearSearchButton.click(),
      (request) => !request.search,
    );
    await expect(this.searchBox).toHaveValue('');
    await this.expectListShows(result);
    return result;
  }

  /** Clicks "Clear all" and returns the list call that follows. */
  async clearAll(): Promise<ListResult> {
    const result = await this.captureList(() => this.clearAllButton.click());
    await expect(this.clearAllButton).toBeHidden();
    await this.expectListShows(result);
    return result;
  }

  /** Turns "Show test calls" on or off and returns the list call that follows. */
  async setShowTestCalls(on: boolean): Promise<ListResult> {
    const result = await this.captureList(() =>
      // The real input is visually hidden under the switch control, hence force.
      // eslint-disable-next-line playwright/no-force-option -- the switch input is covered by its visible control
      this.showTestCallsSwitch.setChecked(on, { force: true }),
    );
    await this.expectListShows(result);
    return result;
  }

  /** Footer and pager read as numbers. Wait for the list first (expectListLoaded). */
  async pagerState(): Promise<PagerState> {
    const footer = ((await this.footerText.textContent()) ?? '').trim();
    // Local alias: the lint rule mistakes a property named page* for the Page object.
    const indicator = this.pageIndicator;
    const pager = (await indicator.innerText()).trim();
    const f = /^Showing (\d+)[–-](\d+) of (\d+)$/.exec(footer);
    const p = /^Page (\d+) of (\d+)$/.exec(pager);
    expect(f, `footer "${footer}" is "Showing x–y of z"`).not.toBeNull();
    expect(p, `pager "${pager}" is "Page n of p"`).not.toBeNull();
    return {
      from: Number(f![1]),
      to: Number(f![2]),
      total: Number(f![3]),
      page: Number(p![1]),
      pages: Number(p![2]),
    };
  }

  /**
   * Goes to the next page. Within about 300 ms of the page opening, the page can jump back to page 1
   * after a "Next page" click (observed on staging, likely bug, see the report). So the click is
   * repeated until the footer shows the next page: a retry on state, not a fixed wait.
   */
  async nextPage(): Promise<ListResult> {
    let result: ListResult | undefined;
    await expect(async () => {
      const { page } = await this.pagerState();
      const size = Number(this.latestList.request.limit);
      result = await this.captureList(() => this.nextPageButton.click(), undefined, 5_000);
      await expect(this.footerText).toHaveText(new RegExp(`^Showing ${page * size + 1}[–-]`), {
        timeout: 3_000,
      });
    }).toPass({ timeout: 20_000 });
    await this.expectListShows(result!);
    return result!;
  }

  async previousPage(): Promise<ListResult> {
    const result = await this.captureList(() => this.previousPageButton.click());
    await this.expectListShows(result);
    return result;
  }

  /** Clicks "Next page" until it is disabled; returns the list call of the last page (needs 2+ pages). */
  async goToLastPage(): Promise<ListResult> {
    const { page, pages } = await this.pagerState();
    expect(pages, 'the list has more than one page').toBeGreaterThan(1);
    for (let current = page; current < pages; current++) await this.nextPage();
    await expect(this.nextPageButton).toBeDisabled();
    return this.latestList;
  }

  columnHeader(name: string) {
    return this.page.getByRole('columnheader', { name, exact: true });
  }

  /** The sort button inside a sortable column header; headers that cannot be sorted have none. */
  sortButton(name: string) {
    return this.columnHeader(name).getByRole('button');
  }

  /** Clicks a sortable header and returns the list call it triggers. */
  async sortBy(name: string): Promise<ListResult> {
    const result = await this.captureList(() => this.sortButton(name).click());
    await this.expectListShows(result);
    return result;
  }

  async expectSortState(name: string, state: SortState) {
    await expect(this.columnHeader(name)).toHaveAttribute('aria-sort', state);
  }

  /**
   * Clicks the row at `rowIndex` and returns its cell texts. Pass the details panel to wait for it to
   * open: a row clicked again within a moment of closing its panel is ignored by the page (observed
   * on staging), so the click is repeated until the panel is there (a retry on state, not a fixed wait).
   */
  async openRow(
    rowIndex: number,
    panel?: Pick<ConversationDetailsDialogComponent, 'dialog'>,
  ): Promise<string[]> {
    const values = await this.rowValues(rowIndex);
    if (!panel) {
      await this.dataRows.nth(rowIndex).click();
      return values;
    }
    await expect(async () => {
      if (!(await panel.dialog.isVisible())) {
        await this.dataRows.nth(rowIndex).click({ timeout: 2_000 });
      }
      await expect(panel.dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    return values;
  }

  /**
   * One entry per data row for the named column: the cell text and the class of the status chip in
   * it (null when the cell has no chip, e.g. the "—" placeholder). Chips have no role or name, so
   * they are read from the DOM (data-slot="chip", the design system's own marker).
   */
  async cellChips(columnName: string): Promise<Array<{ text: string; chipClass: string | null }>> {
    const headers = (await this.columnHeaders.allInnerTexts()).map((text) => text.trim());
    const index = headers.indexOf(columnName);
    expect(index, `column "${columnName}" exists`).toBeGreaterThanOrEqual(0);
    return this.dataRows.evaluateAll(
      (rows, columnIndex) =>
        rows.map((row) => {
          const cell = row.children[columnIndex];
          const chip = cell.querySelector('[data-slot="chip"]');
          return { text: (cell.textContent ?? '').trim(), chipClass: chip ? chip.className : null };
        }),
      index,
    );
  }

  /**
   * Opens a filter menu and returns its option names and which are ticked, then closes it. Waits
   * for the menu to be gone so the next menu does not show items of this one.
   */
  async readFilterOptions(
    filter: FilterName,
    alreadyChosen = 0,
  ): Promise<{ names: string[]; checked: string[] }> {
    const trigger =
      alreadyChosen === 0
        ? this.filterButton(filter)
        : this.activeFilterButton(filter, alreadyChosen);
    await trigger.click();
    const menu = this.page.getByRole('menu');
    const items = menu.getByRole('menuitemcheckbox');
    await expect(items.first()).toBeVisible();
    const names = (await items.allInnerTexts()).map((text) => text.trim());
    const checked = (
      await menu.getByRole('menuitemcheckbox', { checked: true }).allInnerTexts()
    ).map((text) => text.trim());
    await this.page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    return { names, checked };
  }
}
