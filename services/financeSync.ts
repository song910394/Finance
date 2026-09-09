import type { BackupData } from '../types';
import { parseBackup, type FinanceData } from '../utils/backup';
import { loadFromGoogleSheet, saveToGoogleSheet } from './googleSheetService';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  readonly length?: number;
  key?(index: number): string | null;
}
export interface RecoverySummary { id: string; savedAt: number; transactionCount: number; reviewed: boolean }
export interface FinanceSyncSnapshot {
  data: FinanceData;
  url: string;
  status: 'loading' | 'syncing' | 'saved' | 'local' | 'error' | 'conflict';
  dirty: boolean;
  localSaved: boolean;
  error: string | null;
  conflict: 'draft' | 'tab' | null;
  pendingUrl: string | null;
  lastSyncedAt: number | null;
  recoveries: RecoverySummary[];
}
interface Options {
  initialData: FinanceData;
  initialUrl: string;
  storage?: StorageLike;
  load?: (url: string, signal?: AbortSignal) => Promise<BackupData | null>;
  save?: (url: string, data: BackupData, signal?: AbortSignal) => Promise<unknown>;
  debounceMs?: number;
  requestTimeoutMs?: number;
  eventTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}
interface Draft { version: 1; data: FinanceData; dirty: boolean; revision: number; writerId: string; savedAt?: number; reviewed?: boolean }
export const getFinanceStorageKey = (url: string) => `hs-finance:draft:v1:${encodeURIComponent(url.trim())}`;
const same = (a: FinanceData, b: FinanceData) => JSON.stringify(a) === JSON.stringify(b);
const message = (error: unknown) => error instanceof Error ? error.message : '同步失敗，請重試';

export function createFinanceSync(options: Options) {
  const initial = parseBackup(options.initialData);
  const empty = parseBackup({ ...initial, transactions: [], budgets: [], salaryAdjustments: [] });
  const load = options.load ?? loadFromGoogleSheet;
  const save = options.save ?? saveToGoogleSheet;
  const listeners = new Set<() => void>();
  const writerId = globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random()}`;
  const eventTarget = options.eventTarget ?? (typeof window === 'undefined' ? undefined : window);
  let storage = options.storage;
  let storageError: string | null = null;
  if (!storage) {
    try { storage = globalThis.localStorage; } catch { /* storage access itself can be denied */ }
  }
  if (!storage) storageError = '無法使用本機儲存，請先下載備份';
  let snapshot: FinanceSyncSnapshot = {
    data: initial, url: options.initialUrl.trim(), status: 'local', dirty: false,
    localSaved: false, error: storageError, conflict: null, pendingUrl: null, lastSyncedAt: null, recoveries: [],
  };
  let revision = 0;
  let epoch = 0;
  let started = false;
  let cloudReady = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let requestController: AbortController | undefined;
  let saving = false;
  let storageBaseline: string | null = null;
  let retryMode: 'load' | 'save' | 'upload' = 'load';
  let retryUrl = snapshot.url;
  let selectedRecovery: string | null = null;
  let currentRecoveryId = writerId;
  const emit = (change: Partial<FinanceSyncSnapshot>) => {
    snapshot = { ...snapshot, ...change };
    listeners.forEach((listener) => listener());
  };
  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const invalidate = () => {
    clearTimer();
    epoch += 1;
    requestController?.abort();
    requestController = undefined;
    saving = false;
    cloudReady = false;
  };
  const storageFailure = () => {
    storageError = '本機保存失敗，請下載備份並檢查儲存空間或瀏覽器設定';
    emit({ localSaved: false, status: 'error', error: storageError });
  };
  const decodeDraft = (raw: string): Draft => {
    const item = JSON.parse(raw);
    if (item.version !== 1 || typeof item.dirty !== 'boolean' || !Number.isInteger(item.revision) || typeof item.writerId !== 'string') throw new Error('本機草稿格式不正確，已保留原資料，請先下載可讀資料並檢查備份');
    return { ...item, data: parseBackup(item.data) };
  };
  const readDraft = (url: string): { draft: Draft | null; raw: string | null } => {
    if (!storage) { storageFailure(); return { draft: null, raw: null }; }
    const raw = storage.getItem(getFinanceStorageKey(url));
    return { draft: raw ? decodeDraft(raw) : null, raw };
  };
  const recoveryKey = (url: string, id: string) => `${getFinanceStorageKey(url)}:recovery:${id}`;
  const recoveryIndexKey = (url: string) => `${getFinanceStorageKey(url)}:recovery-index`;
  const readRecoveries = (url: string): RecoverySummary[] => {
    if (!storage) return [];
    const index = JSON.parse(storage.getItem(recoveryIndexKey(url)) ?? '[]');
    if (!Array.isArray(index) || !index.every((id) => typeof id === 'string')) throw new Error('本機草稿索引格式不正確，原始資料已保留');
    const ids = new Set<string>(index);
    // Enumeration also recovers older entries or entries missing from a concurrently written index.
    const prefix = `${getFinanceStorageKey(url)}:recovery:`;
    if (storage.key && typeof storage.length === 'number') {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(prefix)) ids.add(key.slice(prefix.length));
      }
    }
    return [...ids].flatMap((id) => {
      const raw = storage!.getItem(recoveryKey(url, id));
      if (!raw) return [];
      const draft = decodeDraft(raw);
      return [{ id, savedAt: draft.savedAt ?? 0, transactionCount: draft.data.transactions.length, reviewed: draft.reviewed === true }];
    }).sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id));
  };
  const reviewRecoveries = (ids: string[]) => {
    try {
      if (!storage) throw new Error();
      for (const id of ids) {
        const key = recoveryKey(snapshot.url, id);
        const raw = storage.getItem(key);
        if (raw) storage.setItem(key, JSON.stringify({ ...decodeDraft(raw), reviewed: true }));
      }
      emit({ recoveries: readRecoveries(snapshot.url) });
    } catch { storageFailure(); }
  };
  const storeRecovery = (url: string, id: string, draft: Draft, reviewed: boolean) => {
    if (!storage) throw new Error('無法使用本機儲存');
    storage.setItem(recoveryKey(url, id), JSON.stringify({ ...draft, savedAt: draft.savedAt ?? Date.now(), reviewed }));
    const ids = new Set(readRecoveries(url).map((recovery) => recovery.id));
    ids.add(id);
    storage.setItem(recoveryIndexKey(url), JSON.stringify([...ids]));
  };
  const preserveReplacedDraft = (url: string, draft: Draft | null, replacement: FinanceData) => {
    if (!draft || same(draft.data, replacement)) return;
    // An explicit choice changes the active version, but the displaced version stays selectable.
    storeRecovery(url, `replaced-${writerId}-${Date.now()}-${revision}`, draft, true);
  };
  const draftJson = () => JSON.stringify({ version: 1, data: snapshot.data, dirty: snapshot.dirty, revision, writerId, savedAt: Date.now() } satisfies Draft);
  const preserveRecovery = () => {
    if (!snapshot.dirty) return;
    try {
      if (!storage) throw new Error();
      const existing = storage.getItem(recoveryKey(snapshot.url, currentRecoveryId));
      if (existing && decodeDraft(existing).reviewed) currentRecoveryId = `${writerId}-${Date.now()}-${revision}`;
      storeRecovery(snapshot.url, currentRecoveryId, decodeDraft(draftJson()), false);
      emit({ localSaved: true, recoveries: readRecoveries(snapshot.url) });
    } catch { storageFailure(); }
  };
  const tabConflict = () => {
    invalidate();
    emit({ conflict: 'tab', status: 'conflict', error: '另一個分頁已更新資料，自動上傳已暫停；請先確認要保留的版本' });
    preserveRecovery();
  };
  const persist = (force = false): boolean => {
    try {
      if (!storage) throw new Error();
      if (snapshot.conflict === 'tab' && !force) { preserveRecovery(); return snapshot.localSaved; }
      const key = getFinanceStorageKey(snapshot.url);
      const current = storage.getItem(key);
      if (!force && current !== storageBaseline) { tabConflict(); return snapshot.localSaved; }
      const raw = draftJson();
      storage.setItem(key, raw);
      storageBaseline = raw;
      storageError = null;
      emit({ localSaved: true });
      return true;
    } catch { storageFailure(); return false; }
  };
  const checkOtherTab = () => {
    try {
      if (storage && storage.getItem(getFinanceStorageKey(snapshot.url)) !== storageBaseline) { tabConflict(); return true; }
      return false;
    } catch { storageFailure(); return true; }
  };
  const request = async <T,>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    requestController = controller;
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
      if (requestController === controller) requestController = undefined;
    }
  };
  const schedule = () => {
    clearTimer();
    if (!started || !snapshot.url || !snapshot.dirty || !cloudReady || snapshot.conflict || !snapshot.localSaved) return;
    timer = setTimeout(() => { timer = undefined; void flush().catch(() => undefined); }, options.debounceMs ?? 2000);
  };
  const flush = async () => {
    if (saving || !cloudReady || !snapshot.dirty || snapshot.conflict || !snapshot.url) return;
    if (checkOtherTab()) return;
    const sentEpoch = epoch;
    const sentRevision = revision;
    const sentData = snapshot.data;
    const sentUrl = snapshot.url;
    saving = true;
    retryMode = 'save';
    retryUrl = sentUrl;
    emit({ status: 'syncing', error: storageError });
    let succeeded = false;
    try {
      await request((signal) => save(sentUrl, sentData, signal));
      if (sentEpoch !== epoch) return;
      if (checkOtherTab()) return;
      succeeded = true;
      if (sentRevision === revision) {
        emit({ dirty: false, lastSyncedAt: Date.now() });
        persist();
        if (!snapshot.conflict) emit({ status: storageError ? 'error' : 'saved', error: storageError });
      } else {
        // The response covers only sentRevision; newer edits remain visibly pending.
        emit({ status: storageError ? 'error' : 'syncing', error: storageError });
      }
    } catch (error) {
      if (sentEpoch === epoch) emit({ status: 'error', error: message(error) });
      throw error;
    } finally {
      if (sentEpoch === epoch) {
        saving = false;
        if (succeeded && snapshot.dirty) schedule();
      }
    }
  };
  const commitUrl = (url: string, change: Partial<FinanceSyncSnapshot>) => {
    try {
      if (!storage) throw new Error();
      storage.setItem('google_script_url', url);
    } catch { storageFailure(); }
    // Publish the endpoint together with its corresponding data and conflict state.
    emit({ ...change, url, pendingUrl: null });
  };
  const pauseForRecoveries = () => {
    if (snapshot.recoveries.some((recovery) => !recovery.reviewed) && !selectedRecovery) {
      cloudReady = false;
      emit({ status: 'conflict', conflict: snapshot.conflict ?? 'tab', error: '發現尚未處理的本機草稿，請從「其他本機草稿」選擇要恢復的版本，或確認改用雲端版本' });
    }
  };
  const restore = async (url: string, acceptCloud = false) => {
    invalidate();
    retryMode = 'load';
    retryUrl = url;
    const loadingEpoch = epoch;
    const loadingRevision = revision;
    const reviewedIds = acceptCloud ? snapshot.recoveries.map((recovery) => recovery.id) : [];
    emit({ status: 'loading', pendingUrl: url, error: storageError, conflict: null });
    try {
      const beforeLoad = readDraft(url);
      const result = await request((signal) => load(url, signal));
      if (loadingEpoch !== epoch) return;
      const remote = result === null ? parseBackup(empty) : parseBackup(result);
      // Re-read the TARGET endpoint after the request; A's data never becomes B's draft.
      const local = readDraft(url);
      const localChanged = local.raw !== beforeLoad.raw;
      const sameEndpoint = url === snapshot.url;
      const changedHereWhileLoading = sameEndpoint && loadingRevision !== revision;
      if (sameEndpoint && localChanged && local.raw !== storageBaseline) {
        tabConflict();
        return;
      }
      const currentDraft = sameEndpoint && snapshot.dirty ? snapshot.data : local.draft && (local.draft.dirty || localChanged) ? local.draft.data : null;
      const chosenLocal = currentDraft && (!acceptCloud || changedHereWhileLoading || localChanged) ? currentDraft : null;
      const hasDraftConflict = chosenLocal !== null && !same(chosenLocal, remote);
      if (acceptCloud && !hasDraftConflict) preserveReplacedDraft(url, local.draft, remote);
      const recoveries = readRecoveries(url);
      if (!sameEndpoint) selectedRecovery = null;
      storageBaseline = local.raw;
      revision += 1;
      cloudReady = !hasDraftConflict;
      commitUrl(url, {
        data: hasDraftConflict ? chosenLocal! : remote, dirty: hasDraftConflict,
        conflict: hasDraftConflict ? 'draft' : null,
        status: hasDraftConflict ? 'conflict' : 'loading', recoveries,
        error: hasDraftConflict ? '本機有未同步資料，請選擇保留本機資料上傳，或改用雲端資料' : storageError,
        lastSyncedAt: hasDraftConflict ? null : Date.now(),
      });
      persist();
      if (acceptCloud && !hasDraftConflict && !changedHereWhileLoading && !localChanged) {
        reviewRecoveries(reviewedIds);
        selectedRecovery = null;
      }
      if (!snapshot.conflict) emit({ status: storageError ? 'error' : 'saved', error: storageError });
      pauseForRecoveries();
    } catch (error) {
      if (loadingEpoch === epoch) emit({ status: 'error', error: message(error) });
      throw error;
    }
  };
  const onStorage = (event: Event) => {
    const change = event as StorageEvent;
    if (started && (change.key === getFinanceStorageKey(snapshot.url) || change.key === null)) checkOtherTab();
  };
  const controller = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: async () => {
      if (started) return;
      started = true;
      eventTarget?.addEventListener('storage', onStorage);
      try {
        const local = readDraft(snapshot.url);
        storageBaseline = local.raw;
        if (local.draft) {
          revision = local.draft.revision;
          emit({ data: local.draft.data, dirty: local.draft.dirty, localSaved: true });
        }
        emit({ recoveries: readRecoveries(snapshot.url) });
        if (snapshot.url) await restore(snapshot.url).catch(() => undefined);
        else { persist(); emit({ status: storageError ? 'error' : 'local' }); pauseForRecoveries(); }
      } catch (error) { emit({ status: 'error', error: message(error) }); }
    },
    stop: () => { started = false; invalidate(); eventTarget?.removeEventListener('storage', onStorage); },
    update: (updater: (data: FinanceData) => FinanceData) => {
      const data = parseBackup(updater(parseBackup(snapshot.data)));
      revision += 1;
      const keepError = !cloudReady && snapshot.status === 'error';
      emit({ data, dirty: true, status: snapshot.conflict ? 'conflict' : keepError ? 'error' : cloudReady ? 'syncing' : 'local', error: snapshot.conflict || keepError ? snapshot.error : storageError });
      persist();
      schedule();
    },
    sync: async (url: string, isUpload: boolean): Promise<void> => {
      url = url.trim();
      if (!url) throw new Error('請先輸入雲端網址');
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('雲端網址格式不正確');
      if (!isUpload) return restore(url);
      // Upload is an explicit user decision. Preserve the source endpoint's draft first.
      persist();
      if (snapshot.conflict) throw new Error('請先選擇要保留的資料版本，再執行備份');
      const targetLocal = readDraft(url);
      if (url !== snapshot.url && targetLocal.draft?.dirty && !same(targetLocal.draft.data, snapshot.data)) throw new Error('目標網址另有未同步的本機草稿，請先從該網址還原並選擇要保留的版本');
      invalidate();
      const uploadEpoch = epoch;
      retryMode = 'upload';
      retryUrl = url;
      const sentData = snapshot.data;
      const sentRevision = revision;
      emit({ status: 'syncing', pendingUrl: url, conflict: null, error: storageError });
      try {
        await request((signal) => save(url, sentData, signal));
        if (uploadEpoch !== epoch) return;
        const local = readDraft(url);
        if (url !== snapshot.url && local.raw !== targetLocal.raw) throw new Error('目標網址的本機資料已由其他分頁更新，請重新載入並確認版本');
        preserveReplacedDraft(url, local.draft, snapshot.data);
        storageBaseline = local.raw;
        cloudReady = true;
        commitUrl(url, { data: snapshot.data, dirty: revision !== sentRevision, lastSyncedAt: Date.now(), recoveries: readRecoveries(url) });
        persist(true);
        if (!snapshot.conflict) emit({ status: storageError ? 'error' : snapshot.dirty ? 'syncing' : 'saved', error: storageError });
        schedule();
      } catch (error) {
        if (uploadEpoch === epoch) emit({ status: 'error', error: message(error) });
        throw error;
      }
    },
    retry: async (): Promise<void> => {
      if (snapshot.conflict) throw new Error('請先選擇要保留的資料版本');
      if (retryMode === 'upload') return controller.sync(retryUrl, true);
      if (!snapshot.url && !snapshot.pendingUrl) { persist(); emit({ status: storageError ? 'error' : 'local', error: storageError }); return; }
      if (retryMode === 'save' && cloudReady) { persist(); return flush(); }
      return restore(retryUrl || snapshot.pendingUrl || snapshot.url);
    },
    selectRecovery: (id: string) => {
      if (!snapshot.recoveries.some((recovery) => recovery.id === id)) throw new Error('找不到指定的本機草稿');
      const raw = storage?.getItem(recoveryKey(snapshot.url, id));
      if (!raw) throw new Error('本機草稿已無法讀取');
      const draft = decodeDraft(raw);
      // Editing a preview can persist it immediately, so retain the current version first.
      preserveReplacedDraft(snapshot.url, decodeDraft(draftJson()), draft.data);
      const recoveries = readRecoveries(snapshot.url);
      invalidate();
      selectedRecovery = id;
      revision += 1;
      emit({ data: draft.data, dirty: true, localSaved: true, status: 'conflict', conflict: 'draft', pendingUrl: null, recoveries, error: '已載入選定的本機草稿；請確認保留本機版本上傳，或改用雲端資料' });
    },
    resolveConflict: async (choice: 'local' | 'cloud') => {
      if (!snapshot.conflict) return;
      if (choice === 'cloud') {
        // Reload so a choice never applies an old cached remote candidate.
        return restore(snapshot.url, true);
      }
      if (snapshot.recoveries.some((recovery) => !recovery.reviewed) && !selectedRecovery) throw new Error('請先從「其他本機草稿」選擇要恢復的版本');
      invalidate();
      const local = readDraft(snapshot.url);
      preserveReplacedDraft(snapshot.url, local.draft, snapshot.data);
      storageBaseline = local.raw;
      emit({ conflict: null, dirty: true, error: storageError, recoveries: readRecoveries(snapshot.url) });
      cloudReady = true;
      persist(true);
      await flush();
      if (selectedRecovery && !snapshot.dirty && !snapshot.conflict) {
        reviewRecoveries([selectedRecovery]);
        selectedRecovery = null;
        pauseForRecoveries();
      }
    },
  };
  return controller;
}
