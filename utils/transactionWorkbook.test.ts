import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { PaymentMethod, type Transaction } from '../types';
import { selectedImportTransactions, transactionExportRows, TRANSACTION_EXPORT_HEADERS } from './transactionImport';
import { EXCEL_IMPORT_SIZE_ERROR, MAX_EXCEL_IMPORT_BYTES, previewTransactionFile } from './transactionWorkbook';

const existing: Transaction = { id: 'synthetic', date: '2026-09-08', category: '食', amount: 1200, description: '合成午餐', paymentMethod: PaymentMethod.CASH, cardBank: '-', isReconciled: false };
const workbookFile = (matrix: unknown[][], bookType: XLSX.BookType = 'xlsx') => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), '合成資料');
    return new Blob([XLSX.write(workbook, { type: 'array', bookType })]);
};

describe('Excel 檔案匯入防護與格式相容性', () => {
    it('超過上限不讀檔、不產生可匯入資料，保留既有交易', async () => {
        const records = [structuredClone(existing)];
        const before = JSON.stringify(records);
        const arrayBuffer = vi.fn();
        const preview = await previewTransactionFile({ size: MAX_EXCEL_IMPORT_BYTES + 1, arrayBuffer }, records);
        expect(arrayBuffer).not.toHaveBeenCalled();
        expect(preview).toEqual({ rows: [], errors: [EXCEL_IMPORT_SIZE_ERROR] });
        expect(selectedImportTransactions(preview, [2])).toEqual([]);
        expect(JSON.stringify(records)).toBe(before);
    });

    it('上限邊界允許讀取；讀檔失敗不產生可匯入資料', async () => {
        const arrayBuffer = vi.fn().mockRejectedValue(new Error('合成讀檔失敗'));
        const preview = await previewTransactionFile({ size: MAX_EXCEL_IMPORT_BYTES, arrayBuffer }, [existing]);
        expect(arrayBuffer).toHaveBeenCalledOnce();
        expect(preview.errors.join()).toContain('無法讀取');
        expect(selectedImportTransactions(preview, [])).toEqual([]);
    });

    it('毀損檔、缺少欄位及混有無效列的批次都不得部分匯入', async () => {
        const headers = ['日期', '類別', '金額', '說明', '支付方式', '銀行'];
        const files = [new Blob([new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])]), workbookFile([['日期'], ['2026-09-08']]), workbookFile([headers, ['2026-09-08', '食', 1200, '合成午餐', '現金', ''], ['', '食', '', '合成錯誤', '現金', '']])];
        const records = [structuredClone(existing)];
        const before = JSON.stringify(records);
        for (const file of files) {
            const preview = await previewTransactionFile(file, records);
            expect(preview.errors.length + preview.rows.flatMap(row => row.errors).length).toBeGreaterThan(0);
            expect(selectedImportTransactions(preview, [2, 3])).toEqual([]);
            expect(JSON.stringify(records)).toBe(before);
        }
    });

    it.each(['xlsx', 'biff8'] as const)('%s 匯出再匯入保留中文、分期與核銷欄位', async bookType => {
        const records: Transaction[] = [existing, { ...existing, id: 'synthetic-card', paymentMethod: PaymentMethod.CREDIT_CARD, cardBank: '合成銀行', description: '=HYPERLINK("https://example.test", "合成文字")', isReconciled: true, reconciledDate: '2026-09-09T00:00:00Z', statementMonth: '2026-09', isInstallment: true, installmentGroupId: 'synthetic-group', installmentNumber: 1, installmentCount: 3 }];
        const rows = transactionExportRows(records);
        const file = workbookFile([TRANSACTION_EXPORT_HEADERS, ...rows.map(row => TRANSACTION_EXPORT_HEADERS.map(header => row[header]))], bookType);
        const preview = await previewTransactionFile(file, []);
        expect(preview.errors).toEqual([]);
        expect(preview.rows.flatMap(row => row.errors)).toEqual([]);
        expect(selectedImportTransactions(preview, [])).toMatchObject(records.map(({ id, ...record }) => record));
        const loaded = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        expect(loaded.Sheets[loaded.SheetNames[0]].D3).toMatchObject({ t: 's', v: records[1].description });
        expect(loaded.Sheets[loaded.SheetNames[0]].D3.f).toBeUndefined();
    });
});
