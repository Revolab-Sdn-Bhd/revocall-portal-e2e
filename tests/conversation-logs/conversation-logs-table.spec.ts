import { test, expect } from '../../fixtures/base.fixture';
import { dateTimeValue, isSorted } from '../../utils/conversation-logs';

/*
 * Whole-page checks of the Call and Chat lists: columns, cell formats, order and the status chips.
 * Staging data is live, so every check is about the shape of the rows (formats, allowed values,
 * relations), never exact rows or counts. Column labels are the staging ones ("#", "Agent outcome").
 */
test.describe('Conversation Logs - table content', () => {
  test(
    'should not show the Conversation ID as a column or in any cell on the Call and Chat tabs',
    { tag: ['@regression', '@AT-CLOG-016'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      // The pattern in the test data is anchored for whole values; here it is looked for inside cells.
      const uuid = new RegExp(data.formats.conversationIdPattern.replace(/^\^|\$$/g, ''));

      for (const tab of ['call', 'chat'] as const) {
        await test.step(`${tab} tab: headers and cells hold no ID`, async () => {
          await logs.goto();
          await logs.selectTab(tab);

          const headers = (await logs.columnHeaders.allInnerTexts()).map((text) => text.trim());
          expect(headers[0], 'first column is the row number').toBe('#');
          expect(
            headers.filter((header) => /^(conversation id|call id|id)$/i.test(header)),
          ).toEqual([]);

          const cells = await logs.dataRows.getByRole('cell').allInnerTexts();
          expect(cells.length, 'the list has cells').toBeGreaterThan(0);
          expect(cells.filter((cell) => uuid.test(cell))).toEqual([]);
        });
      }
    },
  );

  test(
    'should number the rows of page 1 from 1 without gaps on the Call and Chat tabs',
    { tag: ['@regression', '@AT-CLOG-017'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      for (const tab of ['call', 'chat'] as const) {
        await test.step(`${tab} tab: "#" is 1..N`, async () => {
          await logs.goto();
          await logs.selectTab(tab);

          const rowCount = Math.min(data.pageSize[tab], await logs.getTotal());
          const numbers = await logs.columnValues('#');
          expect(numbers).toEqual(Array.from({ length: rowCount }, (_, i) => String(i + 1)));
        });
      }
    },
  );

  test(
    'should show well-formed cells in every Call row of the page',
    { tag: ['@regression', '@AT-CLOG-021'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      await logs.goto();

      // Contact is not digits only: callbacks add a tag and some rows hold ids such as "RM_...".
      await logs.expectEveryRowMatches('Contact number', /\S/);
      // PRD UI/UX 4: an empty Journey would show "—", so a non-empty text covers both.
      await logs.expectEveryRowMatches('Journey name', /\S/);
      await logs.expectEveryRowMatches('Date & time', new RegExp(data.formats.dateTimePattern));
      await logs.expectEveryRowMatches('Duration', new RegExp(data.formats.durationPattern));
      await logs.expectEveryRowMatches('Call disposition', /\S/);
      await logs.expectEveryRowMatches('Agent outcome', data.outcomeValues.call);
    },
  );

  test(
    'should show well-formed cells in every Chat row of the page',
    { tag: ['@regression', '@AT-CLOG-022'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      await logs.goto();
      await logs.selectTab('chat');

      await logs.expectEveryRowMatches('Journey name', /\S/);
      await logs.expectEveryRowMatches('Widget', /\S/);
      await logs.expectEveryRowMatches('Date & time', new RegExp(data.formats.dateTimePattern));
      await logs.expectEveryRowMatches('Messages', new RegExp(data.formats.numberPattern));
      await logs.expectEveryRowMatches('Agent outcome', data.outcomeValues.chat);
    },
  );

  test(
    'should list the newest conversation first by default on the Call and Chat tabs',
    { tag: ['@regression', '@AT-CLOG-023'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      for (const tab of ['call', 'chat'] as const) {
        await test.step(`${tab} tab: dates do not increase down the page, no sort is active`, async () => {
          await logs.goto();
          await logs.selectTab(tab);

          const dates = (await logs.columnValues('Date & time')).map(dateTimeValue);
          expect(isSorted(dates, true), 'Date & time is newest first').toBe(true);
          for (const column of data.sorting[tab]) await logs.expectSortState(column, 'none');
        });
      }
    },
  );

  test(
    'should show "—" as plain text, not a chip, for calls without an outcome',
    { tag: ['@regression', '@AT-CLOG-024'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      const { filters, messages } = data;
      let total = 0;

      await test.step('Filter by a disposition that never has an outcome', async () => {
        await logs.goto();
        [{ total }] = await logs.selectFilterValues('disposition', [filters.noRowsDisposition]);
        // Without rows there is nothing to check: skip loudly, never pass empty.
        test.skip(total === 0, `No "${filters.noRowsDisposition}" calls on staging to check`);
        await logs.expectEveryRowMatches('Call disposition', [filters.noRowsDisposition]);
      });

      await test.step('Every Agent outcome cell is a plain "—"', async () => {
        const cells = await logs.cellChips('Agent outcome');
        expect(cells.length).toBeGreaterThan(0);
        expect(cells.filter((cell) => cell.text !== messages.placeholder)).toEqual([]);
        expect(
          cells.filter((cell) => cell.chipClass !== null),
          'no chip in the cell',
        ).toEqual([]);
      });

      await test.step('Call details shows "—" and no outcome chip', async () => {
        await logs.openFirstRow();
        await logs.callDetails.expectOpen();
        await logs.callDetails.expectMetadata('Agent outcome', messages.placeholder);
        await expect(logs.callDetails.outcomeChips(data.outcomeValues.call)).toHaveCount(0);
      });
    },
  );

  test(
    'should give each outcome the same chip variant on the Call and Chat tabs',
    { tag: ['@regression', '@AT-CLOG-025'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      const { chipVariants, filters } = data;

      await test.step('Resolved, Action Required and Escalated use three different variants', async () => {
        expect(new Set(Object.values(chipVariants)).size).toBe(Object.keys(chipVariants).length);
      });

      const outcomesByTab = {
        call: [filters.outcome, filters.secondOutcome, filters.escalatedOutcome],
        chat: [filters.outcome, filters.secondOutcome],
      };
      for (const tab of ['call', 'chat'] as const) {
        for (const outcome of outcomesByTab[tab]) {
          await test.step(`${tab} tab: ${outcome} rows carry ${chipVariants[outcome]}`, async () => {
            await logs.goto();
            await logs.selectTab(tab);
            await logs.selectFilterValues('outcome', [outcome]);
            await logs.expectEveryRowMatches('Agent outcome', [outcome]);

            const cells = await logs.cellChips('Agent outcome');
            expect(
              cells.filter((cell) => !cell.chipClass?.includes(chipVariants[outcome])),
              `every "${outcome}" cell has ${chipVariants[outcome]}`,
            ).toEqual([]);
          });
        }
      }
    },
  );

  test(
    'should offer Dropped in the Chat Agent outcome filter and show only Dropped rows or the empty state',
    { tag: ['@regression', '@AT-CLOG-026'] },
    async ({ conversationLogsPage: logs, conversationLogsData: data }) => {
      const { filters, filterOptions, requestValues, messages } = data;

      await logs.goto();
      await logs.selectTab('chat');

      await test.step('The menu offers all four outcomes', async () => {
        const { names } = await logs.readFilterOptions('outcome');
        expect(names).toEqual(filterOptions.chatOutcomes);
      });

      const [result] = await logs.selectFilterValues('outcome', [filters.droppedOutcome]);
      expect(result.request.resolutions).toEqual([requestValues.outcome[filters.droppedOutcome]]);

      // No Dropped chat exists on staging today; the test is written for both data states.
      /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect */
      if (result.total === 0) {
        await logs.expectEmptyState();
        await expect(logs.emptyMessage(messages.emptyChat, {})).toBeVisible();
      } else {
        await logs.expectEveryRowMatches('Agent outcome', [filters.droppedOutcome]);
      }
      /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
    },
  );
});

test.describe('Conversation Logs - narrow screen', () => {
  test(
    'should have no horizontal page scroll and keep the controls usable at phone width',
    { tag: ['@regression', '@AT-CLOG-105'] },
    async ({ page, conversationLogsPage: logs, conversationLogsData: data }) => {
      await page.setViewportSize(data.viewport);
      await logs.goto();

      await test.step('The page does not scroll sideways', async () => {
        const overflow = () =>
          page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
        await expect
          .poll(overflow, { message: 'horizontal page overflow in px' })
          .toBeLessThanOrEqual(0);
      });

      await test.step('Heading, tabs, search box and Export are visible', async () => {
        await expect(logs.pageHeading).toBeVisible();
        await expect(logs.callTab).toBeVisible();
        await expect(logs.chatTab).toBeVisible();
        await expect(logs.searchBox).toBeVisible();
        await expect(logs.exportButton).toBeVisible();
      });

      await test.step('The table scrolls sideways inside its own container', async () => {
        await expect(logs.tableContainer).toHaveCSS('overflow-x', 'auto');
      });
    },
  );
});
