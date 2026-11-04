import { test, expect } from '../../fixtures/base.fixture';

/*
 * Search box on the Call and Chat tabs. The search is partial and case-insensitive. A full
 * conversation ID is sent as its own parameter (callId / sessionId), not as `search`. Live data:
 * values are taken from the list at run time and results are compared with each other.
 */
test.describe('Conversation Logs - search', () => {
  test(
    'should show only the journey when searching a journey name in any case',
    { tag: ['@smoke', '@AT-CLOG-053'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters, search } }) => {
      let journeyFilterTotal = 0;

      await test.step('Measure the Journey filter total for the same journey', async () => {
        await logs.goto();
        [{ total: journeyFilterTotal }] = await logs.selectFilterValues('journey', [
          filters.journey,
        ]);
        await logs.reload();
      });

      await test.step('Lower case term', async () => {
        const result = await logs.search(search.journeyTerm);
        expect(result.request.search).toBe(search.journeyTerm);
        await logs.expectEveryRowMatches('Journey name', new RegExp(filters.journey));
        expect(result.total).toBe(journeyFilterTotal);
      });

      await test.step('Mixed case term gives the same total', async () => {
        await logs.clearSearch();
        const result = await logs.search(search.journeyTermCased);
        await logs.expectEveryRowMatches('Journey name', new RegExp(filters.journey));
        expect(result.total).toBe(journeyFilterTotal);
      });
    },
  );

  test(
    'should show only matching rows when searching a contact number in full and in part',
    { tag: ['@regression', '@AT-CLOG-054'] },
    async ({ conversationLogsPage: logs }) => {
      await logs.goto();
      // The number comes from the list, so the test does not depend on one fixed contact.
      const contact = (await logs.columnValues('Contact number'))
        .map((value) => value.replace(/\D/g, ''))
        .find((digits) => digits.length >= 8);
      expect(contact, 'a row with a phone number on page 1').toBeDefined();
      const partial = contact!.slice(0, 7);

      const full = await logs.search(contact!);
      await logs.expectEveryRowMatches('Contact number', new RegExp(contact!));
      expect(full.total).toBeGreaterThan(0);

      await logs.clearSearch();
      const part = await logs.search(partial);
      await logs.expectEveryRowMatches('Contact number', new RegExp(partial));
      expect(part.total).toBeGreaterThanOrEqual(full.total);
    },
  );

  test(
    'should find one conversation by its full ID or its first 8 characters and open the same one',
    { tag: ['@smoke', '@AT-CLOG-055'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { formats, search } }) => {
      await logs.goto();
      // The ID is not in the table, so it comes from the list response.
      const id = String(logs.latestList.data[0].id);

      await test.step('Full ID: exactly one row, and its details show the same ID', async () => {
        const result = await logs.search(id);
        expect(result.total).toBe(1);
        await expect(logs.footerText).toHaveText('Showing 1–1 of 1');
        await expect(logs.pageIndicator).toHaveText('Page 1 of 1');

        await logs.openFirstRow();
        await logs.callDetails.expectOpen();
        expect(await logs.callDetails.readConversationId(formats.conversationIdPattern)).toBe(id);
        await logs.callDetails.close();
        await logs.callDetails.expectClosed();
      });

      await test.step('First 8 characters: the same conversation', async () => {
        await logs.clearSearch();
        const result = await logs.search(id.slice(0, search.idPrefixLength));
        expect(result.total).toBe(1);
        expect(result.data[0].id).toBe(id);
      });
    },
  );

  test(
    'should show the empty state for a search with no match and recover with Clear search',
    { tag: ['@regression', '@AT-CLOG-056'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { search, columns, messages } }) => {
      await logs.goto();
      await expect(logs.clearSearchButton, 'Clear search only shows with text').toBeHidden();
      const before = logs.latestList.total;

      const result = await logs.search(search.noMatch);
      expect(result.total).toBe(0);
      await expect(logs.emptyMessage(messages.emptyCall)).toBeVisible();
      await logs.expectEmptyState();
      await logs.expectColumns(columns.call);

      const cleared = await logs.clearSearch();
      await expect(logs.footerText).toBeVisible();
      expect(cleared.total).toBeGreaterThanOrEqual(before);
    },
  );

  test(
    'should keep the search term across pages and combine it with a filter',
    { tag: ['@regression', '@AT-CLOG-057'] },
    async ({
      conversationLogsPage: logs,
      conversationLogsData: { search, filters, pageSize, requestValues },
    }) => {
      await logs.goto();
      const searchOnly = await logs.search(search.manyResults);
      expect(searchOnly.total, 'the term has more than one page').toBeGreaterThan(pageSize.call);

      await test.step('Page 2 keeps the term', async () => {
        const page2 = await logs.nextPage();
        expect(page2.request.search).toBe(search.manyResults);
        expect(page2.request.skip).toBe(pageSize.call);
        await expect(logs.footerText).toHaveText(
          `Showing ${pageSize.call + 1}–${Math.min(2 * pageSize.call, searchOnly.total)} of ${searchOnly.total}`,
        );
        await expect(logs.searchBox).toHaveValue(search.manyResults);
      });

      await test.step('A filter on top narrows the result and goes back to page 1', async () => {
        const [combined] = await logs.selectFilterValues('outcome', [filters.outcome]);
        expect(combined.request.search).toBe(search.manyResults);
        expect(combined.request.resolutions).toEqual([requestValues.outcome[filters.outcome]]);
        expect(combined.request.skip ?? 0).toBe(0);
        expect(combined.total).toBeLessThanOrEqual(searchOnly.total);
        await logs.expectEveryRowMatches('Agent outcome', [filters.outcome]);
      });
    },
  );

  test(
    'should handle padded, script-like and SQL-like search text without breaking the page',
    { tag: ['@regression', '@AT-CLOG-058'] },
    async ({ page, conversationLogsPage: logs, conversationLogsData: { search } }) => {
      const dialogs: string[] = [];
      const pageErrors: string[] = [];
      page.on('dialog', (dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await logs.goto();

      await test.step('Spaces around the term are ignored', async () => {
        const trimmed = await logs.search(search.journeyTermCased);
        await logs.clearSearch();
        const padded = await logs.search(search.paddedTerm);
        expect(padded.total).toBe(trimmed.total);
        await logs.clearSearch();
      });

      for (const term of [search.scriptTerm, search.sqlTerm]) {
        await test.step(`"${term}" finds nothing and the page stays usable`, async () => {
          const result = await logs.search(term);
          expect(result.total).toBe(0);
          await logs.expectEmptyState();
          await logs.clearSearch();
          await expect(logs.dataRows.first()).toBeVisible();
        });
      }

      expect(dialogs, 'no browser dialog opened').toEqual([]);
      expect(pageErrors, 'no script error on the page').toEqual([]);
    },
  );

  test(
    'should search the Chat list by widget, journey and conversation ID and show its empty state',
    { tag: ['@regression', '@AT-CLOG-059'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { search, filters, messages } }) => {
      await logs.goto();

      await test.step('The placeholders name what each tab searches', async () => {
        await expect(logs.searchBox).toHaveAttribute('placeholder', messages.searchPlaceholderCall);
        await logs.selectTab('chat');
        await expect(logs.searchBox).toHaveAttribute('placeholder', messages.searchPlaceholderChat);
      });

      await test.step('Widget text', async () => {
        await logs.search(search.chatWidgetTerm);
        await logs.expectEveryRowMatches('Widget', new RegExp(search.chatWidgetTerm));
        await logs.clearSearch();
      });

      await test.step('Journey name', async () => {
        await logs.search(filters.chatJourney);
        await logs.expectEveryRowMatches('Journey name', [filters.chatJourney]);
        await logs.clearSearch();
      });

      await test.step('Conversation ID finds one chat', async () => {
        const id = String(logs.latestList.data[0].id);
        const result = await logs.search(id);
        expect(result.total).toBe(1);
        await logs.clearSearch();
      });

      await test.step('No match shows the Chat empty state and Clear search recovers', async () => {
        const result = await logs.search(search.noMatch);
        expect(result.total).toBe(0);
        await expect(logs.emptyMessage(messages.emptyChat)).toBeVisible();
        await logs.clearSearch();
        await expect(logs.footerText).toBeVisible();
      });
    },
  );
});
