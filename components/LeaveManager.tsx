import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, CheckCheck, Clock3, Hourglass, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import type { LeavePeriod, LeavePurpose, LeaveRecord } from '../types';
import { defaultLeavePeriod, formatHourCents, hourCents, isReservedLeave, leavePurposeLabels, periodLabel, possibleDuplicateLeave, prepareLeavePeriod, prepareLeaveRecord, scheduleReservedLeave, summarizeLeave, summarizeLeavePurposes, taipeiToday, type LeavePeriodInput, type LeaveRecordInput } from '../utils/leave';

interface Props {
  periods: LeavePeriod[];
  records: LeaveRecord[];
  onUpdate: (periods: LeavePeriod[], records: LeaveRecord[]) => void;
  onDirtyChange: (dirty: boolean) => void;
}
type Editor = { kind: 'period'; id: string; value: LeavePeriodInput; baseline: string }
  | { kind: 'record' | 'schedule'; id: string; value: LeaveRecordInput; baseline: string };
const inputClass = 'mt-2 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';
const primaryClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white';
const recordLabel = (record: LeaveRecord) => `${isReservedLeave(record) ? '未定日期' : record.date} ${record.hours} 小時${record.note ? ' ' + record.note : ''}`;

export default function LeaveManager({ periods, records, onUpdate, onDirtyChange }: Props) {
  const [today, setToday] = useState(taipeiToday);
  const [selectedId, setSelectedId] = useState(() => defaultLeavePeriod(periods));
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const focusAfterToggle = useRef<string | null>(null);
  const checkboxes = useRef(new Map<string, HTMLInputElement>());
  const hasEditor = editor !== null;
  const dirty = editor !== null && JSON.stringify(editor.value) !== editor.baseline;
  const period = periods.find(item => item.id === selectedId) ?? periods.find(item => item.id === defaultLeavePeriod(periods, today));
  const summary = summarizeLeave(period, records);
  const purposes = summarizeLeavePurposes(period, records);
  const related = records.filter(item => item.periodId === period?.id);
  const completed = related.filter(item => item.completed).sort((a, b) => b.date!.localeCompare(a.date!) || a.id.localeCompare(b.id));
  const planned = related.filter(item => !item.completed && !isReservedLeave(item)).sort((a, b) => a.date!.localeCompare(b.date!) || a.id.localeCompare(b.id));
  const reserved = related.filter(isReservedLeave);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => { const timer = window.setInterval(() => setToday(taipeiToday()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (hasEditor) dialog.current?.showModal(); else dialog.current?.close(); }, [hasEditor]);
  useEffect(() => {
    if (focusAfterToggle.current) checkboxes.current.get(focusAfterToggle.current)?.focus();
    focusAfterToggle.current = null;
  }, [records]);
  const discard = () => !dirty || window.confirm('年假表單有尚未儲存的輸入。要放棄這些變更嗎？');
  const close = () => { if (discard()) { setEditor(null); setError(''); } };
  const editPeriod = (existing?: LeavePeriod) => {
    if (!discard()) return;
    const value = { name: existing?.name ?? '', startDate: existing?.startDate ?? '', endDate: existing?.endDate ?? '', totalHours: existing ? String(existing.totalHours) : '' };
    setEditor({ kind: 'period', id: existing?.id ?? '', value, baseline: JSON.stringify(value) }); setError('');
  };
  const editRecord = (existing?: LeaveRecord, kind: 'dated' | 'reserved' = 'dated', scheduling = false) => {
    if (!discard()) return;
    const value: LeaveRecordInput = { kind: scheduling ? 'dated' : existing?.kind ?? kind, purpose: existing ? existing.purpose ?? 'unclassified' : '', date: existing?.date ?? '', hours: existing && !scheduling ? String(existing.hours) : '', completed: existing?.completed ?? false, note: existing?.note ?? '' };
    setEditor({ kind: scheduling ? 'schedule' : 'record', id: existing?.id ?? '', value, baseline: JSON.stringify(value) }); setError('');
  };
  const confirmOverage = (nextPeriod: LeavePeriod, nextRecords: LeaveRecord[]) => {
    const available = summarizeLeave(nextPeriod, nextRecords).available!;
    return available >= 0 || window.confirm(`已超出 ${formatHourCents(-available)} 小時。儲存後將保留真實負值，不調整額度、休假或保留時數。仍要儲存嗎？`);
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
        let next: LeaveRecord[], value: LeaveRecord;
        if (editor.kind === 'schedule') {
          const id = crypto.randomUUID();
          next = scheduleReservedLeave(records, editor.id, editor.value, id, period, today);
          value = next.find(item => item.id === id) ?? next.find(item => item.id === editor.id)!;
        } else {
          value = { ...old, ...prepareLeaveRecord(editor.value, editor.id || crypto.randomUUID(), period, today) };
          next = old ? records.map(item => item.id === value.id ? value : item) : [...records, value];
        }
        if (possibleDuplicateLeave(value, records) && !window.confirm(`${value.date} 已有相同 ${formatHourCents(hourCents(value.hours))} 小時的休假，可能重複。仍要儲存這筆紀錄嗎？`)) return;
        if (!confirmOverage(period, next)) return;
        onUpdate(periods, next);
      }
      setEditor(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '年假尚未儲存，請重試。'); }
  };
  const toggle = (record: LeaveRecord) => {
    try {
      const value = { ...record, ...prepareLeaveRecord({ ...record, date: record.date!, hours: String(record.hours), completed: !record.completed, note: record.note ?? '' }, record.id, period!, today) };
      const next = records.map(item => item.id === value.id ? value : item);
      if (!confirmOverage(period!, next)) return;
      focusAfterToggle.current = record.id;
      onUpdate(periods, next); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '無法更新休假。'); }
  };
  const remove = (record: LeaveRecord) => {
    if (!window.confirm(`刪除 ${isReservedLeave(record) ? '未定日期，' + leavePurposeLabels[record.purpose ?? 'unclassified'] + '用途保留' : record.date + ' 的'} ${formatHourCents(hourCents(record.hours))} 小時${isReservedLeave(record) ? '' : '休假'}？確認後會移除此筆紀錄。`)) return;
    try { onUpdate(periods, records.filter(item => item.id !== record.id)); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '無法刪除休假。'); }
  };
  const cards = [
    ['年度總時數', summary.total, period ? '本期設定額度' : '待設定', 0],
    ['累計已休', summary.used, '已勾選休畢', 1],
    ['可再安排時數', summary.available, '已扣除已休、已排與保留', 4],
    ['已排未休', summary.planned, '已填日期，尚未休畢', 2],
    ['保留時數', summary.reserved, '未定日期，先預留時間', 5],
    ['剩餘時數', summary.remaining, '尚未扣除已排未休及保留', 3],
  ] as const;
  const rows = (items: LeaveRecord[]) => <ul className="leave-rows">{items.map(record => <li key={record.id} className="leave-row" data-record-id={record.id}>
    <div className="leave-row-info">
      <div className="leave-row-title">
        {!isReservedLeave(record) && <label className="leave-check" title={record.date! > today ? '日期未到，無法勾選' : '切換已休畢'}><input ref={node => { if (node) checkboxes.current.set(record.id, node); else checkboxes.current.delete(record.id); }} type="checkbox" checked={record.completed} disabled={hasEditor || (!record.completed && record.date! > today)} aria-label={`${recordLabel(record)} 已休畢`} onChange={() => toggle(record)} /><span>{record.date}</span></label>}
        {isReservedLeave(record) && <span className="font-bold">未定日期</span>}
        <span className={'leave-purpose leave-purpose-' + (record.purpose ?? 'unclassified')}>{leavePurposeLabels[record.purpose ?? 'unclassified']}</span>
      </div>
      {!isReservedLeave(record) && <p className="leave-row-state">{record.completed ? '已休畢' : record.date! < today ? '待確認是否已休' : record.date! > today ? '已排未休 · 日期未到' : '已排未休'}</p>}
    </div>
    <span className="leave-row-hours">{formatHourCents(hourCents(record.hours))}<small> 小時</small></span>
    <div className="leave-row-actions">
      {isReservedLeave(record) && <button type="button" className="leave-schedule" onClick={() => editRecord(record, 'dated', true)} aria-label={`排定 ${recordLabel(record)}`}>排定日期</button>}
      <button type="button" title="編輯" onClick={() => editRecord(record)} aria-label={`編輯 ${recordLabel(record)}`}><Pencil size={17} /></button>
      <button type="button" title="刪除" className="text-rose-700" onClick={() => remove(record)} aria-label={`刪除 ${recordLabel(record)}`}><Trash2 size={17} /></button>
    </div>
    {record.note && <p className="leave-row-note">{record.note}</p>}
  </li>)}</ul>;
  const formTitle = !editor ? '' : editor.kind === 'period' ? (editor.id ? '編輯年假年度' : '新增年假年度') : editor.kind === 'schedule' ? '分次排定休假' : (editor.id ? '編輯' : '新增') + (editor.value.kind === 'reserved' ? '保留時數' : '休假');
  const alert = error && <p role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>;
  return <div className="leave-page">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-2xl font-bold"><CalendarDays className="text-indigo-600" />年假管理</h2><p className="mt-1 text-sm text-slate-600">為生活留一點時間。</p></div>
      <div className="leave-period-controls">
        <label className="min-w-0 text-sm font-medium">年假年度<select aria-label="年假年度" className={inputClass} value={period?.id ?? ''} disabled={!periods.length} onChange={event => { if (discard()) { setSelectedId(event.target.value); setEditor(null); setError(''); } }}>
          {!periods.length && <option value="">待設定</option>}{[...periods].sort((a, b) => b.startDate.localeCompare(a.startDate)).map(item => <option key={item.id} value={item.id}>{periodLabel(item)}</option>)}
        </select></label>
        <button type="button" className={buttonClass} onClick={() => editPeriod()}><Plus size={17} />新增年度</button>
        <button type="button" className={buttonClass} disabled={!period} onClick={() => editPeriod(period)}><Pencil size={17} />編輯年度</button>
      </div>
    </div>
    {period ? <p className="text-xs text-slate-600">{period.startDate} ～ {period.endDate}（含起訖日）{period.endDate < today && <span className="ml-2 font-medium text-amber-800">期間已結束；餘額僅供紀錄，不代表仍可使用。</span>}</p> : <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><h3 className="text-lg font-bold">尚未設定年假</h3><p className="my-3 text-sm text-slate-600">依自己的額度建立年假期間，可跨曆年。尚未設定的時數不會以 0 計算。</p><button type="button" className={primaryClass} onClick={() => editPeriod()}>建立年假年度</button></section>}
    <div className="leave-overview">
      <div className="leave-stats" aria-label="年度年假統計">{cards.map(([title, cents, hint, index]) => <section key={title} aria-label={title} className={'leave-stat leave-stat-' + index}>
        <h3>{title}</h3><p className="leave-stat-number" key={cents} data-testid={'leave-stat-' + index}>{formatHourCents(cents)}{cents !== null && <small>小時</small>}</p><p className="leave-stat-hint">{hint}</p>
        {cents !== null && cents < 0 && <p className="text-xs font-bold text-rose-700">已超出 {formatHourCents(-cents)} 小時</p>}
      </section>)}</div>
      <section className="leave-purpose-summary" aria-label="已休用途占比">
        <div className="flex items-center justify-between gap-2"><h3 className="font-bold">已休用途占比</h3><span className="text-xs text-slate-600">共用年度額度</span></div>
        <p className="mt-1 text-xs text-slate-600">只計已休畢時數</p>
        <div className="leave-purpose-track" aria-hidden="true">{(Object.keys(purposes) as LeavePurpose[]).map(purpose => <span key={purpose} className={'leave-purpose-' + purpose} style={{ width: summary.used ? `${purposes[purpose] / summary.used * 100}%` : '0%' }} />)}</div>
        {!summary.used && <p className="mb-3 text-sm text-slate-600">尚無已休資料</p>}
        <ul className="space-y-2">{(Object.keys(purposes) as LeavePurpose[]).map(purpose => <li key={purpose} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className={'leave-purpose leave-purpose-' + purpose}>{leavePurposeLabels[purpose]}</span><span className="tabular-nums">{formatHourCents(period ? purposes[purpose] : null)} 小時 <span className="ml-2 text-slate-500">{summary.used ? `${(purposes[purpose] / summary.used * 100).toFixed(1)}%` : '—'}</span></span></li>)}</ul>
      </section>
    </div>
    {!editor && alert}
    {period && <section aria-label="休假明細">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">休假明細</h3><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass + ' leave-add-reserve'} onClick={() => editRecord(undefined, 'reserved')}><Hourglass size={17} />新增保留</button><button type="button" className={primaryClass} onClick={() => editRecord()}><Plus size={17} />新增休假</button></div></div>
      <div className="leave-columns">
        <section className="leave-column leave-completed" aria-label="已休明細"><div className="leave-column-heading"><h4><CheckCheck size={19} />已休明細 <span>{completed.length} 筆</span></h4><strong>{formatHourCents(summary.used)} 小時</strong></div>
          {completed.length ? rows(completed) : <p className="leave-empty">尚無已休畢的休假</p>}
        </section>
        <section className="leave-column leave-pending" aria-label="未休明細"><div className="leave-column-heading"><h4><Clock3 size={19} />未休明細 <span>{planned.length + reserved.length} 筆</span></h4><strong>{formatHourCents((summary.planned ?? 0) + (summary.reserved ?? 0))} 小時</strong></div>
          <div className="leave-group-heading">已排未休 <span>{formatHourCents(summary.planned)} 小時</span></div>
          {planned.length ? rows(planned) : <p className="leave-empty">尚無已排定的休假</p>}
          <div className="leave-reservations"><div className="leave-group-heading"><span><Hourglass size={15} />保留時數 · 未定日期</span><span>{formatHourCents(summary.reserved)} 小時</span></div>
            {reserved.length ? rows(reserved) : <p className="leave-empty">還沒決定日期？可先新增保留時數。</p>}
          </div>
        </section>
      </div>
      <p className="mt-3 text-xs text-slate-500">已休由近到遠、已排未休依日期排列。過去未勾選的紀錄不會自動轉為已休。今天（台北）：{today}</p>
    </section>}
    <dialog ref={dialog} className="leave-dialog" aria-labelledby="leave-editor-title" onCancel={event => { event.preventDefault(); close(); }}>
      {editor && <><div className="leave-dialog-header"><h3 id="leave-editor-title" className="text-lg font-bold">{formTitle}</h3><button type="button" aria-label="關閉年假表單" className="touch-target rounded-xl" onClick={close}><X size={20} /></button></div>
        <form onSubmit={save} noValidate className="space-y-4 p-4 sm:p-5">
          {editor.kind === 'period' ? <div className="grid gap-4 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-medium">年度名稱（選填）<input autoFocus className={inputClass} value={editor.value.name} onChange={event => setEditor({ ...editor, value: { ...editor.value, name: event.target.value } })} /></label>
            <label className="min-w-0 text-sm font-medium">年度總時數<input inputMode="decimal" required className={inputClass} value={editor.value.totalHours} onChange={event => setEditor({ ...editor, value: { ...editor.value, totalHours: event.target.value } })} aria-describedby="leave-precision" /></label>
            <label className="min-w-0 text-sm font-medium">起始日<input type="date" required className={inputClass} value={editor.value.startDate} onChange={event => setEditor({ ...editor, value: { ...editor.value, startDate: event.target.value } })} /></label>
            <label className="min-w-0 text-sm font-medium">截止日（含當日）<input type="date" required className={inputClass} value={editor.value.endDate} onChange={event => setEditor({ ...editor, value: { ...editor.value, endDate: event.target.value } })} /></label>
          </div> : <>
            {editor.kind === 'schedule' && <p className="rounded-xl bg-amber-50 p-3 text-sm">尚有 {formatHourCents(hourCents(records.find(item => item.id === editor.id)!.hours))} 小時可排定。填入本次時數，未排完的部分會繼續保留；不會重複扣除可再安排時數。</p>}
            {editor.value.kind === 'reserved' && <p className="rounded-xl bg-amber-50 p-3 text-sm">先預留時間，不必填日期。保留時數會扣除「可再安排時數」，之後可分次排定日期。</p>}
            <label className="block text-sm font-medium">用途<select aria-label="用途" autoFocus required className={inputClass} value={editor.value.purpose} disabled={editor.kind === 'schedule'} onChange={event => setEditor({ ...editor, value: { ...editor.value, purpose: event.target.value as LeavePurpose | '' } })}><option value="" disabled>請選擇用途</option><option value="family">家庭</option><option value="association">協會</option>{editor.id && <option value="unclassified">未分類</option>}</select></label>
            <div className="grid gap-4 sm:grid-cols-2">
              {editor.value.kind !== 'reserved' && <label className="min-w-0 text-sm font-medium">休假日期<input type="date" required min={period?.startDate} max={period?.endDate} className={inputClass} value={editor.value.date} onChange={event => setEditor({ ...editor, value: { ...editor.value, date: event.target.value } })} /></label>}
              <label className="min-w-0 text-sm font-medium">{editor.value.kind === 'reserved' ? '保留時數' : '休假時數'}<input inputMode="decimal" required className={inputClass} value={editor.value.hours} onChange={event => setEditor({ ...editor, value: { ...editor.value, hours: event.target.value } })} aria-describedby="leave-precision" /></label>
            </div>
            {editor.value.kind !== 'reserved' && <><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={editor.value.completed} disabled={!editor.value.completed && editor.value.date > today} onChange={event => setEditor({ ...editor, value: { ...editor.value, completed: event.target.checked } })} />已休畢</label>{editor.value.date > today && <p className="text-sm text-amber-800">未來日期不可標記已休畢；若已勾選，請先取消再儲存。</p>}</>}
            <label className="block text-sm font-medium">備註（選填）<textarea rows={2} className={inputClass} value={editor.value.note} onChange={event => setEditor({ ...editor, value: { ...editor.value, note: event.target.value } })} /></label>
          </>}
          <p id="leave-precision" className="text-xs text-slate-500">時數最多小數 2 位，為輸入精度，不代表公司的請假單位。{editor.kind === 'period' ? '額度必填；0 須明確輸入。' : '時數須大於 0。'}</p>
          {alert}
          <div className="flex flex-wrap justify-end gap-2"><button type="button" className={buttonClass} onClick={close}>取消</button><button type="submit" className={primaryClass}><Save size={17} />{editor.kind === 'period' ? '儲存年度' : editor.kind === 'schedule' ? '確認排定' : editor.value.kind === 'reserved' ? '儲存保留' : '儲存休假'}</button></div>
        </form></>}
    </dialog>
  </div>;
}
