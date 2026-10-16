import type { PilotRfqAllowance } from '@otp/domain';
import type { PilotAllowanceLoadStatus } from '@/features/intake/hooks/use-pilot-allowance';

export const PILOT_ALLOWANCE_PENDING_TEXT =
  'Pilot Allowance: checking this month’s RFQs… (₹0 charged in Pilot Mode)';

export const PILOT_ALLOWANCE_UNAVAILABLE_TEXT =
  'Pilot allowance could not be verified. Publishing stays closed until the check succeeds.';

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
