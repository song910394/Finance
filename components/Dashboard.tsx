import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Banknote, CalendarClock, ChevronLeft, ChevronRight, CreditCard, Plus, Wallet, X } from 'lucide-react';
import { Transaction, PaymentMethod, CardSetting } from '../types';
import { getCategoryColor } from '../constants';
import { getStatementSummary, isYearMonth, shiftYearMonth, sumTransactionAmounts } from '../utils/billing';
import { summarizeInstallments } from '../utils/installments';
import CategoryChart from './CategoryChart';

interface DashboardProps {
    transactions: Transaction[];
    budget: number;
    cardBanks: string[];
    cardSettings: Record<string, CardSetting>;
    selectedMonth: string;
    onMonthChange: (month: string) => void;
    onAddExpense: () => void;
    onOpenReconciliation: () => void;
}
type TimeFilter = 'month' | 'year' | 'all';
interface DetailView { type: 'card' | 'category'; name: string }
const money = (value: number) => '$' + value.toLocaleString('zh-TW', { maximumFractionDigits: 2 });

const Dashboard: React.FC<DashboardProps> = ({ transactions, budget, cardBanks, cardSettings, selectedMonth, onMonthChange, onAddExpense, onOpenReconciliation }) => {
    const [filterType, setFilterType] = useState<TimeFilter>('month');
    const [selectedYear, setSelectedYear] = useState(selectedMonth.slice(0, 4));
    const [excludeAgency, setExcludeAgency] = useState(true);
    const [detailView, setDetailView] = useState<DetailView | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);
    useEffect(() => { setSelectedYear(selectedMonth.slice(0, 4)); }, [selectedMonth]);
    useEffect(() => {
        const dialog = dialogRef.current;
        if (detailView && dialog && !dialog.open) dialog.showModal();
        if (!detailView && dialog?.open) dialog.close();
    }, [detailView]);

    const availableYears = useMemo(() => Array.from(new Set([selectedMonth.slice(0, 4), ...transactions.map(t => t.date.slice(0, 4))])).sort().reverse(), [transactions, selectedMonth]);
    const statsTransactions = useMemo(() => transactions.filter(t => {
        if (filterType === 'month' && !t.date.startsWith(selectedMonth)) return false;
        if (filterType === 'year' && !t.date.startsWith(selectedYear)) return false;
        return !excludeAgency || t.category !== '代買';
    }), [transactions, filterType, selectedMonth, selectedYear, excludeAgency]);
    const totalExpense = sumTransactionAmounts(statsTransactions);
    const cashTotal = sumTransactionAmounts(statsTransactions.filter(t => t.paymentMethod === PaymentMethod.CASH));
    const creditTotal = sumTransactionAmounts(statsTransactions.filter(t => t.paymentMethod === PaymentMethod.CREDIT_CARD));
    const effectiveBudget = filterType === 'year' ? budget * 12 : budget;
    const budgetPercent = filterType !== 'all' && effectiveBudget > 0 ? Math.round(totalExpense / effectiveBudget * 100) : null;
    const timeLabel = filterType === 'month' ? selectedMonth : filterType === 'year' ? selectedYear + ' 年' : '全部紀錄';

    const cardSummaries = useMemo(() => {
        const banks = Array.from(new Set([...cardBanks, ...Object.keys(cardSettings), ...transactions.map(t => t.cardBank)])).filter(bank => bank && bank !== '-');
        return banks.map(bank => ({ bank, ...getStatementSummary(transactions, bank, selectedMonth, cardSettings[bank]), statementAmount: cardSettings[bank]?.statementAmounts?.[selectedMonth] }))
            .filter(card => card.candidates.length > 0 || card.reconciled.length > 0 || card.unassigned.length > 0 || card.statementAmount !== undefined);
    }, [transactions, cardBanks, cardSettings, selectedMonth]);
    const installmentSummary = useMemo(() => summarizeInstallments(transactions, selectedMonth), [transactions, selectedMonth]);
    const categoryData = useMemo(() => {
        const categories = new Map<string, Transaction[]>();
        for (const transaction of statsTransactions) {
            const records = categories.get(transaction.category) ?? [];
            records.push(transaction); categories.set(transaction.category, records);
        }
        return Array.from(categories, ([name, records]) => ({ name, value: sumTransactionAmounts(records), count: records.length, color: getCategoryColor(name) })).sort((a, b) => b.value - a.value);
    }, [statsTransactions]);
    const canShowProportion = totalExpense > 0 && categoryData.every(category => category.value >= 0);
    const openCategory = (name: string) => setDetailView({ type: 'category', name });
    const detailedCard = detailView?.type === 'card' ? cardSummaries.find(card => card.bank === detailView.name) : undefined;
    const detailedTransactions = detailView?.type === 'category' ? statsTransactions.filter(t => t.category === detailView.name).sort((a, b) => b.amount - a.amount) : [];
    const renderRecords = (records: Transaction[], emptyText: string) => records.length ? <ul className="divide-y divide-slate-100">{records.map(transaction => <li key={transaction.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-800">{transaction.description}</p><p className="mt-1 text-xs text-slate-500">{transaction.date} · {transaction.category}</p></div><span className="shrink-0 text-sm font-semibold font-number text-slate-900">{money(transaction.amount)}</span></li>)}</ul> : <p className="py-4 text-sm text-slate-500">{emptyText}</p>;

    return (
        <div className="space-y-5 pb-10 animate-fade-in">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-2xl font-bold text-slate-900">財務概覽</h2><p className="mt-1 text-sm text-slate-600">掌握已記錄消費與預算使用情形。</p></div>
                <div className="flex w-fit items-center rounded-xl border border-slate-200 bg-white p-1">
                    <button type="button" aria-label="上個月" onClick={() => onMonthChange(shiftYearMonth(selectedMonth, -1))} className="rounded-lg p-3 hover:bg-slate-100"><ChevronLeft size={18} /></button>
                    <input type="month" aria-label="共用月份" value={selectedMonth} onChange={event => { if (isYearMonth(event.target.value)) onMonthChange(event.target.value); }} className="w-36 min-w-0 bg-transparent px-2 py-2 text-base font-semibold" />
                    <button type="button" aria-label="下個月" onClick={() => onMonthChange(shiftYearMonth(selectedMonth, 1))} className="rounded-lg p-3 hover:bg-slate-100"><ChevronRight size={18} /></button>
                </div>
            </header>

            <div className="flex flex-col gap-3 rounded-2xl bg-slate-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold">先記一筆，帳務才完整</p><p className="mt-1 text-sm text-slate-300">消費依交易日統計；帳單依已確認月份核對。</p></div>
                <button type="button" onClick={onAddExpense} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-slate-900 hover:bg-slate-100"><Plus size={18} />新增支出</button>
            </div>

            <section className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-semibold text-slate-800">消費分析 · {timeLabel}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={excludeAgency} onChange={event => setExcludeAgency(event.target.checked)} className="h-4 w-4 rounded text-indigo-600" />排除代買</label>
                        <select aria-label="消費統計期間" value={filterType} onChange={event => setFilterType(event.target.value as TimeFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="month">按月</option><option value="year">按年</option><option value="all">全部</option></select>
                        {filterType === 'year' && <select aria-label="統計年度" value={selectedYear} onChange={event => setSelectedYear(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{availableYears.map(year => <option key={year} value={year}>{year} 年</option>)}</select>}
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-600">已記錄支出</p><p className="mt-2 text-2xl font-bold font-number text-slate-900">{statsTransactions.length ? money(totalExpense) : '尚無紀錄'}</p><p className="mt-2 text-xs text-slate-500">{statsTransactions.length} 筆消費 · {excludeAgency ? '排除代買' : '包含代買'}</p></div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="flex items-center gap-2 text-sm text-slate-600"><Wallet size={16} />預算使用率</p><p className="mt-2 text-2xl font-bold font-number text-slate-900">{budgetPercent === null ? filterType === 'all' ? '不適用' : '待設定預算' : budgetPercent + '%'}</p>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="預算使用率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={budgetPercent === null ? undefined : Math.max(0, Math.min(budgetPercent, 100))}><div className={budgetPercent !== null && budgetPercent > 100 ? 'h-full bg-amber-500' : 'h-full bg-indigo-500'} style={{ width: Math.max(0, Math.min(budgetPercent ?? 0, 100)) + '%' }} /></div>
                        <p className="mt-2 text-xs text-slate-500">{filterType === 'all' ? '全部紀錄不套用單月預算' : '預算 ' + money(effectiveBudget) + (filterType === 'year' ? '（月預算 × 12）' : '')}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="flex items-center gap-2 text-sm text-slate-600"><Banknote size={16} />現金支出</p><p className="mt-2 text-2xl font-bold font-number text-slate-900">{money(cashTotal)}</p><p className="mt-2 text-xs text-slate-500">依所選期間的消費紀錄</p></div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="flex items-center gap-2 text-sm text-slate-600"><CreditCard size={16} />刷卡消費</p><p className="mt-2 text-2xl font-bold font-number text-slate-900">{money(creditTotal)}</p><p className="mt-2 text-xs text-slate-500">與銀行帳單月份分開統計</p></div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                    <h4 className="font-semibold text-slate-800">消費分類</h4>
                    {categoryData.length ? <div className="mt-4 grid grid-cols-1 items-center gap-6 md:grid-cols-[220px_1fr]">
                        <CategoryChart categories={categoryData} total={totalExpense} onSelect={openCategory} />
                        <ul className="min-w-0 space-y-2">{categoryData.map(category => <li key={category.name}><button type="button" onClick={() => openCategory(category.name)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50"><span className="flex min-w-0 items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.color }} /><span className="truncate text-sm font-medium text-slate-800">{category.name}<span className="ml-2 text-xs font-normal text-slate-500">{category.count} 筆</span></span></span><span className="shrink-0 text-sm font-semibold font-number text-slate-800">{money(category.value)}{canShowProportion && <span className="ml-2 text-xs font-normal text-slate-500">{Math.round(category.value / totalExpense * 100)}%</span>}</span></button></li>)}</ul>
                    </div> : <div className="py-10 text-center"><p className="text-sm text-slate-500">此期間尚無符合篩選條件的消費。</p><button type="button" onClick={onAddExpense} className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-indigo-700">新增第一筆支出</button></div>}
                    {categoryData.length > 0 && !canShowProportion && <p className="mt-3 text-xs text-slate-500">含負數或合計非正數，請以分類金額核對，不顯示比例。</p>}
                </div>
            </section>

            <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-lg font-semibold text-slate-800">帳單概況 · {selectedMonth}</h3><p className="mt-1 text-xs text-slate-500">依各卡帳單月份，包含代買；點卡片可查看相同基準的明細。</p></div><button type="button" onClick={onOpenReconciliation} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-700">前往核對<ArrowRight size={16} /></button></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{cardSummaries.map(card => <button type="button" key={card.bank} onClick={() => setDetailView({ type: 'card', name: card.bank })} className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-indigo-300 hover:bg-indigo-50/30">
                    <span className="flex items-center justify-between font-semibold text-slate-900"><span className="flex items-center gap-2"><CreditCard size={18} className="text-indigo-600" />{card.bank}</span><ChevronRight size={18} className="text-slate-400" /></span>
                    <span className="mt-4 block text-xs text-slate-500">待核對金額</span><span className="mt-1 block text-2xl font-bold font-number text-slate-900">{money(card.candidateTotal)}</span>
                    <span className="mt-3 block text-xs text-slate-600">本月已核 {money(card.reconciledTotal)} · 銀行帳單 {card.statementAmount === undefined ? '待輸入' : money(card.statementAmount)}</span>
                    {card.unassigned.length > 0 && <span className="mt-2 block text-xs font-medium text-amber-700">{card.unassigned.length} 筆帳單月份待確認</span>}
                    {!card.range && <span className="mt-2 block text-xs text-amber-700">結帳日待設定，待核金額含所有未核明細</span>}
                </button>)}</div>
                {cardSummaries.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">此帳單月份尚無已保存帳單或待核紀錄。</p>}
            </section>

            {(installmentSummary.groups.length > 0 || installmentSummary.unconfirmed.length > 0) && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><CalendarClock size={20} className="text-indigo-600" />分期明細</h3><p className="text-sm text-slate-600">{selectedMonth} 已記錄 {money(installmentSummary.monthlyTotal)}</p></div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">以明確分期識別與實際明細加總；核對進度不代表繳款進度，缺少明細時不推估剩餘款。</p>
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">{installmentSummary.groups.map(group => <div key={group.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words font-semibold text-slate-800">{group.name}</h4><p className="mt-1 text-xs text-slate-500">{group.cardBank} · 已記錄 {group.recordedPeriods}/{group.totalPeriods} 期</p></div><span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">{group.completeSchedule ? '明細完整' : '待補明細'}</span></div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">已記錄總額</dt><dd className="mt-1 font-semibold font-number">{money(group.recordedAmount)}</dd></div><div><dt className="text-xs text-slate-500">未核對明細金額</dt><dd className="mt-1 font-semibold font-number">{money(group.unreconciledAmount)}</dd></div><div><dt className="text-xs text-slate-500">已核對紀錄</dt><dd className="mt-1">{group.reconciledPeriods} 期</dd></div><div><dt className="text-xs text-slate-500">最後一期月份</dt><dd className="mt-1">{group.endMonth ?? '待補資料'}</dd></div></dl>
                </div>)}</div>
                {installmentSummary.unconfirmed.length > 0 && <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><summary className="cursor-pointer text-sm font-semibold text-amber-900">{installmentSummary.unconfirmed.length} 筆分期識別待確認</summary><p className="mt-2 text-xs leading-relaxed text-amber-800">這些舊紀錄或不一致資料未合併為分期計畫，原日期與金額保留。請確認來源後再補充分期識別。</p>{renderRecords(installmentSummary.unconfirmed, '')}</details>}
            </section>}

            <dialog ref={dialogRef} aria-labelledby="dashboard-detail-title" onCancel={() => setDetailView(null)} onClose={() => setDetailView(null)} onClick={event => { if (event.target === event.currentTarget) setDetailView(null); }} className="m-auto max-h-[88dvh] overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-900/50" style={{ width: 'min(42rem, calc(100vw - 2rem))' }}>
                {detailView && <div><div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5"><div><h3 id="dashboard-detail-title" className="text-lg font-semibold text-slate-900">{detailView.name} 明細</h3><p className="mt-1 text-sm text-slate-500">{detailView.type === 'card' ? selectedMonth + ' 帳單月份 · 包含代買' : timeLabel + ' · ' + (excludeAgency ? '排除代買' : '包含代買')}</p></div><button type="button" aria-label="關閉明細" onClick={() => setDetailView(null)} className="rounded-lg p-2.5 hover:bg-slate-100"><X size={20} /></button></div>
                    <div className="px-5 py-2">{detailedCard ? <><h4 className="mt-4 text-sm font-semibold text-slate-800">待核對 · {money(detailedCard.candidateTotal)}</h4>{renderRecords(detailedCard.candidates, '目前沒有待核對明細。')}<h4 className="mt-4 text-sm font-semibold text-slate-800">本月已核對 · {money(detailedCard.reconciledTotal)}</h4>{renderRecords(detailedCard.reconciled, '尚無確認歸屬本月的明細。')}{detailedCard.unassigned.length > 0 && <><h4 className="mt-4 text-sm font-semibold text-amber-800">帳單月份待確認</h4>{renderRecords(detailedCard.unassigned, '')}</>}<button type="button" onClick={() => { setDetailView(null); onOpenReconciliation(); }} className="my-4 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white">前往帳單核對</button></> : renderRecords(detailedTransactions, '此期間沒有符合條件的明細。')}</div>
                </div>}
            </dialog>
        </div>
    );
};
export default Dashboard;
