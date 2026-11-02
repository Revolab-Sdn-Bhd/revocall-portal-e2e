import type { Locator, Page } from '@playwright/test';

/**
 * Demo mode, for watching a run: `DEMO=1 npx playwright test --headed` (or `npm run test:demo`).
 * The checked element is highlighted and the test pauses on it.
 *
 * Documented reason for waitForTimeout: this is a purely visual pause for a human watching,
 * added AFTER the assertion has already passed. It never replaces waiting for app state.
 * It is OFF by default, so normal local runs have the same timing as CI and do not hide race conditions.
 */
const DEMO = !!process.env.DEMO && !process.env.CI;
const PAUSE_MS = 1000;

/** Highlight an element that was just checked, then pause. Call after the assertion passes. */
export async function showCheck(locator: Locator) {
  if (!DEMO) return;
  await locator.highlight();
  // eslint-disable-next-line playwright/no-wait-for-timeout -- demo mode only, see the note above
  await locator.page().waitForTimeout(PAUSE_MS);
}

/** Pause after a check that has no element to highlight (e.g. a URL check). */
export async function showPause(page: Page) {
  if (!DEMO) return;
  // eslint-disable-next-line playwright/no-wait-for-timeout -- demo mode only, see the note above
  await page.waitForTimeout(PAUSE_MS);
}
