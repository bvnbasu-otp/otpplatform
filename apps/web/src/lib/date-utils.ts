/**
 * Date and time formatting utilities in Indian Standard Time (IST - Asia/Kolkata).
 */

export function formatDateIST(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTimeIST(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }) +
    ', ' +
    d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) +
    ' IST'
  );
}

export function formatTimeIST(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return '';
  return (
    d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' IST'
  );
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
