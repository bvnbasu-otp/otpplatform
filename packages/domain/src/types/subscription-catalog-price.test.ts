import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PILOT_COMMERCIAL_MODE_POLICY, SUBSCRIPTION_TIERS } from './pricing-entitlement';

describe('canonical subscription prices', () => {
  it('matches 00250 wallet catalog figures to SUBSCRIPTION_TIERS', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../../supabase/migrations/00250_financial_authority_client_grant_boundary.sql'),
      'utf8',
    );
    const start = sql.indexOf('FUNCTION private.subscription_wallet_credit_inr');
    const end = sql.indexOf('REVOKE ALL ON FUNCTION private.subscription_wallet_credit_inr');
    const fn = sql.slice(start, end);
    expect(fn).toContain(`${SUBSCRIPTION_TIERS.INDIVIDUAL.yearlyPrice}.00`);
    expect(fn).toContain(`${SUBSCRIPTION_TIERS.RWA.yearlyPrice}.00`);
    expect(fn).toContain(`${SUBSCRIPTION_TIERS.MSME.yearlyPrice}.00`);
    expect(fn).toContain(`${SUBSCRIPTION_TIERS.ENTERPRISE.yearlyPrice}.00`);
    expect(fn).toContain(`${SUBSCRIPTION_TIERS.INDIVIDUAL.monthlyPrice}.00`);
    expect(fn).not.toContain('1990.00');
    expect(fn).not.toContain('14990.00');
    expect(fn).not.toContain('19990.00');
    expect(fn).not.toContain('49990.00');
    expect(PILOT_COMMERCIAL_MODE_POLICY.supplierPlatformFeeCharged).toBe(false);
    expect(sql).toContain('supplierPlatformFeeCharged');
  });
});
