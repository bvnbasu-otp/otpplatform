import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
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

import {
  type AdminTab,
  type AdminCategoryKey,
  type AdminModuleDef,
  type AdminCategoryDef,
  type AdminDynamicCounts,
  ADMIN_CATEGORIES,
  ALL_ADMIN_MODULES,
} from '../types/admin-navigation';

export {
  type AdminTab,
  type AdminCategoryKey,
  type AdminModuleDef,
  type AdminCategoryDef,
  type AdminDynamicCounts,
  ADMIN_CATEGORIES,
  ALL_ADMIN_MODULES,
};

export function AdminDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab')?.toUpperCase();

  // Handle aliases and resolve active tab
  const resolvedTab: AdminTab | 'TILES' = useMemo(() => {
    if (rawTab === 'TILES' || rawTab === 'GRID' || rawTab === 'OVERVIEW' || rawTab === 'ALL') {
      return 'TILES';
    }
    if (
      rawTab === 'ORDERS' ||
      rawTab === 'TRANSACTIONS' ||
      rawTab === 'PIPELINE' ||
      rawTab === 'BUYER_ORDERS' ||
      rawTab === 'BUYER-ORDERS' ||
      rawTab === 'ORDERS_RADAR' ||
      rawTab === 'SOURCING'
    ) {
      return 'TRANSACTIONS';
    }
    if (
      rawTab === 'SELLER_ORDERS' ||
      rawTab === 'SELLER-ORDERS' ||
      rawTab === 'SELLER_TRANSACTIONS' ||
      rawTab === 'SELLER-TRANSACTIONS' ||
      rawTab === 'SUPPLIER_ORDERS' ||
      rawTab === 'SUPPLIER-ORDERS'
    ) {
      return 'SELLER_ORDERS';
    }
    if (rawTab === 'NOTIFICATIONS' || rawTab === 'NOTIFICATION' || rawTab === 'ALERTS' || rawTab === 'LOGS_ALERTS') {
      return 'NOTIFICATIONS';
    }
    if (rawTab === 'HEALTH' || rawTab === 'SYSTEM_HEALTH' || rawTab === 'UPTIME' || rawTab === 'HEALTH_SUPPORT') {
      return 'HEALTH';
    }
    if (
      rawTab === 'ORGS' ||
      rawTab === 'ORGANIZATIONS' ||
      rawTab === 'ORGS_SUPPLIERS' ||
      rawTab === 'ORGS-SUPPLIERS' ||
      rawTab === 'SUPPLIERS' ||
      rawTab === 'SUPPLIER_REGISTRY'
    ) {
      return 'ORGS_SUPPLIERS';
    }
    if (
      rawTab === 'APPROVALS' ||
      rawTab === 'APPROVAL_QUEUE' ||
      rawTab === 'APPROVAL-QUEUE' ||
      rawTab === 'REGISTRATIONS' ||
      rawTab === 'PENDING_REGISTRATIONS'
    ) {
      return 'APPROVALS';
    }
    if (rawTab === 'USERS' || rawTab === 'USER' || rawTab === 'ROSTER' || rawTab === 'USERS_ORGS' || rawTab === 'SUPPLIER_NETWORK') {
      return 'USERS';
    }
    if (rawTab === 'TICKETS' || rawTab === 'SUPPORT' || rawTab === 'DISPUTES' || rawTab === 'DISPUTE' || rawTab === 'GOVERNANCE') {
      return 'TICKETS';
    }
    if (rawTab === 'ACTIONS' || rawTab === 'SERVICE_ACTIONS' || rawTab === 'OPS' || rawTab === 'EMERGENCY' || rawTab === 'SYSTEM_OPS') {
      return 'ACTIONS';
    }
    if (rawTab === 'TESTS' || rawTab === 'TEST_RUNNER' || rawTab === 'TEST_ENGINE' || rawTab === 'REGRESSION' || rawTab === 'TESTS_OPS') {
      return 'TESTS';
    }
    if (
      rawTab === 'BUYER_DEBUG' ||
      rawTab === 'BUYER-DEBUG' ||
      rawTab === 'BUYER_TROUBLESHOOT' ||
      rawTab === 'BUYER-TROUBLESHOOT' ||
      rawTab === 'BUYER_DIAGNOSTICS' ||
      rawTab === 'DIAGNOSTICS'
    ) {
      return 'BUYER_DEBUG';
    }
    if (
      rawTab === 'SUPPLIER_DEBUG' ||
      rawTab === 'SUPPLIER-DEBUG' ||
      rawTab === 'SELLER_DEBUG' ||
      rawTab === 'SELLER-DEBUG' ||
      rawTab === 'SUPPLIER_TROUBLESHOOT' ||
      rawTab === 'SUPPLIER-TROUBLESHOOT' ||
      rawTab === 'SELLER_DIAGNOSTICS'
    ) {
      return 'SUPPLIER_DEBUG';
    }
    if (rawTab === 'TERMINAL' || rawTab === 'SQL' || rawTab === 'QUERY' || rawTab === 'SQL_TERMINAL' || rawTab === 'DATABASE_OPS') {
      return 'TERMINAL';
    }
    if (rawTab === 'BACKUPS' || rawTab === 'BACKUP' || rawTab === 'SNAPSHOTS' || rawTab === 'RESTORE') {
      return 'BACKUPS';
    }
    if (rawTab === 'LOGS' || rawTab === 'AUDIT' || rawTab === 'AUDIT_LOGS' || rawTab === 'AUDIT-LOGS' || rawTab === 'ANALYTICS') {
      return 'LOGS';
    }

    return (rawTab as AdminTab) || 'TRANSACTIONS';
  }, [rawTab]);

  const activeTab: AdminTab = resolvedTab === 'TILES' ? 'TRANSACTIONS' : resolvedTab;
  const isTilesView = resolvedTab === 'TILES';

  // Quick module switcher drawer / selector state
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [moduleSearchFilter, setModuleSearchFilter] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<AdminCategoryKey | 'ALL'>('ALL');

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

  const dynamicCounts: AdminDynamicCounts = useMemo(() => {
    return {
      transactionsCount: transactions.length,
      sellerOrdersCount: sellerOrders.length,
      alertsCount: alerts.length,
      notificationsCount: health?.counts?.notifications ?? 0,
      usersCount: health?.counts?.profiles ?? 0,
      auditCount: health?.counts?.auditEvents ?? 0,
    };
  }, [transactions.length, sellerOrders.length, alerts.length, health?.counts]);

  const setTab = (tab: AdminTab | 'TILES') => {
    setIsSelectorOpen(false);
    setSearchParams({ tab: tab.toLowerCase() });
  };

  const currentModule = ALL_ADMIN_MODULES.find((m) => m.key === activeTab) || ALL_ADMIN_MODULES[0]!;
  const currentCategory = ADMIN_CATEGORIES.find((c) => c.key === currentModule.categoryKey) || ADMIN_CATEGORIES[0]!;
  const currentModuleIndex = ALL_ADMIN_MODULES.findIndex((m) => m.key === activeTab);

  const goToNextModule = useCallback(() => {
    if (isTilesView) return;
    const nextIdx = (currentModuleIndex + 1) % ALL_ADMIN_MODULES.length;
    setTab(ALL_ADMIN_MODULES[nextIdx]!.key);
  }, [isTilesView, currentModuleIndex]);

  const goToPrevModule = useCallback(() => {
    if (isTilesView) return;
    const prevIdx = (currentModuleIndex - 1 + ALL_ADMIN_MODULES.length) % ALL_ADMIN_MODULES.length;
    setTab(ALL_ADMIN_MODULES[prevIdx]!.key);
  }, [isTilesView, currentModuleIndex]);

  const mobileSwipeHandlers = useSwipeGesture({
    onSwipeLeft: goToNextModule,
    onSwipeRight: goToPrevModule,
    minDelta: 50,
    horizontalDominanceRatio: 1.5,
  });

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

  const filteredCategoriesForSearch = useMemo(() => {
    return ADMIN_CATEGORIES.map((cat) => {
      const filteredMods = cat.modules.filter((mod) => {
        if (selectedCategoryFilter !== 'ALL' && cat.key !== selectedCategoryFilter) return false;
        if (!moduleSearchFilter.trim()) return true;
        const q = moduleSearchFilter.toLowerCase();
        return (
          mod.title.toLowerCase().includes(q) ||
          mod.shortTitle.toLowerCase().includes(q) ||
          mod.description.toLowerCase().includes(q) ||
          cat.title.toLowerCase().includes(q)
        );
      });
      return {
        ...cat,
        modules: filteredMods,
      };
    }).filter((cat) => cat.modules.length > 0);
  }, [moduleSearchFilter, selectedCategoryFilter]);

  return (
    <div className="min-h-screen bg-background text-foreground p-2 sm:p-4 max-w-7xl mx-auto w-full pb-36 sm:pb-24 overflow-x-hidden">
      {/* Top Header Banner */}
      <header className="rounded-2xl border bg-card px-3.5 sm:px-4 py-2.5 sm:py-3 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setTab(isTilesView ? 'TRANSACTIONS' : 'TILES')}
            className="text-sm sm:text-base font-black tracking-tight text-foreground flex items-center gap-1.5 truncate hover:text-primary transition"
            title="Toggle Control Tower Overview"
          >
            <span className="text-lg">🛡️</span>
            <span className="truncate">Control Tower</span>
          </button>

          {/* Operating Mode Badge */}
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

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setTab('APPROVALS')}
            className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-2.5 sm:px-3 py-1.5 text-xs font-bold transition active:scale-98 shadow-2xs cursor-pointer ${
              activeTab === 'APPROVALS'
                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                : 'bg-card text-foreground hover:bg-muted border-amber-500/40 text-amber-900 dark:text-amber-200'
            }`}
            title="Open Onboarding Approvals Queue"
          >
            <span className="text-sm">📋</span>
            <span className="hidden sm:inline">Approvals</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('TILES')}
            className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-2.5 sm:px-3 py-1.5 text-xs font-bold transition active:scale-98 shadow-2xs cursor-pointer ${
              isTilesView
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-foreground hover:bg-muted'
            }`}
            title="All Administrative Modules (Grid Directory)"
          >
            <span className="text-sm">▦</span>
            <span className="hidden sm:inline">Modules</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSelectorOpen(true)}
            className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border bg-card px-2.5 sm:px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted active:scale-98 transition shadow-2xs cursor-pointer"
            title="Open Quick Module Switcher (⚡)"
          >
            <span className="text-sm">⚡</span>
            <span className="hidden md:inline">Quick Switch</span>
          </button>

          <button
            type="button"
            onClick={refreshAllData}
            className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border bg-card px-2 sm:px-2.5 py-1 text-xs font-semibold hover:bg-muted active:scale-98 transition shrink-0 shadow-2xs cursor-pointer"
            title="Refresh All Telemetry & Records Data"
          >
            <span className="text-sm">🔄</span>
            <span className="hidden sm:inline ml-1">Refresh</span>
          </button>
        </div>
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

      {/* VIEW 1: FULL CATEGORY TILES GRID VIEW (When in TILES view) */}
      {isTilesView ? (
        <div className="mt-3 space-y-4 animate-in fade-in duration-150">
          {/* Tiles View Header */}
          <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">▦</span>
                <h2 className="text-base sm:text-lg font-black text-foreground">
                  Administrative Modules &amp; Control Tower Directory
                </h2>
                <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-[11px] font-bold">
                  {ALL_ADMIN_MODULES.length} Modules · 7 Canonical Categories
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Select any operational module below to access live procurement radar, diagnostics, governance, and platform utilities.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={moduleSearchFilter}
                onChange={(e) => setModuleSearchFilter(e.target.value)}
                placeholder="Filter administrative modules..."
                className="rounded-xl border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary min-w-[220px]"
              />
              {moduleSearchFilter && (
                <button
                  type="button"
                  onClick={() => setModuleSearchFilter('')}
                  className="text-xs text-muted-foreground hover:text-foreground font-bold px-2 py-1"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* 6 Visual Category Tiles Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredCategoriesForSearch.map((category) => {
              const totalCatBadge = category.modules.reduce((acc, m) => {
                const b = m.badge?.(dynamicCounts);
                if (typeof b === 'number') return acc + b;
                return acc;
              }, 0);

              return (
                <div
                  key={category.key}
                  className={`rounded-2xl border bg-card p-4 shadow-2xs flex flex-col justify-between space-y-3.5 transition hover:shadow-md ${category.colorClass}`}
                >
                  {/* Category Header */}
                  <div className="space-y-1.5 border-b pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{category.icon}</span>
                        <h3 className="text-sm font-bold text-foreground">{category.title}</h3>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black border ${category.badgeClass}`}>
                        {category.modules.length} {category.modules.length === 1 ? 'Module' : 'Modules'}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {category.description}
                    </p>
                  </div>

                  {/* Category Submodules List */}
                  <div className="space-y-2 flex-1">
                    {category.modules.map((mod) => {
                      const badgeValue = mod.badge?.(dynamicCounts);
                      const isActive = activeTab === mod.key;

                      return (
                        <button
                          key={mod.key}
                          type="button"
                          onClick={() => setTab(mod.key)}
                          className={`w-full text-left rounded-xl border p-2.5 sm:p-3 transition flex items-start justify-between gap-2.5 group active:scale-[0.99] mobile-touch-target ${
                            isActive
                              ? 'bg-primary text-primary-foreground border-primary shadow-xs font-bold'
                              : 'bg-background/80 hover:bg-muted/80 text-foreground border-border/70 hover:border-border'
                          }`}
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span>{mod.icon}</span>
                              <span className="text-xs font-bold truncate group-hover:text-primary transition">
                                {mod.title}
                              </span>
                            </div>
                            <p
                              className={`text-[10px] line-clamp-1 ${
                                isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'
                              }`}
                            >
                              {mod.description}
                            </p>
                          </div>

                          {badgeValue !== null && badgeValue !== undefined && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-black shrink-0 border ${
                                isActive
                                  ? 'bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30'
                                  : 'bg-muted text-foreground border-border'
                              }`}
                            >
                              {badgeValue}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-1 space-y-2">
          {/* Active Navigation & Category Bar */}
          <div className="rounded-2xl border bg-card p-2 shadow-2xs flex flex-col gap-1.5">
            {/* Top Row: Back to Tiles & Current Module Information */}
            <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5 px-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setTab('TILES')}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border bg-muted/50 hover:bg-muted px-2 py-0.5 text-xs font-bold text-foreground transition active:scale-98 shrink-0 cursor-pointer"
                  title="Return to Grid / All Modules Directory"
                >
                  <span>←</span> <span className="hidden sm:inline">Grid</span>
                </button>

                <div className="flex items-center gap-1 truncate text-xs">
                  <span className="text-muted-foreground font-semibold hidden md:inline">
                    {currentCategory.icon} {currentCategory.shortTitle} /
                  </span>
                  <span className="font-extrabold text-foreground flex items-center gap-1 truncate">
                    <span>{currentModule.icon}</span>
                    <span className="truncate">{currentModule.title}</span>
                  </span>
                </div>
              </div>

              {/* Quick Switch Button */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSelectorOpen(true)}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-bold transition active:scale-98 cursor-pointer"
                  title="Open Quick Module Selector"
                >
                  <span>⚡</span>
                  <span className="hidden sm:inline">Switch</span>
                  <span>▾</span>
                </button>
              </div>
            </div>

            {/* Bottom Row: Compact Category Icon Pills with Tooltips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar scrollbar-none w-full max-w-full px-0.5">
              {ADMIN_CATEGORIES.map((cat) => {
                const isCatActive = cat.key === currentCategory.key;
                const firstMod = cat.modules[0]!;

                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => {
                      if (isCatActive) {
                        const nextModIndex = (cat.modules.findIndex((m) => m.key === activeTab) + 1) % cat.modules.length;
                        setTab(cat.modules[nextModIndex]!.key);
                      } else {
                        setTab(firstMod.key);
                      }
                    }}
                    title={`${cat.title} (${cat.modules.length} module${cat.modules.length === 1 ? '' : 's'})`}
                    className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1 text-xs font-bold transition shrink-0 active:scale-98 mobile-touch-target cursor-pointer ${
                      isCatActive
                        ? 'bg-primary text-primary-foreground shadow-2xs font-extrabold'
                        : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
                    }`}
                  >
                    <span className="text-sm">{cat.icon}</span>
                    <span className="hidden sm:inline text-[11px]">{cat.shortTitle}</span>
                    {cat.modules.length > 1 && (
                      <span
                        className={`rounded-full px-1 py-0.1 text-[9px] font-bold ${
                          isCatActive
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-muted-foreground/20 text-muted-foreground'
                        }`}
                      >
                        {cat.modules.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Intra-Category Module Switcher (Compact Icons + Labels) */}
            {currentCategory.modules.length > 1 && (
              <div className="flex items-center gap-1 overflow-x-auto pt-1 border-t border-border/30 no-scrollbar scrollbar-none w-full max-w-full px-0.5">
                {currentCategory.modules.map((mod) => {
                  const isModActive = mod.key === activeTab;
                  const modBadge = mod.badge?.(dynamicCounts);

                  return (
                    <button
                      key={mod.key}
                      type="button"
                      onClick={() => setTab(mod.key)}
                      title={`${mod.title} — ${mod.description}`}
                      className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 sm:px-2.5 py-0.5 text-xs font-bold transition shrink-0 active:scale-98 mobile-touch-target cursor-pointer ${
                        isModActive
                          ? 'bg-foreground text-background shadow-xs font-extrabold'
                          : 'bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      }`}
                    >
                      <span>{mod.icon}</span>
                      <span className="text-[11px]">{mod.shortTitle}</span>
                      {modBadge !== null && modBadge !== undefined && (
                        <span
                          className={`rounded-full px-1.5 py-0.1 text-[9px] font-bold ${
                            isModActive
                              ? 'bg-background/20 text-background'
                              : 'bg-muted text-foreground'
                          }`}
                        >
                          {modBadge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tab Panels Content with Touch Swipe Support */}
          <main
            className="w-full mt-2 animate-in fade-in duration-150 touch-pan-y"
            {...mobileSwipeHandlers.handlers}
          >
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

            {activeTab === 'USERS' && (
              <AdminUsersActivityPanel
                initialSubTab="USERS"
                onSubTabChange={(sub) => {
                  if (sub === 'ORGANIZATIONS') setTab('ORGS_SUPPLIERS');
                  else if (sub === 'REGISTRATIONS') setTab('APPROVALS');
                }}
              />
            )}

            {activeTab === 'ORGS_SUPPLIERS' && (
              <AdminUsersActivityPanel
                initialSubTab="ORGANIZATIONS"
                onSubTabChange={(sub) => {
                  if (sub === 'USERS') setTab('USERS');
                  else if (sub === 'REGISTRATIONS') setTab('APPROVALS');
                }}
              />
            )}

            {activeTab === 'APPROVALS' && (
              <AdminUsersActivityPanel
                initialSubTab="REGISTRATIONS"
                onSubTabChange={(sub) => {
                  if (sub === 'USERS') setTab('USERS');
                  else if (sub === 'ORGANIZATIONS') setTab('ORGS_SUPPLIERS');
                }}
              />
            )}

            {activeTab === 'NOTIFICATIONS' && (
              <NotificationsPage
                isPlatformInDemoMode={isPlatformInDemoMode}
                onRefreshTelemetry={refreshAllData}
              />
            )}
          </main>
        </div>
      )}

      {/* QUICK MODULE SELECTOR DRAWER / MODAL */}
      {isSelectorOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick Module Selector"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-2xl rounded-2xl border bg-card p-4 sm:p-5 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4 max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚡</span>
                <h3 className="text-sm sm:text-base font-bold text-foreground">
                  Quick Module Selector
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSelectorOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Category Filter Pills & Search in Drawer */}
            <div className="space-y-2 shrink-0">
              <input
                type="text"
                value={moduleSearchFilter}
                onChange={(e) => setModuleSearchFilter(e.target.value)}
                placeholder="Search modules (e.g. Buyer, Radar, SQL, Logs, Audit)..."
                className="w-full rounded-xl border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('ALL')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition shrink-0 ${
                    selectedCategoryFilter === 'ALL'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All ({ALL_ADMIN_MODULES.length})
                </button>
                {ADMIN_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat.key)}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition shrink-0 flex items-center gap-1 ${
                      selectedCategoryFilter === cat.key
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.shortTitle}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Modules List in Drawer */}
            <div className="overflow-y-auto space-y-3 pr-1 flex-1 min-h-0">
              {filteredCategoriesForSearch.map((cat) => (
                <div key={cat.key} className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <span>{cat.icon}</span>
                    <span>{cat.title}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {cat.modules.map((mod) => {
                      const isActive = activeTab === mod.key;
                      const badgeVal = mod.badge?.(dynamicCounts);

                      return (
                        <button
                          key={mod.key}
                          type="button"
                          onClick={() => setTab(mod.key)}
                          className={`rounded-xl border p-2.5 text-left transition flex items-start justify-between gap-2 group mobile-touch-target ${
                            isActive
                              ? 'bg-primary text-primary-foreground border-primary shadow-xs font-bold'
                              : 'bg-muted/20 hover:bg-muted/60 text-foreground border-border'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs font-bold truncate">
                              <span>{mod.icon}</span>
                              <span className="truncate group-hover:text-primary transition">{mod.title}</span>
                            </div>
                            <p
                              className={`text-[10px] line-clamp-1 mt-0.5 ${
                                isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'
                              }`}
                            >
                              {mod.description}
                            </p>
                          </div>

                          {badgeVal !== null && badgeVal !== undefined && (
                            <span
                              className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold shrink-0 border ${
                                isActive
                                  ? 'bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30'
                                  : 'bg-muted text-foreground border-border'
                              }`}
                            >
                              {badgeVal}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="border-t pt-3 flex items-center justify-between shrink-0 text-xs text-muted-foreground">
              <span>Press ESC to close</span>
              <button
                type="button"
                onClick={() => setTab('TILES')}
                className="font-bold text-primary hover:underline"
              >
                Open Full Grid View →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guaranteed scroll clearance spacer above MobileBottomNav */}
      <div className="h-28 sm:h-16 shrink-0 w-full" aria-hidden="true" />
    </div>
  );
}
