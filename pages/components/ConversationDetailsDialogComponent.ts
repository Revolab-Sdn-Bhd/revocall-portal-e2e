import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { showCheck } from '../../utils/show-check';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Component for the "Call details" / "Chat details" side panel opened by clicking a row of the
 * Conversation Logs list. `name` is the panel title ("Call details" or "Chat details").
 */
export class ConversationDetailsDialogComponent {
  readonly page: Page;

  readonly dialog: Locator;
  readonly heading: Locator;
  readonly closeButton: Locator;
  readonly tabs: Locator;
  readonly selectedTab: Locator;
  readonly summaryExplanation: Locator;
  /** Dark layer behind the side panel. CSS because the layer has no role or name (LOC-02: ask devs for a test id). */
  readonly backdrop: Locator;
  readonly seekSlider: Locator;
  readonly downloadRecordingLink: Locator;

  constructor(page: Page, name: string) {
    this.page = page;

    this.dialog = page.getByRole('dialog', { name, exact: true });
    this.heading = this.dialog.getByRole('heading', { level: 2, name, exact: true });
    this.closeButton = this.dialog.getByRole('button', { name: 'Close', exact: true });
    this.tabs = this.dialog.getByRole('tab');
    this.selectedTab = this.dialog.getByRole('tab', { selected: true });
    // The Summary panel shows the summary text, then an "Explanation" label and its text.
    this.summaryExplanation = this.dialog.getByText('Explanation', { exact: true });
    // CSS: the drawer backdrop has no role or name.
    this.backdrop = page.locator('[data-slot="drawer-backdrop"]');
    this.seekSlider = this.dialog.getByRole('slider', { name: 'Seek', exact: true });
    this.downloadRecordingLink = this.dialog.getByRole('link', {
      name: 'Download recording',
      exact: true,
    });
  }

  /**
   * The Conversation ID is plain text under the heading, with no role or label.
   * TODO(dev ask): add data-testid="conversation-id" to it, then use getByTestId here (LOC-02).
   */
  conversationId(pattern: string) {
    return this.dialog.getByText(new RegExp(pattern));
  }

  async expectOpen() {
    await expect(this.dialog).toBeVisible();
    await expect(this.heading).toBeVisible();
    await showCheck(this.heading);
  }

  async expectClosed() {
    await expect(this.dialog).toBeHidden();
  }

  async close() {
    await this.closeButton.click();
  }

  /**
   * Checks one Metadata line, e.g. ("Agent outcome", "Resolved"). The label and the value are
   * separate elements without roles, so the line is matched on the dialog text.
   * TODO(dev ask): data-testid on each metadata row (LOC-02).
   */
  async expectMetadata(label: string, value: string) {
    await expect(this.dialog).toContainText(
      new RegExp(`${escapeRegExp(label)}:\\s*${escapeRegExp(value)}`),
    );
  }

  /** Tab names in order must start with `names` (the app has more tabs than the PRD lists). */
  async expectFirstTabs(names: string[]) {
    for (const [index, name] of names.entries()) {
      await expect(this.tabs.nth(index)).toHaveText(name);
    }
  }

  /** Header ID (UUID) as text. */
  async readConversationId(pattern: string): Promise<string> {
    const text = await this.conversationId(pattern).textContent();
    return (text ?? '').trim();
  }

  tab(name: string) {
    return this.dialog.getByRole('tab', { name, exact: true });
  }

  /**
   * Clicks a tab and waits for it to be selected. `loaded` is the request the tab makes (start
   * waiting before the click, WAIT-03); pass nothing for tabs whose data is already on screen.
   */
  async openTab(name: string, loaded?: (response: Response) => boolean) {
    const response = loaded ? this.page.waitForResponse(loaded) : undefined;
    await this.tab(name).click();
    await response;
    await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true');
  }

  /** Closes the panel by clicking the dark area next to it. */
  async closeByOutsideClick() {
    await this.backdrop.click({ position: { x: 10, y: 10 } });
  }

  /** Chips in the panel that show one of the outcome names (data-slot is the design system's chip marker; chips have no role). */
  outcomeChips(outcomes: string[]) {
    // CSS: chips have no role or name, and data-slot="chip" is the only marker the design system gives them.
    return this.dialog
      .locator('[data-slot="chip"]')
      .filter({ hasText: new RegExp(`^(${outcomes.map(escapeRegExp).join('|')})$`) });
  }
}
