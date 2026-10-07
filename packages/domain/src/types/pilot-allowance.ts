import {
  PILOT_COMMERCIAL_MODE_POLICY,
  STANDARD_MONTHLY_RFQ_ALLOWANCE,
  evaluateRfqEntitlement,
  getCalendarMonthWindow,
  getCalendarQuarterWindow,
  type BillingCycle,
  type CalendarMonthWindow,
  type SubscriptionTierId,
} from './pricing-entitlement';

/**
 * Pilot-mode monthly RFQ allowance.
 *
 * Display and the publish gate both read this evaluation, so the number a buyer
 * sees is the number that decides whether they can publish. A stored YEARLY
 * plan adds the quarterly bonus. There is no client-plan argument.
 */
export const PILOT_MONTHLY_RFQ_ALLOWANCE = STANDARD_MONTHLY_RFQ_ALLOWANCE;

/** Pilot mode never charges; payments stay off for the whole pilot. */
export const PILOT_MODE_CHARGE_INR = 0 as const;

/**
 * Customer org types that can receive the yearly quarterly bonus.
 * RWA is stored as COMMUNITY. ENTERPRISE and INSTITUTION are not customer types.
 */
const QUARTERLY_BONUS_BUYER_ORG_TYPES = new Set(['INDIVIDUAL', 'COMMUNITY', 'RWA', 'MSME']);

export interface StoredSubscriptionSnapshot {
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiresAt?: string | null;
  orgType?: string | null;
}

export interface PilotRfqAllowance {
  readonly allowance: number;
  readonly used: number;
  readonly remaining: number;
  readonly canPublish: boolean;
  readonly chargedInr: typeof PILOT_MODE_CHARGE_INR;
  readonly realPaymentCharged: boolean;
  readonly calendarMonth: CalendarMonthWindow;
  readonly label: string;
  readonly effectivePlan: BillingCycle;
  readonly quarterlyBonusAllowance: number;
  readonly quarterlyBonusUsed: number;
  readonly quarterlyBonusRemaining: number;
}

export interface SerializedRfqPublicationResult {
  readonly committedCreatedAts: readonly string[];
  readonly successes: number;
  readonly failures: number;
}

export function formatPilotAllowanceLabel(
  remaining: number,
  allowance: number = PILOT_MONTHLY_RFQ_ALLOWANCE,
): string {
  return `Pilot Allowance: ${remaining} of ${allowance} RFQs remaining this month (₹${PILOT_MODE_CHARGE_INR} charged in Pilot Mode)`;
}

function utcMillis(value: Date | string): number {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    throw new Error('Invalid entitlement timestamp');
  }
  return time;
}

function normalizedToken(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}

/**
 * YEARLY is effective only from the stored subscription row: exact YEARLY after
 * the same trim/upper normalization process_subscription_payment writes, an
 * eligible buyer org type, ACTIVE status (blank counts as ACTIVE), and an
 * expiry that is null or not yet past. Expired, malformed, unknown, and
 * non-customer org types do not receive the bonus.
 */
export function authoritativeYearlyBonusApplies(
  stored: StoredSubscriptionSnapshot,
  now: Date | string = new Date(),
): boolean {
  if (normalizedToken(stored.subscriptionPlan) !== 'YEARLY') return false;
  if (!QUARTERLY_BONUS_BUYER_ORG_TYPES.has(normalizedToken(stored.orgType))) return false;
  const status = normalizedToken(stored.subscriptionStatus);
  if ((status === '' ? 'ACTIVE' : status) !== 'ACTIVE') return false;

  const rawExpires = stored.subscriptionExpiresAt;
  if (rawExpires != null && String(rawExpires).trim() !== '') {
    const expiresAt = new Date(String(rawExpires)).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt < utcMillis(now)) return false;
  }
  return true;
}

export function countRfqsInUtcCalendarMonth(
  createdAts: readonly string[],
  now: Date | string,
): number {
  const month = getCalendarMonthWindow(now);
  const start = utcMillis(month.startIso);
  const end = utcMillis(month.endIso);
  return createdAts.reduce((count, iso) => {
    const at = utcMillis(iso);
    return at >= start && at <= end ? count + 1 : count;
  }, 0);
}

/**
 * Bonus rows are published RFQs above the monthly 3 in any UTC calendar month
 * of the current UTC calendar quarter. One excess is the single quarterly bonus.
 * Earlier quarters are ignored. The count is per RFQ row, not per sourcing mode.
 */
export function countUtcCalendarQuarterBonusUsed(
  createdAts: readonly string[],
  now: Date | string,
): number {
  const quarter = getCalendarQuarterWindow(now);
  const start = utcMillis(quarter.startIso);
  const end = utcMillis(quarter.endIso);
  const byMonth = new Map<string, number>();
  for (const iso of createdAts) {
    const at = utcMillis(iso);
    if (at < start || at > end) continue;
    const month = getCalendarMonthWindow(iso);
    const key = `${month.year}-${month.month}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  let used = 0;
  for (const count of byMonth.values()) {
    used += Math.max(0, count - STANDARD_MONTHLY_RFQ_ALLOWANCE);
  }
  return used;
}

function tierForBuyerOrg(orgType: string | null | undefined): SubscriptionTierId {
  const normalized = normalizedToken(orgType);
  if (normalized === 'COMMUNITY' || normalized === 'RWA') return 'RWA';
  if (normalized === 'MSME') return 'MSME';
  return 'INDIVIDUAL';
}

export function evaluatePilotRfqAllowance(params: {
  rfqsPublishedThisMonth: number;
  now?: Date | string;
  quarterlyBonusUsedInCurrentQuarter?: number;
  storedSubscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiresAt?: string | null;
  orgType?: string | null;
}): PilotRfqAllowance {
  const now = params.now ?? new Date();
  const yearly = authoritativeYearlyBonusApplies(
    {
      subscriptionPlan: params.storedSubscriptionPlan,
      subscriptionStatus: params.subscriptionStatus,
      subscriptionExpiresAt: params.subscriptionExpiresAt,
      orgType: params.orgType,
    },
    now,
  );
  const monthlyUsed = Math.max(0, Math.floor(Number(params.rfqsPublishedThisMonth || 0)));
  const reportedBonus = Math.max(0, Math.floor(Number(params.quarterlyBonusUsedInCurrentQuarter || 0)));
  // A month that already holds more than 3 published RFQs has consumed the
  // bonus even if a caller under-reports the quarter counter.
  const bonusUsed = yearly
    ? Math.max(reportedBonus, Math.max(0, monthlyUsed - STANDARD_MONTHLY_RFQ_ALLOWANCE))
    : 0;
  const plan: BillingCycle = yearly ? 'YEARLY' : 'MONTHLY';

  const entitlement = evaluateRfqEntitlement({
    tierId: tierForBuyerOrg(params.orgType),
    plan,
    billingMode: 'PILOT_FREE',
    subscriptionStatus: 'ACTIVE',
    rfqsUsedInCurrentMonth: monthlyUsed,
    quarterlyBonusUsedInCurrentQuarter: bonusUsed,
    additionalPurchasedCredits: 0,
    now,
  });

  const allowance = entitlement.monthlyAllowance;
  const remaining = entitlement.monthlyRemaining;
  const quarterlyBonusAllowance = entitlement.quarterlyBonusAllowance;
  const quarterlyBonusRemaining = entitlement.quarterlyBonusRemaining;
  const label =
    quarterlyBonusAllowance > 0
      ? `Pilot Allowance: ${remaining} of ${allowance} RFQs remaining this month; quarterly bonus ${quarterlyBonusRemaining} of ${quarterlyBonusAllowance} remaining this quarter (₹${PILOT_MODE_CHARGE_INR} charged in Pilot Mode)`
      : formatPilotAllowanceLabel(remaining, allowance);

  return {
    allowance,
    used: entitlement.rfqsUsedInCurrentMonth,
    remaining,
    canPublish: remaining > 0 || quarterlyBonusRemaining > 0,
    chargedInr: PILOT_MODE_CHARGE_INR,
    realPaymentCharged: PILOT_COMMERCIAL_MODE_POLICY.realPaymentCharged,
    calendarMonth: entitlement.calendarMonth,
    label,
    effectivePlan: plan,
    quarterlyBonusAllowance,
    quarterlyBonusUsed: entitlement.quarterlyBonusUsedInCurrentQuarter,
    quarterlyBonusRemaining,
  };
}

/**
 * Applies publication attempts one after another, each seeing the previous
 * committed insert. This is the decision sequence under the organization-row
 * lock in private.enforce_pilot_rfq_allowance. It does not mutate the input
 * list: discarding `committedCreatedAts` is a rolled-back publication.
 */
export function applySerializedRfqPublications(params: {
  existingCreatedAts: readonly string[];
  now: Date | string;
  attempts: number;
  stored: StoredSubscriptionSnapshot;
}): SerializedRfqPublicationResult {
  const committedCreatedAts = [...params.existingCreatedAts];
  const nowIso = params.now instanceof Date ? params.now.toISOString() : params.now;
  let successes = 0;
  let failures = 0;
  const attempts = Math.max(0, Math.floor(params.attempts));
  for (let i = 0; i < attempts; i += 1) {
    const allowance = evaluatePilotRfqAllowance({
      rfqsPublishedThisMonth: countRfqsInUtcCalendarMonth(committedCreatedAts, params.now),
      quarterlyBonusUsedInCurrentQuarter: countUtcCalendarQuarterBonusUsed(committedCreatedAts, params.now),
      storedSubscriptionPlan: params.stored.subscriptionPlan,
      subscriptionStatus: params.stored.subscriptionStatus,
      subscriptionExpiresAt: params.stored.subscriptionExpiresAt,
      orgType: params.stored.orgType,
      now: params.now,
    });
    if (!allowance.canPublish) {
      failures += 1;
      continue;
    }
    committedCreatedAts.push(nowIso);
    successes += 1;
  }
  return { committedCreatedAts, successes, failures };
}
