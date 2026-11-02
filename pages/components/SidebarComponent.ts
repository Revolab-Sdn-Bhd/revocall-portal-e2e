import { expect, type Locator, type Page } from '@playwright/test';
import { showCheck, showPause } from '../../utils/show-check';
import { isLogoutCall } from '../../utils/api';

export type SidebarItem = {
  /* Test case ID tag (without the @), e.g. AT-NAV-001. */
  id?: string;
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
 * Component for the left sidebar shared by every dashboard page: navigation links and the
 * signed-in user's controls (change password, sign out).
 */
export class SidebarComponent {
  readonly page: Page;

  readonly navigation: Locator;
  readonly mainContent: Locator;
  readonly pageErrorMessage: Locator;
  readonly changePasswordButton: Locator;
  readonly signOutButton: Locator;
  readonly signOutDialog: Locator;
  readonly confirmSignOutButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // The sidebar is the only <nav> outside <main>. The app also renders a hidden copy for the
    // mobile drawer, so keep only the visible one instead of picking by position.
    // LOC-02: a data-testid="sidebar-nav" request to the developers is still to be raised (no ticket yet);
    // when it exists, put the RV key here and switch to getByTestId.
    this.navigation = page.locator('nav:not(main nav)').filter({ visible: true });
    this.mainContent = page.getByRole('main');
    // Shown by the app when a page fails to load.
    this.pageErrorMessage = page.getByText(/Something went wrong/);
    this.changePasswordButton = page.getByRole('button', { name: 'Change password' });
    this.signOutButton = page.getByRole('button', { name: 'Sign out' });
    this.signOutDialog = page.getByRole('dialog');
    this.confirmSignOutButton = this.signOutDialog.getByRole('button', { name: 'Sign out' });
  }

  /** Checks the signed-in layout is shown: URL, sidebar and the user controls. */
  async expectLoaded(urlPattern: RegExp = /\/dashboard/) {
    await expect(this.page).toHaveURL(urlPattern);
    await showPause(this.page);
    await expect(this.navigation).toBeVisible();
    await showCheck(this.navigation);
    await expect(this.changePasswordButton).toBeVisible();
    await showCheck(this.changePasswordButton);
    await expect(this.signOutButton).toBeVisible();
    await showCheck(this.signOutButton);
  }

  /** Checks the signed-in user's name shown at the bottom of the sidebar. Does nothing when no name is given. */
  async expectUserName(name?: string) {
    // No name configured (LOGIN_DISPLAY_NAME empty): nothing to check.
    if (!name) return;
    // Visible filter skips the hidden mobile-drawer copy of the sidebar.
    const userName = this.page.getByText(name, { exact: true }).filter({ visible: true });
    await expect(userName).toBeVisible();
    await showCheck(userName);
  }

  /** Sidebar link by its label. Matches the start of the name so badges (e.g. unread counts) are ignored. */
  link(label: string) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.navigation.getByRole('link', { name: new RegExp(`^${escaped}`) });
  }

  async openFromSidebar(item: SidebarItem) {
    const link = this.link(item.label);
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

    await expect(this.link(item.label)).toHaveAttribute('aria-current', 'page');

    const heading = this.mainContent.getByRole('heading', {
      level: 1,
      name: item.heading,
      exact: true,
    });
    await expect(heading).toBeVisible();
    await showCheck(heading);

    await expect(this.pageErrorMessage).toBeHidden();
  }

  async openChangePassword() {
    await this.changePasswordButton.click();
  }

  /** Signs out through the confirmation dialog. `confirmText` is the message the dialog must show. */
  async signOut(confirmText: string) {
    await this.signOutButton.click();

    await expect(this.signOutDialog).toBeVisible();
    await expect(this.signOutDialog).toContainText(confirmText);
    await showCheck(this.signOutDialog);

    const logoutResponse = this.page.waitForResponse(isLogoutCall);
    await this.confirmSignOutButton.click();
    await logoutResponse;

    await expect(this.signOutDialog).toBeHidden();
  }
}
