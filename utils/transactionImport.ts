import { PaymentMethod, Transaction } from '../types';
import { isValidTransactionDate, parseMoney, TransactionDraft } from './transactions';

export interface ImportRow {
    rowNumber: number;
    transaction: TransactionDraft | null;
    errors: string[];
    duplicateOf: string | null;
}

export interface TransactionImportPreview {
    rows: ImportRow[];
    errors: string[];
}

const REQUIRED_HEADERS = ['日期', '類別', '金額', '說明', '支付方式'] as const;
export const TRANSACTION_EXPORT_HEADERS = ['日期', '類別', '金額', '說明', '支付方式', '銀行', '核銷狀態', '核銷時間', '帳單月份', '固定支出', '固定支出群組', '分期付款', '分期群組', '目前期次', '總期數'];
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const empty = (value: unknown): boolean => value === undefined || value === null || value === '';

/** Excel 1900/1904 dates are decoded without timezone-dependent string parsing. */
export function parseImportDate(value: unknown, date1904 = false): string | null {
    if (typeof value === 'string') {
        const normalized = value.trim().replaceAll('/', '-');
        const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
        if (!match) return null;
        const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        return isValidTransactionDate(date) ? date : null;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < (date1904 ? 0 : 1) || value > 2958465 || (!date1904 && value === 60)) return null;
    const offset = date1904 ? value : value - (value > 60 ? 1 : 0);
    const date = new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 31) + offset * 86400000);
    const result = date.toISOString().slice(0, 10);
    return isValidTransactionDate(result) ? result : null;
}

export function transactionFingerprint(transaction: TransactionDraft): string {
    return JSON.stringify([transaction.date, transaction.amount, transaction.category.trim(), transaction.description.trim(), transaction.paymentMethod, transaction.cardBank]);
}

export function previewTransactionImport(matrix: unknown[][], existing: Transaction[], options: { date1904?: boolean } = {}): TransactionImportPreview {
    if (matrix.length < 1) return { rows: [], errors: ['工作表沒有資料。'] };
    const headers = matrix[0].map(text);
    const errors = REQUIRED_HEADERS.filter(header => !headers.includes(header)).map(header => `缺少必要欄位「${header}」。`);
    const duplicates = headers.filter((header, index) => header && headers.indexOf(header) !== index);
    if (duplicates.length) errors.push(`欄位名稱重複：${Array.from(new Set(duplicates)).join('、')}。`);
    if (errors.length) return { rows: [], errors };
    const seen = new Map(existing.map(transaction => [transactionFingerprint(transaction), '既有交易']));
    const rows: ImportRow[] = [];
    matrix.slice(1).forEach((cells, index) => {
        if (cells.every(empty)) return;
        const read = (header: string): unknown => cells[headers.indexOf(header)];
        const rowErrors: string[] = [];
        const date = parseImportDate(read('日期'), options.date1904);
        const amount = parseMoney(read('金額'));
        const category = text(read('類別'));
        const description = text(read('說明'));
        const method = text(read('支付方式'));
        const bank = text(read('銀行'));
        if (!date) rowErrors.push('日期需為有效西元年月日或 Excel 日期（不可空白）。');
        if (amount === null) rowErrors.push('金額需為完整數字（不可空白；千分位可用 1,200）。');
        if (!category) rowErrors.push('類別不可空白。');
        if (!description) rowErrors.push('說明不可空白。');
        if (method !== PaymentMethod.CASH && method !== PaymentMethod.CREDIT_CARD) rowErrors.push('支付方式需為「現金」或「刷卡」。');
        if (method === PaymentMethod.CREDIT_CARD && (!bank || bank === '-')) rowErrors.push('刷卡交易需填寫銀行。');
        if (method === PaymentMethod.CASH && bank && bank !== '-') rowErrors.push('現金交易的銀行應留白或填「-」。');
        const readFlag = (header: string): boolean => {
            const raw = read(header);
            const value = text(raw);
            if (!empty(raw) && value !== '是' && value !== '否') rowErrors.push(`${header}需為「是」或「否」。`);
            return value === '是';
        };
        const isRecurring = readFlag('固定支出');
        const isInstallment = readFlag('分期付款');
        if (isRecurring && isInstallment) rowErrors.push('同一筆不可同時標示固定支出與分期付款。');
        if (isInstallment && method !== PaymentMethod.CREDIT_CARD) rowErrors.push('分期付款需使用刷卡。');
        const reconciliation = text(read('核銷狀態'));
        if (!empty(read('核銷狀態')) && !['已核銷', '未核銷', '已對帳', '未對帳'].includes(reconciliation)) rowErrors.push('核銷狀態需為已核銷／未核銷。');
        const isReconciled = ['已核銷', '已對帳'].includes(reconciliation);
        if (isReconciled && method !== PaymentMethod.CREDIT_CARD) rowErrors.push('現金交易不可標示信用卡已核銷。');
        const recurringGroupId = text(read('固定支出群組')) || undefined;
        const installmentGroupId = text(read('分期群組')) || undefined;
        const numberValue = read('目前期次');
        const countValue = read('總期數');
        const installmentNumber = empty(numberValue) ? undefined : parseMoney(numberValue);
        const installmentCount = empty(countValue) ? undefined : parseMoney(countValue);
        const hasInstallmentMetadata = Boolean(installmentGroupId) || !empty(numberValue) || !empty(countValue);
        if (hasInstallmentMetadata && (!isInstallment || !installmentGroupId || !Number.isInteger(installmentNumber) || !Number.isInteger(installmentCount) || (installmentNumber ?? 0) < 1 || (installmentCount ?? 0) < 2 || (installmentNumber ?? 0) > (installmentCount ?? 0))) rowErrors.push('分期群組、目前期次與總期數需完整且一致。');
        if (recurringGroupId && !isRecurring) rowErrors.push('固定支出群組需搭配固定支出標示。');
        const reconciledDate = text(read('核銷時間')) || undefined;
        if (reconciledDate && (!isReconciled || !/^\d{4}-\d{2}-\d{2}T/.test(reconciledDate) || !Number.isFinite(Date.parse(reconciledDate)))) rowErrors.push('核銷時間需為有效時間戳記且交易已核銷。');
        const statementMonth = text(read('帳單月份')) || undefined;
        if (statementMonth && (!isReconciled || !isValidTransactionDate(`${statementMonth}-01`))) rowErrors.push('帳單月份需為 YYYY-MM，且交易已核銷。');
        const transaction: TransactionDraft | null = rowErrors.length || !date || amount === null ? null : {
            date, amount, category, description,
            paymentMethod: method as PaymentMethod,
            cardBank: method === PaymentMethod.CASH ? '-' : bank,
            isReconciled, isRecurring, isInstallment,
            ...(recurringGroupId ? { recurringGroupId } : {}),
            ...(hasInstallmentMetadata ? { installmentGroupId, installmentNumber: installmentNumber!, installmentCount: installmentCount! } : {}),
            ...(reconciledDate ? { reconciledDate } : {}),
            ...(statementMonth ? { statementMonth } : {}),
        };
        const fingerprint = transaction ? transactionFingerprint(transaction) : '';
        const duplicateOf = transaction ? seen.get(fingerprint) ?? null : null;
        if (transaction && !seen.has(fingerprint)) seen.set(fingerprint, `本檔第 ${index + 2} 列`);
        rows.push({ rowNumber: index + 2, transaction, errors: rowErrors, duplicateOf });
    });
    return { rows, errors: rows.length ? [] : ['工作表沒有可匯入的資料列。'] };
}

export function selectedImportTransactions(preview: TransactionImportPreview, includedDuplicateRows: number[]): TransactionDraft[] {
    if (preview.errors.length || preview.rows.some(row => row.errors.length)) return [];
    return preview.rows.filter(row => row.transaction && (!row.duplicateOf || includedDuplicateRows.includes(row.rowNumber))).map(row => row.transaction!);
}

export function transactionExportRows(transactions: Transaction[]): Record<string, unknown>[] {
    return transactions.map(transaction => ({
        日期: transaction.date, 類別: transaction.category, 金額: transaction.amount, 說明: transaction.description,
        支付方式: transaction.paymentMethod, 銀行: transaction.cardBank === '-' ? '' : transaction.cardBank,
        核銷狀態: transaction.isReconciled ? '已核銷' : '未核銷', 核銷時間: transaction.reconciledDate ?? '', 帳單月份: transaction.statementMonth ?? '',
        固定支出: transaction.isRecurring ? '是' : '否', 固定支出群組: transaction.recurringGroupId ?? '',
        分期付款: transaction.isInstallment ? '是' : '否', 分期群組: transaction.installmentGroupId ?? '',
        目前期次: transaction.installmentNumber ?? '', 總期數: transaction.installmentCount ?? '',
    }));
}
