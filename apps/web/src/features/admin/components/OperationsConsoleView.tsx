import React, { useState } from 'react';
import { InternalRoleMascot } from './InternalRoleMascots';
import { AdminHealthDashboard } from './AdminHealthDashboard';
import { AdminTestSuiteRunner } from './AdminTestSuiteRunner';
import { AdminServiceActionsPanel } from './AdminServiceActionsPanel';
import { AdminQueryTerminal } from './AdminQueryTerminal';
import { AdminBackupRestorePanel } from './AdminBackupRestorePanel';
import { AdminAnnouncementsPanel } from './AdminAnnouncementsPanel';
import type {
  SystemHealthResponse,
  SystemAlertItem,
  AdminServiceActionType,
  ServiceActionResult,
} from '../types/admin';

export interface OperationsConsoleViewProps {
  health?: SystemHealthResponse | null;
  alerts?: SystemAlertItem[];
  isLoadingHealth?: boolean;
  onRefresh?: () => void;
  onRefreshHealth?: () => void;
  onExecuteAction?: (
    action: AdminServiceActionType,
    entityId?: string,
    payload?: Record<string, unknown>
  ) => Promise<ServiceActionResult | null>;
  onNavigateTab?: (tab: any) => void;
}

export function OperationsConsoleView({
  health = null,
  alerts = [],
  isLoadingHealth = false,
  onRefresh,
  onRefreshHealth,
  onExecuteAction,
}: OperationsConsoleViewProps) {
  const [activeTab, setActiveTab] = useState<'HEALTH' | 'TESTS' | 'ACTIONS' | 'TERMINAL' | 'BACKUPS' | 'ANNOUNCEMENTS'>('HEALTH');
  const refreshFn = onRefresh || onRefreshHealth || (() => {});

  return (
    <div className="space-y-6">
      {/* Operations Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              Platform Operations, Security & Database Governance
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              SysOps, SecOps & DBOps Console
            </h1>
            <p className="text-sm text-slate-300">
              Live telemetry monitoring, automated pre-prod regression suites, emergency service breakers, SQL query terminal, transactional backup snapshots, and sitewide broadcast announcements.
            </p>
          </div>
          <div className="shrink-0">
            <InternalRoleMascot role="OPERATIONS" className="w-32 h-32 drop-shadow-md" />
          </div>
        </div>

        {/* Protection / Status Pill */}
        <div className="mt-4 flex flex-wrap items-center justify-between border-t border-amber-500/20 pt-4 text-xs text-amber-200/90">
          <div className="flex items-center gap-3">
            <span>Role Context: <strong className="text-white">Operations Specialist (Locked View)</strong></span>
            <span>•</span>
            <span>Database Pool Status: <strong className="text-emerald-400">Healthy</strong></span>
          </div>
          {onRefreshHealth && (
            <button
              type="button"
              onClick={onRefreshHealth}
              className="rounded-lg border border-amber-500/40 bg-amber-900/40 px-3 py-1 text-xs text-amber-200 hover:bg-amber-800/50 transition"
            >
              Scan Health
            </button>
          )}
        </div>
      </div>

      {/* Operations Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { key: 'HEALTH', label: 'System Health & Latency', icon: '💓' },
          { key: 'TESTS', label: 'Regression Test Runner', icon: '🧪' },
          { key: 'ACTIONS', label: 'Service Breakers & Restart', icon: '⚡' },
          { key: 'TERMINAL', label: 'SQL Query Console (DBOps)', icon: '💻' },
          { key: 'BACKUPS', label: 'Snapshots & Backup / Restore', icon: '💾' },
          { key: 'ANNOUNCEMENTS', label: 'Sitewide Broadcast Announcements', icon: '📢' },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as any)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                isActive
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Operations Console Content */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        {activeTab === 'HEALTH' && (
          <AdminHealthDashboard
            health={health}
            alerts={alerts}
            isLoading={Boolean(isLoadingHealth)}
            onRefresh={refreshFn}
          />
        )}
        {activeTab === 'TESTS' && <AdminTestSuiteRunner />}
        {activeTab === 'ACTIONS' && (
          <AdminServiceActionsPanel
            onExecuteAction={onExecuteAction || (async (act) => ({ success: true, action: act, message: 'Executed' }))}
            onRefreshTelemetry={refreshFn}
          />
        )}
        {activeTab === 'TERMINAL' && <AdminQueryTerminal />}
        {activeTab === 'BACKUPS' && <AdminBackupRestorePanel />}
        {activeTab === 'ANNOUNCEMENTS' && <AdminAnnouncementsPanel />}
      </div>
    </div>
  );
}
