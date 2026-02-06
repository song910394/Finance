
import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, DollarSign, Calendar, ChevronRight, Activity, Percent } from 'lucide-react';
import { SalaryAdjustment } from '../types';

interface SalaryHistoryProps {
    adjustments: SalaryAdjustment[];
    onAddAdjustment: (adjustment: Omit<SalaryAdjustment, 'id'>) => void;
    onDeleteAdjustment: (id: string) => void;
}

const SalaryHistory: React.FC<SalaryHistoryProps> = ({ adjustments, onAddAdjustment, onDeleteAdjustment }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [date, setDate] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [totalSalary, setTotalSalary] = useState('');
    const [adjustmentItem, setAdjustmentItem] = useState('');
    const [laborInsurance, setLaborInsurance] = useState('');
    const [healthInsurance, setHealthInsurance] = useState('');
    const [mealCost, setMealCost] = useState('');
    const [welfareFund, setWelfareFund] = useState('');

    // Pre-fill data when opening modal
    useEffect(() => {
        if (isAdding && adjustments.length > 0) {
            // Find the latest adjustment
            const sorted = [...adjustments].sort((a, b) => b.date.localeCompare(a.date));
            const lastAdj = sorted[0];

            // Pre-fill fields
            setLaborInsurance(lastAdj.laborInsurance.toString());
            setHealthInsurance(lastAdj.healthInsurance.toString());
            setMealCost(lastAdj.mealCost.toString());
            setWelfareFund(lastAdj.welfareFund.toString());
        }
    }, [isAdding, adjustments]);

    // Sort adjustments by date descending
    const sortedAdjustments = useMemo(() => {
        return [...adjustments].sort((a, b) => b.date.localeCompare(a.date));
    }, [adjustments]);

    // Sort by date ascending for trend calculation
    const chronologicalAdjustments = useMemo(() => {
        return [...adjustments].sort((a, b) => a.date.localeCompare(b.date));
    }, [adjustments]);

    // Statistics Calculation
    const statistics = useMemo(() => {
        if (chronologicalAdjustments.length < 2) return null;

        const first = chronologicalAdjustments[0];
        const last = chronologicalAdjustments[chronologicalAdjustments.length - 1];

        // Total Salary Growth
        const salaryGrowth = last.totalSalary - first.totalSalary;
        const salaryGrowthPercent = (salaryGrowth / first.totalSalary) * 100;

        // Years difference
        const firstDate = new Date(first.date + '-01');
        const lastDate = new Date(last.date + '-01');
        const yearsDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

        // CAGR (Compound Annual Growth Rate)
        // Formula: (End Value / Start Value)^(1 / Years) - 1
        let cagr = 0;
        if (yearsDiff >= 1) {
            cagr = (Math.pow(last.totalSalary / first.totalSalary, 1 / yearsDiff) - 1) * 100;
        } else {
            // If less than a year, just annualized simple growth? Or just show absolute?
            // Let's stick to simple total growth if < 1 year to avoid massive annualized numbers for short term.
            // Or maybe just show 0 if not applicable.
            // Actually, "Annual Salary Growth Rate" usually implies YoY or CAGR.
            // If we have less than a year, CAGR is mathematically valid but can be misleading (e.g. 10% in 1 month => huge annual info).
            // Let's fallback to simple growth if years < 1, but labeled differently?
            // Simplification: Just show CAGR if years >= 1, else "N/A" or hide.
            cagr = 0;
        }

        // Insurance Growth (Labor + Health)
        const firstInsurance = first.laborInsurance + first.healthInsurance;
        const lastInsurance = last.laborInsurance + last.healthInsurance;
        const insuranceGrowth = lastInsurance - firstInsurance;
        const insuranceGrowthPercent = firstInsurance > 0 ? (insuranceGrowth / firstInsurance) * 100 : 0;

        return {
            salaryGrowth,
            salaryGrowthPercent,
            cagr: yearsDiff >= 1 ? cagr : null,
            insuranceGrowth,
            insuranceGrowthPercent
        };
    }, [chronologicalAdjustments]);


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Auto-calculate adjustment amount
        const currentSalary = parseFloat(totalSalary) || 0;
        let adjustmentAmount = 0;

        // Find previous record (closest date before current date)
        const previousRecord = sortedAdjustments.find(adj => adj.date < date);

        if (previousRecord) {
            adjustmentAmount = currentSalary - previousRecord.totalSalary;
        } else if (chronologicalAdjustments.length > 0) {
            // If no earlier record exists but there are records (e.g. inserting at the beginning), maybe diff is 0 or current?
            // Usually first record has 0 adjustment or it is the base.
            // Let's assume 0 if it's the very first chronologically.
            // However, if we are adding a record in the middle, we compared to the one before it.
            // If date is earlier than all existing, it's the new "first", so adjustment is 0 (or undefined).
            adjustmentAmount = 0;
        }

        onAddAdjustment({
            date,
            totalSalary: currentSalary,
            adjustmentItem,
            adjustmentAmount,
            laborInsurance: parseFloat(laborInsurance) || 0,
            healthInsurance: parseFloat(healthInsurance) || 0,
            mealCost: parseFloat(mealCost) || 0,
            welfareFund: parseFloat(welfareFund) || 0,
        });
        setIsAdding(false);
        resetForm();
    };

    const resetForm = () => {
        setDate(new Date().toISOString().slice(0, 7));
        setTotalSalary('');
        setAdjustmentItem('');
        setLaborInsurance('');
        setHealthInsurance('');
        setMealCost('');
        setWelfareFund('');
    };

    const calculateNetPay = (adj: SalaryAdjustment) => {
        return adj.totalSalary - adj.laborInsurance - adj.healthInsurance - adj.mealCost - adj.welfareFund;
    };

    const getIncrease = (currentAdj: SalaryAdjustment) => {
        const currentIndex = chronologicalAdjustments.findIndex(a => a.id === currentAdj.id);
        if (currentIndex <= 0) return null;
        const prevAdj = chronologicalAdjustments[currentIndex - 1];
        const diff = currentAdj.totalSalary - prevAdj.totalSalary;
        const percent = prevAdj.totalSalary ? (diff / prevAdj.totalSalary) * 100 : 0;
        return { diff, percent };
    };

    return (
        <div className="space-y-6">
            {/* Statistics Section */}
            {statistics && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-3xl p-6 text-white shadow-lg shadow-indigo-200">
                        <div className="flex items-center gap-3 mb-2 opacity-80">
                            <Activity size={20} />
                            <h3 className="text-sm font-bold uppercase tracking-widest">總體薪資成長</h3>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-black">{statistics.salaryGrowthPercent.toFixed(1)}%</span>
                            <span className="text-sm font-bold mb-1 opacity-80">
                                ( +${statistics.salaryGrowth.toLocaleString()} )
                            </span>
                        </div>
                        {statistics.cagr !== null && (
                            <div className="mt-4 pt-4 border-t border-white/20 flex justify-between items-center">
                                <span className="text-xs font-bold opacity-70">年均複合成長率 (CAGR)</span>
                                <span className="text-lg font-black">{statistics.cagr.toFixed(1)}%</span>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-3 opacity-5">
                            <Percent size={100} />
                        </div>
                        <div className="flex items-center gap-3 mb-2 text-slate-400">
                            <TrendingUp size={20} />
                            <h3 className="text-sm font-bold uppercase tracking-widest">勞健保費漲幅</h3>
                        </div>
                        <div className="flex items-end gap-2 text-slate-800">
                            <span className="text-4xl font-black">{statistics.insuranceGrowthPercent.toFixed(1)}%</span>
                            <span className="text-sm font-bold mb-1 text-slate-400">
                                ( +${statistics.insuranceGrowth.toLocaleString()} )
                            </span>
                        </div>
                        <p className="mt-4 text-xs font-bold text-slate-400">
                            隨著薪資調整，勞健保負擔增加的比例
                        </p>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-lg font-black text-slate-800">薪資調整歷程</h2>
                    <p className="text-xs text-slate-500 font-bold">記錄您的職涯薪資成長與變動</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-100 font-bold text-sm"
                >
                    <Plus size={18} />
                    <span>新增紀錄</span>
                </button>
            </div>

            {isAdding && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                <DollarSign className="text-indigo-500" size={20} /> 新增薪資調整紀錄
                            </h3>
                            <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="grid grid-cols-2 gap-5">
                                    <div className="space-y-1">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">生效日期 (年月)</label>
                                        <input required type="month" value={date} onChange={e => setDate(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">調整後總薪資</label>
                                        <input required type="number" value={totalSalary} onChange={e => setTotalSalary(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-lg font-black focus:ring-2 focus:ring-indigo-500/20 outline-none" placeholder="0" />
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-4 rounded-xl space-y-4 border border-slate-100">
                                    <h4 className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-2">調整細項</h4>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500">調整項目 (例: 年度調薪)</label>
                                            <input required type="text" value={adjustmentItem} onChange={e => setAdjustmentItem(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none" placeholder="輸入調整原因..." />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-rose-50/50 p-4 rounded-xl space-y-4 border border-rose-100/50">
                                    <h4 className="text-xs font-black text-rose-500 uppercase tracking-widest mb-2">每月扣除項目</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500">勞保費</label>
                                            <input type="number" value={laborInsurance} onChange={e => setLaborInsurance(e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-rose-500/20 outline-none" placeholder="0" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500">健保費</label>
                                            <input type="number" value={healthInsurance} onChange={e => setHealthInsurance(e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-rose-500/20 outline-none" placeholder="0" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500">伙食費</label>
                                            <input type="number" value={mealCost} onChange={e => setMealCost(e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-rose-500/20 outline-none" placeholder="0" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500">福利金</label>
                                            <input type="number" value={welfareFund} onChange={e => setWelfareFund(e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-rose-500/20 outline-none" placeholder="0" />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                                    <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-2.5 text-slate-500 hover:text-slate-800 font-bold text-sm">取消</button>
                                    <button type="submit" className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all text-sm">儲存紀錄</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {sortedAdjustments.map((adj) => {
                    const increase = getIncrease(adj);
                    const totalDeductions = adj.laborInsurance + adj.healthInsurance + adj.mealCost + adj.welfareFund;

                    return (
                        <div key={adj.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                            <div className="p-5 flex flex-col md:flex-row gap-6">
                                {/* Left: Date & Basic Info */}
                                <div className="flex flex-col gap-2 min-w-[150px] border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 pr-0 md:pr-4">
                                    <div className="flex items-center gap-2 text-slate-400 font-bold text-xs">
                                        <Calendar size={14} />
                                        {adj.date}
                                    </div>
                                    <div className="text-2xl font-black text-slate-800">${adj.totalSalary.toLocaleString()}</div>
                                    {increase && (
                                        <div className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg w-fit ${increase.diff >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                            {increase.diff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                            <span>{increase.diff >= 0 ? '+' : ''}{increase.diff.toLocaleString()} ({increase.percent.toFixed(1)}%)</span>
                                        </div>
                                    )}
                                    <div className="mt-auto pt-2">
                                        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black">{adj.adjustmentItem}</span>
                                    </div>
                                </div>

                                {/* Middle: Details Grid */}
                                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">勞保費</span>
                                        <span className="text-sm font-bold text-slate-700">-${adj.laborInsurance.toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">健保費</span>
                                        <span className="text-sm font-bold text-slate-700">-${adj.healthInsurance.toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">福利金</span>
                                        <span className="text-sm font-bold text-slate-700">-${adj.welfareFund.toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">伙食費</span>
                                        <span className="text-sm font-bold text-slate-700">-${adj.mealCost.toLocaleString()}</span>
                                    </div>
                                </div>

                                {/* Right: Net Pay & Action */}
                                <div className="flex flex-row md:flex-col justify-between items-end md:items-end gap-2 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 pl-0 md:pl-4 min-w-[150px]">
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">每月扣合計</span>
                                        <span className="text-sm font-bold text-rose-500">-${totalDeductions.toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col items-end mt-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">每月實領</span>
                                        <span className="text-xl font-black text-emerald-600">${calculateNetPay(adj).toLocaleString()}</span>
                                    </div>
                                    <button onClick={() => onDeleteAdjustment(adj.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors mt-auto">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                })}

                {sortedAdjustments.length === 0 && (
                    <div className="text-center py-12 text-slate-400 text-sm font-medium bg-slate-50 rounded-3xl border border-slate-100 border-dashed">
                        尚無薪資調整紀錄
                    </div>
                )}
            </div>
        </div>
    );
};

export default SalaryHistory;
