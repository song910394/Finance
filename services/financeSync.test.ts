import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFinanceSync } from './financeSync';
import { parseBackup, type FinanceData } from '../utils/backup';
import { deleteCard } from '../utils/deleteCard';
import { PaymentMethod } from '../types';

const A = 'https://example.test/a';
const B = 'https://example.test/b';
const data = (budget = 100): FinanceData => ({ transactions: [], categories: ['其他'], budget, cardBanks: ['-'], cardSettings: {}, incomeSources: [], budgets: [], salaryAdjustments: [], leavePeriods: [], leaveRecords: [] });
const tx = (id: string, amount = 10) => ({ id, date: '2026-09-01', amount, paymentMethod: PaymentMethod.CASH, cardBank: '-', category: '其他', description: id, isReconciled: false });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const controllers: ReturnType<typeof createFinanceSync>[] = [];
function setup(extra: Partial<Parameters<typeof createFinanceSync>[0]> = {}) {
  let remote = data();
  const storage = { getItem: vi.fn(() => '{invalid legacy draft'), setItem: vi.fn() };
  const load = vi.fn(async (_url: string) => parseBackup(remote));
  const save = vi.fn(async (_url: string, value: unknown) => { remote = parseBackup(value); return true; });
  const controller = createFinanceSync({ initialData: data(), initialUrl: A, storage, load, save, ...extra });
  controllers.push(controller);
  return { controller, storage, load, save, remote: () => remote };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { controllers.splice(0).forEach(controller => controller.stop()); vi.useRealTimers(); });

describe('雲端即時同步，不保存本機草稿', () => {
  it('不讀舊草稿、不寫帳本，載入後修改立即上傳，不需要等待計時器', async () => {
    const { controller, storage, save, remote } = setup();
    await controller.start();
    controller.update(value => ({ ...value, budget: 222 }));
    expect(controller.getSnapshot()).toMatchObject({ dirty: true, status: 'syncing' });
    await controller.whenIdle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(remote().budget).toBe(222);
    expect(controller.getSnapshot()).toMatchObject({ dirty: false, status: 'saved' });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem.mock.calls).toEqual([['google_script_url', A]]);
  });
  it('localStorage 被拒絕仍可載入、儲存；初次雲端失敗則禁止編輯', async () => {
    const { controller } = setup({ storage: { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('quota'); } } });
    await controller.start(); controller.update(value => ({ ...value, budget: 200 })); await controller.whenIdle();
    expect(controller.getSnapshot().status).toBe('saved');
    const failed = setup({ load: async () => { throw Error('offline'); } });
    await failed.controller.start();
    expect(failed.controller.getSnapshot()).toMatchObject({ ready: false, status: 'error' });
    expect(() => failed.controller.update(() => data(999))).toThrow('載入');
    expect(failed.save).not.toHaveBeenCalled();
  });
  it('沒有網址時不可編輯或把空帳本上傳，設定連線後才可使用', async () => {
    const { controller, save } = setup({ initialUrl: '' });
    await controller.start();
    expect(controller.getSnapshot().ready).toBe(false);
    await expect(controller.sync(A, true)).rejects.toThrow('載入');
    expect(save).not.toHaveBeenCalled();
    await controller.sync(A, false);
    expect(controller.getSnapshot()).toMatchObject({ ready: true, url: A, status: 'saved' });
  });
  it('上傳失敗只保留目前頁面，重试再讀最新資料且不重複新增', async () => {
    let remote = data();
    const save = vi.fn(async (_url, value) => { remote = parseBackup(value); if (save.mock.calls.length === 1) throw Error('lost acknowledgement'); });
    const { controller } = setup({ load: async () => remote, save });
    await controller.start();
    controller.update(value => ({ ...value, transactions: [tx('new')] }));
    await expect(controller.whenIdle()).rejects.toThrow('lost acknowledgement');
    expect(controller.getSnapshot()).toMatchObject({ dirty: true, status: 'error' });
    remote.transactions.push(tx('other-device'));
    await controller.retry();
    expect(remote.transactions.map(item => item.id)).toEqual(['new', 'other-device']);
    expect(controller.getSnapshot()).toMatchObject({ dirty: false, status: 'saved' });
  });
  it('讀取最新雲端失敗不盲目覆蓋，重試仍保留修改', async () => {
    const { controller, load, save } = setup();
    await controller.start(); load.mockRejectedValueOnce(Error('offline'));
    controller.update(value => ({ ...value, budget: 456 }));
    await expect(controller.whenIdle()).rejects.toThrow('offline');
    expect(save).not.toHaveBeenCalled();
    await controller.refresh();
    expect(controller.getSnapshot().data.budget).toBe(456);
    await controller.retry(); expect(save.mock.calls[0][1]).toMatchObject({ budget: 456 });
  });
  it('快速連續修改依序送出，舊回應不會將新修改標為已同步', async () => {
    const first = deferred<boolean>(), second = deferred<boolean>();
    const save = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const { controller } = setup({ save });
    await controller.start(); controller.update(() => data(200));
    await vi.advanceTimersByTimeAsync(0);
    controller.update(() => data(300));
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve(true); await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({ dirty: true, status: 'syncing', data: { budget: 300 } });
    second.resolve(true); await controller.whenIdle();
    expect(controller.getSnapshot()).toMatchObject({ dirty: false, status: 'saved', data: { budget: 300 } });
  });
  it('逾時可重試，停止後的回應不改變畫面', async () => {
    const pending = deferred<boolean>();
    const { controller, save } = setup({ save: vi.fn(() => pending.promise), requestTimeoutMs: 50 });
    await controller.start(); controller.update(() => data(200));
    const done = expect(controller.whenIdle()).rejects.toThrow('逾時');
    await vi.advanceTimersByTimeAsync(50); await done;
    expect(controller.getSnapshot()).toMatchObject({ dirty: true, status: 'error' });
    controller.stop(); const before = controller.getSnapshot();
    pending.resolve(true); await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot()).toEqual(before);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('不同設備保留各自修改，同一筆以最後儲存為準', () => {
  it('舊畫面新增、修改、刪除不抹掉另一設備的紀錄', async () => {
    let remote = { ...data(), transactions: [tx('same'), tx('removed'), tx('untouched')] };
    const shared = { load: async () => parseBackup(remote), save: async (_url: string, value: unknown) => { remote = parseBackup(value); } };
    const first = setup(shared).controller, second = setup(shared).controller;
    await first.start(); await second.start();
    first.update(value => ({ ...value, transactions: [tx('same', 20), tx('removed'), tx('from-a')] }));
    await first.whenIdle();
    second.update(value => ({ ...value, transactions: [...value.transactions.filter(item => item.id !== 'removed').map(item => item.id === 'same' ? tx('same', 30) : item), tx('from-b')] }));
    await second.whenIdle();
    expect(remote.transactions).toEqual([tx('same', 30), tx('from-a'), tx('from-b')]);
    expect(second.getSnapshot().data).toEqual(remote);
    await first.refresh(); expect(first.getSnapshot().data).toEqual(remote);
  });
  it('依月份保留帳務，依 ID 保留薪資／年假，分類與銀行選項只套用增刪', async () => {
    let remote = data();
    const { controller } = setup({ load: async () => remote, save: async (_url, value) => { remote = parseBackup(value); } });
    await controller.start();
    remote = { ...remote, categories: ['其他', '遠端分類'], cardBanks: ['-', '遠端銀行'],
      budgets: [{ month: '2026-08', openingBalance: 200, loan: 0, incomes: [] }],
      leavePeriods: [{ id: 'p', startDate: '2026-01-01', endDate: '2026-12-31', totalHours: 10 }],
    };
    controller.update(value => ({ ...value, categories: ['其他', '本次分類'], cardBanks: ['-', '本次銀行'], budgets: [{ month: '2026-09', openingBalance: 300, loan: 0, incomes: [] }] }));
    await controller.whenIdle();
    expect(remote.categories).toEqual(['其他', '遠端分類', '本次分類']);
    expect(remote.cardBanks).toEqual(['-', '遠端銀行', '本次銀行']);
    expect(remote.budgets.map(item => item.month)).toEqual(['2026-08', '2026-09']);
    expect(remote.leavePeriods).toHaveLength(1);
  });
  it('刪除信用卡時也處理另一设备新增在該卡的交易', async () => {
    let remote = { ...data(), cardBanks: ['-', '測試卡'], cardSettings: { '測試卡': { statementDay: 15 } } };
    const { controller } = setup({ load: async () => remote, save: async (_url, value) => { remote = parseBackup(value) as typeof remote; } });
    await controller.start();
    remote.transactions.push({ ...tx('new'), cardBank: '測試卡', paymentMethod: PaymentMethod.CREDIT_CARD });
    controller.update(value => deleteCard(value, '測試卡'), { reapply: true });
    await controller.whenIdle();
    expect(remote.transactions[0]).toMatchObject({ cardBank: '-', paymentMethod: '現金' });
    expect(remote.cardBanks).toEqual(['-']);
  });
  it('明確匯入或重設仍整份取代，即使本次資料與畫面一樣', async () => {
    let remote = data();
    const { controller } = setup({ load: async () => remote, save: async (_url, value) => { remote = parseBackup(value); } });
    await controller.start(); remote.transactions.push(tx('remote'));
    controller.update(() => data(), { replace: true }); await controller.whenIdle();
    expect(remote).toEqual(data());
  });
});

describe('背景刷新與連線切換', () => {
  it('背景載入不產生上傳，不在使用者開始編輯後替換資料', async () => {
    const pending = deferred<FinanceData>();
    const { controller, load, save } = setup();
    await controller.start(); load.mockReturnValueOnce(pending.promise);
    const refreshing = controller.refresh();
    controller.update(() => data(200));
    pending.resolve(data(800)); await refreshing; await controller.whenIdle();
    expect(controller.getSnapshot().data.budget).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
    load.mockResolvedValueOnce(data(900));
    await controller.refresh(() => false);
    expect(controller.getSnapshot().data.budget).toBe(200);
    await controller.refresh();
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('失敗下載保留原帳本和網址，重試仍下載指定目標', async () => {
    const { controller, load, save, storage } = setup();
    await controller.start(); load.mockRejectedValueOnce(Error('B offline'));
    await expect(controller.sync(B, false)).rejects.toThrow('B offline');
    expect(controller.getSnapshot()).toMatchObject({ url: A, data: data() });
    load.mockResolvedValueOnce(data(500));
    await controller.retry();
    expect(load.mock.calls.at(-1)?.[0]).toBe(B);
    expect(controller.getSnapshot()).toMatchObject({ url: B, data: { budget: 500 } });
    expect(storage.setItem).toHaveBeenLastCalledWith('google_script_url', B);
    expect(save).not.toHaveBeenCalled();
  });
  it('失敗手動上傳重試仍傳到目標網址，成功後才切換連線', async () => {
    const { controller, save, load } = setup();
    await controller.start(); save.mockRejectedValueOnce(Error('B offline'));
    await expect(controller.sync(B, true)).rejects.toThrow('B offline');
    expect(controller.getSnapshot().url).toBe(A);
    await controller.retry();
    expect(save.mock.calls.map(call => call[0])).toEqual([B, B]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ url: B, dirty: false, status: 'saved' });
  });
  it('未上傳的修改阻止切換，切換成功不夾帶原帳本資料', async () => {
    const { controller, save, load } = setup();
    await controller.start(); save.mockRejectedValueOnce(Error('offline'));
    controller.update(() => data(222)); await expect(controller.whenIdle()).rejects.toThrow();
    await expect(controller.sync(B, false)).rejects.toThrow('未上傳');
    await controller.retry(); load.mockResolvedValueOnce(null as never);
    await controller.sync(B, false);
    expect(controller.getSnapshot()).toMatchObject({ url: B, data: data(), dirty: false });
  });
  it('過期下載回應不會覆蓋較新的帳本，載入期間不可編輯', async () => {
    const pending = deferred<FinanceData>();
    const { controller, load } = setup();
    await controller.start(); load.mockReturnValueOnce(pending.promise);
    const old = controller.sync(B, false);
    expect(() => controller.update(() => data(777))).toThrow('載入');
    load.mockResolvedValueOnce(data(400)); await controller.sync(A, false);
    pending.resolve(data(999)); await old;
    expect(controller.getSnapshot()).toMatchObject({ url: A, data: { budget: 400 } });
  });
});
