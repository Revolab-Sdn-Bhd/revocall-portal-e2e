import { expect, type Locator, type Page } from '@playwright/test';
import { showCheck, showPause } from '../../utils/show-check';
import { isLogoutCall } from '../../utils/api';

export type SidebarItem = {
  label: string;
  path: string;
  /* The page's <h1> title, used to prove the right page rendered. */
  heading: string;
  /* false when this menu item is not available for the test account (feature flag / permission). */
  enabled: boolean;
  /* true when the page URL must equal `path` exactly (e.g. Overview is /dashboard). */
  exact?: boolean;
  /* Page to start from, when the default start page is this item itself. */
  startFrom?: string;
};

/**
 * Page Object for the RevoCall Admin dashboard shell (the page shown after a successful login).
 * Every dashboard page shares the same left sidebar with navigation and the signed-in user's controls.
 */
export class DashboardPage {
  readonly page: Page;
  readonly baseUrl: string;

  readonly sidebarNavigation: Locator;
  readonly mainContent: Locator;
  readonly changePasswordButton: Locator;
  readonly signOutButton: Locator;
  readonly signOutDialog: Locator;
  readonly confirmSignOutButton: Locator;
  readonly pageErrorMessage: Locator;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;

    // The sidebar is the only <nav> outside <main>. The app also renders a hidden copy for the
    // mobile drawer, so keep only the visible one instead of picking by position.
    // Ideal long-term: ask developers for data-testid="sidebar-nav" and use getByTestId.
    this.sidebarNavigation = page.locator('nav:not(main nav)').filter({ visible: true });
    this.mainContent = page.getByRole('main');
    this.changePasswordButton = page.getByRole('button', { name: 'Change password' });
    this.signOutButton = page.getByRole('button', { name: 'Sign out' });
    this.signOutDialog = page.getByRole('dialog');
    this.confirmSignOutButton = this.signOutDialog.getByRole('button', { name: 'Sign out' });
    // Shown by the app when a page fails to load.
    this.pageErrorMessage = page.getByText(/Something went wrong/);
  }

  async goto(path = '/dashboard') {
    await this.page.goto(this.baseUrl + path);
  }

  /** Checks that the user is on a dashboard page and the signed-in layout is shown. */
  async expectLoaded(urlPattern: RegExp = /\/dashboard/) {
    await expect(this.page).toHaveURL(urlPattern);
    await showPause(this.page);
    await expect(this.sidebarNavigation).toBeVisible();
    await showCheck(this.sidebarNavigation);
    await expect(this.changePasswordButton).toBeVisible();
    await showCheck(this.changePasswordButton);
    await expect(this.signOutButton).toBeVisible();
    await showCheck(this.signOutButton);
  }

  /** Checks the signed-in user's name shown at the bottom of the sidebar. */
  async expectUserName(name: string) {
    // Visible filter skips the hidden mobile-drawer copy of the sidebar.
    const userName = this.page.getByText(name, { exact: true }).filter({ visible: true });
    await expect(userName).toBeVisible();
    await showCheck(userName);
  }

  /* ---------- Sidebar navigation ---------- */

  /** Sidebar link by its label. Matches the start of the name so badges (e.g. unread counts) are ignored. */
  sidebarLink(label: string) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.sidebarNavigation.getByRole('link', { name: new RegExp(`^${escaped}`) });
  }

  async openFromSidebar(item: SidebarItem) {
    const link = this.sidebarLink(item.label);
    // Web-first: waits for the menu to finish rendering its labels.
    await expect(link).toBeVisible();
    await link.click();
  }

  /**
   * Checks the page for a sidebar item really opened:
   * URL, the menu link marked as current page, the page's own title, and no error screen.
   */
  async expectPageLoaded(item: SidebarItem) {
    await expect(this.page).toHaveURL((url) => {
      const pathname = url.pathname.replace(/\/$/, '');
      return item.exact ? pathname === item.path : pathname.startsWith(item.path);
    });

    await expect(this.sidebarLink(item.label)).toHaveAttribute('aria-current', 'page');

    const heading = this.mainContent.getByRole('heading', { level: 1, name: item.heading, exact: true });
    await expect(heading).toBeVisible();
    await showCheck(heading);

    await expect(this.pageErrorMessage).toBeHidden();
  }

  /* ---------- Sign out ---------- */

  async signOut() {
    await this.signOutButton.click();

    await expect(this.signOutDialog).toBeVisible();
    await expect(this.signOutDialog).toContainText('Are you sure you want to sign out?');
    await showCheck(this.signOutDialog);

    const logoutResponse = this.page.waitForResponse(isLogoutCall);
    await this.confirmSignOutButton.click();
    await logoutResponse;

    await expect(this.signOutDialog).toBeHidden();
  }
}
