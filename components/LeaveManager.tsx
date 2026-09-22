import React, { useEffect, useState } from 'react';
import { CalendarDays, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import type { LeavePeriod, LeaveRecord } from '../types';
import { defaultLeavePeriod, formatHourCents, hourCents, periodLabel, possibleDuplicateLeave, prepareLeavePeriod, prepareLeaveRecord, summarizeLeave, taipeiToday, type LeavePeriodInput, type LeaveRecordInput } from '../utils/leave';

interface Props {
  periods: LeavePeriod[];
  records: LeaveRecord[];
  onUpdate: (periods: LeavePeriod[], records: LeaveRecord[]) => void;
  onDirtyChange: (dirty: boolean) => void;
}
type Editor = { kind: 'period'; id: string; value: LeavePeriodInput; baseline: string } | { kind: 'record'; id: string; value: LeaveRecordInput; baseline: string };
const inputClass = 'mt-2 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';
const primaryClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white';

export default function LeaveManager({ periods, records, onUpdate, onDirtyChange }: Props) {
  const [today, setToday] = useState(taipeiToday);
  const [selectedId, setSelectedId] = useState(() => defaultLeavePeriod(periods));
  const [filter, setFilter] = useState('all');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const dirty = editor !== null && JSON.stringify(editor.value) !== editor.baseline;
  const period = periods.find(item => item.id === selectedId) ?? periods.find(item => item.id === defaultLeavePeriod(periods, today));
  const summary = summarizeLeave(period, records);
  const visible = records.filter(item => item.periodId === period?.id && (filter === 'all' || item.completed === (filter === 'completed')))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(taipeiToday()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const discard = () => !dirty || window.confirm('年假表單有尚未儲存的輸入。要放棄這些變更嗎？');
  const close = () => { if (discard()) { setEditor(null); setError(''); } };
  const editPeriod = (existing?: LeavePeriod) => {
    if (!discard()) return;
    const value = { name: existing?.name ?? '', startDate: existing?.startDate ?? '', endDate: existing?.endDate ?? '', totalHours: existing ? String(existing.totalHours) : '' };
    setEditor({ kind: 'period', id: existing?.id ?? '', value, baseline: JSON.stringify(value) }); setError('');
  };
  const editRecord = (existing?: LeaveRecord) => {
    if (!discard()) return;
    const value = { date: existing?.date ?? '', hours: existing ? String(existing.hours) : '', completed: existing?.completed ?? false, note: existing?.note ?? '' };
    setEditor({ kind: 'record', id: existing?.id ?? '', value, baseline: JSON.stringify(value) }); setError('');
  };
  const confirmOverage = (nextPeriod: LeavePeriod, nextRecords: LeaveRecord[]) => {
    const available = summarizeLeave(nextPeriod, nextRecords).available!;
    return available >= 0 || window.confirm(`已超出 ${formatHourCents(-available)} 小時。儲存後將保留真實負值，不調整額度或休假明細。仍要儲存嗎？`);
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!editor) return;
    try {
      if (editor.kind === 'period') {
        const old = periods.find(item => item.id === editor.id);
        const value = { ...old, ...prepareLeavePeriod(editor.value, editor.id || crypto.randomUUID(), records, today) };
        const next = old ? periods.map(item => item.id === value.id ? value : item) : [...periods, value];
        if (!confirmOverage(value, records)) return;
        onUpdate(next, records); setSelectedId(value.id);
      } else if (period) {
        const old = records.find(item => item.id === editor.id);
        const value = { ...old, ...prepareLeaveRecord(editor.value, editor.id || crypto.randomUUID(), period, today) };
        if (possibleDuplicateLeave(value, records) && !window.confirm(`${value.date} 已有相同 ${formatHourCents(hourCents(value.hours))} 小時的休假，可能重複。仍要儲存這筆紀錄嗎？`)) return;
        const next = old ? records.map(item => item.id === value.id ? value : item) : [...records, value];
        if (!confirmOverage(period, next)) return;
        onUpdate(periods, next);
      }
      setEditor(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '年假尚未儲存，請重試。'); }
  };
  const toggle = (record: LeaveRecord) => {
    try {
      const value = { ...record, ...prepareLeaveRecord({ ...record, hours: String(record.hours), completed: !record.completed, note: record.note ?? '' }, record.id, period!, today) };
      const next = records.map(item => item.id === value.id ? value : item);
      if (!confirmOverage(period!, next)) return;
      onUpdate(periods, next); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '無法更新休假。'); }
  };
  const remove = (record: LeaveRecord) => {
    if (!window.confirm(`刪除 ${record.date} 的 ${formatHourCents(hourCents(record.hours))} 小時休假？確認後會移除此筆紀錄。`)) return;
    try { onUpdate(periods, records.filter(item => item.id !== record.id)); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '無法刪除休假。'); }
  };
  const cards = [
    ['年度總時數', summary.total, period ? '本期設定額度' : '待設定'],
    ['累計已休', summary.used, '已勾選休畢的時數'],
    ['已排未休', summary.planned, '尚未勾選休畢的時數'],
    ['剩餘時數', summary.remaining, '尚未扣除已排未休'],
    ['可再安排時數', summary.available, '已扣除所有已登記休假'],
  ] as const;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="flex items-center gap-2 text-2xl font-bold"><CalendarDays className="text-indigo-600" />年假管理</h2><p className="mt-2 text-sm text-slate-600">記錄個人年假額度與休假時數。</p></div>
      <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
        <label className="w-full min-w-0 flex-none text-sm font-medium sm:w-auto sm:max-w-xs sm:flex-1">年假年度<select aria-label="年假年度" className={inputClass} value={period?.id ?? ''} disabled={!periods.length} onChange={event => { if (discard()) { setSelectedId(event.target.value); setEditor(null); setError(''); } }}>
          {!periods.length && <option value="">待設定</option>}
          {[...periods].sort((a, b) => b.startDate.localeCompare(a.startDate)).map(item => <option key={item.id} value={item.id}>{periodLabel(item)}</option>)}
        </select></label>
        <button type="button" className={buttonClass} onClick={() => editPeriod()}><Plus size={17} />新增年度</button>
        <button type="button" className={buttonClass} disabled={!period} onClick={() => editPeriod(period)}><Pencil size={17} />編輯年度</button>
      </div>
    </div>
    {period ? <p className="text-sm text-slate-600">{period.startDate} ～ {period.endDate}（含起訖日）{period.endDate < today && <span className="ml-2 font-medium text-amber-800">期間已結束；餘額僅供紀錄，不代表仍可使用。</span>}</p> : <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-6"><h3 className="text-lg font-bold">尚未設定年假</h3><p className="my-3 text-sm text-slate-600">請依自己的額度建立年假期間，可跨曆年。時數尚未設定，不會以 0 計算。</p><button type="button" className={primaryClass} onClick={() => editPeriod()}>建立年假年度</button></section>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5" aria-label="年度年假統計">
      {cards.map(([title, cents, hint], index) => <section key={title} aria-label={title} className={'min-w-0 rounded-2xl border p-4 ' + (index === 4 ? 'col-span-2 border-indigo-200 bg-indigo-50 xl:col-span-1' : 'border-slate-200 bg-white')}>
        <h3 className={'text-sm font-bold ' + (index === 4 ? 'text-indigo-800' : 'text-slate-600')}>{title}</h3>
        <p className="my-2 break-words text-2xl font-bold tabular-nums" data-testid={'leave-stat-' + index}>{formatHourCents(cents)}{cents !== null && <span className="ml-1 text-sm font-normal">小時</span>}</p>
        <p className="text-xs leading-relaxed text-slate-600">{hint}</p>
        {cents !== null && cents < 0 && <p className="mt-2 text-sm font-bold text-rose-700">已超出 {formatHourCents(-cents)} 小時</p>}
      </section>)}
    </div>
    {error && <p role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {editor && <section aria-label="年假編輯表單" className="rounded-2xl border border-indigo-200 bg-white p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-lg font-bold">{editor.id ? '編輯' : '新增'}{editor.kind === 'period' ? '年假年度' : '休假'}</h3><button type="button" aria-label="關閉年假表單" className="touch-target rounded-xl" onClick={close}><X size={20} /></button></div>
      <form onSubmit={save} noValidate className="space-y-4">
        {editor.kind === 'period' ? <div className="grid gap-4 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-medium">年度名稱（選填）<input className={inputClass} value={editor.value.name} onChange={event => setEditor({ ...editor, value: { ...editor.value, name: event.target.value } })} /></label>
          <label className="min-w-0 text-sm font-medium">年度總時數<input inputMode="decimal" required className={inputClass} value={editor.value.totalHours} onChange={event => setEditor({ ...editor, value: { ...editor.value, totalHours: event.target.value } })} aria-describedby="leave-precision" /></label>
          <label className="min-w-0 text-sm font-medium">起始日<input type="date" required className={inputClass} value={editor.value.startDate} onChange={event => setEditor({ ...editor, value: { ...editor.value, startDate: event.target.value } })} /></label>
          <label className="min-w-0 text-sm font-medium">截止日（含當日）<input type="date" required className={inputClass} value={editor.value.endDate} onChange={event => setEditor({ ...editor, value: { ...editor.value, endDate: event.target.value } })} /></label>
        </div> : <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-medium">休假日期<input type="date" required min={period?.startDate} max={period?.endDate} className={inputClass} value={editor.value.date} onChange={event => setEditor({ ...editor, value: { ...editor.value, date: event.target.value } })} /></label>
            <label className="min-w-0 text-sm font-medium">休假時數<input inputMode="decimal" required className={inputClass} value={editor.value.hours} onChange={event => setEditor({ ...editor, value: { ...editor.value, hours: event.target.value } })} aria-describedby="leave-precision" /></label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={editor.value.completed} disabled={!editor.value.completed && editor.value.date > today} onChange={event => setEditor({ ...editor, value: { ...editor.value, completed: event.target.checked } })} />已休畢</label>
          {editor.value.date > today && <p className="text-sm text-amber-800">未來日期不可標記已休畢；若已勾選，請先取消再儲存。</p>}
          <label className="block text-sm font-medium">備註（選填）<textarea rows={2} className={inputClass} value={editor.value.note} onChange={event => setEditor({ ...editor, value: { ...editor.value, note: event.target.value } })} /></label>
        </>}
        <p id="leave-precision" className="text-xs text-slate-500">時數最多小數 2 位，為輸入精度，不代表公司的請假單位。{editor.kind === 'period' ? '額度必填；0 須明確輸入。' : '休假時數須大於 0。'}</p>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className={buttonClass} onClick={close}>取消</button><button type="submit" className={primaryClass}><Save size={17} />儲存{editor.kind === 'period' ? '年度' : '休假'}</button></div>
      </form>
    </section>}
    {period && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">休假明細</h3><button type="button" className={primaryClass} onClick={() => editRecord()}><Plus size={17} />新增休假</button></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="休假狀態篩選">{[['all', '全部'], ['planned', '已排未休'], ['completed', '已休畢']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className={buttonClass + (filter === value ? ' !border-indigo-300 !bg-indigo-50 font-bold text-indigo-800' : '')} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <p className="text-xs text-slate-500">依日期由早至晚排列；篩選只影響明細，摘要仍計算整年度。今天（台北）：{today}</p>
      {!visible.length ? <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">{filter === 'all' ? '尚未登記休假' : '沒有符合篩選的休假'}</p> : <ul className="space-y-3">{visible.map(record => <li key={record.id} className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 xl:grid-cols-[8rem_6rem_10rem_minmax(0,1fr)_auto] xl:items-center">
        <div><p className="text-xs text-slate-500 md:sr-only">休假日期</p><p className="font-bold tabular-nums">{record.date}</p></div>
        <p className="font-bold tabular-nums">{formatHourCents(hourCents(record.hours))} 小時</p>
        <div><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0 accent-indigo-600" checked={record.completed} disabled={Boolean(editor) || (!record.completed && record.date > today)} aria-label={`${record.date} ${record.hours} 小時${record.note ? ' ' + record.note : ''} 已休畢`} onChange={() => toggle(record)} />{record.completed ? '已休畢' : '已排未休'}</label>{!record.completed && record.date < today && <p className="text-xs text-amber-800">待確認是否已休</p>}{record.date > today && <p className="text-xs text-slate-500">日期未到，無法勾選</p>}</div>
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm text-slate-600">{record.note || '無備註'}</p>
        <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={() => editRecord(record)} aria-label={`編輯 ${record.date} ${record.hours} 小時${record.note ? ' ' + record.note : ''}`}><Pencil size={16} />編輯</button><button type="button" className={buttonClass + ' text-rose-700'} disabled={Boolean(editor)} onClick={() => remove(record)} aria-label={`刪除 ${record.date} ${record.hours} 小時${record.note ? ' ' + record.note : ''}`}><Trash2 size={16} />刪除</button></div>
      </li>)}</ul>}
    </section>}
  </div>;
}
