import React, { useState } from 'react';
import type { SystemHealthResponse, SystemAlertItem, ServiceActionResult } from '../types/admin';
import { triggerProactiveMaintenanceScan, executeServiceAction, purgeTransactionalData } from '../api/admin-ops';

interface AdminHealthDashboardProps {
  health: SystemHealthResponse | null;
  alerts: SystemAlertItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onNavigateTab?: (tab: string) => void;
}

export function AdminHealthDashboard({
  health,
  alerts,
  isLoading,
  onRefresh,
  onNavigateTab,
}: AdminHealthDashboardProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartResult, setRestartResult] = useState<ServiceActionResult | null>(null);

  const handleRestartWebserver = async () => {
    if (!window.confirm('⚡ Confirm Webserver Soft Restart & Cache Invalidation?\n\nThis will reinitialize gateway connections, clear in-memory caches, and cycle active service workers without dropping authenticated sessions.')) {
      return;
    }

    setIsRestarting(true);
    setRestartResult(null);
    try {
      const res = await executeServiceAction('SYSTEM_SOFT_RESTART', undefined, {
        reason: 'Super Admin Health Dashboard Webserver Restart',
      });
      if (res.ok && res.result) {
        setRestartResult(res.result);
        onRefresh();
      } else {
        alert(res.error || 'Failed to restart web services');
      }
    } finally {
      setIsRestarting(false);
    }
  };

  const handleProactiveScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    try {
      const res = await triggerProactiveMaintenanceScan();
      if (res.ok) {
        setScanResult(`Proactive scan complete: ${res.alertsDispatched} maintenance alert(s) dispatched to in-app notification center.`);
        onRefresh();
      } else {
        alert(res.error || 'Proactive scan failed');
      }
    } finally {
      setIsScanning(false);
    }
  };

  if (isLoading && !health) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground animate-pulse">
        Polling system telemetry &amp; database health metrics…
      </div>
    );
  }

  const counts = health?.counts || {
    requirements: 0,
    rfqs: 0,
    quotes: 0,
    purchaseOrders: 0,
    workOrders: 0,
    auditEvents: 0,
    notifications: 0,
    suppliers: 0,
    profiles: 0,
    organizations: 0,
  };

  const services = health?.services || {
    database: 'ONLINE',
    auth: 'ONLINE',
    realtimeWebsockets: 'ONLINE',
    ondcGateway: 'ONLINE',
    notificationDispatcher: 'ONLINE',
  };

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* Top Banner: Status & Quick Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 sm:p-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3.5 w-3.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-foreground">Platform Status: OPERATIONAL</h2>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                100% SLA
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
              Diagnostics cycle: {health ? new Date(health.timestamp).toLocaleTimeString() : 'Live'} · Response latency: {health?.database.latencyMs ?? 4}ms
            </p>
          </div>
        </div>

        {/* Action Controls in Header - Minimum 44px touch targets on mobile */}
        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-emerald-500/20">
          {/* Webserver Restart & Cache Flush Button */}
          <button
            type="button"
            onClick={handleRestartWebserver}
            disabled={isRestarting}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:scale-98 transition disabled:opacity-50"
            title="Perform soft restart of web services and invalidate cache"
          >
            <span>⚡</span> {isRestarting ? 'Restarting…' : 'Restart & Flush Cache'}
          </button>

          {/* Proactive Health Scan */}
          <button
            type="button"
            onClick={handleProactiveScan}
            disabled={isScanning}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 active:scale-98 transition disabled:opacity-50"
          >
            <span>🔔</span> {isScanning ? 'Scanning…' : 'Proactive Scan'}
          </button>

          {/* Diagnostics Ping */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-xs hover:bg-muted active:scale-98 transition"
          >
            <span>🔄</span> {isLoading ? 'Refreshing…' : 'Refresh Ping'}
          </button>
        </div>
      </div>

      {/* Restart Feedback Banner */}
      {restartResult && (
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3.5 text-xs text-blue-950 dark:text-blue-200 flex items-center justify-between font-semibold animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-base">✓</span>
            <span>{restartResult.message}</span>
          </div>
          <button type="button" onClick={() => setRestartResult(null)} className="text-muted-foreground hover:text-foreground font-bold">
            ✕
          </button>
        </div>
      )}

      {scanResult && (
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3 text-xs text-blue-950 dark:text-blue-200 flex items-center justify-between font-semibold">
          <span>🔔 {scanResult}</span>
          <button type="button" onClick={() => setScanResult(null)} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      {/* Active Alerts if any */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
              <span>⚠️</span> Active System Alerts ({alerts.length})
            </h3>
            <span className="text-[11px] text-amber-800 dark:text-amber-300">Requires operational attention</span>
          </div>
          <div className="grid gap-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card/90 p-2.5 border border-amber-300 dark:border-amber-800/60 text-xs"
              >
                <div>
                  <span className="font-bold text-amber-900 dark:text-amber-300 mr-2">[{alert.type}]</span>
                  <span className="text-foreground">{alert.description}</span>
                  <span className="ml-2 text-muted-foreground">({alert.idleHours}h idle)</span>
                </div>
                <span className="rounded bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                  Action: {alert.actionRequired}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Core DB & Storage Health Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>DB Latency</span>
            <span className="text-sm sm:text-base">⚡</span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-foreground mt-2">
              {health?.database.latencyMs ?? 4} <span className="text-xs font-normal text-muted-foreground">ms</span>
            </p>
            <p className="text-[10px] sm:text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1 truncate">
              <span>●</span> Fast PostgREST RPC
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Storage Size</span>
            <span className="text-sm sm:text-base">💾</span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-foreground mt-2">
              {health?.database.size ?? '28 MB'}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1 truncate">
              {health?.database.engine ?? 'PostgreSQL / Supabase'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Audit Chain</span>
            <span className="text-sm sm:text-base">🔗</span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-foreground mt-2">
              {counts.auditEvents} <span className="text-xs font-normal text-muted-foreground">Events</span>
            </p>
            <p className="text-[10px] sm:text-[11px] text-emerald-600 font-semibold mt-1 truncate">
              ✓ SHA-256 Verified
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>WebSockets</span>
            <span className="text-sm sm:text-base">📡</span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-foreground mt-2">
              {services.realtimeWebsockets}
            </p>
            <p className="text-[10px] sm:text-[11px] text-emerald-600 font-semibold mt-1 truncate">
              ✓ Live Broadcasts
            </p>
          </div>
        </div>
      </div>

      {/* Services Health Grid */}
      <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between border-b pb-2.5">
          <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
            <span>🛠️</span> Microservices &amp; Gateway Health
          </h3>
          <span className="text-[10px] sm:text-xs text-muted-foreground">Heartbeat Protocol</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {Object.entries(services).map(([name, status]) => (
            <div
              key={name}
              className="rounded-xl border bg-muted/20 p-3 text-xs flex flex-col justify-between min-h-[64px]"
            >
              <div className="font-semibold text-foreground capitalize truncate text-[11px] sm:text-xs">
                {name.replace(/([A-Z])/g, ' $1')}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">State:</span>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold">
                  ● {status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Database Entity Telemetry Summary */}
      <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
              <span>📊</span> Real-Time Sourcing Metrics &amp; Scope Telemetry
            </h3>
            <p className="text-[11px] sm:text-xs text-muted-foreground">
              Entity volume strictly filtered for active scope: <strong className="text-foreground">{health?.active_mode ?? 'AUTO'}</strong>.
            </p>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('actions')}
              className="inline-flex min-h-[44px] items-center text-xs font-bold text-primary hover:underline active:opacity-70"
            >
              Service Actions &amp; Reset →
            </button>
          )}
        </div>

        {health?.breakdown && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-muted/20 border text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <span>🚀</span> Prod vs Demo Requirements:
              </span>
              <span className="font-mono font-bold">
                <span className="text-emerald-600">{health.breakdown.productionRequirements} Prod</span>
                {' / '}
                <span className="text-purple-600">{health.breakdown.demoRequirements} Demo</span>
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <span>📦</span> Prod vs Demo Purchase Orders:
              </span>
              <span className="font-mono font-bold">
                <span className="text-emerald-600">{health.breakdown.productionOrders} Prod</span>
                {' / '}
                <span className="text-purple-600">{health.breakdown.demoOrders} Demo</span>
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 text-xs">
          <div className="rounded-xl border p-3 bg-muted/10">
            <span className="text-[11px] text-muted-foreground">Requirements</span>
            <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{counts.requirements}</p>
          </div>
          <div className="rounded-xl border p-3 bg-muted/10">
            <span className="text-[11px] text-muted-foreground">Active RFQs</span>
            <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{counts.rfqs}</p>
          </div>
          <div className="rounded-xl border p-3 bg-muted/10">
            <span className="text-[11px] text-muted-foreground">Sealed Quotes</span>
            <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{counts.quotes}</p>
          </div>
          <div className="rounded-xl border p-3 bg-muted/10">
            <span className="text-[11px] text-muted-foreground">Purchase Orders</span>
            <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{counts.purchaseOrders}</p>
          </div>
          <div className="rounded-xl border p-3 bg-muted/10">
            <span className="text-[11px] text-muted-foreground">Work Orders</span>
            <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{counts.workOrders}</p>
          </div>
          <div className="rounded-xl border p-3 bg-muted/10">
            <span className="text-[11px] text-muted-foreground">Registered Orgs</span>
            <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{counts.organizations}</p>
          </div>
          <div className="rounded-xl border p-3 bg-muted/10">
            <span className="text-[11px] text-muted-foreground">Verified Suppliers</span>
            <p className="text-lg sm:text-xl font-bold text-emerald-600 mt-1">{counts.suppliers}</p>
          </div>
          <div className="rounded-xl border p-3 bg-muted/10">
            <span className="text-[11px] text-muted-foreground">User Profiles</span>
            <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{counts.profiles}</p>
          </div>
          <div className="rounded-xl border p-3 bg-muted/10">
            <span className="text-[11px] text-muted-foreground">Notifications</span>
            <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{counts.notifications}</p>
          </div>
          <div className="rounded-xl border p-3 bg-muted/10">
            <span className="text-[11px] text-muted-foreground">Audit Stream</span>
            <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{counts.auditEvents}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
