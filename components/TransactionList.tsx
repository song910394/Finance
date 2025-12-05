import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Transaction, PaymentMethod, CardBank, Category } from '../types';
import { getCategoryColor } from '../constants';
import { Plus, Search, Trash2, Wand2, Calendar, Pencil, Camera, Loader2, Download, Upload, ChevronLeft, ChevronRight, X, Filter } from 'lucide-react';
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

const ITEMS_PER_PAGE = 20;

const TransactionList: React.FC<TransactionListProps> = ({ 
  transactions, 
  categories,
  cardBanks,
  onAddTransaction, 
  onAddTransactions,
  onEditTransaction,
  onDeleteTransaction,
  onToggleReconcile
}) => {
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('');
  const [filterBank, setFilterBank] = useState('');
  const [filterStatus, setFilterStatus] = useState(''); // 'all', 'reconciled', 'unreconciled'

  const [currentPage, setCurrentPage] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [cardBank, setCardBank] = useState<string>('-');
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const [installments, setInstallments] = useState<number>(1);
  
  // Logic State
  const [isAutoCategorizing, setIsAutoCategorizing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Initialize category default
  useEffect(() => {
    if (!category && categories.length > 0) {
      setCategory(categories[0]);
    }
  }, [categories, category]);

  // Filter Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // 1. Month Filter
      if (selectedMonth && !t.date.startsWith(selectedMonth)) {
        return false;
      }

      // 2. Category Filter
      if (filterCategory && t.category !== filterCategory) {
        return false;
      }

      // 3. Payment Method Filter
      if (filterPaymentMethod && t.paymentMethod !== filterPaymentMethod) {
        return false;
      }

      // 4. Bank Filter
      if (filterBank && t.cardBank !== filterBank) {
        return false;
      }

      // 5. Status Filter
      if (filterStatus) {
        if (filterStatus === 'reconciled' && !t.isReconciled) return false;
        if (filterStatus === 'unreconciled' && t.isReconciled) return false;
      }

      // 6. Search Filter (Text)
      const searchLower = searchTerm.toLowerCase();
      if (searchTerm && !(
        t.description.toLowerCase().includes(searchLower) ||
        t.category.includes(searchTerm) ||
        t.paymentMethod.includes(searchTerm) ||
        t.cardBank.includes(searchTerm)
      )) {
        return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, searchTerm, selectedMonth, filterCategory, filterPaymentMethod, filterBank, filterStatus]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  
  // Reset to page 1 when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedMonth, filterCategory, filterPaymentMethod, filterBank, filterStatus]);

  const currentTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredTransactions, currentPage]);

  const handleAutoCategorize = async () => {
    if (!description) return;
    setIsAutoCategorizing(true);
    const suggestion = await suggestCategory(description, categories);
    if (suggestion) {
      setCategory(suggestion);
    }
    setIsAutoCategorizing(false);
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    try {
      const data = await parseReceiptFromImage(file);
      if (data) {
        setDate(data.date || new Date().toISOString().split('T')[0]);
        setAmount(data.amount?.toString() || '');
        setDescription(data.description || '');
      }
    } catch (error) {
      alert('收據辨識失敗，請手動輸入');
    } finally {
      setIsScanning(false);
    }
  };

  const normalizeDate = (dateStr: string): string => {
    // Convert YYYY/M/D or M/D/YYYY to YYYY-MM-DD
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr; // Return original if parse fails
    return date.toISOString().split('T')[0];
  };

  const handleExportCSV = () => {
    const headers = ["日期", "分類", "說明", "支付方式", "金額", "卡別", "對帳狀態"];
    const rows = transactions.map(t => [
      t.date,
      t.category,
      `"${t.description.replace(/"/g, '""')}"`, // Escape quotes
      t.paymentMethod,
      t.amount,
      t.cardBank,
      t.isReconciled ? "已出帳" : "未出帳"
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `smart_ledger_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/);
      // Skip header (index 0)
      const newTxs: Omit<Transaction, 'id'>[] = [];
      const newCategories = new Set<string>();
      const newBanks = new Set<string>();
      
      // Heuristic: Assume Standard Export Format: Date, Category, Description, Method, Amount, Bank, Status
      for (let i = 1; i < lines.length; i++) {
         const line = lines[i].trim();
         if (!line) continue;
         
         // Basic regex to handle quoted CSV strings roughly
         const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/^"|"$/g, '').trim());
         
         if (cols.length < 5) continue;

         const rawDate = cols[0];
         const rawCategory = cols[1];
         const description = cols[2];
         const rawMethod = cols[3];
         const amount = parseFloat(cols[4]);
         const rawBank = cols[5];
         const isReconciled = cols[6] === "已出帳";

         const date = normalizeDate(rawDate);
         
         // Payment Method Logic
         let paymentMethod = PaymentMethod.CASH;
         if (Object.values(PaymentMethod).includes(rawMethod as PaymentMethod)) {
            paymentMethod = rawMethod as PaymentMethod;
         }

         // Card Bank Logic
         let cardBank = '-';
         if (paymentMethod === PaymentMethod.CREDIT_CARD) {
             cardBank = rawBank && rawBank !== '-' ? rawBank : '未知銀行';
             // Collect new bank if it's not in the current list
             if (cardBank !== '-' && !cardBanks.includes(cardBank)) {
                 newBanks.add(cardBank);
             }
         }

         // Category Logic
         const category = rawCategory || '其他';
         if (!categories.includes(category)) {
             newCategories.add(category);
         }

         if (date && !isNaN(amount)) {
            newTxs.push({
                date,
                category,
                description,
                paymentMethod,
                amount,
                cardBank,
                isReconciled
            });
         }
      }

      if (newTxs.length > 0) {
        // Pass discovered items to parent
        onAddTransactions(newTxs, Array.from(newCategories), Array.from(newBanks));
        alert(`成功匯入 ${newTxs.length} 筆交易！\n${newCategories.size > 0 ? `發現新分類: ${Array.from(newCategories).join(', ')}` : ''}\n${newBanks.size > 0 ? `發現新卡別: ${Array.from(newBanks).join(', ')}` : ''}`);
      } else {
        alert("匯入失敗，請確認 CSV 格式");
      }
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const openEdit = (t: Transaction) => {
    setEditingId(t.id);
    setDate(t.date);
    setAmount(t.amount.toString());
    setPaymentMethod(t.paymentMethod);
    setCardBank(t.cardBank);
    setCategory(t.category);
    setDescription(t.description);
    setInstallments(1); 
    setIsAdding(true);
  };

  const openAdd = () => {
    setEditingId(null);
    setDate(new Date().toISOString().split('T')[0]);
    setAmount('');
    setPaymentMethod(PaymentMethod.CASH);
    setCardBank('-');
    setCategory(categories[0] || '其他');
    setDescription('');
    setInstallments(1);
    setIsAdding(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalAmount = parseFloat(amount);
    
    // Base transaction object
    const baseTx = {
      paymentMethod,
      cardBank: paymentMethod === PaymentMethod.CREDIT_CARD ? cardBank : '-',
      category,
      isReconciled: false
    };

    if (editingId) {
      // Update Single Mode
      onEditTransaction(editingId, {
        ...baseTx,
        date,
        amount: totalAmount,
        description,
        isReconciled: transactions.find(t => t.id === editingId)?.isReconciled || false
      });
    } else {
      // Add Mode (Supports Installments)
      if (installments > 1 && paymentMethod === PaymentMethod.CREDIT_CARD) {
        const monthlyAmount = Math.floor(totalAmount / installments);
        const remainder = totalAmount - (monthlyAmount * installments);
        const newTxs: Omit<Transaction, 'id'>[] = [];

        for (let i = 0; i < installments; i++) {
           const txDate = new Date(date);
           txDate.setMonth(txDate.getMonth() + i);
           
           const formattedDate = txDate.toISOString().split('T')[0];
           
           newTxs.push({
             ...baseTx,
             date: formattedDate,
             amount: i === 0 ? monthlyAmount + remainder : monthlyAmount, 
             description: `${description} (分期 ${i + 1}/${installments})`
           });
        }
        onAddTransactions(newTxs);
      } else {
        // Single Add
        onAddTransaction({
          ...baseTx,
          date,
          amount: totalAmount,
          description
        });
      }
    }
    
    // Reset
    setIsAdding(false);
    setEditingId(null);
    setAmount('');
    setDescription('');
    setInstallments(1);
  };

  const goToPrevPage = () => {
    setCurrentPage(p => Math.max(1, p - 1));
  };

  const goToNextPage = () => {
    setCurrentPage(p => Math.min(totalPages, p + 1));
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header Actions */}
      <div className="flex flex-col gap-4">
        {/* Top Row: Search, Month, Add, Import/Export */}
        <div className="flex flex-wrap gap-2 w-full">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                <input
                    type="text"
                    placeholder="搜尋交易..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 placeholder-gray-500"
                />
            </div>
            
            {/* Month Filter */}
            <div className="relative min-w-[140px]">
               <input 
                  type="month" 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full pl-3 pr-2 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
               />
            </div>

             {/* Add Button */}
             <button
                onClick={openAdd}
                className="flex items-center justify-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors shadow-sm font-medium text-sm whitespace-nowrap min-w-[80px]"
            >
                <Plus size={18} />
                <span className="hidden sm:inline">記一筆</span>
                <span className="sm:hidden">新增</span>
            </button>

            {/* Import/Export */}
            <div className="flex gap-2">
                <input type="file" ref={csvInputRef} accept=".csv" className="hidden" onChange={handleImportCSV} />
                <button 
                    onClick={() => csvInputRef.current?.click()}
                    className="flex-1 min-w-[40px] flex items-center justify-center bg-white border border-gray-300 text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-xs"
                    title="匯入 CSV"
                >
                    <Upload size={16} />
                </button>
                <button 
                    onClick={handleExportCSV}
                    className="flex-1 min-w-[40px] flex items-center justify-center bg-white border border-gray-300 text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-xs"
                    title="匯出 CSV"
                >
                    <Download size={16} />
                </button>
            </div>
        </div>
        
        {/* Second Row: Detailed Filters */}
        <div className="flex flex-wrap gap-2 items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 text-gray-500 text-sm mr-2">
                <Filter size={16} />
                <span className="font-medium">篩選:</span>
            </div>
            
            {/* Category Filter */}
            <select 
                value={filterCategory} 
                onChange={e => setFilterCategory(e.target.value)} 
                className="p-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 min-w-[100px]"
            >
                <option value="">所有分類</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Payment Method Filter */}
            <select 
                value={filterPaymentMethod} 
                onChange={e => setFilterPaymentMethod(e.target.value)} 
                className="p-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 min-w-[100px]"
            >
                <option value="">所有支付方式</option>
                {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            {/* Bank Filter */}
            <select 
                value={filterBank} 
                onChange={e => setFilterBank(e.target.value)} 
                className="p-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 min-w-[100px]"
            >
                <option value="">所有卡別/帳戶</option>
                {cardBanks.filter(b => b !== '-').map(b => <option key={b} value={b}>{b}</option>)}
            </select>

            {/* Status Filter */}
            <select 
                value={filterStatus} 
                onChange={e => setFilterStatus(e.target.value)} 
                className="p-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 min-w-[100px]"
            >
                <option value="">所有對帳狀態</option>
                <option value="reconciled">已出帳 (已核對)</option>
                <option value="unreconciled">未出帳 (未核對)</option>
            </select>
            
            {/* Clear Filters */}
            {(filterCategory || filterPaymentMethod || filterBank || filterStatus) && (
                <button 
                    onClick={() => {
                        setFilterCategory('');
                        setFilterPaymentMethod('');
                        setFilterBank('');
                        setFilterStatus('');
                    }}
                    className="ml-auto text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 bg-white border border-red-200 px-2 py-1 rounded"
                >
                    <X size={12} /> 清除篩選
                </button>
            )}
        </div>
      </div>

      {/* Add/Edit Transaction Modal/Form Panel */}
      {isAdding && (
        <div className="bg-white p-5 rounded-2xl shadow-lg border border-blue-100 animate-fade-in mb-6 relative">
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-lg font-bold text-gray-800">
               {editingId ? '編輯交易' : '新增支出'}
             </h3>
             
             {!editingId && (
               <div className="flex items-center">
                 <input 
                   type="file" 
                   accept="image/*" 
                   ref={receiptInputRef} 
                   className="hidden"
                   onChange={handleReceiptUpload} 
                 />
                 <button 
                   type="button"
                   onClick={() => receiptInputRef.current?.click()}
                   disabled={isScanning}
                   className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                 >
                    {isScanning ? <Loader2 size={14} className="animate-spin"/> : <Camera size={14} />}
                    {isScanning ? '辨識中...' : '拍收據'}
                 </button>
               </div>
             )}
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">日期</label>
                    <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">金額</label>
                    <input required type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900" placeholder="0" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">支付方式</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)} className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900">
                        {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">分類</label>
                    <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900">
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {paymentMethod === PaymentMethod.CREDIT_CARD && (
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">卡別</label>
                    <select value={cardBank} onChange={e => setCardBank(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900">
                        <option value="-">-</option>
                        {cardBanks.filter(c => c !== '-').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                {!editingId && (
                    <div>
                        <label className="block text-xs font-medium text-purple-600 mb-1">刷卡分期</label>
                        <select 
                            value={installments} 
                            onChange={e => setInstallments(Number(e.target.value))} 
                            className="w-full p-2 border border-purple-200 rounded-lg bg-purple-50 text-sm focus:ring-purple-500 text-gray-900"
                        >
                            <option value={1}>不分期</option>
                            <option value={3}>3 期</option>
                            <option value={6}>6 期</option>
                            <option value={12}>12 期</option>
                        </select>
                    </div>
                )}
              </div>
            )}
            
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">用途說明</label>
              <div className="flex gap-2">
                <input 
                  required 
                  type="text" 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900" 
                  placeholder="例如：午餐自助餐"
                />
                <button 
                  type="button" 
                  onClick={handleAutoCategorize} 
                  className="p-2 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-200 transition-colors tooltip flex-shrink-0"
                  title="AI 自動分類"
                >
                  <Wand2 size={18} className={isAutoCategorizing ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => {setIsAdding(false); setEditingId(null);}} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors text-sm font-medium">取消</button>
              <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium">
                {editingId ? '更新' : '新增'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Responsive Transaction List */}
      <div className="space-y-4">
        
        {/* Mobile View: Cards */}
        <div className="md:hidden space-y-3">
            {currentTransactions.map(t => (
                <div key={t.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                            <span 
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: getCategoryColor(t.category) }}
                            ></span>
                            <span className="font-bold text-gray-800">{t.description}</span>
                        </div>
                        <span className="font-bold text-gray-900 text-lg">${t.amount.toLocaleString()}</span>
                    </div>
                    
                    <div className="flex justify-between items-end">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>{t.date}</span>
                                <span className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">{t.category}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>{t.paymentMethod}</span>
                                {t.cardBank !== '-' && <span>({t.cardBank})</span>}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                             {t.paymentMethod === PaymentMethod.CREDIT_CARD && (
                                <button 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onToggleReconcile(t.id);
                                    }}
                                    className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                                        t.isReconciled 
                                        ? 'bg-green-50 text-green-700 border-green-200' 
                                        : 'bg-gray-50 text-gray-500 border-gray-200'
                                    }`}
                                >
                                    {t.isReconciled ? '已出帳' : '未出帳'}
                                </button>
                             )}
                            <button onClick={() => openEdit(t)} className="p-1.5 text-gray-500 bg-gray-100 rounded-lg border border-gray-200 hover:bg-gray-200">
                                <Pencil size={14} />
                            </button>
                            <button onClick={() => onDeleteTransaction(t.id)} className="p-1.5 text-red-500 bg-red-50 rounded-lg border border-red-100 hover:bg-red-100">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto bg-white rounded-2xl shadow-sm border border-gray-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                <th className="p-4 font-bold">日期</th>
                <th className="p-4 font-bold">分類</th>
                <th className="p-4 font-bold">付款方式</th>
                <th className="p-4 font-bold">金額</th>
                <th className="p-4 font-bold">說明</th>
                <th className="p-4 font-bold text-center">對帳狀態</th>
                <th className="p-4 font-bold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 text-sm">
              {currentTransactions.map(t => (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors group">
                  {/* 1. Date */}
                  <td className="p-4 whitespace-nowrap text-gray-600">{t.date}</td>
                  
                  {/* 2. Category */}
                  <td className="p-4">
                    <span 
                      className="inline-block px-2 py-1 rounded-md text-xs font-semibold text-white shadow-sm"
                      style={{ backgroundColor: getCategoryColor(t.category) }}
                    >
                      {t.category}
                    </span>
                  </td>

                  {/* 3. Payment Method */}
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-800">{t.paymentMethod}</span>
                      {t.cardBank !== '-' && <span className="text-xs text-gray-500">{t.cardBank}</span>}
                    </div>
                  </td>

                  {/* 4. Amount */}
                  <td className="p-4 font-bold text-gray-900">${t.amount.toLocaleString()}</td>

                  {/* 5. Description */}
                  <td className="p-4 font-medium text-gray-700">{t.description}</td>
                  
                  {/* 6. Status */}
                  <td className="p-4 text-center">
                    {t.paymentMethod === PaymentMethod.CREDIT_CARD ? (
                        <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onToggleReconcile(t.id);
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                                t.isReconciled 
                                ? 'bg-green-100 text-green-700 border-green-200' 
                                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                            }`}
                        >
                            {t.isReconciled ? '已出帳' : '未出帳'}
                        </button>
                    ) : (
                        <span className="text-gray-300">-</span>
                    )}
                  </td>

                  {/* 7. Action */}
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openEdit(t);
                        }}
                        className="text-gray-500 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-blue-50 border border-transparent hover:border-blue-100"
                        title="編輯"
                      >
                        <Pencil size={16} />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDeleteTransaction(t.id);
                        }}
                        className="text-gray-500 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-50 border border-transparent hover:border-red-100"
                        title="刪除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {currentTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-400">
                    目前沒有符合的交易紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 py-4">
                <button 
                    onClick={goToPrevPage} 
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronLeft size={20} />
                </button>
                <span className="text-sm font-medium text-gray-700">
                    第 {currentPage} 頁 / 共 {totalPages} 頁
                </span>
                <button 
                    onClick={goToNextPage} 
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronRight size={20} />
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default TransactionList;