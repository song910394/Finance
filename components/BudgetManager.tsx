
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
            loan: 40000,
            creditCards: []
        };
    }, [budgets, selectedMonth, incomeSources]);

    // 移除自動計算邏輯，改為手動輸入
    // const cardTotals = ... (removed)

    // 計算統計
    const stats = useMemo(() => {
        const incomeTotal = currentBudget.incomes.reduce((sum, i) => sum + i.amount, 0);

        // 信用卡總額改為從手動輸入的 creditCards 計算
        const cardTotal = (currentBudget.creditCards || []).reduce((sum, c) => sum + c.amount, 0);

        const expenseTotal = currentBudget.loan + cardTotal;
        const balance = currentBudget.openingBalance + incomeTotal - expenseTotal;

        return { incomeTotal, cardTotal, expenseTotal, balance };
    }, [currentBudget]);

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
        // 如果找不到該來源，新增一筆 (雖然通常不會發生，因為初始化時已建立)
        if (!newIncomes.find(i => i.sourceId === sourceId)) {
            newIncomes.push({ sourceId, amount });
        }
        updateBudget({ incomes: newIncomes });
    };

    const updateCreditCardAmount = (cardName: string, amount: number) => {
        const currentCards = currentBudget.creditCards || [];
        const newCards = currentCards.some(c => c.cardName === cardName)
            ? currentCards.map(c => c.cardName === cardName ? { ...c, amount } : c)
            : [...currentCards, { cardName, amount }];

        updateBudget({ creditCards: newCards });
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

                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-2 py-1.5 shadow-sm hover:shadow-md transition-shadow">
                    <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-colors active:scale-95 touch-target" title="上個月">
                        <ChevronLeft size={18} className="text-slate-500" />
                    </button>
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="w-[120px] px-2 py-1 text-sm text-slate-700 font-black focus:outline-none bg-transparent cursor-pointer text-center font-number"
                    />
                    <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-colors active:scale-95 touch-target" title="下個月">
                        <ChevronRight size={18} className="text-slate-500" />
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-slate-100 text-slate-600 rounded-xl group-hover:scale-110 transition-transform"><Wallet size={16} /></div>
                        <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase font-display">期初餘額</p>
                    </div>
                    <div className="relative">
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                        <input
                            type="number"
                            value={currentBudget.openingBalance || ''}
                            onChange={e => updateBudget({ openingBalance: parseFloat(e.target.value) || 0 })}
                            placeholder="0"
                            className="text-xl md:text-3xl font-black text-slate-800 bg-transparent w-full focus:outline-none pl-4 font-number"
                        />
                    </div>
                </div>

                <div className="bg-emerald-50 p-4 md:p-5 rounded-2xl shadow-sm border border-emerald-100 hover:shadow-lg hover:shadow-emerald-100/50 hover:-translate-y-1 transition-all duration-300 group">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform"><TrendingUp size={16} /></div>
                        <p className="text-[10px] md:text-xs font-black text-emerald-600 uppercase font-display">入帳小計</p>
                    </div>
                    <h3 className="text-xl md:text-3xl font-black text-emerald-700 font-number tracking-tight">${stats.incomeTotal.toLocaleString()}</h3>
                </div>

                <div className="bg-rose-50 p-4 md:p-5 rounded-2xl shadow-sm border border-rose-100 hover:shadow-lg hover:shadow-rose-100/50 hover:-translate-y-1 transition-all duration-300 group">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-rose-100 text-rose-600 rounded-xl group-hover:scale-110 transition-transform"><TrendingDown size={16} /></div>
                        <p className="text-[10px] md:text-xs font-black text-rose-600 uppercase font-display">出帳小計</p>
                    </div>
                    <h3 className="text-xl md:text-3xl font-black text-rose-700 font-number tracking-tight">${stats.expenseTotal.toLocaleString()}</h3>
                </div>

                <div className={`p-4 md:p-5 rounded-2xl shadow-sm border hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group ${stats.balance >= 0 ? 'bg-blue-50 border-blue-100 hover:shadow-blue-100/50' : 'bg-amber-50 border-amber-100 hover:shadow-amber-100/50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                        <div className={`p-2 rounded-xl group-hover:scale-110 transition-transform ${stats.balance >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}><Calculator size={16} /></div>
                        <p className={`text-[10px] md:text-xs font-black uppercase font-display ${stats.balance >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>合計</p>
                    </div>
                    <h3 className={`text-xl md:text-3xl font-black font-number tracking-tight ${stats.balance >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                        ${stats.balance.toLocaleString()}
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-1 font-bold">{stats.balance >= 0 ? '結餘' : '缺額'}</p>
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
                                <div key={source.id} className="flex items-center gap-3 p-3 bg-slate-50/50 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors group focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-200">
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
                                            className="w-28 px-3 py-2 text-right text-sm font-bold text-emerald-600 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-number"
                                        />
                                        <button
                                            onClick={() => deleteIncomeSource(source.id)}
                                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all touch-target"
                                            aria-label="刪除"
                                        >
                                            <Trash2 size={16} />
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
                        <div className="flex items-center gap-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100 hover:bg-amber-50 transition-colors focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-200">
                            <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><Home size={16} /></div>
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
                                    className="w-28 px-3 py-2 text-right text-sm font-bold text-amber-600 bg-white border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-number"
                                />
                            </div>
                        </div>

                        {/* 信用卡 - 手動輸入 */}
                        {cardBanks.filter(b => b !== '-' && b !== '其他').map(bank => {
                            // 從 currentBudget.creditCards 取得金額，若無則為 0
                            const cardData = (currentBudget.creditCards || []).find(c => c.cardName === bank);
                            const amount = cardData?.amount || 0;

                            const setting = cardSettings[bank];
                            const statementDay = setting?.statementDay;
                            const isNextMonth = setting?.isNextMonth;

                            return (
                                <div key={bank} className="flex items-center gap-3 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 hover:bg-indigo-50 transition-colors focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-200">
                                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"><CreditCard size={16} /></div>
                                    <div className="flex-1">
                                        <span className="text-sm font-bold text-slate-700">{bank}</span>
                                        {statementDay && <span className="text-[10px] text-slate-400 ml-2">{isNextMonth ? '次月' : ''}{statementDay} 日</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-400 text-sm">$</span>
                                        <input
                                            type="number"
                                            value={amount || ''}
                                            onChange={e => updateCreditCardAmount(bank, parseFloat(e.target.value) || 0)}
                                            placeholder="0"
                                            className="w-28 px-3 py-2 text-right text-sm font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-number"
                                        />
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
