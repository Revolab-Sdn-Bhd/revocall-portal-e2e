import type { Page } from '@playwright/test';
import type { SidebarComponent } from '../components/SidebarComponent';

/**
 * Page Object for the RevoCall Admin dashboard (the page shown after a successful login).
 * The sidebar that every dashboard page shares lives in SidebarComponent.
 */
export class DashboardPage {
  readonly page: Page;
  readonly sidebar: SidebarComponent;

  constructor(page: Page, sidebar: SidebarComponent) {
    this.page = page;
    this.sidebar = sidebar;
  }

  /** `path` is relative to baseURL. */
  async goto(path = '/dashboard') {
    await this.page.goto(path);
  }

  /** Checks that the user is on a dashboard page and the signed-in layout is shown. */
  async expectLoaded(urlPattern: RegExp = /\/dashboard/) {
    await this.sidebar.expectLoaded(urlPattern);
  }
}
