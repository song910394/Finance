import { expect, it } from 'vitest';
import { categoryColors, formatCategoryPercent } from './categoryShare';
it('十項分類顏色不重複，保留預設色且不受輸入排序影響', () => {
    const names = ['食', '衣', ...Array.from({ length: 8 }, (_, i) => '分類' + i)];
    const colors = categoryColors(names);
    expect(new Set(colors.values()).size).toBe(10);
    expect(colors.get('食')).toBe('#ef4444');
    expect(categoryColors([...names].reverse())).toEqual(colors);
});
it('分類占比顯示一位小數，保留極小額與明確零元', () => {
    expect(formatCategoryPercent(1, 3)).toBe('33.3%');
    expect(formatCategoryPercent(1, 10000)).toBe('<0.1%');
    expect(formatCategoryPercent(0, 100)).toBe('0%');
    expect(formatCategoryPercent(100, 100)).toBe('100%');
});
it('無法計算的占比不顯示為零', () => {
    expect(formatCategoryPercent(1, 0)).toBe('—');
    expect(formatCategoryPercent(-1, 100)).toBe('—');
    expect(formatCategoryPercent(NaN, 100)).toBe('—');
});
