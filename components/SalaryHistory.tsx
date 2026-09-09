import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, DollarSign, Calendar, Activity, Pencil, X } from 'lucide-react';
import { SalaryAdjustment } from '../types';
import { formatLocalYearMonth } from '../utils/billing';
import { growthPercent, isValidTransactionDate, parseMoney } from '../utils/transactions';

interface SalaryHistoryProps {
    adjustments: SalaryAdjustment[];
    onAddAdjustment: (adjustment: Omit<SalaryAdjustment, 'id'>) => void;
    onEditAdjustment: (id: string, adjustment: Omit<SalaryAdjustment, 'id'>) => void;
    onDeleteAdjustment: (id: string) => void;
}

export function calculateSalaryStatistics(adjustments: SalaryAdjustment[]) {
    if (adjustments.length < 2) return null;
    const sorted = [...adjustments].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const years = (Date.parse(`${last.date}-01`) - Date.parse(`${first.date}-01`)) / (1000 * 60 * 60 * 24 * 365);
    const salaryGrowth = last.totalSalary - first.totalSalary;
    const firstInsurance = first.laborInsurance + first.healthInsurance;
    const lastInsurance = last.laborInsurance + last.healthInsurance;
    const cagr = years >= 1 && first.totalSalary > 0 && last.totalSalary >= 0 ? (Math.pow(last.totalSalary / first.totalSalary, 1 / years) - 1) * 100 : null;
    return {
        salaryGrowth,
        salaryGrowthPercent: growthPercent(first.totalSalary, last.totalSalary),
        insuranceGrowth: lastInsurance - firstInsurance,
        insuranceGrowthPercent: growthPercent(firstInsurance, lastInsurance),
        cagr: cagr !== null && Number.isFinite(cagr) ? cagr : null,
        cagrReason: years < 1 ? '未滿一年' : '基期無法計算',
    };
}

export function prepareSalaryAdjustment(values: { date: string; totalSalary: string; adjustmentItem: string; laborInsurance: string; healthInsurance: string; mealCost: string; welfareFund: string }, adjustments: SalaryAdjustment[], editingId: string | null): Omit<SalaryAdjustment, 'id'> {
    if (!isValidTransactionDate(`${values.date}-01`) || !values.adjustmentItem.trim()) throw new Error('請填寫有效生效年月與調整原因。');
    const totalSalary = parseMoney(values.totalSalary);
    const laborInsurance = parseMoney(values.laborInsurance);
    const healthInsurance = parseMoney(values.healthInsurance);
    const mealCost = parseMoney(values.mealCost);
    const welfareFund = parseMoney(values.welfareFund);
    if (totalSalary === null || laborInsurance === null || healthInsurance === null || mealCost === null || welfareFund === null) throw new Error('薪資與每項扣款皆須填寫完整數字；沒有扣款請明確填 0。');
    const previous = adjustments.filter(adjustment => adjustment.id !== editingId && adjustment.date < values.date).sort((a, b) => b.date.localeCompare(a.date))[0];
    return { date: values.date, totalSalary, adjustmentItem: values.adjustmentItem.trim(), adjustmentAmount: previous ? totalSalary - previous.totalSalary : 0, laborInsurance, healthInsurance, mealCost, welfareFund };
}

const inputClass = 'w-full min-h-11 p-3 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
const buttonClass = 'min-h-11 px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50';
const primaryClass = 'min-h-11 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700';
const fieldString = (value: number | undefined): string => value !== undefined && Number.isFinite(value) ? String(value) : '';
const signedAmount = (amount: number) => `${amount >= 0 ? '+' : '−'}$${Math.abs(amount).toLocaleString()}`;

const SalaryHistory: React.FC<SalaryHistoryProps> = ({ adjustments, onAddAdjustment, onEditAdjustment, onDeleteAdjustment }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [date, setDate] = useState(formatLocalYearMonth(new Date()));
    const [totalSalary, setTotalSalary] = useState('');
    const [adjustmentItem, setAdjustmentItem] = useState('');
    const [laborInsurance, setLaborInsurance] = useState('');
    const [healthInsurance, setHealthInsurance] = useState('');
    const [mealCost, setMealCost] = useState('');
    const [welfareFund, setWelfareFund] = useState('');
    const [prefilledFrom, setPrefilledFrom] = useState('');
    const [formError, setFormError] = useState('');
    const [notice, setNotice] = useState('');
    const dialogRef = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (isAdding && !dialogRef.current?.open) dialogRef.current?.showModal();
        if (!isAdding && dialogRef.current?.open) dialogRef.current.close();
    }, [isAdding]);
    const sortedAdjustments = useMemo(() => [...adjustments].sort((a, b) => b.date.localeCompare(a.date)), [adjustments]);
    const chronologicalAdjustments = useMemo(() => [...adjustments].sort((a, b) => a.date.localeCompare(b.date)), [adjustments]);
    const statistics = useMemo(() => calculateSalaryStatistics(adjustments), [adjustments]);
    const sameMonthCount = adjustments.filter(adjustment => adjustment.id !== editingId && adjustment.date === date).length;
    const hasDuplicateMonth = new Set(adjustments.map(adjustment => adjustment.date)).size !== adjustments.length;
    const openAdd = () => {
        const last = sortedAdjustments[0];
        setEditingId(null);
        setDate(formatLocalYearMonth(new Date()));
        setTotalSalary('');
        setAdjustmentItem('');
        setLaborInsurance(fieldString(last?.laborInsurance));
        setHealthInsurance(fieldString(last?.healthInsurance));
        setMealCost(fieldString(last?.mealCost));
        setWelfareFund(fieldString(last?.welfareFund));
        setPrefilledFrom(last?.date ?? '');
        setFormError('');
        setIsAdding(true);
    };
    const openEdit = (adjustment: SalaryAdjustment) => {
        setEditingId(adjustment.id);
        setDate(adjustment.date);
        setTotalSalary(fieldString(adjustment.totalSalary));
        setAdjustmentItem(adjustment.adjustmentItem);
        setLaborInsurance(fieldString(adjustment.laborInsurance));
        setHealthInsurance(fieldString(adjustment.healthInsurance));
        setMealCost(fieldString(adjustment.mealCost));
        setWelfareFund(fieldString(adjustment.welfareFund));
        setPrefilledFrom('');
        setFormError('');
        setIsAdding(true);
    };
    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        setFormError('');
        try {
            const next = prepareSalaryAdjustment({ date, totalSalary, adjustmentItem, laborInsurance, healthInsurance, mealCost, welfareFund }, adjustments, editingId);
            if (editingId) {
                if (!adjustments.some(adjustment => adjustment.id === editingId)) throw new Error('這筆紀錄已不存在，請關閉表單後重新確認。');
                onEditAdjustment(editingId, next);
            } else onAddAdjustment(next);
            setNotice(editingId ? '已更新薪資紀錄。' : '已新增薪資紀錄。');
            setIsAdding(false);
        } catch (error) { setFormError(error instanceof Error ? error.message : '儲存失敗，請重試。'); }
    };
    const getIncrease = (adjustment: SalaryAdjustment) => {
        const index = chronologicalAdjustments.findIndex(value => value.id === adjustment.id);
        if (index <= 0 || hasDuplicateMonth) return null;
        const previous = chronologicalAdjustments[index - 1];
        return { diff: adjustment.totalSalary - previous.totalSalary, percent: growthPercent(previous.totalSalary, adjustment.totalSalary) };
    };

    return <div className="space-y-6">
        {hasDuplicateMonth && <p className="p-3 bg-amber-50 text-amber-900 rounded-xl text-sm">有同月多筆薪資紀錄，生效順序待確認。請檢查是否為重複輸入；成長率暫不顯示。</p>}
        {statistics && !hasDuplicateMonth && <div className="summary-grid summary-grid-three">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-5 text-white"><h3 className="flex items-center gap-2 text-sm font-bold"><Activity size={18} />總薪資成長率</h3><p className="mt-3 text-3xl font-black">{statistics.salaryGrowthPercent === null ? <span className="text-lg">基期無法計算</span> : `${statistics.salaryGrowthPercent.toFixed(1)}%`}</p><p className="mt-2 text-sm">累積變動 {signedAmount(statistics.salaryGrowth)}</p></div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-600"><TrendingUp size={18} />年度平均成長率</h3><p className="mt-3 text-3xl font-black">{statistics.cagr === null ? <span className="text-lg text-slate-500">{statistics.cagrReason}</span> : `${statistics.cagr.toFixed(1)}%`}</p><p className="mt-2 text-sm text-slate-500">年均複合成長率 (CAGR)</p></div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-600"><TrendingDown size={18} />勞健保費變動率</h3><p className="mt-3 text-3xl font-black">{statistics.insuranceGrowthPercent === null ? <span className="text-lg text-slate-500">基期無法計算</span> : `${statistics.insuranceGrowthPercent.toFixed(1)}%`}</p><p className="mt-2 text-sm text-slate-500">變動金額 {signedAmount(statistics.insuranceGrowth)}</p></div>
        </div>}
        <div className="flex flex-wrap justify-between items-center gap-3 w-fit max-w-full bg-white p-3 rounded-xl border border-slate-200"><div><h2 className="text-lg font-bold">薪資調整歷程</h2><p className="text-sm text-slate-500">記錄生效月份、薪資與各項扣款</p></div><button type="button" onClick={openAdd} className={`${primaryClass} flex items-center gap-2`}><Plus size={18} />新增紀錄</button></div>
        {notice && <p role="status" className="p-3 bg-indigo-50 text-indigo-800 rounded-xl text-sm">{notice}</p>}
        <dialog ref={dialogRef} aria-labelledby="salary-dialog-title" onCancel={() => setIsAdding(false)} onClose={() => setIsAdding(false)} style={{ width: 'calc(100% - 1rem)', maxHeight: 'calc(100dvh - 2rem)' }} className="m-auto max-w-xl p-0 rounded-2xl shadow-2xl overflow-y-auto backdrop:bg-slate-900/60">
            <div className="sticky top-0 z-10 p-4 border-b border-slate-200 flex justify-between items-center bg-white"><h2 id="salary-dialog-title" className="text-lg font-bold flex items-center gap-2"><DollarSign size={20} className="text-indigo-600" />{editingId ? '編輯薪資調整紀錄' : '新增薪資調整紀錄'}</h2><button type="button" aria-label="關閉薪資表單" onClick={() => setIsAdding(false)} className="min-h-11 min-w-11 p-3 rounded-xl hover:bg-slate-100"><X size={20} /></button></div>
            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><label className="text-sm font-bold block">生效月份<input autoFocus required type="month" value={date} onChange={event => setDate(event.target.value)} className={`${inputClass} mt-1`} /></label><label className="text-sm font-bold block">調整後總薪資<input required type="number" step="any" value={totalSalary} onChange={event => setTotalSalary(event.target.value)} className={`${inputClass} mt-1`} placeholder="請輸入薪資" /></label></div>
                {sameMonthCount > 0 && <p className="p-3 bg-amber-50 text-amber-900 text-sm rounded-xl">{date} 已有 {sameMonthCount} 筆其他紀錄，請確認生效月份。如為更正，可取消後編輯既有紀錄。</p>}
                <label className="text-sm font-bold block">調整原因<input required type="text" value={adjustmentItem} onChange={event => setAdjustmentItem(event.target.value)} className={`${inputClass} mt-1`} placeholder="例如：年度調薪" /></label>
                <fieldset className="p-4 bg-rose-50/50 rounded-xl border border-rose-100"><legend className="text-sm font-bold text-rose-700 px-1">每月扣除項目</legend><p className="text-sm text-slate-600 mb-3">各項皆須填寫；沒有扣款請明確填 0。{prefilledFrom && `已帶入 ${prefilledFrom} 的扣項，請逐項確認。`}</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{([{ label: '勞保費', value: laborInsurance, setter: setLaborInsurance }, { label: '健保費', value: healthInsurance, setter: setHealthInsurance }, { label: '伙食費', value: mealCost, setter: setMealCost }, { label: '福利金', value: welfareFund, setter: setWelfareFund }]).map(field => <label key={field.label} className="text-sm font-bold block">{field.label}<input required type="number" step="any" value={field.value} onChange={event => field.setter(event.target.value)} className={`${inputClass} mt-1`} placeholder="無扣款填 0" /></label>)}</div></fieldset>
                {formError && <p role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm">{formError}</p>}
                <div className="sticky bottom-0 bg-white py-3 border-t border-slate-200 flex justify-end gap-2"><button type="button" onClick={() => setIsAdding(false)} className={buttonClass}>取消</button><button type="submit" className={primaryClass}>儲存紀錄</button></div>
            </form>
        </dialog>
        <div className="space-y-4">{sortedAdjustments.map(adjustment => {
            const increase = getIncrease(adjustment);
            const deductions = adjustment.laborInsurance + adjustment.healthInsurance + adjustment.mealCost + adjustment.welfareFund;
            return <article key={adjustment.id} className="max-w-4xl bg-white rounded-xl border border-slate-200 p-3"><div className="flex flex-col md:flex-row gap-4"><div className="md:min-w-40"><p className="flex items-center gap-2 text-sm text-slate-500"><Calendar size={16} />{adjustment.date}</p><p className="text-2xl font-black mt-1">${adjustment.totalSalary.toLocaleString()}</p>{increase && <p className={`text-sm mt-1 ${increase.diff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{signedAmount(increase.diff)} · {increase.percent === null ? '基期無法計算成長率' : `${increase.percent.toFixed(1)}%`}</p>}<p className="text-sm text-indigo-700 mt-2 break-words">{adjustment.adjustmentItem}</p></div><dl className="flex-1 grid grid-cols-2 gap-3 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">{[{ label: '勞保費', value: adjustment.laborInsurance }, { label: '健保費', value: adjustment.healthInsurance }, { label: '伙食費', value: adjustment.mealCost }, { label: '福利金', value: adjustment.welfareFund }].map(field => <div key={field.label}><dt className="text-xs text-slate-500">{field.label}</dt><dd className="text-sm font-bold mt-1">${field.value.toLocaleString()}</dd></div>)}</dl><div className="flex md:flex-col justify-between gap-2 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4"><div><p className="text-xs text-slate-500">每月扣款合計</p><p className="text-sm font-bold text-rose-700">${deductions.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">每月實領</p><p className="text-xl font-black text-emerald-700">${(adjustment.totalSalary - deductions).toLocaleString()}</p></div></div></div><div className="flex justify-end gap-2 mt-3"><button type="button" onClick={() => openEdit(adjustment)} className={`${buttonClass} flex items-center gap-2`} aria-label={`編輯 ${adjustment.date} ${adjustment.adjustmentItem}`}><Pencil size={16} />編輯</button><button type="button" onClick={() => { if (window.confirm(`確定刪除 ${adjustment.date}「${adjustment.adjustmentItem}」？刪除後無法直接復原。`)) { onDeleteAdjustment(adjustment.id); setNotice('已刪除薪資紀錄。'); } }} className="min-h-11 px-4 py-2 rounded-xl text-sm text-rose-700 hover:bg-rose-50 flex items-center gap-2" aria-label={`刪除 ${adjustment.date} ${adjustment.adjustmentItem}`}><Trash2 size={16} />刪除</button></div></article>;
        })}{sortedAdjustments.length === 0 && <p className="text-center py-12 text-slate-500 text-sm bg-slate-50 rounded-2xl border border-slate-200 border-dashed">尚無薪資調整紀錄，新增第一筆作為比較基準。</p>}</div>
    </div>;
};
export default SalaryHistory;
