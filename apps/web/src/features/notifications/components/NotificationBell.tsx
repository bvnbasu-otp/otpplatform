import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import type { AppNotification } from '../types';

function formatRelativeTime(dateString: string): string {
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
}

function getNotificationIcon(actionType?: string) {
  switch (actionType) {
    case 'RFQ_INVITED':
      return '⚡';
    case 'QUOTE_RECEIVED':
      return '📝';
    case 'VOTE_REQUESTED':
    case 'VOTE_CAST':
      return '🗳️';
    case 'PO_ISSUED':
      return '⚡';
    case 'PO_ACCEPTED':
      return '✅';
    case 'WORK_PROGRESS_UPDATED':
      return '🔨';
    case 'INVOICE_SUBMITTED':
      return '🧾';
    default:
      return '🔔';
  }
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, toastNotification, dismissToast } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNREAD'>('ALL');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notif: AppNotification) => {
    if (notif.status !== 'READ') {
      await markAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const displayedNotifications =
    activeTab === 'UNREAD' ? notifications.filter((n) => n.status !== 'READ') : notifications;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-card text-foreground shadow-sm transition hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-primary/40"
        title="Notifications"
        aria-label="Notifications"
      >
        <span className="text-base">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-md animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Flyout Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-xs text-primary hover:underline font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-border/70 px-3 pt-2 gap-2 bg-muted/10 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`pb-2 px-2 font-medium border-b-2 transition ${
                activeTab === 'ALL'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('UNREAD')}
              className={`pb-2 px-2 font-medium border-b-2 transition ${
                activeTab === 'UNREAD'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notification List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border/40">
            {displayedNotifications.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                <span className="text-2xl block mb-2">🎉</span>
                No {activeTab === 'UNREAD' ? 'unread ' : ''}notifications yet
              </div>
            ) : (
              displayedNotifications.slice(0, 15).map((notif) => {
                const isUnread = notif.status !== 'READ';
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`flex items-start gap-3 p-3.5 cursor-pointer transition text-left ${
                      isUnread
                        ? 'bg-primary/5 hover:bg-primary/10'
                        : 'hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <span className="text-lg shrink-0 mt-0.5">{getNotificationIcon(notif.action_type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className={`text-xs truncate ${isUnread ? 'font-semibold text-foreground' : 'font-medium'}`}>
                          {notif.title || notif.event_type}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatRelativeTime(notif.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {notif.body || 'Tap to view details.'}
                      </p>
                      {notif.link && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-primary font-medium mt-1">
                          View details →
                        </span>
                      )}
                    </div>
                    {isUnread && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" title="Unread" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/70 p-2 text-center bg-muted/20">
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs text-primary font-semibold hover:underline py-1.5 block w-full transition"
            >
              View all notification history →
            </Link>
          </div>
        </div>
      )}

      {/* Real-time Floating Toast Alert Banner */}
      {toastNotification && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-primary/30 bg-card p-4 shadow-2xl backdrop-blur animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-start gap-3">
            <span className="text-2xl">{getNotificationIcon(toastNotification.action_type)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground mb-0.5">{toastNotification.title}</p>
              <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{toastNotification.body}</p>
              <div className="mt-2.5 flex items-center gap-2">
                {toastNotification.link && (
                  <button
                    type="button"
                    onClick={() => {
                      dismissToast();
                      if (toastNotification.link) navigate(toastNotification.link);
                    }}
                    className="rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition"
                  >
                    View Now →
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismissToast}
                  className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissToast}
              className="text-muted-foreground hover:text-foreground text-xs p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
