
import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { Transaction, Category, CategorySummary, CardBank, PaymentMethod } from '../types';
import { getCategoryColor } from '../constants';
import { Wallet, DollarSign, CreditCard, TrendingUp, Calendar, ChevronDown, Banknote, X, ArrowRight } from 'lucide-react';

interface DashboardProps {
  transactions: Transaction[];
  budget: number;
  cardBanks: string[];
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, budget, cardBanks }) => {
  const [filterType, setFilterType] = useState<'month' | 'year' | 'all'>('month');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  // State for the detail popup
  const [detailView, setDetailView] = useState<{ type: 'card' | 'category', title: string } | null>(null);

  const availableYears = useMemo(() => {
    const years = transactions.map(t => t.date.split('-')[0]);
    const uniqueYears = Array.from(new Set([new Date().getFullYear().toString(), ...years]));
    return uniqueYears.sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filterType === 'month') return t.date.startsWith(selectedMonth);
      if (filterType === 'year') return t.date.startsWith(selectedYear);
      return true;
    });
  }, [transactions, filterType, selectedMonth, selectedYear]);

  const totalExpense = useMemo(() => filteredTransactions.reduce((acc, t) => acc + t.amount, 0), [filteredTransactions]);
  
  const cashTotal = useMemo(() => {
    return filteredTransactions
      .filter(t => t.paymentMethod === PaymentMethod.CASH)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const creditCardTotal = useMemo(() => {
    return filteredTransactions
      .filter(t => t.paymentMethod === PaymentMethod.CREDIT_CARD)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const effectiveBudget = useMemo(() => filterType === 'year' ? budget * 12 : budget, [budget, filterType]);
  const budgetProgress = Math.min((totalExpense / effectiveBudget) * 100, 100);
  
  const cardStatus = useMemo(() => {
    const cards = cardBanks.filter(c => c !== CardBank.NONE && c !== '-');
    return cards.map(bank => {
        const txs = filteredTransactions.filter(t => t.paymentMethod === PaymentMethod.CREDIT_CARD && t.cardBank === bank);
        const unbilled = txs.filter(t => !t.isReconciled).reduce((sum, t) => sum + t.amount, 0);
        const billedRecent = txs.filter(t => t.isReconciled).reduce((sum, t) => sum + t.amount, 0);
        return { bank, unbilled, billedRecent };
    }).filter(c => c.unbilled > 0 || c.billedRecent > 0);
  }, [filteredTransactions, cardBanks]);

  const categoryData: CategorySummary[] = useMemo(() => {
    const map = new Map<Category, number>();
    filteredTransactions.forEach(t => {
      if (t.category !== '信用卡出帳') map.set(t.category, (map.get(t.category) || 0) + t.amount);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value, color: getCategoryColor(name) })).sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  // Calculate Top 5 for the selected view
  const topTransactions = useMemo(() => {
    if (!detailView) return [];
    
    let source = [];
    if (detailView.type === 'card') {
        source = filteredTransactions.filter(t => t.paymentMethod === PaymentMethod.CREDIT_CARD && t.cardBank === detailView.title);
    } else {
        source = filteredTransactions.filter(t => t.category === detailView.title);
    }

    return source.sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [detailView, filteredTransactions]);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
           <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">財務概覽</h2>
           <p className="text-[10px] md:text-xs text-slate-500 font-medium">檢視您的消費分析與預算進度</p>
        </div>
        
        <div className="flex bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm self-end sm:self-auto">
            <div className="relative border-r border-slate-100">
              <select 
                  value={filterType} 
                  onChange={e => setFilterType(e.target.value as any)}
                  className="bg-slate-50 pl-3 pr-8 py-2 text-xs text-slate-700 font-black focus:outline-none appearance-none cursor-pointer h-full"
              >
                  <option value="month">按月</option>
                  <option value="year">按年</option>
                  <option value="all">全部</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {filterType === 'month' && (
                <div className="relative flex items-center bg-white min-w-[120px] md:min-w-[140px]">
                    <input 
                        type="month" 
                        value={selectedMonth} 
                        onChange={e => setSelectedMonth(e.target.value)} 
                        className="w-full pl-3 pr-9 py-2 text-xs text-slate-700 font-black focus:outline-none bg-transparent relative z-10 cursor-pointer" 
                    />
                    <Calendar size={14} className="absolute right-3 text-indigo-500 pointer-events-none z-0" />
                </div>
            )}
            {filterType === 'year' && (
                <div className="relative flex items-center bg-white min-w-[80px] md:min-w-[100px]">
                  <select 
                      value={selectedYear} 
                      onChange={e => setSelectedYear(e.target.value)} 
                      className="w-full pl-3 pr-8 py-2 text-xs text-slate-700 font-black focus:outline-none appearance-none cursor-pointer bg-transparent relative z-10"
                  >
                      {availableYears.map(y => <option key={y} value={y}>{y} 年</option>)}
                  </select>
                  <Calendar size={14} className="absolute right-3 text-indigo-500 pointer-events-none z-0" />
                </div>
            )}
        </div>
      </div>

      {/* Summary Cards: 2 cols on mobile, 4 cols on lg */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6">
        <div className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-4">
             <div className="p-1.5 md:p-2 bg-indigo-50 text-indigo-600 rounded-lg md:rounded-xl"><DollarSign size={14} className="md:w-5 md:h-5" /></div>
             <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest truncate">總支出</p>
          </div>
          <h3 className="text-lg md:text-3xl font-black text-slate-800">${totalExpense.toLocaleString()}</h3>
          <p className="text-[10px] text-slate-400 mt-1 font-bold">預算剩餘: <span className={effectiveBudget - totalExpense < 0 ? 'text-rose-500' : 'text-emerald-500'}>${(effectiveBudget - totalExpense).toLocaleString()}</span></p>
        </div>

        <div className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
             <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-4">
                <div className="p-1.5 md:p-2 bg-emerald-50 text-emerald-600 rounded-lg md:rounded-xl"><Wallet size={14} className="md:w-5 md:h-5" /></div>
                <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest truncate">預算達成率</p>
             </div>
             <div className="flex justify-between items-end mb-2">
                <h3 className="text-lg md:text-3xl font-black text-slate-800">{Math.round((totalExpense / effectiveBudget) * 100)}%</h3>
                <span className="text-[10px] text-slate-400 font-bold hidden md:inline">目標: ${effectiveBudget.toLocaleString()}</span>
             </div>
             <div className="w-full bg-slate-100 rounded-full h-1.5 md:h-2 overflow-hidden">
                <div className={`h-full transition-all duration-700 ${budgetProgress > 90 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${budgetProgress}%` }}></div>
             </div>
        </div>

        <div className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-4">
             <div className="p-1.5 md:p-2 bg-amber-50 text-amber-600 rounded-lg md:rounded-xl"><Banknote size={14} className="md:w-5 md:h-5" /></div>
             <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest truncate">現金支出</p>
          </div>
          <h3 className="text-lg md:text-3xl font-black text-slate-800">${cashTotal.toLocaleString()}</h3>
          <p className="text-[10px] text-slate-400 mt-1 font-bold">佔總開銷 {totalExpense > 0 ? Math.round((cashTotal/totalExpense)*100) : 0}%</p>
        </div>

        <div className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-4">
             <div className="p-1.5 md:p-2 bg-indigo-50 text-indigo-600 rounded-lg md:rounded-xl"><CreditCard size={14} className="md:w-5 md:h-5" /></div>
             <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest truncate">刷卡總計</p>
          </div>
          <h3 className="text-lg md:text-3xl font-black text-slate-800">${creditCardTotal.toLocaleString()}</h3>
          <p className="text-[10px] text-slate-400 mt-1 font-bold">目前已刷金額</p>
        </div>
      </div>

      <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
         <div className="flex items-center gap-3 mb-4 md:mb-6">
            <div className="p-2 bg-slate-900 text-white rounded-xl"><TrendingUp size={20} /></div>
            <h3 className="text-base md:text-lg font-black text-slate-800">信用卡動態分析</h3>
            <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-1 rounded-md ml-auto">點擊卡片查看排行</span>
         </div>
         {/* Credit Card Grid: 2 cols on mobile (reduced gap), 3 cols on lg */}
         <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
            {cardStatus.map((c) => (
                <div 
                    key={c.bank} 
                    onClick={() => setDetailView({ type: 'card', title: c.bank })}
                    className="p-3 md:p-4 border border-slate-100 rounded-xl md:rounded-2xl bg-slate-50/50 hover:bg-white hover:shadow-md hover:border-indigo-100 cursor-pointer transition-all group active:scale-[0.98]"
                >
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs md:text-sm font-black text-slate-700 truncate">{c.bank}</span>
                        <ArrowRight size={12} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                    </div>
                    <div className="space-y-2">
                         <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-0.5">
                            <span className="text-[9px] text-amber-600 font-black uppercase tracking-tight">未出帳</span>
                            <span className="text-base md:text-xl font-black text-slate-800">${c.unbilled.toLocaleString()}</span>
                         </div>
                         <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                            <div className="bg-amber-400 h-full rounded-full" style={{width: '100%'}}></div>
                         </div>
                         <div className="flex justify-between items-center pt-1">
                            <span className="text-[9px] text-slate-400 font-bold">本期已核</span>
                            <span className="text-[10px] font-black text-slate-400">${c.billedRecent.toLocaleString()}</span>
                         </div>
                    </div>
                </div>
            ))}
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 h-[320px] md:h-[450px] flex flex-col relative">
              <h3 className="text-base md:text-lg font-black text-slate-800 mb-4 md:mb-6 flex items-center gap-2">消費比例圖 <span className="text-[10px] font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded-full">點擊區塊</span></h3>
              <div className="flex-1 w-full" style={{ minHeight: '0' }}>
                  <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                          <Pie
                              data={categoryData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={8}
                              dataKey="value"
                              onClick={(data) => setDetailView({ type: 'category', title: data.name })}
                              className="cursor-pointer outline-none"
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                              {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity" />)}
                          </Pie>
                          <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                      </PieChart>
                  </ResponsiveContainer>
              </div>
          </div>
          {/* Category Ranking: Removed fixed height, removed scrollbar to show all items */}
          <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 h-auto min-h-[320px] flex flex-col">
              <h3 className="text-base md:text-lg font-black text-slate-800 mb-4 md:mb-6 flex items-center gap-2">分類支出排行 <span className="text-[10px] font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded-full">點擊列表</span></h3>
              <div className="w-full space-y-3">
                  {categoryData.map(item => (
                      <div 
                        key={item.name} 
                        onClick={() => setDetailView({ type: 'category', title: item.name })}
                        className="space-y-1 p-1.5 md:p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors group"
                      >
                          <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-700 flex items-center gap-2">
                                {item.name}
                                <ArrowRight size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </span>
                              <span className="text-slate-800">${item.value.toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 md:h-2 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ backgroundColor: item.color, width: `${(item.value/totalExpense)*100}%` }}></div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </div>

      {/* Detail Modal */}
      {detailView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setDetailView(null)}>
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Top 5 Highest Expenses</span>
                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            {detailView.type === 'card' ? <CreditCard size={20} className="text-indigo-500"/> : <Wallet size={20} className="text-emerald-500"/>}
                            {detailView.title}
                        </h3>
                    </div>
                    <button onClick={() => setDetailView(null)} className="p-2 bg-white rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors border border-slate-100 shadow-sm">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-2 overflow-y-auto max-h-[60vh]">
                    {topTransactions.length > 0 ? (
                        <div className="space-y-1">
                            {topTransactions.map((t, idx) => (
                                <div key={t.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-2xl transition-colors border border-transparent hover:border-slate-100">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-400 text-xs shrink-0">
                                        #{idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <span className="text-sm font-bold text-slate-800 truncate">{t.description}</span>
                                            <span className="text-sm font-black text-indigo-600 shrink-0 ml-2">${t.amount.toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                                            <span>{t.date}</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                            <span className="px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: getCategoryColor(t.category) }}>{t.category}</span>
                                            {t.paymentMethod === PaymentMethod.CREDIT_CARD && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                    <span>{t.cardBank}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-10 text-slate-400 text-sm">
                            無消費紀錄
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-center">
                    <button onClick={() => setDetailView(null)} className="text-xs font-bold text-slate-500 hover:text-slate-800">
                        關閉視窗
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
