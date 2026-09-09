import { PaymentMethod, Transaction } from '../types';
import { formatLocalDate, parseLocalDate } from './billing';

export type TransactionDraft = Omit<Transaction, 'id'>;
export type EditableTransactionFields = Pick<Transaction, 'date' | 'amount' | 'paymentMethod' | 'cardBank' | 'category' | 'description'>;

/** Reject partial parses such as "1,200oops" and keep an explicit zero distinct from a blank. */
export function parseMoney(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : null;
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return null;
    const number = Number(text.replaceAll(',', ''));
    return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? number : null;
}

export function isValidTransactionDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = parseLocalDate(value);
    return Number.isFinite(parsed.getTime()) && formatLocalDate(parsed) === value;
}

export function dateAtMonthOffset(date: string, monthOffset: number): string {
    const base = parseLocalDate(date);
    const target = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(base.getDate(), lastDay));
    return formatLocalDate(target);
}

export function needsReconciliationReset(original: Transaction, next: EditableTransactionFields): boolean {
    return original.isReconciled && (original.date !== next.date || original.amount !== next.amount ||
        original.paymentMethod !== next.paymentMethod || original.cardBank !== next.cardBank);
}

export function prepareTransactionEdit(original: Transaction, next: EditableTransactionFields, confirmReset: boolean): TransactionDraft {
    const reset = needsReconciliationReset(original, next);
    if (reset && !confirmReset) throw new Error('此筆已對帳；請先確認取消核銷，儲存後重新對帳。');
    const { id: _id, ...metadata } = original;
    const { date, amount, paymentMethod, cardBank, category, description } = next;
    return {
        ...metadata,
        date, amount, paymentMethod, cardBank, category, description,
        ...(reset ? { isReconciled: false, reconciledDate: undefined, statementMonth: undefined } : {}),
    };
}

/** Retain the existing whole-dollar distribution: the first period carries the difference. */
export function buildTransactionSchedule(base: TransactionDraft, mode: 'single' | 'recurring' | 'installment', count = 1, groupId = ''): TransactionDraft[] {
    if (!isValidTransactionDate(base.date) || !Number.isFinite(base.amount)) throw new Error('請填寫有效日期與金額。');
    const { date, amount, paymentMethod, cardBank, category, description } = base;
    const newBase: TransactionDraft = { date, amount, paymentMethod, cardBank, category, description, isReconciled: false };
    if (mode === 'single') return [{ ...newBase, isRecurring: false, isInstallment: false }];
    if (!groupId) throw new Error('缺少群組識別碼。');
    const length = mode === 'recurring' ? 12 : count;
    if (!Number.isInteger(length) || length < 2 || length > 60) throw new Error('分期期數需為 2 至 60 的整數。');
    if (mode === 'installment' && base.paymentMethod !== PaymentMethod.CREDIT_CARD) throw new Error('分期付款需使用信用卡。');
    const perPeriod = Math.floor(base.amount / length);
    const firstPeriod = base.amount - perPeriod * (length - 1);
    return Array.from({ length }, (_, index) => ({
        ...newBase,
        date: dateAtMonthOffset(base.date, index),
        amount: mode === 'recurring' ? base.amount : index === 0 ? firstPeriod : perPeriod,
        description: mode === 'recurring' ? (index === 0 ? base.description : `${base.description} (固定支出)`) : `${base.description} (${index + 1}/${length})`,
        isRecurring: mode === 'recurring',
        isInstallment: mode === 'installment',
        ...(mode === 'recurring' ? { recurringGroupId: groupId } : { installmentGroupId: groupId, installmentNumber: index + 1, installmentCount: length }),
    }));
}

export function clampTransactionPage(page: number, itemCount: number, pageSize = 20): number {
    return Math.max(1, Math.min(page, Math.max(1, Math.ceil(itemCount / pageSize))));
}

export function growthPercent(first: number, last: number): number | null {
    const value = first > 0 && Number.isFinite(first) && Number.isFinite(last) ? ((last - first) / first) * 100 : null;
    return value !== null && Number.isFinite(value) ? value : null;
}
