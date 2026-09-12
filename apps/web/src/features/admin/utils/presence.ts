export type UserPresenceStatus = 'ONLINE' | 'RECENTLY_ACTIVE' | 'OFFLINE';

export interface PresenceBadgeConfig {
  status: UserPresenceStatus;
  label: string;
  dotColor: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  icon: string;
}

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes (Online)
const RECENT_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes (Recently Active)

/**
 * Calculates dynamic presence status based on last_seen_at timestamp.
 * - < 2 mins -> ONLINE (🟢)
 * - 2 mins <= diff <= 30 mins -> RECENTLY_ACTIVE (🟡)
 * - > 30 mins or null -> OFFLINE (⚪)
 */
export function getUserOnlineStatus(
  lastSeenAt: string | null | undefined,
  nowMs: number = Date.now()
): UserPresenceStatus {
  if (!lastSeenAt) return 'OFFLINE';

  const lastSeenMs = new Date(lastSeenAt).getTime();
  if (isNaN(lastSeenMs)) return 'OFFLINE';

  const diffMs = nowMs - lastSeenMs;

  // Handle future clock skew gracefully
  if (diffMs < 0) return 'ONLINE';

  if (diffMs < ONLINE_THRESHOLD_MS) {
    return 'ONLINE';
  }

  if (diffMs <= RECENT_THRESHOLD_MS) {
    return 'RECENTLY_ACTIVE';
  }

  return 'OFFLINE';
}

/**
 * Returns UI badge styling and metadata for a given presence status.
 */
export function getPresenceBadgeConfig(status: UserPresenceStatus): PresenceBadgeConfig {
  switch (status) {
    case 'ONLINE':
      return {
        status: 'ONLINE',
        label: 'Online',
        dotColor: 'bg-emerald-500 shadow-emerald-500/50 animate-pulse',
        badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60',
        badgeText: 'text-emerald-700 dark:text-emerald-300',
        badgeBorder: 'border-emerald-200 dark:border-emerald-800',
        icon: '🟢',
      };
    case 'RECENTLY_ACTIVE':
      return {
        status: 'RECENTLY_ACTIVE',
        label: 'Recently Active',
        dotColor: 'bg-amber-500 shadow-amber-500/40',
        badgeBg: 'bg-amber-50 dark:bg-amber-950/60',
        badgeText: 'text-amber-700 dark:text-amber-300',
        badgeBorder: 'border-amber-200 dark:border-amber-800',
        icon: '🟡',
      };
    case 'OFFLINE':
    default:
      return {
        status: 'OFFLINE',
        label: 'Offline',
        dotColor: 'bg-slate-400 dark:bg-slate-500',
        badgeBg: 'bg-slate-100 dark:bg-slate-900/60',
        badgeText: 'text-slate-600 dark:text-slate-400',
        badgeBorder: 'border-slate-200 dark:border-slate-800',
        icon: '⚪',
      };
  }
}

/**
 * Formats relative time distance (e.g., "Online now", "Active 12m ago", "Active 3h ago", "Active 2d ago").
 */
export function formatLastSeenRelative(
  lastSeenAt: string | null | undefined,
  nowMs: number = Date.now()
): string {
  if (!lastSeenAt) return 'Offline';

  const lastSeenMs = new Date(lastSeenAt).getTime();
  if (isNaN(lastSeenMs)) return 'Offline';

  const diffMs = nowMs - lastSeenMs;
  if (diffMs < 0) return 'Online now';

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 2) {
    return 'Online now';
  }
  if (diffMin < 60) {
    return `Active ${diffMin}m ago`;
  }
  if (diffHours < 24) {
    return `Active ${diffHours}h ago`;
  }
  if (diffDays < 30) {
    return `Active ${diffDays}d ago`;
  }

  return new Date(lastSeenAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats full timestamp for tooltips.
 */
export function formatLastSeenAbsolute(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return 'No recorded activity';

  const date = new Date(lastSeenAt);
  if (isNaN(date.getTime())) return 'Invalid timestamp';

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
