
export enum PaymentMethod {
  CASH = '現金',
  CREDIT_CARD = '刷卡'
}

export enum CardBank {
  NONE = '-',
  CATHAY = '國泰',
  ESUN = '玉山',
  TAISHIN = '台新',
  SINO = '永豐',
  FUBON = '富邦'
}

export type Category = string;

export const DEFAULT_CATEGORIES = [
  '食', '衣', '住', '行', '育', '樂', '其他', '信用卡出帳'
];

export interface CardSetting {
  statementDay: number; // 1-31
  isNextMonth?: boolean; // true = 次月結帳 (如國泰次月3日), false = 當月結帳 (如玉山當月15日)
  issuedMonths?: string[]; // 紀錄已核結出帳的月份 (格式: YYYY-MM)
  statementAmounts?: Record<string, number>; // 紀錄各月份的帳單金額 (Key: YYYY-MM, Value: Amount)
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  paymentMethod: PaymentMethod;
  cardBank: string;
  category: Category;
  description: string;
  isReconciled: boolean;
  reconciledDate?: string; // ISO String
  isRecurring?: boolean;
  isInstallment?: boolean;
  recurringGroupId?: string; // 用於關聯同一組固定支出的交易
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
  cardBanks: string[];
  cardSettings: Record<string, CardSetting>;
}

export interface BackupData {
  transactions: Transaction[];
  categories: string[];
  budget: number;
  cardBanks: string[];
  cardSettings: Record<string, CardSetting>;
  incomeSources?: IncomeSource[];
  budgets?: MonthlyBudget[];
}

// 入帳來源設定
export interface IncomeSource {
  id: string;
  name: string; // 姑姑給、媽媽給、薪水入帳...
  defaultDay?: number; // 預設入帳日
}

// 月度預算資料
export interface MonthlyBudget {
  month: string; // YYYY-MM
  openingBalance: number; // 期初餘額
  incomes: { sourceId: string; amount: number }[]; // 各入帳來源金額
  loan: number; // 貸款金額
  creditCards?: { cardName: string; amount: number }[]; // 各信用卡帳單金額 (手動輸入)
}

