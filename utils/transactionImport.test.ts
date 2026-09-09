import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { PaymentMethod, Transaction } from '../types';
import { parseImportDate, previewTransactionImport, selectedImportTransactions, transactionExportRows } from './transactionImport';

const headers = ['日期', '類別', '金額', '說明', '支付方式', '銀行'];
const row = ['2026-09-08', '食', '1,200', '合成午餐', '現金', ''];
const existing: Transaction = { id: 'sample', date: '2026-09-08', category: '食', amount: 1200, description: '合成午餐', paymentMethod: PaymentMethod.CASH, cardBank: '-', isReconciled: false };

describe('Excel transaction preview', () => {
    it('reads an actual Excel date cell and a grouped amount without partial conversion', () => {
        const sheet = XLSX.utils.aoa_to_sheet([headers, [new Date(2026, 8, 8), ...row.slice(1)]]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'Synthetic');
        const loaded = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(loaded.Sheets.Synthetic, { header: 1, raw: true, defval: '' });
        const preview = previewTransactionImport(matrix, []);
        expect(preview.errors).toEqual([]);
        expect(preview.rows[0].errors).toEqual([]);
        expect(preview.rows[0].transaction).toMatchObject({ date: '2026-09-08', amount: 1200 });
    });
    it('reports missing headers, missing values, and malformed amounts; imports no partial batch', () => {
        expect(previewTransactionImport([['日期', '金額'], ['2026-09-08', 100]], []).errors).toContain('缺少必要欄位「類別」。');
        const preview = previewTransactionImport([headers, ['', '食', '', '合成資料', '現金', ''], row], []);
        expect(preview.rows[0].transaction).toBeNull();
        expect(preview.rows[0].errors.length).toBe(2);
        expect(selectedImportTransactions(preview, [])).toEqual([]);
        expect(previewTransactionImport([headers, [row[0], row[1], '1200元', ...row.slice(3)]], []).rows[0].errors.join()).toContain('完整數字');
    });
    it('accepts explicit zero and rejects unknown payment values or missing card banks', () => {
        expect(previewTransactionImport([headers, [row[0], row[1], 0, ...row.slice(3)]], []).rows[0].transaction?.amount).toBe(0);
        expect(previewTransactionImport([headers, [...row.slice(0, 4), '信用卡', '測試銀行']], []).rows[0].transaction).toBeNull();
        expect(previewTransactionImport([headers, [...row.slice(0, 4), '刷卡', '']], []).rows[0].transaction).toBeNull();
    });
    it('flags duplicates against existing records and within the same file; requires row-specific opt-in', () => {
        const preview = previewTransactionImport([headers, row, row], []);
        expect(preview.rows.map(result => result.duplicateOf)).toEqual([null, '本檔第 2 列']);
        expect(selectedImportTransactions(preview, [])).toHaveLength(1);
        expect(selectedImportTransactions(preview, [3])).toHaveLength(2);
        const matched = previewTransactionImport([headers, row], [existing]);
        expect(matched.rows[0].duplicateOf).toBe('既有交易');
        expect(selectedImportTransactions(matched, [])).toHaveLength(0);
        expect(selectedImportTransactions(matched, [2])).toHaveLength(1);
    });
    it('preserves groups, installment periods, and reconciliation attribution when exporting and reimporting', () => {
        const transaction: Transaction = { ...existing, paymentMethod: PaymentMethod.CREDIT_CARD, cardBank: '測試銀行', isReconciled: true, reconciledDate: '2026-09-09T00:00:00Z', statementMonth: '2026-09', isInstallment: true, installmentGroupId: 'installment-example', installmentNumber: 1, installmentCount: 3 };
        const exported = transactionExportRows([transaction]);
        const matrix = [Object.keys(exported[0]), Object.values(exported[0])];
        const preview = previewTransactionImport(matrix, []);
        expect(preview.rows[0].errors).toEqual([]);
        expect(preview.rows[0].transaction).toMatchObject({ isReconciled: true, statementMonth: '2026-09', reconciledDate: '2026-09-09T00:00:00Z', installmentGroupId: 'installment-example', installmentNumber: 1, installmentCount: 3 });
    });
    it('keeps source row numbers when blank rows occur', () => {
        expect(previewTransactionImport([headers, [], row], []).rows[0].rowNumber).toBe(3);
    });
});

describe('strict dates', () => {
    it('supports both Excel date systems and refuses the fictitious 1900 leap date', () => {
        expect(parseImportDate(46273)).toBe('2026-09-08');
        expect(parseImportDate(0, true)).toBe('1904-01-01');
        expect(parseImportDate(60)).toBeNull();
        expect(parseImportDate(46273.5)).toBeNull();
    });
    it('rejects missing, ambiguous, and overflow dates instead of defaulting to today', () => {
        for (const value of ['', null, '09/08/2026', '2026-02-30', '2026-13-01']) expect(parseImportDate(value)).toBeNull();
        expect(parseImportDate('2024/2/29')).toBe('2024-02-29');
    });
});
