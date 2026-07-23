import { describe, it, expect } from 'vitest';
import { formatLocalDate, formatLocalYearMonth, getCycleRange, isReconciledInCycle, parseLocalDate, shiftYearMonth } from './billing';
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

describe('isReconciledInCycle', () => {
    const range = { start: '2026-06-16', end: '2026-07-15' };
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

    it('未核銷 → false', () => {
        expect(isReconciledInCycle({ ...base, isReconciled: false }, range)).toBe(false);
    });

    it('交易日在週期內 → true', () => {
        expect(isReconciledInCycle(base, range)).toBe(true);
    });

    it('交易日晚於週期末 → false', () => {
        expect(isReconciledInCycle({ ...base, date: '2026-07-16' }, range)).toBe(false);
    });

    it('交易日早於週期、但核銷動作發生在週期內（補核舊帳）→ true', () => {
        expect(isReconciledInCycle(
            { ...base, date: '2026-06-10', reconciledDate: '2026-06-20T10:00:00.000Z' },
            range
        )).toBe(true);
    });

    it('交易日早於週期、核銷也早於週期 → false', () => {
        expect(isReconciledInCycle(
            { ...base, date: '2026-06-10', reconciledDate: '2026-06-12T10:00:00.000Z' },
            range
        )).toBe(false);
    });

    it('核銷時間戳以本地日曆日比對（UTC 6/15 深夜在 UTC+8 已是 6/16，應計入 6/16 起的週期）', () => {
        // 此案例僅在 UTC+8 等正時區成立，跳過其他時區的 CI 環境
        if (new Date().getTimezoneOffset() !== -480) return;
        expect(isReconciledInCycle(
            { ...base, date: '2026-06-10', reconciledDate: '2026-06-15T22:00:00.000Z' },
            range
        )).toBe(true);
    });
});
