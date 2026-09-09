import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CreditCard, Info, Save, X } from 'lucide-react';
import { Transaction, CardSetting } from '../types';
import { getStatementDifference, getStatementSummary, isYearMonth, shiftYearMonth, sumTransactionAmounts } from '../utils/billing';

interface ReconciliationProps {
    transactions: Transaction[];
    cardSettings: Record<string, CardSetting>;
    cardBanks: string[];
    selectedMonth: string;
    onMonthChange: (month: string) => void;
    onReconcile: (id: string, statementMonth: string | null) => void;
    onUpdateCardSettings: (settings: Record<string, CardSetting>) => void;
    onDirtyChange?: (dirty: boolean) => void;
}
type DetailKind = 'candidates' | 'reconciled' | 'unassigned' | 'future';
const money = (value: number) => '$' + value.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
const amountText = (value: number | undefined) => value === undefined ? '' : String(value);
const detailLabels: Record<DetailKind, string> = { candidates: '待核對', reconciled: '本月已核對', unassigned: '帳單月份待確認', future: '後續明細' };

const Reconciliation: React.FC<ReconciliationProps> = ({
    transactions, cardSettings, cardBanks, selectedMonth, onMonthChange, onReconcile, onUpdateCardSettings, onDirtyChange,
}) => {
    const [selectedBank, setSelectedBank] = useState('-');
    const [statementTotal, setStatementTotal] = useState('');
    const [notice, setNotice] = useState('');
    const [listKind, setListKind] = useState<DetailKind>('candidates');
    const [detailBank, setDetailBank] = useState<string | null>(null);
    const [detailKind, setDetailKind] = useState<DetailKind>('candidates');
    const dialogRef = useRef<HTMLDialogElement>(null);
    const setting = cardSettings[selectedBank];
    const savedAmount = setting?.statementAmounts?.[selectedMonth];
    const issued = setting?.issuedMonths?.includes(selectedMonth) ?? false;
    const dirty = statementTotal !== amountText(savedAmount);
    const enteredAmount = statementTotal.trim() !== '' && Number.isFinite(Number(statementTotal)) ? Number(statementTotal) : undefined;
    const availableBanks = useMemo(() => Array.from(new Set([...cardBanks, ...Object.keys(cardSettings), ...transactions.map(t => t.cardBank)])).filter(bank => bank && bank !== '-'), [cardBanks, cardSettings, transactions]);
    const summary = useMemo(() => getStatementSummary(transactions, selectedBank, selectedMonth, setting), [transactions, selectedBank, selectedMonth, setting]);
    const difference = getStatementDifference(enteredAmount, summary.knownDetailTotal);
    const complete = !!summary.range && difference === 0 && !dirty && savedAmount !== undefined && summary.candidates.length === 0 && summary.unassigned.length === 0;
    const cardSummaries = useMemo(() => availableBanks.map(bank => ({
        bank, ...getStatementSummary(transactions, bank, selectedMonth, cardSettings[bank]),
        statementAmount: cardSettings[bank]?.statementAmounts?.[selectedMonth],
    })), [availableBanks, transactions, selectedMonth, cardSettings]);
    const detailSummary = detailBank ? getStatementSummary(transactions, detailBank, selectedMonth, cardSettings[detailBank]) : null;

    useEffect(() => {
        onDirtyChange?.(dirty);
        return () => onDirtyChange?.(false);
    }, [dirty, onDirtyChange]);

    useEffect(() => { setStatementTotal(amountText(savedAmount)); }, [selectedBank, selectedMonth, savedAmount]);
    useEffect(() => { setNotice(''); setListKind('candidates'); }, [selectedBank, selectedMonth]);
    useEffect(() => {
        const dialog = dialogRef.current;
        if (detailBank && dialog && !dialog.open) dialog.showModal();
        if (!detailBank && dialog?.open) dialog.close();
    }, [detailBank]);

    const saveStatement = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (selectedBank === '-' || enteredAmount === undefined) { setNotice('請選擇卡別並輸入帳單金額，零元帳單請明確填 0。'); return; }
        if (!setting || !summary.range) { setNotice('請先到設定填寫此卡結帳日，再儲存帳單金額。'); return; }
        try {
            onUpdateCardSettings({ ...cardSettings, [selectedBank]: { ...setting, statementAmounts: { ...setting.statementAmounts, [selectedMonth]: enteredAmount } } });
            setStatementTotal(String(enteredAmount));
            setNotice('帳單金額已更新；核結狀態保持原設定，保存狀態請見上方。');
        } catch (error) {
            setNotice(error instanceof Error ? '未儲存：' + error.message : '帳單金額未儲存，請檢查輸入。');
        }
    };
    const toggleIssued = () => {
        if (!setting) return;
        try {
            onUpdateCardSettings({ ...cardSettings, [selectedBank]: { ...setting, issuedMonths: issued ? (setting.issuedMonths ?? []).filter(month => month !== selectedMonth) : [...(setting.issuedMonths ?? []), selectedMonth] } });
            setNotice(issued ? '已取消人工核結標記。' : '已標記帳單核結；此標記不會代替逐筆核對。');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : '核結標記未更新。');
        }
    };
    const changeContext = (action: () => void) => {
        if (dirty && !window.confirm('帳單金額尚未儲存，確定要離開目前帳單？')) return;
        action();
    };
    const renderTransactions = (records: Transaction[], kind: DetailKind) => records.length === 0
        ? <p className="px-4 py-10 text-center text-sm text-slate-500">本清單目前沒有紀錄。</p>
        : <ul className="divide-y divide-slate-100">{[...records].sort((a, b) => b.date.localeCompare(a.date)).map(transaction => (
            <li key={transaction.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-800">{transaction.description}</p><p className="mt-1 text-xs text-slate-500">{transaction.date} · {transaction.category}{kind === 'unassigned' ? ' · 原核銷紀錄保留' : ''}</p></div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end"><span className="font-number font-semibold text-slate-900">{money(transaction.amount)}</span>
                    {kind === 'reconciled' ? <button type="button" onClick={() => onReconcile(transaction.id, null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">取消核對</button>
                        : kind !== 'future' && <button type="button" onClick={() => onReconcile(transaction.id, selectedMonth)} className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100">{kind === 'unassigned' ? '確認歸入 ' + selectedMonth : '歸入本月並核對'}</button>}
                </div>
            </li>
        ))}</ul>;

    return (
        <div className="space-y-5 pb-10 animate-fade-in">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-2xl font-bold text-slate-900">帳單核對</h2><p className="mt-1 text-sm text-slate-600">選擇帳單月份，逐筆確認消費歸屬。</p></div>
                <div className="flex w-fit items-center rounded-xl border border-slate-200 bg-white p-1">
                    <button type="button" aria-label="上個月" onClick={() => changeContext(() => onMonthChange(shiftYearMonth(selectedMonth, -1)))} className="rounded-lg p-3 hover:bg-slate-100"><ChevronLeft size={18} /></button>
                    <input type="month" aria-label="帳單月份" value={selectedMonth} onChange={event => { const month = event.target.value; if (isYearMonth(month)) changeContext(() => onMonthChange(month)); }} className="w-36 min-w-0 bg-transparent px-2 py-2 text-base font-semibold" />
                    <button type="button" aria-label="下個月" onClick={() => changeContext(() => onMonthChange(shiftYearMonth(selectedMonth, 1)))} className="rounded-lg p-3 hover:bg-slate-100"><ChevronRight size={18} /></button>
                </div>
            </header>
            <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm leading-relaxed text-indigo-950"><Info size={18} className="mt-0.5 shrink-0" /><p>每筆消費只屬於一個卡別與帳單月份。舊核銷紀錄沒有帳單月份時，請人工確認；「已核對」不代表已繳費。</p></div>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <form onSubmit={saveStatement} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div><label htmlFor="statement-bank" className="mb-2 block text-sm font-semibold text-slate-700">卡別</label><select id="statement-bank" value={selectedBank} onChange={event => { const bank = event.target.value; changeContext(() => setSelectedBank(bank)); }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base"><option value="-">請選擇卡片</option>{availableBanks.map(bank => <option key={bank} value={bank}>{bank}</option>)}</select></div>
                    <div><label htmlFor="statement-amount" className="mb-2 block text-sm font-semibold text-slate-700">帳單總額 <span className="text-xs font-normal text-slate-500">依銀行帳單填寫</span></label><input id="statement-amount" type="number" step="0.01" required disabled={selectedBank === '-'} value={statementTotal} onChange={event => setStatementTotal(event.target.value)} placeholder="待輸入，零元請填 0" className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base font-number disabled:bg-slate-50" /></div>
                    <button type="submit" disabled={selectedBank === '-'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><Save size={18} />儲存帳單金額</button>
                </form>
                {selectedBank !== '-' && <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-600">{dirty ? '帳單金額尚未儲存' : savedAmount === undefined ? '尚未儲存帳單金額' : '已儲存帳單：' + money(savedAmount)}</p><label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={issued} disabled={!setting || (!issued && (savedAmount === undefined || dirty))} onChange={toggleIssued} className="h-5 w-5 rounded border-slate-300 text-indigo-600 disabled:opacity-50" />標記帳單已核結（人工）</label></div>}
            </section>
            <p role="status" aria-live="polite" className="min-h-5 text-sm text-indigo-700">{notice}</p>

            {selectedBank !== '-' ? <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-600">待核對金額</p><p className="mt-2 text-2xl font-bold font-number text-slate-900">{money(summary.candidateTotal)}</p><p className="mt-1 text-xs text-slate-500">{summary.candidates.length} 筆，含過往未核</p></div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-600">本月已核對</p><p className="mt-2 text-2xl font-bold font-number text-slate-900">{money(summary.reconciledTotal)}</p><p className="mt-1 text-xs text-slate-500">{summary.reconciled.length} 筆已指定 {selectedMonth}</p></div>
                    <div className={'rounded-2xl border p-5 ' + (complete ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white')}><p className="text-sm text-slate-600">帳單比對差額{dirty ? '（試算）' : ''}</p><p className="mt-2 text-2xl font-bold font-number text-slate-900">{difference === null ? '待輸入帳單' : money(difference)}</p><p className="mt-1 text-xs leading-relaxed text-slate-600">{complete ? '本月已核明細與帳單金額相符' : difference === 0 ? '金額相符，仍有待核對或待確認項目' : '帳單－待核候選與本月已核明細'}</p></div>
                </div>
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-200 p-4"><h3 className="font-semibold text-slate-800">{selectedBank} · {selectedMonth} 帳單明細</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">{summary.range ? '消費週期 ' + summary.range.start + ' ～ ' + summary.range.end + '；待核候選包含先前未核項目，請依銀行帳單核對。' : '尚未設定結帳日；待核清單顯示此卡全部未核明細，請先到設定填寫結帳日。'}</p></div>
                    <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">{(Object.keys(detailLabels) as DetailKind[]).map(kind => <button type="button" key={kind} aria-pressed={listKind === kind} onClick={() => setListKind(kind)} className={'rounded-lg px-3 py-2 text-sm font-medium ' + (listKind === kind ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100')}>{detailLabels[kind]} ({summary[kind].length})</button>)}</div>
                    {listKind === 'unassigned' && <p className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">這些紀錄保留原核銷時間，尚未計入任何帳單月。請查看實際帳單後，逐筆確認歸入 {selectedMonth}；不會自動推定月份。</p>}
                    {renderTransactions(summary[listKind], listKind)}
                </section>
            </> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center"><CreditCard size={30} className="mx-auto mb-3 text-slate-400" /><h3 className="font-semibold text-slate-800">選擇卡片開始核對</h3><p className="mt-2 text-sm text-slate-600">下方可先查看各卡待核與待確認紀錄。</p></section>}

            <section><h3 className="mb-3 text-lg font-semibold text-slate-800">各卡概況 · {selectedMonth}</h3><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{cardSummaries.map(card => <button type="button" key={card.bank} onClick={() => { setDetailBank(card.bank); setDetailKind(card.unassigned.length > 0 ? 'unassigned' : 'candidates'); }} className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/30">
                <span className="flex items-center justify-between gap-2 font-semibold text-slate-900"><span className="flex items-center gap-2"><CreditCard size={18} className="text-indigo-600" />{card.bank}</span><ChevronRight size={18} className="text-slate-400" /></span>
                <span className="mt-4 block text-xs text-slate-500">待核對</span><span className="mt-1 block text-2xl font-bold font-number text-slate-900">{money(card.candidateTotal)}</span><span className="mt-3 block text-xs text-slate-600">本月已核 {money(card.reconciledTotal)} · 帳單 {card.statementAmount === undefined ? '待輸入' : money(card.statementAmount)}</span>
                {card.unassigned.length > 0 && <span className="mt-2 block text-xs font-medium text-amber-700">{card.unassigned.length} 筆帳單月份待確認</span>}
            </button>)}</div>{cardSummaries.length === 0 && <p className="rounded-xl bg-white p-5 text-sm text-slate-500">尚未建立卡片，可先到設定新增卡別與結帳日。</p>}</section>

            <dialog ref={dialogRef} aria-labelledby="card-detail-title" onCancel={() => setDetailBank(null)} onClose={() => setDetailBank(null)} onClick={event => { if (event.target === event.currentTarget) setDetailBank(null); }} className="m-auto max-h-[88dvh] overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-900/50" style={{ width: 'min(48rem, calc(100vw - 2rem))' }}>
                {detailBank && detailSummary && <div><div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5"><div><h3 id="card-detail-title" className="text-lg font-semibold text-slate-900">{detailBank} 帳單明細</h3><p className="mt-1 text-sm text-slate-500">{selectedMonth} · 核對後歸入此帳單月份</p></div><button type="button" aria-label="關閉卡片明細" onClick={() => setDetailBank(null)} className="rounded-lg p-2.5 hover:bg-slate-100"><X size={20} /></button></div>
                    <div className="flex flex-wrap gap-2 p-4">{(Object.keys(detailLabels) as DetailKind[]).map(kind => <button type="button" key={kind} aria-pressed={detailKind === kind} onClick={() => setDetailKind(kind)} className={'rounded-lg px-3 py-2 text-sm ' + (detailKind === kind ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700')}>{detailLabels[kind]} ({detailSummary[kind].length})</button>)}</div>
                    <p className="px-4 pb-3 text-sm text-slate-600">本清單金額 {money(sumTransactionAmounts(detailSummary[detailKind]))}{detailKind === 'unassigned' ? ' · 請依銀行帳單確認月份' : ''}</p>
                    {renderTransactions(detailSummary[detailKind], detailKind)}
                </div>}
            </dialog>
        </div>
    );
};
export default Reconciliation;
