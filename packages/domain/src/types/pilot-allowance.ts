import {
  PILOT_COMMERCIAL_MODE_POLICY,
  STANDARD_MONTHLY_RFQ_ALLOWANCE,
  evaluateRfqEntitlement,
  type CalendarMonthWindow,
} from './pricing-entitlement';

/**
 * Pilot-mode monthly RFQ allowance.
 *
 * Display and the publish gate both read this evaluation, so the number a buyer
 * sees is the number that decides whether they can publish.
 */
export const PILOT_MONTHLY_RFQ_ALLOWANCE = STANDARD_MONTHLY_RFQ_ALLOWANCE;

/** Pilot mode never charges; payments stay off for the whole pilot. */
export const PILOT_MODE_CHARGE_INR = 0 as const;

export interface PilotRfqAllowance {
  readonly allowance: number;
  readonly used: number;
  readonly remaining: number;
  readonly canPublish: boolean;
  readonly chargedInr: typeof PILOT_MODE_CHARGE_INR;
  readonly realPaymentCharged: boolean;
  readonly calendarMonth: CalendarMonthWindow;
  readonly label: string;
}

export function formatPilotAllowanceLabel(
  remaining: number,
  allowance: number = PILOT_MONTHLY_RFQ_ALLOWANCE,
): string {
  return `Pilot Allowance: ${remaining} of ${allowance} RFQs remaining this month (₹${PILOT_MODE_CHARGE_INR} charged in Pilot Mode)`;
}

export function evaluatePilotRfqAllowance(params: {
  rfqsPublishedThisMonth: number;
  now?: Date | string;
}): PilotRfqAllowance {
  const entitlement = evaluateRfqEntitlement({
    tierId: 'INDIVIDUAL',
    plan: 'MONTHLY',
    billingMode: 'PILOT_FREE',
    rfqsUsedInCurrentMonth: params.rfqsPublishedThisMonth,
    now: params.now,
  });

  const allowance = entitlement.monthlyAllowance;
  const remaining = entitlement.monthlyRemaining;

  return {
    allowance,
    used: entitlement.rfqsUsedInCurrentMonth,
    remaining,
    canPublish: remaining > 0,
    chargedInr: PILOT_MODE_CHARGE_INR,
    realPaymentCharged: PILOT_COMMERCIAL_MODE_POLICY.realPaymentCharged,
    calendarMonth: entitlement.calendarMonth,
    label: formatPilotAllowanceLabel(remaining, allowance),
  };
}
