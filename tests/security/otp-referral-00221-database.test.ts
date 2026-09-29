/**
 * Local Supabase only — migration 00221 unified referral bonus matrix.
 */
import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
} from '../helpers/supabase-local';

let dbUp = false;

describe('00221 — OTP referral bonus matrix (REAL DATABASE)', () => {
  beforeAll(async () => {
    dbUp = await isLocalSupabaseReachable();
  });

  beforeEach((ctx) => {
    if (!dbUp) ctx.skip();
  });

  it('anon cannot execute credit_otp_referral_bonus_atomic', async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc('credit_otp_referral_bonus_atomic' as never, {
      p_beneficiary_org_id: 'a0000000-0000-4000-8000-000000000099',
      p_referrer_persona: 'BUYER',
      p_referred_profile_kind: 'MSME',
      p_source_entity_id: 'b0000000-0000-4000-8000-000000000099',
      p_referrer_org_id: 'c0000000-0000-4000-8000-000000000099',
      p_referred_org_id: 'd0000000-0000-4000-8000-000000000099',
      p_idempotency_key: 'ref-anon-block',
      p_client_amount: null,
      p_referrer_supplier_id: null,
    } as never);
    expect(error).toBeTruthy();
    expect(error?.message ?? '').toMatch(/permission denied|Could not find/i);
  });

  it('buyer referrer credits ₹50 for MSME referred profile and rejects client override', async () => {
    const service = createServiceClient();
    const orgId = 'a0000000-0000-4000-8000-0000000000cc';
    const referredOrgId = 'e0000000-0000-4000-8000-0000000000cc';
    const sourceId = 'f0000000-0000-4000-8000-0000000000cc';
    const key = `ref-msme-${Date.now()}`;

    await service.from('organizations').upsert({
      id: orgId,
      name: 'Referrer Org',
      org_type: 'MSME',
    });
    await service.from('organizations').upsert({
      id: referredOrgId,
      name: 'Referred MSME Org',
      org_type: 'MSME',
    });

    const { data: ok, error: okErr } = await service.rpc(
      'credit_otp_referral_bonus_atomic' as never,
      {
        p_beneficiary_org_id: orgId,
        p_referrer_persona: 'BUYER',
        p_referred_profile_kind: null,
        p_source_entity_id: sourceId,
        p_referrer_org_id: orgId,
        p_referred_org_id: referredOrgId,
        p_idempotency_key: key,
        p_client_amount: null,
        p_referrer_supplier_id: null,
      } as never,
    );
    expect(okErr).toBeNull();
    expect((ok as { amount?: number })?.amount).toBe(50);

    const { error: badProfile } = await service.rpc(
      'credit_otp_referral_bonus_atomic' as never,
      {
        p_beneficiary_org_id: orgId,
        p_referrer_persona: 'BUYER',
        p_referred_profile_kind: 'INDIVIDUAL',
        p_source_entity_id: 'f0000000-0000-4000-8000-0000000000cd',
        p_referrer_org_id: orgId,
        p_referred_org_id: referredOrgId,
        p_idempotency_key: `${key}-bad-profile`,
        p_client_amount: null,
        p_referrer_supplier_id: null,
      } as never,
    );
    expect(badProfile?.message ?? '').toMatch(/cannot override referred profile kind/i);

    const { error: badAmount } = await service.rpc(
      'credit_otp_referral_bonus_atomic' as never,
      {
        p_beneficiary_org_id: orgId,
        p_referrer_persona: 'BUYER',
        p_referred_profile_kind: null,
        p_source_entity_id: 'f0000000-0000-4000-8000-0000000000ce',
        p_referrer_org_id: orgId,
        p_referred_org_id: referredOrgId,
        p_idempotency_key: `${key}-bad`,
        p_client_amount: 10,
        p_referrer_supplier_id: null,
      } as never,
    );
    expect(badAmount?.message ?? '').toMatch(/Client cannot override/i);
  });

  it('blocks self-referral', async () => {
    const service = createServiceClient();
    const orgId = 'a0000000-0000-4000-8000-0000000000cf';
    await service.from('organizations').upsert({
      id: orgId,
      name: 'Self Org',
      org_type: 'INDIVIDUAL',
    });

    const { error } = await service.rpc('credit_otp_referral_bonus_atomic' as never, {
      p_beneficiary_org_id: orgId,
      p_referrer_persona: 'BUYER',
      p_referred_profile_kind: null,
      p_source_entity_id: 'f0000000-0000-4000-8000-0000000000cf',
      p_referrer_org_id: orgId,
      p_referred_org_id: orgId,
      p_idempotency_key: `ref-self-${Date.now()}`,
      p_client_amount: null,
      p_referrer_supplier_id: null,
    } as never);
    expect(error?.message ?? '').toMatch(/Self-referral/i);
  });

  it('supplier referrer requires settled OTP transaction gate', async () => {
    const service = createServiceClient();
    const orgId = 'a0000000-0000-4000-8000-0000000000d0';
    const referredOrgId = 'e0000000-0000-4000-8000-0000000000d0';
    const supplierId = 'b0000000-0000-4000-8000-0000000000d0';
    const referredSupplierId = 'f0000000-0000-4000-8000-0000000000d0';
    await service.from('organizations').upsert({
      id: orgId,
      name: 'Supplier Referrer Org',
      org_type: 'MSME',
    });
    await service.from('organizations').upsert({
      id: referredOrgId,
      name: 'Referred Supplier Org',
      org_type: 'MSME',
    });
    await service.from('suppliers').upsert({
      id: supplierId,
      business_name: 'Referrer Supplier Co',
      source: 'DIRECT',
      status: 'ACTIVE',
    });
    await service.from('suppliers').upsert({
      id: referredSupplierId,
      business_name: 'Referred Supplier Co',
      source: 'DIRECT',
      status: 'ACTIVE',
    });

    const { error } = await service.rpc('credit_otp_referral_bonus_atomic' as never, {
      p_beneficiary_org_id: orgId,
      p_referrer_persona: 'SUPPLIER',
      p_referred_profile_kind: null,
      p_source_entity_id: referredSupplierId,
      p_referrer_org_id: orgId,
      p_referred_org_id: referredOrgId,
      p_idempotency_key: `ref-gate-${Date.now()}`,
      p_client_amount: null,
      p_referrer_supplier_id: supplierId,
    } as never);
    expect(error?.message ?? '').toMatch(/settled OTP transaction/i);
  });
});
