import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Transaction, Category, CategorySummary, CardBank, PaymentMethod } from '../types';
import { getCategoryColor } from '../constants';
import { Wallet, DollarSign, CreditCard, TrendingUp, Calendar } from 'lucide-react';

interface DashboardProps {
  transactions: Transaction[];
  budget: number;
  cardBanks: string[];
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, budget, cardBanks }) => {
  // Default to current month YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // Filter transactions based on selected month
  const monthlyTransactions = useMemo(() => {
    return transactions.filter(t => t.date.startsWith(selectedMonth));
  }, [transactions, selectedMonth]);

  // Calculate totals based on filtered data
  const totalExpense = useMemo(() => monthlyTransactions.reduce((acc, t) => acc + t.amount, 0), [monthlyTransactions]);
  const budgetProgress = Math.min((totalExpense / budget) * 100, 100);
  
  // Calculate Card Summary (Filtered by Month)
  const cardStatus = useMemo(() => {
    // Filter out "NONE" or "-"
    const cards = cardBanks.filter(c => c !== CardBank.NONE && c !== '-');
    return cards.map(bank => {
        const txs = monthlyTransactions.filter(t => t.paymentMethod === PaymentMethod.CREDIT_CARD && t.cardBank === bank);
        
        // Unbilled: Amount spent THIS MONTH that is not yet reconciled
        const unbilled = txs.filter(t => !t.isReconciled).reduce((sum, t) => sum + t.amount, 0);
        
        // Billed: Amount spent THIS MONTH that is already reconciled
        const billedRecent = txs.filter(t => t.isReconciled).reduce((sum, t) => sum + t.amount, 0);
        
        return { bank, unbilled, billedRecent };
    }).filter(c => c.unbilled > 0 || c.billedRecent > 0); // Only show active cards in this month
  }, [monthlyTransactions, cardBanks]);

  // Prepare Category Data for Pie/Bar Charts
  const categoryData: CategorySummary[] = useMemo(() => {
    const map = new Map<Category, number>();
    monthlyTransactions.forEach(t => {
      if (t.category !== '信用卡出帳') { // Exclude bill payments from expense analytics
        map.set(t.category, (map.get(t.category) || 0) + t.amount);
      }
    });
    
    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value,
      color: getCategoryColor(name)
    })).sort((a, b) => b.value - a.value);
  }, [monthlyTransactions]);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
           <h2 className="text-xl font-bold text-gray-800">財務概覽</h2>
           <p className="text-xs text-gray-500">檢視您的收支狀況</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm">
            <Calendar size={18} className="text-gray-400 ml-2" />
            <input 
                type="month" 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-sm text-gray-700 font-medium bg-transparent border-none focus:ring-0 cursor-pointer outline-none"
            />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex items-center space-x-3 mb-2">
             <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <DollarSign size={20} />
             </div>
             <p className="text-sm text-gray-500 font-medium">本月總支出</p>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-800">${totalExpense.toLocaleString()}</h3>
            <p className="text-xs text-gray-400 mt-1">
                預算剩餘: <span className={budget - totalExpense < 0 ? 'text-red-500' : 'text-green-500'}>${(budget - totalExpense).toLocaleString()}</span>
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
             <div className="flex items-center space-x-3 mb-2">
                <div className="p-2 bg-green-50 rounded-lg text-green-600">
                    <Wallet size={20} />
                </div>
                <p className="text-sm text-gray-500 font-medium">預算達成率</p>
             </div>
             <div className="w-full">
                <div className="flex items-end gap-2 mb-2">
                    <h3 className="text-2xl font-bold text-gray-800">{Math.round((totalExpense / budget) * 100)}%</h3>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                        className={`h-2.5 rounded-full ${budgetProgress > 90 ? 'bg-red-500' : budgetProgress > 75 ? 'bg-orange-400' : 'bg-green-500'}`} 
                        style={{ width: `${budgetProgress}%` }}
                    ></div>
                </div>
             </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <div className="flex items-center space-x-3 mb-2">
                <div className="p-2 bg-red-50 rounded-lg text-red-600">
                    <TrendingUp size={20} />
                </div>
                <p className="text-sm text-gray-500 font-medium">最大開銷</p>
            </div>
            <div>
                <h3 className="text-xl font-bold text-gray-800 truncate">
                {categoryData.length > 0 ? categoryData[0].name : '-'}
                </h3>
                <p className="text-xs text-gray-400">
                佔總支出 {categoryData.length > 0 ? Math.round((categoryData[0].value / totalExpense) * 100) : 0}%
                </p>
            </div>
        </div>
      </div>

      {/* Credit Card Status Widget (Grid Layout) */}
      {cardStatus.length > 0 ? (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
             <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <CreditCard size={20} />
                </div>
                <h3 className="text-lg font-bold text-gray-800">信用卡本月動態 <span className="text-xs font-normal text-gray-400 ml-1">({selectedMonth})</span></h3>
             </div>
             
             {/* Grid Layout */}
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cardStatus.map((c) => (
                    <div key={c.bank} className="flex flex-col p-4 border border-gray-100 rounded-xl bg-gray-50/50 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-gray-700">{c.bank}</span>
                        </div>
                        <div className="space-y-2">
                             <div className="flex justify-between items-baseline">
                                <span className="text-xs text-orange-600 font-medium">本月消費 (未出帳)</span>
                                <span className="text-lg font-bold text-gray-800">${c.unbilled.toLocaleString()}</span>
                             </div>
                             <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div className="bg-orange-400 h-1.5 rounded-full" style={{width: '60%'}}></div>
                             </div>
                             <div className="flex justify-between items-baseline pt-1">
                                <span className="text-xs text-gray-500">本月消費 (已出帳)</span>
                                <span className="text-sm font-semibold text-gray-500">${c.billedRecent.toLocaleString()}</span>
                             </div>
                        </div>
                    </div>
                ))}
             </div>
          </div>
      ) : (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center text-gray-400 text-sm">
            本月份無信用卡消費紀錄
        </div>
      )}

      {/* Charts Section */}
      {categoryData.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Pie Chart */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 h-80 md:h-96">
            <h3 className="text-lg font-bold text-gray-800 mb-6">消費類別分佈</h3>
            <div className="h-60 md:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                    <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    >
                    {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                    </Pie>
                    <RechartsTooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: number) => `$${value.toLocaleString()}`} 
                    />
                    <Legend layout="vertical" verticalAlign="middle" align="right" iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
                </ResponsiveContainer>
            </div>
            </div>

            {/* Bar Chart */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 h-80 md:h-96">
            <h3 className="text-lg font-bold text-gray-800 mb-6">分類支出排行</h3>
            <div className="h-60 md:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={50} tick={{fontSize: 11, fill: '#4b5563'}} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                        cursor={{fill: '#f9fafb'}} 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: number) => `$${value.toLocaleString()}`} 
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                    {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                    </Bar>
                </BarChart>
                </ResponsiveContainer>
            </div>
            </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center text-gray-400">
            <TrendingUp size={48} className="mx-auto mb-3 opacity-20" />
            <p>本月份尚無任何支出紀錄</p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;