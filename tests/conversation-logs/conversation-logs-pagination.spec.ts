import { test, expect } from '../../fixtures/base.fixture';
import type { ConversationLogsPage } from '../../pages/conversation-logs/ConversationLogsPage';

/*
 * Paging of the Call (20 rows a page) and Chat (10 rows a page) lists. The number of pages is read from
 * the first footer, never hard-coded: staging data is live.
 *
 * Known bug B1: the "#" column restarts at 1 on every page, the PRD says it continues (S1 AC1-2).
 * Those tests assert the PRD and are marked test.fail(), so the suite stays green and the test
 * turns red as soon as the bug is fixed (remove test.fail() then).
 */
const B1 = { type: 'known-bug', description: 'B1: row numbers restart each page (not yet filed)' };

/** "#" values a page should show when numbering continues across pages: from, from+1 ... to. */
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

/** Checks the footer text and the pager of the page the list is on. */
async function expectPager(
  logs: ConversationLogsPage,
  expected: { page: number; size: number; total: number },
) {
  const pages = Math.ceil(expected.total / expected.size);
  const from = (expected.page - 1) * expected.size + 1;
  const to = Math.min(expected.page * expected.size, expected.total);
  await expect(logs.footerText).toHaveText(`Showing ${from}–${to} of ${expected.total}`);
  await expect(logs.pageIndicator).toHaveText(`Page ${expected.page} of ${pages}`);
}

test.describe('Conversation Logs - row numbers across pages', () => {
  test(
    'should continue the row numbers on page 2 of the Call list',
    { tag: ['@regression', '@AT-CLOG-015'], annotation: B1 },
    async ({ conversationLogsPage: logs, conversationLogsData: { pageSize } }) => {
      test.fail();
      await logs.goto();
      const total = await logs.getTotal();
      expect(total, 'the Call list has a second page').toBeGreaterThan(pageSize.call);

      expect(await logs.columnValues('#')).toEqual(range(1, pageSize.call));

      await logs.nextPage();
      await expectPager(logs, { page: 2, size: pageSize.call, total });
      expect(await logs.columnValues('#')).toEqual(
        range(pageSize.call + 1, Math.min(2 * pageSize.call, total)),
      );
    },
  );

  test(
    'should number page 3 of the Call list 41 to 60',
    { tag: ['@regression', '@AT-CLOG-018'], annotation: B1 },
    async ({ conversationLogsPage: logs, conversationLogsData: { pageSize } }) => {
      test.fail();
      await logs.goto();
      const total = await logs.getTotal();
      expect(total, 'the Call list has a third page').toBeGreaterThan(2 * pageSize.call);

      await logs.nextPage();
      await logs.nextPage();
      await expectPager(logs, { page: 3, size: pageSize.call, total });
      expect(await logs.columnValues('#')).toEqual(range(41, Math.min(60, total)));
    },
  );

  test(
    'should continue the row numbers on page 2 and on the last page of the Chat list',
    { tag: ['@regression', '@AT-CLOG-019'], annotation: B1 },
    async ({ conversationLogsPage: logs, conversationLogsData: { pageSize } }) => {
      test.fail();
      await logs.goto();
      await logs.selectTab('chat');
      const total = await logs.getTotal();
      expect(total, 'the Chat list has two pages').toBeGreaterThan(pageSize.chat);
      const pages = Math.ceil(total / pageSize.chat);

      await logs.nextPage();
      await expectPager(logs, { page: 2, size: pageSize.chat, total });
      expect(await logs.columnValues('#')).toEqual(
        range(pageSize.chat + 1, Math.min(2 * pageSize.chat, total)),
      );

      await logs.goToLastPage();
      await expectPager(logs, { page: pages, size: pageSize.chat, total });
      expect(await logs.columnValues('#')).toEqual(range((pages - 1) * pageSize.chat + 1, total));
    },
  );

  test(
    'should continue the row numbers on page 2 of a filtered Call list',
    { tag: ['@regression', '@AT-CLOG-020'], annotation: B1 },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters, pageSize } }) => {
      test.fail();
      await logs.goto();
      const [{ total }] = await logs.selectFilterValues('outcome', [filters.outcome]);
      expect(total, `"${filters.outcome}" has a second page`).toBeGreaterThan(pageSize.call);

      await logs.nextPage();
      await expectPager(logs, { page: 2, size: pageSize.call, total });
      expect(await logs.columnValues('#')).toEqual(
        range(pageSize.call + 1, Math.min(2 * pageSize.call, total)),
      );
    },
  );
});

test.describe('Conversation Logs - pagination', () => {
  test(
    'should move between pages with Next and Previous and update the footer and the request',
    { tag: ['@smoke', '@AT-CLOG-060'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { pageSize } }) => {
      // The "#" column is not asserted here: its numbering is the known bug B1 (AT-CLOG-015).
      await logs.goto();
      const total = await logs.getTotal();
      expect(total, 'the Call list has a second page').toBeGreaterThan(pageSize.call);
      const firstRow = await logs.rowValues(0);

      await test.step('Page 1: Previous is disabled', async () => {
        await expectPager(logs, { page: 1, size: pageSize.call, total });
        await expect(logs.previousPageButton).toBeDisabled();
        await expect(logs.nextPageButton).toBeEnabled();
      });

      await test.step('Next page loads rows 21-40 (skip 20)', async () => {
        const result = await logs.nextPage();
        expect(result.request.skip).toBe(pageSize.call);
        expect(result.request.limit).toBe(pageSize.call);
        await expectPager(logs, { page: 2, size: pageSize.call, total });
        await expect(logs.previousPageButton).toBeEnabled();
      });

      await test.step('Previous page returns to page 1 (skip 0) with the same first row', async () => {
        const result = await logs.previousPage();
        expect(result.request.skip ?? 0).toBe(0);
        await expectPager(logs, { page: 1, size: pageSize.call, total });
        await expect(logs.previousPageButton).toBeDisabled();
        expect(await logs.rowValues(0)).toEqual(firstRow);
      });
    },
  );

  test(
    'should show the remaining rows on the last page and disable Next',
    { tag: ['@regression', '@AT-CLOG-061'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { pageSize } }) => {
      await logs.goto();
      const total = await logs.getTotal();
      const pages = Math.ceil(total / pageSize.call);

      await logs.goToLastPage();

      await expectPager(logs, { page: pages, size: pageSize.call, total });
      await expect(logs.dataRows).toHaveCount(total - (pages - 1) * pageSize.call);
      await expect(logs.nextPageButton).toBeDisabled();
      await expect(logs.previousPageButton).toBeEnabled();
    },
  );

  test(
    'should keep the footer, the pager and the row count consistent in every list state',
    { tag: ['@regression', '@AT-CLOG-062'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters, search, pageSize } }) => {
      const states: Array<{
        name: string;
        size: number;
        apply: () => Promise<void>;
      }> = [
        { name: 'Call, no filter', size: pageSize.call, apply: async () => {} },
        {
          name: `Call, outcome ${filters.outcome}`,
          size: pageSize.call,
          apply: async () => {
            await logs.selectFilterValues('outcome', [filters.outcome]);
          },
        },
        {
          name: `Call, search "${search.manyResults}"`,
          size: pageSize.call,
          apply: async () => {
            await logs.search(search.manyResults);
          },
        },
        {
          name: 'Chat, no filter',
          size: pageSize.chat,
          apply: () => logs.selectTab('chat'),
        },
        {
          name: `Chat, journey ${filters.chatJourney}`,
          size: pageSize.chat,
          apply: async () => {
            await logs.selectTab('chat');
            await logs.selectFilterValues('journey', [filters.chatJourney]);
          },
        },
      ];

      for (const state of states) {
        await test.step(state.name, async () => {
          await logs.goto();
          await state.apply();

          const { from, to, total, page, pages } = await logs.pagerState();
          expect(total, 'footer total equals the response total').toBe(logs.latestList.total);
          expect(page).toBe(1);
          expect(from).toBe(1);
          expect(to).toBe(Math.min(state.size, total));
          expect(pages).toBe(Math.ceil(total / state.size));
          await expect(logs.dataRows).toHaveCount(to - from + 1);
        });
      }
    },
  );

  test(
    'should show "Page 1 of 1" with Previous and Next disabled for a one-row result',
    { tag: ['@regression', '@AT-CLOG-063'] },
    async ({ conversationLogsPage: logs }) => {
      await logs.goto();
      const id = String(logs.latestList.data[0].id);

      await logs.search(id);

      await expect(logs.footerText).toHaveText('Showing 1–1 of 1');
      await expect(logs.pageIndicator).toHaveText('Page 1 of 1');
      await expect(logs.previousPageButton).toBeDisabled();
      await expect(logs.nextPageButton).toBeDisabled();
    },
  );

  test(
    'should page the Chat list 10 rows at a time up to the last page',
    { tag: ['@regression', '@AT-CLOG-064'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { pageSize } }) => {
      await logs.goto();
      await logs.selectTab('chat');
      const total = await logs.getTotal();
      expect(total, 'the Chat list has a second page').toBeGreaterThan(pageSize.chat);
      const pages = Math.ceil(total / pageSize.chat);

      await test.step('Page 2: rows 11-20, skip 10, limit 10', async () => {
        const result = await logs.nextPage();
        expect(result.request.skip).toBe(pageSize.chat);
        expect(result.request.limit).toBe(pageSize.chat);
        await expectPager(logs, { page: 2, size: pageSize.chat, total });
      });

      await test.step('Last page: footer ends at the total, rows are the remainder, Next is disabled', async () => {
        await logs.goToLastPage();
        await expectPager(logs, { page: pages, size: pageSize.chat, total });
        await expect(logs.dataRows).toHaveCount(total - (pages - 1) * pageSize.chat);
        await expect(logs.nextPageButton).toBeDisabled();
      });
    },
  );

  test(
    'should return to page 1 when a filter changes while on page 2',
    { tag: ['@regression', '@AT-CLOG-041'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters, pageSize } }) => {
      await logs.goto();
      expect(await logs.getTotal(), 'the Call list has a second page').toBeGreaterThan(
        pageSize.call,
      );
      await logs.nextPage();
      await expect(logs.pageIndicator).toHaveText(/^Page 2 of /);

      const [result] = await logs.selectFilterValues('outcome', [filters.outcome]);

      expect(result.request.skip ?? 0).toBe(0);
      await expect(logs.footerText).toHaveText(/^Showing 1[–-]/);
      await expect(logs.pageIndicator).toHaveText(/^Page 1 of /);
      await expect(logs.previousPageButton).toBeDisabled();
    },
  );
});
