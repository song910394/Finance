import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFinanceSync } from './financeSync';
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

describe('年假與財務共用即時雲端同步', () => {
  it('分次排定整組保存，失敗重試及重開從雲端讀回完整資料', async () => {
    let remote = fixture();
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(async (_url, data) => { remote = parseBackup(serializeBackup(data)); return true; });
    const { controller, storage } = setup({ load: async () => remote, save }); await controller.start();
    const original = controller.getSnapshot().data;
    controller.update(data => ({ ...data, leaveRecords: scheduleReservedLeave(data.leaveRecords, 'reserve', { date: '2026-09-22', hours: '8', completed: false, note: '合成分次' }, 'split', data.leavePeriods[0], '2026-09-22') }));
    const split = controller.getSnapshot().data;
    expect(financial(split)).toEqual(financial(original));
    expect(split.leaveRecords.find(r => r.id === 'reserve')).toMatchObject({ hours: 16, kind: 'reserved', purpose: 'association', future: { keep: true } });
    expect(summarizeLeave(split.leavePeriods[0], split.leaveRecords).available).toBe(summarizeLeave(original.leavePeriods[0], original.leaveRecords).available);
    await expect(controller.whenIdle()).rejects.toThrow('offline');
    expect(remote).toEqual(original);
    expect([...storage.values.keys()]).toEqual(['google_script_url']);
    await controller.retry(); expect(remote).toEqual(split);
    controller.stop();
    const reopened = setup({ load: async () => remote }); await reopened.controller.start();
    expect(reopened.controller.getSnapshot().data).toEqual(split);
  });
  it('原子驗證拒絕孤兒休假，不部分更新財務；完整 JSON 往返一致', async () => {
    const { controller, save } = setup(); await controller.start();
    const before = controller.getSnapshot().data;
    expect(() => controller.update(data => ({ ...data, budget: 666, leaveRecords: [{ ...data.leaveRecords[0], periodId: 'missing' }] }))).toThrow();
    expect(controller.getSnapshot().data).toEqual(before);
    expect(save).not.toHaveBeenCalled();
    expect(parseBackup(serializeBackup(before))).toEqual(before);
  });
  it('跨設備修改不同休假各自保留，同一筆以最後儲存為準且不影響財務', async () => {
    let remote = fixture();
    const shared = { load: async () => remote, save: async (_url: string, value: unknown) => { remote = parseBackup(value); } };
    const first = setup(shared).controller, second = setup(shared).controller;
    await first.start(); await second.start();
    first.update(data => ({ ...data, leaveRecords: data.leaveRecords.map(r => r.id === 'r' ? { ...r, hours: 8, completed: true } : r) }));
    await first.whenIdle();
    second.update(data => ({ ...data, leaveRecords: data.leaveRecords.map(r => r.id === 'reserve' ? { ...r, hours: 16 } : r) }));
    await second.whenIdle();
    expect(remote.leaveRecords[0]).toMatchObject({ hours: 8, completed: true });
    expect(remote.leaveRecords[1]).toMatchObject({ hours: 16, purpose: 'association' });
    first.update(data => ({ ...data, leaveRecords: data.leaveRecords.map(r => r.id === 'reserve' ? { ...r, hours: 12 } : r) }));
    await first.whenIdle();
    expect(remote.leaveRecords[1].hours).toBe(12);
    expect(financial(remote)).toEqual(financial(fixture()));
  });
  it('合併後年度範圍無法容納另一設備新增的休假時，整組停止上傳', async () => {
    let remote = fixture();
    const { controller, save } = setup({ load: async () => remote });
    await controller.start();
    remote = { ...remote, leaveRecords: [...remote.leaveRecords, { id: 'new', periodId: 'p', date: '2026-09-22', hours: 1, completed: false }] };
    controller.update(data => ({ ...data, leavePeriods: [{ ...data.leavePeriods[0], endDate: '2026-08-31' }] }));
    await expect(controller.whenIdle()).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ dirty: true, status: 'error' });
  });
  it('切換空帳本不夾帶年假，舊版完整匯入明確清空年假且不依賴本機備份', async () => {
    const { controller, load, save, storage } = setup(); await controller.start();
    controller.update(() => parseBackup(legacy), { replace: true });
    await controller.whenIdle();
    expect(save.mock.calls[0][1]).toEqual(parseBackup(legacy));
    expect([...storage.values.keys()]).toEqual(['google_script_url']);
    load.mockResolvedValueOnce(null as never); await controller.sync(B, false);
    expect(controller.getSnapshot().data).toMatchObject({ transactions: [], leavePeriods: [], leaveRecords: [] });
  });
  it('錯誤雲端資料不部分匯入，也不觸發回傳覆蓋', async () => {
    const { controller, load, save } = setup(); await controller.start();
    const original = controller.getSnapshot().data;
    load.mockResolvedValueOnce({ ...legacy, leaveRecords: [{ id: 'broken' }] } as never);
    await expect(controller.sync(A, false)).rejects.toThrow();
    expect(controller.getSnapshot().data).toEqual(original);
    expect(save).not.toHaveBeenCalled();
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
