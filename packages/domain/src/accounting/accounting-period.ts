/**
 * Accounting Period Management (Phase 5D)
 * Defines accounting period status lifecycle (OPEN, CLOSED, LOCKED), period dates, and validation logic.
 */

export type AccountingPeriodStatus = 'OPEN' | 'CLOSED' | 'LOCKED';

export interface AccountingPeriod {
  id: string;
  organizationId: string;
  periodCode: string; // e.g. "FY2026-Q1", "2026-09", "FY2026-M09"
  periodName: string; // e.g. "September 2026 Accounting Period"
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  status: AccountingPeriodStatus;
  closedAt?: string | null;
  closedBy?: string | null;
  lockedAt?: string | null;
  lockedBy?: string | null;
  reopenedAt?: string | null;
  reopenedBy?: string | null;
  reopenReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Checks if a given transaction date (YYYY-MM-DD) falls within an accounting period.
 */
export function isDateWithinPeriod(dateStr: string, period: Pick<AccountingPeriod, 'startDate' | 'endDate'>): boolean {
  return dateStr >= period.startDate && dateStr <= period.endDate;
}

/**
 * Validates that an accounting period allows new journal postings.
 */
export function canPostToPeriod(period: Pick<AccountingPeriod, 'status'>): boolean {
  return period.status === 'OPEN';
}

/**
 * Generates standard monthly period code from date string (e.g. "2026-09-17" -> "2026-09").
 */
export function derivePeriodCodeFromDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length < 2) return 'DEFAULT-PERIOD';
  return `${parts[0]}-${parts[1]}`;
}
