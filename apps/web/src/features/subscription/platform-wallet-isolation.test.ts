import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { walletEntitlementFromContext } from './hooks/use-wallet-entitlement';
import type { RoleContext } from '@/features/roles';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');

function buyer(buyerType: 'INDIVIDUAL' | 'RWA' | 'MSME', orgType: string): RoleContext {
  return {
    signedIn: true,
    isPlatformAdmin: false,
    isFounder: false,
    needsOnboarding: false,
    activeRole: null,
    roles: [],
    profileId: 'prof-1',
    email: 'buyer@example.com',
    fullName: 'Buyer',
    side: 'BUYER',
    organizationId: `org-${buyerType}`,
    organizationName: buyerType === 'INDIVIDUAL' ? 'Self' : buyerType,
    orgRole: 'OWNER',
    supplierId: null,
    buyerType,
    committeeRfqCount: 0,
    organizations: [{ id: `org-${buyerType}`, orgType, isPersonal: buyerType === 'INDIVIDUAL', name: 'Self', role: 'OWNER' }],
    title: null,
    avatarUrl: null,
    phone: null,
  };
}

describe('platform role wallet isolation', () => {
  it('keeps buyer procurement wallets for Individual, RWA, and MSME', () => {
    for (const [type, orgType] of [
      ['INDIVIDUAL', 'INDIVIDUAL'],
      ['RWA', 'COMMUNITY'],
      ['MSME', 'MSME'],
    ] as const) {
      const ent = walletEntitlementFromContext(buyer(type, orgType));
      expect(ent.customerWalletAllowed).toBe(true);
      expect(ent.entitledWalletOrgId).toBe(`org-${type}`);
      expect(ent.referIdentifier).toBeTruthy();
    }
  });

  it('denies customer wallet to founder and platform admin while leaving a referral identifier', () => {
    for (const flags of [{ isPlatformAdmin: true, isFounder: false }, { isPlatformAdmin: false, isFounder: true }]) {
      const ent = walletEntitlementFromContext({ ...buyer('INDIVIDUAL', 'INDIVIDUAL'), ...flags });
      expect(ent.customerWalletAllowed).toBe(false);
      expect(ent.entitledWalletOrgId).toBeNull();
      expect(ent.referIdentifier).toBe('buyer@example.com');
    }
  });

  it('does not invent CEO, Sysadmin, OpsAdmin, or Sales and Marketing platform roles', () => {
    const roles = readFileSync(join(root, 'packages/domain/src/enums/roles.ts'), 'utf8');
    expect(roles).toContain("FOUNDER: 'FOUNDER'");
    expect(roles).toContain("PLATFORM_ADMIN: 'PLATFORM_ADMIN'");
    expect(roles).not.toContain('SYSADMIN');
    expect(roles).not.toContain('OPS_ADMIN');
    expect(roles).not.toContain('SALES_AND_MARKETING');
    expect(roles).not.toMatch(/CEO:/);
  });

  it('denies human platform roles in the wallet read and subscription payment functions', () => {
    const sql = readFileSync(join(root, 'supabase/migrations/00233_platform_role_wallet_denial.sql'), 'utf8');
    expect(sql).toContain('is_human_platform_wallet_denied');
    expect(sql).toContain('PLATFORM_WALLET_DENIED');
    expect(sql).toContain('get_organization_wallet');
    expect(sql).toContain('process_subscription_payment');
    expect(sql).toContain("<> 'service_role'");
    const walletFn = sql.slice(sql.indexOf('FUNCTION public.get_organization_wallet'), sql.indexOf('FUNCTION public.get_wallet_transactions'));
    expect(walletFn).not.toContain('OR private.is_platform_admin()');
  });
});
