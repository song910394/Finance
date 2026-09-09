import { describe, expect, it } from 'vitest';
import { SalaryAdjustment } from '../types';
import { calculateSalaryStatistics, prepareSalaryAdjustment } from './SalaryHistory';
import { createFinanceSync } from '../services/financeSync';
import { parseBackup, serializeBackup } from '../utils/backup';

const first: SalaryAdjustment = { id: 'first', date: '2025-01', totalSalary: 30000, adjustmentItem: '合成基準', adjustmentAmount: 0, laborInsurance: 1000, healthInsurance: 500, mealCost: 0, welfareFund: 0 };
const values = { date: '2026-01', totalSalary: '33000', adjustmentItem: '合成調薪', laborInsurance: '1000', healthInsurance: '500', mealCost: '0', welfareFund: '0' };

describe('salary input and editing', () => {
    it('saves the month-based salary form through the real controller and backup boundary', async () => {
        const storage = new Map<string, string>();
        const controller = createFinanceSync({
            initialData: { transactions: [], categories: ['其他'], budget: 50000, cardBanks: ['-'], cardSettings: {}, incomeSources: [], budgets: [], salaryAdjustments: [] },
            initialUrl: '',
            storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); } },
            load: async () => { throw new Error('This test must not load from the cloud'); },
            save: async () => { throw new Error('This test must not save to the cloud'); },
        });
        try {
            await controller.start();
            const adjustment = prepareSalaryAdjustment({ date: '2026-09', totalSalary: '50000', adjustmentItem: '合成測試', laborInsurance: '1000', healthInsurance: '800', mealCost: '0', welfareFund: '200' }, [], null);
            controller.update(current => ({ ...current, salaryAdjustments: [{ ...adjustment, id: 'synthetic-salary' }] }));
            expect(controller.getSnapshot()).toMatchObject({ localSaved: true, dirty: true, data: { salaryAdjustments: [{ date: '2026-09', totalSalary: 50000, laborInsurance: 1000, healthInsurance: 800, mealCost: 0, welfareFund: 200 }] } });
            expect(parseBackup(serializeBackup(controller.getSnapshot().data)).salaryAdjustments[0]).toEqual({ ...adjustment, id: 'synthetic-salary' });
        } finally { controller.stop(); }
    });
    it('requires every deduction to be explicit and accepts zero', () => {
        expect(() => prepareSalaryAdjustment({ ...values, mealCost: '' }, [first], null)).toThrow('每項扣款');
        expect(prepareSalaryAdjustment(values, [first], null)).toMatchObject({ totalSalary: 33000, adjustmentAmount: 3000, mealCost: 0, welfareFund: 0 });
    });
    it('compares an edited record with the preceding record, never with its old self', () => {
        const edited: SalaryAdjustment = { ...first, id: 'editing', date: '2025-12', totalSalary: 31000 };
        expect(prepareSalaryAdjustment(values, [edited, first], edited.id).adjustmentAmount).toBe(3000);
    });
    it('rejects invalid months and partial numeric input', () => {
        expect(() => prepareSalaryAdjustment({ ...values, date: '2026-13' }, [first], null)).toThrow();
        expect(() => prepareSalaryAdjustment({ ...values, welfareFund: '12元' }, [first], null)).toThrow();
    });
});

describe('salary growth', () => {
    it('returns unavailable percentages for a zero baseline rather than Infinity or false 0%', () => {
        const zero = { ...first, totalSalary: 0, laborInsurance: 0, healthInsurance: 0 };
        const latest = { ...first, id: 'last', date: '2026-01', totalSalary: 33000 };
        expect(calculateSalaryStatistics([zero, latest])).toMatchObject({ salaryGrowthPercent: null, insuranceGrowthPercent: null, cagr: null });
    });
    it('retains the established total growth and CAGR calculation for valid baselines', () => {
        const result = calculateSalaryStatistics([first, { ...first, id: 'last', date: '2026-01', totalSalary: 33000 }]);
        expect(result?.salaryGrowthPercent).toBe(10);
        expect(result?.cagr).toBeCloseTo(10);
    });
});
