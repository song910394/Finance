
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Transaction, PaymentMethod, CardBank, Category } from '../types';
import { getCategoryColor } from '../constants';
import { Plus, Search, Trash2, Calendar, Pencil, LayoutList, ChevronDown, RefreshCcw, X, SplitSquareVertical, Download, Upload, ChevronLeft, ChevronRight, CreditCard, Wallet } from 'lucide-react';
import * as XLSX from 'xlsx';

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

const ITEMS_PER_PAGE = 20;

const TransactionList: React.FC<TransactionListProps> = ({
    transactions, categories, cardBanks, onAddTransaction, onAddTransactions, onEditTransaction, onDeleteTransaction, onToggleReconcile
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'month' | 'year' | 'all'>('month');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [filterCategory, setFilterCategory] = useState('');
    const [filterMethod, setFilterMethod] = useState('');
    const [filterBank, setFilterBank] = useState('');

    const [currentPage, setCurrentPage] = useState(1);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CREDIT_CARD);
    const [cardBank, setCardBank] = useState<string>('台新');
    const [category, setCategory] = useState<string>('');
    const [description, setDescription] = useState('');
    const [installments, setInstallments] = useState<string>('3');
    const [isRecurring, setIsRecurring] = useState(false);
    const [isInstallment, setIsInstallment] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const availableYears = useMemo(() => {
        const years = transactions.map(t => t.date.split('-')[0]);
        return Array.from(new Set([new Date().getFullYear().toString(), ...years])).sort((a, b) => b.localeCompare(a));
    }, [transactions]);

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterType, selectedMonth, selectedYear, filterCategory, filterMethod, filterBank]);

    const handleExport = () => {
        const dataToExport = transactions.map(t => ({
            '日期': t.date,
            '類別': t.category,
            '金額': t.amount,
            '說明': t.description,
            '支付方式': t.paymentMethod,
            '銀行': t.cardBank !== '-' ? t.cardBank : '',
            '核銷狀態': t.isReconciled ? '已核銷' : '未核銷',
            '固定支出': t.isRecurring ? '是' : '否',
            '分期付款': t.isInstallment ? '是' : '否'
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "記帳明細");
        XLSX.writeFile(wb, `記帳明細_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);

            const newTransactions: Omit<Transaction, 'id'>[] = data.map((row: any) => ({
                date: row['日期'] || new Date().toISOString().split('T')[0],
                category: row['類別'] || '其他',
                amount: parseFloat(row['金額']) || 0,
                description: row['說明'] || '匯入項目',
                paymentMethod: (Object.values(PaymentMethod).includes(row['支付方式']) ? row['支付方式'] : PaymentMethod.CASH) as PaymentMethod,
                cardBank: row['銀行'] || '-',
                isReconciled: row['核銷狀態'] === '已核銷',
                isRecurring: row['固定支出'] === '是',
                isInstallment: row['分期付款'] === '是'
            }));

            onAddTransactions(newTransactions);
            if (fileInputRef.current) fileInputRef.current.value = '';
            alert(`成功匯入 ${newTransactions.length} 筆資料`);
        };
        reader.readAsBinaryString(file);
    };

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            if (filterType === 'month' && selectedMonth && !t.date.startsWith(selectedMonth)) return false;
            if (filterType === 'year' && selectedYear && !t.date.startsWith(selectedYear)) return false;
            if (filterCategory && t.category !== filterCategory) return false;
            if (filterMethod && t.paymentMethod !== filterMethod) return false;
            if (filterBank && t.cardBank !== filterBank) return false;
            const searchLower = searchTerm.toLowerCase();
            if (searchTerm && !(t.description.toLowerCase().includes(searchLower) || t.category.includes(searchTerm))) return false;
            return true;
        }).sort((a, b) => b.date.localeCompare(a.date));
    }, [transactions, searchTerm, filterType, selectedMonth, selectedYear, filterCategory, filterMethod, filterBank]);

    const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);

    const currentTransactions = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredTransactions, currentPage]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const totalAmount = parseFloat(amount);
        const bankToUse = paymentMethod === PaymentMethod.CREDIT_CARD ? cardBank : '-';
        const useRecurring = isRecurring && !isInstallment;
        const useInstallment = isInstallment && !isRecurring && paymentMethod === PaymentMethod.CREDIT_CARD;

        const baseTx = {
            paymentMethod,
            cardBank: bankToUse,
            category,
            isReconciled: false,
            isRecurring: useRecurring,
            isInstallment: useInstallment
        };

        if (editingId) {
            onEditTransaction(editingId, { ...baseTx, date, amount: totalAmount, description });
        } else if (useRecurring) {
            onAddTransactions(Array.from({ length: 12 }).map((_, i) => {
                const d = new Date(date); d.setMonth(d.getMonth() + i);
                return { ...baseTx, date: d.toISOString().split('T')[0], amount: totalAmount, description: i === 0 ? description : `${description} (固定支出)` };
            }));
        } else if (useInstallment) {
            const count = parseInt(installments) || 1;
            if (count > 1) {
                const perPeriod = Math.floor(totalAmount / count);
                const remainder = totalAmount % count;
                onAddTransactions(Array.from({ length: count }).map((_, i) => {
                    const d = new Date(date); d.setMonth(d.getMonth() + i);
                    const currentAmount = i === 0 ? perPeriod + remainder : perPeriod;
                    return {
                        ...baseTx,
                        date: d.toISOString().split('T')[0],
                        amount: currentAmount,
                        description: `${description} (${i + 1}/${count})`
                    };
                }));
            } else {
                onAddTransaction({ ...baseTx, date, amount: totalAmount, description });
            }
        } else {
            onAddTransaction({ ...baseTx, date, amount: totalAmount, description });
        }
        setIsAdding(false);
        setEditingId(null);
    };

    const openAdd = () => {
        setEditingId(null);
        setAmount('');
        setPaymentMethod(PaymentMethod.CREDIT_CARD);
        setCardBank('台新');
        setDescription('');
        setIsRecurring(false);
        setIsInstallment(false);
        setDate(new Date().toISOString().split('T')[0]);
        // Default to first available category if not set
        if (!category && categories.length > 0) setCategory(categories[0]);
        setIsAdding(true);
    };

    const openEdit = (t: Transaction) => {
        setEditingId(t.id);
        setDate(t.date);
        setAmount(t.amount.toString());
        setPaymentMethod(t.paymentMethod);
        setCardBank(t.cardBank);
        setCategory(t.category);
        setDescription(t.description);
        setIsRecurring(!!t.isRecurring);
        setIsInstallment(!!t.isInstallment);
        setIsAdding(true);
    };

    return (
        <div className="space-y-4 md:space-y-6">
            <div className="flex flex-wrap gap-3 items-center bg-white p-3 md:p-4 rounded-3xl border border-slate-100 shadow-sm">
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
                {/* Mobile Filter Toggles - Simple Dropdowns for space saving */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-2 py-1">
                    <select value={filterType} onChange={e => setFilterType(e.target.value as any)} className="bg-transparent text-[10px] font-black text-slate-500 uppercase outline-none cursor-pointer">
                        <option value="month">按月</option>
                        <option value="year">按年</option>
                        <option value="all">全期</option>
                    </select>
                    {filterType === 'month' && (
                        <div className="relative flex items-center">
                            <button
                                onClick={() => {
                                    const d = new Date(selectedMonth + '-01');
                                    d.setMonth(d.getMonth() - 1);
                                    setSelectedMonth(d.toISOString().slice(0, 7));
                                }}
                                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                                title="上個月"
                            >
                                <ChevronLeft size={14} className="text-slate-500" />
                            </button>
                            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-white px-1 py-0.5 rounded-lg text-xs font-black text-indigo-600 outline-none border border-slate-200 appearance-none cursor-pointer w-[90px] text-center" />
                            <button
                                onClick={() => {
                                    const d = new Date(selectedMonth + '-01');
                                    d.setMonth(d.getMonth() + 1);
                                    setSelectedMonth(d.toISOString().slice(0, 7));
                                }}
                                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                                title="下個月"
                            >
                                <ChevronRight size={14} className="text-slate-500" />
                            </button>
                        </div>
                    )}
                    {filterType === 'year' && (
                        <div className="relative flex items-center">
                            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="bg-white pl-2 pr-7 py-0.5 rounded-lg text-xs font-black text-indigo-600 outline-none border border-slate-200 appearance-none cursor-pointer z-10 bg-transparent">{availableYears.map(y => <option key={y} value={y}>{y}</option>)}</select>
                            <Calendar size={12} className="absolute right-2 text-indigo-500 pointer-events-none z-0" />
                        </div>
                    )}
                </div>

                {/* Hidden on very small screens, shown on md+ or wrapped */}
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                    <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-500 outline-none flex-shrink-0">
                        <option value="">所有支付</option>
                        {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>

                    <select value={filterBank} onChange={e => setFilterBank(e.target.value)} className="px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-600 outline-none flex-shrink-0">
                        <option value="">所有銀行</option>
                        {cardBanks.filter(b => b !== '-').map(b => <option key={b} value={b}>{b}</option>)}
                    </select>

                    <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-500 outline-none flex-shrink-0">
                        <option value="">所有分類</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <div className="hidden md:block h-8 w-px bg-slate-200 mx-1"></div>

                <div className="flex gap-2 w-full md:w-auto justify-end">
                    <button onClick={handleExport} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-100" title="匯出 Excel">
                        <Download size={18} />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleImport} accept=".xlsx, .xls" className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors border border-blue-100" title="匯入 Excel">
                        <Upload size={18} />
                    </button>
                    <button onClick={openAdd} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-100 font-bold text-sm ml-auto">
                        <Plus size={18} />
                        <span>新增支出</span>
                    </button>
                </div>
            </div>

            {isAdding && (
                <div className="fixed inset-0 z-50 flex items-start justify-center p-2 md:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-fade-in">
                    <div className="bg-white w-full max-w-2xl rounded-2xl md:rounded-3xl shadow-2xl relative my-4 md:my-auto">
                        <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl md:rounded-t-3xl sticky top-0 z-10">
                            <h3 className="text-base md:text-lg font-black text-slate-800 flex items-center gap-2"><LayoutList className="text-indigo-500" size={18} /> {editingId ? '修改支出' : '新增支出'}</h3>
                            <button type="button" onClick={() => setIsAdding(false)} className="p-1.5 md:p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4 md:p-6">
                            <div className="flex flex-wrap justify-end gap-2 mb-3">
                                <button type="button" onClick={() => { setIsRecurring(!isRecurring); setIsInstallment(false); }} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${isRecurring ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                    <RefreshCcw size={12} className={isRecurring ? 'animate-spin' : ''} /> 每月固定
                                </button>
                                {paymentMethod === PaymentMethod.CREDIT_CARD && (
                                    <button type="button" onClick={() => { setIsInstallment(!isInstallment); setIsRecurring(false); }} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${isInstallment ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                        <SplitSquareVertical size={12} /> 分期
                                    </button>
                                )}
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-3 md:space-y-5">
                                <div className="grid grid-cols-2 gap-3 md:gap-5">
                                    <div className="space-y-1">
                                        <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">交易日期</label>
                                        <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2.5 md:p-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">金額 (TWD)</label>
                                        <input required type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2.5 md:p-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-lg md:text-xl font-black focus:ring-2 focus:ring-indigo-500/20 outline-none" placeholder="0" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
                                    <div className="space-y-1">
                                        <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">支付方式</label>
                                        <select value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value as PaymentMethod); if (e.target.value !== PaymentMethod.CREDIT_CARD) setIsInstallment(false); }} className="w-full p-2.5 md:p-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none appearance-none">
                                            {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    {paymentMethod === PaymentMethod.CREDIT_CARD && (
                                        <div className="space-y-1 animate-in slide-in-from-left-2">
                                            <label className="text-[10px] md:text-xs font-black text-indigo-400 uppercase tracking-widest">刷卡銀行</label>
                                            <select value={cardBank} onChange={e => setCardBank(e.target.value)} className="w-full p-2.5 md:p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-700 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none appearance-none">
                                                {cardBanks.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div className={`space-y-1 ${paymentMethod !== PaymentMethod.CREDIT_CARD ? 'col-span-1' : ''}`}>
                                        <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">分類</label>
                                        <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-2.5 md:p-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none appearance-none">
                                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {isInstallment && (
                                    <div className="space-y-1.5 animate-in slide-in-from-right-2 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                                        <label className="text-[10px] md:text-xs font-black text-indigo-500 uppercase tracking-widest">分期設定</label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-600">總期數:</span>
                                            <input type="number" min="2" max="60" value={installments} onChange={e => setInstallments(e.target.value)} className="w-16 p-1.5 bg-white border border-indigo-200 rounded-lg text-center text-sm font-black text-indigo-600" />
                                            <span className="text-xs text-slate-400">期</span>
                                            <div className="flex-1 text-right text-xs text-slate-500">
                                                每期約 <span className="font-bold text-slate-800">${(parseFloat(amount) / parseInt(installments) || 0).toFixed(0)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">用途說明</label>
                                    <input required type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2.5 md:p-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none" placeholder="輸入消費內容..." />
                                </div>
                                <div className="flex justify-end gap-2 pt-3 md:pt-4 border-t border-slate-100 pb-safe">
                                    <button type="button" onClick={() => setIsAdding(false)} className="px-4 md:px-6 py-2 md:py-2.5 text-slate-500 hover:text-slate-800 font-bold text-sm">取消</button>
                                    <button type="submit" className="px-6 md:px-8 py-2 md:py-2.5 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all text-sm">確認儲存</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="hidden md:block bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                <div className="flex-1 overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                            <tr>
                                <th className="p-4 whitespace-nowrap">日期</th>
                                <th className="p-4 whitespace-nowrap">卡別</th>
                                <th className="p-4 whitespace-nowrap">分類</th>
                                <th className="p-4 whitespace-nowrap">金額</th>
                                <th className="p-4 min-w-[200px]">說明</th>
                                <th className="p-4 whitespace-nowrap">對帳</th>
                                <th className="p-4 text-right whitespace-nowrap">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {currentTransactions.map(t => (
                                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="p-4 text-xs text-slate-500 font-bold whitespace-nowrap">{t.date}</td>
                                    <td className="p-4 whitespace-nowrap"><span className="text-xs font-bold text-slate-600">{t.cardBank}</span></td>
                                    <td className="p-4 whitespace-nowrap"><span className="px-2.5 py-1 rounded-lg text-[10px] font-black text-white shadow-sm" style={{ backgroundColor: getCategoryColor(t.category) }}>{t.category}</span></td>
                                    <td className="p-4 whitespace-nowrap"><div className="flex items-center gap-2"><span className="font-black text-slate-800">${t.amount.toLocaleString()}</span>{t.isRecurring && <span className="p-1 bg-amber-50 text-amber-500 rounded-md border border-amber-100"><RefreshCcw size={10} /></span>}{t.isInstallment && <span className="p-1 bg-indigo-50 text-indigo-500 rounded-md border border-indigo-100"><SplitSquareVertical size={10} /></span>}</div></td>
                                    <td className="p-4"><div className="flex flex-col"><span className="text-sm font-bold text-slate-700">{t.description}</span><span className="text-[10px] text-slate-400 font-bold">{t.paymentMethod}</span></div></td>
                                    <td className="p-4 whitespace-nowrap">{t.paymentMethod === PaymentMethod.CREDIT_CARD && t.isReconciled ? (<span className="px-2 py-1 rounded-lg text-[10px] font-black text-white bg-emerald-500">已對帳</span>) : (<span className="text-slate-300">-</span>)}</td>
                                    <td className="p-4 text-right whitespace-nowrap"><div className="flex justify-end gap-1"><button onClick={() => openEdit(t)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil size={14} /></button><button onClick={() => onDeleteTransaction(t.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={14} /></button></div></td>
                                </tr>
                            ))}
                            {currentTransactions.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-12 text-slate-400 text-sm font-medium">
                                        沒有符合條件的資料
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls (Desktop) */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft size={16} /> 上一頁
                        </button>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                            第 <span className="text-indigo-600 text-sm mx-1">{currentPage}</span> / {totalPages} 頁
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            下一頁 <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* Mobile Card View (Visible on small screens) */}
            <div className="md:hidden space-y-2 pb-20">
                {currentTransactions.length > 0 ? (
                    currentTransactions.map(t => (
                        <div key={t.id} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-1.5">
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col gap-1 w-[70%]">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-black text-slate-400">{t.date.slice(5)}</span>
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black text-white shadow-sm" style={{ backgroundColor: getCategoryColor(t.category) }}>{t.category}</span>
                                        {t.paymentMethod === PaymentMethod.CREDIT_CARD ? (
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded"><CreditCard size={10} /> {t.cardBank}</span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded"><Wallet size={10} /> 現金</span>
                                        )}
                                        {t.paymentMethod === PaymentMethod.CREDIT_CARD && t.isReconciled && (
                                            <span className="text-[10px] font-black text-white bg-emerald-500 px-1.5 py-0.5 rounded">已對帳</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-sm font-bold text-slate-800 truncate">{t.description}</span>
                                        {t.isRecurring && <span className="p-0.5 bg-amber-50 text-amber-500 rounded border border-amber-100"><RefreshCcw size={10} /></span>}
                                        {t.isInstallment && <span className="p-0.5 bg-indigo-50 text-indigo-500 rounded border border-indigo-100"><SplitSquareVertical size={10} /></span>}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                    <span className="text-base font-black text-slate-800">${t.amount.toLocaleString()}</span>
                                    <div className="flex gap-1">
                                        <button onClick={() => openEdit(t)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"><Pencil size={14} /></button>
                                        <button onClick={() => onDeleteTransaction(t.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-10 text-slate-400 text-sm font-medium bg-white rounded-2xl border border-slate-100">
                        沒有符合條件的資料
                    </div>
                )}

                {/* Pagination Controls (Mobile) */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="flex items-center justify-center w-8 h-8 bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-50"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-xs font-black text-slate-400">
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="flex items-center justify-center w-8 h-8 bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-50"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TransactionList;
