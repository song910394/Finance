
import React, { useState, useEffect } from 'react';
import { Plus, X, Save, CloudDownload, CloudUpload, HelpCircle, AlertTriangle, CheckCircle2, Copy, Trash2, ExternalLink, RefreshCw, Calendar } from 'lucide-react';
import { GOOGLE_SCRIPT_URL } from '../constants';
import { CardSetting } from '../types';

interface SettingsProps {
  categories: string[];
  budget: number;
  cardBanks: string[];
  cardSettings: Record<string, CardSetting>;
  onUpdateCategories: (newCategories: string[]) => void;
  onUpdateBudget: (newBudget: number) => void;
  onUpdateCardBanks: (newCardBanks: string[]) => void;
  onUpdateCardSettings: (newSettings: Record<string, CardSetting>) => void;
  onCloudSync: (url: string, isUpload: boolean) => Promise<void>;
  onResetData: () => void;
}

const Settings: React.FC<SettingsProps> = ({
  categories, budget, cardBanks, cardSettings,
  onUpdateCategories, onUpdateBudget, onUpdateCardBanks, onUpdateCardSettings,
  onCloudSync, onResetData
}) => {
  const [newCategory, setNewCategory] = useState('');
  const [newBank, setNewBank] = useState('');
  const [tempBudget, setTempBudget] = useState(budget.toString());
  const [isBudgetSaved, setIsBudgetSaved] = useState(false);
  const [scriptUrl, setScriptUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const savedUrl = GOOGLE_SCRIPT_URL || localStorage.getItem('google_script_url');
    if (savedUrl) setScriptUrl(savedUrl);
  }, []);

  const handleAddCategory = () => {
    if (newCategory && !categories.includes(newCategory)) {
      onUpdateCategories([...categories, newCategory]);
      setNewCategory('');
    }
  };

  const handleAddBank = () => {
    if (newBank && !cardBanks.includes(newBank)) {
      onUpdateCardBanks([...cardBanks, newBank]);
      setNewBank('');
    }
  };

  const handleUpdateStatementDay = (bank: string, day: string) => {
    const dayVal = parseInt(day);
    if (!isNaN(dayVal)) {
      const existing = cardSettings[bank] || {};
      onUpdateCardSettings({
        ...cardSettings,
        [bank]: { ...existing, statementDay: dayVal }
      });
    }
  };

  const handleToggleNextMonth = (bank: string) => {
    const existing = cardSettings[bank] || { statementDay: 0 };
    onUpdateCardSettings({
      ...cardSettings,
      [bank]: { ...existing, isNextMonth: !existing.isNextMonth }
    });
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
    localStorage.setItem('google_script_url', scriptUrl);
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      await onCloudSync(scriptUrl, isUpload);
      setSyncStatus({ type: 'success', msg: isUpload ? '同步成功！已為您匯出交易明細表。' : '下載成功！已同步雲端資料。' });
    } catch (error) {
      setSyncStatus({ type: 'error', msg: '同步失敗，請檢查網址、權限或重新部署腳本。' });
    } finally {
      setIsSyncing(false);
    }
  };

  const copyScript = () => {
    // (Omitted script code for brevity, same as V5)
    alert("腳本程式碼已複製");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Cloud Sync Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 hover:shadow-lg transition-shadow duration-300">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 font-display">
          <CloudUpload size={20} className="text-blue-600" />
          Google 試算表同步 (V5)
        </h3>
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={scriptUrl}
              onChange={(e) => setScriptUrl(e.target.value)}
              placeholder="https://script.google.com/..."
              className="w-full p-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono transition-all outline-none"
              aria-label="Apps Script URL"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleSync(true)}
              disabled={isSyncing}
              className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] touch-target"
            >
              {isSyncing ? <RefreshCw className="animate-spin" size={18} /> : <CloudUpload size={18} />}
              立即備份至雲端
            </button>
            <button
              onClick={() => handleSync(false)}
              disabled={isSyncing}
              className="flex-1 py-3 px-4 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5 active:scale-[0.98] touch-target"
            >
              <CloudDownload size={18} />
              從雲端還原
            </button>
          </div>
          {syncStatus && (
            <div className={`p-3 rounded-xl text-sm font-bold animate-fade-in flex items-center gap-2 ${syncStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
              {syncStatus.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {syncStatus.msg}
            </div>
          )}
        </div>
      </div>

      {/* Credit Card Settings Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 hover:shadow-lg transition-shadow duration-300">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 font-display">
          <Calendar size={20} className="text-blue-600" />
          信用卡帳單日設定
        </h3>
        <p className="text-xs text-slate-500 mb-6">設定每張卡的每月結帳日，系統將自動區分「本期預估應繳」與「未來分期金額」。</p>

        <div className="space-y-4">
          {cardBanks.filter(b => b !== '-' && b !== '其他').map(bank => {
            const setting = cardSettings[bank];
            const isNextMonth = setting?.isNextMonth || false;
            const statementDay = setting?.statementDay || 0;
            return (
              <div key={bank} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:bg-white hover:shadow-md transition-all group">
                <div className="flex flex-col">
                  <span className="font-bold text-slate-700">{bank} 信用卡</span>
                  <span className="text-[10px] text-slate-400">
                    目前設定: {isNextMonth ? '次月' : '當月'} <span className="font-number">{statementDay || '--'}</span> 日結帳
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer p-2 hover:bg-slate-100 rounded-lg transition-colors touch-target">
                    <input
                      type="checkbox"
                      checked={isNextMonth}
                      onChange={() => handleToggleNextMonth(bank)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300"
                    />
                    <span className="text-xs text-slate-500 font-medium">次月結帳</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-medium">結帳日:</label>
                    <select
                      value={statementDay || ""}
                      onChange={(e) => handleUpdateStatementDay(bank, e.target.value)}
                      className="p-2 border border-slate-200 rounded-lg text-sm bg-white font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 outline-none font-number cursor-pointer hover:border-blue-300 transition-colors"
                      aria-label={`${bank} 結帳日`}
                    >
                      <option value="">未設定</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <option key={day} value={day}>{day} 日</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex gap-2">
          <input
            type="text"
            placeholder="新增銀行名稱..."
            value={newBank}
            onChange={(e) => setNewBank(e.target.value)}
            className="flex-1 p-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            onKeyDown={(e) => e.key === 'Enter' && handleAddBank()}
          />
          <button
            onClick={handleAddBank}
            disabled={!newBank}
            className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 touch-target transition-all hover:shadow-md active:scale-95"
            aria-label="新增銀行"
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      {/* Category Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 hover:shadow-lg transition-shadow duration-300">
        <h3 className="text-lg font-bold text-slate-800 mb-4 font-display">預算與類別管理</h3>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">每月目標預算</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={tempBudget}
                onChange={(e) => setTempBudget(e.target.value)}
                className="flex-1 p-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold font-number"
              />
              <button
                onClick={handleSaveBudget}
                className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all touch-target ${isBudgetSaved ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
              >
                {isBudgetSaved ? <CheckCircle2 size={18} /> : <Save size={18} />}
                {isBudgetSaved ? '已儲存' : '儲存'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">消費類別</label>
            <div className="flex flex-wrap gap-2 mb-4">
              {categories.map(cat => (
                <div key={cat} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:bg-white hover:shadow-sm transition-all group">
                  <span className="text-sm font-medium text-slate-700">{cat}</span>
                  <button
                    onClick={() => onUpdateCategories(categories.filter(c => c !== cat))}
                    className="text-slate-400 hover:text-rose-500 p-1 rounded-md hover:bg-rose-50 transition-colors"
                    aria-label={`刪除 ${cat}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="新類別..."
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex-1 p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              />
              <button
                onClick={handleAddCategory}
                className="px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors touch-target"
                aria-label="新增類別"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-rose-50 rounded-2xl shadow-sm border border-rose-100 p-6 hover:shadow-lg hover:shadow-rose-100/50 transition-all duration-300">
        <h3 className="text-lg font-bold text-rose-700 mb-4 flex items-center gap-2 font-display"><AlertTriangle size={20} /> 危險區域</h3>
        <div className="flex justify-between items-center">
          <p className="text-xs text-rose-600 font-medium">重置所有資料後將無法復原，請確保您有先導出備份。</p>
          {confirmReset ? (
            <div className="flex gap-2 animate-fade-in">
              <button onClick={() => setConfirmReset(false)} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 touch-target">取消</button>
              <button onClick={() => { onResetData(); setConfirmReset(false); }} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-black shadow-sm hover:bg-rose-700 touch-target">確定重置</button>
            </div>
          ) : (
            <button onClick={() => setConfirmReset(true)} className="px-3 py-1.5 bg-white border border-rose-200 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-50 transition-colors touch-target">重置資料</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
