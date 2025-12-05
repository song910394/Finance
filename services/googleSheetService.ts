import { Transaction } from '../types';

export interface BackupData {
  transactions: Transaction[];
  categories: string[];
  budget: number;
}

export const saveToGoogleSheet = async (url: string, data: BackupData): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      // We use text/plain to avoid preflight CORS checks in some browsers, 
      // GAS `doPost` can handle parsing the string body.
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
        // V3 Support: Server returns raw chunks, Client assembles them.
        // This avoids GAS execution limits on string concatenation and stringify.
        if (res.chunks && Array.isArray(res.chunks)) {
             try {
                const fullJson = res.chunks.join('');
                return fullJson ? JSON.parse(fullJson) : null;
             } catch (parseError) {
                console.error("Failed to assemble chunks", parseError);
                throw new Error("Data corruption during download (JSON Parse Error)");
             }
        }

        // Backward Compatibility (V1/V2)
        return res.data || null;
    }
    
    throw new Error(res.message || 'Load failed');
  } catch (error) {
    console.error("Load from Cloud failed", error);
    // If the error message is specifically about JSON syntax at 50000, it's the GAS limit issue
    if (error instanceof SyntaxError && error.message.includes('position 50000')) {
       throw new Error("Data too large for V2 script. Please update to V3 Script in Settings.");
    }
    throw error;
  }
};