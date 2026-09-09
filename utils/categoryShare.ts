/** 小額分類保留可見占比；無法計算時不以零替代。 */
export function formatCategoryPercent(value: number, total: number): string {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0 || value < 0) return '—';
    const percent = value / total * 100;
    if (percent > 0 && percent < 0.1) return '<0.1%';
    return percent.toLocaleString('zh-TW', { maximumFractionDigits: 1 }) + '%';
}
import { getCategoryColor } from '../constants';

/** 以全部紀錄建立固定配色，切換月份或金額排序時仍保留分類顏色。 */
export function categoryColors(names: string[]): Map<string, string> {
    const palette = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#374151', '#0891b2', '#84a30b'];
    const sorted = [...new Set(names)].sort();
    const result = new Map<string, string>();
    for (const name of sorted) {
        const color = getCategoryColor(name);
        if (color.startsWith('#')) result.set(name, color);
    }
    for (const name of sorted) {
        if (result.has(name)) continue;
        const available = palette.find(color => ![...result.values()].includes(color));
        result.set(name, available ?? getCategoryColor(name));
    }
    return result;
}
