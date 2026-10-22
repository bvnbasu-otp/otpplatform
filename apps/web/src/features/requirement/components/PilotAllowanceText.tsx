import type { PilotRfqAllowance } from '@otp/domain';
import type { PilotAllowanceLoadStatus } from '@/features/intake/hooks/use-pilot-allowance';

export const PILOT_ALLOWANCE_PENDING_TEXT =
  'Pilot Allowance: checking this month’s RFQs… (₹0 charged in Pilot Mode)';

export const PILOT_ALLOWANCE_UNAVAILABLE_TEXT =
  'Pilot allowance could not be verified. Publishing stays closed until the check succeeds.';

/** Visible chip text. Uses fields already on the allowance; it does not recompute entitlement. */
export function formatRfqBalanceSummary(allowance: PilotRfqAllowance): string {
  const parts = [`${allowance.remaining}/${allowance.allowance} RFQs`];
  if (allowance.quarterlyBonusAllowance > 0) {
    parts.push(`${allowance.quarterlyBonusRemaining}/${allowance.quarterlyBonusAllowance} qtr`);
  }
  if (allowance.purchasedCredits > 0) {
    parts.push(`${allowance.purchasedCredits} extra`);
  }
  return parts.join(' · ');
}

export function PilotAllowanceText({
  allowance,
  status = 'loading',
}: {
  allowance: PilotRfqAllowance | null;
  status?: PilotAllowanceLoadStatus;
}) {
  const text = status === 'unavailable'
    ? PILOT_ALLOWANCE_UNAVAILABLE_TEXT
    : allowance
      ? allowance.label
      : PILOT_ALLOWANCE_PENDING_TEXT;
  return <span data-testid="pilot-allowance-text">{text}</span>;
}
