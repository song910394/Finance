import React, { useState, useEffect } from 'react';
import { Plus, X, Save, CloudDownload, CloudUpload, HelpCircle, AlertTriangle, CheckCircle2, Copy, Trash2 } from 'lucide-react';
import { GOOGLE_SCRIPT_URL } from '../constants';

interface SettingsProps {
  categories: string[];
  budget: number;
  cardBanks: string[];
  onUpdateCategories: (newCategories: string[]) => void;
  onUpdateBudget: (newBudget: number) => void;
  onUpdateCardBanks: (newCardBanks: string[]) => void;
  onCloudSync: (url: string, isUpload: boolean) => Promise<void>;
  onResetData: () => void;
}

const Settings: React.FC<SettingsProps> = ({ categories, budget, cardBanks, onUpdateCategories, onUpdateBudget, onUpdateCardBanks, onCloudSync, onResetData }) => {
  // Budget & Category State
  const [newCategory, setNewCategory] = useState('');
  const [newBank, setNewBank] = useState('');
  const [tempBudget, setTempBudget] = useState(budget.toString());
  const [isBudgetSaved, setIsBudgetSaved] = useState(false);

  // Cloud Sync State
  const [scriptUrl, setScriptUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{type: 'success'|'error', msg: string} | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Reset Confirmation State
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    // Prefer hardcoded URL, fallback to local storage
    if (GOOGLE_SCRIPT_URL) {
      setScriptUrl(GOOGLE_SCRIPT_URL);
    } else {
      const savedUrl = localStorage.getItem('google_script_url');
      if (savedUrl) setScriptUrl(savedUrl);
    }
  }, []);

  const handleAddCategory = () => {
    if (newCategory && !categories.includes(newCategory)) {
      onUpdateCategories([...categories, newCategory]);
      setNewCategory('');
    }
  };

  const handleRemoveCategory = (catToRemove: string) => {
    // Also use inline confirm for cleaner UX, though standard confirm is okay here for now
    if (window.confirm(`確定要刪除類別 "${catToRemove}" 嗎？`)) {
      onUpdateCategories(categories.filter(c => c !== catToRemove));
    }
  };

  const handleAddBank = () => {
    if (newBank && !cardBanks.includes(newBank)) {
        onUpdateCardBanks([...cardBanks, newBank]);
        setNewBank('');
    }
  };

  const handleRemoveBank = (bankToRemove: string) => {
    if (window.confirm(`確定要刪除卡別/帳戶 "${bankToRemove}" 嗎？`)) {
        onUpdateCardBanks(cardBanks.filter(b => b !== bankToRemove));
    }
  };

  const handleSaveBudget = () => {
    const val = parseInt(tempBudget);
    if (!isNaN(val) && val > 0) {
      onUpdateBudget(val);
      setIsBudgetSaved(true);
      setTimeout(() => setIsBudgetSaved(false), 2000);
    }
  };

  const handleSync = async (isUpload: boolean) => {
    if (!scriptUrl) {
      setSyncStatus({ type: 'error', msg: '請先輸入 Apps Script 網址' });
      return;
    }
    
    // Save URL to localStorage so App.tsx can use it for auto-sync
    localStorage.setItem('google_script_url', scriptUrl);
    
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      await onCloudSync(scriptUrl, isUpload);
      setSyncStatus({ type: 'success', msg: isUpload ? '上傳成功！(已啟用自動備份)' : '下載成功！(已啟用自動同步)' });
    } catch (error) {
      setSyncStatus({ type: 'error', msg: '同步失敗，請檢查網址或網路連線' });
    } finally {
      setIsSyncing(false);
    }
  };

  const copyScript = () => {
      const code = `
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  // V3: Client-Side Assembly (解決 Server-Side 50k 截斷問題)
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Data');
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Data');
  }

  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    var action = e.parameter.action;
    var data = null;

    if (e.postData && e.postData.contents) {
        var json = JSON.parse(e.postData.contents);
        action = json.action || action;
        data = json.data;
    }

    if (action == 'save') {
      sheet.clear();
      var jsonString = JSON.stringify(data);
      // 每個儲存格最大 50,000 字元，安全起見設 45000
      var chunkSize = 45000;
      var chunks = [];
      
      for (var i = 0; i < jsonString.length; i += chunkSize) {
        chunks.push(jsonString.substring(i, i + chunkSize));
      }

      if (chunks.length > 0) {
        var range = sheet.getRange(1, 1, 1, chunks.length);
        range.setValues([chunks]);
      }
      
      output.setContent(JSON.stringify({ success: true }));

    } else if (action == 'load') {
      var lastCol = sheet.getLastColumn();
      if (lastCol > 0) {
        // 讀取第一列所有資料塊 (Chunks)
        var values = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        
        // V3: 直接回傳 Array，讓前端自己組裝
        // 這避免了在 Apps Script 內部進行超大字串合併導致的記憶體溢出
        output.setContent(JSON.stringify({ success: true, chunks: values }));
      } else {
        // 空表
        output.setContent(JSON.stringify({ success: true, chunks: [] }));
      }
    } else {
      output.setContent(JSON.stringify({ success: false, message: 'Invalid action' }));
    }
  } catch (err) {
    output.setContent(JSON.stringify({ success: false, message: err.toString() }));
  }
  
  return output;
}`;
      navigator.clipboard.writeText(code);
      alert("V3 程式碼已複製！請更新您的 Apps Script 專案。");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in pb-12">
      
      {/* Cloud Sync Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -mr-10 -mt-10 z-0 opacity-50"></div>
        <div className="relative z-10">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="bg-blue-100 p-1.5 rounded-lg text-blue-600"><CloudUpload size={20} /></span>
                Google 雲端同步設定
            </h3>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                        Apps Script 網頁應用程式網址
                        <button onClick={() => setShowHelp(!showHelp)} className="ml-2 text-blue-500 hover:underline text-xs inline-flex items-center gap-1">
                            <HelpCircle size={12} /> 如何取得網址?
                        </button>
                    </label>
                    <input 
                        type="text" 
                        value={scriptUrl}
                        onChange={(e) => setScriptUrl(e.target.value)}
                        placeholder="https://script.google.com/macros/s/..."
                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono text-gray-600"
                    />
                </div>

                {showHelp && (
                    <div className="bg-gray-900 text-gray-200 p-4 rounded-xl text-xs space-y-3 border border-gray-800 shadow-xl">
                        <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-2">
                           <span className="font-bold text-white">後端設定步驟 (V3 穩定版)</span>
                           <button onClick={copyScript} className="text-blue-400 hover:text-blue-300 flex items-center gap-1">
                             <Copy size={12}/> 複製 V3 程式碼
                           </button>
                        </div>
                        <ol className="list-decimal pl-4 space-y-1.5">
                            <li>建立 Google Sheet，點擊「擴充功能」 {'>'} 「Apps Script」。</li>
                            <li><strong>刪除原有程式碼，貼上新版 V3 程式碼 (請按右上角複製)。</strong></li>
                            <li>點擊「部署」 {'>'} 「新增部署作業」 {'>'} 類型選「網頁應用程式」。</li>
                            <li><strong>誰可以存取</strong> 務必設為 <strong>「所有人」</strong>。</li>
                            <li>複製產生的網址並貼上於此。</li>
                        </ol>
                        <div className="p-2 bg-gray-800 rounded border border-gray-700 text-gray-400 font-mono text-[10px] overflow-x-auto max-h-32">
<pre>{`function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  // V3: Client-Side Assembly
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Data');
  if (!sheet) sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Data');

  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    var action = e.parameter.action;
    var data = null;
    if (e.postData && e.postData.contents) {
        var json = JSON.parse(e.postData.contents);
        action = json.action || action;
        data = json.data;
    }

    if (action == 'save') {
      sheet.clear();
      var jsonString = JSON.stringify(data);
      var chunkSize = 45000; 
      var chunks = [];
      for (var i = 0; i < jsonString.length; i += chunkSize) {
        chunks.push(jsonString.substring(i, i + chunkSize));
      }
      if (chunks.length > 0) {
        sheet.getRange(1, 1, 1, chunks.length).setValues([chunks]);
      }
      output.setContent(JSON.stringify({ success: true }));
    } else if (action == 'load') {
      var lastCol = sheet.getLastColumn();
      if (lastCol > 0) {
        var values = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        // Return raw array of chunks
        output.setContent(JSON.stringify({ success: true, chunks: values }));
      } else {
        output.setContent(JSON.stringify({ success: true, chunks: [] }));
      }
    } else {
      output.setContent(JSON.stringify({ success: false, message: 'Invalid action' }));
    }
  } catch (err) {
    output.setContent(JSON.stringify({ success: false, message: err.toString() }));
  }
  return output;
}`}</pre>
                        </div>
                    </div>
                )}

                <p className="text-xs text-gray-500">
                    設定完成後，系統將會在您每次打開 App 時<strong>自動下載</strong>最新資料，並在編輯後<strong>自動上傳</strong>備份。
                </p>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button 
                        onClick={() => handleSync(true)}
                        disabled={isSyncing}
                        className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        {isSyncing ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div> : <CloudUpload size={18} />}
                        立即上傳 (覆蓋雲端)
                    </button>
                    <button 
                        onClick={() => handleSync(false)}
                        disabled={isSyncing}
                        className="flex-1 py-3 px-4 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        {isSyncing ? <div className="animate-spin rounded-full h-4 w-4 border-gray-600 border-t-transparent"></div> : <CloudDownload size={18} />}
                        立即下載 (覆蓋本機)
                    </button>
                </div>

                {syncStatus && (
                    <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${syncStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {syncStatus.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                        {syncStatus.msg}
                    </div>
                )}
            </div>
        </div>
      </div>
      
      {/* Budget Setting */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            預算設定
        </h3>
        <div className="flex items-end gap-4">
            <div className="flex-1">
                <label className="block text-sm text-gray-500 mb-1">每月目標預算</label>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input 
                        type="number" 
                        value={tempBudget}
                        onChange={(e) => setTempBudget(e.target.value)}
                        className="w-full pl-8 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-lg font-bold"
                    />
                </div>
            </div>
            <button 
                onClick={handleSaveBudget}
                className={`px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
                    isBudgetSaved ? 'bg-green-500 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
            >
                {isBudgetSaved ? '已儲存' : <><Save size={18}/> 儲存</>}
            </button>
        </div>
      </div>

      {/* Category Management */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
            自定義消費類別
        </h3>
        
        <div className="flex gap-2 mb-6">
            <input 
                type="text" 
                placeholder="輸入新類別名稱 (例如: 寵物、保險)"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            />
            <button 
                onClick={handleAddCategory}
                disabled={!newCategory}
                className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
                <Plus size={24} />
            </button>
        </div>

        <div className="flex flex-wrap gap-3">
            {categories.map(cat => (
                <div key={cat} className="group flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-100 rounded-full hover:bg-white hover:shadow-sm transition-all">
                    <span className="font-medium text-gray-700">{cat}</span>
                    <button 
                        onClick={() => handleRemoveCategory(cat)}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
      </div>

      {/* Card Bank Management */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
            信用卡 / 帳戶管理
        </h3>
        
        <div className="flex gap-2 mb-6">
            <input 
                type="text" 
                placeholder="輸入新銀行/帳戶名稱 (例如: 中信, LinePay)"
                value={newBank}
                onChange={(e) => setNewBank(e.target.value)}
                className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleAddBank()}
            />
            <button 
                onClick={handleAddBank}
                disabled={!newBank}
                className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
                <Plus size={24} />
            </button>
        </div>

        <div className="flex flex-wrap gap-3">
            {cardBanks.filter(b => b !== '-').map(bank => (
                <div key={bank} className="group flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-100 rounded-full hover:bg-white hover:shadow-sm transition-all">
                    <span className="font-medium text-gray-700">{bank}</span>
                    <button 
                        onClick={() => handleRemoveBank(bank)}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 rounded-2xl shadow-sm border border-red-100 p-6">
        <h3 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} /> 危險區域
        </h3>
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-red-600">
                清除所有交易紀錄與設定，回復為初始狀態。此操作無法復原。
            </p>
            
            {confirmReset ? (
                <div className="flex gap-2 animate-fade-in">
                    <button 
                        onClick={() => setConfirmReset(false)}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50 text-sm"
                    >
                        取消
                    </button>
                    <button 
                        onClick={() => {
                            onResetData();
                            setConfirmReset(false);
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-sm text-sm font-bold"
                    >
                        確認清除
                    </button>
                </div>
            ) : (
                <button 
                    onClick={() => setConfirmReset(true)}
                    className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-colors text-sm font-medium flex items-center gap-2"
                >
                    <Trash2 size={16} />
                    清除所有資料
                </button>
            )}
        </div>
      </div>

    </div>
  );
};

export default Settings;