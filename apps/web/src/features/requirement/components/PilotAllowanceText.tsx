import type { PilotRfqAllowance } from '@otp/domain';

export const PILOT_ALLOWANCE_PENDING_TEXT =
  'Pilot Allowance: checking this month’s RFQs… (₹0 charged in Pilot Mode)';

export function PilotAllowanceText({ allowance }: { allowance: PilotRfqAllowance | null }) {
  return <span data-testid="pilot-allowance-text">{allowance ? allowance.label : PILOT_ALLOWANCE_PENDING_TEXT}</span>;
}
