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
  const [viewMode, setViewMode] = useState<'CARDS' | 'STREAM'>('CARDS');
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyJson = (log: any) => {
    if (!log?.payload) return;
    void navigator.clipboard.writeText(JSON.stringify(log.payload, null, 2));
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

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
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] w-full max-w-full">
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1">
          {/* View Mode Switcher */}
          <div className="flex rounded-xl border bg-muted/50 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 transition active:scale-98 ${
                viewMode === 'CARDS'
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>🃏</span> Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('STREAM')}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 transition active:scale-98 ${
                viewMode === 'STREAM'
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>📜</span> Stream
            </button>
          </div>

          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search event type, entity ID, correlation ID, payload..."
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0">
          {/* Active Operating Mode Scope Badge */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/60 border text-xs font-semibold text-muted-foreground min-h-[44px]">
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
            className="rounded-xl border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer min-h-[44px]"
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
            {isLoading ? 'Syncing…' : '🔄 Refresh'}
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={isClearing}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 active:scale-98 transition disabled:opacity-50 shadow-2xs"
            title={`Safely purge ${isProd ? 'Live Production' : 'Staging & Demo'} audit logs & notifications without affecting the other environment`}
          >
            {isClearing ? 'Clearing…' : `🗑️ Clear ${isProd ? 'Prod' : 'Demo'}`}
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && logs.length === 0 && (
        <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
          ⏳ Loading cryptographic audit trail events…
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredLogs.length === 0 && (
        <div className="rounded-2xl border bg-card p-12 text-center space-y-3">
          <span className="text-4xl">📜</span>
          <h3 className="text-base font-bold text-foreground">No Audit Logs Found</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {search || entityFilter !== 'ALL'
              ? 'No audit trail events match your current filter criteria.'
              : 'Audit events and state transitions will appear here in chronological order.'}
          </p>
        </div>
      )}

      {/* 1. MOBILE-FIRST RESPONSIVE CARDS VIEW */}
      {!isLoading && viewMode === 'CARDS' && filteredLogs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full max-w-full">
          {filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const hasPayload = log.payload && Object.keys(log.payload).length > 0;
            const isCopied = copiedId === log.id;

            return (
              <article
                key={log.id}
                className="rounded-2xl border bg-card p-4 shadow-2xs space-y-3.5 transition hover:shadow-md flex flex-col justify-between"
              >
                {/* Header */}
                <div className="space-y-2 border-b border-border/50 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-bold text-primary truncate max-w-[200px]">
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
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                        {formatLogDate(log)}
                      </div>
                    </div>

                    <span className="rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold flex items-center gap-1 shrink-0">
                      <span>🔒</span> SHA-256
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                    <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-semibold text-muted-foreground">
                      {log.entity_type}
                    </span>
                    {log.entity_id && (
                      <span className="font-mono text-[10px] text-foreground truncate max-w-[180px]" title={log.entity_id}>
                        ID: {log.entity_id}
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Details */}
                <div className="space-y-2 text-xs flex-1">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Actor:</span>
                      <span className="font-semibold text-foreground truncate block" title={log.actor_email || 'System'}>
                        {log.actor_email || 'System'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Tenant Org:</span>
                      <span className="font-semibold text-foreground truncate block" title={log.organization_name || 'Global'}>
                        {log.organization_name || 'Global Platform'}
                      </span>
                    </div>
                  </div>

                  {log.correlation_id && (
                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                      Trace: {log.correlation_id}
                    </div>
                  )}

                  {/* Expandable JSON Payload */}
                  {hasPayload && isExpanded && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="font-bold uppercase">Payload Inspector</span>
                        <button
                          type="button"
                          onClick={() => handleCopyJson(log)}
                          className="text-primary hover:underline font-bold"
                        >
                          {isCopied ? '✓ Copied!' : 'Copy JSON'}
                        </button>
                      </div>
                      <pre className="rounded-xl bg-muted/40 p-2.5 text-[10px] font-mono overflow-x-auto w-full max-w-full text-foreground border leading-relaxed max-h-[220px]">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Footer Actions: 44px+ touch targets */}
                <div className="pt-2 border-t border-border/50 grid grid-cols-2 gap-2">
                  {hasPayload ? (
                    <button
                      type="button"
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border bg-muted/40 hover:bg-muted text-foreground text-xs font-bold transition active:scale-98 mobile-touch-target"
                    >
                      <span>{isExpanded ? '▲ Hide JSON' : '▼ Inspect JSON'}</span>
                    </button>
                  ) : (
                    <div className="inline-flex min-h-[44px] items-center justify-center text-xs text-muted-foreground">
                      No Payload
                    </div>
                  )}

                  {hasPayload ? (
                    <button
                      type="button"
                      onClick={() => handleCopyJson(log)}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition active:scale-98 shadow-xs hover:bg-primary/90 mobile-touch-target"
                    >
                      <span>📋</span>
                      <span>{isCopied ? 'Copied' : 'Copy Payload'}</span>
                    </button>
                  ) : (
                    <div />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 2. TABULAR STREAM VIEW */}
      {!isLoading && viewMode === 'STREAM' && filteredLogs.length > 0 && (
        <div className="overflow-x-auto w-full max-w-full scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/20 rounded-xl border bg-card shadow-xs">
          <div className="divide-y text-xs min-w-[320px]">
            {filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const hasPayload = log.payload && Object.keys(log.payload).length > 0;

              return (
                <div key={log.id} className="p-3.5 hover:bg-muted/10 transition">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary font-mono min-w-[100px] text-center"
                        title={log.event_type}
                      >
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
                        <span
                          className="font-mono text-[11px] text-muted-foreground truncate max-w-[200px]"
                          title={log.entity_id}
                        >
                          ID: {log.entity_id}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-muted-foreground text-[11px] shrink-0">
                      <span className="truncate max-w-[160px]" title={log.actor_email || 'System'}>
                        {log.actor_email || 'System'}
                      </span>
                      <span>•</span>
                      <span className="font-mono">{formatLogDate(log)}</span>
                    </div>
                  </div>

                  {log.organization_name && (
                    <div className="mt-1.5 text-[11px] text-muted-foreground font-medium" title={log.organization_name}>
                      Tenant Org: <span className="text-foreground font-semibold">{log.organization_name}</span>
                    </div>
                  )}

                  {/* Expandable Payload */}
                  {hasPayload && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 min-h-[32px] mobile-touch-target"
                      >
                        <span>{isExpanded ? '▼ Hide' : '▶ Show'} Payload JSON</span>
                      </button>

                      {isExpanded && (
                        <pre className="mt-2 rounded-lg bg-muted/40 p-3 text-[10px] font-mono overflow-x-auto w-full max-w-full scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/20 text-foreground border leading-relaxed">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
