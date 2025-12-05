import { Transaction, PaymentMethod, CardBank } from './types';

// Hardcoded Google Apps Script URL for Cloud Sync
export const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz6-pTM4Msr32C2sK0q5xCgXgu0x571HudIwFui_HpvKZB2MrwtkTm1dfZVpZtKpBOe3w/exec';

// Helper to generate consistent colors for categories
export const getCategoryColor = (category: string): string => {
  const colors: Record<string, string> = {
    '食': '#ef4444', // Red
    '衣': '#f59e0b', // Amber
    '住': '#10b981', // Emerald
    '行': '#3b82f6', // Blue
    '育': '#8b5cf6', // Violet
    '樂': '#ec4899', // Pink
    '其他': '#6b7280', // Gray
    '信用卡出帳': '#1f2937', // Dark
  };

  if (colors[category]) return colors[category];
  
  // Generate a consistent pastel color for custom categories based on string hash
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 50%)`;
};

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: '1',
    date: '2025-11-13',
    amount: 148,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    cardBank: CardBank.SINO,
    category: '食',
    description: '晚餐153折抵',
    isReconciled: false,
  },
  {
    id: '2',
    date: '2025-11-14',
    amount: 850,
    paymentMethod: PaymentMethod.CASH,
    cardBank: CardBank.NONE,
    category: '食',
    description: '水果 藍莓/蘋果',
    isReconciled: true,
  },
  {
    id: '3',
    date: '2025-11-14',
    amount: 262,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    cardBank: CardBank.CATHAY,
    category: '食',
    description: '7-11 晚餐',
    isReconciled: false,
  },
  {
    id: '4',
    date: '2025-11-16',
    amount: 235,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    cardBank: CardBank.CATHAY,
    category: '食',
    description: '紅豆紫米、豆花',
    isReconciled: false,
  },
  {
    id: '5',
    date: '2025-11-18',
    amount: 290,
    paymentMethod: PaymentMethod.CASH,
    cardBank: CardBank.NONE,
    category: '住',
    description: '長尖嘴鉗',
    isReconciled: true,
  },
  {
    id: '6',
    date: '2025-11-18',
    amount: 327,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    cardBank: CardBank.TAISHIN,
    category: '行',
    description: '汽車水箱精*3',
    isReconciled: false,
  },
  {
    id: '7',
    date: '2025-11-19',
    amount: 817,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    cardBank: CardBank.TAISHIN,
    category: '其他',
    description: '木器漆 1L',
    isReconciled: false,
  },
  {
    id: '8',
    date: '2025-11-22',
    amount: 391,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    cardBank: CardBank.SINO,
    category: '行',
    description: '加油',
    isReconciled: false,
  },
  {
    id: '9',
    date: '2025-11-23',
    amount: 2918,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    cardBank: CardBank.FUBON,
    category: '食',
    description: '好市多採購: 鮮奶, 肉鬆',
    isReconciled: false,
  },
];