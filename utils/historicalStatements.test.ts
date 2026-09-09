import { describe, expect, it } from 'vitest';
import { FinanceData, PaymentMethod, Transaction } from '../types';
import { assignHistoricalStatements } from './historicalStatements';
import { parseBackup, serializeBackup } from './backup';
const tx = (id: string, date: string, extra: Partial<Transaction> = {}): Transaction => ({ id, date, amount: 100, category: '其他', description: id, cardBank: '測試卡', paymentMethod: PaymentMethod.CREDIT_CARD, isReconciled: false, ...extra });
const data = (transactions: Transaction[]): FinanceData => ({ transactions, budget: 100, categories: ['其他'], cardBanks: ['測試卡'], cardSettings: {}, incomeSources: [], budgets: [], salaryAdjustments: [] });
describe('一次性歷史帳单歸月', () => {
    it('涵蓋 7 月底、保留 8 月與較新紀錄、既有歸月、現金及原核銷日期', () => {
        const input = data([tx('old', '2025-12-01'), tx('july', '2026-07-31', { isReconciled: true, reconciledDate: '2026-08-20T00:00:00Z' }), tx('august', '2026-08-01'), tx('later', '2026-09-01'), tx('assigned', '2026-07-01', { statementMonth: '2026-08', isReconciled: true }), tx('cash', '2026-07-01', { paymentMethod: PaymentMethod.CASH })]);
        const result = assignHistoricalStatements(input);
        expect(result.transactions[0]).toMatchObject({ statementMonth: '2025-12', isReconciled: true });
        expect(result.transactions[1]).toMatchObject({ statementMonth: '2026-07', reconciledDate: '2026-08-20T00:00:00Z' });
        expect(result.transactions.slice(2)).toEqual(input.transactions.slice(2));
        expect(input.transactions[0].statementMonth).toBeUndefined();
    });
    it('整理版本可完整備份往返；後續人工取消核銷不會再次被覆蓋', () => {
        const result = parseBackup(serializeBackup(assignHistoricalStatements(data([tx('old', '2026-07-01')]))));
        const edited = { ...result, transactions: [tx('old', '2026-07-01')] };
        expect(assignHistoricalStatements(edited)).toBe(edited);
        expect(assignHistoricalStatements(data([tx('august', '2026-08-01')])).historicalStatementsThrough).toBeUndefined();
    });
});
