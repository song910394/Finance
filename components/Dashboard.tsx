
import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { Transaction, Category, CategorySummary, CardBank, PaymentMethod, CardSetting } from '../types';
import { getCategoryColor } from '../constants';
import { Wallet, DollarSign, CreditCard, TrendingUp, Calendar, ChevronDown, ChevronLeft, ChevronRight, Banknote, X, ArrowRight, Filter, CalendarClock, PieChart as PieChartIcon, List } from 'lucide-react';

interface DashboardProps {
    transactions: Transaction[];
    budget: number;
    cardBanks: string[];
    cardSettings: Record<string, CardSetting>;
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, budget, cardBanks, cardSettings }) => {
    const [filterType, setFilterType] = useState<'month' | 'year' | 'all'>('month');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [excludeAgency, setExcludeAgency] = useState(true);

    // State for the detail popup
    const [detailView, setDetailView] = useState<{ type: 'card' | 'category', title: string } | null>(null);

    const availableYears = useMemo(() => {
        const years = transactions.map(t => t.date.split('-')[0]);
        const uniqueYears = Array.from(new Set([new Date().getFullYear().toString(), ...years]));
        return uniqueYears.sort((a, b) => b.localeCompare(a));
    }, [transactions]);

    // Primary filter based on time
    const timeFilteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            if (filterType === 'month') return t.date.startsWith(selectedMonth);
            if (filterType === 'year') return t.date.startsWith(selectedYear);
            return true;
        });
    }, [transactions, filterType, selectedMonth, selectedYear]);

    // Secondary filter for statistics (optionally exclude "代買")
    const statsTransactions = useMemo(() => {
        if (!excludeAgency) return timeFilteredTransactions;
        return timeFilteredTransactions.filter(t => t.category !== '代買');
    }, [timeFilteredTransactions, excludeAgency]);

    const totalExpense = useMemo(() => statsTransactions.reduce((acc, t) => acc + t.amount, 0), [statsTransactions]);

    const cashTotal = useMemo(() => {
        return statsTransactions
            .filter(t => t.paymentMethod === PaymentMethod.CASH)
            .reduce((sum, t) => sum + t.amount, 0);
    }, [statsTransactions]);

    const creditCardTotal = useMemo(() => {
        return statsTransactions
            .filter(t => t.paymentMethod === PaymentMethod.CREDIT_CARD)
            .reduce((sum, t) => sum + t.amount, 0);
    }, [statsTransactions]);

    const effectiveBudget = useMemo(() => filterType === 'year' ? budget * 12 : budget, [budget, filterType]);
    const budgetProgress = Math.min((totalExpense / effectiveBudget) * 100, 100);

    const cardStatus = useMemo(() => {
        const cards = cardBanks.filter(c => c !== CardBank.NONE && c !== '-');

        // Helper function to get cycle range based on statement day
        // Rule: Statement Day 1-14 -> Counts as Previous Month's Bill (So for selected month M, we want cycle ending in M+1)
        //       Statement Day 15-31 -> Counts as Current Month's Bill (So for selected month M, we want cycle ending in M)
        const getCycleRange = (bank: string, yearMonth: string) => {
            const setting = cardSettings[bank];
            if (!setting || !setting.statementDay) return null;

            const [year, month] = yearMonth.split('-').map(Number);

            // Determine the actual cycle end date based on the "Billing Month" logic
            // If statement day is small (e.g. 3), it belongs to the previous month's bill.
            // So if we are viewing "December Bill" (yearMonth = 12), and day is 3,
            // it means the cycle ends in January (12+1).
            // If day is 23, it ends in December (12).

            let targetYear = year;
            let targetMonth = month;

            // Check if this card follows "Next Month" logic (Day < 15)
            // We use 15 as the cutoff based on user requirement "1-14算上月, 15-31算當月"
            // This implies: For "Billing Month M", if Day < 15, the statement date is in M+1.
            if (setting.statementDay < 15) {
                targetMonth = month + 1;
                if (targetMonth > 12) {
                    targetMonth = 1;
                    targetYear = year + 1;
                }
            }

            const endDate = new Date(targetYear, targetMonth - 1, setting.statementDay);
            const startDate = new Date(targetYear, targetMonth - 2, setting.statementDay + 1);

            return {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            };
        };

        // 計算當月和前一個月的範圍（用於未出帳計算）
        const [baseYear, baseMonth] = selectedMonth.split('-').map(Number);
        const currentMonthStart = `${selectedMonth}-01`;
        const currentMonthEnd = new Date(baseYear, baseMonth, 0).toISOString().split('T')[0]; // 當月最後一天

        // 前一個月
        let prevYear = baseYear;
        let prevMonth = baseMonth - 1;
        if (prevMonth < 1) {
            prevMonth = 12;
            prevYear = baseYear - 1;
        }
        const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
        const prevMonthEnd = new Date(prevYear, prevMonth, 0).toISOString().split('T')[0]; // 前月最後一天

        return cards.map(bank => {
            const allBankTxs = transactions.filter(t => t.cardBank === bank);
            const setting = cardSettings[bank];
            const statementDay = setting?.statementDay || 0;
            const isNextMonth = setting?.isNextMonth || false;

            // 計算未出帳：計算截止至本期帳單結帳日的所有「未核銷」金額
            // 這包含了本期新增的消費，以及過往所有尚未核銷的消費（自動滾入）
            const range = getCycleRange(bank, selectedMonth);

            const unbilled = allBankTxs.filter(t => {
                if (t.isReconciled) return false;
                if (!range) return true; // 若無設定，顯示所有未核銷
                return t.date <= range.end;
            }).reduce((sum, t) => sum + t.amount, 0);

            // 計算已核帳：本期週期內的已核銷金額
            let billedRecent = 0;

            if (statementDay > 0) {
                // Priority 1: Use saved statement amount if available
                // Note: savedAmount is keyed by "Billing Month" (selectedMonth)
                const savedAmount = setting?.statementAmounts?.[selectedMonth];
                if (savedAmount !== undefined) {
                    billedRecent = savedAmount;
                } else {
                    // Priority 2: Calculate from reconciled transactions
                    if (range) {
                        billedRecent = allBankTxs
                            .filter(t => t.isReconciled && t.date >= range.start && t.date <= range.end)
                            .reduce((sum, t) => sum + t.amount, 0);
                    }
                }
            } else {
                // 如果沒有設定結帳日，fallback 到原本邏輯（只顯示當月已核銷）
                const txs = statsTransactions.filter(t => t.cardBank === bank);
                billedRecent = txs.filter(t => t.isReconciled).reduce((sum, t) => sum + t.amount, 0);
            }

            return { bank, unbilled, billedRecent };
        }).filter(c => c.unbilled > 0 || c.billedRecent > 0);
    }, [transactions, statsTransactions, cardBanks, cardSettings, selectedMonth]);

    // Installment progress tracking - aggregate all installment transactions
    const installmentProgress = useMemo(() => {
        // Helper to check if description looks like an installment (contains N/M pattern)
        const looksLikeInstallment = (desc: string) => {
            return /\d+\/\d+/.test(desc);
        };

        // Get all installment transactions - check BOTH flag AND description pattern
        // This catches transactions that weren't flagged but have installment-like descriptions
        const installmentTxs = transactions.filter(t =>
            t.isInstallment || looksLikeInstallment(t.description)
        );
        if (installmentTxs.length === 0) return { items: [], monthlyTotal: 0 };

        // Parse description to extract base name and period info
        // Supports multiple formats:
        // - "項目名稱 (N/M)" or "項目名稱(N/M)"
        // - "項目名稱 (分期N/M)" or "項目名稱(分期N/M)"
        // - "項目名稱分期N/M"
        const parseInstallment = (desc: string) => {
            // Try format: "name (N/M)" or "name(N/M)" or "name (分期N/M)"
            let match = desc.match(/^(.+?)\s*\(分?期?(\d+)\/(\d+)\)$/);
            if (match) return { baseName: match[1].trim(), current: +match[2], total: +match[3] };

            // Try format: "name分期N/M" (no parentheses)
            match = desc.match(/^(.+?)分期(\d+)\/(\d+)$/);
            if (match) return { baseName: match[1].trim(), current: +match[2], total: +match[3] };

            // Try format: "nameN/M" (just numbers at end)
            match = desc.match(/^(.+?)(\d+)\/(\d+)$/);
            if (match) return { baseName: match[1].trim(), current: +match[2], total: +match[3] };

            return { baseName: desc, current: 1, total: 1 };
        };

        // Group by base name
        const grouped = new Map<string, {
            transactions: typeof installmentTxs;
            cardBank: string;
            totalPeriods: number;
        }>();

        installmentTxs.forEach(t => {
            const { baseName, total } = parseInstallment(t.description);
            if (!grouped.has(baseName)) {
                grouped.set(baseName, {
                    transactions: [],
                    cardBank: t.cardBank,
                    totalPeriods: total
                });
            }
            grouped.get(baseName)!.transactions.push(t);
        });

        // Calculate progress for each installment item
        const items = Array.from(grouped.entries()).map(([name, data]) => {
            const txs = data.transactions.sort((a, b) => a.date.localeCompare(b.date));
            const paidTxs = txs.filter(t => t.isReconciled);
            const totalPeriods = data.totalPeriods;
            const paidPeriods = paidTxs.length;
            const remainingPeriods = totalPeriods - paidPeriods;
            const amountPerPeriod = txs[0]?.amount || 0;
            const totalAmount = amountPerPeriod * totalPeriods;
            const remainingAmount = amountPerPeriod * remainingPeriods;
            const progress = totalPeriods > 0 ? Math.round((paidPeriods / totalPeriods) * 100) : 0;

            // Calculate end date
            const firstDate = new Date(txs[0]?.date || new Date());
            const endDate = new Date(firstDate);
            endDate.setMonth(endDate.getMonth() + totalPeriods - 1);
            const endMonth = endDate.toISOString().slice(0, 7);

            return {
                name,
                cardBank: data.cardBank,
                totalPeriods,
                paidPeriods,
                remainingPeriods,
                amountPerPeriod,
                totalAmount,
                remainingAmount,
                progress,
                endMonth,
                isCompleted: paidPeriods >= totalPeriods
            };
        }).filter(item => !item.isCompleted) // Only show ongoing installments
            .sort((a, b) => a.endMonth.localeCompare(b.endMonth));

        // Calculate current month's installment total
        const currentMonth = new Date().toISOString().slice(0, 7);
        const monthlyTotal = installmentTxs
            .filter(t => t.date.startsWith(currentMonth))
            .reduce((sum, t) => sum + t.amount, 0);

        return { items, monthlyTotal };
    }, [transactions]);

    const categoryData: CategorySummary[] = useMemo(() => {
        const map = new Map<Category, number>();
        statsTransactions.forEach(t => {
            if (t.category !== '信用卡出帳') map.set(t.category, (map.get(t.category) || 0) + t.amount);
        });
        return Array.from(map.entries()).map(([name, value]) => ({ name, value, color: getCategoryColor(name) })).sort((a, b) => b.value - a.value);
    }, [statsTransactions]);

    // Calculate detailed transactions for the selected view
    const detailedTransactions = useMemo(() => {
        if (!detailView) return [];

        let source = [];
        if (detailView.type === 'card') {
            source = statsTransactions.filter(t => t.paymentMethod === PaymentMethod.CREDIT_CARD && t.cardBank === detailView.title);
        } else {
            source = statsTransactions.filter(t => t.category === detailView.title);
        }

        return source.sort((a, b) => b.amount - a.amount);
    }, [detailView, statsTransactions]);

    return (
        <div className="space-y-4 md:space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">財務概覽</h2>
                    <p className="text-[10px] md:text-xs text-slate-500 font-medium">檢視您的消費分析與預算進度</p>
                </div>

                <div className="flex flex-wrap gap-2 items-center justify-end w-full sm:w-auto">
                    {/* Agency Purchase Toggle */}
                    <button
                        onClick={() => setExcludeAgency(!excludeAgency)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] md:text-xs font-black transition-all border ${excludeAgency
                            ? 'bg-rose-50 text-rose-600 border-rose-100 shadow-sm'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 shadow-sm'
                            }`}
                    >
                        <Filter size={14} className={excludeAgency ? 'text-rose-500' : 'text-slate-400'} />
                        {excludeAgency ? '排除代買' : '包含代買'}
                    </button>

                    <div className="flex bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="relative border-r border-slate-100">
                            <select
                                value={filterType}
                                onChange={e => setFilterType(e.target.value as any)}
                                className="bg-slate-50 pl-3 pr-8 py-2 text-[10px] md:text-xs text-slate-700 font-black focus:outline-none appearance-none cursor-pointer h-full"
                            >
                                <option value="month">按月</option>
                                <option value="year">按年</option>
                                <option value="all">全部</option>
                            </select>
                            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>

                        {filterType === 'month' && (
                            <div className="relative flex items-center bg-white">
                                <button
                                    onClick={() => {
                                        const d = new Date(selectedMonth + '-01');
                                        d.setMonth(d.getMonth() - 1);
                                        setSelectedMonth(d.toISOString().slice(0, 7));
                                    }}
                                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                                    title="上個月"
                                >
                                    <ChevronLeft size={16} className="text-slate-500" />
                                </button>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={e => setSelectedMonth(e.target.value)}
                                    className="w-[100px] md:w-[130px] px-1 py-2 text-[10px] md:text-xs text-slate-700 font-black focus:outline-none bg-transparent cursor-pointer text-center"
                                />
                                <button
                                    onClick={() => {
                                        const d = new Date(selectedMonth + '-01');
                                        d.setMonth(d.getMonth() + 1);
                                        setSelectedMonth(d.toISOString().slice(0, 7));
                                    }}
                                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                                    title="下個月"
                                >
                                    <ChevronRight size={16} className="text-slate-500" />
                                </button>
                            </div>
                        )}
                        {filterType === 'year' && (
                            <div className="relative flex items-center bg-white min-w-[80px] md:min-w-[100px]">
                                <select
                                    value={selectedYear}
                                    onChange={e => setSelectedYear(e.target.value)}
                                    className="w-full pl-3 pr-8 py-2 text-[10px] md:text-xs text-slate-700 font-black focus:outline-none appearance-none cursor-pointer bg-transparent relative z-10"
                                >
                                    {availableYears.map(y => <option key={y} value={y}>{y} 年</option>)}
                                </select>
                                <Calendar size={14} className="absolute right-3 text-indigo-500 pointer-events-none z-0" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Summary Cards: 2 cols on mobile, 4 cols on lg */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                <div className="bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 hover:shadow-lg hover:shadow-indigo-100/50 hover:-translate-y-1 transition-all duration-300 group">
                    <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
                        <div className="p-2 md:p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform duration-300"><DollarSign size={16} className="md:w-5 md:h-5" /></div>
                        <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest truncate font-display">總支出</p>
                    </div>
                    <h3 className="text-xl md:text-3xl font-black text-slate-800 font-number tracking-tight">${totalExpense.toLocaleString()}</h3>
                    <p className="text-[10px] text-slate-400 mt-1 font-bold">預算剩餘: <span className={`font-number ${effectiveBudget - totalExpense < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>${(effectiveBudget - totalExpense).toLocaleString()}</span></p>
                </div>

                <div className="bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 hover:shadow-lg hover:shadow-emerald-100/50 hover:-translate-y-1 transition-all duration-300 group">
                    <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
                        <div className="p-2 md:p-2.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform duration-300"><Wallet size={16} className="md:w-5 md:h-5" /></div>
                        <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest truncate font-display">預算達成率</p>
                    </div>
                    <div className="flex justify-between items-end mb-2">
                        <h3 className="text-xl md:text-3xl font-black text-slate-800 font-number tracking-tight">{Math.round((totalExpense / effectiveBudget) * 100)}%</h3>
                        <span className="text-[10px] text-slate-400 font-bold hidden md:inline font-number">目標: ${effectiveBudget.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 md:h-2 overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ease-out ${budgetProgress > 90 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${budgetProgress}%` }}></div>
                    </div>
                </div>

                <div className="bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 hover:shadow-lg hover:shadow-amber-100/50 hover:-translate-y-1 transition-all duration-300 group">
                    <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
                        <div className="p-2 md:p-2.5 bg-amber-50 text-amber-600 rounded-xl group-hover:scale-110 transition-transform duration-300"><Banknote size={16} className="md:w-5 md:h-5" /></div>
                        <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest truncate font-display">現金支出</p>
                    </div>
                    <h3 className="text-xl md:text-3xl font-black text-slate-800 font-number tracking-tight">${cashTotal.toLocaleString()}</h3>
                    <p className="text-[10px] text-slate-400 mt-1 font-bold">佔總開銷 <span className="font-number">{totalExpense > 0 ? Math.round((cashTotal / totalExpense) * 100) : 0}%</span></p>
                </div>

                <div className="bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 hover:shadow-lg hover:shadow-purple-100/50 hover:-translate-y-1 transition-all duration-300 group">
                    <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
                        <div className="p-2 md:p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform duration-300"><CreditCard size={16} className="md:w-5 md:h-5" /></div>
                        <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest truncate font-display">刷卡總計</p>
                    </div>
                    <h3 className="text-xl md:text-3xl font-black text-slate-800 font-number tracking-tight">${creditCardTotal.toLocaleString()}</h3>
                    <p className="text-[10px] text-slate-400 mt-1 font-bold">目前已刷金額</p>
                </div>
            </div>

            <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <div className="p-2 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-xl shadow-lg shadow-indigo-200"><TrendingUp size={20} /></div>
                    <h3 className="text-base md:text-lg font-black text-slate-800">信用卡動態分析</h3>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-md ml-auto font-medium">點擊卡片查看明細</span>
                </div>
                {/* Credit Card Grid: 2 cols on mobile, 3 cols on lg */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                    {cardStatus.map((c) => (
                        <div
                            key={c.bank}
                            onClick={() => setDetailView({ type: 'card', title: c.bank })}
                            className="relative overflow-hidden p-4 md:p-5 border border-slate-100 rounded-2xl bg-gradient-to-br from-white to-slate-50 hover:from-indigo-50 hover:to-purple-50 hover:shadow-lg hover:shadow-indigo-100/40 hover:border-indigo-200 cursor-pointer transition-all duration-300 group active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                            tabIndex={0}
                            role="button"
                            aria-label={`查看 ${c.bank} 詳細資訊`}
                        >
                            {/* Card Header */}
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg shadow-sm">
                                        <CreditCard size={14} className="text-white" />
                                    </div>
                                    <span className="text-sm md:text-base font-black text-slate-800">{c.bank}</span>
                                </div>
                                <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                            </div>

                            {/* 未出帳區塊 - 主要金額 */}
                            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-3 mb-3 border border-amber-100">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                                    <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">未出帳</span>
                                </div>
                                <p className="text-xl md:text-2xl font-black text-slate-800">
                                    ${c.unbilled.toLocaleString()}
                                </p>
                                <p className="text-[10px] text-amber-500 font-medium mt-0.5">預估下期卡費</p>
                            </div>

                            {/* 已核帳區塊 */}
                            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-3 border border-emerald-100">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">本期已核</span>
                                </div>
                                <p className="text-lg md:text-xl font-black text-slate-700">
                                    ${c.billedRecent.toLocaleString()}
                                </p>
                                <p className="text-[10px] text-emerald-500 font-medium mt-0.5">已對帳確認</p>
                            </div>

                            {/* 裝飾背景 */}
                            <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-gradient-to-br from-indigo-100/30 to-purple-100/30 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Installment Progress Section */}
            {installmentProgress.items.length > 0 && (
                <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3 mb-4 md:mb-6">
                        <div className="p-2 bg-violet-600 text-white rounded-xl"><CalendarClock size={20} /></div>
                        <h3 className="text-base md:text-lg font-black text-slate-800">分期付款進度</h3>
                        <div className="ml-auto flex items-center gap-2 bg-violet-50 text-violet-700 px-3 py-1.5 rounded-xl border border-violet-100">
                            <span className="text-[10px] font-bold uppercase tracking-wide">本月分期總額</span>
                            <span className="text-sm md:text-base font-black">${installmentProgress.monthlyTotal.toLocaleString()}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                        {installmentProgress.items.map((item) => (
                            <div
                                key={item.name}
                                className="p-4 md:p-5 border border-slate-100 rounded-xl md:rounded-2xl bg-gradient-to-br from-slate-50/80 to-white hover:shadow-md transition-all"
                            >
                                {/* Header: Name & Bank */}
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm md:text-base font-black text-slate-800 truncate">{item.name}</h4>
                                        <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded inline-flex items-center gap-1 mt-1">
                                            <CreditCard size={10} /> {item.cardBank}
                                        </span>
                                    </div>
                                    <div className="text-right shrink-0 ml-3">
                                        <span className="text-[10px] font-bold text-slate-400 block">到期月份</span>
                                        <span className="text-xs md:text-sm font-black text-slate-600">{item.endMonth}</span>
                                    </div>
                                </div>

                                {/* Stats Row */}
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">期數</span>
                                        <span className="text-xs font-black text-slate-700">
                                            <span className="text-emerald-600">{item.paidPeriods}</span>/{item.totalPeriods}期
                                        </span>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">每期</span>
                                        <span className="text-xs font-black text-slate-700">${item.amountPerPeriod.toLocaleString()}</span>
                                    </div>
                                    <div className="bg-amber-50 rounded-lg p-2 text-center">
                                        <span className="text-[9px] font-bold text-amber-600 uppercase block">剩餘</span>
                                        <span className="text-xs font-black text-amber-700">${item.remainingAmount.toLocaleString()}</span>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-slate-400">繳款進度</span>
                                        <span className="text-xs font-black text-violet-600">{item.progress}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-700"
                                            style={{ width: `${item.progress}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[9px] font-bold text-slate-400">
                                        <span>已繳 {item.paidPeriods} 期</span>
                                        <span>剩餘 {item.remainingPeriods} 期</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 h-[320px] md:h-[450px] flex flex-col relative">
                    <h3 className="text-base md:text-lg font-black text-slate-800 mb-4 md:mb-6 flex items-center gap-2">消費比例圖 <span className="text-[10px] font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded-full">點擊區塊</span></h3>
                    <div className="w-full flex-1 flex items-center justify-center overflow-hidden">
                        {categoryData.length > 0 ? (
                            <svg viewBox="-170 -140 340 280" className="w-full h-full max-w-[450px] max-h-[380px]">
                                {/* Donut segments with labels */}
                                {(() => {
                                    const segments: React.ReactNode[] = [];
                                    let currentAngle = -90; // Start from top
                                    const radius = 65;
                                    const innerRadius = 40;

                                    // Pre-calculate all label positions for collision avoidance
                                    const labelPositions: { x: number, y: number, textAnchor: string, midRad: number }[] = [];
                                    let tempAngle = -90;
                                    categoryData.forEach((item, index) => {
                                        const percent = item.value / totalExpense;
                                        const angle = percent * 360;
                                        const midAngle = tempAngle + angle / 2;
                                        const midRad = (midAngle * Math.PI) / 180;
                                        // Stagger radius: alternate between different radii to avoid overlap
                                        const staggeredRadius = 95 + (index % 3) * 18;
                                        const labelX = Math.cos(midRad) * staggeredRadius;
                                        const labelY = Math.sin(midRad) * staggeredRadius;
                                        const textAnchor = midAngle > -90 && midAngle < 90 ? 'start' : 'end';
                                        labelPositions.push({ x: labelX, y: labelY, textAnchor, midRad });
                                        tempAngle += angle;
                                    });

                                    categoryData.forEach((item, index) => {
                                        const percent = item.value / totalExpense;
                                        const angle = percent * 360;
                                        const startAngle = currentAngle;
                                        const endAngle = currentAngle + angle;
                                        const midAngle = startAngle + angle / 2;

                                        // Calculate arc path
                                        const startRad = (startAngle * Math.PI) / 180;
                                        const endRad = (endAngle * Math.PI) / 180;
                                        const midRad = (midAngle * Math.PI) / 180;

                                        const x1 = Math.cos(startRad) * radius;
                                        const y1 = Math.sin(startRad) * radius;
                                        const x2 = Math.cos(endRad) * radius;
                                        const y2 = Math.sin(endRad) * radius;
                                        const x1i = Math.cos(startRad) * innerRadius;
                                        const y1i = Math.sin(startRad) * innerRadius;
                                        const x2i = Math.cos(endRad) * innerRadius;
                                        const y2i = Math.sin(endRad) * innerRadius;

                                        const largeArcFlag = angle > 180 ? 1 : 0;

                                        const pathData = [
                                            `M ${x1i} ${y1i}`,
                                            `L ${x1} ${y1}`,
                                            `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                                            `L ${x2i} ${y2i}`,
                                            `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x1i} ${y1i}`,
                                            'Z'
                                        ].join(' ');

                                        // Get pre-calculated label position
                                        const labelPos = labelPositions[index];
                                        const outerEdgeX = Math.cos(midRad) * (radius + 3);
                                        const outerEdgeY = Math.sin(midRad) * (radius + 3);
                                        const displayPercent = Math.round(percent * 100);

                                        segments.push(
                                            <g key={item.name}>
                                                <path
                                                    d={pathData}
                                                    fill={item.color}
                                                    className="cursor-pointer transition-all duration-200 hover:opacity-80"
                                                    style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
                                                    onClick={() => setDetailView({ type: 'category', title: item.name })}
                                                />
                                                {/* Connecting line */}
                                                <line
                                                    x1={outerEdgeX}
                                                    y1={outerEdgeY}
                                                    x2={labelPos.x + (labelPos.textAnchor === 'start' ? -3 : 3)}
                                                    y2={labelPos.y}
                                                    stroke={item.color}
                                                    strokeWidth={1}
                                                    className="pointer-events-none"
                                                />
                                                <text
                                                    x={labelPos.x}
                                                    y={labelPos.y}
                                                    textAnchor={labelPos.textAnchor}
                                                    dominantBaseline="middle"
                                                    className="text-[8px] md:text-[9px] font-bold pointer-events-none"
                                                    style={{ fill: item.color }}
                                                >
                                                    {item.name} {displayPercent}%
                                                </text>
                                            </g>
                                        );

                                        currentAngle = endAngle;
                                    });

                                    return segments;
                                })()}
                                {/* Center circle with total */}
                                <circle cx="0" cy="0" r={38} fill="white" />
                                <text x="0" y="-6" textAnchor="middle" className="text-[7px] fill-slate-400 font-bold">總支出</text>
                                <text x="0" y="10" textAnchor="middle" className="text-[11px] md:text-[13px] fill-slate-800 font-black">${totalExpense.toLocaleString()}</text>
                            </svg>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full animate-fade-in">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                                    <PieChartIcon className="text-slate-300" size={32} />
                                </div>
                                <p className="text-slate-500 text-sm font-bold">無消費數據</p>
                                <p className="text-slate-400 text-xs mt-1">本月尚無支出紀錄</p>
                            </div>
                        )}
                    </div>
                </div>
                {/* Category Ranking: Removed fixed height, removed scrollbar to show all items */}
                <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 h-auto min-h-[320px] flex flex-col">
                    <h3 className="text-base md:text-lg font-black text-slate-800 mb-4 md:mb-6 flex items-center gap-2">分類支出排行 <span className="text-[10px] font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded-full">點擊查看明細</span></h3>
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
                                    <div className="h-full rounded-full" style={{ backgroundColor: item.color, width: `${(item.value / totalExpense) * 100}%` }}></div>
                                </div>
                            </div>
                        ))}
                        {categoryData.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-10 animate-fade-in">
                                <div className="p-3 bg-slate-50 rounded-full mb-3">
                                    <List size={24} className="text-slate-300" />
                                </div>
                                <p className="text-slate-400 text-sm font-medium">無相關消費數據</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {detailView && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setDetailView(null)}>
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Consumption Details</span>
                                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                    {detailView.type === 'card' ? <CreditCard size={20} className="text-indigo-500" /> : <Wallet size={20} className="text-emerald-500" />}
                                    {detailView.title}
                                </h3>
                            </div>
                            <button onClick={() => setDetailView(null)} className="p-2 bg-white rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors border border-slate-100 shadow-sm">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-2 overflow-y-auto max-h-[60vh] scrollbar-hide">
                            {detailedTransactions.length > 0 ? (
                                <div className="space-y-1">
                                    {detailedTransactions.map((t, idx) => (
                                        <div key={t.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-2xl transition-colors border border-transparent hover:border-slate-100">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-400 text-[10px] shrink-0">
                                                {idx + 1}
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
                                <div className="text-center py-10 text-slate-400 text-sm italic">
                                    無消費紀錄
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-center">
                            <button onClick={() => setDetailView(null)} className="text-xs font-bold text-slate-500 hover:text-slate-800">
                                關閉視窗 (共 {detailedTransactions.length} 筆)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
