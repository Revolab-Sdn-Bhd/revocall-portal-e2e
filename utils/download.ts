import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Download } from '@playwright/test';

/**
 * Saves a download to a fresh temp folder, runs `inspect` on the saved file, then always deletes the
 * folder, so no exported data stays on disk after the test (pass or fail).
 */
export async function inspectDownload<T>(
  download: Download,
  inspect: (file: { path: string; name: string; size: number }) => T | Promise<T>,
): Promise<T> {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'revocall-export-'));
  try {
    const name = download.suggestedFilename();
    const filePath = path.join(folder, name);
    await download.saveAs(filePath);
    return await inspect({ path: filePath, name, size: fs.statSync(filePath).size });
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
