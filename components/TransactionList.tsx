import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Transaction, PaymentMethod } from '../types';
import { getCategoryColor } from '../constants';
import { formatLocalDate, shiftYearMonth } from '../utils/billing';
import { buildTransactionSchedule, clampTransactionPage, dateAtMonthOffset, isValidTransactionDate, needsReconciliationReset, parseMoney, prepareTransactionEdit, TransactionDraft } from '../utils/transactions';
import { previewTransactionImport, selectedImportTransactions, transactionExportRows, TRANSACTION_EXPORT_HEADERS, TransactionImportPreview } from '../utils/transactionImport';
import { Plus, Search, Trash2, Pencil, X, Download, Upload, ChevronLeft, ChevronRight } from 'lucide-react';

interface TransactionListProps {
    transactions: Transaction[];
    categories: string[];
    cardBanks: string[];
    selectedMonth: string;
    onMonthChange: (month: string) => void;
    startAdding?: number;
    onAddTransaction: (t: TransactionDraft) => void;
    onAddTransactions: (ts: TransactionDraft[], newCategories?: string[], newBanks?: string[]) => void;
    onEditTransaction: (id: string, t: TransactionDraft) => void;
    onDeleteTransaction: (id: string) => void;
    onDeleteRecurringGroup: (groupId: string, fromDate: string) => void;
    onToggleReconcile: (id: string) => void;
}

const ITEMS_PER_PAGE = 20;
const inputClass = 'w-full min-h-11 p-3 bg-white border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500';
const secondaryButton = 'min-h-11 px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50';
const primaryButton = 'min-h-11 px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50';
const dialogStyle = { maxHeight: 'calc(100dvh - 2rem)', width: 'calc(100% - 1rem)' };

function useNativeDialog(open: boolean) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);
    return ref;
}

const TransactionList: React.FC<TransactionListProps> = ({ transactions, categories, cardBanks, selectedMonth, onMonthChange, startAdding = 0, onAddTransaction, onAddTransactions, onEditTransaction, onDeleteTransaction, onDeleteRecurringGroup, onToggleReconcile }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'month' | 'year' | 'all'>('month');
    const [selectedYear, setSelectedYear] = useState(selectedMonth.slice(0, 4));
    const [filterCategory, setFilterCategory] = useState('');
    const [filterMethod, setFilterMethod] = useState('');
    const [filterBank, setFilterBank] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [date, setDate] = useState(formatLocalDate(new Date()));
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CREDIT_CARD);
    const [cardBank, setCardBank] = useState(cardBanks.find(bank => bank !== '-') ?? '');
    const [category, setCategory] = useState(categories[0] ?? '');
    const [description, setDescription] = useState('');
    const [mode, setMode] = useState<'single' | 'recurring' | 'installment'>('single');
    const [installments, setInstallments] = useState('3');
    const [confirmReset, setConfirmReset] = useState(false);
    const [formError, setFormError] = useState('');
    const [notice, setNotice] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
    const [preview, setPreview] = useState<TransactionImportPreview | null>(null);
    const [importFileName, setImportFileName] = useState('');
    const [includedDuplicates, setIncludedDuplicates] = useState<number[]>([]);
    const [isFileBusy, setIsFileBusy] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const addingToken = useRef(0);
    const formDialog = useNativeDialog(isAdding);
    const deleteDialog = useNativeDialog(deleteTarget !== null);
    const importDialog = useNativeDialog(preview !== null);
    const editingTransaction = editingId ? transactions.find(transaction => transaction.id === editingId) : undefined;
    const bankToUse = paymentMethod === PaymentMethod.CREDIT_CARD ? cardBank : '-';
    const nextFields = { date, amount: parseMoney(amount) ?? NaN, paymentMethod, cardBank: bankToUse, category: category.trim(), description: description.trim() };
    const requiresReset = editingTransaction ? needsReconciliationReset(editingTransaction, nextFields) : false;
    const availableYears = useMemo(() => Array.from(new Set([selectedMonth.slice(0, 4), new Date().getFullYear().toString(), ...transactions.map(transaction => transaction.date.slice(0, 4))])).sort().reverse(), [transactions, selectedMonth]);
    const categoryOptions = Array.from(new Set([...categories, ...(category ? [category] : [])]));
    const bankOptions = Array.from(new Set([...cardBanks.filter(bank => bank !== '-'), ...(cardBank && cardBank !== '-' ? [cardBank] : [])]));

    useEffect(() => { setCurrentPage(1); }, [searchTerm, filterType, selectedMonth, selectedYear, filterCategory, filterMethod, filterBank]);

    const openAdd = () => {
        setEditingId(null);
        setAmount('');
        setPaymentMethod(PaymentMethod.CREDIT_CARD);
        setCardBank(cardBanks.includes('台新') ? '台新' : cardBanks.find(bank => bank !== '-') ?? '');
        setCategory(categories.includes(category) ? category : categories[0] ?? '');
        setDescription('');
        setMode('single');
        setInstallments('3');
        setConfirmReset(false);
        setFormError('');
        const today = formatLocalDate(new Date());
        setDate(today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`);
        setIsAdding(true);
    };
    useEffect(() => {
        if (startAdding > 0 && startAdding !== addingToken.current) {
            addingToken.current = startAdding;
            openAdd();
        }
    }, [startAdding]);

    const openEdit = (transaction: Transaction) => {
        setEditingId(transaction.id);
        setDate(transaction.date);
        setAmount(String(transaction.amount));
        setPaymentMethod(transaction.paymentMethod);
        setCardBank(transaction.cardBank);
        setCategory(transaction.category);
        setDescription(transaction.description);
        setMode('single');
        setConfirmReset(false);
        setFormError('');
        setIsAdding(true);
    };

    const filteredTransactions = useMemo(() => transactions.filter(transaction => {
        if (filterType === 'month' && !transaction.date.startsWith(selectedMonth)) return false;
        if (filterType === 'year' && !transaction.date.startsWith(selectedYear)) return false;
        if (filterCategory && transaction.category !== filterCategory) return false;
        if (filterMethod && transaction.paymentMethod !== filterMethod) return false;
        if (filterBank && transaction.cardBank !== filterBank) return false;
        return !searchTerm || `${transaction.description} ${transaction.category}`.toLocaleLowerCase().includes(searchTerm.toLocaleLowerCase());
    }).sort((a, b) => b.date.localeCompare(a.date)), [transactions, filterType, selectedMonth, selectedYear, filterCategory, filterMethod, filterBank, searchTerm]);
    const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE));
    const page = clampTransactionPage(currentPage, filteredTransactions.length);
    useEffect(() => { if (currentPage !== page) setCurrentPage(page); }, [currentPage, page]);
    const currentTransactions = filteredTransactions.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
    const hasImportErrors = !!preview && (preview.errors.length > 0 || preview.rows.some(row => row.errors.length > 0));
    const selectedImports = preview ? selectedImportTransactions(preview, includedDuplicates) : [];
    const duplicateCount = preview?.rows.filter(row => row.duplicateOf).length ?? 0;

    const handleExport = async () => {
        setIsFileBusy(true);
        try {
            const XLSX = await import('xlsx');
            const sheet = XLSX.utils.json_to_sheet(transactionExportRows(transactions), { header: TRANSACTION_EXPORT_HEADERS });
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, sheet, '記帳明細');
            XLSX.writeFile(workbook, `記帳明細_${formatLocalDate(new Date())}.xlsx`);
            setNotice(`已匯出全部 ${transactions.length} 筆交易；目前畫面的篩選不影響匯出範圍。`);
        } catch { setNotice('匯出失敗，請重試。'); }
        finally { setIsFileBusy(false); }
    };
    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setIsFileBusy(true);
        setImportFileName(file.name);
        setIncludedDuplicates([]);
        try {
            const XLSX = await import('xlsx');
            const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            if (!firstSheet) throw new Error('找不到工作表');
            const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, raw: true, defval: '', blankrows: true });
            setPreview(previewTransactionImport(matrix, transactions, { date1904: workbook.Workbook?.WBProps?.date1904 === true }));
        } catch { setPreview({ rows: [], errors: ['無法讀取此檔案，請確認是有效的 Excel 活頁簿。'] }); }
        finally { setIsFileBusy(false); }
    };
    const confirmImport = () => {
        if (!preview || hasImportErrors || selectedImports.length === 0) return;
        onAddTransactions(selectedImports, Array.from(new Set(selectedImports.map(transaction => transaction.category).filter(value => !categories.includes(value)))), Array.from(new Set(selectedImports.map(transaction => transaction.cardBank).filter(value => value !== '-' && !cardBanks.includes(value)))));
        setNotice(`已匯入 ${selectedImports.length} 筆資料；略過 ${duplicateCount - includedDuplicates.length} 筆疑似重複資料。`);
        setPreview(null);
    };
    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        setFormError('');
        if (!isValidTransactionDate(date) || parseMoney(amount) === null || !category.trim() || !description.trim() || (paymentMethod === PaymentMethod.CREDIT_CARD && (!cardBank || cardBank === '-'))) {
            setFormError('請填寫有效日期、完整金額、類別與用途說明；刷卡交易需指定銀行。');
            return;
        }
        try {
            if (editingId) {
                if (!editingTransaction) throw new Error('這筆交易已不存在，請關閉表單後重新確認。');
                onEditTransaction(editingId, prepareTransactionEdit(editingTransaction, nextFields, confirmReset));
                setNotice(requiresReset ? '已更新此筆並取消核銷，請至信用卡頁重新指定帳單月份。' : '已更新此筆交易。');
            } else {
                const base: TransactionDraft = { ...nextFields, isReconciled: false };
                const schedule = buildTransactionSchedule(base, mode, Number(installments), mode === 'single' ? '' : `${mode}_${crypto.randomUUID()}`);
                if (schedule.length === 1) onAddTransaction(schedule[0]); else onAddTransactions(schedule);
                onMonthChange(date.slice(0, 7));
                setFilterType('month');
                setSearchTerm('');
                setFilterCategory('');
                setFilterMethod('');
                setFilterBank('');
                setNotice(`已新增 ${schedule.length} 筆交易。`);
            }
            setIsAdding(false);
        } catch (error) { setFormError(error instanceof Error ? error.message : '儲存失敗，請重試。'); }
    };
    const deleteSingle = () => {
        if (!deleteTarget) return;
        onDeleteTransaction(deleteTarget.id);
        setNotice('已刪除此筆交易。');
        setDeleteTarget(null);
    };
    const deleteFuture = () => {
        if (!deleteTarget?.recurringGroupId) return;
        onDeleteRecurringGroup(deleteTarget.recurringGroupId, deleteTarget.date);
        setNotice('已刪除此筆及同組未來的固定支出。');
        setDeleteTarget(null);
    };

    const transactionStatus = (transaction: Transaction) => transaction.paymentMethod !== PaymentMethod.CREDIT_CARD ? null : !transaction.isReconciled ? '未對帳' : transaction.statementMonth ? `已對帳 · ${transaction.statementMonth}` : '帳單月份待確認';
    const transactionTag = (transaction: Transaction) => transaction.isRecurring ? '固定支出' : transaction.isInstallment ? (transaction.installmentNumber && transaction.installmentCount ? `分期 ${transaction.installmentNumber}/${transaction.installmentCount}` : '分期（期次待確認）') : null;
    const actions = (transaction: Transaction) => <div className="flex gap-1 justify-end"><button type="button" onClick={() => openEdit(transaction)} className="min-h-11 min-w-11 p-3 text-indigo-600 hover:bg-indigo-50 rounded-xl" aria-label={`編輯 ${transaction.description}`}><Pencil size={18} /></button><button type="button" onClick={() => setDeleteTarget(transaction)} className="min-h-11 min-w-11 p-3 text-rose-600 hover:bg-rose-50 rounded-xl" aria-label={`刪除 ${transaction.description}`}><Trash2 size={18} /></button></div>;

    return <div className="space-y-4 md:space-y-6">
        <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-3">
            <div className="transaction-search flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-48"><Search aria-hidden="true" size={18} className="absolute left-3 top-3.5 text-slate-400" /><input aria-label="搜尋消費說明或類別" placeholder="搜尋消費說明或類別" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} className={`${inputClass} pl-10`} /></div>
                <button type="button" onClick={openAdd} className={`${primaryButton} flex items-center gap-2`}><Plus size={18} />新增支出</button>
            </div>
            <div className="transaction-filters flex flex-wrap gap-2 items-center">
                <select aria-label="資料期間" className={secondaryButton} value={filterType} onChange={event => setFilterType(event.target.value as 'month' | 'year' | 'all')}><option value="month">按月</option><option value="year">按年</option><option value="all">全部期間</option></select>
                {filterType === 'month' && <div className="flex items-center"><button type="button" aria-label="上個月" className="min-h-11 min-w-11 p-2" onClick={() => onMonthChange(shiftYearMonth(selectedMonth, -1))}><ChevronLeft size={18} /></button><input aria-label="記帳月份" type="month" value={selectedMonth} onChange={event => { if (event.target.value) onMonthChange(event.target.value); }} className="min-h-11 w-36 border border-slate-300 p-2 rounded-xl text-sm" /><button type="button" aria-label="下個月" className="min-h-11 min-w-11 p-2" onClick={() => onMonthChange(shiftYearMonth(selectedMonth, 1))}><ChevronRight size={18} /></button></div>}
                {filterType === 'year' && <select aria-label="記帳年度" className={secondaryButton} value={selectedYear} onChange={event => setSelectedYear(event.target.value)}>{availableYears.map(year => <option key={year}>{year}</option>)}</select>}
                <select aria-label="支付方式篩選" className={secondaryButton} value={filterMethod} onChange={event => setFilterMethod(event.target.value)}><option value="">所有支付</option>{Object.values(PaymentMethod).map(method => <option key={method}>{method}</option>)}</select>
                <select aria-label="銀行篩選" className={secondaryButton} value={filterBank} onChange={event => setFilterBank(event.target.value)}><option value="">所有銀行</option>{Array.from(new Set([...cardBanks, ...transactions.map(transaction => transaction.cardBank)])).filter(bank => bank !== '-').map(bank => <option key={bank}>{bank}</option>)}</select>
                <select aria-label="類別篩選" className={secondaryButton} value={filterCategory} onChange={event => setFilterCategory(event.target.value)}><option value="">所有分類</option>{Array.from(new Set([...categories, ...transactions.map(transaction => transaction.category)])).map(value => <option key={value}>{value}</option>)}</select>
                <div className="flex gap-2 sm:ml-auto"><button type="button" disabled={isFileBusy} onClick={handleExport} className={`${secondaryButton} flex items-center gap-2`}><Download size={16} />匯出全部</button><button type="button" disabled={isFileBusy} onClick={() => fileInputRef.current?.click()} className={`${secondaryButton} flex items-center gap-2`}><Upload size={16} />{isFileBusy ? '處理中…' : '匯入 Excel'}</button><input type="file" ref={fileInputRef} onChange={handleImport} accept=".xlsx,.xls" className="hidden" aria-label="選擇 Excel 檔案" /></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">目前篩選共 {filteredTransactions.length} 筆。信用卡核銷與帳單月份請至信用卡頁處理。</p>
                {totalPages > 1 && <nav aria-label="交易分頁" className="flex w-full items-center justify-between gap-2 sm:ml-auto sm:w-auto"><button type="button" disabled={page <= 1} onClick={() => setCurrentPage(page - 1)} className={secondaryButton}>上一頁</button><span aria-live="polite" className="whitespace-nowrap text-sm text-slate-600">第 {page} / {totalPages} 頁</span><button type="button" disabled={page >= totalPages} onClick={() => setCurrentPage(page + 1)} className={secondaryButton}>下一頁</button></nav>}
            </div>
        </div>
        {notice && <p role="status" className="p-3 rounded-xl bg-indigo-50 text-indigo-800 text-sm">{notice}</p>}

        <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{['日期', '銀行／支付', '類別', '金額', '用途說明', '對帳狀態', '操作'].map(title => <th key={title} scope="col" className="p-4 whitespace-nowrap">{title}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{currentTransactions.map(transaction => <tr key={transaction.id}><td className="p-4 whitespace-nowrap">{transaction.date}</td><td className="p-4 whitespace-nowrap">{transaction.cardBank !== '-' ? transaction.cardBank : transaction.paymentMethod}</td><td className="p-4"><span className="px-2 py-1 rounded text-white whitespace-nowrap" style={{ backgroundColor: getCategoryColor(transaction.category) }}>{transaction.category}</span></td><td className="p-4 font-bold whitespace-nowrap">${transaction.amount.toLocaleString()}</td><td className="p-4"><span className="break-words">{transaction.description}</span>{transactionTag(transaction) && <span className="block mt-1 text-xs text-indigo-600">{transactionTag(transaction)}</span>}</td><td className="p-4 text-xs text-slate-600">{transactionStatus(transaction) ?? '—'}</td><td className="p-2">{actions(transaction)}</td></tr>)}</tbody></table>{currentTransactions.length === 0 && <p className="p-10 text-center text-slate-500">沒有符合條件的資料</p>}</div>
        <div className="md:hidden space-y-3">{currentTransactions.map(transaction => <article key={transaction.id} className="bg-white p-3 rounded-xl border border-slate-200"><div className="flex justify-between gap-3"><div className="min-w-0"><p className="text-xs text-slate-500">{transaction.date} · {transaction.category} · {transaction.cardBank !== '-' ? transaction.cardBank : transaction.paymentMethod}</p><p className="mt-1 font-bold break-words">{transaction.description}</p>{transactionTag(transaction) && <p className="text-xs text-indigo-600 mt-1">{transactionTag(transaction)}</p>}{transactionStatus(transaction) && <p className="text-xs text-slate-600 mt-1">{transactionStatus(transaction)}</p>}</div><span className="font-bold shrink-0">${transaction.amount.toLocaleString()}</span></div>{actions(transaction)}</article>)}{currentTransactions.length === 0 && <p className="p-8 text-center text-slate-500 bg-white rounded-2xl">沒有符合條件的資料</p>}</div>

        <dialog ref={formDialog} aria-labelledby="transaction-dialog-title" onCancel={() => setIsAdding(false)} onClose={() => setIsAdding(false)} style={dialogStyle} className="m-auto max-w-xl rounded-xl p-0 overflow-y-auto shadow-2xl backdrop:bg-slate-900/60">
            <div className="sticky top-0 z-10 bg-white p-4 border-b border-slate-200 flex justify-between items-center"><h2 id="transaction-dialog-title" className="text-lg font-bold">{editingId ? '修改支出' : '新增支出'}</h2><button type="button" aria-label="關閉支出表單" onClick={() => setIsAdding(false)} className="min-w-11 min-h-11 p-3 rounded-xl hover:bg-slate-100"><X size={20} /></button></div>
            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
                {editingId ? <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-800">僅修改此筆交易。固定支出或分期的其他期次維持原內容。</p> : <fieldset><legend className="text-sm font-bold mb-2">支出類型</legend><div className="flex flex-wrap gap-2">{(['single', 'recurring', 'installment'] as const).filter(value => value !== 'installment' || paymentMethod === PaymentMethod.CREDIT_CARD).map(value => <label key={value} className={`${mode === value ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-slate-300'} flex gap-2 items-center min-h-11 px-3 rounded-xl border text-sm`}><input type="radio" name="transaction-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />{value === 'single' ? '單筆支出' : value === 'recurring' ? '每月固定（12 個月）' : '分期付款'}</label>)}</div></fieldset>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><label className="text-sm font-bold space-y-1 block">交易日期<input autoFocus required type="date" value={date} onChange={event => setDate(event.target.value)} className={inputClass} /></label><label className="text-sm font-bold space-y-1 block">{!editingId && mode === 'installment' ? '分期總金額 (TWD)' : '金額 (TWD)'}<input required type="number" step="any" value={amount} onChange={event => setAmount(event.target.value)} className={inputClass} placeholder="請輸入金額" /></label></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><label className="text-sm font-bold space-y-1 block">支付方式<select value={paymentMethod} onChange={event => { setPaymentMethod(event.target.value as PaymentMethod); if (event.target.value !== PaymentMethod.CREDIT_CARD && mode === 'installment') setMode('single'); }} className={inputClass}>{Object.values(PaymentMethod).map(method => <option key={method}>{method}</option>)}</select></label>{paymentMethod === PaymentMethod.CREDIT_CARD && <label className="text-sm font-bold space-y-1 block">刷卡銀行<select required value={cardBank} onChange={event => setCardBank(event.target.value)} className={inputClass}><option value="">請選擇銀行</option>{bankOptions.map(bank => <option key={bank}>{bank}</option>)}</select></label>}<label className="text-sm font-bold space-y-1 block">分類<select required value={category} onChange={event => setCategory(event.target.value)} className={inputClass}><option value="">請選擇分類</option>{categoryOptions.map(value => <option key={value}>{value}</option>)}</select></label></div>
                <label className="text-sm font-bold space-y-1 block">用途說明<input required type="text" value={description} onChange={event => setDescription(event.target.value)} className={inputClass} placeholder="輸入消費內容" /></label>
                {!editingId && mode === 'recurring' && <p className="p-3 rounded-xl bg-amber-50 text-sm text-amber-900">將建立 12 筆，每月一筆。{isValidTransactionDate(date) && <>期間 {date} 至 {dateAtMonthOffset(date, 11)}。</>}{parseMoney(amount) !== null && <>每月 ${parseMoney(amount)!.toLocaleString()}，12 個月合計 ${(parseMoney(amount)! * 12).toLocaleString()}。</>}月底遇到較短月份時使用該月最後一天。12 個月後需另行建立。</p>}
                {!editingId && mode === 'installment' && <div className="p-3 rounded-xl bg-indigo-50 space-y-2"><label className="text-sm font-bold block">總期數<input required type="number" min="2" max="60" step="1" value={installments} onChange={event => setInstallments(event.target.value)} className={`${inputClass} mt-1`} /></label>{Number.isInteger(Number(installments)) && Number(installments) >= 2 && Number(installments) <= 60 && parseMoney(amount) !== null && isValidTransactionDate(date) && <p className="text-sm text-indigo-900">將建立 {installments} 筆，至 {dateAtMonthOffset(date, Number(installments) - 1)}。首期 ${(parseMoney(amount)! - Math.floor(parseMoney(amount)! / Number(installments)) * (Number(installments) - 1)).toLocaleString()}，其餘每期 ${Math.floor(parseMoney(amount)! / Number(installments)).toLocaleString()}；差額集中於首期。</p>}</div>}
                {editingTransaction?.isReconciled && <div className="p-3 border border-amber-200 bg-amber-50 rounded-xl text-sm space-y-2"><p>{editingTransaction.statementMonth ? `原核銷帳單：${editingTransaction.cardBank} ${editingTransaction.statementMonth}` : '此筆已核銷，帳單月份待確認。'}文字與分類修改會保留核銷紀錄。</p>{requiresReset ? <label className="flex gap-2 items-start"><input required type="checkbox" checked={confirmReset} onChange={event => setConfirmReset(event.target.checked)} className="mt-1" /><span>我確認取消此筆核銷，儲存後至信用卡頁重新對帳。金額、日期、銀行或支付方式已變更。</span></label> : <button type="button" className={secondaryButton} onClick={() => { if (window.confirm('確定取消此筆核銷？取消後請至信用卡頁重新指定帳單月份。')) { onToggleReconcile(editingTransaction.id); setNotice('已取消此筆核銷，請至信用卡頁重新對帳。'); } }}>取消此筆核銷</button>}</div>}
                {formError && <p role="alert" className="text-sm text-rose-700 bg-rose-50 p-3 rounded-xl">{formError}</p>}
                <div className="sticky bottom-0 bg-white py-3 border-t border-slate-200 flex justify-end gap-2"><button type="button" onClick={() => setIsAdding(false)} className={secondaryButton}>取消</button><button type="submit" disabled={requiresReset && !confirmReset} className={primaryButton}>確認儲存</button></div>
            </form>
        </dialog>

        <dialog ref={deleteDialog} aria-labelledby="delete-transaction-title" onCancel={() => setDeleteTarget(null)} onClose={() => setDeleteTarget(null)} style={dialogStyle} className="m-auto max-w-md rounded-2xl p-5 overflow-y-auto shadow-2xl backdrop:bg-slate-900/60"><h2 id="delete-transaction-title" className="text-lg font-bold">刪除支出</h2><p className="my-3 text-sm text-slate-600">確定刪除「{deleteTarget?.description}」？{deleteTarget?.date} · ${deleteTarget?.amount.toLocaleString()}。刪除後無法直接復原。</p><div className="flex flex-col gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className={secondaryButton} autoFocus>保留資料</button><button type="button" onClick={deleteSingle} className="min-h-11 p-3 text-rose-700 bg-rose-50 rounded-xl font-bold">僅刪除此筆</button>{deleteTarget?.isRecurring && deleteTarget.recurringGroupId && <button type="button" onClick={deleteFuture} className="min-h-11 p-3 bg-rose-600 text-white rounded-xl font-bold">刪除此筆及同組未來支出</button>}</div></dialog>

        <dialog ref={importDialog} aria-labelledby="import-preview-title" onCancel={() => setPreview(null)} onClose={() => setPreview(null)} style={dialogStyle} className="m-auto max-w-3xl rounded-2xl p-0 overflow-y-auto shadow-2xl backdrop:bg-slate-900/60"><div className="sticky top-0 z-10 bg-white p-4 border-b border-slate-200 flex justify-between items-center"><h2 id="import-preview-title" className="text-lg font-bold">Excel 匯入預覽</h2><button type="button" aria-label="關閉匯入預覽" onClick={() => setPreview(null)} className="min-h-11 min-w-11 p-3"><X size={20} /></button></div><div className="p-4 space-y-4"><p className="text-sm text-slate-600 break-all">{importFileName} · 僅讀取第一個工作表，共 {preview?.rows.length ?? 0} 列。</p><p className="text-sm text-slate-600">必要欄位：日期、類別、金額、說明、支付方式；刷卡另需銀行。日期請用西元年月日，金額可用 1,200。固定／分期資料只匯入表內各筆，不另外展開期次。未填核銷狀態視為尚未對帳。</p>{hasImportErrors && <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-800 text-sm"><p className="font-bold">請修正以下錯誤後重新選檔，目前不會匯入任何資料。</p><ul className="list-disc pl-5 mt-2">{preview?.errors.map(error => <li key={error}>{error}</li>)}{preview?.rows.filter(row => row.errors.length).map(row => <li key={row.rowNumber}>第 {row.rowNumber} 列：{row.errors.join(' ')}</li>)}</ul></div>}{duplicateCount > 0 && <p className="p-3 bg-amber-50 rounded-xl text-sm text-amber-900">找到 {duplicateCount} 筆疑似重複（日期、金額、類別、說明、支付方式與銀行皆相同）。預設略過；若確定是不同消費，請逐筆勾選匯入。</p>}<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['列', '日期', '說明／類別', '金額', '核對結果'].map(header => <th key={header} className="p-2 border-b border-slate-200 whitespace-nowrap">{header}</th>)}</tr></thead><tbody>{preview?.rows.filter(row => row.transaction).map(row => <tr key={row.rowNumber}><td className="p-2">{row.rowNumber}</td><td className="p-2 whitespace-nowrap">{row.transaction!.date}</td><td className="p-2"><span className="break-words">{row.transaction!.description}</span><span className="block text-xs text-slate-500">{row.transaction!.category} · {row.transaction!.cardBank !== '-' ? row.transaction!.cardBank : row.transaction!.paymentMethod}</span>{row.transaction!.isReconciled && !row.transaction!.statementMonth && <span className="block text-xs text-amber-700">帳單月份待確認</span>}</td><td className="p-2 whitespace-nowrap">${row.transaction!.amount.toLocaleString()}</td><td className="p-2">{row.duplicateOf ? <label className="flex gap-2 items-start min-h-11"><input type="checkbox" checked={includedDuplicates.includes(row.rowNumber)} onChange={event => setIncludedDuplicates(current => event.target.checked ? [...current, row.rowNumber] : current.filter(value => value !== row.rowNumber))} /><span>與{row.duplicateOf}相同，仍要匯入第 {row.rowNumber} 列</span></label> : '待確認匯入'}</td></tr>)}</tbody></table></div><div className="sticky bottom-0 bg-white py-3 border-t border-slate-200 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setPreview(null)} className={secondaryButton}>取消</button><button type="button" onClick={() => fileInputRef.current?.click()} className={secondaryButton}>重新選檔</button><button type="button" onClick={confirmImport} disabled={hasImportErrors || selectedImports.length === 0} className={primaryButton}>確認匯入 {selectedImports.length} 筆</button></div></div></dialog>
    </div>;
};
export default TransactionList;
