
import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { Transaction, Category, CategorySummary, CardBank, PaymentMethod } from '../types';
import { getCategoryColor } from '../constants';
import { Wallet, DollarSign, CreditCard, TrendingUp, Calendar, ChevronDown, Banknote } from 'lucide-react';

interface DashboardProps {
  transactions: Transaction[];
  budget: number;
  cardBanks: string[];
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, budget, cardBanks }) => {
  const [filterType, setFilterType] = useState<'month' | 'year' | 'all'>('month');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

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

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
           <h2 className="text-2xl font-black text-slate-800 tracking-tight">財務概覽</h2>
           <p className="text-xs text-slate-500 font-medium">檢視您的消費分析與預算進度</p>
        </div>
        
        <div className="flex bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
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
                <div className="relative flex items-center bg-white min-w-[140px]">
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
                <div className="relative flex items-center bg-white min-w-[100px]">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
             <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><DollarSign size={20} /></div>
             <p className="text-xs font-black text-slate-400 uppercase tracking-widest">總支出 (不含對帳項)</p>
          </div>
          <h3 className="text-3xl font-black text-slate-800">${totalExpense.toLocaleString()}</h3>
          <p className="text-[10px] text-slate-400 mt-1 font-bold">預算剩餘: <span className={effectiveBudget - totalExpense < 0 ? 'text-rose-500' : 'text-emerald-500'}>${(effectiveBudget - totalExpense).toLocaleString()}</span></p>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
             <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Wallet size={20} /></div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">預算達成率</p>
             </div>
             <div className="flex justify-between items-end mb-2">
                <h3 className="text-3xl font-black text-slate-800">{Math.round((totalExpense / effectiveBudget) * 100)}%</h3>
                <span className="text-[10px] text-slate-400 font-bold">目標: ${effectiveBudget.toLocaleString()}</span>
             </div>
             <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className={`h-full transition-all duration-700 ${budgetProgress > 90 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${budgetProgress}%` }}></div>
             </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
             <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Banknote size={20} /></div>
             <p className="text-xs font-black text-slate-400 uppercase tracking-widest">現金 支出</p>
          </div>
          <h3 className="text-3xl font-black text-slate-800">${cashTotal.toLocaleString()}</h3>
          <p className="text-[10px] text-slate-400 mt-1 font-bold">佔總開銷 {totalExpense > 0 ? Math.round((cashTotal/totalExpense)*100) : 0}%</p>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
             <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><CreditCard size={20} /></div>
             <p className="text-xs font-black text-slate-400 uppercase tracking-widest">刷卡總計</p>
          </div>
          <h3 className="text-3xl font-black text-slate-800">${creditCardTotal.toLocaleString()}</h3>
          <p className="text-[10px] text-slate-400 mt-1 font-bold">目前已刷金額</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
         <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-slate-900 text-white rounded-xl"><TrendingUp size={20} /></div>
            <h3 className="text-lg font-black text-slate-800">信用卡動態分析</h3>
         </div>
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cardStatus.map((c) => (
                <div key={c.bank} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 hover:bg-white hover:shadow-md transition-all group">
                    <span className="text-sm font-black text-slate-700 block mb-3">{c.bank}</span>
                    <div className="space-y-3">
                         <div className="flex justify-between items-end">
                            <span className="text-[10px] text-amber-600 font-black uppercase">待核對 (未出帳)</span>
                            <span className="text-xl font-black text-slate-800">${c.unbilled.toLocaleString()}</span>
                         </div>
                         <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-amber-400 h-full rounded-full" style={{width: '100%'}}></div>
                         </div>
                         <div className="flex justify-between items-center pt-1">
                            <span className="text-[10px] text-slate-400 font-bold">本期已核銷</span>
                            <span className="text-xs font-black text-slate-400">${c.billedRecent.toLocaleString()}</span>
                         </div>
                    </div>
                </div>
            ))}
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-[450px] flex flex-col">
              <h3 className="text-lg font-black text-slate-800 mb-6">消費比例圖</h3>
              {/* Fix for Recharts width(-1) warning: Added inline styles to container */}
              <div className="flex-1 w-full" style={{ minHeight: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                          <Pie
                              data={categoryData}
                              cx="50%"
                              cy="50%"
                              innerRadius={70}
                              outerRadius={100}
                              paddingAngle={8}
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                              {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                          </Pie>
                      </PieChart>
                  </ResponsiveContainer>
              </div>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-[450px] overflow-hidden flex flex-col">
              <h3 className="text-lg font-black text-slate-800 mb-6">分類支出排行</h3>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  {categoryData.map(item => (
                      <div key={item.name} className="space-y-1.5">
                          <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-700">{item.name}</span>
                              <span className="text-slate-800">${item.value.toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ backgroundColor: item.color, width: `${(item.value/totalExpense)*100}%` }}></div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </div>
    </div>
  );
};

export default Dashboard;
