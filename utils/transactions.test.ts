import { describe, expect, it } from 'vitest';
import { PaymentMethod, Transaction } from '../types';
import { buildTransactionSchedule, clampTransactionPage, dateAtMonthOffset, growthPercent, parseMoney, prepareTransactionEdit } from './transactions';

const transaction: Transaction = { id: 'example', date: '2026-01-31', amount: 1000, category: '住', description: '合成交易', paymentMethod: PaymentMethod.CREDIT_CARD, cardBank: '測試銀行', isReconciled: true, reconciledDate: '2026-02-05T08:00:00Z', statementMonth: '2026-02', recurringGroupId: 'existing-group', isRecurring: true };

describe('strict monetary parsing', () => {
    it('distinguishes an explicit zero from missing or partially valid input', () => {
        for (const value of ['', ' ', undefined, null, '1200元', '1,20', 'NaN', Infinity, '1e3']) expect(parseMoney(value)).toBeNull();
        expect(parseMoney('0')).toBe(0);
        expect(parseMoney('1,200.50')).toBe(1200.5);
        expect(parseMoney('-25.5')).toBe(-25.5);
    });
});

describe('transaction edits and reconciliation', () => {
    it('retains reconciliation and group metadata on description/category edits', () => {
        const updated = prepareTransactionEdit(transaction, { ...transaction, description: '修正說明', category: '其他' }, false);
        expect(updated.isReconciled).toBe(true);
        expect(updated.reconciledDate).toBe(transaction.reconciledDate);
        expect(updated.statementMonth).toBe('2026-02');
        expect(updated.recurringGroupId).toBe('existing-group');
        expect(updated).not.toHaveProperty('id');
    });
    it.each([{ amount: 1200 }, { date: '2026-02-01' }, { cardBank: '另一家銀行' }, { paymentMethod: PaymentMethod.CASH, cardBank: '-' }])('requires explicit consent for changes to billed values: %j', change => {
        expect(() => prepareTransactionEdit(transaction, { ...transaction, ...change }, false)).toThrow('確認取消核銷');
        const updated = prepareTransactionEdit(transaction, { ...transaction, ...change }, true);
        expect(updated.isReconciled).toBe(false);
        expect(updated.reconciledDate).toBeUndefined();
        expect(updated.statementMonth).toBeUndefined();
    });
});

describe('fixed and installment scheduling', () => {
    it('keeps the day anchored after a shorter month and handles leap years', () => {
        expect(dateAtMonthOffset('2024-01-31', 1)).toBe('2024-02-29');
        expect(dateAtMonthOffset('2024-01-31', 2)).toBe('2024-03-31');
        const schedule = buildTransactionSchedule({ ...transaction, isReconciled: false }, 'recurring', 1, 'recurring-example');
        expect(schedule).toHaveLength(12);
        expect(schedule[11].date).toBe('2026-12-31');
        expect(schedule.every(row => row.recurringGroupId === 'recurring-example' && row.amount === 1000)).toBe(true);
    });
    it.each([1000, 1000.25, -1000, 0.0000001])('preserves total %s and assigns stable group and period metadata', amount => {
        const schedule = buildTransactionSchedule({ ...transaction, amount, isReconciled: false }, 'installment', 3, 'installment-example');
        expect(schedule.reduce((total, row) => total + row.amount, 0)).toBeCloseTo(amount, 8);
        expect(schedule.map(row => row.installmentNumber)).toEqual([1, 2, 3]);
        expect(schedule.every(row => row.installmentGroupId === 'installment-example' && row.installmentCount === 3)).toBe(true);
        expect(schedule.every(row => row.recurringGroupId === undefined && row.statementMonth === undefined && row.isReconciled === false)).toBe(true);
        expect(schedule.map(row => row.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    });
    it('rejects invalid period counts instead of falling back to one period', () => {
        for (const count of [0, 1, 2.5, 61, NaN]) expect(() => buildTransactionSchedule(transaction, 'installment', count, 'group')).toThrow();
    });
});

it('keeps the remaining records reachable after deleting the only item on the last page', () => {
    expect(clampTransactionPage(2, 20)).toBe(1);
    expect(clampTransactionPage(2, 21)).toBe(2);
    expect(clampTransactionPage(1, 0)).toBe(1);
});

it('does not invent a zero growth rate when the baseline cannot support a percentage', () => {
    expect(growthPercent(0, 30000)).toBeNull();
    expect(growthPercent(0, 0)).toBeNull();
    expect(growthPercent(30000, 33000)).toBe(10);
});
