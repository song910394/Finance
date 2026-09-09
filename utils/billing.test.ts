import { describe, it, expect } from 'vitest';
import { formatLocalDate, formatLocalYearMonth, getCycleRange, getStatementDifference, getStatementSummary, isReconciledInStatement, isYearMonth, needsStatementConfirmation, parseLocalDate, shiftYearMonth } from './billing';
import { PaymentMethod, Transaction } from '../types';

describe('formatLocalDate', () => {
    it('以本地時區輸出 YYYY-MM-DD，不受 UTC 偏移影響', () => {
        // 本地午夜：toISOString() 在 UTC+8 會變成前一天，formatLocalDate 必須維持當天
        expect(formatLocalDate(new Date(2026, 6, 1))).toBe('2026-07-01');
        expect(formatLocalDate(new Date(2026, 0, 3))).toBe('2026-01-03');
    });

    it('formatLocalYearMonth 輸出 YYYY-MM', () => {
        expect(formatLocalYearMonth(new Date(2026, 6, 15))).toBe('2026-07');
    });

    it('parseLocalDate 與 formatLocalDate 互為往返（本地午夜，無 UTC 偏移）', () => {
        const d = parseLocalDate('2026-07-01');
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(6);
        expect(d.getDate()).toBe(1);
        expect(d.getHours()).toBe(0);
        expect(formatLocalDate(d)).toBe('2026-07-01');
    });
});

describe('shiftYearMonth', () => {
    it('前後位移一個月', () => {
        expect(shiftYearMonth('2026-07', -1)).toBe('2026-06');
        expect(shiftYearMonth('2026-07', 1)).toBe('2026-08');
    });

    it('跨年位移', () => {
        expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
        expect(shiftYearMonth('2025-12', 1)).toBe('2026-01');
    });
});

describe('getCycleRange', () => {
    it('未設定或結帳日為 0 時回傳 null', () => {
        expect(getCycleRange(undefined, '2026-07')).toBeNull();
        expect(getCycleRange({ statementDay: 0 }, '2026-07')).toBeNull();
    });

    it('當月結帳卡（日 15，未勾次月）：週期為上月 16 日 ~ 當月 15 日', () => {
        expect(getCycleRange({ statementDay: 15 }, '2026-07')).toEqual({
            start: '2026-06-16',
            end: '2026-07-15',
        });
    });

    it('次月結帳卡（日 3，未設 isNextMonth → 慣例推斷）：帳單月 12 月的週期跨年', () => {
        expect(getCycleRange({ statementDay: 3 }, '2025-12')).toEqual({
            start: '2025-12-04',
            end: '2026-01-03',
        });
    });

    it('明確勾選次月結帳（日 20）：優先於「15 日以上算當月」的慣例', () => {
        expect(getCycleRange({ statementDay: 20, isNextMonth: true }, '2026-07')).toEqual({
            start: '2026-07-21',
            end: '2026-08-20',
        });
    });

    it('明確取消次月結帳（日 3）：優先於「14 日以下算次月」的慣例', () => {
        expect(getCycleRange({ statementDay: 3, isNextMonth: false }, '2026-07')).toEqual({
            start: '2026-06-04',
            end: '2026-07-03',
        });
    });

    it('結帳日 31 遇到短月份：截至該月最後一天（平年 2 月）', () => {
        expect(getCycleRange({ statementDay: 31, isNextMonth: false }, '2026-02')).toEqual({
            start: '2026-02-01', // 1 月 31 日的隔天
            end: '2026-02-28',
        });
    });

    it('結帳日 31 遇到閏年 2 月：截至 2/29', () => {
        expect(getCycleRange({ statementDay: 31, isNextMonth: false }, '2024-02')).toEqual({
            start: '2024-02-01',
            end: '2024-02-29',
        });
    });

    it('結帳日 31、上月只有 30 天：週期起點為當月 1 日', () => {
        expect(getCycleRange({ statementDay: 31, isNextMonth: false }, '2026-07')).toEqual({
            start: '2026-07-01', // 6 月 30 日（31 截到 30）的隔天
            end: '2026-07-31',
        });
    });
});

describe('explicit statement membership', () => {
    const base: Transaction = {
        id: 't1',
        date: '2026-07-01',
        amount: 100,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        cardBank: '玉山',
        category: '食',
        description: '測試',
        isReconciled: true,
    };

    it('5 月消費於 9 月補核只能歸屬明確指定的一個帳單月', () => {
        const transaction = { ...base, date: '2026-05-01', reconciledDate: '2026-09-08T01:00:00.000Z', statementMonth: '2026-09' };
        const included = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].filter(month => isReconciledInStatement(transaction, month));
        expect(included).toEqual(['2026-09']);
        expect(isReconciledInStatement({ ...transaction, isReconciled: false }, '2026-09')).toBe(false);
    });

    it('舊已核銷紀錄沒有月份時保留待確認，不用消費日或 timestamp 推定', () => {
        const legacy = { ...base, reconciledDate: '2026-07-01T00:00:00.000Z' };
        expect(needsStatementConfirmation(legacy)).toBe(true);
        expect(isReconciledInStatement(legacy, '2026-07')).toBe(false);
        expect(needsStatementConfirmation({ ...base, statementMonth: '2026-13' })).toBe(true);
    });

    it('逐筆核銷維持相同的明細核對基準，待核金額遞減', () => {
        const first = { ...base, id: 'first', isReconciled: false, amount: 100 };
        const second = { ...base, id: 'second', isReconciled: false, amount: 200 };
        const before = getStatementSummary([first, second], '玉山', '2026-07', { statementDay: 15 });
        const halfway = getStatementSummary([{ ...first, isReconciled: true, statementMonth: '2026-07' }, second], '玉山', '2026-07', { statementDay: 15 });
        const after = getStatementSummary([first, second].map(t => ({ ...t, isReconciled: true, statementMonth: '2026-07' })), '玉山', '2026-07', { statementDay: 15 });
        expect([before.candidateTotal, halfway.candidateTotal, after.candidateTotal]).toEqual([300, 200, 0]);
        expect([before, halfway, after].map(summary => getStatementDifference(300, summary.knownDetailTotal))).toEqual([0, 0, 0]);
    });

    it('其他帳單月、其他卡別與歷史待確認不混入本期已核', () => {
        const result = getStatementSummary([
            { ...base, statementMonth: '2026-06' },
            { ...base, id: 'other-bank', cardBank: '國泰', statementMonth: '2026-07' },
            { ...base, id: 'legacy' },
            { ...base, id: 'future', date: '2026-07-16', isReconciled: false },
        ], '玉山', '2026-07', { statementDay: 15 });
        expect(result.reconciledTotal).toBe(0);
        expect(result.knownDetailTotal).toBe(0);
        expect(result.unassigned.map(t => t.id)).toEqual(['legacy']);
        expect(result.future.map(t => t.id)).toEqual(['future']);
    });

    it('空白帳單沒有可比較差額，明確輸入零可比較', () => {
        expect(getStatementDifference(undefined, 300)).toBeNull();
        expect(getStatementDifference(0, 0)).toBe(0);
        expect(getStatementDifference(0.3, 0.1 + 0.2)).toBe(0);
    });

    it('月份與結帳日輸入無效時不產生虛構週期', () => {
        expect(isYearMonth('')).toBe(false);
        expect(isYearMonth('2026-13')).toBe(false);
        expect(getCycleRange({ statementDay: 32 }, '2026-07')).toBeNull();
        expect(getCycleRange({ statementDay: 15 }, '')).toBeNull();
    });
});
