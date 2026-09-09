import type { FinanceData } from '../types';
export type { FinanceData } from '../types';
const object = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const string = (value: unknown) => typeof value === 'string';
const month = (value: unknown) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const date = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
function requireValue(ok: unknown, field: string): asserts ok {
  if (!ok) throw new Error(`備份資料格式不正確：${field}`);
}
const strings = (value: unknown) => Array.isArray(value) && value.every(string);

/** Validate known boundaries while retaining unknown fields for lossless round trips. */
export function parseBackup(input: unknown): FinanceData {
  let data: any = typeof input === 'string' ? JSON.parse(input) : input;
  if (object(data) && data.format === 'hs-finance-backup') {
    requireValue(data.version === 1, '備份版本');
    data = data.data;
  }
  requireValue(object(data), '資料內容');
  requireValue(Array.isArray(data.transactions), '交易明細');
  const ids = new Set<string>();
  data.transactions.forEach((tx: any, index: number) => {
    const field = `交易明細第 ${index + 1} 筆`;
    requireValue(object(tx), field);
    requireValue(string(tx.id) && tx.id.length > 0 && !ids.has(tx.id), `${field}識別碼`);
    ids.add(tx.id);
    requireValue(date(tx.date) && number(tx.amount), `${field}日期或金額`);
    requireValue(['現金', '刷卡'].includes(tx.paymentMethod), `${field}付款方式`);
    requireValue(string(tx.cardBank) && string(tx.category) && string(tx.description), field);
    requireValue(typeof tx.isReconciled === 'boolean', `${field}對帳狀態`);
    for (const key of ['isRecurring', 'isInstallment']) {
      if (tx[key] !== undefined) requireValue(typeof tx[key] === 'boolean', `${field}${key}`);
    }
    if (tx.statementMonth !== undefined) requireValue(month(tx.statementMonth), `${field}帳單月份`);
    for (const key of ['recurringGroupId', 'installmentGroupId']) {
      if (tx[key] !== undefined) requireValue(string(tx[key]) && tx[key].length > 0, `${field}${key}`);
    }
    for (const key of ['installmentNumber', 'installmentCount']) {
      if (tx[key] !== undefined) requireValue(Number.isSafeInteger(tx[key]) && tx[key] > 0, `${field}分期期數`);
    }
    if (tx.installmentNumber !== undefined && tx.installmentCount !== undefined) requireValue(tx.installmentNumber <= tx.installmentCount, `${field}分期序號`);
  });
  requireValue(strings(data.categories) && strings(data.cardBanks), '分類或銀行');
  requireValue(number(data.budget), '預算');
  requireValue(object(data.cardSettings), '信用卡設定');
  for (const setting of Object.values(data.cardSettings) as any[]) {
    requireValue(object(setting), '信用卡設定');
    requireValue(Number.isInteger(setting.statementDay) && setting.statementDay >= 0 && setting.statementDay <= 31, '信用卡結帳日');
    if (setting.isNextMonth !== undefined) requireValue(typeof setting.isNextMonth === 'boolean', '次月設定');
    if (setting.issuedMonths !== undefined) requireValue(Array.isArray(setting.issuedMonths) && setting.issuedMonths.every(month), '已出帳月份');
    if (setting.statementAmounts !== undefined) requireValue(object(setting.statementAmounts) && Object.entries(setting.statementAmounts).every(([key, amount]) => month(key) && number(amount)), '帳單金額');
  }
  const incomeSources = data.incomeSources === undefined ? [] : data.incomeSources;
  const budgets = data.budgets === undefined ? [] : data.budgets;
  const salaryAdjustments = data.salaryAdjustments === undefined ? [] : data.salaryAdjustments;
  requireValue(Array.isArray(incomeSources), '入帳來源');
  incomeSources.forEach((item: any) => {
    requireValue(object(item) && string(item.id) && string(item.name), '入帳來源');
    if (item.defaultDay !== undefined) requireValue(Number.isInteger(item.defaultDay) && item.defaultDay >= 1 && item.defaultDay <= 31, '預設入帳日');
    if (item.isActive !== undefined) requireValue(typeof item.isActive === 'boolean', '入帳來源啟用狀態');
  });
  requireValue(Array.isArray(budgets), '月度帳務');
  budgets.forEach((item: any) => {
    requireValue(object(item) && month(item.month) && number(item.openingBalance) && number(item.loan), '月度帳務');
    requireValue(Array.isArray(item.incomes) && item.incomes.every((income: any) => object(income) && string(income.sourceId) && number(income.amount)), '月度入帳');
    if (item.creditCards !== undefined) requireValue(Array.isArray(item.creditCards) && item.creditCards.every((card: any) => object(card) && string(card.cardName) && number(card.amount) && (card.isPaid === undefined || typeof card.isPaid === 'boolean')), '月度信用卡');
  });
  requireValue(Array.isArray(salaryAdjustments), '薪資歷程');
  salaryAdjustments.forEach((item: any) => {
    // The salary form records an effective month; keep legacy full-date sources unchanged.
    requireValue(object(item) && string(item.id) && (month(item.date) || date(item.date)) && string(item.adjustmentItem), '薪資歷程');
    for (const key of ['totalSalary', 'adjustmentAmount', 'laborInsurance', 'healthInsurance', 'mealCost', 'welfareFund']) requireValue(number(item[key]), `薪資${key}`);
  });
  return JSON.parse(JSON.stringify({ ...data, incomeSources, budgets, salaryAdjustments }));
}

export function serializeBackup(data: FinanceData): string {
  return JSON.stringify({ format: 'hs-finance-backup', version: 1, exportedAt: new Date().toISOString(), data: parseBackup(data) }, null, 2);
}
