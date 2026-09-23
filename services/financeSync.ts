import type { BackupData } from '../types';
import { parseBackup, type FinanceData } from '../utils/backup';
import { applyFinanceChanges } from './financeChanges';
import { loadFromGoogleSheet, saveToGoogleSheet } from './googleSheetService';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface FinanceSyncSnapshot {
  data: FinanceData;
  url: string;
  status: 'loading' | 'syncing' | 'saved' | 'error';
  ready: boolean;
  dirty: boolean;
  error: string | null;
  pendingUrl: string | null;
  lastSyncedAt: number | null;
}
interface Options {
  initialData: FinanceData;
  initialUrl: string;
  storage?: StorageLike;
  load?: (url: string, signal?: AbortSignal) => Promise<BackupData | null>;
  save?: (url: string, data: BackupData, signal?: AbortSignal) => Promise<unknown>;
  requestTimeoutMs?: number;
}
type Change = (remote: FinanceData) => FinanceData;
const message = (error: unknown) => error instanceof Error ? error.message : '同步失敗，請重試';

export function createFinanceSync(options: Options) {
  const initial = parseBackup(options.initialData);
  const empty = parseBackup({ ...initial, transactions: [], budgets: [], salaryAdjustments: [], leavePeriods: [], leaveRecords: [] });
  const load = options.load ?? loadFromGoogleSheet;
  const save = options.save ?? saveToGoogleSheet;
  const listeners = new Set<() => void>();
  let storage = options.storage;
  if (!storage) {
    try { storage = globalThis.localStorage; } catch { /* 連線設定無法持久保存不影響雲端同步。 */ }
  }
  let snapshot: FinanceSyncSnapshot = {
    data: initial, url: options.initialUrl.trim(), status: 'loading', ready: false,
    dirty: false, error: null, pendingUrl: null, lastSyncedAt: null,
  };
  let started = false;
  let epoch = 0;
  let revision = 0;
  let changes: Change[] = [];
  let saveTask: Promise<void> | undefined;
  let refreshTask: Promise<void> | undefined;
  let retryMode: 'load' | 'save' | 'upload' = 'load';
  let retryUrl = snapshot.url;
  const requests = new Set<AbortController>();
  const emit = (change: Partial<FinanceSyncSnapshot>) => {
    snapshot = { ...snapshot, ...change };
    listeners.forEach(listener => listener());
  };
  const request = async <T,>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    requests.add(controller);
    let timeout: ReturnType<typeof setTimeout>;
    let onAbort: () => void;
    try {
      return await Promise.race([
        Promise.resolve().then(() => work(controller.signal)),
        new Promise<T>((_, reject) => {
          onAbort = () => reject(new Error('同步已取消'));
          controller.signal.addEventListener('abort', onAbort, { once: true });
          timeout = setTimeout(() => { reject(new Error('雲端回應逾時，請重試')); controller.abort(); }, options.requestTimeoutMs ?? 20000);
        }),
      ]);
    } finally {
      clearTimeout(timeout!);
      controller.signal.removeEventListener('abort', onAbort!);
      requests.delete(controller);
    }
  };
  const remoteData = async (url: string) => {
    const result = await request(signal => load(url, signal));
    return parseBackup(result === null ? empty : result);
  };
  const commitUrl = (url: string) => {
    // 瀏覽器只保存連線網址，不讀寫帳本草稿或復原版本。
    try { storage?.setItem('google_script_url', url); } catch { /* 本次連線仍可使用。 */ }
    return { url, pendingUrl: null };
  };
  const restore = async (url: string) => {
    if (saveTask) await saveTask;
    if (snapshot.dirty) throw new Error('尚有未上傳的修改，請先重試同步，再切換或還原帳本。');
    const token = ++epoch;
    retryMode = 'load'; retryUrl = url;
    emit({ status: 'loading', pendingUrl: url, error: null });
    try {
      if (!url) throw new Error('請先設定雲端連線，載入成功後即可開始編輯。');
      const data = await remoteData(url);
      if (!started || token !== epoch) return;
      emit({ ...commitUrl(url), data, ready: true, dirty: false, status: 'saved', lastSyncedAt: Date.now() });
    } catch (error) {
      if (started && token === epoch) emit({ status: 'error', pendingUrl: null, error: message(error) });
      throw error;
    }
  };
  const flush = (): Promise<void> => {
    if (saveTask) return saveTask;
    if (!started || !snapshot.ready || !snapshot.dirty || snapshot.pendingUrl) return Promise.resolve();
    const token = epoch;
    retryMode = 'save'; retryUrl = snapshot.url;
    emit({ status: 'syncing', error: null });
    const work = async () => {
      // 背景回應不會蓋掉期間的新修改，並在背景讀取完成後才上傳。
      await refreshTask;
      while (started && token === epoch && changes.length) {
        const batch = changes.slice();
        const url = snapshot.url;
        const remote = await remoteData(url);
        if (!started || token !== epoch) return;
        const sent = batch.reduce((data, change) => change(data), remote);
        await request(signal => save(url, sent, signal));
        if (!started || token !== epoch) return;
        // 先驗證後續修改能完整套用，失敗時保留待送項目供重試。
        const remaining = changes.slice(batch.length);
        const data = remaining.reduce((current, change) => change(current), sent);
        changes = remaining;
        emit({ data, dirty: changes.length > 0, status: changes.length ? 'syncing' : 'saved', error: null, lastSyncedAt: Date.now() });
      }
    };
    const task = Promise.resolve().then(work).catch(error => {
      if (started && token === epoch) emit({ status: 'error', error: message(error) });
      throw error;
    }).finally(() => { if (saveTask === task) saveTask = undefined; });
    saveTask = task;
    return task;
  };
  const controller = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: async () => {
      if (started) return;
      started = true;
      if (snapshot.ready && snapshot.dirty) await flush().catch(() => undefined);
      else await restore(snapshot.url).catch(() => undefined);
    },
    stop: () => {
      started = false; epoch += 1;
      requests.forEach(controller => controller.abort());
      saveTask = undefined; refreshTask = undefined;
    },
    update: (updater: (data: FinanceData) => FinanceData, options: { replace?: boolean; reapply?: boolean } = {}) => {
      if (!started || !snapshot.ready || snapshot.pendingUrl) throw new Error('請先完成雲端帳本載入，再儲存修改。');
      const before = snapshot.data;
      const after = parseBackup(updater(parseBackup(before)));
      if (!options.replace && JSON.stringify(before) === JSON.stringify(after)) return;
      changes.push(options.replace ? () => parseBackup(after) : options.reapply
        ? remote => parseBackup(updater(parseBackup(remote)))
        : remote => applyFinanceChanges(before, after, remote));
      revision += 1;
      emit({ data: after, dirty: true, status: 'syncing', error: null });
      void flush().catch(() => undefined);
    },
    // 表單是否允許背景刷新由 App 判斷。
    refresh: (canApply: () => boolean = () => true): Promise<void> => {
      if (!started || !snapshot.ready || snapshot.dirty || snapshot.pendingUrl || saveTask || refreshTask || snapshot.status !== 'saved') return Promise.resolve();
      const token = epoch;
      const currentRevision = revision;
      const task = remoteData(snapshot.url).then(data => {
        if (!started || token !== epoch || revision !== currentRevision || !canApply()) return;
        emit({ data, status: 'saved', lastSyncedAt: Date.now(), error: null });
      }).catch(error => {
        if (started && token === epoch && revision === currentRevision) {
          retryMode = 'load'; retryUrl = snapshot.url;
          emit({ status: 'error', error: message(error) });
        }
      }).finally(() => { if (refreshTask === task) refreshTask = undefined; });
      refreshTask = task;
      return task;
    },
    sync: async (url: string, isUpload: boolean): Promise<void> => {
      url = url.trim();
      if (!url) throw new Error('請先輸入雲端網址');
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('雲端網址格式不正確');
      if (!isUpload) return restore(url);
      if (!snapshot.ready) throw new Error('請先載入帳本，再上傳資料。');
      if (saveTask) await saveTask;
      const token = ++epoch;
      retryMode = 'upload'; retryUrl = url;
      emit({ status: 'syncing', pendingUrl: url, error: null });
      try {
        await request(signal => save(url, snapshot.data, signal));
        if (!started || token !== epoch) return;
        changes = [];
        emit({ ...commitUrl(url), dirty: false, status: 'saved', error: null, lastSyncedAt: Date.now() });
      } catch (error) {
        if (started && token === epoch) emit({ status: 'error', pendingUrl: null, error: message(error) });
        throw error;
      }
    },
    retry: async (): Promise<void> => {
      if (retryMode === 'upload') return controller.sync(retryUrl, true);
      if (snapshot.dirty) return flush();
      return restore(retryMode === 'load' ? retryUrl : snapshot.url);
    },
    whenIdle: async (): Promise<void> => { await saveTask; },
  };
  return controller;
}
