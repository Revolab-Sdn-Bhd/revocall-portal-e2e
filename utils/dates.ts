/** Date as yyyy-mm-dd (the format of the app's date inputs), `daysAgo` days before today. */
export function isoDate(daysAgo = 0): string {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}
