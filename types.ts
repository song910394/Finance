export enum PaymentMethod {
  CASH = '現金',
  CREDIT_CARD = '刷卡',
  TRANSFER = '轉帳'
}

export enum CardBank {
  NONE = '-',
  CATHAY = '國泰',
  ESUN = '玉山',
  TAISHIN = '台新',
  SINO = '永豐',
  FUBON = '富邦',
  OTHER = '其他'
}

// Category is now dynamic, so we use string, but keep some constants for defaults
export type Category = string;

export const DEFAULT_CATEGORIES = [
  '食', '衣', '住', '行', '育', '樂', '其他', '信用卡出帳'
];

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  paymentMethod: PaymentMethod;
  cardBank: string;
  category: Category;
  description: string;
  isReconciled: boolean; // Has this been matched with a statement?
}

export interface MonthlySummary {
  month: string;
  total: number;
}

export interface CategorySummary {
  name: string;
  value: number;
  color: string;
  [key: string]: any;
}

export interface AppSettings {
  budget: number;
  categories: string[];
}