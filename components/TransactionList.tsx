
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Transaction, PaymentMethod, CardBank, Category } from '../types';
import { getCategoryColor } from '../constants';
import { Plus, Search, Trash2, Wand2, Calendar, Pencil, Camera, Loader2, Filter, LayoutList, ChevronDown, RefreshCcw, X } from 'lucide-react';
import { suggestCategory, parseReceiptFromImage } from '../services/geminiService';

interface TransactionListProps {
  transactions: Transaction[];
  categories: string[];
  cardBanks: string[];
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void;
  onAddTransactions: (ts: Omit<Transaction, 'id'>[], newCategories?: string[], newBanks?: string[]) => void;
  onEditTransaction: (id: string, t: Omit<Transaction, 'id'>) => void;
  onDeleteTransaction: (id: string) => void;
  onToggleReconcile: (id: string) => void;
}

const ITEMS_PER_PAGE = 25;

const TransactionList: React.FC<TransactionListProps> = ({ 
  transactions, categories, cardBanks, onAddTransaction, onAddTransactions, onEditTransaction, onDeleteTransaction, onToggleReconcile
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'month' | 'year' | 'all'>('month');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMethod, setFilterMethod] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [cardBank, setCardBank] = useState<string>('-');
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const [installments, setInstallments] = useState<number>(1);
  const [isRecurring, setIsRecurring] = useState(false);
  
  const [isAutoCategorizing, setIsAutoCategorizing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const availableYears = useMemo(() => {
    const years = transactions.map(t => t.date.split('-')[0]);
    return Array.from(new Set([new Date().getFullYear().toString(), ...years])).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const handleAutoCategorize = async () => {
    if (!description || !categories.length) return;
    setIsAutoCategorizing(true);
    try {
      const suggested = await suggestCategory(description, categories);
      if (suggested) setCategory(suggested);
    } catch (error) { console.error(error); } finally { setIsAutoCategorizing(false); }
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    try {
      const result = await parseReceiptFromImage(file);
      if (result) {
        setDate(result.date);
        setAmount(result.amount.toString());
        setDescription(result.description);
        const suggested = await suggestCategory(result.description, categories);
        if (suggested) setCategory(suggested);
      }
    } catch (error) { alert("辨識失敗"); } finally { setIsScanning(false); }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filterType === 'month' && selectedMonth && !t.date.startsWith(selectedMonth)) return false;
      if (filterType === 'year' && selectedYear && !t.date.startsWith(selectedYear)) return false;
      if (filterCategory && t.category !== filterCategory) return false;
      if (filterMethod && t.paymentMethod !== filterMethod) return false;
      const searchLower = searchTerm.toLowerCase();
      if (searchTerm && !(t.description.toLowerCase().includes(searchLower) || t.category.includes(searchTerm))) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, searchTerm, filterType, selectedMonth, selectedYear, filterCategory, filterMethod]);

  const currentTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredTransactions, currentPage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalAmount = parseFloat(amount);
    const baseTx = { paymentMethod, cardBank: paymentMethod === PaymentMethod.CREDIT_CARD ? cardBank : '-', category, isReconciled: false, isRecurring };
    if (editingId) {
        onEditTransaction(editingId, { ...baseTx, date, amount: totalAmount, description });
    } else if (isRecurring) {
        onAddTransactions(Array.from({length: 12}).map((_, i) => {
            const d = new Date(date); d.setMonth(d.getMonth() + i);
            return { ...baseTx, date: d.toISOString().split('T')[0], amount: totalAmount, description: i === 0 ? description : `${description} (固定支出)`, isRecurring: true };
        }));
    } else if (installments > 1 && paymentMethod === PaymentMethod.CREDIT_CARD) {
        const mon = Math.floor(totalAmount / installments);
        onAddTransactions(Array.from({length: installments}).map((_, i) => {
            const d = new Date(date); d.setMonth(d.getMonth() + i);
            return { ...baseTx, date: d.toISOString().split('T')[0], amount: i === 0 ? totalAmount - (mon * (installments-1)) : mon, description: `${description} (${i + 1}/${installments})` };
        }));
    } else {
        onAddTransaction({ ...baseTx, date, amount: totalAmount, description });
    }
    setIsAdding(false);
    setEditingId(null);
  };

  const openAdd = () => { setEditingId(null); setAmount(''); setDescription(''); setIsRecurring(false); setDate(new Date().toISOString().split('T')[0]); setIsAdding(true); };
  const openEdit = (t: Transaction) => { setEditingId(t.id); setDate(t.date); setAmount(t.amount.toString()); setPaymentMethod(t.paymentMethod); setCardBank(t.cardBank); setCategory(t.category); setDescription(t.description); setIsRecurring(!!t.isRecurring); setIsAdding(true); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                  type="text"
                  placeholder="搜尋消費描述..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs text-slate-700"
              />
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-2 py-1">
              <select value={filterType} onChange={e => setFilterType(e.target.value as any)} className="bg-transparent text-[10px] font-black text-slate-500 uppercase outline-none cursor-pointer">
                  <option value="month">按月</option>
                  <option value="year">按年</option>
                  <option value="all">全期</option>
              </select>
              {filterType === 'month' && (
                  <div className="relative flex items-center">
                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-white pl-2 pr-7 py-0.5 rounded-lg text-xs font-black text-indigo-600 outline-none border border-slate-200 appearance-none cursor-pointer z-10 bg-transparent" />
                    <Calendar size={12} className="absolute right-2 text-indigo-500 pointer-events-none z-0" />
                  </div>
              )}
              {filterType === 'year' && (
                  <div className="relative flex items-center">
                    <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="bg-white pl-2 pr-7 py-0.5 rounded-lg text-xs font-black text-indigo-600 outline-none border border-slate-200 appearance-none cursor-pointer z-10 bg-transparent">{availableYears.map(y => <option key={y} value={y}>{y}</option>)}</select>
                    <Calendar size={12} className="absolute right-2 text-indigo-500 pointer-events-none z-0" />
                  </div>
              )}
          </div>
          
          <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-500 outline-none">
              <option value="">所有支付</option>
              {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-500 outline-none">
              <option value="">所有分類</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-100 font-bold text-sm ml-auto">
              <Plus size={18} />
              <span>記一筆</span>
          </button>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-3xl shadow-xl border border-indigo-100 animate-fade-in relative">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><LayoutList className="text-indigo-500" /> {editingId ? '修改支出' : '新增支出'}</h3>
             <div className="flex gap-2">
                <button type="button" onClick={() => setIsRecurring(!isRecurring)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isRecurring ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                    <RefreshCcw size={14} className={isRecurring ? 'animate-spin' : ''} /> 每月固定扣款
                </button>
                <input type="file" accept="image/*" ref={receiptInputRef} className="hidden" onChange={handleReceiptUpload} />
                <button type="button" onClick={() => receiptInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors">
                    {isScanning ? <Loader2 size={14} className="animate-spin"/> : <Camera size={14} />} 辨識收據
                </button>
             </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">交易日期</label>
                    <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">金額 (TWD)</label>
                    <input required type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-xl font-black focus:ring-2 focus:ring-indigo-500/20 outline-none" placeholder="0" />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">支付方式</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none appearance-none">
                        {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">分類</label>
                    <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none appearance-none">
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>
            <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">用途說明</label>
                <div className="flex gap-2">
                    <input required type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none" placeholder="輸入消費內容..." />
                    <button type="button" onClick={handleAutoCategorize} className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors flex items-center justify-center gap-2 font-bold border border-slate-200">
                        <Wand2 size={18} className={isAutoCategorizing ? 'animate-spin' : ''} /> AI
                    </button>
                </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-2.5 text-slate-500 hover:text-slate-800 font-bold">取消</button>
              <button type="submit" className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">確認儲存</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="p-4">日期</th>
                <th className="p-4">分類</th>
                <th className="p-4">金額</th>
                <th className="p-4">說明</th>
                <th className="p-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {currentTransactions.map(t => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 text-xs text-slate-500 font-bold">{t.date}</td>
                  <td className="p-4"><span className="px-2.5 py-1 rounded-lg text-[10px] font-black text-white shadow-sm" style={{ backgroundColor: getCategoryColor(t.category) }}>{t.category}</span></td>
                  <td className="p-4"><div className="flex items-center gap-2"><span className="font-black text-slate-800">${t.amount.toLocaleString()}</span>{t.isRecurring && <span className="p-1 bg-amber-50 text-amber-500 rounded-md border border-amber-100"><RefreshCcw size={10} /></span>}</div></td>
                  <td className="p-4"><div className="flex flex-col"><span className="text-sm font-bold text-slate-700">{t.description}</span><span className="text-[10px] text-slate-400 font-bold">{t.paymentMethod} {t.cardBank !== '-' ? `(${t.cardBank})` : ''}</span></div></td>
                  <td className="p-4 text-right"><div className="flex justify-end gap-1"><button onClick={() => openEdit(t)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil size={14} /></button><button onClick={() => onDeleteTransaction(t.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={14} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </div>
  );
};

export default TransactionList;
