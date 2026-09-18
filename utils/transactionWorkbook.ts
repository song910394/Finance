import type { Transaction } from '../types';
import { previewTransactionImport, type TransactionImportPreview } from './transactionImport';

export const MAX_EXCEL_IMPORT_BYTES = 10 * 1024 * 1024;
export const EXCEL_IMPORT_SIZE_ERROR = 'Excel 檔案不可超過 10 MiB，請拆分檔案後重新匯入。';

/** 僅建立預覽；大小檢查必須早於檔案讀取與 Excel 解析。 */
export async function previewTransactionFile(file: Pick<File, 'size' | 'arrayBuffer'>, existing: Transaction[]): Promise<TransactionImportPreview> {
    if (file.size > MAX_EXCEL_IMPORT_BYTES) return { rows: [], errors: [EXCEL_IMPORT_SIZE_ERROR] };
    try {
        const buffer = await file.arrayBuffer();
        if (buffer.byteLength > MAX_EXCEL_IMPORT_BYTES) return { rows: [], errors: [EXCEL_IMPORT_SIZE_ERROR] };
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!firstSheet) throw new Error('找不到工作表');
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, raw: true, defval: '', blankrows: true });
        return previewTransactionImport(matrix, existing, { date1904: workbook.Workbook?.WBProps?.date1904 === true });
    } catch {
        return { rows: [], errors: ['無法讀取此檔案，請確認是有效的 Excel 活頁簿。'] };
    }
}
