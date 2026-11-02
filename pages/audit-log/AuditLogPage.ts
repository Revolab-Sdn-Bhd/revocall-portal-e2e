import { expect, type Locator, type Page } from '@playwright/test';
import { showCheck } from '../../utils/show-check';
import { isAuditLogListCall } from '../../utils/api';

type AuditEvent = { occurredAt: string; verb: string; actorDisplayName: string };

/**
 * Page Object for the Audit Log screen (/dashboard/audit-log).
 * Filters live in the URL (?actor=[...]&action=[...]), so a reload keeps them.
 * The list is returned newest first, but callers should not rely on that.
 */
export class AuditLogPage {
  readonly page: Page;

  readonly pageHeading: Locator;
  readonly actorFilter: Locator;
  readonly actionFilter: Locator;
  readonly dataRows: Locator;

  constructor(page: Page) {
    this.page = page;

    this.pageHeading = page.getByRole('heading', { level: 1, name: 'Audit Log', exact: true });
    // The trigger shows "Any actor" until a value is chosen, then the chosen name.
    // The search box and the other filters have other names, so these are unique by their placeholder text.
    this.actorFilter = page.getByRole('button', { name: /^Any actor$/ });
    this.actionFilter = page.getByRole('button', { name: /^Any action$/ });
    // Header row has columnheaders only, so rows that have cells are the events.
    this.dataRows = page.getByRole('row').filter({ has: page.getByRole('cell') });
  }

  /** Picks one value in a multi-select filter and waits for the list to reload with it. */
  private async chooseFilterValue(trigger: Locator, value: string) {
    await trigger.click();
    const reloaded = this.page.waitForResponse(isAuditLogListCall);
    await this.page.getByRole('menuitemcheckbox', { name: value, exact: true }).click();
    await reloaded;
    // Closes the menu; the filter stays applied.
    await this.page.keyboard.press('Escape');
  }

  async filterByActor(displayName: string) {
    await this.chooseFilterValue(this.actorFilter, displayName);
    await expect(this.page.getByRole('button', { name: displayName, exact: true })).toBeVisible();
  }

  async filterByAction(filterLabel: string) {
    await this.chooseFilterValue(this.actionFilter, filterLabel);
    await expect(this.page.getByRole('button', { name: filterLabel, exact: true })).toBeVisible();
  }

  /**
   * Reloads the page (filters stay in the URL) and returns the newest time, in ms, among the events
   * the server returned for the current filters, or 0 when there are none.
   * Built for expect.poll: the audit entry is written by the server a moment after the action.
   */
  async reloadAndGetLatestEventTime(verb: string): Promise<number> {
    const listResponse = this.page.waitForResponse(isAuditLogListCall);
    await this.page.reload();
    const { events = [] } = (await (await listResponse).json()) as { events?: AuditEvent[] };
    const times = events.filter((e) => e.verb === verb).map((e) => Date.parse(e.occurredAt));
    return times.length ? Math.max(...times) : 0;
  }

  async expectLoaded() {
    await expect(this.pageHeading).toBeVisible();
    await showCheck(this.pageHeading);
  }

  /** Checks the newest row of the (filtered) list shows the given actor, event and result. */
  async expectLatestRow(row: { actor: string; event: string; result: string }) {
    const latest = this.dataRows.first();
    await expect(latest).toBeVisible();
    await expect(latest).toContainText(row.actor);
    await expect(latest).toContainText(row.event);
    await expect(latest).toContainText(row.result);
    await showCheck(latest);
  }
}
