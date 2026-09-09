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
    it('同名但不同 ID 的分期各自統計；無期數的舊資料仍待確認', () => {
        const result = summarizeInstallments([
            transaction(),
            transaction({ id: 'other', installmentGroupId: 'plan-b', cardBank: '國泰', installmentCount: 24 }),
            transaction({ id: 'legacy', description: '手機', installmentGroupId: undefined, installmentNumber: undefined, installmentCount: undefined }),
        ], '2026-01');
        expect(result.groups.map(group => group.id)).toEqual(['plan-a', 'plan-b']);
        expect(result.unconfirmed.map(t => t.id)).toEqual(['legacy']);
    });

    it('舊系統預建紀錄依期數與起始月份分組，金額不重建、未核對不算已繳', () => {
        const rows = [1, 2, 3].map(n => transaction({ id: String(n), installmentGroupId: undefined,
            installmentNumber: undefined, installmentCount: undefined, isInstallment: false,
            description: `手機 (${n}/3)`, date: `2026-0${n}-28`, amount: n === 1 ? 334 : 333, isReconciled: n === 1 }));
        const before = JSON.stringify(rows);
        const result = summarizeInstallments(rows, '2026-02');
        expect(result.unconfirmed).toHaveLength(0);
        expect(result.groups[0]).toMatchObject({ name: '手機', recordedAmount: 1000, reconciledPeriods: 1, unreconciledAmount: 666, completeSchedule: true });
        expect(result.monthlyTotal).toBe(333);
        expect(JSON.stringify(rows)).toBe(before);
        expect(summarizeInstallments([...rows, { ...rows[0], id: 'duplicate' }], '2026-02').groups).toHaveLength(0);
        expect(summarizeInstallments([...rows, ...rows.map(t => ({ ...t, id: t.id + '-later', date: t.date.replace('2026', '2027') }))], '2026-02').groups).toHaveLength(2);
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
