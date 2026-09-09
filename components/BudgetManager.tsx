import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Wallet, Plus, CreditCard, PiggyBank, Save, Info } from 'lucide-react';
import { Transaction, CardSetting, IncomeSource, MonthlyBudget } from '../types';
import { isYearMonth, shiftYearMonth } from '../utils/billing';
import { calculateBudgetTotals, getBudgetIncomeRows, parseBudgetAmount, parseBudgetCards } from '../utils/budget';

interface BudgetManagerProps {
    transactions: Transaction[];
    cardBanks: string[];
    cardSettings: Record<string, CardSetting>;
    incomeSources: IncomeSource[];
    budgets: MonthlyBudget[];
    onUpdateIncomeSources: (sources: IncomeSource[]) => void;
    onUpdateBudgets: (budgets: MonthlyBudget[]) => void;
    selectedMonth: string;
    onMonthChange: (month: string) => void;
    onDirtyChange?: (dirty: boolean) => void;
}
interface BudgetDraft {
    openingBalance: string; loan: string;
    incomes: Record<string, string>; cards: Record<string, string>; paid: Record<string, boolean>;
}
const amountText = (value: number | undefined) => value === undefined ? '' : String(value);
const money = (value: number) => '$' + value.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
const inputClass = 'w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right font-number text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500';

const BudgetManager: React.FC<BudgetManagerProps> = ({
    cardBanks, incomeSources, budgets, onUpdateIncomeSources, onUpdateBudgets, selectedMonth, onMonthChange, onDirtyChange,
}) => {
    const currentBudget = budgets.find(budget => budget.month === selectedMonth);
    // 同步層驗證會複製物件；來源設定變更不應清掉尚未儲存的帳務輸入。
    const budgetSignature = JSON.stringify(currentBudget ?? null);
    const [isCreating, setIsCreating] = useState(false);
    const [newIncomeName, setNewIncomeName] = useState('');
    const [showAddIncome, setShowAddIncome] = useState(false);
    const [notice, setNotice] = useState('');
    const [draft, setDraft] = useState<BudgetDraft>({ openingBalance: '', loan: '', incomes: {}, cards: {}, paid: {} });

    useEffect(() => {
        setDraft({ openingBalance: amountText(currentBudget?.openingBalance), loan: amountText(currentBudget?.loan), incomes: {}, cards: {}, paid: {} });
        setIsCreating(false);
    }, [selectedMonth, budgetSignature]);
    useEffect(() => { setNotice(''); }, [selectedMonth]);

    const incomeRows = useMemo(() => getBudgetIncomeRows(incomeSources, currentBudget), [incomeSources, currentBudget]);
    const cardRows = useMemo(() => {
        const recorded = (currentBudget?.creditCards ?? []).map((card, index) => ({ ...card, key: 'record:' + index, amount: card.amount as number | undefined }));
        for (const bank of cardBanks.filter(bank => bank !== '-' && bank !== '其他')) {
            if (!recorded.some(card => card.cardName === bank)) recorded.push({ key: 'bank:' + bank, cardName: bank, amount: undefined, isPaid: false });
        }
        return recorded;
    }, [cardBanks, currentBudget]);

    const incomeValue = (key: string, amount: number | undefined) => draft.incomes[key] ?? amountText(amount);
    const cardValue = (key: string, amount: number | undefined) => draft.cards[key] ?? amountText(amount);
    const formVisible = !!currentBudget || isCreating;
    const dirty = draft.openingBalance !== amountText(currentBudget?.openingBalance) || draft.loan !== amountText(currentBudget?.loan)
        || Object.keys(draft.incomes).length > 0 || Object.keys(draft.cards).length > 0 || Object.keys(draft.paid).length > 0;
    useEffect(() => {
        onDirtyChange?.(dirty);
        return () => onDirtyChange?.(false);
    }, [dirty, onDirtyChange]);
    const changeMonth = (month: string) => {
        if (!isYearMonth(month)) return;
        if (dirty && !window.confirm('本月帳務尚未儲存，確定要切換月份？')) return;
        onMonthChange(month);
    };

    const buildBudget = (): MonthlyBudget | undefined => {
        if (!formVisible) return undefined;
        const openingBalance = parseBudgetAmount(draft.openingBalance);
        const loan = parseBudgetAmount(draft.loan);
        const incomes = incomeRows.map(row => ({ sourceId: row.sourceId, amount: parseBudgetAmount(incomeValue(row.key, row.amount)) }));
        const creditCards = parseBudgetCards(cardRows.map(row => ({ cardName: row.cardName, amount: cardValue(row.key, row.amount), isPaid: draft.paid[row.key] ?? !!row.isPaid })));
        if (openingBalance === null || loan === null || incomes.some(row => row.amount === null) || creditCards === null) return undefined;
        return { ...currentBudget, month: selectedMonth, openingBalance, loan, incomes: incomes.map(row => ({ ...row, amount: row.amount! })), creditCards };
    };
    const previewBudget = buildBudget();
    const totals = calculateBudgetTotals(previewBudget);
    const saveBudget = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!previewBudget) { setNotice('請填妥期初餘額、入帳與貸款；卡費可留白，已填金額須為有效數字。'); return; }
        try {
            onUpdateBudgets([...budgets.filter(budget => budget.month !== selectedMonth), previewBudget]);
            setDraft({ openingBalance: amountText(previewBudget.openingBalance), loan: amountText(previewBudget.loan), incomes: {}, cards: {}, paid: {} });
            setNotice('本月帳務已更新，保存狀態請見上方。');
        } catch (error) {
            setNotice(error instanceof Error ? '未儲存：' + error.message : '帳務未儲存，請檢查輸入。');
        }
    };
    const addIncomeSource = () => {
        const name = newIncomeName.trim();
        if (!name) return;
        if (incomeSources.some(source => source.name === name)) { setNotice('已有同名來源，請使用既有來源或重新啟用。'); return; }
        try {
            onUpdateIncomeSources([...incomeSources, { id: crypto.randomUUID(), name, isActive: true }]);
            setNewIncomeName(''); setShowAddIncome(false); setNotice('入帳來源已新增，請填寫本月金額。');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : '來源未新增，請檢查輸入。');
        }
    };
    const toggleIncomeSource = (sourceId: string) => {
        try { onUpdateIncomeSources(incomeSources.map(source => source.id === sourceId ? { ...source, isActive: source.isActive === false } : source)); }
        catch (error) { setNotice(error instanceof Error ? error.message : '來源狀態未更新。'); }
    };

    return (
        <div className="space-y-5 pb-10 animate-fade-in">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-2xl font-bold text-slate-900">每月帳務</h2><p className="mt-1 text-sm text-slate-600">整理入帳、貸款與卡費，查看本月資金試算。</p></div>
                <div className="flex w-fit items-center rounded-xl border border-slate-200 bg-white p-1">
                    <button type="button" onClick={() => changeMonth(shiftYearMonth(selectedMonth, -1))} className="rounded-lg p-3 hover:bg-slate-100" aria-label="上個月"><ChevronLeft size={18} /></button>
                    <input type="month" aria-label="帳務月份" value={selectedMonth} onChange={event => changeMonth(event.target.value)} className="w-36 min-w-0 bg-transparent px-2 py-2 text-base font-semibold" />
                    <button type="button" onClick={() => changeMonth(shiftYearMonth(selectedMonth, 1))} className="rounded-lg p-3 hover:bg-slate-100" aria-label="下個月"><ChevronRight size={18} /></button>
                </div>
            </header>
            <div className="compact-note flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm text-indigo-950">
                <Info size={18} className="mt-0.5 shrink-0" /><p className="leading-relaxed">卡費可留白，試算僅計入已填卡費。未填不代表零元。本頁採人工金額：期初餘額＋入帳－貸款－卡費。消費紀錄、對帳帳單及上月結餘不會自動帶入；「已繳費」只作註記，不會再次扣款。</p>
            </div>
            {!formVisible ? (
                <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                    <Wallet size={32} className="mx-auto mb-3 text-slate-400" /><h3 className="text-lg font-semibold text-slate-800">{selectedMonth} 尚未建立帳務</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">期初餘額、入帳與支出尚待輸入，現在不判定結餘或缺額。</p>
                    <button type="button" onClick={() => setIsCreating(true)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700"><Plus size={18} />建立本月帳務</button>
                </section>
            ) : (
                <form onSubmit={saveBudget} className="space-y-5">
                    <div className="summary-grid summary-grid-three">
                        {[{ label: '入帳小計', value: totals?.incomeTotal }, { label: '出帳小計', value: totals?.expenseTotal }, { label: '結餘試算', value: totals?.balance }].map(item => (
                            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3">
                                <p className="text-sm text-slate-600">{item.label}</p><p className="mt-2 text-2xl font-bold font-number text-slate-900">{item.value === undefined ? '待補資料' : money(item.value)}</p>
                                <p className="mt-1 text-xs text-slate-500">{dirty || !currentBudget ? '尚未儲存的試算' : '依本頁已填金額計算'}{incomeRows.some(row => row.isOrphan) ? '・含待確認來源' : ''}</p>
                            </div>
                        ))}
                    </div>
                    <div className="opening-balance rounded-xl border border-slate-200 bg-white p-3">
                        <label htmlFor="budget-opening" className="mb-2 block text-sm font-semibold text-slate-800">期初餘額</label>
                        <input id="budget-opening" type="number" step="0.01" required value={draft.openingBalance} onChange={event => setDraft(previous => ({ ...previous, openingBalance: event.target.value }))} placeholder="期初餘額" className={inputClass + ' max-w-sm'} />
                        <p className="mt-2 text-xs text-slate-500">請依實際資金填寫，不會自動接續上月。</p>
                    </div>
                    <div className="ledger-grid">
                        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="mb-4 flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><PiggyBank size={20} className="text-emerald-600" />入帳</h3><button type="button" onClick={() => setShowAddIncome(!showAddIncome)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"><Plus size={16} />新增來源</button></div>
                            {showAddIncome && <div className="mb-4 flex flex-wrap gap-2 rounded-xl bg-slate-50 p-3"><input aria-label="新入帳來源名稱" value={newIncomeName} onChange={event => setNewIncomeName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addIncomeSource(); } }} placeholder="入帳來源名稱" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base" /><button type="button" onClick={addIncomeSource} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">新增</button></div>}
                            <div className="space-y-3">
                                {incomeRows.map(row => {
                                    const id = 'income-' + row.key.replace(':', '-');
                                    const unsavedNewAmount = row.amount === undefined && incomeValue(row.key, row.amount) !== '';
                                    return <div key={row.key} className="income-row border-b border-slate-200 py-2 last:border-b-0">
                                        <div className="mb-2 flex items-start justify-between gap-2"><label htmlFor={id} className="min-w-0 text-sm font-semibold text-slate-800">{row.name}{!row.isActive && <span className="ml-2 text-xs font-normal text-slate-500">已停用・保留本月紀錄</span>}{row.isOrphan && <span className="mt-1 block break-all text-xs font-normal text-amber-700">來源連結待確認：{row.sourceId}</span>}</label>
                                            {!row.isOrphan && <button type="button" disabled={unsavedNewAmount} onClick={() => toggleIncomeSource(row.sourceId)} title={unsavedNewAmount ? '請先儲存金額，再停用來源' : undefined} className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">{row.isActive ? '停用' : '啟用'}</button>}
                                        </div>
                                        <input id={id} type="number" step="0.01" required value={incomeValue(row.key, row.amount)} onChange={event => setDraft(previous => ({ ...previous, incomes: { ...previous.incomes, [row.key]: event.target.value } }))} placeholder="金額，無則填 0" className={inputClass} />
                                    </div>;
                                })}
                                {incomeRows.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">尚無入帳來源，可新增後填寫金額。</p>}
                            </div>
                            {incomeSources.some(source => source.isActive === false) && <details className="mt-4 text-sm text-slate-600"><summary className="cursor-pointer rounded-lg py-2">管理已停用來源</summary><div className="mt-2 space-y-2">{incomeSources.filter(source => source.isActive === false).map(source => <div key={source.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><span>{source.name}</span><button type="button" onClick={() => toggleIncomeSource(source.id)} className="rounded-lg px-3 py-2 font-medium text-indigo-700">重新啟用</button></div>)}</div></details>}
                        </section>
                        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
                            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800"><CreditCard size={20} className="text-indigo-600" />出帳</h3>
                            <div className="space-y-3">
                                <div className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3 border-b border-slate-200 py-2"><label htmlFor="budget-loan" className="text-sm font-semibold text-slate-800">本月貸款金額</label><input id="budget-loan" type="number" step="0.01" required value={draft.loan} onChange={event => setDraft(previous => ({ ...previous, loan: event.target.value }))} placeholder="金額" className={inputClass} /></div>
                                {cardRows.map(row => {
                                    const id = 'card-' + row.key.replace(':', '-');
                                    return <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-x-3 gap-y-1 border-b border-slate-200 py-2 last:border-b-0">
                                        <label htmlFor={id} className="min-w-0 break-words text-sm font-semibold text-slate-800">{row.cardName} 卡費{!cardBanks.includes(row.cardName) && <span className="ml-2 text-xs font-normal text-amber-700">保留歷史卡別</span>}</label>
                                        <input id={id} type="number" step="0.01" value={cardValue(row.key, row.amount)} onChange={event => setDraft(previous => ({ ...previous, cards: { ...previous.cards, [row.key]: event.target.value } }))} placeholder="可留白" className={inputClass} />
                                        <label className="col-span-2 inline-flex min-h-11 cursor-pointer items-center justify-self-end gap-2 text-xs text-slate-600"><input type="checkbox" disabled={!cardValue(row.key, row.amount).trim()} checked={!!cardValue(row.key, row.amount).trim() && (draft.paid[row.key] ?? !!row.isPaid)} onChange={event => setDraft(previous => ({ ...previous, paid: { ...previous.paid, [row.key]: event.target.checked } }))} className="h-5 w-5 rounded border-slate-300 text-indigo-600" />已繳費（人工註記）</label>
                                    </div>;
                                })}
                            </div>
                        </section>
                    </div>
                    <div className="save-strip flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-600">卡費可留白後儲存；試算只計入已填卡費。</p><button type="submit" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700"><Save size={18} />{currentBudget ? '儲存本月帳務' : '建立並儲存'}</button></div>
                </form>
            )}
            <p role="status" aria-live="polite" className="min-h-5 text-sm text-indigo-700">{notice}</p>
        </div>
    );
};
export default BudgetManager;
