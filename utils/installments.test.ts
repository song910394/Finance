import { describe, expect, it } from 'vitest';
import { PaymentMethod, Transaction } from '../types';
import { summarizeInstallments } from './installments';

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: 'transaction', date: '2026-01-31', amount: 334, paymentMethod: PaymentMethod.CREDIT_CARD,
    cardBank: '玉山', category: '其他', description: '手機 (1/3)', isReconciled: false,
    isInstallment: true, installmentGroupId: 'plan-a', installmentNumber: 1, installmentCount: 3,
    ...overrides,
});

describe('summarizeInstallments', () => {
    it('同名但不同 ID 的分期各自統計；舊資料不依名稱合併', () => {
        const result = summarizeInstallments([
            transaction(),
            transaction({ id: 'other', installmentGroupId: 'plan-b', cardBank: '國泰', installmentCount: 24 }),
            transaction({ id: 'legacy', installmentGroupId: undefined, installmentNumber: undefined, installmentCount: undefined }),
        ], '2026-01');
        expect(result.groups.map(group => group.id)).toEqual(['plan-a', 'plan-b']);
        expect(result.unconfirmed.map(t => t.id)).toEqual(['legacy']);
    });

    it('加總實際明細，保留首期餘數；核銷不宣稱已繳款', () => {
        const result = summarizeInstallments([
            transaction({ isReconciled: true }),
            transaction({ id: 'second', date: '2026-02-28', amount: 333, installmentNumber: 2 }),
            transaction({ id: 'third', date: '2026-03-31', amount: 333, installmentNumber: 3 }),
        ], '2026-02');
        expect(result.groups[0]).toMatchObject({ recordedAmount: 1000, unreconciledAmount: 666, reconciledPeriods: 1, completeSchedule: true, endMonth: '2026-03' });
        expect(result.monthlyTotal).toBe(333);
    });

    it('缺期不推估到期月或補齊不存在的款項', () => {
        const result = summarizeInstallments([transaction()], '2026-01');
        expect(result.groups[0]).toMatchObject({ recordedAmount: 334, completeSchedule: false, endMonth: null, recordedPeriods: 1 });
    });

    it('同一 ID 跨卡別或重複期數列為待確認，不合併判定進度', () => {
        expect(summarizeInstallments([transaction(), transaction({ id: 'other', cardBank: '國泰' })], '2026-01').groups).toEqual([]);
        expect(summarizeInstallments([transaction(), transaction({ id: 'duplicate' })], '2026-01').unconfirmed).toHaveLength(2);
    });
});
