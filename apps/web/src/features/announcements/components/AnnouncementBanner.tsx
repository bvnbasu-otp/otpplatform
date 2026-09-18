import { useAnnouncements } from '../hooks/useAnnouncements';
import { Badge } from '@/components/ui';

const SEVERITY_STYLES = {
  CRITICAL: 'bg-red-600 text-white border-red-700',
  HIGH: 'bg-rose-500 text-white border-rose-600',
  MEDIUM: 'bg-amber-500 text-slate-900 border-amber-600 font-medium',
  LOW: 'bg-blue-600 text-white border-blue-700',
  INFO: 'bg-slate-900 text-slate-100 border-slate-800 dark:bg-slate-800 dark:text-slate-100',
};

const SEVERITY_ICONS = {
  CRITICAL: '🚨',
  HIGH: '⚠️',
  MEDIUM: '📢',
  LOW: 'ℹ️',
  INFO: '⚡',
};

export function AnnouncementBanner() {
  const { announcements, dismissAnnouncement } = useAnnouncements();

  if (announcements.length === 0) return null;

  // Show highest priority announcement on top
  const active = announcements[0];

  return (
    <div
      role="banner"
      aria-label="Platform Announcement"
      className={`relative z-40 px-4 py-2.5 text-xs shadow-sm transition ${
        SEVERITY_STYLES[active.severity] || SEVERITY_STYLES.INFO
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="text-sm shrink-0" aria-hidden="true">
            {SEVERITY_ICONS[active.severity]}
          </span>
          <div className="flex flex-wrap items-center gap-1.5 truncate">
            <span className="font-bold">{active.title}:</span>
            <span className="opacity-95">{active.message}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {active.actionUrl && (
            <a
              href={active.actionUrl}
              className="rounded bg-white/20 px-2 py-0.5 text-[11px] font-bold text-inherit hover:bg-white/30 transition underline"
            >
              {active.actionLabel || 'Details →'}
            </a>
          )}

          {active.severity !== 'CRITICAL' && (
            <button
              type="button"
              onClick={() => dismissAnnouncement(active.id)}
              className="rounded p-1 text-inherit opacity-75 hover:opacity-100 transition"
              aria-label="Dismiss Announcement"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
