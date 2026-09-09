import { IncomeSource, MonthlyBudget } from '../types';

export interface BudgetIncomeRow {
    key: string;
    sourceId: string;
    name: string;
    isActive: boolean;
    isOrphan: boolean;
    amount: number | undefined;
}

/** Keep every recorded amount, including deactivated, orphaned and duplicate source records. */
export const getBudgetIncomeRows = (sources: IncomeSource[], budget: MonthlyBudget | undefined): BudgetIncomeRow[] => {
    const entries = budget?.incomes ?? [];
    const rows: BudgetIncomeRow[] = entries.map((entry, index) => {
        const source = sources.find(item => item.id === entry.sourceId);
        return {
            key: `record:${index}`,
            sourceId: entry.sourceId,
            name: source?.name ?? '待確認來源',
            isActive: source?.isActive !== false,
            isOrphan: !source,
            amount: entry.amount,
        };
    });
    for (const source of sources) {
        if (source.isActive === false || entries.some(entry => entry.sourceId === source.id)) continue;
        rows.push({ key: `source:${source.id}`, sourceId: source.id, name: source.name, isActive: true, isOrphan: false, amount: undefined });
    }
    return rows;
};

/** An empty field is unknown. Zero is accepted only when the user explicitly supplies it. */
export const parseBudgetAmount = (value: string): number | null => {
    if (!value.trim()) return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
};

export const calculateBudgetTotals = (budget: MonthlyBudget | undefined) => {
    if (!budget) return null;
    const amounts = [budget.openingBalance, budget.loan, ...budget.incomes.map(i => i.amount), ...(budget.creditCards ?? []).map(c => c.amount)];
    if (amounts.some(amount => !Number.isFinite(amount))) return null;
    const round = (amount: number) => Math.round(amount * 100) / 100;
    const incomeTotal = round(budget.incomes.reduce((total, income) => total + income.amount, 0));
    const cardTotal = round((budget.creditCards ?? []).reduce((total, card) => total + card.amount, 0));
    const expenseTotal = round(budget.loan + cardTotal);
    return { incomeTotal, cardTotal, expenseTotal, balance: round(budget.openingBalance + incomeTotal - expenseTotal) };
};
