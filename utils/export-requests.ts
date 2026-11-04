import type { Request, Response } from '@playwright/test';

/** The query parameters an export request was sent with (the matchers in api.ts match on the path only). */
export function exportParams(traffic: Request | Response): URLSearchParams {
  return new URL(traffic.url()).searchParams;
}

/** Sections the Call export asked for, from the `sections` parameter (absent when none are ticked). */
export function exportSections(traffic: Request | Response): string[] {
  const value = exportParams(traffic).get('sections');
  return value ? value.split(',') : [];
}

/** Body of GET /api/calllog/v2/export/count. */
export type ExportCount = { call_count: number; test_call_count: number; too_many: boolean };

export async function readExportCount(response: Response): Promise<ExportCount> {
  return (await response.json()) as ExportCount;
}
