import { describe, expect, it } from 'vitest';
import { backupMissingLeave, parseBackup, serializeBackup } from './backup';
import { defaultLeavePeriod, formatHourCents, hourCents, isLeaveDate, MAX_LEAVE_CENTS, parseHourCents, possibleDuplicateLeave, prepareLeavePeriod, prepareLeaveRecord, summarizeLeave, taipeiToday, validateLeaveData } from './leave';
import type { LeavePeriod, LeaveRecord } from '../types';

const today = '2026-09-22';
const period: LeavePeriod = { id: 'p', startDate: '2026-01-01', endDate: '2026-12-31', totalHours: 120 };
const records: LeaveRecord[] = [
  { id: 'a', periodId: 'p', date: '2026-01-01', hours: 24, completed: true },
  { id: 'b', periodId: 'p', date: '2026-01-02', hours: 8, completed: false },
  { id: 'c', periodId: 'p', date: '2026-01-03', hours: 8, completed: false },
];
const legacy = { transactions: [], categories: [], cardBanks: [], cardSettings: {}, budget: 100 };
const summary = (items: LeaveRecord[]) => { const { total, used, planned, remaining, available } = summarizeLeave(period, items); return [total, used, planned, remaining, available].map(value => value! / 100); };

describe('年假唯一統計來源', () => {
  it('120/24/16/96/80 → 勾選 → 取消 → 刪除，沒有重複扣除', () => {
    expect(summary(records)).toEqual([120, 24, 16, 96, 80]);
    expect(summary(records.map(item => item.id === 'b' ? { ...item, completed: true } : item))).toEqual([120, 32, 8, 88, 80]);
    expect(summary(records)).toEqual([120, 24, 16, 96, 80]);
    expect(summary(records.filter(item => item.id !== 'b'))).toEqual([120, 24, 8, 96, 88]);
    expect(records[1].completed).toBe(false);
  });
  it('只計算選定年度，未設定與明確零額度不同', () => {
    expect(summarizeLeave(undefined, records)).toEqual({ total: null, used: null, planned: null, remaining: null, available: null, reserved: null });
    expect(summarizeLeave({ ...period, totalHours: 0 }, [])).toEqual({ total: 0, used: 0, planned: 0, remaining: 0, available: 0, reserved: 0 });
    expect(summary([...records, { ...records[0], id: 'other', periodId: 'other' }])).toEqual([120, 24, 16, 96, 80]);
  });
  it('小數精確累加、編輯重算，超額保留負值', () => {
    const items = [0.1, 0.2].map((hours, i) => ({ ...records[0], id: String(i), hours }));
    expect(summarizeLeave({ ...period, totalHours: 0.3 }, items)).toMatchObject({ used: 30, available: 0 });
    items[0].hours = 0.11;
    expect(summarizeLeave({ ...period, totalHours: 0.3 }, items)).toMatchObject({ used: 31, remaining: -1, available: -1 });
    expect(formatHourCents(-1)).toBe('-0.01');
    expect(formatHourCents(null)).toBe('—');
    expect(formatHourCents(750)).toBe('7.5');
  });
});
describe('時數與日期邊界', () => {
  it.each(['', ' ', '-1', 'NaN', 'Infinity', '0.001', '1.000', '1e2', '1.', '9,000', '9007199254740991', '10000000000'])('拒絕不合法時數 %j', value => {
    expect(() => parseHourCents(value, true)).toThrow();
  });
  it('只允許額度明確輸入零，檢查數值型別與合计安全範圍', () => {
    expect(parseHourCents('0', true)).toBe(0);
    expect(() => parseHourCents('0')).toThrow();
    expect(parseHourCents('7.50')).toBe(750);
    expect(hourCents(MAX_LEAVE_CENTS / 100)).toBe(MAX_LEAVE_CENTS);
    for (const value of [NaN, Infinity, -1, 0.001, '1', null]) expect(() => hourCents(value as number)).toThrow();
    expect(() => summarizeLeave(period, records.map(item => ({ ...item, hours: MAX_LEAVE_CENTS / 100 })))).toThrow('合計');
  });
  it('真實日期、跨年起訖邊界與台北午夜', () => {
    for (const date of ['2026-02-29', '2024-02-30', '2026-04-31', '0000-01-01', '2026-13-01', '2026-1-01']) expect(isLeaveDate(date)).toBe(false);
    expect(isLeaveDate('2024-02-29')).toBe(true);
    expect(taipeiToday(new Date('2026-09-21T16:00:00Z'))).toBe(today);
    expect(taipeiToday(new Date('2026-09-21T15:59:59Z'))).toBe('2026-09-21');
    const cross = { ...period, startDate: '2025-10-01', endDate: '2026-09-30' };
    for (const date of [cross.startDate, cross.endDate]) expect(prepareLeaveRecord({ date, hours: '1.5', completed: false, note: '' }, date, cross, today).date).toBe(date);
    for (const date of ['2025-09-30', '2026-10-01']) expect(() => prepareLeaveRecord({ date, hours: '1', completed: false, note: '' }, 'r', cross, today)).toThrow();
  });
  it('預設選擇涵蓋今天且起日較近者，沒有則最近一期', () => {
    const later = { ...period, id: 'later', startDate: '2026-07-01' };
    const past = { ...period, id: 'past', startDate: '2024-07-01', endDate: '2025-06-30' };
    expect(defaultLeavePeriod([period, later, past], today)).toBe('later');
    expect(defaultLeavePeriod([period, past], '2030-01-01')).toBe('p');
    expect(defaultLeavePeriod([], today)).toBe('');
  });
  it('已過日期不自動勾選，未來勾選被拒且原紀錄不變', () => {
    const input = { date: '2026-09-01', hours: '8', completed: false, note: '' };
    expect(prepareLeaveRecord(input, 'r', period, today).completed).toBe(false);
    expect(() => prepareLeaveRecord({ ...input, date: '2026-09-23', completed: true }, 'r', period, today)).toThrow('先取消');
    expect(prepareLeaveRecord({ ...input, date: today, completed: true }, 'r', period, today).completed).toBe(true);
  });
  it('年度縮短列明每筆衝突、不搬移或刪除；同日多筆不合併', () => {
    const input = { name: '', startDate: '2026-01-03', endDate: '2026-12-31', totalHours: '120' };
    expect(() => prepareLeavePeriod(input, period.id, records, today)).toThrow('2026-01-01（24 小時）、2026-01-02（8 小時）');
    expect(() => prepareLeavePeriod({ ...input, startDate: '2027-01-01' }, 'p', [], today)).toThrow();
    const sameDay = { ...records[0], id: 'same-day' };
    expect(() => validateLeaveData([period], [...records, sameDay], today)).not.toThrow();
    expect(possibleDuplicateLeave(sameDay, records)).toBe(true);
    expect(possibleDuplicateLeave(records[0], records)).toBe(false);
    expect(possibleDuplicateLeave({ ...sameDay, hours: 1.5 }, records)).toBe(false);
  });
});
describe('完整備份的年假邊界', () => {
  it('舊版缺欄位可讀且可辨認，新版完整往返保留未知欄位', () => {
    expect(backupMissingLeave(legacy)).toBe(true);
    expect(backupMissingLeave({ format: 'hs-finance-backup', version: 1, data: legacy })).toBe(true);
    expect(parseBackup(legacy)).toMatchObject({ leavePeriods: [], leaveRecords: [] });
    const full = parseBackup({ ...legacy, leavePeriods: [{ ...period, extra: 'keep' }], leaveRecords: records.map(item => ({ ...item, extra: { keep: true } })), future: true });
    expect(backupMissingLeave(serializeBackup(full))).toBe(false);
    expect(parseBackup(serializeBackup(full))).toEqual(full);
  });
  it.each([
    { leavePeriods: null, leaveRecords: [] },
    { leavePeriods: [period, period], leaveRecords: [] },
    { leavePeriods: [period], leaveRecords: [records[0], records[0]] },
    { leavePeriods: [period], leaveRecords: [{ ...records[0], periodId: 'orphan' }] },
    { leavePeriods: [period], leaveRecords: [{ ...records[0], date: '2026-02-30' }] },
    { leavePeriods: [period], leaveRecords: [{ ...records[0], date: '2025-01-01' }] },
    { leavePeriods: [period], leaveRecords: [{ ...records[0], completed: 'false' }] },
    { leavePeriods: [period], leaveRecords: [{ ...records[0], hours: 0 }] },
    { leavePeriods: [period], leaveRecords: [{ ...records[0], hours: 0.001 }] },
    { leavePeriods: [{ ...period, totalHours: '' }], leaveRecords: [] },
    { leavePeriods: [{ ...period, name: 123 }], leaveRecords: [] },
  ])('拒絕錯誤或孤兒明細且不修改來源 %#', invalid => {
    const before = JSON.stringify(invalid);
    expect(() => parseBackup({ ...legacy, ...invalid })).toThrow();
    expect(JSON.stringify(invalid)).toBe(before);
  });
});
