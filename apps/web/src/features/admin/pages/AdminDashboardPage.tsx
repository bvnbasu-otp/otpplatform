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
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full">
      {/* Top Header Banner - Compact Single Row */}
      <header className="rounded-lg border bg-card px-3 py-1.5 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-xs font-bold tracking-tight text-foreground flex items-center gap-1.5 truncate">
            <span>🛡️</span> Admin Console
          </h1>
          {/* Single Platform Operating Mode Badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.2 text-[10px] font-bold shrink-0 ${
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
            {isPlatformInDemoMode ? 'STAGING & DEMO' : 'LIVE PROD'}
          </span>
        </div>

        <button
          type="button"
          onClick={refreshAllData}
          className="rounded border bg-card px-2 py-0.5 text-[11px] font-medium hover:bg-muted transition shrink-0 shadow-2xs"
        >
          🔄 Refresh
        </button>
      </header>

      {/* Global Status Flash Banner */}
      {statusMessage && (
        <div className="mt-1 shrink-0 flex items-center justify-between rounded bg-emerald-500/10 border border-emerald-500/30 p-1.5 text-xs text-emerald-950 dark:text-emerald-200">
          <div className="flex items-center gap-1.5 font-semibold">
            <span>✓</span> {statusMessage}
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-muted-foreground hover:text-foreground font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs Bar - Compact Single Row */}
      <div className="mt-1.5 shrink-0 flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
        <button
          type="button"
          onClick={() => setTab('TRANSACTIONS')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'TRANSACTIONS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>📊</span> Buyer Orders ({transactions.length})
        </button>

        <button
          type="button"
          onClick={() => setTab('SELLER_ORDERS')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'SELLER_ORDERS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>🏪</span> Seller Orders ({sellerOrders.length})
        </button>

        <button
          type="button"
          onClick={() => setTab('HEALTH')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'HEALTH'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>🫀</span> Health
          {alerts.length > 0 && (
            <span className="rounded-full bg-amber-500 px-1 text-[9px] text-white">
              {alerts.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab('TICKETS')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'TICKETS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>🎫</span> Tickets
        </button>

        <button
          type="button"
          onClick={() => setTab('ACTIONS')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'ACTIONS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>⚡</span> Restart &amp; Actions
        </button>

        <button
          type="button"
          onClick={() => setTab('TESTS')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'TESTS'
              ? 'bg-emerald-600 text-white shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>🧪</span> Pre-Prod Tests
        </button>

        <button
          type="button"
          onClick={() => setTab('BUYER_DEBUG')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'BUYER_DEBUG'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>🏛️</span> Buyer Debug
        </button>

        <button
          type="button"
          onClick={() => setTab('SUPPLIER_DEBUG')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'SUPPLIER_DEBUG'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>👥</span> Supplier Debug
        </button>

        <button
          type="button"
          onClick={() => setTab('TERMINAL')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'TERMINAL'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>💻</span> SQL Terminal
        </button>

        <button
          type="button"
          onClick={() => setTab('BACKUPS')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'BACKUPS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>💾</span> Backups
        </button>

        <button
          type="button"
          onClick={() => setTab('LOGS')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'LOGS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>📜</span> Logs
        </button>

        <button
          type="button"
          onClick={() => setTab('USERS')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'USERS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>👥</span> Users &amp; Orgs
        </button>

        <button
          type="button"
          onClick={() => setTab('NOTIFICATIONS')}
          className={`flex items-center gap-1 rounded px-2.5 py-1 font-bold transition shrink-0 ${
            activeTab === 'NOTIFICATIONS'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>🔔</span> Notifications ({health?.counts?.notifications ?? 0})
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
