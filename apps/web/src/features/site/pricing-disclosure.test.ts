import { describe, expect, it } from 'vitest';
import {
  disclosureAdditionalRfqAmount,
  disclosureSubscriptionAmount,
  resolvePublicPriceAmount,
} from './lib/pricing-disclosure';

describe('public pricing disclosure helpers', () => {
  it('resolves reviewed domain amounts when RPC returns nothing', () => {
    expect(resolvePublicPriceAmount('MSME', 'MONTHLY', null)).toEqual({
      amount: 1999,
      source: 'disclosure',
    });
    expect(disclosureSubscriptionAmount('RWA', 'YEARLY')).toBe(14999);
    expect(disclosureAdditionalRfqAmount('INDIVIDUAL')).toBe(149);
  });

  it('prefers live catalogue RPC amounts when present', () => {
    expect(resolvePublicPriceAmount('INDIVIDUAL', 'MONTHLY', 199)).toEqual({
      amount: 199,
      source: 'rpc',
    });
  });
});
