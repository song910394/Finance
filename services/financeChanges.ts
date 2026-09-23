import { parseBackup, type FinanceData } from '../utils/backup';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 只套用本次變更的項目；其他設備的項目保留，同一筆以本次儲存為準。 */
function mergeRows<T>(before: T[], after: T[], remote: T[], key: (item: T) => string): T[] {
  const previous = new Map(before.map(item => [key(item), item]));
  const next = new Map(after.map(item => [key(item), item]));
  const changed = new Map(after.filter(item => !same(previous.get(key(item)), item)).map(item => [key(item), item]));
  const removed = new Set(before.filter(item => !next.has(key(item))).map(key));
  const remoteKeys = new Set(remote.map(key));
  return [
    ...remote.filter(item => !removed.has(key(item))).map(item => changed.get(key(item)) ?? item),
    ...after.filter(item => changed.has(key(item)) && !remoteKeys.has(key(item))),
  ];
}

export function applyFinanceChanges(before: FinanceData, after: FinanceData, remote: FinanceData): FinanceData {
  const result = { ...remote };
  // 未知欄位也保留；只有本次明確變更的欄位才會取代。
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const key = field as keyof FinanceData;
    if (same(before[key], after[key])) continue;
    if (!(key in after)) delete result[key];
    else Object.assign(result, { [key]: after[key] });
  }
  result.transactions = mergeRows(before.transactions, after.transactions, remote.transactions, item => item.id);
  result.budgets = mergeRows(before.budgets, after.budgets, remote.budgets, item => item.month);
  result.incomeSources = mergeRows(before.incomeSources, after.incomeSources, remote.incomeSources, item => item.id);
  result.salaryAdjustments = mergeRows(before.salaryAdjustments, after.salaryAdjustments, remote.salaryAdjustments, item => item.id);
  result.leavePeriods = mergeRows(before.leavePeriods, after.leavePeriods, remote.leavePeriods, item => item.id);
  result.leaveRecords = mergeRows(before.leaveRecords, after.leaveRecords, remote.leaveRecords, item => item.id);
  result.categories = mergeRows(before.categories, after.categories, remote.categories, item => item);
  result.cardBanks = mergeRows(before.cardBanks, after.cardBanks, remote.cardBanks, item => item);
  result.cardSettings = { ...remote.cardSettings };
  for (const bank of new Set([...Object.keys(before.cardSettings), ...Object.keys(after.cardSettings)])) {
    if (same(before.cardSettings[bank], after.cardSettings[bank])) continue;
    if (bank in after.cardSettings) result.cardSettings[bank] = after.cardSettings[bank];
    else delete result.cardSettings[bank];
  }
  // 年假年度與明細必須整組通過驗證，不能上傳部分有效資料。
  return parseBackup(result);
}
