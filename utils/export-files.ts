import * as fs from 'fs';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { parse } from 'csv-parse/sync';

/** A parsed CSV: header row, one record per data row (keyed by header), and whether it had a UTF-8 BOM. */
export type CsvTable = {
  header: string[];
  rows: Record<string, string>[];
  hasBom: boolean;
};

const BOM = '﻿';

/** Parses CSV text with a real parser (messages contain commas and line breaks inside quotes). */
export function parseCsv(text: string): CsvTable {
  const hasBom = text.startsWith(BOM);
  const records: string[][] = parse(hasBom ? text.slice(1) : text, {
    relax_column_count: true,
    skip_empty_lines: true,
  });
  const [header = [], ...data] = records;
  const rows = data.map((record) =>
    Object.fromEntries(header.map((name, index) => [name, record[index] ?? ''])),
  );
  return { header, rows, hasBom };
}

export function readCsvFile(filePath: string): CsvTable {
  return parseCsv(fs.readFileSync(filePath, 'utf-8'));
}

/** Every file inside a zip as text, keyed by entry name. */
export async function readZipEntries(filePath: string): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const entries: Record<string, string> = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir) entries[name] = await entry.async('string');
  }
  return entries;
}

/** One worksheet as plain values: the header row and one record per data row. */
export type SheetTable = {
  name: string;
  header: string[];
  rows: Record<string, unknown>[];
  /** Every row as an array of cell values (column A first), including the header. */
  raw: unknown[][];
};

const plain = (value: ExcelJS.CellValue): unknown => {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return value.result;
    if ('text' in value) return value.text;
  }
  return value ?? null;
};

/** Opens an .xlsx file and returns its sheets in order. */
export async function readWorkbook(filePath: string): Promise<SheetTable[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook.worksheets.map((sheet) => {
    const raw: unknown[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      raw.push((row.values as ExcelJS.CellValue[]).slice(1).map(plain));
    });
    // Drop trailing empty rows the reader may add.
    while (raw.length && raw[raw.length - 1].every((cell) => cell === null || cell === '')) {
      raw.pop();
    }
    const header = (raw[0] ?? []).map((cell) => String(cell ?? ''));
    const rows = raw
      .slice(1)
      .map((cells) =>
        Object.fromEntries(header.map((name, index) => [name, cells[index] ?? null])),
      );
    return { name: sheet.name, header, rows, raw };
  });
}

export function sheetByName(sheets: SheetTable[], name: string): SheetTable {
  const sheet = sheets.find((candidate) => candidate.name === name);
  if (!sheet) {
    throw new Error(`Sheet "${name}" not found, the file has: ${sheets.map((s) => s.name)}`);
  }
  return sheet;
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What the Excel "About this export" sheet says: label/value pairs, rows per sheet, and the column glossary. */
export type AboutInfo = {
  fields: Record<string, string>;
  rowsPerSheet: Record<string, number>;
  glossary: string[];
};

/**
 * Reads the About sheet. It has three blocks separated by empty rows: Item/Value pairs, a
 * "Rows per sheet" list, and a glossary titled `glossaryTitle` (Column/Description pairs).
 */
export function readAbout(
  sheet: SheetTable,
  rowsPerSheetTitle: string,
  glossaryTitle: string,
): AboutInfo {
  const fields: Record<string, string> = {};
  const rowsPerSheet: Record<string, number> = {};
  const glossary: string[] = [];
  let block: 'fields' | 'rows' | 'glossary' = 'fields';
  let skip = 0;
  for (const [label, value] of sheet.raw.slice(1)) {
    const key = label === null || label === undefined ? '' : String(label);
    if (key === '') continue;
    if (key === rowsPerSheetTitle) {
      block = 'rows';
      continue;
    }
    if (key === glossaryTitle) {
      block = 'glossary';
      skip = 1; // the "Column / Description" header row
      continue;
    }
    if (block === 'fields') fields[key] = String(value ?? '');
    else if (block === 'rows') rowsPerSheet[key] = Number(value);
    else if (skip > 0) skip--;
    else glossary.push(key);
  }
  return { fields, rowsPerSheet, glossary };
}
