import { Transaction } from '../types';

export interface InstallmentGroupSummary {
    id: string;
    name: string;
    cardBank: string;
    totalPeriods: number;
    recordedPeriods: number;
    reconciledPeriods: number;
    unreconciledPeriods: number;
    recordedAmount: number;
    unreconciledAmount: number;
    completeSchedule: boolean;
    endMonth: string | null;
}

const sum = (values: number[]) => Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;

const legacyPeriod = (description: string) => description.match(/^(.+?)\s*(?:[（(]\s*(?:分期\s*:?\s*)?(\d+)\s*\/\s*(\d+)\s*[)）]|分期\s*:?\s*(\d+)\s*\/\s*(\d+))\s*$/);

/** Legacy schedules already contain each monthly payment; derive display groups without editing records. */
export const summarizeInstallments = (transactions: Transaction[], month: string) => {
    const records = transactions.filter(t => t.isInstallment || t.installmentGroupId || legacyPeriod(t.description));
    const grouped = new Map<string, Transaction[]>();
    const unconfirmed: Transaction[] = [];

    for (const original of records) {
        let transaction = original;
        if (!transaction.installmentGroupId) {
            const match = legacyPeriod(transaction.description);
            const number = Number(match?.[2] ?? match?.[4]);
            const count = Number(match?.[3] ?? match?.[5]);
            if (!match || number < 1 || count < number ||
                (transaction.installmentNumber !== undefined && transaction.installmentNumber !== number) ||
                (transaction.installmentCount !== undefined && transaction.installmentCount !== count)) {
                unconfirmed.push(original); continue;
            }
            const [year, monthNumber] = transaction.date.split('-').map(Number);
            const start = year * 12 + monthNumber - number;
            transaction = { ...transaction, installmentNumber: number, installmentCount: count,
                installmentGroupId: 'legacy:' + JSON.stringify([match[1].trim(), transaction.cardBank, transaction.paymentMethod, transaction.category, count, start]) };
        }
        const groupId = transaction.installmentGroupId!;
        const group = grouped.get(groupId) ?? [];
        group.push(transaction);
        grouped.set(groupId, group);
    }

    const groups: InstallmentGroupSummary[] = [];
    for (const [id, group] of grouped) {
        const first = group[0];
        const count = first.installmentCount;
        const consistent = Number.isInteger(count) && (count ?? 0) > 0 && group.every(t =>
            t.cardBank === first.cardBank && t.installmentCount === count &&
            Number.isInteger(t.installmentNumber) && (t.installmentNumber ?? 0) >= 1 &&
            (t.installmentNumber ?? 0) <= (count ?? 0)
        );
        const uniquePeriods = new Set(group.map(t => t.installmentNumber));
        if (!consistent || uniquePeriods.size !== group.length || count === undefined) {
            unconfirmed.push(...group);
            continue;
        }
        const completeSchedule = group.length === count;
        const unreconciled = group.filter(t => !t.isReconciled);
        const lastDate = group.reduce((last, t) => t.date > last ? t.date : last, '');
        groups.push({
            id,
            name: legacyPeriod(first.description)?.[1].trim() || first.description,
            cardBank: first.cardBank,
            totalPeriods: count,
            recordedPeriods: group.length,
            reconciledPeriods: group.length - unreconciled.length,
            unreconciledPeriods: unreconciled.length,
            recordedAmount: sum(group.map(t => t.amount)),
            unreconciledAmount: sum(unreconciled.map(t => t.amount)),
            completeSchedule,
            // A recorded last period is evidence; a date projected from a description is not.
            endMonth: completeSchedule ? lastDate.slice(0, 7) : null,
        });
    }

    groups.sort((a, b) => (a.endMonth ?? '9999').localeCompare(b.endMonth ?? '9999'));
    return {
        groups,
        unconfirmed: unconfirmed.sort((a, b) => b.date.localeCompare(a.date)),
        monthlyTotal: sum(records.filter(t => t.date.startsWith(month)).map(t => t.amount)),
    };
};
