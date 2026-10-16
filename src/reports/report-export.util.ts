import * as XLSX from 'xlsx';

export type ExportCell = string | number | boolean | null;
export type ExportRow = readonly ExportCell[];

export function protectSpreadsheetText(value: ExportCell): ExportCell {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: ExportCell): string {
  const safeValue = String(protectSpreadsheetText(value) ?? '');
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function renderCsv(headers: readonly string[], rows: readonly ExportRow[]): Buffer {
  const body = [headers, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
  return Buffer.from(`\uFEFF${body}\r\n`, 'utf8');
}

export function renderXlsx(headers: readonly string[], rows: readonly ExportRow[]): Buffer {
  const worksheetRows = [headers, ...rows].map((row) =>
    row.map((value) => protectSpreadsheetText(value)),
  );
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export function reportFilename(reportName: string, dateFrom: string, dateTo: string, format: 'csv' | 'xlsx'): string {
  return `${reportName}-${dateFrom}-to-${dateTo}.${format}`;
}
