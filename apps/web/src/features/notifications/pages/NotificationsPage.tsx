import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { notificationService } from '../services/notificationService';
import type { AppNotification } from '../types';

function formatFullDateTime(dateString?: string | null): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function getNotificationBadge(actionType?: string, eventType?: string) {
  const code = (actionType || eventType || '').toUpperCase();

  if (code.includes('RFQ') || code.includes('QUOTE')) {
    return <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">⚡ RFQ &amp; Quotes</span>;
  }
  if (code.includes('VOTE') || code.includes('GOVERNANCE')) {
    return <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">🗳️ Governance &amp; Voting</span>;
  }
  if (code.includes('PO_') || code.includes('ORDER') || code.includes('WORK_ORDER')) {
    return <span className="rounded bg-teal-500/10 px-2 py-0.5 text-xs font-semibold text-teal-600 dark:text-teal-400">📦 Purchase Order</span>;
  }
  if (code.includes('INVOICE') || code.includes('PAYMENT') || code.includes('SETTLEMENT')) {
    return <span className="rounded bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">🧾 Invoice &amp; Payment</span>;
  }
  if (code.includes('PROACTIVE') || code.includes('ADMIN') || code.includes('MAINTENANCE')) {
    return <span className="rounded bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-400">🛡️ Fleet Ops Alert</span>;
  }
  return <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">🔔 System</span>;
}

interface NotificationsPageProps {
  isPlatformInDemoMode?: boolean;
  onRefreshTelemetry?: () => void;
}

export function NotificationsPage({ isPlatformInDemoMode, onRefreshTelemetry }: NotificationsPageProps = {}) {
  const [fleetView, setFleetView] = useState(true);
  const { notifications, unreadCount, activeMode, markAsRead, markAllAsRead, loading, refresh, isPlatformAdmin, profileId } = useNotifications({
    fleetView,
    isPlatformInDemoMode,
  });
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'RFQS' | 'VOTES' | 'ORDERS' | 'ALERTS'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const navigate = useNavigate();

  const isProd = activeMode === 'PROD';
  const modeTitle = isProd ? 'LIVE PRODUCTION MODE' : 'STAGING & DEMO MODE';

  const handleClearNotifications = async () => {
    const confirmationPrompt =
      `⚠️ Confirm Clear All Notifications for [${modeTitle}]?\n\n` +
      (isProd
        ? '• Environment Isolation: ONLY Live Production notifications will be deleted.\n• Staging & Demo records will NOT be affected.\n• This action will be logged in the system audit trail.'
        : '• Environment Isolation: ONLY Staging & Demo mock notifications will be deleted.\n• Live Production records will NOT be touched.\n• This action will be logged in the system audit trail.');

    if (!window.confirm(confirmationPrompt)) {
      return;
    }
    setIsClearing(true);
    try {
      const res = await notificationService.clearAllNotifications(
        fleetView ? null : profileId,
        fleetView,
        activeMode as any
      );
      if (!res.ok) {
        alert(`Failed to clear: ${res.error}`);
      }
      await refresh();
      onRefreshTelemetry?.();
    } finally {
      setIsClearing(false);
    }
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      // Tab filter
      if (filter === 'UNREAD' && notif.status === 'READ') return false;
      if (filter === 'RFQS') {
        const isRfq = (notif.action_type || '').includes('RFQ') || (notif.action_type || '').includes('QUOTE') || (notif.event_type || '').startsWith('rfq.');
        if (!isRfq) return false;
      }
      if (filter === 'VOTES') {
        const isVote = (notif.action_type || '').includes('VOTE') || (notif.event_type || '').startsWith('governance.');
        if (!isVote) return false;
      }
      if (filter === 'ORDERS') {
        const isOrder = ['PO_ISSUED', 'PO_ACCEPTED', 'WORK_PROGRESS_UPDATED', 'INVOICE_SUBMITTED', 'PAYMENT_RECORDED'].includes(notif.action_type || '') ||
          (notif.event_type || '').startsWith('po.') || (notif.event_type || '').startsWith('work_order.') || (notif.event_type || '').startsWith('invoice.') || (notif.event_type || '').startsWith('payment.');
        if (!isOrder) return false;
      }
      if (filter === 'ALERTS') {
        const isAlert = notif.action_type === 'PROACTIVE_MAINTENANCE' || (notif.event_type || '').startsWith('admin.');
        if (!isAlert) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesTitle = (notif.title || '').toLowerCase().includes(q);
        const matchesBody = (notif.body || '').toLowerCase().includes(q);
        const matchesRecipient = (notif.recipient_name || '').toLowerCase().includes(q) || (notif.recipient_email || '').toLowerCase().includes(q);
        const matchesLink = (notif.link || '').toLowerCase().includes(q);
        const matchesEvent = (notif.event_type || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesBody && !matchesRecipient && !matchesLink && !matchesEvent) {
          return false;
        }
      }

      return true;
    });
  }, [notifications, filter, searchTerm]);

  const handleRowClick = async (notif: AppNotification) => {
    if (notif.status !== 'READ') {
      void markAsRead(notif.id);
    }
    if (notif.link) {
      navigate(notif.link);
    }
  };

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full">
      {/* Header - Compact Single Row */}
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-1.5 shadow-2xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-xs font-bold tracking-tight text-foreground flex items-center gap-1.5 truncate">
            <span>🔔</span>
            <span>Notifications &amp; Activity Feed</span>
          </h1>
          {isPlatformAdmin && (
            <span className="rounded-full bg-purple-600/10 border border-purple-600/20 px-2 py-0.2 text-[9px] font-bold text-purple-700 dark:text-purple-300 shrink-0">
              Admin Mode
            </span>
          )}
          <span
            className={`rounded-full border px-2 py-0.2 text-[9px] font-bold shrink-0 ${
              isProd
                ? 'bg-emerald-600/10 border-emerald-600/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-purple-600/10 border-purple-600/20 text-purple-700 dark:text-purple-300'
            }`}
          >
            {isProd ? '🟢 Prod' : '🧪 Demo'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || isClearing}
            className="rounded border bg-card px-2 py-0.5 text-[11px] font-semibold hover:bg-muted text-foreground transition shadow-2xs"
            title="Refresh Feed"
          >
            ↻ {loading ? '…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => void handleClearNotifications()}
            disabled={loading || isClearing}
            className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 transition shadow-2xs disabled:opacity-50"
            title={`Clear ${isProd ? 'Live Production' : 'Staging & Demo'} notifications`}
          >
            🗑️ {isClearing ? '…' : `Clear ${isProd ? 'Prod' : 'Demo'}`}
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={async () => {
                await markAllAsRead();
              }}
              disabled={loading || isClearing}
              className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition shadow-2xs disabled:opacity-50"
            >
              ✓ Mark ({unreadCount}) Read
            </button>
          )}
        </div>
      </div>

      {/* Admin Scope Toggle (if Platform Admin) */}
      {isPlatformAdmin && (
        <div className="mt-1 shrink-0 rounded border border-purple-500/20 bg-purple-50/50 dark:bg-purple-950/20 px-2.5 py-1 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">🌐</span>
            <span className="font-bold text-foreground text-[11px]">Scope:</span>
            <span className="text-[11px] text-muted-foreground">
              Toggle between platform-wide fleet activity and personal feed.
            </span>
          </div>
          <div className="flex items-center rounded border bg-background p-0.5 shadow-2xs text-[11px]">
            <button
              type="button"
              onClick={() => setFleetView(true)}
              className={`rounded px-2 py-0.2 font-bold transition ${
                fleetView ? 'bg-purple-600 text-white shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Fleet ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFleetView(false)}
              className={`rounded px-2 py-0.2 font-bold transition ${
                !fleetView ? 'bg-purple-600 text-white shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Direct Alerts
            </button>
          </div>
        </div>
      )}

      {/* Controls Bar: Filters & Search */}
      <div className="mt-1.5 shrink-0 flex flex-wrap items-center justify-between gap-1.5 rounded-lg border bg-card p-1.5 shadow-2xs">
        <div className="flex flex-wrap gap-1 text-[11px]">
          {[
            { id: 'ALL', label: `All (${notifications.length})` },
            { id: 'UNREAD', label: `Unread (${unreadCount})` },
            { id: 'RFQS', label: 'RFQs' },
            { id: 'VOTES', label: 'Voting' },
            { id: 'ORDERS', label: 'Orders' },
            { id: 'ALERTS', label: 'Alerts' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as any)}
              className={`rounded px-2 py-0.5 font-semibold transition ${
                filter === tab.id
                  ? 'bg-primary text-primary-foreground shadow-2xs font-bold'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-56">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search feed…"
            className="w-full rounded border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground shadow-2xs"
          />
        </div>
      </div>

      {/* Notifications List - Internal Scroll Pane */}
      <div className="zero-scroll-pane mt-2 rounded-lg border bg-card shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            <span className="inline-block animate-spin mr-2">↻</span> Loading activity feed…
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">No notifications match this filter.</p>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="mt-1 text-[11px] text-primary font-bold hover:underline"
              >
                Clear search query
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filteredNotifications.map((notif) => {
              const isUnread = notif.status !== 'READ';
              return (
                <div
                  key={notif.id}
                  onClick={() => void handleRowClick(notif)}
                  className={`flex items-start gap-2.5 p-2.5 text-xs cursor-pointer transition ${
                    isUnread
                      ? 'bg-primary/5 hover:bg-primary/10'
                      : 'hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{getNotificationBadge(notif.action_type, notif.event_type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-1 mb-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className={`text-xs ${isUnread ? 'font-bold text-foreground' : 'font-medium text-foreground/90'}`}>
                          {notif.title || notif.event_type}
                        </h4>
                        {notif.is_demo ? (
                          <span className="rounded bg-purple-500/10 px-1 py-0.2 text-[8px] font-bold text-purple-700 dark:text-purple-300 border border-purple-500/30">
                            DEMO
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-500/10 px-1 py-0.2 text-[8px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            PROD
                          </span>
                        )}
                        {(notif.recipient_name || notif.recipient_email) && (
                          <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground">
                            To: {notif.recipient_name || notif.recipient_email}
                          </span>
                        )}
                        <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                          isUnread ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300' : 'bg-muted text-muted-foreground border border-border'
                        }`}>
                          {notif.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatFullDateTime(notif.created_at)}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {notif.body || 'No description provided.'}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {notif.link && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline">
                          Open workflow ({notif.link}) →
                        </span>
                      )}
                      {notif.channel && (
                        <span className="text-[10px] text-muted-foreground">
                          Channel: <span className="font-mono">{notif.channel}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                    {isUnread && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void markAsRead(notif.id);
                          }}
                          className="rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition shadow-2xs"
                          title="Mark as read"
                        >
                          ✓ Read
                        </button>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

