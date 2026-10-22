import { describe, expect, it } from 'vitest';
import type { PilotRfqAllowance } from '@otp/domain';
import { formatRfqBalanceSummary } from './components/PilotAllowanceText';

describe('formatRfqBalanceSummary', () => {
  it('prints the allowance fields the server already returned', () => {
    const summary = formatRfqBalanceSummary({
      remaining: 0,
      allowance: 3,
      quarterlyBonusAllowance: 1,
      quarterlyBonusRemaining: 1,
      purchasedCredits: 2,
    } as PilotRfqAllowance);

    expect(summary).toBe('0/3 RFQs · 1/1 qtr · 2 extra');
    expect(summary).not.toBe('3 RFQs');
  });

  it('omits bonus and extra segments when those fields are zero', () => {
    expect(formatRfqBalanceSummary({
      remaining: 2,
      allowance: 3,
      quarterlyBonusAllowance: 0,
      quarterlyBonusRemaining: 0,
      purchasedCredits: 0,
    } as PilotRfqAllowance)).toBe('2/3 RFQs');
  });
});
