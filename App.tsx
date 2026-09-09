import React, { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertCircle, CheckCircle2, Cloud, CreditCard, Download, LayoutDashboard, List, MoreHorizontal, PieChart, RefreshCw, Settings as SettingsIcon, Wallet, X } from 'lucide-react';
import { CardBank, DEFAULT_CATEGORIES, type FinanceData, type SalaryAdjustment, type Transaction } from './types';
import { DEFAULT_INCOME_SOURCES, GOOGLE_SCRIPT_URL } from './constants';
import { createFinanceSync } from './services/financeSync';
import { serializeBackup } from './utils/backup';
import { formatLocalDate, formatLocalYearMonth } from './utils/billing';
import { assignHistoricalStatements } from './utils/historicalStatements';

const Dashboard = lazy(() => import('./components/Dashboard'));
const TransactionList = lazy(() => import('./components/TransactionList'));
const Reconciliation = lazy(() => import('./components/Reconciliation'));
const BudgetManager = lazy(() => import('./components/BudgetManager'));
const SalaryHistory = lazy(() => import('./components/SalaryHistory'));
const Settings = lazy(() => import('./components/Settings'));
enum Tab { DASHBOARD = '概覽', TRANSACTIONS = '記帳', RECONCILIATION = '信用卡', BUDGET = '帳務', SALARY = '薪資歷程', SETTINGS = '設定' }
const initialData = (): FinanceData => ({
  transactions: [], categories: [...DEFAULT_CATEGORIES], cardBanks: Object.values(CardBank), budget: 50000,
  cardSettings: {}, incomeSources: DEFAULT_INCOME_SOURCES.map(source => ({ ...source })), budgets: [], salaryAdjustments: [],
});
const initialUrl = () => {
  try { return localStorage.getItem('google_script_url') ?? GOOGLE_SCRIPT_URL; }
  catch { return GOOGLE_SCRIPT_URL; }
};
class PageBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-6">
      <h2 className="text-lg font-bold">這個頁面暫時無法顯示</h2>
      <p className="mt-2 text-sm text-slate-600">請先使用上方的完整備份保留目前資料，再重新整理。若持續發生，請保留備份供檢查。</p>
      <button type="button" className="mt-4 rounded-xl bg-indigo-600 px-4 py-3 text-white" onClick={() => location.reload()}>重新整理</button>
    </div>;
    return this.props.children;
  }
}
export default function App() {
  const [controller] = useState(() => createFinanceSync({ initialData: initialData(), initialUrl: initialUrl() }));
  const sync = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const data = sync.data;
  const [activeTab, setActiveTab] = useState<Tab>(Tab.DASHBOARD);
  const [selectedMonth, setSelectedMonth] = useState(formatLocalYearMonth(new Date()));
  const [startAdding, setStartAdding] = useState(0);
  const [actionError, setActionError] = useState('');
  const [hasUnsavedForm, setHasUnsavedForm] = useState(false);
  const moreDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { void controller.start(); return () => controller.stop(); }, [controller]);
  useEffect(() => {
    if (sync.conflict || sync.dirty || hasUnsavedForm || !['saved', 'local'].includes(sync.status) || !sync.localSaved) return;
    if (assignHistoricalStatements(data) === data) return;
    try { controller.update(assignHistoricalStatements, true); }
    catch { setActionError('歷史帳單整理前的備份未成功，原始資料尚未變更。請確認本機儲存空間後重新載入。'); }
  }, [controller, data, sync.status, sync.conflict, sync.dirty, sync.localSaved, hasUnsavedForm]);
  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (hasUnsavedForm || (sync.dirty && !sync.localSaved)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warnUnsaved);
    return () => window.removeEventListener('beforeunload', warnUnsaved);
  }, [sync.dirty, sync.localSaved, hasUnsavedForm]);
  const setField = <K extends keyof FinanceData>(field: K, value: React.SetStateAction<FinanceData[K]>) => {
    controller.update(previous => ({ ...previous, [field]: typeof value === 'function'
      ? (value as (old: FinanceData[K]) => FinanceData[K])(previous[field]) : value }));
  };
  const addTransaction = (value: Omit<Transaction, 'id'>) => setField('transactions', previous => [{ ...value, id: crypto.randomUUID() }, ...previous]);
  const addTransactions = (values: Omit<Transaction, 'id'>[], categories: string[] = [], banks: string[] = []) => controller.update(previous => ({
    ...previous, transactions: [...values.map(value => ({ ...value, id: crypto.randomUUID() })), ...previous.transactions],
    categories: Array.from(new Set([...previous.categories, ...categories])), cardBanks: Array.from(new Set([...previous.cardBanks, ...banks])),
  }));
  const editTransaction = (id: string, value: Omit<Transaction, 'id'>) => setField('transactions', previous => previous.map(tx => tx.id === id ? { ...tx, ...value } : tx));
  const deleteTransaction = (id: string) => setField('transactions', previous => previous.filter(tx => tx.id !== id));
  const deleteRecurringGroup = (groupId: string, fromDate: string) => setField('transactions', previous => previous.filter(tx => !(tx.recurringGroupId === groupId && tx.date >= fromDate)));
  const reconcileTransaction = (id: string, statementMonth: string | null) => {
    if (statementMonth !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(statementMonth)) return;
    setField('transactions', previous => previous.map(tx => tx.id !== id ? tx : {
      ...tx, isReconciled: statementMonth !== null, statementMonth: statementMonth ?? undefined,
      reconciledDate: statementMonth === null ? undefined : tx.reconciledDate ?? new Date().toISOString(),
    }));
  };
  const addSalaryAdjustment = (value: Omit<SalaryAdjustment, 'id'>) => setField('salaryAdjustments', previous => [...previous, { ...value, id: crypto.randomUUID() }]);
  const editSalaryAdjustment = (id: string, value: Omit<SalaryAdjustment, 'id'>) => setField('salaryAdjustments', previous => previous.map(item => item.id === id ? { ...item, ...value } : item));
  const deleteSalaryAdjustment = (id: string) => setField('salaryAdjustments', previous => previous.filter(item => item.id !== id));
  const runAction = async (action: () => Promise<void>) => {
    if (hasUnsavedForm && !window.confirm('此頁有尚未儲存的輸入，繼續同步可能重新載入頁面。要放棄這些輸入嗎？')) return;
    setActionError('');
    try { await action(); } catch (error) { setActionError(error instanceof Error ? error.message : '操作未完成，請重試'); }
  };
  const downloadBackup = () => {
    try {
      const objectUrl = URL.createObjectURL(new Blob([serializeBackup(data)], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = objectUrl; link.download = 'H-and-S-完整備份-' + formatLocalDate(new Date()) + '.json';
      link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { setActionError(error instanceof Error ? error.message : '無法建立備份'); }
  };
  const navigate = (tab: Tab) => {
    if (tab !== activeTab && hasUnsavedForm && !window.confirm('此頁有尚未儲存的輸入。要放棄這些輸入並離開嗎？')) return;
    moreDialog.current?.close(); setStartAdding(0); setActiveTab(tab);
  };
  const openAddExpense = () => { setStartAdding(token => token + 1); setActiveTab(Tab.TRANSACTIONS); };
  const loading = sync.status === 'loading';
  const busy = loading || sync.status === 'syncing';
  const lastTime = sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const statusText = hasUnsavedForm ? '此頁有未儲存內容' : loading ? '正在載入帳本' : sync.status === 'conflict' ? '需要確認資料版本'
    : sync.status === 'error' ? (sync.localSaved ? '已存本機・同步失敗' : '資料尚未安全保存')
    : sync.status === 'saved' && !sync.dirty ? '已同步 ' + lastTime
    : sync.status === 'syncing' ? (sync.localSaved ? '已存本機・同步中' : '同步中・本機未保存')
    : sync.localSaved ? (sync.dirty && sync.url ? '已存本機・等待同步' : '已存本機') : '尚未連線';
  const syncIcon = busy ? <RefreshCw size={16} className="animate-spin" /> : sync.status === 'error' || sync.conflict ? <AlertCircle size={16} />
    : sync.status === 'saved' && !sync.dirty ? <CheckCircle2 size={16} /> : <Cloud size={16} />;
  const monthProps = { selectedMonth, onMonthChange: setSelectedMonth };
  const navItems = [
    { tab: Tab.DASHBOARD, icon: <LayoutDashboard size={20} /> }, { tab: Tab.TRANSACTIONS, icon: <List size={20} /> },
    { tab: Tab.RECONCILIATION, icon: <CreditCard size={20} /> }, { tab: Tab.BUDGET, icon: <PieChart size={20} /> },
    { tab: Tab.SALARY, icon: <Wallet size={20} /> }, { tab: Tab.SETTINGS, icon: <SettingsIcon size={20} /> },
  ];
  return <div className="flex h-dvh min-h-0 overflow-hidden bg-slate-50 font-sans text-slate-800">
    <a href="#main-content" className="sr-only z-[100] bg-white p-3 focus:not-sr-only focus:fixed">跳到主要內容</a>
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex items-center gap-3 border-b border-slate-100 p-6"><span className="rounded-xl bg-indigo-600 p-2 text-white"><PieChart size={22} /></span><h1 className="text-xl font-bold">H&S記帳</h1></div>
      <nav aria-label="主要導覽" className="flex-1 space-y-1 p-4">{navItems.map(item => <button key={item.tab} type="button" onClick={() => navigate(item.tab)} aria-current={activeTab === item.tab ? 'page' : undefined}
        className={'flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ' + (activeTab === item.tab ? 'bg-indigo-50 font-bold text-indigo-700' : 'text-slate-600 hover:bg-slate-50')}>{item.icon}{item.tab}</button>)}</nav>
      <p className="border-t border-slate-100 p-4 text-xs text-slate-500">H&S記帳 v{__APP_VERSION__}</p>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 lg:px-8">
        <div className="flex items-center gap-2 font-bold"><PieChart size={20} className="text-indigo-600 lg:hidden" /><span className="lg:hidden">H&S記帳</span><span className="hidden lg:inline">{activeTab}</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" aria-live="polite" className={'flex items-center gap-1.5 rounded-full px-3 py-2 text-xs ' + (sync.status === 'error' || sync.conflict ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600')}>{syncIcon}{statusText}</span>
          <button type="button" aria-label="匯出完整備份" title="匯出完整備份" onClick={downloadBackup} disabled={loading} className="touch-target rounded-xl border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:opacity-50"><Download size={18} /></button>
        </div>
      </header>
      <main id="main-content" className="min-h-0 flex-1 overflow-y-auto" tabIndex={-1}>
        <div className="app-content mx-auto max-w-7xl space-y-4 p-4 md:p-6 lg:p-8">
          {sync.conflict && <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <h2 className="font-bold">{sync.conflict === 'tab' ? '另一個分頁已更新帳本' : '本機與雲端有不同版本'}</h2>
            <p className="mt-2">自動上傳已暫停。目前本機有 {data.transactions.length} 筆交易。請先匯出完整備份，再選擇要保留的版本；兩個版本不會自動合併。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={downloadBackup} className="rounded-xl border border-amber-300 bg-white px-4 py-3">匯出本機備份</button>
              <button type="button" onClick={() => void runAction(() => controller.resolveConflict('local'))} className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white">以本機版本覆蓋雲端</button>
              <button type="button" onClick={() => void runAction(() => controller.resolveConflict('cloud'))} className="rounded-xl border border-amber-300 bg-white px-4 py-3">以雲端版本取代本機</button>
            </div>
          </section>}
          {sync.recoveries.length > 0 && <details open={sync.recoveries.some(item => !item.reviewed)} className="rounded-2xl border border-amber-200 bg-white p-4 text-sm">
            <summary className="cursor-pointer font-bold">其他本機草稿（{sync.recoveries.length} 個版本）</summary>
            <p className="mt-2 text-slate-600">這些備份來自分頁衝突或版本替換。載入後會暫停自動上傳；刪除只移除這份備份，不影響目前帳本或雲端資料。</p>
            <button type="button" disabled={busy || !sync.recoveries.some(item => item.reviewed)} onClick={() => { const ids = sync.recoveries.filter(item => item.reviewed).map(item => item.id); if (window.confirm(`刪除 ${ids.length} 份已處理備份？刪除後無法復原，目前帳本與雲端資料不受影響。`)) void runAction(async () => controller.deleteRecoveries(ids)); }} className="mt-2 rounded-lg border px-3 py-2 disabled:opacity-50">清除已處理備份</button>
            <ul className="mt-3 space-y-2">{sync.recoveries.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
              <span>{item.savedAt ? new Date(item.savedAt).toLocaleString('zh-TW', { hour12: false }) : '時間待確認'} · {item.transactionCount} 筆交易 · {item.reviewed ? '已處理，保留備份' : '待確認'}</span>
              <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void runAction(async () => { controller.selectRecovery(item.id); })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold text-indigo-700 disabled:opacity-50">載入此草稿</button><button type="button" disabled={busy} onClick={() => { if (window.confirm('刪除這份備份？刪除後無法復原，目前帳本與雲端資料不受影響。')) void runAction(async () => controller.deleteRecoveries([item.id])); }} className="rounded-xl border border-rose-200 px-3 py-2 text-rose-700 disabled:opacity-50">刪除</button></div>
            </li>)}</ul>
          </details>}
          {(sync.status === 'error' || actionError) && <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <p>{actionError || sync.error || '同步尚未完成，請確認連線後重試。'}</p>
            <p className="mt-1">{sync.localSaved ? '本機資料已保留。' : '請先匯出完整備份，避免離開頁面後遺失資料。'}</p>
            <div className="mt-3 flex gap-2"><button type="button" disabled={busy || Boolean(sync.conflict)} onClick={() => void runAction(() => controller.retry())} className="rounded-xl border border-rose-200 bg-white px-4 py-2 disabled:opacity-50">重試同步</button><button type="button" onClick={() => navigate(Tab.SETTINGS)} className="rounded-xl px-4 py-2 underline">檢查連線設定</button></div>
          </section>}
          {loading ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><RefreshCw className="mx-auto mb-3 animate-spin text-indigo-600" />正在載入帳本，完成後即可開始記帳。</div> :
            <PageBoundary key={activeTab}><Suspense fallback={<p role="status" className="p-6 text-slate-500">正在開啟頁面…</p>}>
              {activeTab === Tab.DASHBOARD && <Dashboard {...monthProps} transactions={data.transactions} budget={data.budget} cardBanks={data.cardBanks} cardSettings={data.cardSettings} onAddExpense={openAddExpense} onOpenReconciliation={() => navigate(Tab.RECONCILIATION)} />}
              {activeTab === Tab.TRANSACTIONS && <TransactionList {...monthProps} transactions={data.transactions} categories={data.categories} cardBanks={data.cardBanks} onAddTransaction={addTransaction} onAddTransactions={addTransactions} onEditTransaction={editTransaction} onDeleteTransaction={deleteTransaction} onDeleteRecurringGroup={deleteRecurringGroup} onToggleReconcile={id => reconcileTransaction(id, null)} startAdding={startAdding} />}
              {activeTab === Tab.RECONCILIATION && <Reconciliation {...monthProps} transactions={data.transactions} cardBanks={data.cardBanks} cardSettings={data.cardSettings} onReconcile={reconcileTransaction} onUpdateCardSettings={value => setField('cardSettings', value)} onDirtyChange={setHasUnsavedForm} />}
              {activeTab === Tab.BUDGET && <BudgetManager {...monthProps} transactions={data.transactions} cardBanks={data.cardBanks} cardSettings={data.cardSettings} incomeSources={data.incomeSources} budgets={data.budgets} onUpdateIncomeSources={value => setField('incomeSources', value)} onUpdateBudgets={value => setField('budgets', value)} onDirtyChange={setHasUnsavedForm} />}
              {activeTab === Tab.SALARY && <SalaryHistory adjustments={data.salaryAdjustments} onAddAdjustment={addSalaryAdjustment} onEditAdjustment={editSalaryAdjustment} onDeleteAdjustment={deleteSalaryAdjustment} />}
              {activeTab === Tab.SETTINGS && <Settings categories={data.categories} budget={data.budget} cardBanks={data.cardBanks} cardSettings={data.cardSettings} onUpdateCategories={value => setField('categories', value)} onUpdateBudget={value => setField('budget', value)} onUpdateCardBanks={value => setField('cardBanks', value)} onUpdateCardSettings={value => setField('cardSettings', value)} onCloudSync={(url, upload) => controller.sync(url, upload)} onResetData={() => controller.update(() => initialData())} currentScriptUrl={sync.url} syncStatus={sync.status} onExportBackup={downloadBackup} onImportBackup={value => controller.update(() => value)} />}
            </Suspense></PageBoundary>}
        </div>
      </main>
      <nav aria-label="手機導覽" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">{navItems.slice(0, 4).map(item => <MobileNav key={item.tab} label={item.tab} icon={item.icon} active={activeTab === item.tab} onClick={() => navigate(item.tab)} />)}
          <MobileNav label="更多" icon={<MoreHorizontal size={21} />} active={activeTab === Tab.SALARY || activeTab === Tab.SETTINGS} onClick={() => moreDialog.current?.showModal()} />
        </div>
      </nav>
      <dialog ref={moreDialog} aria-labelledby="more-title" className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><h2 id="more-title" className="text-lg font-bold">更多功能</h2><button type="button" onClick={() => moreDialog.current?.close()} aria-label="關閉更多功能" className="touch-target rounded-xl"><X size={20} /></button></div>
        <button type="button" onClick={() => navigate(Tab.SALARY)} className="flex w-full items-center gap-3 rounded-xl px-4 py-4 hover:bg-indigo-50"><Wallet size={20} />薪資歷程</button>
        <button type="button" onClick={() => navigate(Tab.SETTINGS)} className="flex w-full items-center gap-3 rounded-xl px-4 py-4 hover:bg-indigo-50"><SettingsIcon size={20} />設定與備份</button>
      </dialog>
    </div>
  </div>;
}
function MobileNav({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return <button type="button" aria-current={active ? 'page' : undefined} onClick={onClick} className={'flex min-h-[72px] flex-col items-center justify-center gap-1 px-1 py-2 text-xs ' + (active ? 'font-bold text-indigo-700' : 'text-slate-600')}><span className={'rounded-xl px-3 py-1.5 ' + (active ? 'bg-indigo-50' : '')}>{icon}</span><span>{label}</span></button>;
}
