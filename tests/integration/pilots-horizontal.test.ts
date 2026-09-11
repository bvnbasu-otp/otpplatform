/**
 * Horizontal procurement pilots — seed validation.
 * Requires local Supabase (supabase db reset).
 */
import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { BlindRfqService } from '../../packages/services/src/blind/blind-rfq-service';
import { createSupabaseBlindViewPorts } from '../../packages/services/src/blind/supabase-blind-view-adapter';
import { InMemoryAuditService } from '../../packages/services/src/audit/in-memory-audit-service';
import { InMemoryRepositories } from '../../packages/services/src/repositories/in-memory';
import {
  assertNoBlindIdentityLeak,
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  LOCAL_ANON_KEY,
  LOCAL_SUPABASE_URL,
  signInAs,
} from '../helpers/supabase-local';

const MANAGER_PROFILE = 'b0000000-0000-4000-8000-000000000001';

const PILOT_RFQS = [
  { id: 'pilot-1', rfqId: 'f1000000-0000-4000-8000-000000000001', orgId: 'a0000000-0000-4000-8000-000000000001' },
  { id: 'pilot-2', rfqId: 'd2000021-0000-4000-8000-000000000001', orgId: 'd2000000-0000-4000-8000-000000000001' },
  { id: 'pilot-3', rfqId: 'd3000021-0000-4000-8000-000000000001', orgId: 'd3000000-0000-4000-8000-000000000001' },
  { id: 'pilot-4', rfqId: 'd4000021-0000-4000-8000-000000000001', orgId: 'd4000000-0000-4000-8000-000000000001' },
] as const;

let supabaseUp = false;

describe('horizontal procurement pilots', () => {
  beforeAll(async () => {
    supabaseUp = await isLocalSupabaseReachable();
  });

  beforeEach((ctx) => {
    if (!supabaseUp) ctx.skip();
  });

  it('seeds all four pilot RFQs in EVALUATING with 3 FINAL quotes', async () => {
    const admin = createServiceClient();

    for (const pilot of PILOT_RFQS) {
      const { data: rfq } = await admin
        .from('rfqs')
        .select('status, reveal_status, title')
        .eq('id', pilot.rfqId)
        .single();

      expect(rfq?.status, pilot.id).toBe('EVALUATING');
      expect(rfq?.reveal_status, pilot.id).toBe('BLIND');

      const { data: quotes } = await admin
        .from('quotes')
        .select('status')
        .eq('rfq_id', pilot.rfqId);

      expect(quotes?.length, pilot.id).toBe(3);
      expect(quotes?.every((q) => q.status === 'FINAL'), pilot.id).toBe(true);
    }
  });

  it('manager can blind-compare quotes on every pilot RFQ', async () => {
    const authClient = createAnonClient();
    await signInAs(authClient, 'manager@greenview.test');
    const { data: session } = await authClient.auth.getSession();
    const token = session.session?.access_token;
    expect(token).toBeTruthy();

    for (const pilot of PILOT_RFQS) {
      const mem = InMemoryRepositories.create();
      await mem.asRepositories().rfqs.save({
        id: pilot.rfqId,
        requirementId: 'req-pilot',
        organizationId: pilot.orgId,
        status: 'EVALUATING',
        revealStatus: 'BLIND',
        title: pilot.id,
        buyerAnonymousToSuppliers: true,
        minQuotesRequired: 3,
        createdBy: MANAGER_PROFILE,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const blindRfq = new BlindRfqService(
        mem.asRepositories(),
        createSupabaseBlindViewPorts(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, token!),
        new InMemoryAuditService(),
      );

      const result = await blindRfq.getBlindQuotes(
        {
          profileId: MANAGER_PROFILE,
          organizationId: pilot.orgId,
          orgRole: 'MANAGER',
        },
        pilot.rfqId,
      );

      expect(result.ok, pilot.id).toBe(true);
      if (!result.ok) continue;
      expect(result.value.length, pilot.id).toBe(3);
      for (const quote of result.value) {
        assertNoBlindIdentityLeak(quote as unknown as Record<string, unknown>);
      }
    }
  });
});
