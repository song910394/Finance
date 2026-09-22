import { describe, expect, it } from 'vitest';
import { parseBackup, serializeBackup } from './backup';
import { prepareLeaveRecord, scheduleReservedLeave, summarizeLeave, summarizeLeavePurposes, validateLeaveData } from './leave';
import type { LeavePeriod, LeaveRecord } from '../types';

const today = '2026-09-22';
const period: LeavePeriod = { id: 'p', startDate: '2026-01-01', endDate: '2026-12-31', totalHours: 120 };
const reserve: LeaveRecord = { id: 'r', periodId: 'p', kind: 'reserved', purpose: 'family', hours: 24, completed: false, note: '家庭預留' };
const input = { date: today, hours: '8', completed: false, note: '分次排定' };
describe('保留時數與用途', () => {
  it('保留 24 → 排定 8 + 保留 16 → 全部排定；可再安排不變且不改原陣列', () => {
    const original = structuredClone(reserve);
    const split = scheduleReservedLeave([reserve], 'r', input, 'new', period, today);
    expect(split).toHaveLength(2);
    expect(split[0]).toMatchObject({ id: 'r', kind: 'reserved', hours: 16, completed: false });
    expect(split[1]).toMatchObject({ id: 'new', kind: 'dated', date: today, purpose: 'family', hours: 8 });
    expect(summarizeLeave(period, split)).toMatchObject({ reserved: 1600, planned: 800, used: 0, available: 9600 });
    const all = scheduleReservedLeave(split, 'r', { ...input, hours: '16' }, 'unused', period, today);
    expect(all).toHaveLength(2);
    expect(all.find(r => r.id === 'r')).toMatchObject({ kind: 'dated', date: today, hours: 16 });
    expect(summarizeLeave(period, all)).toMatchObject({ reserved: 0, planned: 2400, available: 9600 });
    expect(reserve).toEqual(original);
  });
  it('小數分拆精確，刪除保留與勾選只重算相應時數', () => {
    const split = scheduleReservedLeave([{ ...reserve, hours: 0.3 }], 'r', { ...input, hours: '0.1' }, 'n', period, today);
    expect(split.map(r => r.hours)).toEqual([0.2, 0.1]);
    const done = split.map(r => r.id === 'n' ? { ...r, completed: true } : r);
    expect(summarizeLeave(period, done)).toMatchObject({ used: 10, planned: 0, reserved: 20, remaining: 11990, available: 11970 });
    expect(summarizeLeave(period, done.filter(r => r.id !== 'r')).available).toBe(11990);
    expect(summarizeLeave({ ...period, totalHours: 0 }, [reserve]).available).toBe(-2400);
  });
  it('排定過量、零、區間外、錯誤來源與 ID 衝突整筆拒絕', () => {
    for (const change of [{ hours: '24.01' }, { hours: '0' }, { date: '2027-01-01' }, { date: '2026-02-30' }, { date: '2026-12-01', completed: true }]) {
      expect(() => scheduleReservedLeave([reserve], 'r', { ...input, ...change }, 'new', period, today)).toThrow();
    }
    expect(() => scheduleReservedLeave([reserve], 'bad', input, 'new', period, today)).toThrow();
    expect(() => scheduleReservedLeave([reserve], 'r', input, 'r', period, today)).toThrow();
    expect(() => scheduleReservedLeave([reserve], 'r', input, 'new', { ...period, id: 'other' }, today)).toThrow();
  });
  it('保留無日期且不能已休；缺日期的一般明細仍拒絕，用途與種類格式嚴格', () => {
    expect(() => validateLeaveData([period], [reserve], today)).not.toThrow();
    for (const record of [{ ...reserve, date: today }, { ...reserve, completed: true }, { ...reserve, kind: 'dated' }, { ...reserve, kind: 'bad' }, { ...reserve, purpose: 'bad' }]) {
      expect(() => validateLeaveData([period], [record], today)).toThrow();
    }
    expect(() => prepareLeaveRecord({ ...input, purpose: '' }, 'new', period, today)).toThrow('用途');
  });
  it('用途統計只算已休，舊紀錄未分類，全部零仍保留零而非捏造占比', () => {
    const dated = { id: 'd', periodId: 'p', date: today, hours: 8, completed: true };
    const rows = [reserve, dated, { ...dated, id: 'f', purpose: 'family' as const, hours: 4 }, { ...dated, id: 'a', purpose: 'association' as const, hours: 4 }, { ...dated, id: 'pending', purpose: 'family' as const, completed: false, hours: 50 }, { ...dated, id: 'other', periodId: 'other' }];
    expect(summarizeLeavePurposes(period, rows)).toEqual({ family: 400, association: 400, lover: 0, unclassified: 800 });
    expect(summarizeLeavePurposes(period, [reserve])).toEqual({ family: 0, association: 0, lover: 0, unclassified: 0 });
    const lover = { ...dated, id: 'l', purpose: 'lover' as const, hours: 2 };
    expect(summarizeLeavePurposes(period, [...rows, lover])).toMatchObject({ lover: 200 });
  });
  it('新備份保留種類、分類、保留時數與未知欄位；舊紀錄不被改寫', () => {
    const legacy = { id: 'old', periodId: 'p', date: today, hours: 8, completed: false };
    const data = parseBackup({ transactions: [], categories: [], budget: 0, cardBanks: [], cardSettings: {}, leavePeriods: [period], leaveRecords: [legacy, { ...reserve, future: 'keep' }] });
    expect(data.leaveRecords[0]).toEqual(legacy);
    expect(parseBackup(serializeBackup(data))).toEqual(data);
  });
});
