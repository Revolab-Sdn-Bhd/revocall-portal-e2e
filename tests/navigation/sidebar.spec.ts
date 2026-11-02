import { test, readTestData } from '../../fixtures/base.fixture';
import type { SidebarItem } from '../../pages/dashboard/DashboardPage';

const { items } = readTestData<{ items: SidebarItem[] }>('navigation/sidebar.json');

/*
 * Starts already logged in (session from auth.setup.ts). One test per menu item,
 * so the report shows exactly which page broke. Each test opens its own start page,
 * so tests do not depend on each other or on execution order.
 *
 * Whether an item is expected is decided in test-data (enabled: true/false), not by
 * looking at the screen. An enabled item that is missing from the menu fails the test.
 */
test.describe('Sidebar navigation', { tag: '@smoke' }, () => {
  for (const item of items) {
    test(`should open ${item.label}`, async ({ dashboardPage }) => {
      test.skip(!item.enabled, `"${item.label}" is disabled for this account in sidebar.json`);

      await test.step('Open start page', async () => {
        await dashboardPage.goto(item.startFrom ?? '/dashboard');
        await dashboardPage.expectLoaded();
      });

      await test.step(`Click "${item.label}" in the sidebar`, async () => {
        await dashboardPage.openFromSidebar(item);
      });

      await test.step(`Verify "${item.heading}" page is shown`, async () => {
        await dashboardPage.expectPageLoaded(item);
      });
    });
  }
});
