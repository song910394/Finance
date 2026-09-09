import { FinanceData, PaymentMethod } from '../types';

/** 依使用者確認的一次性規則整理；不改既有歸屬、8 月以後或現金紀錄。 */
export function assignHistoricalStatements(data: FinanceData): FinanceData {
    if (data.historicalStatementsThrough === '2026-07') return data;
    let changed = false;
    const transactions = data.transactions.map(transaction => {
        if (transaction.paymentMethod !== PaymentMethod.CREDIT_CARD || transaction.statementMonth || transaction.date > '2026-07-31') return transaction;
        changed = true;
        return { ...transaction, statementMonth: transaction.date.slice(0, 7), isReconciled: true };
    });
    return changed ? { ...data, transactions, historicalStatementsThrough: '2026-07' } : data;
}
