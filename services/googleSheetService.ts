
// Added CardSetting to imports
import { Transaction, CardSetting, IncomeSource, MonthlyBudget, BackupData } from '../types';

/*
export interface BackupData {
  transactions: Transaction[];
  categories: string[];
  budget: number;
  cardBanks: string[]; // Added cardBanks to persistence
  // Added cardSettings to BackupData to fix type mismatch errors in App.tsx
  cardSettings: Record<string, CardSetting>;
  incomeSources?: IncomeSource[];
  budgets?: MonthlyBudget[];
}
*/

export const saveToGoogleSheet = async (url: string, data: BackupData): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({ action: 'save', data }),
    });

    if (!response.ok) throw new Error('Network response was not ok');

    let res;
    try {
      res = await response.json();
    } catch (e) {
      throw new Error('Invalid response from server. Check URL permissions.');
    }

    if (!res.success) throw new Error(res.message || 'Save failed');
    return true;
  } catch (error) {
    console.error("Save to Cloud failed", error);
    throw error;
  }
};

export const loadFromGoogleSheet = async (url: string): Promise<BackupData | null> => {
  try {
    const response = await fetch(`${url}?action=load`);
    if (!response.ok) throw new Error('Network response was not ok');

    let res;
    try {
      res = await response.json();
    } catch (e) {
      throw new Error('Invalid response from server. Check URL permissions.');
    }

    if (res.success) {
      if (res.chunks && Array.isArray(res.chunks)) {
        try {
          const fullJson = res.chunks.join('');
          return fullJson ? JSON.parse(fullJson) : null;
        } catch (parseError) {
          console.error("Failed to assemble chunks", parseError);
          throw new Error("Data corruption during download (JSON Parse Error)");
        }
      }
      return res.data || null;
    }

    throw new Error(res.message || 'Load failed');
  } catch (error) {
    console.error("Load from Cloud failed", error);
    throw error;
  }
};
