const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "3 Nov 2026, 1:23 AM" (the list's Date & time cell) as a number that sorts in time order.
 * The value is a wall-clock reading, not a real timestamp: only compare two of them with each other.
 */
export function dateTimeValue(text: string): number {
  const match = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4}), (\d{1,2}):(\d{2}) (AM|PM)$/.exec(text.trim());
  if (!match) throw new Error(`Not a list date and time: "${text}"`);
  const [, day, month, year, hour, minute, meridiem] = match;
  const hours24 = (Number(hour) % 12) + (meridiem === 'PM' ? 12 : 0);
  return Date.UTC(Number(year), MONTHS.indexOf(month), Number(day), hours24, Number(minute));
}

/** "1m 22s" (the list's Duration cell) in seconds. */
export function durationSeconds(text: string): number {
  const match = /^(\d+)m (\d+)s$/.exec(text.trim());
  if (!match) throw new Error(`Not a list duration: "${text}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** True when every value is >= the one before it (or <= when `descending`). Ties are allowed. */
export function isSorted(values: number[], descending = false): boolean {
  return values.every((value, index) =>
    index === 0 ? true : descending ? value <= values[index - 1] : value >= values[index - 1],
  );
}
