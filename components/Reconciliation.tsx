import React, { useState, useMemo, useRef } from 'react';
import { Transaction, PaymentMethod, CardBank } from '../types';
import { CheckCircle2, AlertCircle, FileText, Calculator, Upload, ArrowRight, PlusCircle, RefreshCw, Camera, Loader2, ScanLine, X, ChevronRight } from 'lucide-react';
import { parseBillFromImage } from '../services/geminiService';

interface ReconciliationProps {
  transactions: Transaction[];
  onToggleReconcile: (id: string) => void;
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void;
  cardBanks: string[];
}

interface ImportedItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  matchedTransactionId?: string; // If found in ledger
  status: 'matched' | 'missing' | 'mismatch';
}

const Reconciliation: React.FC<ReconciliationProps> = ({ transactions, onToggleReconcile, onAddTransaction, cardBanks }) => {
  // Mode: 'manual' (existing) or 'import' (CSV) or 'ocr' (Image/PDF)
  const [mode, setMode] = useState<'manual' | 'import' | 'ocr'>('manual');

  // Manual Mode State
  const [selectedBank, setSelectedBank] = useState<string>('-');
  const [billStartDate, setBillStartDate] = useState('');
  const [billEndDate, setBillEndDate] = useState('');
  const [statementTotal, setStatementTotal] = useState<string>('');

  // Import/OCR Mode State
  const [importedItems, setImportedItems] = useState<ImportedItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  // Card Detail View State
  const [selectedCardDetail, setSelectedCardDetail] = useState<string | null>(null);

  // --- Logic for Manual Mode ---
  const candidateTransactions = useMemo(() => {
    if (selectedBank === '-' || !billStartDate || !billEndDate) return [];
    
    return transactions.filter(t => 
      t.paymentMethod === PaymentMethod.CREDIT_CARD &&
      t.cardBank === selectedBank &&
      t.date >= billStartDate &&
      t.date <= billEndDate
    ).sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions, selectedBank, billStartDate, billEndDate]);

  const selectedTransactionsTotal = candidateTransactions
    .filter(t => t.isReconciled)
    .reduce((sum, t) => sum + t.amount, 0);
  
  const targetTotal = parseFloat(statementTotal) || 0;
  const discrepancy = targetTotal - selectedTransactionsTotal;
  const isMatch = Math.abs(discrepancy) < 1 && targetTotal > 0;

  // --- Logic for CSV Import ---

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    // Simple heuristic parser
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    const newItems: ImportedItem[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        // Skip potential headers
        if (i < 3 && (lines[i].toLowerCase().includes('date') || lines[i].toLowerCase().includes('金額'))) continue;

        const cols = lines[i].split(',').map(c => c.trim().replace(/["']/g, ''));
        
        let dateStr = '';
        let amount = 0;
        let desc = '';

        // Find Date
        const dateCol = cols.find(c => c.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/));
        if (dateCol) dateStr = dateCol.replace(/\//g, '-');

        // Find Amount
        const amountCol = cols.find(c => !isNaN(parseFloat(c)) && c.length > 0 && c !== dateCol);
        if (amountCol) amount = Math.abs(parseFloat(amountCol));

        // Find Description
        const descCol = cols.reduce((a, b) => a.length > b.length ? a : b, '');
        if (descCol) desc = descCol;

        if (dateStr && amount > 0) {
            newItems.push({
                id: `import-${i}`,
                date: dateStr,
                amount: amount,
                description: desc,
                status: 'missing'
            });
        }
    }
    matchWithLedger(newItems);
  };

  // --- Logic for OCR Scan ---

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    try {
        const result = await parseBillFromImage(file);
        
        const newItems: ImportedItem[] = result.map((item, index) => ({
            id: `ocr-${index}-${Date.now()}`,
            date: item.date,
            description: item.description,
            amount: parseFloat(item.amount),
            status: 'missing'
        }));

        matchWithLedger(newItems);
    } catch (error) {
        alert("OCR 辨識失敗，請重試");
        console.error(error);
    } finally {
        setIsScanning(false);
    }
  };

  // --- Shared Matching Logic ---

  const matchWithLedger = (items: ImportedItem[]) => {
      const processed = items.map(item => {
          // Find closest match in ledger
          const match = transactions.find(t => {
              const timeDiff = Math.abs(new Date(t.date).getTime() - new Date(item.date).getTime());
              const daysDiff = timeDiff / (1000 * 3600 * 24);
              return (
                  !t.isReconciled && // Only match unreconciled
                  Math.abs(t.amount - item.amount) < 1 && // Fuzzy amount match
                  daysDiff <= 3 // Date tolerance
              );
          });

          return {
              ...item,
              matchedTransactionId: match?.id,
              status: (match ? 'matched' : 'missing') as ImportedItem['status']
          };
      });
      setImportedItems(processed);
  };

  const handleConfirmMatch = (item: ImportedItem) => {
      if (item.matchedTransactionId) {
          onToggleReconcile(item.matchedTransactionId);
          // Update local state
          setImportedItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'matched', matchedTransactionId: undefined } : i));
      }
  };

  const handleAddMissing = (item: ImportedItem) => {
      onAddTransaction({
          date: item.date,
          amount: item.amount,
          description: item.description || '匯入交易',
          paymentMethod: PaymentMethod.CREDIT_CARD,
          cardBank: selectedBank !== '-' ? selectedBank : '其他',
          category: '其他',
          isReconciled: true
      });
       setImportedItems(prev => prev.filter(i => i.id !== item.id));
  };


  const cardSummary = cardBanks.filter(c => c !== '-').map(bank => {
    const cardTxns = transactions.filter(t => t.paymentMethod === PaymentMethod.CREDIT_CARD && t.cardBank === bank);
    const unbilledTxns = cardTxns.filter(t => !t.isReconciled);
    const unbilledAmount = unbilledTxns.reduce((sum, t) => sum + t.amount, 0);
    const billedAmount = cardTxns.filter(t => t.isReconciled).reduce((sum, t) => sum + t.amount, 0);

    return {
      bank,
      totalCount: cardTxns.length,
      unbilledCount: unbilledTxns.length,
      unbilledAmount,
      billedAmount,
    };
  }).filter(group => group.totalCount > 0);

  // Detail View Helper
  const getDetailTransactions = () => {
    if (!selectedCardDetail) return { billed: [], unbilled: [] };
    const all = transactions.filter(t => t.paymentMethod === PaymentMethod.CREDIT_CARD && t.cardBank === selectedCardDetail)
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return {
        billed: all.filter(t => t.isReconciled),
        unbilled: all.filter(t => !t.isReconciled)
    };
  };

  const { billed, unbilled } = getDetailTransactions();

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* 1. Interactive Bill Matcher Section */}
      <div className="bg-white rounded-2xl shadow-md border border-blue-100 overflow-hidden">
        <div className="p-6 bg-blue-50 border-b border-blue-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
             <div className="flex items-center gap-3">
                <div className="bg-blue-600 text-white p-2 rounded-lg">
                    <Calculator size={20} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-gray-800">帳單對帳工具</h3>
                    <p className="text-sm text-blue-600">選擇比對方式以開始核對信用卡帳單</p>
                </div>
             </div>

             {/* Mode Toggles */}
             <div className="flex bg-white rounded-lg p-1 border border-blue-200 shadow-sm">
                <button 
                    onClick={() => setMode('manual')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'manual' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <Calculator size={14} /> 手動
                </button>
                <button 
                    onClick={() => setMode('import')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'import' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <FileText size={14} /> CSV匯入
                </button>
                <button 
                    onClick={() => setMode('ocr')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'ocr' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <Camera size={14} /> OCR掃描
                </button>
             </div>
        </div>
        
        {/* --- MANUAL MODE UI --- */}
        {mode === 'manual' && (
            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Controls */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">選擇銀行</label>
                        <select 
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={selectedBank}
                            onChange={(e) => setSelectedBank(e.target.value)}
                        >
                            <option value="-">請選擇信用卡...</option>
                            {cardBanks.filter(c => c !== '-').map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">開始日期</label>
                            <input type="date" value={billStartDate} onChange={e => setBillStartDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">結束日期</label>
                            <input type="date" value={billEndDate} onChange={e => setBillEndDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">帳單應繳總金額</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                            <input 
                                type="number" 
                                placeholder="0"
                                value={statementTotal} 
                                onChange={e => setStatementTotal(e.target.value)} 
                                className="w-full pl-7 p-2 border border-gray-300 rounded-lg font-mono text-lg font-semibold" 
                            />
                        </div>
                    </div>

                    {/* Result Card */}
                    {selectedBank !== '-' && (
                        <div className={`p-4 rounded-xl border-2 ${isMatch ? 'border-green-100 bg-green-50' : 'border-orange-100 bg-orange-50'}`}>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-gray-600">勾選項目總和:</span>
                                <span className="font-bold text-gray-800">${selectedTransactionsTotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-200/50">
                                <span className="text-sm font-medium text-gray-600">差額:</span>
                                <span className={`font-mono font-bold text-lg ${discrepancy === 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {discrepancy > 0 ? '+' : ''}{discrepancy.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Transaction Check List */}
                <div className="lg:col-span-2 bg-gray-50 rounded-xl border border-gray-200 flex flex-col h-96">
                    <div className="p-3 border-b border-gray-200 bg-gray-100 font-medium text-xs text-gray-500 flex justify-between">
                        <span>交易明細 ({candidateTransactions.length} 筆)</span>
                        <span>請勾選確認屬於本期帳單的項目</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {candidateTransactions.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <FileText size={48} className="mb-2 opacity-20" />
                                <p>請選擇條件以載入交易</p>
                            </div>
                        ) : (
                            candidateTransactions.map(t => (
                                <div 
                                    key={t.id} 
                                    onClick={() => onToggleReconcile(t.id)}
                                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                                        t.isReconciled 
                                            ? 'bg-white border-blue-300 shadow-sm' 
                                            : 'bg-gray-100 border-transparent opacity-60 hover:opacity-100 hover:bg-white'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                            t.isReconciled ? 'bg-blue-600 border-blue-600' : 'border-gray-400'
                                        }`}>
                                            {t.isReconciled && <CheckCircle2 size={14} className="text-white" />}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-800 text-sm">{t.description}</p>
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <span>{t.date}</span>
                                                <span className="px-1.5 py-0.5 bg-gray-200 rounded text-[10px]">{t.category}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className={`font-mono font-bold ${t.isReconciled ? 'text-blue-700' : 'text-gray-400'}`}>
                                        ${t.amount.toLocaleString()}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* --- IMPORT & OCR MODE UI --- */}
        {(mode === 'import' || mode === 'ocr') && (
            <div className="p-6">
                {importedItems.length === 0 ? (
                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 flex flex-col items-center justify-center text-gray-500 bg-gray-50 relative">
                        {isScanning ? (
                            <div className="flex flex-col items-center animate-pulse">
                                <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
                                <h4 className="text-lg font-semibold text-gray-700">AI 正在讀取帳單...</h4>
                                <p className="text-sm text-gray-400">這可能需要幾秒鐘</p>
                            </div>
                        ) : (
                            <>
                                {mode === 'import' ? <Upload size={48} className="mb-4 text-gray-400" /> : <ScanLine size={48} className="mb-4 text-gray-400" />}
                                
                                <h4 className="text-lg font-semibold mb-2">
                                    {mode === 'import' ? '上傳帳單 CSV' : 'OCR 智慧掃描'}
                                </h4>
                                <p className="text-sm mb-6 text-center max-w-sm">
                                    {mode === 'import' 
                                        ? '請上傳包含日期、金額與說明欄位的 CSV 檔案'
                                        : '請上傳實體帳單照片或 PDF 電子帳單，AI 將自動辨識交易明細'
                                    }
                                </p>
                                
                                {/* CSV Input */}
                                <input 
                                    type="file" 
                                    accept=".csv,.txt" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    onChange={handleCsvUpload} 
                                />
                                {/* OCR Input */}
                                <input 
                                    type="file" 
                                    accept="image/*,application/pdf" 
                                    ref={ocrInputRef} 
                                    className="hidden" 
                                    onChange={handleOcrUpload} 
                                />

                                <div className="mb-4">
                                    <label className="block text-xs font-semibold text-gray-500 mb-1 text-center">要歸屬的銀行 (若需補登)</label>
                                    <select 
                                        className="p-2 border border-gray-300 rounded-lg text-sm"
                                        value={selectedBank}
                                        onChange={(e) => setSelectedBank(e.target.value)}
                                    >
                                        <option value="-">選擇銀行...</option>
                                        {cardBanks.filter(c => c !== '-').map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <button 
                                    onClick={() => mode === 'import' ? fileInputRef.current?.click() : ocrInputRef.current?.click()}
                                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium flex items-center gap-2"
                                >
                                    {mode === 'import' ? <FileText size={18} /> : <Camera size={18} />}
                                    {mode === 'import' ? '選擇 CSV 檔案' : '上傳圖片/PDF'}
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold text-gray-700">
                                {mode === 'import' ? 'CSV 解析結果' : 'OCR 辨識結果'} 
                                <span className="text-gray-400 text-sm ml-2">({importedItems.length} 筆)</span>
                            </h4>
                            <button 
                                onClick={() => { setImportedItems([]); }}
                                className="text-sm text-gray-500 hover:text-red-500 flex items-center gap-1"
                            >
                                <RefreshCw size={14} /> 清除重來
                            </button>
                        </div>
                        
                        <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                            <div className="grid grid-cols-12 bg-gray-50 p-3 text-xs font-semibold text-gray-500 border-b">
                                <div className="col-span-5 pl-2">匯入項目</div>
                                <div className="col-span-2 text-center">狀態</div>
                                <div className="col-span-5 text-right pr-2">匹配與操作</div>
                            </div>
                            <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-100">
                                {importedItems.map((item, idx) => {
                                    const matchedTx = item.matchedTransactionId 
                                        ? transactions.find(t => t.id === item.matchedTransactionId) 
                                        : null;

                                    return (
                                        <div key={idx} className="grid grid-cols-12 p-4 items-center hover:bg-gray-50 transition-colors text-sm">
                                            {/* Import Side */}
                                            <div className="col-span-5">
                                                <p className="font-medium text-gray-800">{item.description}</p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {item.date} · <span className="font-mono font-bold text-blue-600">${item.amount}</span>
                                                </p>
                                            </div>

                                            {/* Status Icon */}
                                            <div className="col-span-2 flex justify-center">
                                                {item.matchedTransactionId ? (
                                                    <ArrowRight className="text-green-500" size={20} />
                                                ) : (
                                                    <div className="px-2 py-1 bg-orange-100 text-orange-600 rounded-full text-xs whitespace-nowrap">
                                                        未匹配
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Side */}
                                            <div className="col-span-5 text-right flex justify-end items-center gap-3">
                                                {matchedTx ? (
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-xs text-gray-500">找到記帳: {matchedTx.description}</span>
                                                        <button 
                                                            onClick={() => handleConfirmMatch(item)}
                                                            className="mt-1 px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 transition-colors flex items-center gap-1"
                                                        >
                                                            <CheckCircle2 size={12} /> 確認並核銷
                                                        </button>
                                                    </div>
                                                ) : item.status === 'matched' ? (
                                                     <span className="text-green-600 text-xs font-bold flex items-center gap-1 justify-end">
                                                        <CheckCircle2 size={14} /> 已核對
                                                     </span>
                                                ) : (
                                                    <button 
                                                        onClick={() => handleAddMissing(item)}
                                                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors flex items-center gap-1 ml-auto"
                                                    >
                                                        <PlusCircle size={14} /> 新增至記帳
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}
      </div>

      {/* 2. Overview Cards (Clickable) */}
      <div>
        <h3 className="text-xl font-bold text-gray-800 mt-8 mb-4">各卡概況速覽 <span className="text-xs font-normal text-gray-500 ml-2">(點擊卡片可查看詳細清單)</span></h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cardSummary.map(card => (
                <div 
                  key={card.bank} 
                  onClick={() => setSelectedCardDetail(card.bank)}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-all transform hover:-translate-y-1 group"
                >
                    <div className="p-6 bg-gradient-to-r from-gray-800 to-gray-700 text-white relative">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-xl font-bold tracking-wide">{card.bank} 信用卡</h3>
                            <CreditCardIcon />
                        </div>
                        <div className="mt-4">
                            <p className="text-xs text-gray-300 uppercase tracking-wider">目前未出帳總額</p>
                            <p className="text-3xl font-bold mt-1">${card.unbilledAmount.toLocaleString()}</p>
                        </div>
                        <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-white/20 p-1 rounded-full"><ChevronRight size={16} /></div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 border-b border-gray-100 divide-x divide-gray-100 bg-gray-50">
                        <div className="p-4 text-center">
                            <p className="text-xs text-gray-500">已核對(本期)</p>
                            <p className="font-semibold text-green-600">${card.billedAmount.toLocaleString()}</p>
                        </div>
                        <div className="p-4 text-center">
                             <p className="text-xs text-gray-500">未核對筆數</p>
                             <p className="font-semibold text-orange-500">{card.unbilledCount}</p>
                        </div>
                    </div>
                </div>
            ))}
             {cardSummary.length === 0 && (
                <div className="col-span-full text-center py-12 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
                    <p>目前沒有信用卡消費紀錄</p>
                </div>
            )}
        </div>
      </div>

      {/* 3. Detail Modal */}
      {selectedCardDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                 <div>
                    <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                        {selectedCardDetail} 詳細清單
                        <span className="text-sm font-normal px-2 py-1 bg-gray-100 rounded text-gray-500">信用卡</span>
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">點擊列表項目可快速切換「已出帳/未出帳」狀態</p>
                 </div>
                 <button onClick={() => setSelectedCardDetail(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X size={24} className="text-gray-500" />
                 </button>
              </div>

              {/* Content - Two columns */}
              <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-200">
                 
                 {/* Unbilled Section */}
                 <div className="flex-1 flex flex-col min-h-0 bg-orange-50/30">
                    <div className="p-4 bg-orange-50 border-b border-orange-100 sticky top-0 z-10">
                        <h4 className="font-bold text-orange-800 flex justify-between items-center">
                            <span>未出帳 / 未核對</span>
                            <span className="text-sm bg-white px-2 py-0.5 rounded-full border border-orange-200">
                                {unbilled.length} 筆
                            </span>
                        </h4>
                        <p className="text-xs text-orange-600 mt-1 text-right">
                           總計: ${unbilled.reduce((acc, t) => acc + t.amount, 0).toLocaleString()}
                        </p>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-2">
                        {unbilled.map(t => (
                            <div 
                                key={t.id} 
                                onClick={() => onToggleReconcile(t.id)}
                                className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:border-orange-300 cursor-pointer transition-all flex justify-between items-center group"
                            >
                                <div>
                                    <p className="font-medium text-gray-800">{t.description}</p>
                                    <p className="text-xs text-gray-500">{t.date}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-gray-800">${t.amount.toLocaleString()}</p>
                                    <span className="text-[10px] text-gray-400 group-hover:text-blue-500">點擊核銷</span>
                                </div>
                            </div>
                        ))}
                        {unbilled.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">無未出帳項目</p>}
                    </div>
                 </div>

                 {/* Billed Section */}
                 <div className="flex-1 flex flex-col min-h-0 bg-green-50/30">
                    <div className="p-4 bg-green-50 border-b border-green-100 sticky top-0 z-10">
                        <h4 className="font-bold text-green-800 flex justify-between items-center">
                            <span>已出帳 / 已核對</span>
                            <span className="text-sm bg-white px-2 py-0.5 rounded-full border border-green-200">
                                {billed.length} 筆
                            </span>
                        </h4>
                        <p className="text-xs text-green-600 mt-1 text-right">
                           總計: ${billed.reduce((acc, t) => acc + t.amount, 0).toLocaleString()}
                        </p>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-2">
                        {billed.map(t => (
                            <div 
                                key={t.id} 
                                onClick={() => onToggleReconcile(t.id)}
                                className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:border-red-300 cursor-pointer transition-all flex justify-between items-center group opacity-75 hover:opacity-100"
                            >
                                <div>
                                    <p className="font-medium text-gray-800">{t.description}</p>
                                    <p className="text-xs text-gray-500">{t.date}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-gray-800">${t.amount.toLocaleString()}</p>
                                    <span className="text-[10px] text-gray-400 group-hover:text-red-500">點擊取消核銷</span>
                                </div>
                            </div>
                        ))}
                        {billed.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">無已出帳項目</p>}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

const CreditCardIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-credit-card opacity-50"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
)

export default Reconciliation;