import React from 'react';

interface CategoryChartProps {
    categories: { name: string; value: number; count: number; color: string }[];
    total: number;
    onSelect: (category: string) => void;
}

const money = (amount: number) => '$' + amount.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
const point = (radius: number, angle: number) => {
    const radians = (angle - 90) * Math.PI / 180;
    return [120 + radius * Math.cos(radians), 120 + radius * Math.sin(radians)].join(' ');
};

// 每個分類使用獨立封閉弧形；點擊範圍與實際可見區塊相同。
const segmentPath = (start: number, end: number) => {
    if (end - start >= 359.999999) {
        return 'M 120 24 A 96 96 0 1 1 120 216 A 96 96 0 1 1 120 24 '
            + 'M 120 60 A 60 60 0 1 0 120 180 A 60 60 0 1 0 120 60 Z';
    }
    const largeArc = end - start > 180 ? 1 : 0;
    return 'M ' + point(96, start) + ' A 96 96 0 ' + largeArc + ' 1 ' + point(96, end)
        + ' L ' + point(60, end) + ' A 60 60 0 ' + largeArc + ' 0 ' + point(60, start) + ' Z';
};

const CategoryChart: React.FC<CategoryChartProps> = ({ categories, total, onSelect }) => {
    const showProportion = total > 0 && categories.every(category => category.value >= 0);
    let angle = 0;

    return (
        <figure className="min-w-0 text-center">
            <svg viewBox="0 0 240 240" width="240" height="240" role="group" aria-label="消費分類圓環圖，可選擇分類查看明細" className="mx-auto block h-auto w-full" style={{ maxWidth: 240 }}>
                <circle cx="120" cy="120" r="78" fill="none" stroke="#e2e8f0" strokeWidth="36" aria-hidden="true" />
                {showProportion && categories.filter(category => category.value > 0).map(category => {
                    const start = angle;
                    angle = Math.min(360, angle + category.value / total * 360);
                    const percentage = Math.round(category.value / total * 100);
                    const label = category.name + '，' + money(category.value) + '，' + percentage + '%，' + category.count + ' 筆，查看明細';
                    return <path key={category.name} d={segmentPath(start, angle)} fill={category.color} fillRule="evenodd"
                        role="button" tabIndex={0} aria-label={label}
                        onClick={() => onSelect(category.name)}
                        onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(category.name); }
                        }}
                        className="cursor-pointer transition-opacity hover:opacity-80 focus:outline-none focus-visible:stroke-slate-900 focus-visible:stroke-2">
                        <title>{label}</title>
                    </path>;
                })}
                <text x="120" y="114" textAnchor="middle" fill="#64748b" fontSize="12" pointerEvents="none">已記錄支出</text>
                <text x="120" y="138" textAnchor="middle" fill="#0f172a" fontSize="15" fontWeight="700" pointerEvents="none">{money(total)}</text>
            </svg>
            <figcaption className="mt-1 text-xs leading-relaxed text-slate-500">{showProportion ? '點擊圖形或列表分類查看明細' : '此資料不顯示比例，請查看分類金額'}</figcaption>
        </figure>
    );
};

export default CategoryChart;
