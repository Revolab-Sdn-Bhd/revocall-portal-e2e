import { test, expect } from '../../fixtures/base.fixture';
import type {
  ConversationLogsPage,
  ListResult,
} from '../../pages/conversation-logs/ConversationLogsPage';
import { isPublishedJourneyListCall, isWidgetListCall } from '../../utils/api';

/*
 * The list requests the page sends and the responses it gets, checked against what the UI shows
 * (API-level view of the filters, search, sort and paging). Parameter names were read from the
 * app's own traffic. organizationId is sent on every call and is not asserted.
 */

/** The footer total and the rows on screen must be the ones of the response. */
async function expectMatchesScreen(logs: ConversationLogsPage, result: ListResult) {
  await logs.expectTotal(result.total);
  if (result.total > 0) await expect(logs.dataRows).toHaveCount(result.data.length);
  expect(result.data.length).toBeLessThanOrEqual(Number(result.request.limit));
}

test.describe('Conversation Logs - list API', () => {
  test(
    'should send exactly the filters, search, sort and paging chosen on the Call tab',
    { tag: ['@regression', '@AT-CLOG-051'] },
    async ({ page, conversationLogsPage: logs, conversationLogsData: data }) => {
      const { filters, requestValues, search, pageSize } = data;
      const journeysLoaded = page.waitForResponse(isPublishedJourneyListCall);
      await logs.goto();
      const journeys = (
        (await (await journeysLoaded).json()) as {
          journeys: { id: string; name: string }[];
        }
      ).journeys;
      const journeyId = journeys.find((journey) => journey.name === filters.journey)?.id;
      expect(journeyId, `journey "${filters.journey}" exists`).toBeDefined();

      await test.step('The first request is the plain default one', async () => {
        const { request } = logs.latestList;
        expect(request).toMatchObject({ skip: 0, limit: pageSize.call, client: 'telephony' });
        for (const key of [
          'journeyIds',
          'dispositions',
          'resolutions',
          'isCallback',
          'debugOnly',
          'search',
          'sortBy',
        ]) {
          expect(request).not.toHaveProperty(key);
        }
        await expectMatchesScreen(logs, logs.latestList);
      });

      await test.step('Journey: its id is sent, then the key goes away', async () => {
        const [chosen] = await logs.selectFilterValues('journey', [filters.journey]);
        expect(chosen.request.journeyIds).toEqual([journeyId]);
        await expectMatchesScreen(logs, chosen);
        const cleared = await logs.deselectFilterValue('journey', filters.journey, 1);
        expect(cleared.request).not.toHaveProperty('journeyIds');
        await expectMatchesScreen(logs, cleared);
      });

      await test.step('Call disposition: the enum value is sent, then the key goes away', async () => {
        const [chosen] = await logs.selectFilterValues('disposition', [filters.disposition]);
        expect(chosen.request.dispositions).toEqual([
          requestValues.disposition[filters.disposition],
        ]);
        await expectMatchesScreen(logs, chosen);
        const cleared = await logs.deselectFilterValue('disposition', filters.disposition, 1);
        expect(cleared.request).not.toHaveProperty('dispositions');
        await expectMatchesScreen(logs, cleared);
      });

      for (const outcome of data.filterOptions.callOutcomes) {
        await test.step(`Agent outcome ${outcome}: ${requestValues.outcome[outcome]} is sent, then the key goes away`, async () => {
          const [chosen] = await logs.selectFilterValues('outcome', [outcome]);
          expect(chosen.request.resolutions).toEqual([requestValues.outcome[outcome]]);
          await expectMatchesScreen(logs, chosen);
          const cleared = await logs.deselectFilterValue('outcome', outcome, 1);
          expect(cleared.request).not.toHaveProperty('resolutions');
        });
      }

      await test.step('All conversations: isCallback true / false, then the key goes away', async () => {
        const [callbacks] = await logs.selectFilterValues('conversation', [filters.callbackItem]);
        expect(callbacks.request.isCallback).toBe(true);
        await expectMatchesScreen(logs, callbacks);
        await logs.deselectFilterValue('conversation', filters.callbackItem, 1);
        const [notCallbacks] = await logs.selectFilterValues('conversation', [
          filters.notCallbackItem,
        ]);
        expect(notCallbacks.request.isCallback).toBe(false);
        const cleared = await logs.deselectFilterValue('conversation', filters.notCallbackItem, 1);
        expect(cleared.request).not.toHaveProperty('isCallback');
      });

      await test.step('Show test calls: debugOnly replaces the telephony client, then it comes back', async () => {
        const on = await logs.setShowTestCalls(true);
        expect(on.request.debugOnly).toBe(true);
        expect(on.request).not.toHaveProperty('client');
        await expectMatchesScreen(logs, on);
        const off = await logs.setShowTestCalls(false);
        expect(off.request).not.toHaveProperty('debugOnly');
        expect(off.request.client).toBe('telephony');
      });

      await test.step('Search: the typed text is sent, then the key goes away', async () => {
        const found = await logs.search(search.manyResults);
        expect(found.request.search).toBe(search.manyResults);
        await expectMatchesScreen(logs, found);
        const cleared = await logs.clearSearch();
        expect(cleared.request).not.toHaveProperty('search');
      });

      await test.step('Sort: column and direction are sent', async () => {
        const sorted = await logs.sortBy('Duration');
        expect(sorted.request).toMatchObject({ sortBy: 'duration', sortDesc: false });
        await expectMatchesScreen(logs, sorted);
      });

      await test.step('Paging: skip is (page - 1) * 20 with limit 20', async () => {
        const next = await logs.nextPage();
        expect(next.request).toMatchObject({ skip: pageSize.call, limit: pageSize.call });
        await expectMatchesScreen(logs, next);
      });
    },
  );

  test(
    'should send exactly the filters, search, sort and paging chosen on the Chat tab',
    { tag: ['@regression', '@AT-CLOG-052'] },
    async ({ page, conversationLogsPage: logs, conversationLogsData: data }) => {
      const { filters, requestValues, search, pageSize } = data;
      const journeysLoaded = page.waitForResponse(isPublishedJourneyListCall);
      await logs.goto();
      const journeys = (
        (await (await journeysLoaded).json()) as {
          journeys: { id: string; name: string }[];
        }
      ).journeys;
      const widgetsLoaded = page.waitForResponse(isWidgetListCall);
      await logs.selectTab('chat');
      const widgets = (
        (await (await widgetsLoaded).json()) as {
          items: { id: string; name: string }[];
        }
      ).items;
      const journeyId = journeys.find((journey) => journey.name === filters.chatJourney)?.id;
      const widgetId = widgets.find((widget) => widget.name === filters.chatWidget)?.id;
      expect(journeyId, `journey "${filters.chatJourney}" exists`).toBeDefined();
      expect(widgetId, `widget "${filters.chatWidget}" exists`).toBeDefined();

      await test.step('The Chat request carries no Call-only keys', async () => {
        const { request } = logs.latestList;
        expect(request).toMatchObject({ skip: 0, limit: pageSize.chat });
        for (const key of ['client', 'debugOnly', 'isCallback']) {
          expect(request).not.toHaveProperty(key);
        }
        await expectMatchesScreen(logs, logs.latestList);
      });

      await test.step('Journey and Widget ids are sent', async () => {
        const [journey] = await logs.selectFilterValues('journey', [filters.chatJourney]);
        expect(journey.request.journeyIds).toEqual([journeyId]);
        await expectMatchesScreen(logs, journey);
        const [widget] = await logs.selectFilterValues('widget', [filters.chatWidget]);
        expect(widget.request.widgetIds).toEqual([widgetId]);
        expect(widget.request.journeyIds).toEqual([journeyId]);
        await expectMatchesScreen(logs, widget);
      });

      await test.step('Agent outcome is sent', async () => {
        const [outcome] = await logs.selectFilterValues('outcome', [filters.outcome]);
        expect(outcome.request.resolutions).toEqual([requestValues.outcome[filters.outcome]]);
        await expectMatchesScreen(logs, outcome);
      });

      await test.step('Clear all removes every filter key', async () => {
        const cleared = await logs.clearAll();
        for (const key of ['journeyIds', 'widgetIds', 'resolutions']) {
          expect(cleared.request).not.toHaveProperty(key);
        }
      });

      await test.step('Search: the typed text is sent', async () => {
        const found = await logs.search(search.chatWidgetTerm);
        expect(found.request.search).toBe(search.chatWidgetTerm);
        await expectMatchesScreen(logs, found);
        await logs.clearSearch();
      });

      await test.step('Sort by Messages: column and direction are sent', async () => {
        const sorted = await logs.sortBy('Messages');
        expect(sorted.request).toMatchObject({ sortBy: 'messages', sortDesc: false });
        await expectMatchesScreen(logs, sorted);
      });

      await test.step('Paging: skip is (page - 1) * 10 with limit 10', async () => {
        const next = await logs.nextPage();
        expect(next.request).toMatchObject({ skip: pageSize.chat, limit: pageSize.chat });
        await expectMatchesScreen(logs, next);
      });
    },
  );
});
