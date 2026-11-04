import { showCheck } from '../../utils/show-check';
import { isCallLogExportCountCall } from '../../utils/api';
import { expect, type Download, type Locator, type Page, type Response } from '@playwright/test';

export type ExportResult = { response: Response; download: Download };

/**
 * Component for the "Export Conversation Logs" dialog. The Call tab and the Chat tab show different
 * versions of it: Calls has a date range, sections and an Excel/CSV format; Chats has From / To
 * dates and an "Export CSV" button.
 */
export class ExportConversationLogsDialogComponent {
  readonly page: Page;

  readonly dialog: Locator;
  readonly heading: Locator;
  readonly closeButton: Locator;
  readonly cancelButton: Locator;

  // Call version
  readonly callsHeading: Locator;
  readonly dateRangeButton: Locator;
  readonly journeyButton: Locator;
  readonly excelFormatButton: Locator;
  readonly exportCallsButton: Locator;
  readonly nothingToExportButton: Locator;
  readonly csvFormatButton: Locator;
  readonly rangeApplyButton: Locator;
  readonly rangeCancelButton: Locator;
  readonly filtersSummary: Locator;
  readonly testCallsSwitch: Locator;
  readonly testCallsCount: Locator;
  readonly sectionsToggleAllButton: Locator;
  readonly filenameHint: Locator;
  readonly formatsHint: Locator;

  // Chat version
  readonly fromInput: Locator;
  readonly toInput: Locator;
  readonly exportCsvButton: Locator;
  readonly chatJourneyButton: Locator;
  readonly fromLabel: Locator;
  readonly toLabel: Locator;

  /** `name` is the dialog title and `callsHeading` the sub-heading of the Call version (test-data). */
  constructor(page: Page, name: string, callsHeading: string) {
    this.page = page;

    this.dialog = page.getByRole('dialog', { name, exact: true });
    this.heading = this.dialog.getByRole('heading', { level: 2, name, exact: true });
    this.closeButton = this.dialog.getByRole('button', { name: 'Close', exact: true });
    this.cancelButton = this.dialog.getByRole('button', { name: 'Cancel', exact: true });

    this.callsHeading = this.dialog.getByRole('heading', { level: 3, name: callsHeading });
    this.dateRangeButton = this.dialog.getByRole('button', { name: /^Date range/ });
    this.journeyButton = this.dialog.getByRole('button', { name: 'All journeys', exact: true });
    this.excelFormatButton = this.dialog.getByRole('button', { name: 'Excel', exact: true });
    // The label carries the number of calls, e.g. "Export 221 calls".
    this.exportCallsButton = this.dialog.getByRole('button', { name: /^Export \d+ calls?$/ });

    this.nothingToExportButton = this.dialog.getByRole('button', {
      name: 'Nothing to export',
      exact: true,
    });
    this.csvFormatButton = this.dialog.getByRole('button', { name: 'CSV', exact: true });
    this.rangeApplyButton = this.dialog.getByRole('button', { name: 'Apply', exact: true });
    // While the date popover is open there are two "Cancel" buttons; the popover's comes first.
    this.rangeCancelButton = this.dialog
      .getByRole('button', { name: 'Cancel', exact: true })
      .first();
    // The label and its value are sibling spans, so the parent holds "Filters from this page None".
    this.filtersSummary = this.dialog
      .getByText('Filters from this page', { exact: true })
      .locator('..');
    this.testCallsSwitch = this.dialog.getByRole('switch', {
      name: 'Include test calls',
      exact: true,
    });
    this.testCallsCount = this.dialog.getByText(/ in this range$/);
    // One button: "Clear all" while every section is on, "Select all" otherwise.
    this.sectionsToggleAllButton = this.dialog.getByRole('button', {
      name: /^(Clear|Select) all$/,
    });
    this.filenameHint = this.dialog.getByText(/^conversation_log_\d{8}_to_\d{8}\.(xlsx|zip)$/);
    this.formatsHint = this.dialog.getByText(/^(Sheets: |\d+ CSV files: )/);

    this.fromInput = this.dialog.getByRole('textbox', { name: 'From' });
    this.toInput = this.dialog.getByRole('textbox', { name: 'To' });
    this.exportCsvButton = this.dialog.getByRole('button', { name: 'Export CSV', exact: true });
    // The required star is a sibling span of the label, so the parent reads "From*".
    this.fromLabel = this.dialog.getByText('From', { exact: true }).locator('..');
    this.toLabel = this.dialog.getByText('To', { exact: true }).locator('..');
    this.chatJourneyButton = this.dialog.getByRole('button', { name: /^Journey / });
  }

  /** Date inputs are native, so they take yyyy-mm-dd. */
  async fillDates(from: string, to: string) {
    await this.fromInput.fill(from);
    await this.toInput.fill(to);
  }

  filenamePreview(pattern: string) {
    return this.dialog.getByText(new RegExp(pattern.replace(/^\^/, '').replace(/\$$/, '')));
  }

  /**
   * Clicks an export button and waits for both the export request and the browser download,
   * both started before the click. The server builds the file before answering, so `timeout`
   * has to be long for big date ranges.
   */
  async submit(button: Locator, isExportCall: (r: Response) => boolean, timeout: number) {
    const response = this.page.waitForResponse(isExportCall, { timeout });
    const download = this.page.waitForEvent('download', { timeout });
    await button.click();
    const result: ExportResult = { response: await response, download: await download };
    return result;
  }

  // ---- Call version ----

  /** The count request made whenever the range, journey, test-call switch or a section changes. */
  private waitForCount() {
    return this.page.waitForResponse(isCallLogExportCountCall);
  }

  /** The range is chosen in a popover with native date inputs; resolves with the count it triggers. */
  async chooseDateRange(from: string, to: string): Promise<Response> {
    await this.dateRangeButton.click();
    await this.fillDates(from, to);
    const counted = this.waitForCount();
    await this.rangeApplyButton.click();
    return counted;
  }

  /** Types a range into the popover without applying it (for validation checks). */
  async typeDateRange(from: string, to: string) {
    await this.dateRangeButton.click();
    await this.fillDates(from, to);
  }

  /** Picks one journey from the Call dialog's multi-select menu; resolves with the count it triggers. */
  async chooseCallJourney(name: string): Promise<Response> {
    await this.journeyButton.click();
    const counted = this.waitForCount();
    await this.page.getByRole('menuitemcheckbox', { name, exact: true }).click();
    const response = await counted;
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('menuitemcheckbox', { name, exact: true })).toBeHidden();
    return response;
  }

  journeyButtonNamed(name: string) {
    return this.dialog.getByRole('button', { name, exact: true });
  }

  sectionSwitch(name: string) {
    return this.dialog.getByRole('switch', { name, exact: true });
  }

  /* eslint-disable playwright/no-force-option -- the real switch input is covered by its styled control (LOC-02: no test id yet) */
  /**
   * Turns a section switch on or off and resolves with the count request it triggers. The real input
   * is covered by the styled switch, so the click is forced (the same way a user clicks the control).
   */
  async setSection(name: string, on: boolean): Promise<Response> {
    const counted = this.waitForCount();
    if (on) await this.sectionSwitch(name).check({ force: true });
    else await this.sectionSwitch(name).uncheck({ force: true });
    return counted;
  }

  async setIncludeTestCalls(on: boolean): Promise<Response> {
    const counted = this.waitForCount();
    if (on) await this.testCallsSwitch.check({ force: true });
    else await this.testCallsSwitch.uncheck({ force: true });
    return counted;
  }

  /* eslint-enable playwright/no-force-option */

  /** Clicks "Clear all" / "Select all" in the Include section; resolves with the count it triggers. */
  async toggleAllSections(): Promise<Response> {
    const counted = this.waitForCount();
    await this.sectionsToggleAllButton.click();
    return counted;
  }

  /**
   * Makes sure every optional section is off, whatever the dialog starts with (it may keep the
   * choice from an earlier export). With only "Call details" left, a CSV export is one plain .csv file.
   */
  async clearSections() {
    if ((await this.sectionsToggleAllButton.innerText()).trim() === 'Clear all') {
      await this.toggleAllSections();
    }
    for (const name of ['Summary', 'Sentiment', 'Rating', 'Insights', 'Transcript', 'Callbacks']) {
      await expect(this.sectionSwitch(name)).not.toBeChecked();
    }
  }

  /** Makes sure every optional section is on (the dialog may keep an earlier choice). */
  async selectAllSections() {
    if ((await this.sectionsToggleAllButton.innerText()).trim() === 'Select all') {
      await this.toggleAllSections();
    }
    await expect(this.sectionsToggleAllButton).toHaveText('Clear all');
  }

  async chooseFormat(format: 'excel' | 'csv') {
    const button = format === 'excel' ? this.excelFormatButton : this.csvFormatButton;
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }

  // ---- Chat version ----

  /** Opens the nested journey picker of the Chat dialog and returns the names of its items. */
  async openChatJourneyMenu() {
    await this.chatJourneyButton.click();
    return this.page.getByRole('menu');
  }

  async chooseChatJourney(name: string) {
    const menu = await this.openChatJourneyMenu();
    await menu.getByRole('menuitem', { name, exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(this.chatJourneyButton).toHaveText(name);
  }

  async expectOpen() {
    await expect(this.dialog).toBeVisible();
    await expect(this.heading).toBeVisible();
    await showCheck(this.heading);
  }

  async expectClosed() {
    await expect(this.dialog).toBeHidden();
  }
}
