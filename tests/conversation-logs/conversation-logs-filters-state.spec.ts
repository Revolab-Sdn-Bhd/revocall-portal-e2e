import { test, expect } from '../../fixtures/base.fixture';
import type { ConversationLogsPage } from '../../pages/conversation-logs/ConversationLogsPage';

/*
 * How filters behave as a whole: clearing, empty results, what the URL keeps, tab switches and the
 * "Show test calls" switch. Only the tab and the Call disposition are kept in the URL; Journey,
 * Agent outcome, All conversations and search are lost on reload (staging behaviour, open question 16).
 */

/** The unfiltered total right now: a reload resets every filter that is not in the URL. */
async function freshUnfilteredTotal(logs: ConversationLogsPage) {
  await logs.reload();
  return logs.latestList.total;
}

const FILTER_KEYS = ['journeyIds', 'dispositions', 'resolutions', 'widgetIds', 'isCallback'];

test.describe('Conversation Logs - clear, empty and tabs', () => {
  test(
    'should return to the full Agent outcome list when the outcome is unticked, twice in a row',
    { tag: ['@smoke', '@AT-CLOG-031'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters } }) => {
      await logs.goto();
      expect(logs.latestList.request, 'the unfiltered request has no outcome').not.toHaveProperty(
        'resolutions',
      );
      const initial = logs.latestList;

      for (const round of [1, 2]) {
        await test.step(`Round ${round}: tick Resolved, then untick it`, async () => {
          const [filtered] = await logs.selectFilterValues('outcome', [filters.outcome]);
          expect(filtered.total, 'ticking the outcome narrows the list').toBeLessThan(
            initial.total,
          );

          const cleared = await logs.deselectFilterValue('outcome', filters.outcome, 1);

          await expect(logs.filterButton('outcome')).toBeVisible();
          // No key at all: an empty array could hide the rows without an outcome.
          expect(cleared.request).not.toHaveProperty('resolutions');
          // The list has to be the same as before ticking (new calls may arrive, so read it fresh).
          const freshTotal = await freshUnfilteredTotal(logs);
          expect(cleared.total).toBe(freshTotal);
          expect(cleared.data.map((row) => row.id)).toEqual(
            logs.latestList.data.map((row) => row.id),
          );
        });
      }
    },
  );

  test(
    'should reset every Call filter and the URL disposition with Clear all',
    { tag: ['@smoke', '@AT-CLOG-033'] },
    async ({ page, conversationLogsPage: logs, conversationLogsData: { filters } }) => {
      await logs.goto();
      await expect(logs.clearAllButton, 'Clear all only shows while a filter is on').toBeHidden();

      await test.step('Apply four filters', async () => {
        await logs.selectFilterValues('journey', [filters.journey]);
        await logs.selectFilterValues('disposition', [filters.disposition]);
        await logs.selectFilterValues('outcome', [filters.outcome]);
        await logs.selectFilterValues('conversation', [filters.notCallbackItem]);
        await expect(logs.clearAllButton).toBeVisible();
      });

      await test.step('Clear all resets the buttons, the request and the URL', async () => {
        const cleared = await logs.clearAll();

        for (const filter of ['journey', 'disposition', 'outcome', 'conversation'] as const) {
          await expect(logs.filterButton(filter)).toBeVisible();
        }
        for (const key of FILTER_KEYS) expect(cleared.request).not.toHaveProperty(key);
        // The URL keeps an empty "disposition=" after clearing (open question 16).
        expect(new URL(page.url()).searchParams.get('disposition') ?? '').toBe('');
        expect(cleared.total).toBe(await freshUnfilteredTotal(logs));
      });
    },
  );

  test(
    'should reset the Chat Journey, Widget and Agent outcome filters with Clear all',
    { tag: ['@regression', '@AT-CLOG-034'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters } }) => {
      await logs.goto();
      await logs.selectTab('chat');

      await logs.selectFilterValues('journey', [filters.chatJourney]);
      await logs.selectFilterValues('widget', [filters.chatWidget]);
      await logs.selectFilterValues('outcome', [filters.outcome]);

      const cleared = await logs.clearAll();

      for (const filter of ['journey', 'widget', 'outcome'] as const) {
        await expect(logs.filterButton(filter)).toBeVisible();
      }
      for (const key of FILTER_KEYS) expect(cleared.request).not.toHaveProperty(key);
      expect(cleared.total).toBe(await freshUnfilteredTotal(logs));
    },
  );

  test(
    'should show the Call empty state when no row matches the filters',
    { tag: ['@regression', '@AT-CLOG-039'] },
    async ({
      conversationLogsPage: logs,
      conversationLogsData: { filters, columns, messages, requestValues },
    }) => {
      await logs.goto();

      // Failed calls never have an outcome, so Resolved + Failed has no rows.
      await logs.selectFilterValues('disposition', [filters.noRowsDisposition]);
      const [result] = await logs.selectFilterValues('outcome', [filters.outcome]);

      expect(result.total).toBe(0);
      expect(result.request.dispositions).toEqual([
        requestValues.disposition[filters.noRowsDisposition],
      ]);
      expect(result.request.resolutions).toEqual([requestValues.outcome[filters.outcome]]);
      await expect(logs.emptyMessage(messages.emptyCall)).toBeVisible();
      await expect(logs.emptyMessage(messages.emptyHint)).toBeVisible();
      await logs.expectEmptyState();
      await logs.expectColumns(columns.call);
    },
  );

  test(
    'should show the Chat empty state and bring the list back with Clear all',
    { tag: ['@regression', '@AT-CLOG-040'] },
    async ({
      conversationLogsPage: logs,
      conversationLogsData: { filters, columns, messages },
    }) => {
      await logs.goto();
      await logs.selectTab('chat');

      await test.step('A journey and a widget that never meet give no rows', async () => {
        await logs.selectFilterValues('journey', [filters.secondChatJourney]);
        const [result] = await logs.selectFilterValues('widget', [filters.chatWidget]);

        expect(result.total).toBe(0);
        await expect(logs.emptyMessage(messages.emptyChat)).toBeVisible();
        await logs.expectEmptyState();
        await logs.expectColumns(columns.chat);
      });

      await test.step('Clear all brings the list and the footer back', async () => {
        await logs.clearAll();
        await expect(logs.dataRows.first()).toBeVisible();
        await expect(logs.footerText).toBeVisible();
      });
    },
  );

  test(
    'should keep the Call disposition in the URL and apply it from a direct link',
    { tag: ['@regression', '@AT-CLOG-042'] },
    async ({
      page,
      conversationLogsPage: logs,
      conversationLogsData: { filters, urlParams, requestValues },
    }) => {
      let filteredTotal = 0;

      await test.step('Choosing a disposition writes it to the URL', async () => {
        await logs.goto();
        [{ total: filteredTotal }] = await logs.selectFilterValues('disposition', [
          filters.disposition,
        ]);
        await expect(page).toHaveURL(/tab=call/);
        await expect(page).toHaveURL(new RegExp(`disposition=${urlParams.disposition}`));
      });

      await test.step('A reload keeps the disposition', async () => {
        await logs.reload();
        await expect(logs.activeFilterButton('disposition', 1)).toBeVisible();
        await logs.expectEveryRowMatches('Call disposition', [filters.disposition]);
        expect(logs.latestList.request.dispositions).toEqual([
          requestValues.disposition[filters.disposition],
        ]);
      });

      await test.step('A direct link with one disposition applies it', async () => {
        await logs.gotoWithQuery(`?tab=call&disposition=${urlParams.disposition}`, 'call');
        await logs.expectListLoaded();
        expect(logs.latestList.request.dispositions).toEqual([
          requestValues.disposition[filters.disposition],
        ]);
        await expect(logs.activeFilterButton('disposition', 1)).toBeVisible();
        // New calls can arrive between the two reads, so "at least".
        expect(logs.latestList.total).toBeGreaterThanOrEqual(filteredTotal);
      });

      await test.step('A direct link with two dispositions applies both', async () => {
        await logs.gotoWithQuery(`?tab=call&disposition=${urlParams.twoDispositions}`, 'call');
        await logs.expectListLoaded();
        expect(logs.latestList.request.dispositions).toHaveLength(2);
        await expect(logs.activeFilterButton('disposition', 2)).toBeVisible();
      });
    },
  );

  test(
    'should lose the Journey, Agent outcome and search filters on reload',
    {
      tag: ['@regression', '@AT-CLOG-043'],
      annotation: {
        type: 'pending-po',
        description:
          'OQ16: is losing Journey, Agent outcome and search on reload intended? Staging resets them; the PRD is silent',
      },
    },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters, search } }) => {
      await logs.goto();
      await logs.selectFilterValues('journey', [filters.journey]);
      await logs.selectFilterValues('outcome', [filters.outcome]);
      await logs.search(search.journeyTerm);

      await logs.reload();

      // If Product wants these kept on reload, flip these three checks to "still applied".
      await expect(logs.filterButton('journey')).toBeVisible();
      await expect(logs.filterButton('outcome')).toBeVisible();
      await expect(logs.searchBox).toHaveValue('');
    },
  );

  test(
    'should open the Call list without filters for an unknown tab or disposition in the URL',
    { tag: ['@regression', '@AT-CLOG-044'] },
    async ({ page, conversationLogsPage: logs, conversationLogsData: { urlParams } }) => {
      await test.step('Unknown tab: the Call tab opens and the URL is corrected', async () => {
        await logs.gotoWithQuery(`?tab=${urlParams.unknownTab}`, 'call');
        await logs.expectListLoaded();
        await expect(logs.callTab).toHaveAttribute('aria-selected', 'true');
        await expect(page).toHaveURL(/tab=call/);
      });

      await test.step('Unknown disposition: the full list shows and no filter is sent', async () => {
        await logs.gotoWithQuery(`?tab=call&disposition=${urlParams.unknownDisposition}`, 'call');
        await logs.expectListLoaded();
        await expect(logs.filterButton('disposition')).toBeVisible();
        expect(logs.latestList.request).not.toHaveProperty('dispositions');
        await expect(logs.pageHeading).toBeVisible();
      });
    },
  );

  test(
    'should clear the search and the filters when switching between the Call and Chat tabs',
    { tag: ['@regression', '@AT-CLOG-045'] },
    async ({ page, conversationLogsPage: logs, conversationLogsData: { filters, search } }) => {
      await logs.goto();
      await logs.search(search.manyResults);
      await logs.selectFilterValues('outcome', [filters.outcome]);

      await test.step('Chat tab starts clean', async () => {
        await logs.selectTab('chat');
        await expect(page).toHaveURL(/tab=chat/);
        await expect(logs.searchBox).toHaveValue('');
        for (const filter of ['journey', 'widget', 'outcome'] as const) {
          await expect(logs.filterButton(filter)).toBeVisible();
        }
        for (const key of [...FILTER_KEYS, 'search']) {
          expect(logs.latestList.request).not.toHaveProperty(key);
        }
      });

      await test.step('Call tab starts clean again', async () => {
        await logs.selectTab('call');
        await expect(page).toHaveURL(/tab=call/);
        await expect(logs.searchBox).toHaveValue('');
        await expect(logs.filterButton('outcome')).toBeVisible();
        for (const key of [...FILTER_KEYS, 'search']) {
          expect(logs.latestList.request).not.toHaveProperty(key);
        }
      });
    },
  );

  test(
    'should keep the Call disposition in the URL on the Chat tab and apply it again on return',
    {
      tag: ['@regression', '@AT-CLOG-046'],
      annotation: {
        type: 'pending-po',
        description:
          'OQ16: should the disposition leave the URL on the Chat tab? Staging keeps it and re-applies it on the Call tab',
      },
    },
    async ({
      page,
      conversationLogsPage: logs,
      conversationLogsData: { filters, requestValues },
    }) => {
      const failed = filters.noRowsDisposition;
      const noResponse = filters.noResponseDisposition;
      await logs.goto();
      await logs.selectFilterValues('disposition', [failed, noResponse]);

      await test.step('Chat tab: the URL still carries the disposition, the Chat list ignores it', async () => {
        await logs.selectTab('chat');
        // If Product wants it gone from the Chat URL, expect the parameter to be null here.
        expect(new URL(page.url()).searchParams.get('disposition')).toBeTruthy();
        expect(logs.latestList.request).not.toHaveProperty('dispositions');
      });

      await test.step('Call tab: the disposition applies again', async () => {
        await logs.selectTab('call');
        await expect(logs.activeFilterButton('disposition', 2)).toBeVisible();
        expect([...(logs.latestList.request.dispositions as string[])].sort()).toEqual(
          [requestValues.disposition[failed], requestValues.disposition[noResponse]].sort(),
        );
      });
    },
  );

  test(
    'should open the Chat tab directly from ?tab=chat with the Chat filters only',
    { tag: ['@regression', '@AT-CLOG-047'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { columns, pageSize } }) => {
      await logs.gotoWithQuery('?tab=chat', 'chat');
      await logs.expectListLoaded();

      await expect(logs.chatTab).toHaveAttribute('aria-selected', 'true');
      await logs.expectColumns(columns.chat);
      for (const filter of ['journey', 'widget', 'outcome'] as const) {
        await expect(logs.filterButton(filter)).toBeVisible();
      }
      await expect(logs.filterButton('disposition')).toBeHidden();
      await expect(logs.filterButton('conversation')).toBeHidden();
      await expect(logs.showTestCallsSwitch).toHaveCount(0);
      expect(logs.latestList.request.limit).toBe(pageSize.chat);
    },
  );
});

test.describe('Conversation Logs - Show test calls', () => {
  test(
    'should change the Call list when Show test calls is on and restore it when off',
    {
      tag: ['@regression', '@AT-CLOG-049'],
      annotation: {
        type: 'pending-po',
        description:
          'OQ12: what the ON state should contain is not decided; only the observed request and total change are asserted',
      },
    },
    async ({ conversationLogsPage: logs, conversationLogsData: { messages } }) => {
      await logs.goto();
      const defaultTotal = logs.latestList.total;
      expect(logs.latestList.request.client).toBe('telephony');

      await test.step('On: the request asks for test calls and the list changes', async () => {
        const on = await logs.setShowTestCalls(true);
        await expect(logs.showTestCallsSwitch).toBeChecked();
        expect(on.request.debugOnly).toBe(true);
        expect(on.request).not.toHaveProperty('client');
        expect(on.total).not.toBe(defaultTotal);
        await expect
          .poll(async () => await logs.columnValues('Contact number'), {
            message: 'some rows are test calls',
          })
          .toContain(messages.testCallContact);
      });

      await test.step('Off: the default list is back', async () => {
        const off = await logs.setShowTestCalls(false);
        await expect(logs.showTestCallsSwitch).not.toBeChecked();
        expect(off.request.client).toBe('telephony');
        expect(off.request).not.toHaveProperty('debugOnly');
        expect(off.total).toBe(await freshUnfilteredTotal(logs));
      });

      await test.step('The Chat tab has no such switch', async () => {
        await logs.selectTab('chat');
        await expect(logs.showTestCallsSwitch).toHaveCount(0);
      });
    },
  );

  test(
    'should ask for test calls instead of the telephony calls when Show test calls is on',
    {
      tag: ['@regression', '@AT-CLOG-050'],
      annotation: {
        type: 'pending-po',
        description:
          'OQ12: should test calls be added to the default list or replace it? Staging replaces (debugOnly instead of telephony)',
      },
    },
    async ({ conversationLogsPage: logs }) => {
      await logs.goto();

      const on = await logs.setShowTestCalls(true);

      // Staging replaces the list. If Product wants test calls added, expect the telephony
      // calls to stay (client still "telephony" or "all") and the total to be at least the default.
      expect(on.request.debugOnly).toBe(true);
      expect(on.request).not.toHaveProperty('client');
    },
  );
});
