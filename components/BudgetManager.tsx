
import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Wallet, Plus, Trash2, DollarSign, TrendingUp, TrendingDown, Calculator, CreditCard, Home, PiggyBank } from 'lucide-react';
import { Transaction, PaymentMethod, CardSetting, IncomeSource, MonthlyBudget } from '../types';

interface BudgetManagerProps {
    transactions: Transaction[];
    cardBanks: string[];
    cardSettings: Record<string, CardSetting>;
    incomeSources: IncomeSource[];
    budgets: MonthlyBudget[];
    onUpdateIncomeSources: (sources: IncomeSource[]) => void;
    onUpdateBudgets: (budgets: MonthlyBudget[]) => void;
}

const DEFAULT_INCOME_SOURCES: IncomeSource[] = [
    { id: '1', name: '姑姑給', defaultDay: undefined },
    { id: '2', name: '媽媽給', defaultDay: undefined },
    { id: '3', name: '薪水入帳', defaultDay: 6 },
    { id: '4', name: '哩婆給', defaultDay: undefined },
];

const BudgetManager: React.FC<BudgetManagerProps> = ({
    transactions, cardBanks, cardSettings, incomeSources, budgets, onUpdateIncomeSources, onUpdateBudgets
}) => {
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [showAddIncome, setShowAddIncome] = useState(false);
    const [newIncomeName, setNewIncomeName] = useState('');

    // 取得或建立當月預算資料
    const currentBudget = useMemo(() => {
        const found = budgets.find(b => b.month === selectedMonth);
        if (found) return found;
        // 建立預設資料
        return {
            month: selectedMonth,
            openingBalance: 0,
            incomes: incomeSources.map(s => ({ sourceId: s.id, amount: 0 })),
            loan: 40000
        };
    }, [budgets, selectedMonth, incomeSources]);

    // 計算各信用卡在週期內的已核銷金額
    // 邏輯：帳務月份 YYYY-MM，需要根據每張卡的結帳日和 isNextMonth 決定應抓取哪個月份的對帳資料
    // - 當月結帳 (isNextMonth=false)：選擇1月時，顯示結帳日在1月的帳單
    // - 次月結帳 (isNextMonth=true)：選擇1月時，顯示結帳日在1月的帳單（但這是上月消費週期的帳單）
    const cardTotals = useMemo(() => {
        const result: Record<string, number> = {};
        const banks = cardBanks.filter(b => b !== '-' && b !== '其他');

        // 取得選擇的月份資訊
        const [baseYear, baseMonth] = selectedMonth.split('-').map(Number);

        banks.forEach(bank => {
            const setting = cardSettings[bank];
            const statementDay = setting?.statementDay || 0;
            const isNextMonth = setting?.isNextMonth || false;

            // 對於所有卡片，我們想要知道「在選擇的月份中，結帳日那天的帳單金額」
            // 這個帳單的週期是：上月 statementDay+1 ~ 本月 statementDay
            // 不需要調整月份，因為我們直接計算 selectedMonth 的 statementDay 結帳日

            // 使用與對帳頁面相同的週期計算邏輯
            // 週期範圍：上月 statementDay+1 日 到 本月 statementDay 日
            if (statementDay > 0) {
                const endDate = new Date(baseYear, baseMonth - 1, statementDay);
                const startDate = new Date(baseYear, baseMonth - 2, statementDay + 1);

                const start = startDate.toISOString().split('T')[0];
                const end = endDate.toISOString().split('T')[0];

                const total = transactions
                    .filter(t => {
                        if (t.paymentMethod !== PaymentMethod.CREDIT_CARD) return false;
                        if (t.cardBank !== bank) return false;
                        if (!t.isReconciled) return false;

                        // 只計算在週期內的已核銷交易
                        return t.date >= start && t.date <= end;
                    })
                    .reduce((sum, t) => sum + t.amount, 0);

                result[bank] = total;
            } else {
                // 如果沒有設定結帳日，預設為 0
                result[bank] = 0;
            }
        });

        return result;
    }, [transactions, cardBanks, cardSettings, selectedMonth]);

    // 計算統計
    const stats = useMemo(() => {
        const incomeTotal = currentBudget.incomes.reduce((sum, i) => sum + i.amount, 0);
        const cardTotal = Object.values(cardTotals).reduce((sum: number, v: number) => sum + v, 0);
        const expenseTotal = currentBudget.loan + cardTotal;
        const balance = currentBudget.openingBalance + incomeTotal - expenseTotal;

        return { incomeTotal, cardTotal, expenseTotal, balance };
    }, [currentBudget, cardTotals]);

    // 更新預算資料
    const updateBudget = (updates: Partial<MonthlyBudget>) => {
        const newBudget = { ...currentBudget, ...updates };
        const newBudgets = budgets.filter(b => b.month !== selectedMonth);
        newBudgets.push(newBudget);
        onUpdateBudgets(newBudgets);
    };

    const updateIncomeAmount = (sourceId: string, amount: number) => {
        const newIncomes = currentBudget.incomes.map(i =>
            i.sourceId === sourceId ? { ...i, amount } : i
        );
        // 如果找不到該來源，新增一筆
        if (!newIncomes.find(i => i.sourceId === sourceId)) {
            newIncomes.push({ sourceId, amount });
        }
        updateBudget({ incomes: newIncomes });
    };

    const addIncomeSource = () => {
        if (!newIncomeName.trim()) return;
        const newSource: IncomeSource = {
            id: Date.now().toString(),
            name: newIncomeName.trim()
        };
        onUpdateIncomeSources([...incomeSources, newSource]);
        setNewIncomeName('');
        setShowAddIncome(false);
    };

    const deleteIncomeSource = (id: string) => {
        if (!confirm('確定要刪除此入帳來源？')) return;
        onUpdateIncomeSources(incomeSources.filter(s => s.id !== id));
    };

    const prevMonth = () => {
        const d = new Date(selectedMonth + '-01');
        d.setMonth(d.getMonth() - 1);
        setSelectedMonth(d.toISOString().slice(0, 7));
    };

    const nextMonth = () => {
        const d = new Date(selectedMonth + '-01');
        d.setMonth(d.getMonth() + 1);
        setSelectedMonth(d.toISOString().slice(0, 7));
    };

    return (
        <div className="space-y-4 md:space-y-6 animate-fade-in pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">帳務管理</h2>
                    <p className="text-[10px] md:text-xs text-slate-500 font-medium">追蹤每月入帳與信用卡出帳</p>
                </div>

                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-2 py-1.5 shadow-sm">
                    <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="上個月">
                        <ChevronLeft size={18} className="text-slate-500" />
                    </button>
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="w-[120px] px-2 py-1 text-sm text-slate-700 font-black focus:outline-none bg-transparent cursor-pointer text-center"
                    />
                    <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="下個月">
                        <ChevronRight size={18} className="text-slate-500" />
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
                <div className="bg-white p-3 md:p-5 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg"><Wallet size={14} /></div>
                        <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase">期初餘額</p>
                    </div>
                    <input
                        type="number"
                        value={currentBudget.openingBalance || ''}
                        onChange={e => updateBudget({ openingBalance: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="text-lg md:text-2xl font-black text-slate-800 bg-transparent w-full focus:outline-none"
                    />
                </div>

                <div className="bg-emerald-50 p-3 md:p-5 rounded-2xl shadow-sm border border-emerald-100">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg"><TrendingUp size={14} /></div>
                        <p className="text-[10px] md:text-xs font-black text-emerald-600 uppercase">入帳小計</p>
                    </div>
                    <h3 className="text-lg md:text-2xl font-black text-emerald-700">${stats.incomeTotal.toLocaleString()}</h3>
                </div>

                <div className="bg-rose-50 p-3 md:p-5 rounded-2xl shadow-sm border border-rose-100">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg"><TrendingDown size={14} /></div>
                        <p className="text-[10px] md:text-xs font-black text-rose-600 uppercase">出帳小計</p>
                    </div>
                    <h3 className="text-lg md:text-2xl font-black text-rose-700">${stats.expenseTotal.toLocaleString()}</h3>
                </div>

                <div className={`p-3 md:p-5 rounded-2xl shadow-sm border ${stats.balance >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
                    <div className="flex items-center gap-2 mb-2">
                        <div className={`p-1.5 rounded-lg ${stats.balance >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}><Calculator size={14} /></div>
                        <p className={`text-[10px] md:text-xs font-black uppercase ${stats.balance >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>合計</p>
                    </div>
                    <h3 className={`text-lg md:text-2xl font-black ${stats.balance >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                        ${stats.balance.toLocaleString()}
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-1">{stats.balance >= 0 ? '結餘' : '缺額'}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* Income Section */}
                <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base md:text-lg font-black text-slate-800 flex items-center gap-2">
                            <PiggyBank className="text-emerald-500" size={20} />
                            入帳
                        </h3>
                        <button
                            onClick={() => setShowAddIncome(!showAddIncome)}
                            className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    {showAddIncome && (
                        <div className="flex gap-2 mb-4 p-3 bg-slate-50 rounded-xl">
                            <input
                                type="text"
                                value={newIncomeName}
                                onChange={e => setNewIncomeName(e.target.value)}
                                placeholder="新入帳來源名稱..."
                                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                onKeyDown={e => e.key === 'Enter' && addIncomeSource()}
                            />
                            <button onClick={addIncomeSource} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold">新增</button>
                        </div>
                    )}

                    <div className="space-y-3">
                        {incomeSources.map(source => {
                            const incomeData = currentBudget.incomes.find(i => i.sourceId === source.id);
                            return (
                                <div key={source.id} className="flex items-center gap-3 p-3 bg-slate-50/50 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors group">
                                    <div className="flex-1">
                                        <span className="text-sm font-bold text-slate-700">{source.name}</span>
                                        {source.defaultDay && <span className="text-[10px] text-slate-400 ml-2">每月 {source.defaultDay} 日</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-400 text-sm">$</span>
                                        <input
                                            type="number"
                                            value={incomeData?.amount || ''}
                                            onChange={e => updateIncomeAmount(source.id, parseFloat(e.target.value) || 0)}
                                            placeholder="0"
                                            className="w-24 px-2 py-1.5 text-right text-sm font-bold text-emerald-600 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                        />
                                        <button
                                            onClick={() => deleteIncomeSource(source.id)}
                                            className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {incomeSources.length === 0 && (
                            <p className="text-center py-6 text-slate-400 text-sm">點擊 + 新增入帳來源</p>
                        )}
                    </div>
                </div>

                {/* Expense Section */}
                <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-base md:text-lg font-black text-slate-800 flex items-center gap-2 mb-4">
                        <CreditCard className="text-rose-500" size={20} />
                        出帳
                    </h3>

                    <div className="space-y-3">
                        {/* 貸款 */}
                        <div className="flex items-center gap-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Home size={14} /></div>
                            <div className="flex-1">
                                <span className="text-sm font-bold text-slate-700">貸款</span>
                                <span className="text-[10px] text-slate-400 ml-2">每月 28 日</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-slate-400 text-sm">$</span>
                                <input
                                    type="number"
                                    value={currentBudget.loan || ''}
                                    onChange={e => updateBudget({ loan: parseFloat(e.target.value) || 0 })}
                                    placeholder="0"
                                    className="w-24 px-2 py-1.5 text-right text-sm font-bold text-amber-600 bg-white border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                />
                            </div>
                        </div>

                        {/* 信用卡 - 自動帶入 */}
                        {cardBanks.filter(b => b !== '-' && b !== '其他').map(bank => {
                            const total = cardTotals[bank] || 0;
                            const setting = cardSettings[bank];
                            const statementDay = setting?.statementDay;
                            const isNextMonth = setting?.isNextMonth;
                            return (
                                <div key={bank} className="flex items-center gap-3 p-3 bg-indigo-50/30 rounded-xl border border-indigo-100/50 hover:bg-indigo-50/50 transition-colors">
                                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><CreditCard size={14} /></div>
                                    <div className="flex-1">
                                        <span className="text-sm font-bold text-slate-700">{bank}</span>
                                        {statementDay && <span className="text-[10px] text-slate-400 ml-2">{isNextMonth ? '次月' : ''}{statementDay} 日</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 text-[10px] font-bold rounded ${total > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                            自動
                                        </span>
                                        <span className="text-sm font-black text-indigo-600 w-20 text-right">
                                            ${total.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BudgetManager;
