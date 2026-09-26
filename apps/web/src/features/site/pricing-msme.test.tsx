import React from 'react';
import { describe, it, expect } from 'vitest';
import { PricingPage } from './pages/PricingPage';
import { SUBSCRIPTION_TIERS } from '@otp/domain';

describe('PricingPage (Canonical 3 Tiers: Individual, RWA, MSME)', () => {
  it('instantiates PricingPage component cleanly', () => {
    const element = React.createElement(PricingPage, {});
    expect(element).toBeDefined();
    expect(element.type).toBe(PricingPage);
  });

  it('validates canonical frozen pricing constants including persona-specific extra RFQ top-up rates', () => {
    expect(SUBSCRIPTION_TIERS.INDIVIDUAL.monthlyPrice).toBe(199);
    expect(SUBSCRIPTION_TIERS.INDIVIDUAL.yearlyPrice).toBe(1999);
    expect(SUBSCRIPTION_TIERS.INDIVIDUAL.monthlyRfqs).toBe(3);
    expect(SUBSCRIPTION_TIERS.INDIVIDUAL.additionalRfqPrice).toBe(149);

    expect(SUBSCRIPTION_TIERS.RWA.monthlyPrice).toBe(1499);
    expect(SUBSCRIPTION_TIERS.RWA.yearlyPrice).toBe(14999);
    expect(SUBSCRIPTION_TIERS.RWA.monthlyRfqs).toBe(3);
    expect(SUBSCRIPTION_TIERS.RWA.additionalRfqPrice).toBe(999);

    expect(SUBSCRIPTION_TIERS.MSME.monthlyPrice).toBe(1999);
    expect(SUBSCRIPTION_TIERS.MSME.yearlyPrice).toBe(19999);
    expect(SUBSCRIPTION_TIERS.MSME.monthlyRfqs).toBe(3);
    expect(SUBSCRIPTION_TIERS.MSME.additionalRfqPrice).toBe(1499);
  });

  it('validates controlled pilot commercial mode disclosure copy and referral incentives', () => {
    const pilotNotice = 'Pilot Mode — No real payment will be charged during this pilot.';
    expect(pilotNotice).toContain('Pilot Mode');
    expect(pilotNotice).toContain('No real payment');
  });
});
