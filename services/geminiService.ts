import { GoogleGenAI } from "@google/genai";
import { Transaction, Category } from "../types";

// Helper to get AI instance safely
const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  return new GoogleGenAI({ apiKey });
};

// Helper to convert File to Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the Data-URL declaration (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const suggestCategory = async (description: string, availableCategories: string[]): Promise<Category | null> => {
  if (!process.env.API_KEY) return null;
  
  try {
    const ai = getAI();
    const categoriesStr = availableCategories.join(", ");
    
    // Using a lighter model for quick classification
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Categorize this expense description into one of these exact categories: [${categoriesStr}]. Description: "${description}". Return only the category name directly.`,
    });
    
    const text = response.text?.trim();
    if (text && availableCategories.includes(text)) {
      return text;
    }
    return '其他';
  } catch (error) {
    console.error("Gemini classification failed", error);
    return null;
  }
};

export const getSpendingInsight = async (transactions: Transaction[], budget: number): Promise<string> => {
  if (!process.env.API_KEY) return "請設定 API Key 以啟用 AI 智能分析功能。";

  try {
    const ai = getAI();
    
    // Summarize data for the prompt to save tokens
    const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
    const categoryBreakdown = transactions.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    const prompt = `
      你是我的私人理財顧問。請根據以下本月消費數據提供一段簡短、友善且有建設性的財務分析與建議 (繁體中文)。
      
      總支出: ${totalAmount} 元
      預算: ${budget} 元
      預算達成率: ${Math.round((totalAmount / budget) * 100)}%
      類別分佈: ${JSON.stringify(categoryBreakdown)}
      
      請指出消費最高的類別，如果超支請給予警告，否則給予鼓勵。
      語氣要輕鬆鼓勵，長度約 100 字左右。
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 } // Disable thinking for faster simple text response
      }
    });

    return response.text || "無法生成分析報告。";
  } catch (error) {
    console.error("Gemini insight failed", error);
    return "分析功能暫時無法使用，請稍後再試。";
  }
};

export const parseBillFromImage = async (file: File): Promise<any[]> => {
  if (!process.env.API_KEY) throw new Error("API Key is missing");

  try {
    const ai = getAI();
    const base64Data = await fileToBase64(file);

    const prompt = `
      Analyze the attached credit card bill image or PDF.
      Extract the transaction list into a JSON array. 
      For each transaction, I need:
      - "date" (Format: YYYY-MM-DD. If year is missing, assume current year)
      - "description" (The merchant name or item description)
      - "amount" (The absolute number, ignore currency symbols, no commas)
      
      Ignore payment rows, headers, or subtotals. Only extract individual spending transactions.
      
      Return ONLY the JSON string, no markdown formatting.
      Example: [{"date": "2024-01-01", "description": "Uber Eats", "amount": 250}]
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: file.type,
              data: base64Data
            }
          },
          { text: prompt }
        ]
      }
    });

    let jsonStr = response.text || "";
    // Clean markdown code blocks if present
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("OCR Parsing failed", error);
    throw new Error("無法辨識帳單內容，請確認圖片清晰度或檔案格式。");
  }
};

export const parseReceiptFromImage = async (file: File): Promise<{date: string, amount: number, description: string}> => {
  if (!process.env.API_KEY) throw new Error("API Key is missing");

  try {
    const ai = getAI();
    const base64Data = await fileToBase64(file);

    const prompt = `
      Analyze the attached receipt image.
      Extract the following 3 fields into a JSON object:
      1. "date": The date of the transaction (Format: YYYY-MM-DD). If year is missing, assume current year.
      2. "amount": The total amount (Number only).
      3. "description": The merchant name or main item (String).

      Return ONLY the JSON string.
      Example: {"date": "2024-11-20", "amount": 150, "description": "Starbucks Coffee"}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: file.type,
              data: base64Data
            }
          },
          { text: prompt }
        ]
      }
    });

    let jsonStr = response.text || "";
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Receipt OCR failed", error);
    throw new Error("無法辨識收據內容");
  }
};
