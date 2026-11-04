import { test, expect } from '../../fixtures/base.fixture';

/*
 * Filter values come from test-data/conversation-logs/conversation-logs.json. Staging data is live, so
 * every test checks that the visible rows match the filter and that the total went down (or did not
 * go up), never an exact count. Each filter button shows "<Filter> <n>" once values are chosen,
 * not the value itself.
 */
test.describe('Conversation Logs - filters', () => {
  test(
    'should show only the chosen journey when filtering the Call list by Journey',
    { tag: ['@smoke', '@AT-CLOG-005'] },
    async ({ page, conversationLogsPage: logs, conversationLogsData: { filters } }) => {
      await logs.goto();
      const unfilteredTotal = await logs.getTotal();

      const [result] = await logs.selectFilterValues('journey', [filters.journey]);

      await expect(logs.activeFilterButton('journey', 1)).toBeVisible();
      await expect(logs.filterButton('journey')).toBeHidden();
      expect(result.request.journeyIds, 'list request carries one journey').toHaveLength(1);
      // The footer shows the total the server returned (AT-CLOG-051 checks this for every filter).
      expect(await logs.getTotal()).toBe(result.total);
      await logs.expectEveryRowMatches('Journey name', [filters.journey]);
      expect(result.total, 'filtered total is lower than the unfiltered total').toBeLessThan(
        unfilteredTotal,
      );
      await expect(page).toHaveURL(/tab=call/);
    },
  );

  test(
    'should show only the chosen disposition when filtering the Call list by Call disposition',
    { tag: ['@regression', '@AT-CLOG-006'] },
    async ({ page, conversationLogsPage: logs, conversationLogsData: { filters } }) => {
      await logs.goto();
      const unfilteredTotal = await logs.getTotal();

      const [result] = await logs.selectFilterValues('disposition', [filters.disposition]);

      await expect(logs.activeFilterButton('disposition', 1)).toBeVisible();
      // This is the only filter kept in the URL, so it survives a reload.
      await expect(page).toHaveURL(new RegExp(`disposition=${filters.disposition.toLowerCase()}`));
      await logs.expectEveryRowMatches('Call disposition', [filters.disposition]);
      expect(result.total, 'filtered total is lower than the unfiltered total').toBeLessThan(
        unfilteredTotal,
      );
    },
  );

  test(
    'should show only the chosen outcome when filtering the Call list by Agent outcome',
    { tag: ['@smoke', '@AT-CLOG-007'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters } }) => {
      let unfilteredTotal = 0;

      await test.step('Filter by the outcome', async () => {
        await logs.goto();
        unfilteredTotal = await logs.getTotal();
        const [result] = await logs.selectFilterValues('outcome', [filters.outcome]);

        await expect(logs.activeFilterButton('outcome', 1)).toBeVisible();
        expect(result.request.resolutions, 'list request carries the outcome').toEqual([
          filters.outcome.toUpperCase().replace(/ /g, '_'),
        ]);
        await logs.expectEveryRowMatches('Agent outcome', [filters.outcome]);
        expect(result.total, 'filtered total is lower than the unfiltered total').toBeLessThan(
          unfilteredTotal,
        );
      });

      await test.step('Clearing the outcome brings the full list back', async () => {
        const cleared = await logs.deselectFilterValue('outcome', filters.outcome, 1);

        await expect(logs.filterButton('outcome')).toBeVisible();
        // No key at all: an empty array could hide the rows without an outcome.
        expect(cleared.request).not.toHaveProperty('resolutions');
        // Same list as before ticking. New calls can arrive between the reads, so the comparison is
        // with a fresh unfiltered read taken right now, not with the first one.
        await logs.reload();
        expect(cleared.total).toBe(logs.latestList.total);
        expect(unfilteredTotal).toBeLessThanOrEqual(logs.latestList.total);
      });
    },
  );

  test(
    'should show rows of either outcome when two outcomes are selected',
    { tag: ['@regression', '@AT-CLOG-008'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters } }) => {
      await logs.goto();

      const results = await logs.selectFilterValues('outcome', [
        filters.outcome,
        filters.secondOutcome,
      ]);

      await expect(logs.activeFilterButton('outcome', 2)).toBeVisible();
      await logs.expectFilterValuesChecked('outcome', 2, [filters.outcome, filters.secondOutcome]);
      expect(results[1].request.resolutions, 'list request carries both outcomes').toHaveLength(2);
      await logs.expectEveryRowMatches('Agent outcome', [filters.outcome, filters.secondOutcome]);

      // A call has one outcome, so the two sets do not overlap: both = each alone added up.
      const secondAlone = await logs.deselectFilterValue('outcome', filters.outcome, 2);
      expect(results[1].total).toBe(results[0].total + secondAlone.total);
    },
  );

  test(
    'should show only rows matching Journey, Call disposition and Agent outcome together',
    { tag: ['@regression', '@AT-CLOG-009'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters } }) => {
      let journeyTotal = 0;

      await test.step('Select the journey', async () => {
        await logs.goto();
        [{ total: journeyTotal }] = await logs.selectFilterValues('journey', [filters.journey]);
      });

      await test.step('Select the disposition', async () => {
        await logs.selectFilterValues('disposition', [filters.disposition]);
      });

      await test.step('Select the outcome', async () => {
        const [result] = await logs.selectFilterValues('outcome', [filters.outcome]);
        expect(result.total, 'three filters give at most the journey rows').toBeLessThanOrEqual(
          journeyTotal,
        );
      });

      await test.step('All three filters are shown and every row matches all three', async () => {
        await expect(logs.activeFilterButton('journey', 1)).toBeVisible();
        await expect(logs.activeFilterButton('disposition', 1)).toBeVisible();
        await expect(logs.activeFilterButton('outcome', 1)).toBeVisible();
        // expectEveryRowMatches fails on an empty list, so a combination that ran out of data is not a pass.
        await logs.expectEveryRowMatches('Journey name', [filters.journey]);
        await logs.expectEveryRowMatches('Call disposition', [filters.disposition]);
        await logs.expectEveryRowMatches('Agent outcome', [filters.outcome]);
      });
    },
  );

  test(
    'should show only the chosen outcome when filtering the Chat list by Agent outcome',
    { tag: ['@regression', '@AT-CLOG-010'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { filters } }) => {
      let widgetTotal = 0;

      await test.step('Open the Chat tab and filter by widget', async () => {
        await logs.goto();
        await logs.selectTab('chat');
        [{ total: widgetTotal }] = await logs.selectFilterValues('widget', [filters.chatWidget]);
        await logs.expectEveryRowMatches('Widget', [filters.chatWidget]);
      });

      await test.step('Filter by the outcome', async () => {
        const [result] = await logs.selectFilterValues('outcome', [filters.outcome]);

        await expect(logs.activeFilterButton('outcome', 1)).toBeVisible();
        await logs.expectEveryRowMatches('Agent outcome', [filters.outcome]);
        await logs.expectEveryRowMatches('Widget', [filters.chatWidget]);
        expect(result.total, 'filtered total is lower than the widget total').toBeLessThan(
          widgetTotal,
        );
      });
    },
  );
});
