/**
 * Blind RFQ Engine — live integration via Supabase blind views + BlindRfqService.
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
  isLocalSupabaseReachable,
  LOCAL_ANON_KEY,
  LOCAL_SUPABASE_URL,
  SEED,
  signInAs,
} from '../helpers/supabase-local';

let supabaseUp = false;

const MANAGER = {
  profileId: 'b0000000-0000-4000-8000-000000000001',
  organizationId: SEED.greenviewOrg,
  orgRole: 'MANAGER' as const,
};

async function seedRfqMeta(mem: InMemoryRepositories) {
  await mem.asRepositories().rfqs.save({
    id: SEED.borewellRfq,
    requirementId: 'req-seed',
    organizationId: SEED.greenviewOrg,
    status: 'OPEN',
    revealStatus: 'BLIND',
    title: 'Borewell RFQ',
    buyerAnonymousToSuppliers: true,
    minQuotesRequired: 3,
    createdBy: MANAGER.profileId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

describe('Blind RFQ Engine — live', () => {
  beforeAll(async () => {
    supabaseUp = await isLocalSupabaseReachable();
  });

  beforeEach((ctx) => {
    if (!supabaseUp) ctx.skip();
  });

  it('BlindRfqService returns blind quotes from quotes_blind view', async () => {
    const authClient = createAnonClient();
    await signInAs(authClient, 'manager@greenview.test');
    const { data: session } = await authClient.auth.getSession();
    const token = session.session?.access_token;
    expect(token).toBeTruthy();

    const mem = InMemoryRepositories.create();
    await seedRfqMeta(mem);
    const blindViews = createSupabaseBlindViewPorts(
      LOCAL_SUPABASE_URL,
      LOCAL_ANON_KEY,
      token!,
    );
    const blindRfq = new BlindRfqService(
      mem.asRepositories(),
      blindViews,
      new InMemoryAuditService(),
    );

    const result = await blindRfq.getBlindQuotes(MANAGER, SEED.borewellRfq);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.length).toBe(3);
    for (const quote of result.value) {
      assertNoBlindIdentityLeak(quote as unknown as Record<string, unknown>);
      expect(quote.anonymousLabel).toMatch(/^Supplier [A-E]$/);
    }
  });

  it('rejects revealed quotes while RFQ is BLIND', async () => {
    const authClient = createAnonClient();
    await signInAs(authClient, 'manager@greenview.test');
    const { data: session } = await authClient.auth.getSession();
    const token = session.session?.access_token!;

    const mem = InMemoryRepositories.create();
    await seedRfqMeta(mem);
    const blindViews = createSupabaseBlindViewPorts(
      LOCAL_SUPABASE_URL,
      LOCAL_ANON_KEY,
      token,
    );
    const blindRfq = new BlindRfqService(
      mem.asRepositories(),
      blindViews,
      new InMemoryAuditService(),
    );

    const result = await blindRfq.getRevealedQuotes(MANAGER, SEED.borewellRfq);
    expect(result.ok).toBe(false);
  });

  it('manager invitations hide supplier_id while BLIND', async () => {
    const authClient = createAnonClient();
    await signInAs(authClient, 'manager@greenview.test');
    const { data: session } = await authClient.auth.getSession();
    const token = session.session?.access_token!;

    const mem = InMemoryRepositories.create();
    await seedRfqMeta(mem);
    const blindViews = createSupabaseBlindViewPorts(
      LOCAL_SUPABASE_URL,
      LOCAL_ANON_KEY,
      token,
    );
    const blindRfq = new BlindRfqService(
      mem.asRepositories(),
      blindViews,
      new InMemoryAuditService(),
    );

    const result = await blindRfq.getManagerInvitations(MANAGER, SEED.borewellRfq);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.length).toBeGreaterThanOrEqual(5);
    for (const inv of result.value) {
      expect(inv.supplierId).toBeNull();
      expect(inv.matchScore).not.toBeNull();
    }
  });
});
