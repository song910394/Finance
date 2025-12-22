
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, Category } from "../types";

// Helper to get AI instance safely using process.env.API_KEY directly
const getAI = () => {
  // Use process.env.API_KEY directly as per guidelines
  try {
    return new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  } catch (error) {
    console.warn("Gemini API initialization failed. AI features will be limited.", error);
    return null;
  }
};

// Helper to convert File to Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const suggestCategory = async (description: string, availableCategories: string[]): Promise<Category | null> => {
  const ai = getAI();
  if (!ai) return null;
  
  try {
    const categoriesStr = availableCategories.join(", ");
    // Using gemini-3-flash-preview for basic text categorization
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Categorize this expense description into one of these exact categories: [${categoriesStr}]. Description: "${description}". Return only the category name directly.`,
    });
    
    // Accessing .text as a property directly
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
  const ai = getAI();
  if (!ai) return "請設定 API Key 以啟用 AI 智能分析功能。";

  try {
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

    // Using gemini-3-flash-preview for text summarization/analysis
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    // Accessing .text property directly
    return response.text || "無法生成分析報告。";
  } catch (error) {
    console.error("Gemini insight failed", error);
    return "分析功能暫時無法使用，請稍後再試。";
  }
};

export const parseBillFromImage = async (file: File): Promise<any[]> => {
  const ai = getAI();
  if (!ai) throw new Error("API Key is missing");

  try {
    const base64Data = await fileToBase64(file);
    const prompt = `Analyze the attached credit card bill image or PDF. Extract the transaction list.`;

    // Using responseSchema for structured JSON extraction
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [{ inlineData: { mimeType: file.type, data: base64Data } }, { text: prompt }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING, description: "Format: YYYY-MM-DD" },
              description: { type: Type.STRING, description: "The merchant name" },
              amount: { type: Type.NUMBER }
            },
            required: ["date", "description", "amount"]
          }
        }
      }
    });

    // Extract text from the response property
    const jsonStr = response.text || "[]";
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("OCR Parsing failed", error);
    throw new Error("無法辨識帳單內容。");
  }
};

export const parseReceiptFromImage = async (file: File): Promise<{date: string, amount: number, description: string}> => {
  const ai = getAI();
  if (!ai) throw new Error("API Key is missing");

  try {
    const base64Data = await fileToBase64(file);
    const prompt = `Analyze the attached receipt image.`;

    // Using responseSchema for robust JSON extraction
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [{ inlineData: { mimeType: file.type, data: base64Data } }, { text: prompt }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "Format: YYYY-MM-DD" },
            amount: { type: Type.NUMBER },
            description: { type: Type.STRING }
          },
          required: ["date", "amount", "description"]
        }
      }
    });

    // Extract text from the response property
    const jsonStr = response.text || "{}";
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Receipt OCR failed", error);
    throw new Error("無法辨識收據內容");
  }
};
