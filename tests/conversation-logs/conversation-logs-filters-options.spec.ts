import { test, expect } from '../../fixtures/base.fixture';
import type {
  ConversationLogsPage,
  FilterName,
  ListResult,
} from '../../pages/conversation-logs/ConversationLogsPage';
import { isPublishedJourneyListCall } from '../../utils/api';

/*
 * What each filter offers and what it sends: option lists, multi-select, the request each choice
 * produces, and combinations. Staging data is live, so totals are compared with each other
 * (a combination against the single values), never with fixed numbers.
 */

/**
 * Ticks `first` and `second` in one open menu, then unticks `first` to measure `second` alone.
 * Returns the totals of: first alone, both, second alone. The two values must not overlap.
 */
async function measureTwoValues(
  logs: ConversationLogsPage,
  filter: FilterName,
  first: string,
  second: string,
): Promise<{ first: ListResult; both: ListResult; second: ListResult; urlWhenBoth: string }> {
  const [firstAlone, both] = await logs.selectFilterValues(filter, [first, second]);
  const urlWhenBoth = logs.page.url();
  const secondAlone = await logs.deselectFilterValue(filter, first, 2);
  return { first: firstAlone, both, second: secondAlone, urlWhenBoth };
}

test.describe('Conversation Logs - filter options and multi-select', () => {
  test(
    'should offer the staging Agent outcomes in the Call filter',
    {
      tag: ['@regression', '@AT-CLOG-027'],
      annotation: {
        type: 'pending-po',
        description:
          'OQ4: PRD lists Resolved, Action Required, Dropped; staging offers Escalated instead of Dropped',
      },
    },
    async ({ conversationLogsPage: logs, conversationLogsData: { filterOptions } }) => {
      await logs.goto();

      const { names, checked } = await logs.readFilterOptions('outcome');

      // If Product confirms the PRD list, compare with filterOptions.prdCallOutcomes instead.
      expect(names).toEqual(filterOptions.callOutcomes);
      expect(checked, 'nothing is ticked by default').toEqual([]);
    },
  );

  test(
    'should list the organisation journeys in the Call and Chat Journey filters',
    { tag: ['@regression', '@AT-CLOG-028'] },
    async ({ page, conversationLogsPage: logs }) => {
      const journeysLoaded = page.waitForResponse(isPublishedJourneyListCall);
      await logs.goto();
      const apiNames = (
        (await (await journeysLoaded).json()) as { journeys: { name: string }[] }
      ).journeys.map((journey) => journey.name);
      expect(apiNames.length, 'the organisation has journeys').toBeGreaterThan(0);

      for (const tab of ['call', 'chat'] as const) {
        await test.step(`${tab} tab: the menu shows the published journeys of the API, none ticked`, async () => {
          await logs.selectTab(tab);
          const { names, checked } = await logs.readFilterOptions('journey');
          // Names can repeat (two journeys are called "ABSS"), so the lists are compared whole.
          expect(names).toEqual(apiNames);
          expect(checked).toEqual([]);
        });
      }
    },
  );

  test(
    'should offer the staging Call dispositions and return only the chosen one',
    {
      tag: ['@regression', '@AT-CLOG-029'],
      annotation: {
        type: 'pending-po',
        description:
          'OQ18: filter option "Dropped" returns rows whose cell reads "Caller Hung Up"; Dropped is left out of the checked values',
      },
    },
    async ({
      conversationLogsPage: logs,
      conversationLogsData: { filterOptions, requestValues },
    }) => {
      await test.step('The menu offers the 13 staging dispositions', async () => {
        await logs.goto();
        const { names } = await logs.readFilterOptions('disposition');
        expect(names).toEqual(filterOptions.dispositions);
      });

      for (const disposition of filterOptions.dispositionsChecked) {
        await test.step(`Choosing "${disposition}" alone shows only those rows`, async () => {
          await logs.goto();
          const [result] = await logs.selectFilterValues('disposition', [disposition]);
          expect(result.request.dispositions).toEqual([requestValues.disposition[disposition]]);
          // Staging can have no rows for a value: the list is then the empty state, not a pass.
          test.skip(result.total === 0, `No "${disposition}" calls on staging`);
          await logs.expectEveryRowMatches('Call disposition', [disposition]);
        });
      }
    },
  );

  test(
    'should show rows of either disposition, keep both in the URL and add up the totals',
    { tag: ['@regression', '@AT-CLOG-030'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters, requestValues } }) => {
      const failed = filters.noRowsDisposition;
      const noResponse = filters.noResponseDisposition;
      await logs.goto();

      const totals = await measureTwoValues(logs, 'disposition', failed, noResponse);

      expect([...(totals.both.request.dispositions as string[])].sort()).toEqual(
        [requestValues.disposition[failed], requestValues.disposition[noResponse]].sort(),
      );
      expect(totals.both.total, 'both = each alone added up').toBe(
        totals.first.total + totals.second.total,
      );

      // Both values are in the URL, comma separated (the order is the app's).
      const urlValue = new URL(totals.urlWhenBoth).searchParams.get('disposition') ?? '';
      expect(urlValue.split(',').sort()).toEqual([failed, noResponse].map(toUrlValue).sort());
    },
  );

  test(
    'should show only Escalated rows when filtering the Call list by Agent outcome Escalated',
    { tag: ['@regression', '@AT-CLOG-032'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters, requestValues } }) => {
      await logs.goto();
      const unfilteredTotal = await logs.getTotal();

      const [result] = await logs.selectFilterValues('outcome', [filters.escalatedOutcome]);

      expect(result.request.resolutions).toEqual([requestValues.outcome[filters.escalatedOutcome]]);
      expect(result.total, 'Escalated has rows').toBeGreaterThan(0);
      expect(result.total).toBeLessThan(unfilteredTotal);
      await logs.expectEveryRowMatches('Agent outcome', [filters.escalatedOutcome]);
    },
  );

  test(
    'should show only the chosen journey when filtering the Chat list by Journey',
    { tag: ['@regression', '@AT-CLOG-035'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters } }) => {
      await logs.goto();
      await logs.selectTab('chat');
      const unfilteredTotal = await logs.getTotal();

      const [result] = await logs.selectFilterValues('journey', [filters.chatJourney]);

      await expect(logs.activeFilterButton('journey', 1)).toBeVisible();
      expect(result.request.journeyIds, 'one journey id is sent').toHaveLength(1);
      expect(result.total).toBeLessThan(unfilteredTotal);
      await logs.expectEveryRowMatches('Journey name', [filters.chatJourney]);
    },
  );

  test(
    'should list the widgets and show only the chosen widget when filtering the Chat list by Widget',
    { tag: ['@regression', '@AT-CLOG-036'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters, filterOptions } }) => {
      await logs.goto();
      await logs.selectTab('chat');
      const unfilteredTotal = await logs.getTotal();

      await test.step('The menu offers the staging widgets', async () => {
        const { names } = await logs.readFilterOptions('widget');
        expect(names).toEqual(filterOptions.chatWidgets);
      });

      await test.step('Choosing one widget shows only its chats', async () => {
        const [result] = await logs.selectFilterValues('widget', [filters.chatWidget]);
        await expect(logs.activeFilterButton('widget', 1)).toBeVisible();
        expect(result.request.widgetIds, 'one widget id is sent').toHaveLength(1);
        expect(result.total).toBeLessThan(unfilteredTotal);
        await logs.expectEveryRowMatches('Widget', [filters.chatWidget]);
      });
    },
  );

  test(
    'should show rows of either value when two Chat journeys or two Chat widgets are chosen',
    { tag: ['@regression', '@AT-CLOG-037'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters } }) => {
      await test.step('Two journeys', async () => {
        await logs.goto();
        await logs.selectTab('chat');
        const totals = await measureTwoValues(
          logs,
          'journey',
          filters.chatJourney,
          filters.secondChatJourney,
        );

        // A chat has one journey, so the two sets do not overlap.
        expect(totals.both.request.journeyIds).toHaveLength(2);
        expect(totals.both.total).toBe(totals.first.total + totals.second.total);
      });

      await test.step('Two widgets', async () => {
        await logs.goto();
        await logs.selectTab('chat');
        const totals = await measureTwoValues(
          logs,
          'widget',
          filters.chatWidget,
          filters.secondChatWidget,
        );

        expect(totals.both.request.widgetIds).toHaveLength(2);
        expect(totals.both.total).toBe(totals.first.total + totals.second.total);
      });
    },
  );

  test(
    'should show only rows matching Chat Journey, Widget and Agent outcome together',
    { tag: ['@regression', '@AT-CLOG-038'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters } }) => {
      await logs.goto();
      await logs.selectTab('chat');
      await logs.selectFilterValues('journey', [filters.chatJourney]);
      await logs.selectFilterValues('widget', [filters.chatWidget]);
      const [last] = await logs.selectFilterValues('outcome', [filters.outcome]);

      expect(last.request.journeyIds).toHaveLength(1);
      expect(last.request.widgetIds).toHaveLength(1);
      expect(last.request.resolutions).toHaveLength(1);
      // An empty combination fails here on purpose: it means the test data ran out, not a pass.
      await logs.expectEveryRowMatches('Journey name', [filters.chatJourney]);
      await logs.expectEveryRowMatches('Widget', [filters.chatWidget]);
      await logs.expectEveryRowMatches('Agent outcome', [filters.outcome]);
    },
  );

  test(
    'should split the Call list into callbacks and not callbacks with the All conversations filter',
    { tag: ['@regression', '@AT-CLOG-048'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters, messages } }) => {
      await logs.goto();
      const unfilteredTotal = await logs.getTotal();
      const hasTag = (contact: string) => contact.includes(messages.callbackTag);

      let callbacks!: ListResult;
      let both!: ListResult;

      await test.step('Callbacks alone: isCallback true, every row carries the callback tag', async () => {
        [callbacks] = await logs.selectFilterValues('conversation', [filters.callbackItem]);
        expect(callbacks.request.isCallback).toBe(true);
        expect(callbacks.total).toBeGreaterThan(0);
        expect(callbacks.total).toBeLessThan(unfilteredTotal);
        await expect
          .poll(async () => (await logs.columnValues('Contact number')).filter((c) => !hasTag(c)))
          .toEqual([]);
      });

      await test.step('Both ticked: no isCallback is sent and the total is the whole list', async () => {
        [both] = await logs.selectFilterValues('conversation', [filters.notCallbackItem], 1);
        expect(both.request).not.toHaveProperty('isCallback');
        expect(both.total).toBe(unfilteredTotal);
        await expect(logs.activeFilterButton('conversation', 2)).toBeVisible();
      });

      await test.step('Not callbacks alone: isCallback false, no row carries the tag, totals add up', async () => {
        const notCallbacks = await logs.deselectFilterValue(
          'conversation',
          filters.callbackItem,
          2,
        );
        expect(notCallbacks.request.isCallback).toBe(false);
        expect(notCallbacks.total).toBe(unfilteredTotal - callbacks.total);
        await expect
          .poll(async () => (await logs.columnValues('Contact number')).filter(hasTag))
          .toEqual([]);
      });
    },
  );
});

/** "No Response" as it is written in the page URL (lower case, underscores). */
function toUrlValue(label: string) {
  return label.toLowerCase().replace(/ /g, '_');
}
