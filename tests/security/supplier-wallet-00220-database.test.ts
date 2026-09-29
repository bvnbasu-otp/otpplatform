/**
 * Local Supabase only — migration 00220 supplier wallet RPC.
 */
import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
} from '../helpers/supabase-local';

let dbUp = false;

describe('00220 — supplier wallet (REAL DATABASE)', () => {
  beforeAll(async () => {
    dbUp = await isLocalSupabaseReachable();
  });

  beforeEach((ctx) => {
    if (!dbUp) ctx.skip();
  });

  it('anon cannot execute credit_supplier_wallet_event_atomic', async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc('credit_supplier_wallet_event_atomic' as never, {
      p_beneficiary_org_id: 'a0000000-0000-4000-8000-000000000099',
      p_event_type: 'SUPPLIER_REFERRAL_BONUS',
      p_source_entity_id: 'b0000000-0000-4000-8000-000000000099',
      p_idempotency_key: 'test-anon-block',
      p_client_amount: null,
    } as never);
    expect(error).toBeTruthy();
    expect(error?.message ?? '').toMatch(/permission denied|Could not find/i);
  });

  it('service_role credits ₹100 and rejects client amount override', async () => {
    const service = createServiceClient();
    const orgId = 'a0000000-0000-4000-8000-0000000000aa';
    const sourceId = 'c0000000-0000-4000-8000-0000000000aa';
    const key = `sw-test-${Date.now()}`;

    await service.from('organizations').upsert({
      id: orgId,
      name: 'Wallet Test Org',
      org_type: 'MSME',
    });

    const { data: ok, error: okErr } = await service.rpc(
      'credit_supplier_wallet_event_atomic' as never,
      {
        p_beneficiary_org_id: orgId,
        p_event_type: 'SUPPLIER_REFERRAL_BONUS',
        p_source_entity_id: sourceId,
        p_idempotency_key: key,
        p_client_amount: null,
      } as never,
    );
    expect(okErr).toBeNull();
    expect((ok as { amount?: number })?.amount).toBe(100);

    const { error: badAmount } = await service.rpc(
      'credit_supplier_wallet_event_atomic' as never,
      {
        p_beneficiary_org_id: orgId,
        p_event_type: 'SUPPLIER_REFERRAL_BONUS',
        p_source_entity_id: 'd0000000-0000-4000-8000-0000000000aa',
        p_idempotency_key: `${key}-override`,
        p_client_amount: 50,
      } as never,
    );
    expect(badAmount?.message ?? '').toMatch(/Client cannot override/i);

    const { data: replay, error: replayErr } = await service.rpc(
      'credit_supplier_wallet_event_atomic' as never,
      {
        p_beneficiary_org_id: orgId,
        p_event_type: 'SUPPLIER_REFERRAL_BONUS',
        p_source_entity_id: sourceId,
        p_idempotency_key: key,
        p_client_amount: null,
      } as never,
    );
    expect(replayErr).toBeNull();
    expect((replay as { replayed?: boolean })?.replayed).toBe(true);
  });

  it('rejects SUPPLIER_SUCCESS_REWARD when platform fee is not SETTLED', async () => {
    const service = createServiceClient();
    const orgId = 'a0000000-0000-4000-8000-0000000000ab';
    const feeId = 'e0000000-0000-4000-8000-0000000000ab';

    await service.from('organizations').upsert({
      id: orgId,
      name: 'Wallet Success Test Org',
      org_type: 'MSME',
    });

    const { error } = await service.rpc('credit_supplier_wallet_event_atomic' as never, {
      p_beneficiary_org_id: orgId,
      p_event_type: 'SUPPLIER_SUCCESS_REWARD',
      p_source_entity_id: feeId,
      p_idempotency_key: `sw-success-${Date.now()}`,
      p_client_amount: null,
    } as never);
    expect(error?.message ?? '').toMatch(/not found|SETTLED/i);
  });
});
