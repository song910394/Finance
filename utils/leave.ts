import type { LeavePeriod, LeaveRecord } from '../types';

// Technical bounds only: no assumption about leave units or hours per working day.
export const MAX_LEAVE_CENTS = 999_999_999_999;
export function parseHourCents(input: string, allowZero = false): number {
  const text = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('時數必須明確填寫非負數字，最多小數 2 位。');
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_LEAVE_CENTS) throw new Error('時數超出支援範圍（最多 9,999,999,999.99 小時）。');
  if (cents === 0 && !allowZero) throw new Error('休假時數必須大於 0。');
  return cents;
}
export function hourCents(value: number, allowZero = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('時數格式不正確。');
  return parseHourCents(String(value), allowZero);
}
export function formatHourCents(cents: number | null): string {
  if (cents === null) return '—';
  if (!Number.isSafeInteger(cents)) throw new Error('時數超出安全範圍。');
  const absolute = Math.abs(cents);
  const decimal = String(absolute % 100).padStart(2, '0').replace(/0+$/, '');
  return `${cents < 0 ? '-' : ''}${Math.floor(absolute / 100).toLocaleString('zh-TW')}${decimal ? '.' + decimal : ''}`;
}
export function taipeiToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function isLeaveDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export const periodLabel = (period: LeavePeriod) => period.name?.trim() || `${period.startDate} ～ ${period.endDate}`;
export function defaultLeavePeriod(periods: LeavePeriod[], today = taipeiToday()): string {
  const current = periods.filter(item => item.startDate <= today && today <= item.endDate);
  return [...(current.length ? current : periods)].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.endDate.localeCompare(a.endDate) || a.id.localeCompare(b.id))[0]?.id ?? '';
}
export function summarizeLeave(period: LeavePeriod | undefined, records: LeaveRecord[]) {
  if (!period) return { total: null, used: null, planned: null, remaining: null, available: null };
  const total = hourCents(period.totalHours, true);
  let used = 0, planned = 0;
  for (const record of records.filter(item => item.periodId === period.id)) {
    const cents = hourCents(record.hours);
    if (record.completed) used += cents; else planned += cents;
    if (!Number.isSafeInteger(used + planned) || used + planned > MAX_LEAVE_CENTS) throw new Error('年度已登記時數合計超出支援範圍。');
  }
  return { total, used, planned, remaining: total - used, available: total - used - planned };
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireLeave = (ok: unknown, message: string): void => { if (!ok) throw new Error(`年假資料格式不正確：${message}`); };
export function validateLeaveData(periods: unknown, records: unknown, today = taipeiToday()): void {
  if (!Array.isArray(periods) || !Array.isArray(records)) throw new Error('年假年度與休假明細必須為陣列。');
  const periodIds = new Set<string>();
  for (const period of periods) {
    if (!object(period)) throw new Error('年假年度格式不正確。');
    requireLeave(typeof period.id === 'string' && period.id.trim() !== '' && !periodIds.has(period.id), '年度識別碼空白或重複');
    periodIds.add(period.id as string);
    requireLeave(period.name === undefined || typeof period.name === 'string', '年度名稱');
    requireLeave(isLeaveDate(period.startDate) && isLeaveDate(period.endDate) && period.startDate <= period.endDate, '起訖日須為真實日期，截止日不可早於起始日');
    hourCents(period.totalHours as number, true);
  }
  const recordIds = new Set<string>();
  for (const record of records) {
    if (!object(record)) throw new Error('休假明細格式不正確。');
    requireLeave(typeof record.id === 'string' && record.id.trim() !== '' && !recordIds.has(record.id), '休假識別碼空白或重複');
    recordIds.add(record.id as string);
    const period = periods.find(item => item.id === record.periodId);
    requireLeave(typeof record.periodId === 'string' && period !== undefined, '找不到休假所屬年度');
    requireLeave(isLeaveDate(record.date) && record.date >= period.startDate && record.date <= period.endDate, `休假日期 ${String(record.date)} 不在年度期間內或不是有效日期`);
    hourCents(record.hours as number);
    requireLeave(typeof record.completed === 'boolean', '已休畢必須為 boolean');
    requireLeave(!record.completed || (record.date as string) <= today, '未來日期不可標記已休畢；請先取消已休畢');
    requireLeave(record.note === undefined || typeof record.note === 'string', '備註');
  }
  for (const period of periods) summarizeLeave(period, records);
}
export interface LeavePeriodInput { name: string; startDate: string; endDate: string; totalHours: string }
export interface LeaveRecordInput { date: string; hours: string; completed: boolean; note: string }
export function prepareLeavePeriod(input: LeavePeriodInput, id: string, records: LeaveRecord[], today = taipeiToday()): LeavePeriod {
  const period = { id, name: input.name.trim(), startDate: input.startDate, endDate: input.endDate, totalHours: parseHourCents(input.totalHours, true) / 100 };
  validateLeaveData([period], [], today);
  const related = records.filter(record => record.periodId === id);
  const conflicts = related.filter(record => record.date < period.startDate || record.date > period.endDate);
  if (conflicts.length) throw new Error('無法變更期間，以下休假會落在區間外：' + conflicts.map(record => `${record.date}（${formatHourCents(hourCents(record.hours))} 小時${record.note ? '，' + record.note : ''}）`).join('、'));
  validateLeaveData([period], related, today);
  return period;
}
export function prepareLeaveRecord(input: LeaveRecordInput, id: string, period: LeavePeriod, today = taipeiToday()): LeaveRecord {
  const record = { id, periodId: period.id, date: input.date, hours: parseHourCents(input.hours) / 100, completed: input.completed, note: input.note.trim() };
  validateLeaveData([period], [record], today);
  return record;
}
export const possibleDuplicateLeave = (candidate: LeaveRecord, records: LeaveRecord[]) => records.some(record => record.id !== candidate.id && record.periodId === candidate.periodId && record.date === candidate.date && hourCents(record.hours) === hourCents(candidate.hours));
