import React, { useEffect, useRef, useState } from 'react';
import { CloudDownload, CloudUpload, Download, Plus, Save, Settings as SettingsIcon, Trash2, Upload, X } from 'lucide-react';
import type { CardSetting, FinanceData } from '../types';
import { parseBackup } from '../utils/backup';

interface SettingsProps {
  categories: string[]; budget: number; cardBanks: string[]; cardSettings: Record<string, CardSetting>;
  onUpdateCategories: (value: string[]) => void; onUpdateBudget: (value: number) => void;
  onUpdateCardBanks: (value: string[]) => void; onUpdateCardSettings: (value: Record<string, CardSetting>) => void;
  onCloudSync: (url: string, upload: boolean) => Promise<void>; onResetData: () => void;
  currentScriptUrl: string; syncStatus: string; onExportBackup: () => void; onImportBackup: (value: FinanceData) => void;
}
const inputClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';
type Action = 'upload' | 'download' | 'reset' | 'import' | null;

export default function Settings(props: SettingsProps) {
  const { categories, budget, cardBanks, cardSettings } = props;
  const [scriptUrl, setScriptUrl] = useState(props.currentScriptUrl);
  const [tempBudget, setTempBudget] = useState(String(budget));
  const [newCategory, setNewCategory] = useState('');
  const [newBank, setNewBank] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [action, setAction] = useState<Action>(null);
  const [backup, setBackup] = useState<FinanceData | null>(null);
  const [working, setWorking] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => setScriptUrl(props.currentScriptUrl), [props.currentScriptUrl]);
  useEffect(() => setTempBudget(String(budget)), [budget]);
  useEffect(() => { if (action) dialog.current?.showModal(); else dialog.current?.close(); }, [action]);
  const busy = working || props.syncStatus === 'loading' || props.syncStatus === 'syncing';
  const close = () => { dialog.current?.close(); setAction(null); };
  const requestCloud = (value: 'upload' | 'download') => {
    setMessage(''); setError('');
    try {
      const url = new URL(scriptUrl.trim());
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error();
      setAction(value);
    } catch { setError('請輸入完整的 HTTPS Apps Script 網址。'); }
  };
  const runConfirmed = async () => {
    const selectedAction = action;
    if (!selectedAction) return;
    close(); setMessage(''); setError(''); setWorking(true);
    try {
      if (selectedAction === 'reset') { props.onResetData(); setMessage('帳本已清空並重設，保存進度請見上方狀態。'); }
      else if (selectedAction === 'import' && backup) { props.onImportBackup(backup); setBackup(null); setMessage('備份已載入目前帳本，保存進度請見上方狀態。'); }
      else if (selectedAction === 'upload' || selectedAction === 'download') {
        await props.onCloudSync(scriptUrl.trim(), selectedAction === 'upload');
        setMessage('請依畫面上方的同步狀態確認結果；若版本不同，請先選擇要保留的資料。');
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '操作未完成，請重試。'); }
    finally { setWorking(false); }
  };
  const readBackup = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setMessage('');
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('備份超過 20 MB，請先確認檔案內容。');
      setBackup(parseBackup(await file.text())); setAction('import');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '備份無法讀取，未變更目前帳本。'); }
    finally { if (fileInput.current) fileInput.current.value = ''; }
  };
  const saveBudget = (event: React.FormEvent) => {
    event.preventDefault();
    if (tempBudget.trim() === '' || !/^\d+(\.\d+)?$/.test(tempBudget.trim()) || !Number.isFinite(Number(tempBudget))) { setError('請輸入有效的非負預算金額；0 代表不設定可用預算。'); return; }
    props.onUpdateBudget(Number(tempBudget)); setError(''); setMessage('預算已更新，保存進度請見上方狀態。');
  };
  const updateCard = (bank: string, value: Partial<CardSetting>) => props.onUpdateCardSettings({ ...cardSettings, [bank]: { ...(cardSettings[bank] ?? { statementDay: 0 }), ...value } });
  return <div className="mx-auto max-w-3xl space-y-6">
    <div><h2 className="flex items-center gap-2 text-2xl font-bold"><SettingsIcon className="text-indigo-600" />設定與備份</h2><p className="mt-2 text-sm text-slate-600">管理帳本連線、完整備份與記帳選項。</p></div>
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <h3 className="text-lg font-bold">Google 試算表連線</h3>
      <p className="text-sm leading-relaxed text-slate-600">變更網址不會立即切換帳本。從雲端還原成功後，才會啟用新連線；有本機草稿時會先請你確認版本。</p>
      <label htmlFor="script-url" className="block text-sm font-medium">Apps Script 網址</label>
      <input id="script-url" type="url" value={scriptUrl} onChange={event => setScriptUrl(event.target.value)} className={inputClass} placeholder="https://script.google.com/…" autoComplete="off" spellCheck={false} />
      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonClass} disabled={busy} onClick={() => requestCloud('download')}><CloudDownload size={18} />從雲端還原</button>
        <button type="button" className={buttonClass} disabled={busy || props.syncStatus === 'conflict'} onClick={() => requestCloud('upload')}><CloudUpload size={18} />以上傳資料更新雲端</button>
      </div>
    </section>
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <h3 className="text-lg font-bold">完整帳本備份</h3>
      <p className="text-sm text-slate-600">JSON 備份包含交易、卡片設定、月度帳務、入帳來源與薪資歷程。Excel 匯出僅包含交易明細。</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonClass} onClick={props.onExportBackup}><Download size={18} />匯出完整備份</button>
        <button type="button" className={buttonClass} onClick={() => fileInput.current?.click()} disabled={busy}><Upload size={18} />匯入完整備份</button>
        <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={event => void readBackup(event.target.files?.[0])} aria-label="選擇完整備份檔案" />
      </div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <h3 className="mb-4 text-lg font-bold">每月消費預算</h3>
      <form onSubmit={saveBudget} className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm font-medium">預算金額<input type="number" min="0" step="0.01" required value={tempBudget} onChange={event => setTempBudget(event.target.value)} className={inputClass + ' mt-2'} /></label><button type="submit" className={buttonClass}><Save size={18} />儲存預算</button></form>
      <p className="mt-3 text-sm text-slate-500">用於概覽的消費預算使用率；月度帳務中的入帳與貸款另行管理。</p>
    </section>
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <h3 className="text-lg font-bold">信用卡與帳單週期</h3>
      {cardBanks.filter(bank => bank !== '-').map(bank => <div key={bank} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_1fr]">
        <h4 className="font-bold sm:col-span-2">{bank}</h4>
        <label className="text-sm">結帳日<select aria-label={bank + '結帳日'} value={cardSettings[bank]?.statementDay || ''} onChange={event => updateCard(bank, { statementDay: event.target.value ? Number(event.target.value) : 0 })} className={inputClass + ' mt-2'}><option value="">未設定</option>{Array.from({ length: 31 }, (_, index) => index + 1).map(day => <option key={day} value={day}>{day} 日</option>)}</select></label>
        <label className="flex min-h-11 items-center gap-3 self-end text-sm"><input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={cardSettings[bank]?.isNextMonth ?? ((cardSettings[bank]?.statementDay ?? 15) < 15)} onChange={event => updateCard(bank, { isNextMonth: event.target.checked })} />帳單於次月結帳</label>
      </div>)}
      <form onSubmit={event => { event.preventDefault(); const name = newBank.trim(); if (name && !cardBanks.includes(name)) { props.onUpdateCardBanks([...cardBanks, name]); setNewBank(''); } }} className="flex gap-3"><input aria-label="新增信用卡名稱" value={newBank} onChange={event => setNewBank(event.target.value)} placeholder="新增信用卡名稱" className={inputClass} /><button type="submit" className={buttonClass} disabled={!newBank.trim() || cardBanks.includes(newBank.trim())}><Plus size={18} />新增</button></form>
    </section>
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <h3 className="text-lg font-bold">消費分類</h3>
      <p className="text-sm text-slate-600">移除分類選項會保留既有交易的分類紀錄。</p>
      <div className="flex flex-wrap gap-2">{categories.map(category => <span key={category} className="inline-flex items-center rounded-xl bg-slate-100 pl-3 text-sm">{category}<button type="button" aria-label={'移除分類選項 ' + category} className="touch-target ml-1 rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-700" onClick={() => { if (window.confirm('移除「' + category + '」分類選項？既有交易將保留原分類。')) props.onUpdateCategories(categories.filter(value => value !== category)); }}><X size={16} /></button></span>)}</div>
      <form onSubmit={event => { event.preventDefault(); const name = newCategory.trim(); if (name && !categories.includes(name)) { props.onUpdateCategories([...categories, name]); setNewCategory(''); } }} className="flex gap-3"><input aria-label="新增消費分類" value={newCategory} onChange={event => setNewCategory(event.target.value)} placeholder="新增消費分類" className={inputClass} /><button type="submit" className={buttonClass} disabled={!newCategory.trim() || categories.includes(newCategory.trim())}><Plus size={18} />新增</button></form>
    </section>
    <section className="rounded-2xl border border-rose-200 bg-white p-5 md:p-6"><h3 className="font-bold text-rose-800">重設帳本</h3><p className="my-3 text-sm text-slate-600">清空交易、月度帳務與薪資紀錄，並重設記帳選項。連線恢復後，清空結果也會同步到雲端，請先匯出完整備份。</p><button type="button" className={buttonClass + ' text-rose-700'} onClick={() => setAction('reset')} disabled={busy || props.syncStatus === 'conflict'}><Trash2 size={18} />清空並重設帳本</button></section>
    <dialog ref={dialog} onClose={() => setAction(null)} aria-labelledby="settings-confirm-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between gap-3"><h3 id="settings-confirm-title" className="text-lg font-bold">{action === 'import' ? '確認還原完整備份' : action === 'reset' ? '確認清空帳本' : action === 'upload' ? '確認更新雲端資料' : '確認從雲端還原'}</h3><button type="button" aria-label="關閉確認視窗" onClick={close} className="touch-target rounded-xl"><X size={20} /></button></div>
      <div className="my-5 space-y-3 text-sm leading-relaxed text-slate-600">
        {action === 'import' && backup ? <><p>此備份包含 {backup.transactions.length} 筆交易、{backup.budgets.length} 個月份的帳務及 {backup.salaryAdjustments.length} 筆薪資紀錄。</p><p>確認後會取代目前帳本，並依目前連線設定排入同步。請先匯出目前版本。</p></> : action === 'reset' ? <p>目前交易、月度帳務與薪資紀錄將清空，記帳選項將重設；此結果會排入雲端同步。</p> : <><p>{action === 'upload' ? '將使用目前完整帳本更新下方網址的雲端資料。若雲端有不同版本，可能被取代。' : '將讀取下方網址的帳本。有未同步的本機草稿時會先暫停，讓你選擇要保留的版本。'}</p><p className="break-all rounded-xl bg-slate-50 p-3 font-mono text-xs">{scriptUrl.trim()}</p></>}
      </div>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={props.onExportBackup} className={buttonClass}>先匯出備份</button><button type="button" onClick={close} className={buttonClass}>取消</button><button type="button" onClick={() => void runConfirmed()} className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white">確認{action === 'reset' ? '清空' : action === 'import' ? '還原' : action === 'upload' ? '上傳' : '下載'}</button></div>
    </dialog>
  </div>;
}
