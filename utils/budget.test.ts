import { describe, expect, it } from 'vitest';
import { IncomeSource, MonthlyBudget } from '../types';
import { calculateBudgetTotals, getBudgetIncomeRows, parseBudgetAmount } from './budget';

const sources: IncomeSource[] = [
    { id: 'salary', name: '薪資' },
    { id: 'old', name: '舊來源', isActive: false },
    { id: 'inactive-empty', name: '未使用來源', isActive: false },
];
const budget: MonthlyBudget = {
    month: '2026-09', openingBalance: 100, loan: 400,
    incomes: [{ sourceId: 'old', amount: 5000 }, { sourceId: 'orphan', amount: 900 }],
    creditCards: [{ cardName: '玉山', amount: 1000, isPaid: true }],
};

describe('monthly budget', () => {
    it('停用與孤兒來源仍逐筆顯示，金額保留；未填來源保持 undefined', () => {
        const rows = getBudgetIncomeRows(sources, budget);
        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({ sourceId: 'old', isActive: false, amount: 5000 });
        expect(rows[1]).toMatchObject({ sourceId: 'orphan', isOrphan: true, amount: 900 });
        expect(rows[2]).toMatchObject({ sourceId: 'salary', amount: undefined });
        expect(calculateBudgetTotals(budget)?.incomeTotal).toBe(5900);
    });

    it('重複來源紀錄不自動合併或丟棄', () => {
        const rows = getBudgetIncomeRows([], { ...budget, incomes: [{ sourceId: 'old', amount: 10 }, { sourceId: 'old', amount: 20 }] });
        expect(rows.map(row => row.amount)).toEqual([10, 20]);
        expect(new Set(rows.map(row => row.key)).size).toBe(2);
    });

    it('未知月份與空值不當作零，明確輸入零才得到零', () => {
        expect(calculateBudgetTotals(undefined)).toBeNull();
        expect(parseBudgetAmount('')).toBeNull();
        expect(parseBudgetAmount('  ')).toBeNull();
        expect(parseBudgetAmount('Infinity')).toBeNull();
        expect(parseBudgetAmount('0')).toBe(0);
    });

    it('維持人工公式，已繳旗標不再扣款，也不自動混入消費或上月餘額', () => {
        expect(calculateBudgetTotals(budget)).toEqual({ incomeTotal: 5900, cardTotal: 1000, expenseTotal: 1400, balance: 4600 });
        expect(calculateBudgetTotals({ ...budget, creditCards: [{ cardName: '玉山', amount: 1000, isPaid: false }] })?.balance).toBe(4600);
    });
});
