
import React, { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, List, CreditCard, PieChart, Settings as SettingsIcon, Cloud, CheckCircle2, RefreshCw, AlertCircle, Wallet } from 'lucide-react';
import TransactionList from './components/TransactionList';
import Dashboard from './components/Dashboard';
import Reconciliation from './components/Reconciliation';
import Settings from './components/Settings';
import BudgetManager from './components/BudgetManager';
import { Transaction, DEFAULT_CATEGORIES, CardBank, CardSetting, IncomeSource, MonthlyBudget } from './types';
import { INITIAL_TRANSACTIONS, GOOGLE_SCRIPT_URL } from './constants';
import { saveToGoogleSheet, loadFromGoogleSheet } from './services/googleSheetService';

enum Tab {
  DASHBOARD = '概覽',
  TRANSACTIONS = '記帳',
  BUDGET = '帳務',
  RECONCILIATION = '對帳',
  SETTINGS = '設定'
}

type SyncStatus = 'idle' | 'syncing' | 'saved' | 'error';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.DASHBOARD);

  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [cardBanks, setCardBanks] = useState<string[]>(Object.values(CardBank));
  const [budget, setBudget] = useState<number>(50000);
  const [cardSettings, setCardSettings] = useState<Record<string, CardSetting>>({});
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([
    { id: '1', name: '姑姑給' },
    { id: '2', name: '媽媽給' },
    { id: '3', name: '薪水入帳', defaultDay: 6 },
    { id: '4', name: '哩婆給' },
  ]);
  const [budgets, setBudgets] = useState<MonthlyBudget[]>([]);

  const [googleScriptUrl, setGoogleScriptUrl] = useState(GOOGLE_SCRIPT_URL);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('');

  const isRemoteUpdate = useRef(false);
  const isFirstMount = useRef(true);

  useEffect(() => {
    const urlToUse = GOOGLE_SCRIPT_URL || localStorage.getItem('google_script_url');
    if (urlToUse) {
      setGoogleScriptUrl(urlToUse);
      if (GOOGLE_SCRIPT_URL) {
        localStorage.setItem('google_script_url', GOOGLE_SCRIPT_URL);
      }
      handleAutoLoad(urlToUse);
    }
  }, []);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (!googleScriptUrl) return;

    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }

    setSyncStatus('syncing');

    const timer = setTimeout(async () => {
      try {
        await saveToGoogleSheet(googleScriptUrl, {
          transactions,
          categories,
          budget,
          cardBanks,
          cardSettings,
          incomeSources,
          budgets
        });
        setSyncStatus('saved');
        setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch (error) {
        console.error("Auto-save failed", error);
        setSyncStatus('error');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [transactions, categories, budget, cardBanks, cardSettings, incomeSources, budgets, googleScriptUrl]);

  const handleAutoLoad = async (url: string) => {
    setSyncStatus('syncing');
    try {
      const data = await loadFromGoogleSheet(url);
      if (data) {
        isRemoteUpdate.current = true;
        if (data.transactions) setTransactions(data.transactions);
        if (data.categories) setCategories(data.categories);
        if (data.budget) setBudget(data.budget);
        if (data.cardBanks) setCardBanks(data.cardBanks);
        if (data.cardSettings) setCardSettings(data.cardSettings);
        if (data.incomeSources) setIncomeSources(data.incomeSources);
        if (data.budgets) setBudgets(data.budgets);

        setSyncStatus('saved');
        setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } else {
        setSyncStatus('idle');
      }
    } catch (error) {
      console.error("Auto-load failed", error);
      setSyncStatus('error');
    }
  };

  const addTransaction = (newTx: Omit<Transaction, 'id'>) => {
    const transaction: Transaction = {
      ...newTx,
      id: Math.random().toString(36).substr(2, 9)
    };
    setTransactions(prev => [transaction, ...prev]);
  };

  const addTransactions = (newTxs: Omit<Transaction, 'id'>[], newCats?: string[], newBanks?: string[]) => {
    if (newCats && newCats.length > 0) {
      setCategories(prev => Array.from(new Set([...prev, ...newCats])));
    }
    if (newBanks && newBanks.length > 0) {
      setCardBanks(prev => Array.from(new Set([...prev, ...newBanks])));
    }
    const transactionsToAdd = newTxs.map(tx => ({
      ...tx,
      id: Math.random().toString(36).substr(2, 9) + Math.random().toString(36).substr(2, 5)
    }));
    setTransactions(prev => [...transactionsToAdd, ...prev]);
  };

  const editTransaction = (id: string, updatedTx: Omit<Transaction, 'id'>) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updatedTx } : t));
  };

  const deleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  // 刪除固定支出組：刪除指定 groupId 且日期 >= fromDate 的所有交易
  const deleteRecurringGroup = (groupId: string, fromDate: string) => {
    setTransactions(prev => prev.filter(t =>
      !(t.recurringGroupId === groupId && t.date >= fromDate)
    ));
  };

  const toggleReconcile = (id: string) => {
    setTransactions(prev => prev.map(t => {
      if (t.id !== id) return t;
      const newStatus = !t.isReconciled;
      return {
        ...t,
        isReconciled: newStatus,
        reconciledDate: newStatus ? new Date().toISOString() : undefined
      };
    }));
  };

  const resetData = () => {
    setTransactions([]);
    setCategories(DEFAULT_CATEGORIES);
    setCardBanks(Object.values(CardBank));
    setBudget(50000);
    setCardSettings({});
  };

  const handleSettingsSync = async (url: string, isUpload: boolean) => {
    setGoogleScriptUrl(url);
    if (isUpload) {
      await saveToGoogleSheet(url, { transactions, categories, budget, cardBanks, cardSettings, incomeSources, budgets });
      setSyncStatus('saved');
      setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } else {
      await handleAutoLoad(url);
    }
  };

  const renderSyncIcon = () => {
    if (!googleScriptUrl) return <span className="text-gray-300"><Cloud size={16} /></span>;
    if (syncStatus === 'syncing') return <RefreshCw size={16} className="animate-spin text-blue-500" />;
    if (syncStatus === 'saved') return <CheckCircle2 size={16} className="text-green-500" />;
    if (syncStatus === 'error') return <AlertCircle size={16} className="text-red-500" />;
    return <Cloud size={16} className="text-gray-400" />;
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-[#f8fafc] font-sans">
      <aside className="hidden lg:flex w-64 bg-white border-r border-gray-100 flex-col h-full shrink-0 z-20">
        <div className="p-6 border-b border-gray-50 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-blue-200 shadow-lg">
            <PieChart size={20} />
          </div>
          <h1 className="text-xl font-extrabold text-gray-800 tracking-tight">H&S記帳</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavItem icon={<LayoutDashboard size={20} />} label={Tab.DASHBOARD} isActive={activeTab === Tab.DASHBOARD} onClick={() => setActiveTab(Tab.DASHBOARD)} />
          <NavItem icon={<List size={20} />} label={Tab.TRANSACTIONS} isActive={activeTab === Tab.TRANSACTIONS} onClick={() => setActiveTab(Tab.TRANSACTIONS)} />
          <NavItem icon={<CreditCard size={20} />} label={Tab.RECONCILIATION} isActive={activeTab === Tab.RECONCILIATION} onClick={() => setActiveTab(Tab.RECONCILIATION)} />
          <NavItem icon={<Wallet size={20} />} label={Tab.BUDGET} isActive={activeTab === Tab.BUDGET} onClick={() => setActiveTab(Tab.BUDGET)} />
          <div className="pt-4 mt-4 border-t border-gray-50">
            <NavItem icon={<SettingsIcon size={20} />} label={Tab.SETTINGS} isActive={activeTab === Tab.SETTINGS} onClick={() => setActiveTab(Tab.SETTINGS)} />
          </div>
        </nav>
        <div className="p-4 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600 mb-1">
            {renderSyncIcon()}
            <span className="font-number">
              {syncStatus === 'saved' ? `已同步 ${lastSyncedTime}` :
                syncStatus === 'syncing' ? '同步中...' :
                  syncStatus === 'error' ? '同步失敗' : '未連線'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-display">© 2024 H&S記帳 v{__APP_VERSION__}</p>
        </div>
      </aside>
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="lg:hidden bg-white border-b border-gray-100 px-4 py-3 flex justify-between items-center z-10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <PieChart size={16} />
            </div>
            <h1 className="text-lg font-bold text-gray-800">H&S記帳</h1>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100 shadow-sm">
            {renderSyncIcon()}
            {syncStatus === 'saved' && <span className="text-[10px] text-slate-500 font-number">{lastSyncedTime}</span>}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-hide bg-[#f8fafc]">
          <div className="p-4 pb-28 md:p-8 md:pb-8 max-w-7xl mx-auto">
            {activeTab === Tab.DASHBOARD && <Dashboard transactions={transactions} budget={budget} cardBanks={cardBanks} cardSettings={cardSettings} />}
            {activeTab === Tab.TRANSACTIONS && (
              <TransactionList
                transactions={transactions}
                categories={categories}
                cardBanks={cardBanks}
                onAddTransaction={addTransaction}
                onAddTransactions={addTransactions}
                onEditTransaction={editTransaction}
                onDeleteTransaction={deleteTransaction}
                onDeleteRecurringGroup={deleteRecurringGroup}
                onToggleReconcile={toggleReconcile}
              />
            )}
            {activeTab === Tab.RECONCILIATION && (
              <Reconciliation
                transactions={transactions}
                cardBanks={cardBanks}
                cardSettings={cardSettings}
                onToggleReconcile={toggleReconcile}
                onAddTransaction={addTransaction}
                onUpdateCardSettings={setCardSettings}
              />
            )}
            {activeTab === Tab.BUDGET && (
              <BudgetManager
                transactions={transactions}
                cardBanks={cardBanks}
                cardSettings={cardSettings}
                incomeSources={incomeSources}
                budgets={budgets}
                onUpdateIncomeSources={setIncomeSources}
                onUpdateBudgets={setBudgets}
              />
            )}
            {activeTab === Tab.SETTINGS && (
              <Settings
                categories={categories}
                budget={budget}
                cardBanks={cardBanks}
                cardSettings={cardSettings}
                onUpdateCategories={setCategories}
                onUpdateBudget={setBudget}
                onUpdateCardBanks={setCardBanks}
                onUpdateCardSettings={setCardSettings}
                onCloudSync={handleSettingsSync}
                onResetData={resetData}
              />
            )}
          </div>
        </main>
        <nav className="lg:hidden bg-white/90 backdrop-blur-md border-t border-gray-200 fixed bottom-0 w-full z-50 pb-safe">
          <div className="grid grid-cols-5 h-16">
            <MobileNavItem icon={<LayoutDashboard size={20} />} label={Tab.DASHBOARD} isActive={activeTab === Tab.DASHBOARD} onClick={() => setActiveTab(Tab.DASHBOARD)} />
            <MobileNavItem icon={<List size={20} />} label={Tab.TRANSACTIONS} isActive={activeTab === Tab.TRANSACTIONS} onClick={() => setActiveTab(Tab.TRANSACTIONS)} />
            <MobileNavItem icon={<CreditCard size={20} />} label="對帳" isActive={activeTab === Tab.RECONCILIATION} onClick={() => setActiveTab(Tab.RECONCILIATION)} />
            <MobileNavItem icon={<Wallet size={20} />} label="帳務" isActive={activeTab === Tab.BUDGET} onClick={() => setActiveTab(Tab.BUDGET)} />
            <MobileNavItem icon={<SettingsIcon size={20} />} label={Tab.SETTINGS} isActive={activeTab === Tab.SETTINGS} onClick={() => setActiveTab(Tab.SETTINGS)} />
          </div>
        </nav>
      </div>
    </div>
  );
}

const NavItem = ({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-xl transition-all duration-300 group outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isActive
      ? 'bg-indigo-50 text-indigo-600 font-bold shadow-sm translate-x-1'
      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 hover:translate-x-1'
      }`}
    aria-label={label}
  >
    <span className={`transition-colors duration-300 ${isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}>{icon}</span>
    <span>{label}</span>
  </button>
);

const MobileNavItem = ({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform touch-target outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
    aria-label={label}
  >
    <div className={`p-2 rounded-xl transition-all duration-300 ${isActive ? 'text-indigo-600 bg-indigo-50 shadow-sm -translate-y-1' : 'text-slate-400'}`}>{icon}</div>
    <span className={`text-[10px] font-medium transition-colors duration-300 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>{label}</span>
  </button>
);

export default App;
