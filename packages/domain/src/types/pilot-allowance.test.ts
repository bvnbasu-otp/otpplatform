import { describe, expect, it } from 'vitest';
import {
  PILOT_MODE_CHARGE_INR,
  PILOT_MONTHLY_RFQ_ALLOWANCE,
  evaluatePilotRfqAllowance,
  formatPilotAllowanceLabel,
} from './pilot-allowance';
import {
  PILOT_COMMERCIAL_MODE_POLICY,
  STANDARD_MONTHLY_RFQ_ALLOWANCE,
  evaluateRfqEntitlement,
} from './pricing-entitlement';

describe('Pilot RFQ allowance (issue 22)', () => {
  it('uses the shared 3-RFQ monthly allowance constant', () => {
    expect(PILOT_MONTHLY_RFQ_ALLOWANCE).toBe(STANDARD_MONTHLY_RFQ_ALLOWANCE);
    expect(PILOT_MONTHLY_RFQ_ALLOWANCE).toBe(3);
  });

  it('formats the exact allowance string', () => {
    expect(formatPilotAllowanceLabel(2)).toBe(
      'Pilot Allowance: 2 of 3 RFQs remaining this month (₹0 charged in Pilot Mode)',
    );
  });

  it('computes remaining from RFQs published this month and matches the entitlement engine', () => {
    for (const used of [0, 1, 2, 3, 7]) {
      const res = evaluatePilotRfqAllowance({ rfqsPublishedThisMonth: used, now: '2026-09-26T10:00:00Z' });
      const engine = evaluateRfqEntitlement({
        tierId: 'INDIVIDUAL',
        plan: 'MONTHLY',
        billingMode: 'PILOT_FREE',
        rfqsUsedInCurrentMonth: used,
        now: '2026-09-26T10:00:00Z',
      });
      expect(res.remaining).toBe(engine.monthlyRemaining);
      expect(res.allowance).toBe(engine.monthlyAllowance);
      expect(res.remaining).toBe(Math.max(0, 3 - used));
      expect(res.canPublish).toBe(res.remaining > 0);
      expect(res.label).toBe(
        `Pilot Allowance: ${Math.max(0, 3 - used)} of 3 RFQs remaining this month (₹0 charged in Pilot Mode)`,
      );
    }
  });

  it('blocks publishing once the allowance is used up', () => {
    const exhausted = evaluatePilotRfqAllowance({ rfqsPublishedThisMonth: 3 });
    expect(exhausted.remaining).toBe(0);
    expect(exhausted.canPublish).toBe(false);
  });

  it('keeps the pilot financial freeze: ₹0 charged, no real payment', () => {
    const res = evaluatePilotRfqAllowance({ rfqsPublishedThisMonth: 1 });
    expect(PILOT_MODE_CHARGE_INR).toBe(0);
    expect(res.chargedInr).toBe(0);
    expect(res.realPaymentCharged).toBe(false);
    expect(PILOT_COMMERCIAL_MODE_POLICY.realPaymentCharged).toBe(false);
  });

  it('counts within the UTC calendar month window', () => {
    const res = evaluatePilotRfqAllowance({ rfqsPublishedThisMonth: 0, now: '2026-09-30T23:59:59Z' });
    expect(res.calendarMonth.startIso).toBe('2026-09-01T00:00:00.000Z');
    expect(res.calendarMonth.endIso).toBe('2026-09-30T23:59:59.999Z');
  });
});
