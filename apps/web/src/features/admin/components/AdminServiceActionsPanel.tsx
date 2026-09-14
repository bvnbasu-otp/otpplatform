import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { purgeTransactionalData, togglePlatformDemoMode } from '../api/admin-ops';
import type { AdminServiceActionType, ServiceActionResult } from '../types/admin';

interface AdminServiceActionsPanelProps {
  onExecuteAction: (action: AdminServiceActionType, entityId?: string, payload?: Record<string, unknown>) => Promise<ServiceActionResult | null>;
  onRefreshTelemetry: () => void;
}

export function AdminServiceActionsPanel({
  onExecuteAction,
  onRefreshTelemetry,
}: AdminServiceActionsPanelProps) {
  const [searchParams] = useSearchParams();
  const urlEntityId = searchParams.get('entityId') || searchParams.get('id') || searchParams.get('target') || '';

  const [selectedAction, setSelectedAction] = useState<AdminServiceActionType>('SYSTEM_SOFT_RESTART');
  const [targetEntityId, setTargetEntityId] = useState(urlEntityId);
  const [reason, setReason] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<ServiceActionResult | null>(null);

  // Maintenance mode state
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [isTogglingMaint, setIsTogglingMaint] = useState(false);

  // Demo vs Production mode state
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const [isTogglingDemo, setIsTogglingDemo] = useState(false);

  // Supplier network stub state — simulated quotes/fulfilment vs real suppliers
  const [supplierStubEnabled, setSupplierStubEnabled] = useState(true);
  const [isTogglingSupplierStub, setIsTogglingSupplierStub] = useState(false);

  useEffect(() => {
    async function loadSystemState() {
      const [{ data: maintData }, { data: modeData }] = await Promise.all([
        supabase.rpc('get_maintenance_status'),
        supabase.rpc('admin_get_system_mode'),
      ]);
      if (maintData && typeof maintData.maintenanceMode === 'boolean') {
        setMaintenanceEnabled(maintData.maintenanceMode);
      }
      if (modeData && typeof modeData.demo_mode_enabled === 'boolean') {
        setDemoModeEnabled(modeData.demo_mode_enabled);
      }
      if (modeData && typeof modeData.supplier_network_stub_enabled === 'boolean') {
        setSupplierStubEnabled(modeData.supplier_network_stub_enabled);
      }
    }
    void loadSystemState();
  }, []);

  const handleToggleDemoMode = async () => {
    const nextState = !demoModeEnabled;
    const msg = nextState
      ? 'Switch to Staging & Demo Mode? 1-Click demo persona buttons will appear on the sign-in page for testing walkthroughs.'
      : 'Switch to Live Production Mode? Demo persona buttons will be hidden from the sign-in page, enforcing real account credentials.';

    if (!window.confirm(msg)) return;

    setDemoModeEnabled(nextState);
    setIsTogglingDemo(true);
    try {
      const res = await togglePlatformDemoMode(nextState);
      if (!res.ok) {
        setDemoModeEnabled(!nextState);
        alert(`Error: ${res.error}`);
      } else {
        onRefreshTelemetry();
      }
    } finally {
      setIsTogglingDemo(false);
    }
  };

  const handleToggleMaintenance = async () => {
    const nextState = !maintenanceEnabled;
    const msg = nextState
      ? 'Enable Scheduled Maintenance Mode? All non-admin users will be redirected to the "Men at Work" comic puzzle page.'
      : 'End Maintenance Mode and restore normal platform production?';

    if (!window.confirm(msg)) return;

    setIsTogglingMaint(true);
    try {
      const { data, error } = await supabase.rpc('admin_toggle_maintenance_mode', {
        p_enabled: nextState,
        p_message: 'Regular scheduled platform maintenance in progress.',
      });
      if (error) {
        alert(`Error: ${error.message}`);
      } else if (data) {
        setMaintenanceEnabled(nextState);
        onRefreshTelemetry();
      }
    } finally {
      setIsTogglingMaint(false);
    }
  };

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm(`Confirm execution of admin action: [${selectedAction}]?`)) return;

    setIsExecuting(true);
    setLastResult(null);
    try {
      const res = await onExecuteAction(
        selectedAction,
        targetEntityId.trim() || undefined,
        { reason: reason.trim() || 'Manual push from Super Admin console' }
      );
      if (res) {
        setLastResult(res);
        onRefreshTelemetry();
      }
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* Platform Operating Mode Banner (Live Production vs Demo/Staging) */}
      <div className={`rounded-2xl border p-4 sm:p-5 shadow-2xs transition ${
        demoModeEnabled
          ? 'border-indigo-500/40 bg-indigo-500/10'
          : 'border-emerald-500/40 bg-emerald-500/10'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl">{demoModeEnabled ? '🧪' : '🚀'}</span>
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                Platform Operating Mode
              </h3>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold ${
                demoModeEnabled
                  ? 'bg-indigo-600 text-white'
                  : 'bg-emerald-600 text-white'
              }`}>
                {demoModeEnabled ? 'STAGING & DEMO MODE' : 'LIVE PRODUCTION MODE'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              {demoModeEnabled
                ? 'Staging mode is enabled: 1-click persona buttons are visible on the login screen for testing and demo walkthroughs.'
                : 'Production mode is active: Demo persona buttons are hidden on the login screen, enforcing verified credentials and real organization authentication.'}
            </p>
          </div>

          <button
            type="button"
            disabled={isTogglingDemo}
            onClick={handleToggleDemoMode}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2 text-xs font-bold shadow-xs transition active:scale-98 disabled:opacity-50 whitespace-nowrap ${
              demoModeEnabled
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {isTogglingDemo
              ? 'Switching…'
              : demoModeEnabled
              ? '🚀 Switch to Live Production Mode'
              : '🧪 Switch to Staging & Demo Mode'}
          </button>
        </div>
      </div>

      {/* Maintenance Mode Scheduled Banner */}
      <div className={`rounded-2xl border p-4 sm:p-5 shadow-2xs transition ${
        maintenanceEnabled
          ? 'border-amber-500/50 bg-amber-500/10'
          : 'border-slate-300 dark:border-slate-800 bg-card'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl">🚧</span>
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                Scheduled Maintenance Mode (Men at Work)
              </h3>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold ${
                maintenanceEnabled
                  ? 'bg-amber-500 text-black animate-pulse'
                  : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
              }`}>
                {maintenanceEnabled ? 'MAINTENANCE ACTIVE' : 'SYSTEM ONLINE (NORMAL)'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              When enabled, non-admin visitors are automatically redirected to the interactive <strong>&ldquo;Men at Work&rdquo;</strong> comic puzzle screen while database migrations, engine updates, or weekly maintenance are taking place.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/maintenance"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted active:scale-98 transition shadow-2xs"
            >
              🎮 Preview Comic Puzzle ↗
            </a>

            <button
              type="button"
              disabled={isTogglingMaint}
              onClick={handleToggleMaintenance}
              className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2 text-xs font-bold shadow-xs transition active:scale-98 disabled:opacity-50 whitespace-nowrap ${
                maintenanceEnabled
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              {isTogglingMaint
                ? 'Updating…'
                : maintenanceEnabled
                ? '✓ End Maintenance & Restore Live Ops'
                : '🚧 Activate Maintenance Mode'}
            </button>
          </div>
        </div>
      </div>



      {/* Manual Action Dispatcher Form */}
      <div className="rounded-xl border bg-card p-6 shadow-xs space-y-5">
        <div>
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <span>🛠️</span> Stuck Job Diagnostics &amp; Manual Override Action
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Safely advance stalled workflows, bypass blocked committee quorums, re-dispatch dropped pings, or re-verify supplier credentials.
          </p>
        </div>

        <form onSubmit={handleRun} className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-xs font-bold text-foreground mb-1">
              Select Service Intervention Action:
            </label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value as AdminServiceActionType)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="SYSTEM_SOFT_RESTART">⚡ System Soft Restart &amp; Cache Invalidation</option>
              <option value="PUSH_TO_EVALUATION">⏩ Force Push Clarification to Evaluation (Bypass Q&amp;A)</option>
              <option value="AUTO_CONCLUDE_EVALUATION">🏆 Auto-Conclude Evaluation &amp; Lock Award</option>
              <option value="TRIGGER_RUNNER_UP_FALLBACK">🔄 Trigger Runner-Up Award Fallback (Defaulting Supplier)</option>
              <option value="RETRY_NOTIFICATIONS">📨 Re-dispatch Notification Queue &amp; SMS Pings</option>
              <option value="REVERIFY_GSTIN">🛡️ Force Real-time Re-verification of Supplier GSTIN</option>
            </select>
          </div>

          {selectedAction !== 'SYSTEM_SOFT_RESTART' && selectedAction !== 'RETRY_NOTIFICATIONS' && (
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                Target Entity ID (RFQ UUID / Supplier UUID / PO UUID):
              </label>
              <input
                type="text"
                required
                value={targetEntityId}
                onChange={(e) => setTargetEntityId(e.target.value)}
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-foreground mb-1">
              Administrative Reason / Audit Note:
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Stalled over 48h / Customer support ticket request #1042"
              className="w-full rounded-lg border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isExecuting}
              className="rounded-lg bg-foreground text-background px-5 py-2 text-xs font-bold shadow hover:bg-foreground/90 transition disabled:opacity-50"
            >
              {isExecuting ? 'Executing Intervention…' : 'Execute Service Action →'}
            </button>
          </div>
        </form>

        {/* Execution Feedback Result */}
        {lastResult && (
          <div
            className={`rounded-lg p-4 border text-xs animate-in fade-in duration-200 ${
              lastResult.success
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-950'
                : 'border-red-500/40 bg-red-500/10 text-red-950'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              <span>{lastResult.success ? '✓ SUCCESS' : '✕ ACTION FAILED'}</span>
              <span>[{lastResult.action}]</span>
            </div>
            <p className="mt-1 font-medium">{lastResult.message}</p>
          </div>
        )}
      </div>

      {/* Production Testing Reset Section */}
      <div className="rounded-xl border border-red-300/80 bg-red-50/40 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-red-200/80 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🧹</span>
            <div>
              <h3 className="text-sm font-bold text-red-950">
                Purge All Test Records &amp; Reset to Clean Production State
              </h3>
              <p className="text-xs text-red-800">
                Wipes all buyer orders, seller orders, invoices, payments, messages &amp; transient test signups. Restores clean baseline across staging, demo, pilot &amp; production.
              </p>
            </div>
          </div>
          <span className="rounded-md bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 border border-red-300">
            DANGER ZONE
          </span>
        </div>

        <div className="rounded-lg bg-background/80 border p-3 text-xs text-muted-foreground space-y-2">
          <div className="font-semibold text-foreground">
            🛡️ Platform Clean Production &amp; Readiness Baseline:
          </div>
          <ul className="list-disc pl-5 space-y-1 text-[11px] leading-relaxed">
            <li><strong className="text-foreground">Buyer Orders Cleared:</strong> All Requirements, RFQs, Quotes, Evaluations, Committee Votes, and Attachments.</li>
            <li><strong className="text-foreground">Seller Orders Cleared:</strong> All Purchase Orders, Work Orders, Delivery Inspections, Invoices, and Payments.</li>
            <li><strong className="text-foreground">Transients Cleared:</strong> Transient signup requests, quote sessions, support tickets, and ad-hoc test organizations.</li>
            <li><strong className="text-foreground">Core Foundations Preserved:</strong> Pure SuperAdmins, 104 verified suppliers &amp; directory, benchmark pilot org (Greenview Heights RWA), demo accounts, and master taxonomy.</li>
          </ul>
        </div>

        <button
          type="button"
          onClick={async () => {
            let confirmationToken = '';
            if (!demoModeEnabled) {
              const entered = window.prompt(
                '🔒 PRODUCTION ZERO-DATA-LOSS SAFETY LOCK\n\nLive Production Mode is active. Buyer Orders, Seller Orders, and User/Org data are retained by platform policy.\n\nTo force a production purge, enter exact confirmation token:\nPERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN'
              );
              if (entered !== 'PERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN') {
                alert('Action cancelled. Production database and orders remain untouched.');
                return;
              }
              confirmationToken = entered;
            } else {
              if (!window.confirm('⚠️ CONFIRM CLEAN DATA RESET:\n\nThis will permanently purge:\n- All Buyer Orders (Requirements, RFQs, Quotes, Committee Votes)\n- All Seller Orders (Purchase Orders, Work Orders, Inspections, Invoices, Payments)\n- All Transient Test Organizations & Signup Submissions\n\nPreserved:\n- Pure SuperAdmin Accounts\n- 104 Core Verified Suppliers & Directory\n- Benchmark Pilot Organization (Greenview Heights RWA)\n- Demo Account Logins & Master Taxonomy\n\nReady for staging, demo, pilot, pre-production & production.\n\nProceed?')) {
                return;
              }
            }
            try {
              const res = await purgeTransactionalData(confirmationToken);
              if (res.ok) {
                alert(`✓ ${res.message}\n\nPreserved ${res.buyersPreserved ?? 'all'} buyer accounts, ${res.suppliersPreserved ?? 104} verified suppliers, ${res.organizationsPreserved ?? 16} canonical organizations, and ${res.taxonomiesPreserved ?? 16} taxonomies.\n\nReady for staging, demo, pilot, pre-production & production.`);
                onRefreshTelemetry();
              } else {
                alert(`Purge failed: ${res.error}`);
              }
            } catch (err) {
              alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }}
          className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-700 transition"
        >
          🧹 Purge All Test Records &amp; Reset to Clean Production State
        </button>
      </div>
    </div>
  );
}
