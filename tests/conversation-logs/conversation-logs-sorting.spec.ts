import { test, expect } from '../../fixtures/base.fixture';
import { dateTimeValue, durationSeconds, isSorted } from '../../utils/conversation-logs';

/** The rows are replaced a moment after the list response, so the order is polled, not read once. */
const expectOrder = (values: () => Promise<number[]>, descending = false) =>
  expect
    .poll(async () => isSorted(await values(), descending), { message: 'rows are in order' })
    .toBe(true);

/*
 * Column sorting (staging behaviour, not in the PRD). Each sortable header is a button that cycles
 * through its sort states; the order is judged on the rows of the page and ties are allowed.
 * Date & time starts descending; Contact number, Duration and Messages start ascending.
 */
test.describe('Conversation Logs - sorting', () => {
  test(
    'should cycle Date & time through descending, ascending and the default order',
    { tag: ['@regression', '@AT-CLOG-065'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { pageSize } }) => {
      const dates = async () => (await logs.columnValues('Date & time')).map(dateTimeValue);
      await logs.goto();
      expect(await logs.getTotal(), 'the list has a second page').toBeGreaterThan(pageSize.call);
      await logs.nextPage();

      await test.step('Click 1: descending, newest first, back on page 1', async () => {
        const result = await logs.sortBy('Date & time');
        await logs.expectSortState('Date & time', 'descending');
        expect(result.request).toMatchObject({ sortBy: 'date', sortDesc: true });
        expect(result.request.skip ?? 0, 'sorting returns to page 1').toBe(0);
        await expect(logs.pageIndicator).toHaveText(/^Page 1 of /);
        await expectOrder(dates, true);
      });

      await test.step('Click 2: ascending, oldest first', async () => {
        const result = await logs.sortBy('Date & time');
        await logs.expectSortState('Date & time', 'ascending');
        expect(result.request).toMatchObject({ sortBy: 'date', sortDesc: false });
        await expectOrder(dates);
      });

      await test.step('Click 3: no sort, the newest first again', async () => {
        const result = await logs.sortBy('Date & time');
        await logs.expectSortState('Date & time', 'none');
        expect(result.request).not.toHaveProperty('sortBy');
        await expectOrder(dates, true);
      });
    },
  );

  test(
    'should sort the Call list by Duration ascending, then descending, then the default order',
    { tag: ['@regression', '@AT-CLOG-066'] },
    async ({ conversationLogsPage: logs }) => {
      const seconds = async () => (await logs.columnValues('Duration')).map(durationSeconds);
      const dates = async () => (await logs.columnValues('Date & time')).map(dateTimeValue);
      await logs.goto();

      await test.step('Click 1: ascending', async () => {
        const result = await logs.sortBy('Duration');
        await logs.expectSortState('Duration', 'ascending');
        expect(result.request).toMatchObject({ sortBy: 'duration', sortDesc: false });
        await expectOrder(seconds);
      });

      await test.step('Click 2: descending', async () => {
        const result = await logs.sortBy('Duration');
        await logs.expectSortState('Duration', 'descending');
        expect(result.request).toMatchObject({ sortBy: 'duration', sortDesc: true });
        await expectOrder(seconds, true);
      });

      await test.step('Click 3: no sort, newest first', async () => {
        const result = await logs.sortBy('Duration');
        await logs.expectSortState('Duration', 'none');
        expect(result.request).not.toHaveProperty('sortBy');
        await expectOrder(dates, true);
      });
    },
  );

  test(
    'should send the Contact number sort and reorder the page',
    { tag: ['@regression', '@AT-CLOG-067'] },
    async ({ conversationLogsPage: logs }) => {
      await logs.goto();

      // The order of digits against text ("RM_...") is the server's, so it is not asserted.
      const ascending = await logs.sortBy('Contact number');
      await logs.expectSortState('Contact number', 'ascending');
      expect(ascending.request).toMatchObject({ sortBy: 'contact', sortDesc: false });
      const firstAscending = (await logs.columnValues('Contact number'))[0];

      const descending = await logs.sortBy('Contact number');
      await logs.expectSortState('Contact number', 'descending');
      expect(descending.request).toMatchObject({ sortBy: 'contact', sortDesc: true });
      expect((await logs.columnValues('Contact number'))[0]).not.toBe(firstAscending);

      const none = await logs.sortBy('Contact number');
      await logs.expectSortState('Contact number', 'none');
      expect(none.request).not.toHaveProperty('sortBy');
    },
  );

  test(
    'should sort the Chat list by Date & time and by Messages in both directions',
    { tag: ['@regression', '@AT-CLOG-068'] },
    async ({ conversationLogsPage: logs }) => {
      await logs.goto();
      await logs.selectTab('chat');
      const dates = async () => (await logs.columnValues('Date & time')).map(dateTimeValue);

      await test.step('Date & time: descending, then ascending', async () => {
        const first = await logs.sortBy('Date & time');
        expect(first.request).toMatchObject({ sortBy: 'date', sortDesc: true });
        await expectOrder(dates, true);

        const second = await logs.sortBy('Date & time');
        expect(second.request).toMatchObject({ sortBy: 'date', sortDesc: false });
        await expectOrder(dates);
      });

      await test.step('Messages: the sort request is sent in both directions', async () => {
        await logs.goto();
        await logs.selectTab('chat');
        const first = await logs.sortBy('Messages');
        await logs.expectSortState('Messages', 'ascending');
        expect(first.request).toMatchObject({ sortBy: 'messages', sortDesc: false });

        const second = await logs.sortBy('Messages');
        await logs.expectSortState('Messages', 'descending');
        expect(second.request).toMatchObject({ sortBy: 'messages', sortDesc: true });
      });
    },
  );

  test(
    'should order the Chat rows by Messages when sorting by Messages',
    {
      tag: ['@regression', '@AT-CLOG-068'],
      annotation: {
        type: 'suspected-bug',
        description:
          'Chat Messages sort has no effect: the rows come back in the same order in both directions (not yet filed)',
      },
    },
    async ({ conversationLogsPage: logs }) => {
      test.fail();
      await logs.goto();
      await logs.selectTab('chat');
      const messages = async () => (await logs.columnValues('Messages')).map(Number);

      await logs.sortBy('Messages');
      await expectOrder(messages);

      await logs.sortBy('Messages');
      await expectOrder(messages, true);
    },
  );

  test(
    'should sort one column at a time and give the other headers no sort button',
    { tag: ['@regression', '@AT-CLOG-069'] },
    async ({ conversationLogsPage: logs, conversationLogsData: { sorting } }) => {
      await logs.goto();

      await logs.sortBy('Duration');
      await logs.expectSortState('Duration', 'ascending');

      await logs.sortBy('Date & time');
      await logs.expectSortState('Date & time', 'descending');
      await logs.expectSortState('Duration', 'none');

      for (const header of sorting.callNotSortable) {
        await expect(logs.columnHeader(header)).toBeVisible();
        await expect(logs.sortButton(header)).toHaveCount(0);
      }
    },
  );
});
