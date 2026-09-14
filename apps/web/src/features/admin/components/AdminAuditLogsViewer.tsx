import React, { useState, useEffect } from 'react';
import { fetchAdminAuditLogs, clearAuditLogsAndNotifications } from '../api/admin-ops';

function formatLogDate(log: any): string {
  const ts = log.occurred_at || log.created_at || log.timestamp;
  if (!ts) return 'Just now';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return 'Just now';
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Just now';
  }
}

interface AdminAuditLogsViewerProps {
  isPlatformInDemoMode?: boolean;
  onRefreshTelemetry?: () => void;
}

export function AdminAuditLogsViewer({ isPlatformInDemoMode, onRefreshTelemetry }: AdminAuditLogsViewerProps = {}) {
  const [logs, setLogs] = useState<any[]>([]);
  const [activeMode, setActiveMode] = useState<string>(
    typeof isPlatformInDemoMode === 'boolean'
      ? (isPlatformInDemoMode ? 'DEMO' : 'PROD')
      : 'DEMO'
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof isPlatformInDemoMode === 'boolean') {
      setActiveMode(isPlatformInDemoMode ? 'DEMO' : 'PROD');
    }
  }, [isPlatformInDemoMode]);

  const loadLogs = async () => {
    setIsLoading(true);
    const resolvedMode = typeof isPlatformInDemoMode === 'boolean'
      ? (isPlatformInDemoMode ? 'DEMO' : 'PROD')
      : 'AUTO';
    const res = await fetchAdminAuditLogs({
      entityType: entityFilter === 'ALL' ? undefined : entityFilter,
      mode: resolvedMode as any,
      limit: 100,
    });
    if (res.ok) {
      setLogs(res.logs || []);
      if (res.activeMode) {
        setActiveMode(res.activeMode);
      }
    }
    setIsLoading(false);
  };

  const isProd = activeMode === 'PROD';
  const modeTitle = isProd ? 'LIVE PRODUCTION MODE' : 'STAGING & DEMO MODE';

  const handleClear = async () => {
    const confirmationPrompt =
      `⚠️ Confirm Purge of Audit Logs for [${modeTitle}]?\n\n` +
      (isProd
        ? '• Environment Isolation: ONLY Live Production audit logs & notifications will be deleted.\n• Staging/Demo records will remain intact.\n• This action will be logged in the system audit trail.'
        : '• Environment Isolation: ONLY Staging & Demo mock logs & notifications will be deleted.\n• Live Production records will NOT be touched.\n• This action will be logged in the system audit trail.');

    if (!window.confirm(confirmationPrompt)) {
      return;
    }
    setIsClearing(true);
    try {
      const res = await clearAuditLogsAndNotifications(activeMode as any);
      if (!res.ok) {
        alert(`Failed to clear: ${res.error}`);
      }
      setLogs([]);
      await loadLogs();
      onRefreshTelemetry?.();
    } finally {
      setIsClearing(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, [entityFilter, isPlatformInDemoMode]);

  const filteredLogs = logs.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      log.event_type?.toLowerCase().includes(q) ||
      log.entity_id?.toLowerCase().includes(q) ||
      log.correlation_id?.toLowerCase().includes(q) ||
      log.organization_name?.toLowerCase().includes(q) ||
      log.actor_email?.toLowerCase().includes(q) ||
      JSON.stringify(log.payload || {}).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search event type, entity ID, correlation ID, JSON payload..."
            className="w-full rounded-xl border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0">
          {/* Active Operating Mode Scope Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/60 border text-xs font-semibold text-muted-foreground">
            <span>Scope:</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                isProd
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                  : 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30'
              }`}
            >
              {isProd ? '🟢 Live Production' : '🧪 Staging & Demo'}
            </span>
          </div>

          {/* Entity Type Filter */}
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="rounded-xl border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            <option value="ALL">All Entity Types</option>
            <option value="RFQ">RFQs &amp; Quotes</option>
            <option value="REQUIREMENT">Requirements</option>
            <option value="PURCHASE_ORDER">Purchase Orders</option>
            <option value="WORK_ORDER">Work Orders &amp; Milestones</option>
            <option value="SUPPLIER">Suppliers &amp; Verification</option>
            <option value="NOTIFICATION_DISPATCHER">Notification Dispatcher</option>
            <option value="PLATFORM_ENGINE">Platform Engine &amp; Service Actions</option>
          </select>

          <button
            type="button"
            onClick={loadLogs}
            disabled={isLoading}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border bg-background px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted active:scale-98 transition shadow-2xs"
          >
            {isLoading ? 'Syncing…' : '🔄 Refresh Logs'}
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={isClearing}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 active:scale-98 transition disabled:opacity-50 shadow-2xs"
            title={`Safely purge ${isProd ? 'Live Production' : 'Staging & Demo'} audit logs & notifications without affecting the other environment`}
          >
            {isClearing ? 'Clearing…' : `🗑️ Clear ${isProd ? 'Prod' : 'Demo'} Logs`}
          </button>
        </div>
      </div>

      {/* Audit Logs Stream */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <div className="divide-y text-xs">
          {isLoading && logs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              Loading cryptographic audit logs…
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground font-medium">
              No audit logs matching current query filter.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const hasPayload = log.payload && Object.keys(log.payload).length > 0;

              return (
                <div key={log.id} className="p-3 hover:bg-muted/10 transition">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary font-mono">
                        {log.event_type}
                      </span>
                      {log.is_demo ? (
                        <span className="rounded bg-purple-500/10 px-1.5 py-0.2 text-[9px] font-bold text-purple-700 dark:text-purple-300 border border-purple-500/30">
                          DEMO
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          PROD
                        </span>
                      )}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {log.entity_type}
                      </span>
                      {log.entity_id && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          ID: {log.entity_id.slice(0, 8)}…
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                      <span>{log.actor_email || 'System'}</span>
                      <span>•</span>
                      <span>{formatLogDate(log)}</span>
                    </div>
                  </div>

                  {log.organization_name && (
                    <div className="mt-1 text-[11px] text-muted-foreground font-medium">
                      Tenant Org: <span className="text-foreground">{log.organization_name}</span>
                    </div>
                  )}

                  {/* Expandable Payload */}
                  {hasPayload && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                      >
                        <span>{isExpanded ? '▼ Hide' : '▶ Show'} Payload</span>
                      </button>

                      {isExpanded && (
                        <pre className="mt-2 rounded-lg bg-muted/40 p-3 text-[10px] font-mono overflow-x-auto text-foreground border">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
