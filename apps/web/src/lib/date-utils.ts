/**
 * Date and time formatting utilities in Indian Standard Time (IST - Asia/Kolkata).
 *
 * Canonical customer-visible formats:
 *   date      → "DD MMM YYYY"            e.g. "05 Sep 2026"
 *   date-time → "DD MMM YYYY, HH:mm IST" e.g. "05 Sep 2026, 14:30 IST"
 *
 * Month names come from a fixed table rather than the runtime locale: ICU builds
 * disagree on "Sep" vs "Sept" for en-IN, and receipts must read identically on
 * every device.
 */

const IST_TIME_ZONE = 'Asia/Kolkata';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const istPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

interface IstParts {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return isNaN(d.getTime()) ? null : d;
}

function istParts(d: Date): IstParts {
  const parts: Record<string, string> = {};
  for (const p of istPartsFormatter.formatToParts(d)) parts[p.type] = p.value;
  const monthIdx = Number(parts.month) - 1;
  const hour = Number(parts.hour) % 24;
  return {
    day: String(Number(parts.day)).padStart(2, '0'),
    month: MONTHS[monthIdx] ?? '',
    year: parts.year ?? '',
    hour: String(hour).padStart(2, '0'),
    minute: String(Number(parts.minute)).padStart(2, '0'),
  };
}

/** "DD MMM YYYY" in IST, or '' for empty/invalid input. */
export function formatDateIST(dateStr: string | Date | null | undefined): string {
  const d = toDate(dateStr);
  if (!d) return '';
  const p = istParts(d);
  return `${p.day} ${p.month} ${p.year}`;
}

/** "DD MMM YYYY, HH:mm IST", or '' for empty/invalid input. */
export function formatDateTimeIST(dateStr: string | Date | null | undefined): string {
  const d = toDate(dateStr);
  if (!d) return '';
  const p = istParts(d);
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} IST`;
}

/** "HH:mm IST", or '' for empty/invalid input. */
export function formatTimeIST(dateStr: string | Date | null | undefined): string {
  const d = toDate(dateStr);
  if (!d) return '';
  const p = istParts(d);
  return `${p.hour}:${p.minute} IST`;
}

export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  const res = formatDateIST(dateStr);
  return res || '—';
}

export function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  const res = formatDateTimeIST(dateStr);
  return res || '—';
}

export function formatRelativeTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  const res = formatDeadlineCountdown(dateStr);
  if (res.label === 'No deadline set') return '—';
  return res.label;
}

/**
 * Returns a human-friendly countdown string for deadlines (e.g. "4h 30m left", "2d left", "Expired").
 */
export function formatDeadlineCountdown(dateStr: string | Date | null | undefined): {
  label: string;
  isUrgent: boolean;
  isPassed: boolean;
} {
  if (!dateStr) return { label: 'No deadline set', isUrgent: false, isPassed: false };
  const target = typeof dateStr === 'string' ? new Date(dateStr).getTime() : dateStr.getTime();
  if (isNaN(target)) return { label: 'No deadline set', isUrgent: false, isPassed: false };

  const diffMs = target - Date.now();
  if (diffMs <= 0) {
    return { label: 'Deadline passed', isUrgent: false, isPassed: true };
  }

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 2) {
    return { label: `${diffDays} days left`, isUrgent: false, isPassed: false };
  }
  if (diffDays >= 1) {
    const remHours = diffHours % 24;
    return {
      label: remHours > 0 ? `${diffDays}d ${remHours}h left` : `${diffDays}d left`,
      isUrgent: diffDays < 2,
      isPassed: false,
    };
  }
  if (diffHours >= 1) {
    const remMin = diffMin % 60;
    return {
      label: remMin > 0 ? `${diffHours}h ${remMin}m left` : `${diffHours}h left`,
      isUrgent: true,
      isPassed: false,
    };
  }
  return {
    label: `${Math.max(1, diffMin)}m left`,
    isUrgent: true,
    isPassed: false,
  };
}
