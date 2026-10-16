import * as XLSX from 'xlsx';
import { protectSpreadsheetText, renderCsv, renderXlsx } from './report-export.util.js';

describe('report export escaping', () => {
  it('prefixes formula-like text, including tab and carriage return', () => {
    for (const value of ['=1+1', '+SUM(A1:A2)', '-cmd', '@value', '\tformula', '\rformula']) {
      expect(protectSpreadsheetText(value)).toBe(`'${value}`);
    }
    expect(protectSpreadsheetText('ordinary text')).toBe('ordinary text');
    expect(protectSpreadsheetText(12)).toBe(12);
  });

  it('emits UTF-8 BOM and RFC 4180 escaped cells', () => {
    const output = renderCsv(['name', 'note'], [['မင်္ဂလာပါ', 'a,"b"\r\nnext']]);
    expect(output.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(output.toString('utf8')).toBe('\uFEFF"name","note"\r\n"မင်္ဂလာပါ","a,""b""\r\nnext"\r\n');
  });

  it('protects formula injection in CSV text cells', () => {
    expect(renderCsv(['value'], [['=HYPERLINK("https://bad")']]).toString('utf8'))
      .toBe('\uFEFF"value"\r\n"\'=HYPERLINK(""https://bad"")"\r\n');
  });

  it('protects free-text cells in both CSV and XLSX exports', () => {
    const values = ['=HYPERLINK("https://bad")', '+1 555', '-2', '@x', '\tformula', '+Rider', '-note'];
    const protectedValues = values.map((value) => `'${value}`);
    const headers = ['customerName', 'customerPhone', 'deliveryAddress', 'shopName', 'townshipName', 'assigneeName', 'notes'];

    const csvWorkbook = XLSX.read(renderCsv(headers, [values]).toString('utf8'), { type: 'string' });
    const csvWorksheet = csvWorkbook.Sheets[csvWorkbook.SheetNames[0] ?? ''];
    expect(csvWorksheet).toBeDefined();
    const csvRows = XLSX.utils.sheet_to_json<unknown[]>(csvWorksheet, { header: 1, raw: false });
    expect(csvRows[1]).toEqual(protectedValues);

    const workbook = XLSX.read(renderXlsx(headers, [values]), { type: 'buffer' });
    const worksheet = workbook.Sheets.Report;
    expect(worksheet).toBeDefined();
    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false });
    expect(sheetRows[1]).toEqual(protectedValues);
  });
});
