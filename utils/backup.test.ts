import { describe, expect, it } from 'vitest';
import { parseBackup, serializeBackup } from './backup';

const base = () => ({ transactions: [{ id: 't1', date: '2026-09-01', amount: -50, paymentMethod: '現金', cardBank: '-', category: '其他', description: '', isReconciled: false, futureField: { keep: true } }], categories: ['其他'], budget: 50000, cardBanks: ['-'], cardSettings: {}, futureTopLevel: 'retained' });
describe('backup boundaries', () => {
  it('accepts salary effective months and retains legacy full dates without rewriting either source', () => {
    const salary = { id: 'salary-example', totalSalary: 50000, adjustmentItem: '合成測試', adjustmentAmount: 0, laborInsurance: 1000, healthInsurance: 800, mealCost: 0, welfareFund: 200 };
    for (const date of ['2026-09', '2026-09-08']) {
      const source = { ...base(), salaryAdjustments: [{ ...salary, date }] };
      expect(parseBackup(serializeBackup(parseBackup(source))).salaryAdjustments[0].date).toBe(date);
    }
    for (const date of ['', '2026-13', '2026-02-30', '2026/09']) {
      expect(() => parseBackup({ ...base(), salaryAdjustments: [{ ...salary, date }] })).toThrow('薪資歷程');
    }
  });
  it('round trips unknown fields and defaults only missing optional arrays', () => {
    const normalized = parseBackup(base());
    const restored = parseBackup(serializeBackup(normalized));
    expect(restored).toEqual({ ...base(), incomeSources: [], budgets: [], salaryAdjustments: [] });
  });
  it('rejects malformed records without silently replacing them', () => {
    expect(() => parseBackup({ ...base(), transactions: {} })).toThrow();
    expect(() => parseBackup({ ...base(), incomeSources: null })).toThrow();
    expect(() => parseBackup({ ...base(), budget: Infinity })).toThrow();
    const malformed = base(); malformed.transactions[0].date = '2026-02-31';
    expect(() => parseBackup(malformed)).toThrow();
  });
  it('rejects duplicate transaction ids', () => {
    const duplicate = base(); duplicate.transactions.push({ ...duplicate.transactions[0] });
    expect(() => parseBackup(duplicate)).toThrow('識別碼');
  });
  it('validates statement months and installment metadata without requiring new fields on legacy rows', () => {
    const valid = base();
    Object.assign(valid.transactions[0], { statementMonth: '2026-09', installmentNumber: 2, installmentCount: 3, installmentGroupId: 'g1' });
    expect(parseBackup(valid).transactions[0].statementMonth).toBe('2026-09');
    Object.assign(valid.transactions[0], { installmentNumber: 4 });
    expect(() => parseBackup(valid)).toThrow('分期序號');
    Object.assign(valid.transactions[0], { installmentNumber: 2, statementMonth: '2026-13' });
    expect(() => parseBackup(valid)).toThrow('帳單月份');
  });
});
