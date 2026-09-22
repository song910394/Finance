import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFinanceSync, getFinanceStorageKey } from './financeSync';
import { loadFromGoogleSheet, saveToGoogleSheet } from './googleSheetService';
import { parseBackup, serializeBackup } from '../utils/backup';
import { scheduleReservedLeave, summarizeLeave } from '../utils/leave';
import type { FinanceData } from '../types';

const A = 'https://example.test/leave-a';
const B = 'https://example.test/leave-b';
const legacy = { transactions: [{ id: 't', date: '2026-01-01', amount: 123.45, paymentMethod: '現金', cardBank: '-', category: '其他', description: '合成', isReconciled: false }], budget: 100, categories: ['其他'], cardBanks: ['-'], cardSettings: {}, incomeSources: [], salaryAdjustments: [], budgets: [], future: { retained: true } };
const fixture = (): FinanceData => parseBackup({ ...legacy,
  leavePeriods: [{ id: 'p', name: '合成年假', startDate: '2025-10-01', endDate: '2026-09-30', totalHours: 120.5 }],
  leaveRecords: [{ id: 'r', periodId: 'p', date: '2026-01-01', hours: 7.5, completed: false, purpose: 'family', note: '合成明細' },
    { id: 'reserve', periodId: 'p', kind: 'reserved', purpose: 'association', hours: 24, completed: false, note: '合成保留', future: { keep: true } }],
});
function memory() {
  const values = new Map<string, string>();
  return { values, get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
const controllers: ReturnType<typeof createFinanceSync>[] = [];
function setup(extra: Partial<Parameters<typeof createFinanceSync>[0]> = {}) {
  const storage = memory();
  const load = vi.fn(async () => fixture());
  const save = vi.fn(async (_url: string, _data: unknown) => true);
  const controller = createFinanceSync({ initialData: parseBackup(legacy), initialUrl: A, load, save, storage, ...extra });
  controllers.push(controller); return { controller, load, save, storage };
}
const financial = ({ leavePeriods: _periods, leaveRecords: _records, ...rest }: FinanceData) => rest;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-22T04:00:00Z')); });
afterEach(() => { controllers.splice(0).forEach(controller => controller.stop()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('年假沿用完整帳本保存流程', () => {
  it('分次排定一次完整保存，失败重試、離線重新載入與 mock 往返仍保留餘數', async () => {
    let remote = fixture();
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(async (_url, data) => { remote = parseBackup(serializeBackup(data)); return true; });
    const { controller, storage } = setup({ load: async () => remote, save }); await controller.start();
    const original = controller.getSnapshot().data;
    controller.update(data => ({ ...data, leaveRecords: scheduleReservedLeave(data.leaveRecords, 'reserve', { date: '2026-09-22', hours: '8', completed: false, note: '合成分次' }, 'split', data.leavePeriods[0], '2026-09-22') }));
    const split = controller.getSnapshot().data;
    expect(financial(split)).toEqual(financial(original));
    expect(split.leaveRecords.find(r => r.id === 'reserve')).toMatchObject({ hours: 16, kind: 'reserved', purpose: 'association', future: { keep: true } });
    expect(summarizeLeave(split.leavePeriods[0], split.leaveRecords).available).toBe(summarizeLeave(original.leavePeriods[0], original.leaveRecords).available);
    expect(JSON.parse(storage.getItem(getFinanceStorageKey(A))!).data).toEqual(split);
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.getSnapshot().status).toBe('error');
    expect(remote).toEqual(original);
    await controller.retry(); expect(remote).toEqual(split);
    controller.stop();
    const reopened = setup({ storage, load: async () => { throw new Error('offline'); } }); await reopened.controller.start();
    expect(reopened.controller.getSnapshot().data).toEqual(split);
  });
  it('年假與財務更新互相保留、原子驗證拒絕錯誤且完整 JSON 往返一致', async () => {
    const { controller, storage } = setup(); await controller.start();
    const original = controller.getSnapshot().data;
    controller.update(data => ({ ...data, leavePeriods: [{ ...data.leavePeriods[0], totalHours: 130.1 }], leaveRecords: [{ ...data.leaveRecords[0], hours: 0.3, completed: true }] }));
    expect(financial(controller.getSnapshot().data)).toEqual(financial(original));
    const leave = controller.getSnapshot().data;
    controller.update(data => ({ ...data, budget: 500, transactions: [{ ...data.transactions[0], amount: 999 }] }));
    expect(controller.getSnapshot().data.leavePeriods).toEqual(leave.leavePeriods);
    expect(controller.getSnapshot().data.leaveRecords).toEqual(leave.leaveRecords);
    const before = controller.getSnapshot().data;
    const diskBefore = storage.getItem(getFinanceStorageKey(A));
    expect(() => controller.update(data => ({ ...data, budget: 666, leaveRecords: [{ ...data.leaveRecords[0], periodId: 'missing' }] }))).toThrow();
    expect(controller.getSnapshot().data).toEqual(before);
    expect(storage.getItem(getFinanceStorageKey(A))).toBe(diskBefore);
    expect(parseBackup(serializeBackup(before))).toEqual(before);
  });
  it('保存本機草稿、重開離線保留，失敗重試不遺失日期時數與勾選', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
    const first = setup({ save }); await first.controller.start();
    first.controller.update(data => ({ ...data, leaveRecords: [{ ...data.leaveRecords[0], completed: true }] }));
    const expected = first.controller.getSnapshot().data;
    await vi.advanceTimersByTimeAsync(2000);
    expect(first.controller.getSnapshot()).toMatchObject({ status: 'error', localSaved: true });
    expect(JSON.parse(first.storage.getItem(getFinanceStorageKey(A))!).data).toEqual(expected);
    await first.controller.retry();
    expect(save.mock.calls[1][1]).toEqual(expected);
    expect(first.controller.getSnapshot().status).toBe('saved'); first.controller.stop();
    const second = setup({ storage: first.storage, load: async () => { throw new Error('offline'); } }); await second.controller.start();
    expect(second.controller.getSnapshot().data).toEqual(expected);
  });
  it('切換到空帳本與舊版帳本不夾帶 A 年假，A 草稿仍保留', async () => {
    const load = vi.fn().mockResolvedValueOnce(fixture()).mockResolvedValueOnce(null).mockResolvedValueOnce(legacy);
    const { controller, storage, save } = setup({ initialData: fixture(), load }); await controller.start();
    controller.update(data => ({ ...data, leaveRecords: [{ ...data.leaveRecords[0], note: 'A only' }] }));
    await controller.sync(B, false);
    expect(controller.getSnapshot().data).toMatchObject({ leavePeriods: [], leaveRecords: [], transactions: [] });
    expect(JSON.parse(storage.getItem(getFinanceStorageKey(A))!).data.leaveRecords[0].note).toBe('A only');
    await controller.sync(B + '/old', false);
    expect(controller.getSnapshot().data.leavePeriods).toEqual([]);
    await vi.advanceTimersByTimeAsync(3000); expect(save).not.toHaveBeenCalled();
  });
  it('舊版完整還原／重設先保留含年假的原版本，備份失敗不取代', async () => {
    const { controller, storage, save } = setup(); await controller.start();
    const original = controller.getSnapshot().data;
    const set = storage.setItem;
    storage.setItem = (key, value) => { if (key.includes(':recovery:')) throw new Error('quota'); set(key, value); };
    expect(() => controller.update(() => parseBackup(legacy), true)).toThrow('quota');
    expect(controller.getSnapshot().data).toEqual(original);
    await vi.advanceTimersByTimeAsync(3000); expect(save).not.toHaveBeenCalled();
    storage.setItem = set;
    controller.update(() => parseBackup(legacy), true);
    expect(controller.getSnapshot().data.leaveRecords).toEqual([]);
    const recovery = controller.getSnapshot().recoveries[0];
    expect(JSON.parse(storage.getItem(`${getFinanceStorageKey(A)}:recovery:${recovery.id}`)!).data).toEqual(original);
    controller.selectRecovery(recovery.id);
    expect(controller.getSnapshot().data).toEqual(original);
  });
  it('乾淨本機版本被雲端取代也先備份；錯誤雲端資料不部分匯入', async () => {
    const load = vi.fn().mockResolvedValueOnce(fixture()).mockResolvedValueOnce({ ...legacy, leaveRecords: [{ id: 'broken' }] }).mockResolvedValueOnce(legacy);
    const { controller, storage } = setup({ load }); await controller.start();
    const original = controller.getSnapshot().data;
    await expect(controller.sync(A, false)).rejects.toThrow();
    expect(controller.getSnapshot().data).toEqual(original);
    const set = storage.setItem;
    storage.setItem = (key, value) => { if (key.includes(':recovery:')) throw new Error('quota'); set(key, value); };
    await expect(controller.sync(A, false)).rejects.toThrow('quota');
    expect(controller.getSnapshot().data).toEqual(original);
    storage.setItem = set; load.mockResolvedValueOnce(legacy);
    await controller.sync(A, false);
    expect(controller.getSnapshot().data.leavePeriods).toEqual([]);
    expect(controller.getSnapshot().recoveries).toHaveLength(1);
  });
  it('分頁衝突保留兩份年假，明確選擇復原與雲端版本', async () => {
    const events = new EventTarget();
    const { controller, storage, save } = setup({ eventTarget: events as unknown as Window }); await controller.start();
    controller.update(data => ({ ...data, leaveRecords: [{ ...data.leaveRecords[0], completed: true }] }));
    const here = controller.getSnapshot().data;
    const other = fixture(); other.leaveRecords[0].hours = 3.5;
    storage.setItem(getFinanceStorageKey(A), JSON.stringify({ version: 1, data: other, revision: 10, writerId: 'other-tab', dirty: true }));
    events.dispatchEvent(Object.assign(new Event('storage'), { key: getFinanceStorageKey(A) }));
    expect(controller.getSnapshot().conflict).toBe('tab');
    const recovery = controller.getSnapshot().recoveries[0];
    expect(JSON.parse(storage.getItem(`${getFinanceStorageKey(A)}:recovery:${recovery.id}`)!).data).toEqual(here);
    await vi.advanceTimersByTimeAsync(3000); expect(save).not.toHaveBeenCalled();
    controller.selectRecovery(recovery.id); await controller.resolveConflict('local');
    expect(save.mock.calls[0][1]).toEqual(here);
    expect(controller.getSnapshot().recoveries.some(item => JSON.parse(storage.getItem(`${getFinanceStorageKey(A)}:recovery:${item.id}`)!).data.leaveRecords[0].hours === 3.5)).toBe(true);
    controller.update(data => ({ ...data, leaveRecords: [{ ...data.leaveRecords[0], note: 'new' }] }));
    await controller.sync(A, false); await controller.resolveConflict('cloud');
    expect(controller.getSnapshot().data).toEqual(fixture());
  });
  it('真實前端 save → mock JSON storage → load／chunks 完整保留年假', async () => {
    let persisted = '';
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') { persisted = JSON.stringify(JSON.parse(String(init.body)).data); return new Response('{"success":true}'); }
      return new Response(JSON.stringify({ success: true, chunks: [persisted.slice(0, 77), persisted.slice(77)] }));
    });
    vi.stubGlobal('fetch', fetch);
    const data = fixture(); data.leaveRecords[0].completed = true;
    await saveToGoogleSheet(A, data);
    expect(await loadFromGoogleSheet(A)).toEqual(data);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
