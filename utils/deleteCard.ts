import { CardBank, PaymentMethod, type FinanceData } from '../types';

/** 刪除卡片僅轉換支付歸類，保留交易與人工月度帳務金額。 */
export function deleteCard(data: FinanceData, bank: string): FinanceData {
  if (!bank || bank === CardBank.NONE) throw new Error('無法刪除此卡別');
  const cardSettings = { ...data.cardSettings };
  delete cardSettings[bank];
  return { ...data, cardBanks: data.cardBanks.filter(name => name !== bank), cardSettings,
    transactions: data.transactions.map(transaction => {
      if (transaction.cardBank !== bank) return transaction;
      const { statementMonth, ...record } = transaction;
      return { ...record, paymentMethod: PaymentMethod.CASH, cardBank: CardBank.NONE };
    }),
  };
}
