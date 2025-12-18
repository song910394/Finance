
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, PaymentMethod, CardBank, CardSetting } from '../types';
import { CheckCircle2, Calculator, X, ChevronRight, Timer, CreditCard, Calendar, RefreshCw, CheckSquare, ShieldCheck } from 'lucide-react';

interface ReconciliationProps {
  transactions: Transaction[];
  cardSettings: Record<string, CardSetting>;
  onToggleReconcile: (id: string) => void;
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void;
  onUpdateCardSettings: (newSettings: Record<string, CardSetting>) => void;
  cardBanks: string[];
}

const Reconciliation: React.FC<ReconciliationProps> = ({ transactions, cardSettings, onToggleReconcile, cardBanks, onUpdateCardSettings }) => {
  const [mode, setMode] = useState<'manual' | 'ocr'>('manual');
  const [selectedBank, setSelectedBank] = useState<string>('-');
  const [statementTotal, setStatementTotal] = useState<string>('');
  const [selectedStatementMonth, setSelectedStatementMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCardDetail, setSelectedCardDetail] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedCardDetail(null); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const getCycleRange = (bank: string, yearMonth: string) => {
    const setting = cardSettings[bank];
    if (!setting || !setting.statementDay) return null;

    const [year, month] = yearMonth.split('-').map(Number);
    const endDate = new Date(year, month - 1, setting.statementDay);
    const startDate = new Date(year, month - 2, setting.statementDay + 1);

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };
  };

  const isMonthIssued = (bank: string, month: string) => {
    return cardSettings[bank]?.issuedMonths?.includes(month) || false;
  };

  const handleToggleIssued = () => {
    if (selectedBank === '-' || !selectedStatementMonth) return;
    const current = cardSettings[selectedBank] || { statementDay: 15 };
    const issued = current.issuedMonths || [];
    const newIssued = issued.includes(selectedStatementMonth)
        ? issued.filter(m => m !== selectedStatementMonth)
        : [...issued, selectedStatementMonth];
    
    onUpdateCardSettings({
        ...cardSettings,
        [selectedBank]: { ...current, issuedMonths: newIssued }
    });
  };

  // Logic: Current Bill List
  // Includes unbilled items that are:
  // 1. Within the cycle range (if defined)
  // 2. OR regular transactions (not recurring/installments) that date AFTER the cycle range (to satisfy user request)
  // 3. OR everything if no cycle range is defined
  const candidateTransactions = useMemo(() => {
    if (selectedBank === '-') return [];
    const range = getCycleRange(selectedBank, selectedStatementMonth);
    
    return transactions.filter(t => {
      if (t.paymentMethod !== PaymentMethod.CREDIT_CARD || t.cardBank !== selectedBank || t.isReconciled) return false;
      if (!range) return true;
      
      const inRange = t.date >= range.start && t.date <= range.end;
      const isRegularFuture = t.date > range.end && !t.isRecurring && !t.isInstallment;
      
      return inRange || isRegularFuture;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, selectedBank, selectedStatementMonth, cardSettings]);

  const reconciledTotalInCycle = useMemo(() => {
    if (selectedBank === '-') return 0;
    const range = getCycleRange(selectedBank, selectedStatementMonth);
    if (!range) return 0;

    return transactions
        .filter(t => t.paymentMethod === PaymentMethod.CREDIT_CARD && t.cardBank === selectedBank && t.isReconciled && t.date >= range.start && t.date <= range.end)
        .reduce((s, t) => s + t.amount, 0);
  }, [transactions, selectedBank, selectedStatementMonth, cardSettings]);

  const targetTotal = parseFloat(statementTotal) || 0;
  const discrepancy = targetTotal - reconciledTotalInCycle;

  const cardSummary = useMemo(() => {
    return cardBanks.filter(c => c !== '-').map(bank => {
        const txs = transactions.filter(t => t.paymentMethod === PaymentMethod.CREDIT_CARD && t.cardBank === bank);
        const unbilled = txs.filter(t => !t.isReconciled).reduce((s, t) => s + t.amount, 0);
        const billed = txs.filter(t => t.isReconciled).reduce((s, t) => s + t.amount, 0);
        const issued = isMonthIssued(bank, selectedStatementMonth);
        return { bank, unbilled, billed, issued, totalCount: txs.length };
    }).filter(s => s.totalCount > 0);
  }, [transactions, cardBanks, cardSettings, selectedStatementMonth]);

  // Helpers for Detail Modal
  const getDetailTransactions = (bank: string, type: 'current' | 'future' | 'reconciled') => {
    const range = getCycleRange(bank, selectedStatementMonth);
    return transactions.filter(t => {
        if (t.cardBank !== bank) return false;
        
        if (type === 'reconciled') {
            return t.isReconciled;
        }

        if (t.isReconciled) return false;

        if (!range) return type === 'current'; // If no range, everything unbilled is current

        const inRange = t.date >= range.start && t.date <= range.end;
        const isFutureDate = t.date > range.end;
        
        // "Current" includes:
        // 1. Transactions strictly inside the date range
        // 2. Transactions in the future that are regular (not installment/recurring) - per user request
        if (type === 'current') {
            return inRange || (isFutureDate && !t.isRecurring && !t.isInstallment);
        }

        // "Future" includes ONLY:
        // Transactions in the future that ARE installment/recurring
        if (type === 'future') {
            return isFutureDate && (t.isRecurring || !!t.isInstallment);
        }

        return false;
    }).sort((a, b) => type === 'future' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  };

  const getTotal = (bank: string, type: 'current' | 'future' | 'reconciled') => {
      return getDetailTransactions(bank, type).reduce((sum, t) => sum + t.amount, 0);
  };

  return (
    <div className="space-y-8 pb-16">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><Calculator className="text-indigo-500" /> 對帳核對</h3>
            <div className="flex bg-slate-50 p-1 rounded-xl">
                <button onClick={() => setMode('manual')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>手動核對</button>
                <button onClick={() => setMode('ocr')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'ocr' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>掃描帳單</button>
            </div>
        </div>

        {mode === 'manual' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-4">
                    <div className="p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 block">1. 選擇卡別</label>
                            <select value={selectedBank} onChange={e => setSelectedBank(e.target.value)} className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-bold text-slate-700 outline-none">
                                <option value="-">請選擇卡片...</option>
                                {cardBanks.filter(b => b !== '-').map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 block">2. 帳單月份</label>
                                <div className="relative flex items-center">
                                    <input type="month" value={selectedStatementMonth} onChange={e => setSelectedStatementMonth(e.target.value)} className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-bold text-indigo-600 outline-none appearance-none cursor-pointer z-10 bg-transparent" />
                                    <Calendar size={14} className="absolute right-3 text-indigo-500 pointer-events-none z-0" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-white border border-indigo-100 rounded-xl shadow-sm">
                                <input id="issued-check" type="checkbox" checked={isMonthIssued(selectedBank, selectedStatementMonth)} onChange={handleToggleIssued} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                                <label htmlFor="issued-check" className="text-xs font-black text-slate-600 cursor-pointer">標記此月帳單已核結出帳</label>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 block">3. 帳單總額</label>
                            <input type="number" value={statementTotal} onChange={e => setStatementTotal(e.target.value)} className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl text-xl font-black text-slate-800 outline-none" placeholder="0" />
                        </div>
                    </div>
                    <div className={`p-6 rounded-3xl border-2 text-center transition-all ${Math.abs(discrepancy) < 1 && targetTotal > 0 ? 'bg-emerald-50 border-emerald-500 shadow-lg shadow-emerald-100' : 'bg-slate-50 border-slate-200'}`}>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">週期內核對差額</span>
                        <h4 className={`text-3xl font-black mt-1 ${discrepancy === 0 && targetTotal > 0 ? 'text-emerald-600' : 'text-amber-500'}`}>${discrepancy.toLocaleString()}</h4>
                        {discrepancy === 0 && targetTotal > 0 && <p className="text-[10px] text-emerald-600 font-bold mt-2 flex items-center justify-center gap-1"><CheckSquare size={12}/> 本期帳目已結平</p>}
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 overflow-hidden flex flex-col max-h-[480px] shadow-sm">
                    <div className="p-3 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 flex justify-between">
                        <span>本期帳單明細 (含本期未出帳與單筆消費)</span>
                        <span className="text-indigo-600">本期已核: ${reconciledTotalInCycle.toLocaleString()}</span>
                    </div>
                    <div className="overflow-y-auto flex-1 p-3 space-y-2">
                        {candidateTransactions.length > 0 ? candidateTransactions.map(t => (
                            <div key={t.id} onClick={() => onToggleReconcile(t.id)} className="flex items-center justify-between p-3.5 rounded-2xl border-2 border-slate-50 bg-white hover:border-indigo-200 cursor-pointer transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-200 group-hover:border-indigo-400 transition-colors">
                                        <div className="w-2.5 h-2.5 rounded-full bg-slate-200 group-hover:bg-indigo-400"></div>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-700">{t.description}</span>
                                        <span className="text-[10px] text-slate-400 font-bold">{t.date}</span>
                                    </div>
                                </div>
                                <span className="font-black text-slate-800">${t.amount.toLocaleString()}</span>
                            </div>
                        )) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 py-10 italic">
                                <CreditCard size={48} className="opacity-10 mb-2" />
                                <p className="text-sm">此週期暫無未對帳明細</p>
                                <p className="text-[10px]">請確認上方「銀行」與「帳單月份」是否正確</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cardSummary.map(card => (
              <div key={card.bank} onClick={() => setSelectedCardDetail(card.bank)} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group relative">
                  <div className="p-6 bg-slate-900 text-white relative">
                      <div className="flex justify-between items-center mb-6">
                        <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-md">CREDIT CARD</span>
                        {card.issued && <span className="flex items-center gap-1 text-[10px] font-black bg-emerald-500 text-white px-2 py-1 rounded-lg animate-pulse"><ShieldCheck size={12}/> 已出帳</span>}
                      </div>
                      <h3 className="text-2xl font-black mb-1 tracking-tight">{card.bank}</h3>
                      <div className="mt-6">
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">目前待對帳總額</p>
                          <p className="text-3xl font-black">${card.unbilled.toLocaleString()}</p>
                      </div>
                      <ChevronRight className="absolute bottom-6 right-6 text-white/20 group-hover:text-white transition-all" size={24} />
                  </div>
                  <div className="p-5 flex justify-between items-center bg-slate-50/50">
                      <span className="text-[10px] font-black text-slate-400 uppercase">本月累計已核銷</span>
                      <span className="text-sm font-black text-emerald-600">${card.billed.toLocaleString()}</span>
                  </div>
              </div>
          ))}
      </div>

      {/* 詳情彈窗 */}
      {selectedCardDetail && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in" onClick={() => setSelectedCardDetail(null)}>
              <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <div>
                        <h3 className="text-2xl font-black text-slate-800 tracking-tight">{selectedCardDetail} 帳務明細清單</h3>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">按 ESC 或點擊外部可關閉</p>
                      </div>
                      <button onClick={() => setSelectedCardDetail(null)} className="p-2.5 bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-all shadow-sm"><X size={20}/></button>
                  </div>

                  <div className="flex-1 overflow-hidden flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                      {/* 本期未出帳 */}
                      <div className="flex-1 flex flex-col min-h-0">
                          <div className="p-4 bg-indigo-50/50 flex justify-between items-center sticky top-0 border-b border-indigo-100/50">
                              <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">本期帳單明細</span>
                              <span className="font-black text-indigo-700 text-lg">
                                ${getTotal(selectedCardDetail, 'current').toLocaleString()}
                              </span>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-2">
                             {getDetailTransactions(selectedCardDetail, 'current').map(t => (
                                 <div key={t.id} onClick={()=>onToggleReconcile(t.id)} className="p-3 bg-white border border-slate-100 rounded-2xl hover:border-indigo-300 cursor-pointer flex justify-between group transition-all">
                                     <div>
                                         <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5">{t.description}{t.isRecurring && <RefreshCw size={10} className="text-amber-500" />}</p>
                                         <p className="text-[10px] text-slate-400 font-bold">{t.date}</p>
                                     </div>
                                     <span className="text-sm font-black text-slate-800">${t.amount.toLocaleString()}</span>
                                 </div>
                             ))}
                          </div>
                      </div>

                      {/* 未來分期 */}
                      <div className="flex-1 flex flex-col min-h-0 bg-slate-50/30">
                          <div className="p-4 bg-amber-50/50 flex justify-between items-center sticky top-0 border-b border-amber-100/50">
                              <span className="text-xs font-black text-amber-600 uppercase tracking-widest">未來分期金額</span>
                              <span className="font-black text-amber-700 text-lg">
                                ${getTotal(selectedCardDetail, 'future').toLocaleString()}
                              </span>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-2">
                             {getDetailTransactions(selectedCardDetail, 'future').map(t => (
                                 <div key={t.id} className="p-3 bg-white/70 border border-slate-100 rounded-2xl flex justify-between">
                                     <div>
                                         <p className="text-sm font-bold text-slate-700 flex items-center gap-1">{t.description}{t.isRecurring && <RefreshCw size={10} className="text-amber-500" />}</p>
                                         <p className="text-[10px] text-amber-500 font-black">預計扣款: {t.date}</p>
                                     </div>
                                     <span className="text-sm font-black text-slate-800">${t.amount.toLocaleString()}</span>
                                 </div>
                             ))}
                          </div>
                      </div>

                      {/* 已核對 */}
                      <div className="flex-1 flex flex-col min-h-0">
                          <div className="p-4 bg-emerald-50/50 flex justify-between items-center sticky top-0 border-b border-emerald-100/50">
                              <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">本期已核銷</span>
                              <span className="font-black text-emerald-700 text-lg">
                                ${getTotal(selectedCardDetail, 'reconciled').toLocaleString()}
                              </span>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-2">
                             {getDetailTransactions(selectedCardDetail, 'reconciled').map(t => (
                                 <div key={t.id} onClick={()=>onToggleReconcile(t.id)} className="p-3 bg-white/60 border border-emerald-100 rounded-2xl flex justify-between group cursor-pointer hover:border-rose-300 transition-all">
                                     <div>
                                         <p className="text-sm font-bold text-slate-400 line-through">{t.description}</p>
                                         <p className="text-[10px] text-slate-300 font-bold">{t.date}</p>
                                     </div>
                                     <div className="text-right">
                                         <span className="text-sm font-bold text-slate-400 block">${t.amount.toLocaleString()}</span>
                                         <span className="text-[9px] text-rose-500 font-black opacity-0 group-hover:opacity-100">取消核對</span>
                                     </div>
                                 </div>
                             ))}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Reconciliation;
