import { CardSetting, Transaction } from '../types';

// 以「本地時區」格式化 YYYY-MM-DD。
// 不可改用 toISOString()：它輸出 UTC，在台灣 (UTC+8) 會把日期往前推一天，
// 造成所有帳單週期界線提早一日。
export const formatLocalDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// 本地時區的 YYYY-MM（給「當前月份」預設值用，同樣避開 toISOString 的 UTC 偏移）
export const formatLocalYearMonth = (d: Date): string => formatLocalDate(d).slice(0, 7);

// 以本地時區解析 YYYY-MM-DD。
// 不可用 new Date('YYYY-MM-DD')：純日期字串會被解析成 UTC 午夜，與本地 getter/formatter 混用會產生偏移。
export const parseLocalDate = (dateStr: string): Date => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
};

// 月份字串加減 n 個月（yearMonth: YYYY-MM）。
// 不可用 new Date('YYYY-MM-01') 解析：純日期字串會被當成 UTC 午夜，跨時區有偏移風險。
export const shiftYearMonth = (yearMonth: string, delta: number): string => {
    const [y, m] = yearMonth.split('-').map(Number);
    return formatLocalYearMonth(new Date(y, m - 1 + delta, 1));
};

// month: 1-12
const daysInMonth = (year: number, month: number): number => new Date(year, month, 0).getDate();

export interface CycleRange {
    start: string; // YYYY-MM-DD（上期結帳日隔天）
    end: string;   // YYYY-MM-DD（本期結帳日）
}

// 「帳單月 M」的結帳日落在 M 還是 M+1：
// 優先尊重使用者在設定頁勾選的「次月結帳」；未設定時退回舊慣例（結帳日 1-14 → 次月、15-31 → 當月）
const statementFallsNextMonth = (setting: CardSetting): boolean =>
    setting.isNextMonth !== undefined ? setting.isNextMonth : setting.statementDay < 15;

// 取得「帳單月 yearMonth」的消費週期。
// statementDay 超過該月天數時取該月最後一天（例：結帳日 31 遇到 2 月 → 2/28 或 2/29）。
export const getCycleRange = (setting: CardSetting | undefined, yearMonth: string): CycleRange | null => {
    if (!setting || !setting.statementDay) return null;

    const [year, month] = yearMonth.split('-').map(Number);

    let targetYear = year;
    let targetMonth = month;
    if (statementFallsNextMonth(setting)) {
        targetMonth = month + 1;
        if (targetMonth > 12) {
            targetMonth = 1;
            targetYear = year + 1;
        }
    }

    const endDay = Math.min(setting.statementDay, daysInMonth(targetYear, targetMonth));
    const endDate = new Date(targetYear, targetMonth - 1, endDay);

    let prevYear = targetYear;
    let prevMonth = targetMonth - 1;
    if (prevMonth < 1) {
        prevMonth = 12;
        prevYear -= 1;
    }
    const prevEndDay = Math.min(setting.statementDay, daysInMonth(prevYear, prevMonth));
    const startDate = new Date(prevYear, prevMonth - 1, prevEndDay);
    startDate.setDate(startDate.getDate() + 1);

    return { start: formatLocalDate(startDate), end: formatLocalDate(endDate) };
};

// 交易是否計入該週期的「已核銷」：
// 交易日不晚於週期末，且（交易日落在週期內，或核銷動作發生在週期開始之後——涵蓋補核銷舊帳的情況）
export const isReconciledInCycle = (t: Transaction, range: CycleRange): boolean => {
    if (!t.isReconciled) return false;
    if (t.date > range.end) return false;
    if (t.date >= range.start) return true;
    // reconciledDate 是完整 ISO 時間戳，先轉成本地日曆日再比對（直接 split('T') 會拿到 UTC 日期）
    if (t.reconciledDate && formatLocalDate(new Date(t.reconciledDate)) >= range.start) return true;
    return false;
};
