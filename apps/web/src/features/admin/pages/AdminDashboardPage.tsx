import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchSystemHealth,
  fetchLiveTransactions,
  fetchSystemAlerts,
  executeServiceAction,
  fetchSellerOrders,
} from '../api/admin-ops';
import { AdminHealthDashboard } from '../components/AdminHealthDashboard';
import { AdminTransactionsTable } from '../components/AdminTransactionsTable';
import { AdminSellerOrdersTable } from '../components/AdminSellerOrdersTable';
import { AdminSupportTicketsPanel } from '../components/AdminSupportTicketsPanel';
import { AdminServiceActionsPanel } from '../components/AdminServiceActionsPanel';
import { AdminTestSuiteRunner } from '../components/AdminTestSuiteRunner';
import { AdminAuditLogsViewer } from '../components/AdminAuditLogsViewer';
import { AdminUsersActivityPanel } from '../components/AdminUsersActivityPanel';
import { AdminBackupRestorePanel } from '../components/AdminBackupRestorePanel';
import { AdminBuyerTroubleshooter } from '../components/AdminBuyerTroubleshooter';
import { AdminSellerTroubleshooter } from '../components/AdminSellerTroubleshooter';
import { AdminQueryTerminal } from '../components/AdminQueryTerminal';
import { NotificationsPage } from '@/features/notifications';
import type {
  SystemHealthResponse,
  LiveTransactionItem,
  SellerOrderItem,
  SystemAlertItem,
  AdminServiceActionType,
  ServiceActionResult,
} from '../types/admin';

type AdminTab =
  | 'HEALTH'
  | 'TRANSACTIONS'
  | 'SELLER_ORDERS'
  | 'TICKETS'
  | 'ACTIONS'
  | 'TESTS'
  | 'BUYER_DEBUG'
  | 'SUPPLIER_DEBUG'
  | 'TERMINAL'
  | 'BACKUPS'
  | 'LOGS'
  | 'USERS'
  | 'NOTIFICATIONS';

export function AdminDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab')?.toUpperCase();
  const activeTab: AdminTab =
    rawTab === 'ORDERS' || rawTab === 'TRANSACTIONS' || rawTab === 'PIPELINE' || rawTab === 'BUYER_ORDERS' || rawTab === 'BUYER-ORDERS'
      ? 'TRANSACTIONS'
      : rawTab === 'SELLER_ORDERS' || rawTab === 'SELLER-ORDERS' || rawTab === 'SELLER_TRANSACTIONS' || rawTab === 'SELLER-TRANSACTIONS' || rawTab === 'SUPPLIER_ORDERS'
      ? 'SELLER_ORDERS'
      : rawTab === 'NOTIFICATIONS' || rawTab === 'NOTIFICATION' || rawTab === 'ALERTS'
      ? 'NOTIFICATIONS'
      : (rawTab as AdminTab) || 'TRANSACTIONS';

  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [alerts, setAlerts] = useState<SystemAlertItem[]>([]);
  const [transactions, setTransactions] = useState<LiveTransactionItem[]>([]);
  const [sellerOrders, setSellerOrders] = useState<SellerOrderItem[]>([]);
  const [isLoadingHealth, setIsLoadingHealth] = useState(true);
  const [isLoadingTx, setIsLoadingTx] = useState(true);
  const [isLoadingSellerOrders, setIsLoadingSellerOrders] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Single Platform Operating Mode from Database
  const isPlatformInDemoMode = Boolean(health?.demo_mode_enabled);

  const setTab = (tab: AdminTab) => {
    setSearchParams({ tab: tab.toLowerCase() });
  };

  const loadHealthData = async () => {
    setIsLoadingHealth(true);
    const [healthRes, alertsRes] = await Promise.all([
      fetchSystemHealth({ mode: 'AUTO' }),
      fetchSystemAlerts(),
    ]);
    if (healthRes.ok) setHealth(healthRes.health);
    if (alertsRes.ok) setAlerts(alertsRes.alerts);
    setIsLoadingHealth(false);
  };

  const loadTransactionsData = async () => {
    setIsLoadingTx(true);
    const res = await fetchLiveTransactions({ limit: 100, mode: 'AUTO' });
    if (res.ok) setTransactions(res.transactions);
    setIsLoadingTx(false);
  };

  const loadSellerOrdersData = async () => {
    setIsLoadingSellerOrders(true);
    const res = await fetchSellerOrders({ limit: 100, mode: 'AUTO' });
    if (res.ok) setSellerOrders(res.orders);
    setIsLoadingSellerOrders(false);
  };

  const refreshAllData = () => {
    void loadHealthData();
    void loadTransactionsData();
    void loadSellerOrdersData();
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  const handleExecuteAction = async (
    action: AdminServiceActionType,
    entityId?: string,
    payload?: Record<string, unknown>
  ): Promise<ServiceActionResult | null> => {
    const res = await executeServiceAction(action, entityId, payload);
    if (res.ok && res.result) {
      setStatusMessage(res.result.message);
      refreshAllData();
      return res.result;
    }
    if (res.error) {
      alert(`Action error: ${res.error}`);
    }
    return null;
  };

  return (
    <div className="zero-scroll-container p-2 sm:p-3 max-w-7xl mx-auto w-full pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* Top Header Banner - Mobile-First Responsive Bar */}
      <header className="rounded-xl border bg-card px-3 sm:px-4 py-2 sm:py-2.5 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-sm sm:text-base font-black tracking-tight text-foreground flex items-center gap-1.5 truncate">
            <span>🛡️</span> Control Tower
          </h1>
          {/* Single Platform Operating Mode Badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0 ${
              isPlatformInDemoMode
                ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
            }`}
            title={
              isPlatformInDemoMode
                ? 'Platform is in Staging & Demo Mode: 1-click test personas enabled on sign-in'
                : 'Platform is in Live Production Mode: Real authenticated accounts only'
            }
          >
            <span>{isPlatformInDemoMode ? '🧪' : '🚀'}</span>
            <span className="hidden sm:inline">{isPlatformInDemoMode ? 'STAGING & DEMO' : 'LIVE PROD'}</span>
            <span className="sm:hidden">{isPlatformInDemoMode ? 'DEMO' : 'PROD'}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={refreshAllData}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border bg-card px-3 py-1 text-xs font-semibold hover:bg-muted active:scale-98 transition shrink-0 shadow-2xs"
        >
          🔄 <span className="hidden sm:inline ml-1">Refresh</span>
        </button>
      </header>

      {/* Global Status Flash Banner */}
      {statusMessage && (
        <div className="mt-2 shrink-0 flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2.5 sm:p-3 text-xs text-emerald-950 dark:text-emerald-200 animate-in fade-in">
          <div className="flex items-center gap-1.5 font-semibold">
            <span>✓</span> {statusMessage}
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground hover:text-foreground font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs Bar - Touch-Friendly Scrollable Bar */}
      <div className="mt-2 shrink-0 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
        <button
          type="button"
          onClick={() => setTab('TRANSACTIONS')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'TRANSACTIONS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>📊</span> Buyer Radar ({transactions.length})
        </button>

        <button
          type="button"
          onClick={() => setTab('SELLER_ORDERS')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'SELLER_ORDERS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>🏪</span> Supplier Radar ({sellerOrders.length})
        </button>

        <button
          type="button"
          onClick={() => setTab('HEALTH')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'HEALTH'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>🫀</span> Health
          {alerts.length > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] text-white">
              {alerts.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab('USERS')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'USERS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>👥</span> Users &amp; Orgs
        </button>

        <button
          type="button"
          onClick={() => setTab('TICKETS')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'TICKETS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>🎫</span> Tickets
        </button>

        <button
          type="button"
          onClick={() => setTab('ACTIONS')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'ACTIONS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>⚡</span> Ops Actions
        </button>

        <button
          type="button"
          onClick={() => setTab('TESTS')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'TESTS'
              ? 'bg-emerald-600 text-white shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>🧪</span> Test Engine
        </button>

        <button
          type="button"
          onClick={() => setTab('BUYER_DEBUG')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'BUYER_DEBUG'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>🏛️</span> Buyer Debug
        </button>

        <button
          type="button"
          onClick={() => setTab('SUPPLIER_DEBUG')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'SUPPLIER_DEBUG'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>👥</span> Supplier Debug
        </button>

        <button
          type="button"
          onClick={() => setTab('TERMINAL')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'TERMINAL'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>💻</span> Terminal
        </button>

        <button
          type="button"
          onClick={() => setTab('BACKUPS')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'BACKUPS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>💾</span> Backups
        </button>

        <button
          type="button"
          onClick={() => setTab('LOGS')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'LOGS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>📜</span> Logs
        </button>

        <button
          type="button"
          onClick={() => setTab('NOTIFICATIONS')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 active:scale-98 ${
            activeTab === 'NOTIFICATIONS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          <span>🔔</span> Alerts ({health?.counts?.notifications ?? 0})
        </button>
      </div>

      {/* Tab Panels */}
      <main className="zero-scroll-pane mt-2 animate-in fade-in duration-200">
        {activeTab === 'HEALTH' && (
          <AdminHealthDashboard
            health={health}
            alerts={alerts}
            isLoading={isLoadingHealth}
            onRefresh={refreshAllData}
            onNavigateTab={(tab) => setTab(tab.toUpperCase() as AdminTab)}
          />
        )}

        {activeTab === 'TRANSACTIONS' && (
          <AdminTransactionsTable
            transactions={transactions}
            isLoading={isLoadingTx}
            onExecuteAction={async (action, id, reason) => {
              await handleExecuteAction(action, id, { reason });
            }}
            onRefresh={refreshAllData}
          />
        )}

        {activeTab === 'SELLER_ORDERS' && (
          <AdminSellerOrdersTable
            orders={sellerOrders}
            isLoading={isLoadingSellerOrders}
            onExecuteAction={async (action, id, reason) => {
              await handleExecuteAction(action, id, { reason });
            }}
            onRefresh={refreshAllData}
          />
        )}

        {activeTab === 'TICKETS' && <AdminSupportTicketsPanel />}

        {activeTab === 'ACTIONS' && (
          <AdminServiceActionsPanel
            onExecuteAction={handleExecuteAction}
            onRefreshTelemetry={refreshAllData}
          />
        )}

        {activeTab === 'TESTS' && <AdminTestSuiteRunner />}

        {activeTab === 'BUYER_DEBUG' && (
          <AdminBuyerTroubleshooter
            transactions={transactions}
            initialTargetId={searchParams.get('id') || searchParams.get('target') || undefined}
            onRefreshTelemetry={refreshAllData}
          />
        )}

        {activeTab === 'SUPPLIER_DEBUG' && (
          <AdminSellerTroubleshooter
            initialTargetId={searchParams.get('id') || searchParams.get('target') || undefined}
            onRefreshTelemetry={refreshAllData}
          />
        )}

        {activeTab === 'TERMINAL' && <AdminQueryTerminal />}

        {activeTab === 'BACKUPS' && <AdminBackupRestorePanel />}

        {activeTab === 'LOGS' && (
          <AdminAuditLogsViewer
            isPlatformInDemoMode={isPlatformInDemoMode}
            onRefreshTelemetry={refreshAllData}
          />
        )}

        {activeTab === 'USERS' && <AdminUsersActivityPanel />}

        {activeTab === 'NOTIFICATIONS' && (
          <NotificationsPage
            isPlatformInDemoMode={isPlatformInDemoMode}
            onRefreshTelemetry={refreshAllData}
          />
        )}
      </main>
    </div>
  );
}
