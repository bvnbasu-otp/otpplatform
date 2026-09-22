import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { notificationService } from '../services/notificationService';
import type { AppNotification } from '../types';
import { fetchAuditEvents } from '@/features/audit/api/fetch-audit-events';
import { AuditTimeline } from '@/features/audit/components/AuditTimeline';
import type { AuditEvent } from '@/features/audit/types/audit';

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

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function getNotificationVisuals(actionType?: string, eventType?: string) {
  const code = (actionType || eventType || '').toUpperCase();

  if (code.includes('QUOTE') || code.includes('RFQ')) {
    return {
      icon: '🟢',
      badge: 'Quote Submitted / RFQ',
      badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
      actionLabel: 'Review Quotation →',
    };
  }
  if (code.includes('VOTE') || code.includes('GOVERNANCE')) {
    return {
      icon: '🗳️',
      badge: 'Vote Requested',
      badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
      actionLabel: 'Cast Committee Vote →',
    };
  }
  if (code.includes('AWARD') || code.includes('REVEAL')) {
    return {
      icon: '🏆',
      badge: 'Contract Awarded',
      badgeClass: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
      actionLabel: 'View Award Decision →',
    };
  }
  if (code.includes('PO_') || code.includes('ORDER') || code.includes('WORK_PROGRESS') || code.includes('MILESTONE') || code.includes('WORK_ORDER')) {
    return {
      icon: '🚚',
      badge: 'Milestone / PO Update',
      badgeClass: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20',
      actionLabel: 'Track Purchase Order →',
    };
  }
  if (code.includes('INVOICE') || code.includes('PAYMENT') || code.includes('SETTLEMENT')) {
    return {
      icon: '🧾',
      badge: 'Invoice & Settlement',
      badgeClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
      actionLabel: 'View Settlement →',
    };
  }
  if (code.includes('PROACTIVE') || code.includes('ADMIN') || code.includes('MAINTENANCE')) {
    return {
      icon: '🛡️',
      badge: 'Fleet Ops Alert',
      badgeClass: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
      actionLabel: 'View Ops Console →',
    };
  }
  return {
    icon: '🔔',
    badge: 'System Notification',
    badgeClass: 'bg-muted text-muted-foreground border-border',
    actionLabel: 'View Details →',
  };
}

interface NotificationsPageProps {
  initialTab?: 'notifications' | 'audit';
  rfqId?: string;
  isPlatformInDemoMode?: boolean;
  onRefreshTelemetry?: () => void;
}

export function NotificationsPage({
  initialTab = 'notifications',
  rfqId,
  isPlatformInDemoMode,
  onRefreshTelemetry,
}: NotificationsPageProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [activeMainTab, setActiveMainTab] = useState<'notifications' | 'audit'>(
    urlTab === 'audit' || initialTab === 'audit' ? 'audit' : 'notifications'
  );

  const [fleetView, setFleetView] = useState(true);
  const {
    notifications,
    unreadCount,
    activeMode,
    markAsRead,
    markAllAsRead,
    loading: notificationsLoading,
    refresh: refreshNotifications,
    isPlatformAdmin,
    profileId,
  } = useNotifications({
    fleetView,
    isPlatformInDemoMode,
  });

  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'QUOTES' | 'VOTES' | 'ORDERS' | 'ALERTS'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const navigate = useNavigate();

  // Audit Events state
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const isProd = activeMode === 'PROD';
  const modeTitle = isProd ? 'LIVE PRODUCTION MODE' : 'STAGING & DEMO MODE';

  // Sync tab with URL
  useEffect(() => {
    if (urlTab === 'audit' && activeMainTab !== 'audit') {
      setActiveMainTab('audit');
    } else if (urlTab === 'notifications' && activeMainTab !== 'notifications') {
      setActiveMainTab('notifications');
    }
  }, [urlTab, activeMainTab]);

  const handleTabChange = (tab: 'notifications' | 'audit') => {
    setActiveMainTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  // Load audit events when switching to audit tab or on mount
  const loadAuditEvents = async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await fetchAuditEvents({ rfqId, limit: 100 });
      if (res.ok) {
        setAuditEvents(res.events);
      } else {
        setAuditError(res.error);
        setAuditEvents([]);
      }
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Failed to fetch audit events');
      setAuditEvents([]);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (activeMainTab === 'audit') {
      void loadAuditEvents();
    }
  }, [activeMainTab, rfqId]);

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
      await refreshNotifications();
      onRefreshTelemetry?.();
    } finally {
      setIsClearing(false);
    }
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      // Tab filter
      if (filter === 'UNREAD' && notif.status === 'READ') return false;
      if (filter === 'QUOTES') {
        const isQuote =
          (notif.action_type || '').includes('RFQ') ||
          (notif.action_type || '').includes('QUOTE') ||
          (notif.event_type || '').startsWith('rfq.') ||
          (notif.event_type || '').startsWith('quote.');
        if (!isQuote) return false;
      }
      if (filter === 'VOTES') {
        const isVote =
          (notif.action_type || '').includes('VOTE') ||
          (notif.event_type || '').startsWith('governance.');
        if (!isVote) return false;
      }
      if (filter === 'ORDERS') {
        const isOrder =
          ['PO_ISSUED', 'PO_ACCEPTED', 'WORK_PROGRESS_UPDATED', 'INVOICE_SUBMITTED', 'PAYMENT_RECORDED'].includes(
            notif.action_type || ''
          ) ||
          (notif.event_type || '').startsWith('po.') ||
          (notif.event_type || '').startsWith('work_order.') ||
          (notif.event_type || '').startsWith('invoice.') ||
          (notif.event_type || '').startsWith('payment.');
        if (!isOrder) return false;
      }
      if (filter === 'ALERTS') {
        const isAlert =
          notif.action_type === 'PROACTIVE_MAINTENANCE' ||
          notif.action_type === 'SYSTEM_ALERT' ||
          (notif.event_type || '').startsWith('admin.');
        if (!isAlert) return false;
      }

      // Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesTitle = (notif.title || '').toLowerCase().includes(q);
        const matchesBody = (notif.body || '').toLowerCase().includes(q);
        const matchesRecipient =
          (notif.recipient_name || '').toLowerCase().includes(q) ||
          (notif.recipient_email || '').toLowerCase().includes(q);
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
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-3 space-y-3 overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* 1. Header & Segmented Control Switcher */}
      <header className="rounded-2xl border border-border bg-card p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/dashboard"
              className="flex items-center justify-center h-8 w-8 rounded-xl border border-border/70 bg-muted/40 hover:bg-muted text-foreground transition text-xs shrink-0"
              title="Return to Dashboard"
            >
              ←
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold text-foreground flex items-center gap-1.5 truncate">
                <span>{activeMainTab === 'notifications' ? '🔔' : '🛡️'}</span>
                <span>{activeMainTab === 'notifications' ? 'Activity & Notifications' : 'Audit Trail & Proofs'}</span>
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                {activeMainTab === 'notifications'
                  ? 'Real-time pipeline changes, RFQ quotes, votes & milestones'
                  : 'Append-only cryptographic ledger of verified state transitions'}
              </p>
            </div>
          </div>

          {/* Environment & Admin Badges */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isPlatformAdmin && (
              <span className="rounded-full bg-purple-600/10 border border-purple-600/20 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                Admin
              </span>
            )}
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                isProd
                  ? 'bg-emerald-600/10 border-emerald-600/20 text-emerald-700 dark:text-emerald-300'
                  : 'bg-purple-600/10 border-purple-600/20 text-purple-700 dark:text-purple-300'
              }`}
            >
              {isProd ? '🟢 Prod' : '🧪 Demo'}
            </span>
          </div>
        </div>

        {/* Segmented Control / Tab Pills (PhonePe / Swiggy style) */}
        <div
          role="tablist"
          aria-label="Activity Feed Mode"
          className="flex items-center gap-1.5 rounded-xl bg-muted/60 p-1 border border-border/80 overflow-x-auto scrollbar-thin scroll-smooth no-print min-w-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeMainTab === 'notifications'}
            onClick={() => handleTabChange('notifications')}
            className={`flex-1 shrink-0 whitespace-nowrap min-w-0 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all min-h-[44px] mobile-touch-target ${
              activeMainTab === 'notifications'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>🔔 Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold px-1.5 py-0.2">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeMainTab === 'audit'}
            onClick={() => handleTabChange('audit')}
            className={`flex-1 shrink-0 whitespace-nowrap min-w-0 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all min-h-[44px] mobile-touch-target ${
              activeMainTab === 'audit'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>🛡️ Audit Trail</span>
            {auditEvents.length > 0 && (
              <span className="rounded-full bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-bold px-1.5 py-0.2 border border-emerald-500/30">
                {auditEvents.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 2. TAB CONTENT 1: NOTIFICATIONS FEED */}
      {activeMainTab === 'notifications' && (
        <div className="space-y-3">
          {/* Admin Scope Toggle (if Platform Admin) */}
          {isPlatformAdmin && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-base">🌐</span>
                <div>
                  <span className="font-bold text-foreground text-xs">Scope: </span>
                  <span className="text-[11px] text-muted-foreground">
                    Switch between platform-wide fleet activity and personal feed.
                  </span>
                </div>
              </div>
              <div className="flex items-center rounded-lg border bg-background p-0.5 shadow-2xs text-xs">
                <button
                  type="button"
                  onClick={() => setFleetView(true)}
                  className={`rounded-md px-2.5 py-1 font-bold transition ${
                    fleetView ? 'bg-purple-600 text-white shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All Fleet ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFleetView(false)}
                  className={`rounded-md px-2.5 py-1 font-bold transition ${
                    !fleetView ? 'bg-purple-600 text-white shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Direct Alerts
                </button>
              </div>
            </div>
          )}

          {/* Action Toolbar: Refresh, Clear, Mark All Read */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-2.5 shadow-xs">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by RFQ, PO, supplier, action…"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground shadow-2xs focus:border-primary focus:outline-hidden min-h-[44px]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs p-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => void refreshNotifications()}
                disabled={notificationsLoading || isClearing}
                className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-semibold hover:bg-muted text-foreground transition shadow-2xs min-h-[44px] mobile-touch-target flex items-center gap-1"
                title="Refresh Feed"
              >
                <span>↻</span>
                <span className="hidden sm:inline">{notificationsLoading ? 'Refreshing…' : 'Refresh'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleClearNotifications()}
                disabled={notificationsLoading || isClearing}
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 transition shadow-2xs disabled:opacity-50 min-h-[44px] mobile-touch-target flex items-center gap-1"
                title={`Clear ${isProd ? 'Live Production' : 'Staging & Demo'} notifications`}
              >
                <span>🗑️</span>
                <span className="hidden sm:inline">{isClearing ? 'Clearing…' : `Clear ${isProd ? 'Prod' : 'Demo'}`}</span>
              </button>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    await markAllAsRead();
                  }}
                  disabled={notificationsLoading || isClearing}
                  className="rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition shadow-2xs disabled:opacity-50 min-h-[44px] mobile-touch-target flex items-center gap-1"
                >
                  <span>✓</span>
                  <span>Mark ({unreadCount}) Read</span>
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills (Horizontal Scroll with Guaranteed No-Shrink) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/20 text-xs w-full max-w-full">
            {[
              { id: 'ALL', label: `All (${notifications.length})`, icon: '📋' },
              { id: 'UNREAD', label: `Unread (${unreadCount})`, icon: '🔔' },
              { id: 'QUOTES', label: 'Quotes & RFQs', icon: '🟢' },
              { id: 'VOTES', label: 'Voting & Governance', icon: '🗳️' },
              { id: 'ORDERS', label: 'Orders & Milestones', icon: '🚚' },
              { id: 'ALERTS', label: 'Ops Alerts', icon: '🛡️' },
            ].map((tab) => {
              const isSelected = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id as any)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 font-bold transition min-h-[44px] shrink-0 border shadow-2xs active:scale-98 mobile-touch-target cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span className="text-sm shrink-0">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Notifications List */}
          <div className="space-y-2.5">
            {notificationsLoading ? (
              <div className="rounded-2xl border border-border bg-card p-12 text-center text-xs text-muted-foreground shadow-xs">
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2 align-middle" />
                <span>Loading activity feed…</span>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-12 text-center text-xs text-muted-foreground shadow-xs space-y-2">
                <span className="text-3xl block">🎉</span>
                <p className="font-bold text-foreground text-sm">No Notifications Found</p>
                <p className="text-[11px] max-w-xs mx-auto">
                  {searchTerm
                    ? 'No notifications match your current search terms.'
                    : 'You are all caught up! New quotes, votes, and order milestones will appear here.'}
                </p>
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="mt-2 text-xs text-primary font-bold hover:underline"
                  >
                    Clear search query
                  </button>
                )}
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isUnread = notif.status !== 'READ';
                const visuals = getNotificationVisuals(notif.action_type, notif.event_type);

                return (
                  <article
                    key={notif.id}
                    onClick={() => void handleRowClick(notif)}
                    className={`group relative rounded-2xl border transition-all p-3.5 sm:p-4 cursor-pointer shadow-xs ${
                      isUnread
                        ? 'border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60'
                        : 'border-border/70 bg-card hover:border-border hover:bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Status Icon */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card border border-border/80 text-lg shadow-2xs group-hover:scale-105 transition-transform">
                        <span>{visuals.icon}</span>
                      </div>

                      {/* Card Body */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Title & Badges Row */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <span
                              className={`rounded-full border px-2 py-0.2 text-[9px] font-bold ${visuals.badgeClass}`}
                            >
                              {visuals.badge}
                            </span>

                            {notif.is_demo ? (
                              <span className="rounded-full bg-purple-500/10 px-1.5 py-0.2 text-[9px] font-bold text-purple-700 dark:text-purple-300 border border-purple-500/30">
                                DEMO
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                PROD
                              </span>
                            )}

                            {isUnread && (
                              <span className="rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 px-2 py-0.2 text-[9px] font-extrabold flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                NEW
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
                            <span>{formatRelativeTime(notif.created_at)}</span>
                            <span className="hidden sm:inline">·</span>
                            <span className="hidden sm:inline">{formatFullDateTime(notif.created_at)}</span>
                          </div>
                        </div>

                        {/* Heading */}
                        <h3
                          className={`text-xs sm:text-sm ${
                            isUnread ? 'font-extrabold text-foreground' : 'font-semibold text-foreground/90'
                          }`}
                        >
                          {notif.title || notif.event_type}
                        </h3>

                        {/* Description Text */}
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {notif.body || 'No details provided.'}
                        </p>

                        {/* Bottom Metadata & Deep Link CTA */}
                        <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border/40">
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                            {(notif.recipient_name || notif.recipient_email) && (
                              <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                                To: {notif.recipient_name || notif.recipient_email}
                              </span>
                            )}
                            {notif.channel && (
                              <span className="font-mono">
                                Channel: {notif.channel}
                              </span>
                            )}
                          </div>

                          {/* 1-Tap Deep Link Button */}
                          <div className="flex items-center gap-2">
                            {notif.link && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/20 transition min-h-[32px]">
                                {visuals.actionLabel}
                              </span>
                            )}

                            {isUnread && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void markAsRead(notif.id);
                                }}
                                className="rounded-lg border border-border bg-card px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[32px]"
                                title="Mark this notification as read"
                              >
                                ✓ Read
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 3. TAB CONTENT 2: AUDIT TRAIL */}
      {activeMainTab === 'audit' && (
        <section className="rounded-2xl border border-border bg-card p-3.5 sm:p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <span>🛡️</span> Cryptographic Audit Ledger
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Full chronological ledger with SHA-256 state seal verification.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadAuditEvents()}
              disabled={auditLoading}
              className="rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition shadow-2xs min-h-[44px] mobile-touch-target flex items-center gap-1.5"
            >
              <span>↻</span>
              <span>{auditLoading ? 'Verifying…' : 'Refresh Ledger'}</span>
            </button>
          </div>

          <AuditTimeline events={auditEvents} isLoading={auditLoading} error={auditError} />
        </section>
      )}
    </div>
  );
}
