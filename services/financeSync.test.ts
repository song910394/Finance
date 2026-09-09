import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFinanceSync, getFinanceStorageKey, type StorageLike } from './financeSync';
import type { FinanceData } from '../utils/backup';
import type { BackupData } from '../types';

const A = 'https://example.test/a';
const B = 'https://example.test/b';
const data = (budget = 100): FinanceData => ({ transactions: [], categories: ['其他'], budget, cardBanks: ['-'], cardSettings: {}, incomeSources: [], budgets: [], salaryAdjustments: [] });
function memory() {
  const values = new Map<string, string>();
  return { values, get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => { values.delete(key); }, setItem: (key: string, value: string) => { values.set(key, value); } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const controllers: ReturnType<typeof createFinanceSync>[] = [];
function setup(extra: Partial<Parameters<typeof createFinanceSync>[0]> = {}) {
  const storage = memory();
  const load = vi.fn(async () => data());
  const save = vi.fn(async (_url: string, _data: BackupData) => true);
  const controller = createFinanceSync({ initialData: data(), initialUrl: A, storage, load, save, ...extra });
  controllers.push(controller);
  return { controller, storage, load, save };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { controllers.splice(0).forEach((controller) => controller.stop()); vi.useRealTimers(); });

describe('finance sync persistence and request ordering', () => {
  it('反覆載入相同版本不增加備份；刪除只移除備份且保護使用中草稿', async () => {
    const { controller, storage, save } = setup();
    await controller.start();
    controller.update(current => ({ ...current, budget: 222 }), true);
    const original = controller.getSnapshot().recoveries[0].id;
    controller.selectRecovery(original);
    const replacement = controller.getSnapshot().recoveries.find(item => item.id !== original)!.id;
    controller.selectRecovery(replacement);
    controller.selectRecovery(original);
    expect(controller.getSnapshot().recoveries).toHaveLength(2);
    expect(() => controller.deleteRecoveries([original])).toThrow('正在使用');
    const active = storage.getItem(getFinanceStorageKey(A));
    controller.deleteRecoveries([replacement]);
    expect(controller.getSnapshot().data.budget).toBe(100);
    expect(storage.getItem(getFinanceStorageKey(A))).toBe(active);
    expect(controller.getSnapshot().recoveries.map(item => item.id)).toEqual([original]);
    expect(save).not.toHaveBeenCalled();
    expect(storage.getItem(`${getFinanceStorageKey(A)}:recovery:${replacement}`)).toBeNull();
  });
  it('批次更新前保留完整原版本，重新開啟後仍可取回', async () => {
    const { controller, storage } = setup();
    await controller.start();
    controller.update(current => ({ ...current, budget: 222 }), true);
    const recovery = controller.getSnapshot().recoveries[0];
    expect(recovery).toBeDefined();
    expect(JSON.parse(storage.getItem(`${getFinanceStorageKey(A)}:recovery:${recovery.id}`)!).data.budget).toBe(100);
    expect(controller.getSnapshot().data.budget).toBe(222);
  });
  it('原始版本備份失敗時不套用批次更新或上傳', async () => {
    const { controller, storage, save } = setup();
    await controller.start();
    const originalSet = storage.setItem;
    storage.setItem = (key, value) => { if (key.includes(':recovery:')) throw new Error('quota'); originalSet(key, value); };
    expect(() => controller.update(current => ({ ...current, budget: 222 }), true)).toThrow('quota');
    expect(controller.getSnapshot().data.budget).toBe(100);
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).not.toHaveBeenCalled();
  });
  it('keeps every edit on disk before debounce and restores it after the page closes', async () => {
    const first = setup();
    await first.controller.start();
    first.controller.update((current) => ({ ...current, budget: 222 }));
    first.controller.stop();
    expect(JSON.parse(first.storage.getItem(getFinanceStorageKey(A))!).data.budget).toBe(222);
    expect(first.save).not.toHaveBeenCalled();
    const second = setup({ storage: first.storage, load: async () => { throw new Error('offline'); } });
    await second.controller.start();
    expect(second.controller.getSnapshot()).toMatchObject({ data: { budget: 222 }, dirty: true, localSaved: true, status: 'error' });
  });

  it('never POSTs A data to B while B restore is delayed or fails', async () => {
    const waiting = deferred<FinanceData>();
    const load = vi.fn().mockResolvedValueOnce(data(101)).mockReturnValueOnce(waiting.promise);
    const { controller, save, storage } = setup({ load });
    await controller.start();
    controller.update((current) => ({ ...current, budget: 102 }));
    const restoring = controller.sync(B, false);
    const failure = expect(restoring).rejects.toThrow('B unavailable');
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).not.toHaveBeenCalled();
    expect(controller.getSnapshot().url).toBe(A);
    waiting.reject(new Error('B unavailable'));
    await failure;
    expect(storage.getItem('google_script_url')).toBe(A);
    controller.update((current) => ({ ...current, budget: 103 }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ url: A, status: 'error', data: { budget: 103 } });
  });

  it('serializes saves and never marks a newer edit saved by an older response', async () => {
    const old = deferred<boolean>();
    const save = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(true);
    const { controller } = setup({ save });
    await controller.start();
    controller.update((current) => ({ ...current, budget: 200 }));
    await vi.advanceTimersByTimeAsync(2000);
    controller.update((current) => ({ ...current, budget: 300 }));
    await vi.advanceTimersByTimeAsync(2500);
    expect(save).toHaveBeenCalledTimes(1);
    old.resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot()).toMatchObject({ dirty: true, status: 'syncing', data: { budget: 300 } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1].budget).toBe(300);
    expect(controller.getSnapshot()).toMatchObject({ dirty: false, status: 'saved' });
  });

  it('requires a choice between a dirty local draft and remote data', async () => {
    const { controller, save } = setup();
    await controller.start();
    controller.update((current) => ({ ...current, budget: 333 }));
    await controller.sync(A, false);
    expect(controller.getSnapshot()).toMatchObject({ conflict: 'draft', status: 'conflict', data: { budget: 333 } });
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).not.toHaveBeenCalled();
    await controller.resolveConflict('local');
    expect(save.mock.calls[0][1].budget).toBe(333);
    expect(controller.getSnapshot()).toMatchObject({ conflict: null, status: 'saved' });
  });

  it('cloud choice explicitly replaces dirty local data and does not upload it', async () => {
    const { controller, save } = setup();
    await controller.start();
    controller.update((current) => ({ ...current, budget: 333 }));
    await controller.sync(A, false);
    await controller.resolveConflict('cloud');
    expect(controller.getSnapshot()).toMatchObject({ conflict: null, dirty: false, data: { budget: 100 } });
    expect(save).not.toHaveBeenCalled();
  });

  it('preserves an edit made during initial loading and asks which version to keep', async () => {
    const loading = deferred<FinanceData>();
    const { controller, save } = setup({ load: () => loading.promise });
    const start = controller.start();
    controller.update((current) => ({ ...current, budget: 777 }));
    loading.resolve(data());
    await start;
    expect(controller.getSnapshot()).toMatchObject({ conflict: 'draft', data: { budget: 777 }, localSaved: true });
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps data after failed upload and retries the pending version explicitly', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
    const { controller, storage } = setup({ save });
    await controller.start();
    controller.update((current) => ({ ...current, budget: 456 }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', dirty: true, localSaved: true });
    expect(JSON.parse(storage.getItem(getFinanceStorageKey(A))!).data.budget).toBe(456);
    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({ status: 'saved', dirty: false });
  });

  it('reports storage failures and never claims a failed local save succeeded', async () => {
    const storage: StorageLike = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const { controller, save } = setup({ storage });
    await controller.start();
    controller.update((current) => ({ ...current, budget: 600 }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(controller.getSnapshot()).toMatchObject({ localSaved: false, status: 'error', dirty: true });
    expect(save).not.toHaveBeenCalled();
  });

  it('times out and ignores a late response after cancelling a load', async () => {
    const loading = deferred<FinanceData>();
    const { controller } = setup({ load: () => loading.promise, requestTimeoutMs: 1000 });
    const starting = controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    await starting;
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', dirty: false });
    expect(controller.getSnapshot().error).toContain('逾時');
    loading.resolve(data(999));
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot().data.budget).toBe(100);
  });

  it('detects another tab before upload and retains both drafts', async () => {
    const { controller, storage, save } = setup();
    await controller.start();
    controller.update((current) => ({ ...current, budget: 201 }));
    storage.setItem(getFinanceStorageKey(A), JSON.stringify({ version: 1, data: data(999), dirty: true, revision: 5, writerId: 'other-tab' }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.getSnapshot()).toMatchObject({ conflict: 'tab', status: 'conflict', data: { budget: 201 } });
    expect(JSON.parse(storage.getItem(getFinanceStorageKey(A))!).data.budget).toBe(999);
    const recovery = [...storage.values.entries()].find(([key]) => key.includes(':recovery:'));
    expect(JSON.parse(recovery![1]).data.budget).toBe(201);
    expect(save).not.toHaveBeenCalled();
  });

  it('uses empty financial records when the cloud has no data', async () => {
    const initial = data();
    initial.transactions = [{ id: 'sample', date: '2026-09-01', amount: 10, paymentMethod: '現金' as any, cardBank: '-', category: '其他', description: 'sample', isReconciled: false }];
    const { controller, save } = setup({ initialData: initial, load: async () => null });
    await controller.start();
    expect(controller.getSnapshot().data.transactions).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it('ignores a stopped first mount after a second mount starts', async () => {
    const old = deferred<FinanceData>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(data(202));
    const { controller } = setup({ load });
    const firstStart = controller.start();
    await vi.advanceTimersByTimeAsync(0);
    controller.stop();
    await controller.start();
    await firstStart;
    old.resolve(data(909));
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot()).toMatchObject({ status: 'saved', data: { budget: 202 } });
  });

  it('isolates drafts by endpoint when a URL change succeeds', async () => {
    const load = vi.fn().mockResolvedValueOnce(data(101)).mockResolvedValueOnce(data(202));
    const { controller, storage, save } = setup({ load });
    await controller.start();
    controller.update((current) => ({ ...current, budget: 111 }));
    await controller.sync(B, false);
    expect(controller.getSnapshot()).toMatchObject({ url: B, data: { budget: 202 }, dirty: false });
    expect(JSON.parse(storage.getItem(getFinanceStorageKey(A))!).data.budget).toBe(111);
    expect(JSON.parse(storage.getItem(getFinanceStorageKey(B))!).data.budget).toBe(202);
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).not.toHaveBeenCalled();
  });

  it('reacts immediately to another tab storage event', async () => {
    const events = new EventTarget();
    const { controller, storage, save } = setup({ eventTarget: events as unknown as Window });
    await controller.start();
    controller.update((current) => ({ ...current, budget: 321 }));
    storage.setItem(getFinanceStorageKey(A), JSON.stringify({ version: 1, data: data(888), dirty: true, revision: 4, writerId: 'other' }));
    events.dispatchEvent(Object.assign(new Event('storage'), { key: getFinanceStorageKey(A) }));
    expect(controller.getSnapshot()).toMatchObject({ conflict: 'tab', status: 'conflict', data: { budget: 321 } });
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).not.toHaveBeenCalled();
  });

  it('retries a failed explicit B upload as an upload to B without restoring B data', async () => {
    const load = vi.fn().mockResolvedValueOnce(data(101)).mockResolvedValue(data(202));
    const save = vi.fn().mockRejectedValueOnce(new Error('upload failed')).mockResolvedValue(true);
    const { controller } = setup({ load, save });
    await controller.start();
    await expect(controller.sync(B, true)).rejects.toThrow('upload failed');
    await controller.retry();
    expect(load).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toBe(B);
    expect(save.mock.calls[1][1].budget).toBe(101);
    expect(controller.getSnapshot()).toMatchObject({ url: B, data: { budget: 101 }, status: 'saved' });
  });

  it('can discover and explicitly select a preserved recovery after reopening', async () => {
    const first = setup();
    await first.controller.start();
    first.controller.update((current) => ({ ...current, budget: 201 }));
    first.storage.setItem(getFinanceStorageKey(A), JSON.stringify({ version: 1, data: data(999), dirty: true, revision: 5, writerId: 'other-tab' }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(first.controller.getSnapshot()).toMatchObject({ conflict: 'tab', localSaved: true });
    first.controller.stop();
    const second = setup({ storage: first.storage, load: async () => data(999) });
    await second.controller.start();
    const recoveries = second.controller.getSnapshot().recoveries;
    expect(recoveries).toHaveLength(1);
    expect(second.controller.getSnapshot()).toMatchObject({ status: 'conflict' });
    second.controller.selectRecovery(recoveries[0].id);
    expect(second.controller.getSnapshot()).toMatchObject({ data: { budget: 201 }, dirty: true, conflict: 'draft' });
    await second.controller.resolveConflict('local');
    expect(second.save.mock.calls[0][1].budget).toBe(201);
    const displaced = second.controller.getSnapshot().recoveries.find((recovery) => recovery.id !== recoveries[0].id)!;
    second.controller.selectRecovery(displaced.id);
    expect(second.controller.getSnapshot().data.budget).toBe(999);
  });

  it('keeps A paired with its data if B draft changes during B loading', async () => {
    const waiting = deferred<FinanceData>();
    const load = vi.fn().mockResolvedValueOnce(data(101)).mockReturnValueOnce(waiting.promise);
    const { controller, storage, save } = setup({ load });
    await controller.start();
    const restoring = controller.sync(B, false);
    storage.setItem(getFinanceStorageKey(B), JSON.stringify({ version: 1, data: data(999), dirty: true, revision: 9, writerId: 'other-tab' }));
    waiting.resolve(data(202));
    await restoring;
    const current = controller.getSnapshot();
    // Either remain on A or atomically switch to B's own draft, never pair B with A's data.
    expect(current.url === A ? current.data.budget === 101 : current.data.budget === 999).toBe(true);
    if (current.url === B) {
      expect(current.conflict).toBe('draft');
      await controller.resolveConflict('local');
      expect(save.mock.calls[0][1].budget).toBe(999);
    }
    const recoveriesForB = [...storage.values.entries()].filter(([key]) => key.startsWith(`${getFinanceStorageKey(B)}:recovery:`));
    expect(recoveriesForB.some(([, raw]) => JSON.parse(raw).data.budget === 101)).toBe(false);
  });

  it('discovers older recovery files without an index and keeps them accessible offline', async () => {
    const storage = memory();
    storage.setItem(`${getFinanceStorageKey(A)}:recovery:legacy`, JSON.stringify({ version: 1, data: data(201), dirty: true, revision: 2, writerId: 'legacy' }));
    const { controller } = setup({ storage, load: async () => { throw new Error('offline'); } });
    await controller.start();
    expect(controller.getSnapshot().recoveries.map((recovery) => recovery.id)).toEqual(['legacy']);
    controller.selectRecovery('legacy');
    expect(controller.getSnapshot()).toMatchObject({ data: { budget: 201 }, localSaved: true, dirty: true, status: 'conflict' });
  });

  it('retains the active draft and original recovery after editing a selected recovery and reopening', async () => {
    const storage = memory();
    storage.setItem(getFinanceStorageKey(A), JSON.stringify({ version: 1, data: data(999), dirty: true, revision: 5, writerId: 'active' }));
    storage.setItem(`${getFinanceStorageKey(A)}:recovery:older`, JSON.stringify({ version: 1, data: data(201), dirty: true, revision: 2, writerId: 'older' }));
    const first = setup({ storage });
    await first.controller.start();
    first.controller.selectRecovery('older');
    first.controller.update((current) => ({ ...current, budget: 202 }));
    first.controller.stop();

    const second = setup({ storage });
    await second.controller.start();
    expect(second.controller.getSnapshot().data.budget).toBe(202);
    const recoveries = second.controller.getSnapshot().recoveries;
    const originalActive = recoveries.find((item) => JSON.parse(storage.getItem(`${getFinanceStorageKey(A)}:recovery:${item.id}`)!).data.budget === 999);
    expect(originalActive).toBeDefined();
    second.controller.selectRecovery(originalActive!.id);
    expect(second.controller.getSnapshot().data.budget).toBe(999);
    second.controller.selectRecovery('older');
    expect(second.controller.getSnapshot().data.budget).toBe(201);
    expect(first.save).not.toHaveBeenCalled();
    expect(second.save).not.toHaveBeenCalled();
  });

  it('keeps the active version selected when preserving it before recovery selection fails', async () => {
    const storage = memory();
    storage.setItem(getFinanceStorageKey(A), JSON.stringify({ version: 1, data: data(999), dirty: true, revision: 5, writerId: 'active' }));
    storage.setItem(`${getFinanceStorageKey(A)}:recovery:older`, JSON.stringify({ version: 1, data: data(201), dirty: true, revision: 2, writerId: 'older' }));
    const { controller, save } = setup({ storage });
    await controller.start();
    const activeBefore = storage.getItem(getFinanceStorageKey(A));
    const originalSetItem = storage.setItem;
    storage.setItem = (key, value) => {
      if (key.includes(':recovery:')) throw new Error('quota');
      originalSetItem(key, value);
    };
    expect(() => controller.selectRecovery('older')).toThrow('quota');
    expect(controller.getSnapshot()).toMatchObject({ data: { budget: 999 }, dirty: true, conflict: 'draft' });
    expect(storage.getItem(getFinanceStorageKey(A))).toBe(activeBefore);
    expect(JSON.parse(storage.getItem(`${getFinanceStorageKey(A)}:recovery:older`)!).data.budget).toBe(201);
    expect(save).not.toHaveBeenCalled();
  });
});
