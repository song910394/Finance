import { expect, it } from 'vitest';
import { deleteCard } from './deleteCard';
import { parseBackup } from './backup';
import { PaymentMethod } from '../types';

it('刪除卡片轉換全部期次為現金，保留原紀錄與其他帳務', () => {
  const data = parseBackup({ transactions: [
    { id:'a', date:'2026-01-01', amount:100, paymentMethod:PaymentMethod.CREDIT_CARD, cardBank:'玉山', description:'家電 (1/2)', category:'住', isReconciled:true, statementMonth:'2026-02', isInstallment:true, installmentGroupId:'group', installmentNumber:1, installmentCount:2 },
    { id:'b', date:'2027-01-01', amount:101, paymentMethod:PaymentMethod.CREDIT_CARD, cardBank:'玉山', description:'家電 (2/2)', category:'住', isReconciled:false, isInstallment:true, installmentGroupId:'group', installmentNumber:2, installmentCount:2 },
    { id:'c', date:'2026-01-01', amount:200, paymentMethod:PaymentMethod.CREDIT_CARD, cardBank:'國泰', description:'其他', category:'住', isReconciled:false },
  ], categories:['住'], cardBanks:['-', '玉山', '國泰'], cardSettings:{玉山:{statementDay:15}, 國泰:{statementDay:3}}, budget:1000 });
  const original = JSON.stringify(data);
  const result = deleteCard(data,'玉山');
  expect(result.cardBanks).toEqual(['-','國泰']);
  expect(result.cardSettings).toEqual({國泰:{statementDay:3}});
  expect(result.transactions[0]).toMatchObject({ id:'a', amount:100, date:'2026-01-01', paymentMethod:'現金', cardBank:'-', isReconciled:true, installmentGroupId:'group' });
  expect(result.transactions[0].statementMonth).toBeUndefined();
  expect(result.transactions[1]).toMatchObject({ paymentMethod:'現金', amount:101, isReconciled:false });
  expect(result.transactions[2]).toEqual(data.transactions[2]);
  expect(result.budgets).toEqual(data.budgets);
  expect(JSON.stringify(data)).toBe(original);
  expect(parseBackup(result)).toEqual(result);
  expect(()=>deleteCard(data,'-')).toThrow();
});
