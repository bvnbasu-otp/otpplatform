/**
 * RLS & blind RFQ security tests — require local Supabase (pnpm db:reset).
 * Proves unauthorized identity data cannot be retrieved via PostgREST.
 */
import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import {
  assertNoBlindIdentityLeak,
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  SEED,
  signInAs,
} from '../helpers/supabase-local';
import { readMigration } from '../helpers/migration-manifest';
import { SupplierSource, supplierSourceToNetwork } from '@otp/domain';

const SUPPLIER_SOURCES = Object.values(SupplierSource);

let supabaseUp = false;

describe('RLS security — live Supabase', () => {
  beforeAll(async () => {
    supabaseUp = await isLocalSupabaseReachable();
    if (!supabaseUp) return;
    const service = createServiceClient();
    const { count } = await service
      .from('quotes')
      .select('*', { count: 'exact', head: true });
    expect(count).toBeGreaterThanOrEqual(3);
  });

  beforeEach((ctx) => {
    if (!supabaseUp) {
      ctx.skip();
    }
  });

  it('buyer cannot SELECT quotes base table (RLS denies — no supplier_id leak)', async () => {
    const client = createAnonClient();
    await signInAs(client, 'buyer@greenview.test');

    const { data, error } = await client
      .from('quotes')
      .select('id, supplier_id')
      .eq('rfq_id', SEED.borewellRfq);

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it('manager cannot SELECT quotes base table — must use blind view', async () => {
    const client = createAnonClient();
    await signInAs(client, 'manager@greenview.test');

    const { data } = await client
      .from('quotes')
      .select('supplier_id')
      .eq('rfq_id', SEED.borewellRfq);

    expect(data?.length ?? 0).toBe(0);
  });

  it('manager sees blind quotes without supplier identity fields', async () => {
    const client = createAnonClient();
    await signInAs(client, 'manager@greenview.test');

    const { data, error } = await client
      .from('quotes_blind')
      .select('*')
      .eq('rfq_id', SEED.borewellRfq);

    expect(error).toBeNull();
    expect(data?.length).toBe(3);

    for (const row of data ?? []) {
      assertNoBlindIdentityLeak(row as Record<string, unknown>);
      expect(row.anonymous_label).toMatch(/^Supplier [A-E]$/);
    }

    const labels = (data ?? []).map((r) => r.anonymous_label).sort();
    expect(labels).toEqual(['Supplier A', 'Supplier B', 'Supplier C']);
  });

  it('buyer cannot SELECT rfq_invitations base table', async () => {
    const client = createAnonClient();
    await signInAs(client, 'buyer@greenview.test');

    const { data } = await client
      .from('rfq_invitations')
      .select('supplier_id, anonymous_label')
      .eq('rfq_id', SEED.borewellRfq);

    expect(data?.length ?? 0).toBe(0);
  });

  it('supplier A cannot read supplier B quote on same RFQ', async () => {
    const client = createAnonClient();
    await signInAs(client, 'supplier-a@borewell.test');

    const { data } = await client
      .from('quotes')
      .select('id, supplier_id')
      .eq('rfq_id', SEED.borewellRfq);

    expect(data?.length).toBe(1);
    expect(data?.[0]?.supplier_id).toBe(SEED.supplierA);
  });

  it('supplier A cannot read supplier B invitation', async () => {
    const client = createAnonClient();
    await signInAs(client, 'supplier-a@borewell.test');

    const { data } = await client
      .from('rfq_invitations')
      .select('id, supplier_id')
      .eq('rfq_id', SEED.borewellRfq);

    expect(data?.length).toBe(1);
    expect(data?.[0]?.supplier_id).toBe(SEED.supplierA);
  });

  it('supplier cannot see other suppliers via blind view (view empty for suppliers)', async () => {
    const client = createAnonClient();
    await signInAs(client, 'supplier-b@borewell.test');

    const { data } = await client
      .from('quotes_blind')
      .select('*')
      .eq('rfq_id', SEED.borewellRfq);

    expect(data?.length ?? 0).toBe(0);
  });

  it('manager sees network reach via rfq_supplier_networks without identity fields', async () => {
    const client = createAnonClient();
    await signInAs(client, 'manager@greenview.test');

    const { data, error } = await client
      .from('rfq_supplier_networks')
      .select('*')
      .eq('rfq_id', SEED.borewellRfq);

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);

    // Aggregate rows carry no per-supplier column, so nothing can be correlated
    // to a bidder. Assert the shape is exactly counts keyed by network.
    for (const row of data ?? []) {
      expect(Object.keys(row).sort()).toEqual([
        'invited_count',
        'network',
        'quoted_count',
        'rfq_id',
      ]);
    }

    const invited = (data ?? []).reduce((sum, r) => sum + r.invited_count, 0);
    const quoted = (data ?? []).reduce((sum, r) => sum + r.quoted_count, 0);
    expect(invited).toBe(5);
    expect(quoted).toBe(3);
  });

  it('supplier cannot read rfq_supplier_networks (view empty for suppliers)', async () => {
    const client = createAnonClient();
    await signInAs(client, 'supplier-a@borewell.test');

    const { data } = await client
      .from('rfq_supplier_networks')
      .select('*')
      .eq('rfq_id', SEED.borewellRfq);

    expect(data?.length ?? 0).toBe(0);
  });

  it('quotes_revealed empty while RFQ is BLIND', async () => {
    const client = createAnonClient();
    await signInAs(client, 'manager@greenview.test');

    const { data } = await client
      .from('quotes_revealed')
      .select('*')
      .eq('rfq_id', SEED.borewellRfq);

    expect(data?.length ?? 0).toBe(0);
  });

  it('committee member only accesses RFQs in their organization', async () => {
    const service = createServiceClient();

    const otherOrgId = 'b0000000-0000-4000-8000-0000000099';
    await service.from('organizations').upsert({
      id: otherOrgId,
      name: 'Other Community Test',
      org_type: 'COMMUNITY',
    });

    const otherReqId = 'b2000000-0000-4000-8000-0000000099';
    await service.from('requirements').upsert({
      id: otherReqId,
      organization_id: otherOrgId,
      created_by: 'b0000000-0000-4000-8000-000000000001',
      requirement_type: 'SERVICE',
      status: 'QUOTING',
      title: 'Other org requirement',
    });

    const otherRfqId = 'b1000000-0000-4000-8000-0000000099';
    await service.from('rfqs').upsert({
      id: otherRfqId,
      requirement_id: otherReqId,
      organization_id: otherOrgId,
      status: 'OPEN',
      reveal_status: 'BLIND',
      title: 'Other RFQ',
      created_by: 'b0000000-0000-4000-8000-000000000001',
    });

    const client = createAnonClient();
    await signInAs(client, 'committee1@greenview.test');

    const { data } = await client.from('rfqs').select('id').eq('id', otherRfqId);

    expect(data?.length ?? 0).toBe(0);
  });

  it('audit_events cannot be updated (append-only)', async () => {
    const service = createServiceClient();
    const { data: inserted } = await service
      .from('audit_events')
      .insert({
        event_type: 'test.append_only',
        entity_type: 'test',
        entity_id: 'test-1',
        payload: {},
        organization_id: SEED.greenviewOrg,
      })
      .select('id')
      .single();

    expect(inserted?.id).toBeTruthy();

    const { error } = await service
      .from('audit_events')
      .update({ event_type: 'hacked' })
      .eq('id', inserted!.id);

    expect(error).not.toBeNull();
  });

  it('committee_votes cannot be updated after insert (immutable)', async () => {
    const service = createServiceClient();
    const committeeProfileId = 'b0000000-0000-4000-8000-000000000002';

    await service.from('rfqs').update({ status: 'EVALUATING' }).eq('id', SEED.borewellRfq);

    const { data: existing } = await service
      .from('committee_votes')
      .select('id')
      .eq('rfq_id', SEED.borewellRfq)
      .eq('profile_id', committeeProfileId)
      .maybeSingle();

    let voteId = existing?.id;

    if (!voteId) {
      const { data: vote, error: insertError } = await service
        .from('committee_votes')
        .insert({
          rfq_id: SEED.borewellRfq,
          profile_id: committeeProfileId,
          recommended_quote_id: SEED.quoteA,
          choice: 'RECOMMEND',
        })
        .select('id')
        .single();

      expect(insertError).toBeNull();
      expect(vote?.id).toBeTruthy();
      voteId = vote!.id;
    }

    const { error } = await service
      .from('committee_votes')
      .update({ choice: 'OPPOSE' })
      .eq('id', voteId);

    expect(error).not.toBeNull();

    // Restore the seeded state — other suites read this shared RFQ.
    await service.from('rfqs').update({ status: 'EVALUATING' }).eq('id', SEED.borewellRfq);
  });
});

describe('RLS security — static guarantees', () => {
  it('quotes_blind view SQL does not select supplier_id', () => {
    const sql = readMigration('00005_blind_views.sql');
    const blindSection = sql.split('quotes_revealed')[0];
    expect(blindSection).not.toContain('q.supplier_id');
    expect(blindSection).not.toContain('s.business_name');
  });

  it('rfq_supplier_networks view SQL exposes only aggregate counts', () => {
    const sql = readMigration('00009_supplier_network_summary.sql');
    const code = sql.replace(/--.*$/gm, '');
    const selectList = code.split('FROM rfq_invitations')[0];
    expect(selectList).not.toContain('ri.supplier_id');
    expect(selectList).not.toContain('anonymous_label');
    expect(selectList).not.toContain('business_name');
    expect(selectList).not.toContain('s.source AS');
    expect(code).toContain('security_barrier = true');
  });

  it('view network mapping matches supplierSourceToNetwork for every source', () => {
    const code = readMigration('00009_supplier_network_summary.sql').replace(/--.*$/gm, '');
    const caseBlock = code.slice(code.indexOf('CASE s.source'), code.indexOf('END AS network'));

    for (const source of SUPPLIER_SOURCES) {
      const expected = supplierSourceToNetwork(source);
      const branch = new RegExp(`WHEN '${source}' THEN '([A-Z_]+)'`).exec(caseBlock);
      // Sources with no explicit branch must fall through to the ELSE default.
      expect(branch?.[1] ?? 'DIRECT', source).toBe(expected);
    }

    expect(caseBlock).toContain("ELSE 'DIRECT'");
  });

  it('migration 00169 and 00170 define financial security triggers, RLS policies, and idempotency guarantees', () => {
    const sql169 = readMigration('00169_phase5c1_payment_allocations_and_partial_settlement.sql');
    const sql170 = readMigration('00170_phase5c1_h2_idempotency_and_atomic_rpc.sql');
    
    expect(sql169).toContain('protect_payment_financial_fields');
    expect(sql169).toContain('payment_allocations_modify');
    expect(sql169).toContain('payments_update');
    expect(sql169).toContain('payments_insert');
    expect(sql169).toContain('validate_payment_allocation_integrity');
    expect(sql169).toContain('record_invoice_payment_atomic');
    expect(sql169).not.toContain('+ 0.05');

    expect(sql170).toContain('idx_payments_gateway_event_id_unique');
    expect(sql170).toContain('record_invoice_payment_atomic');
    expect(sql170).toContain('SECURITY DEFINER');
    expect(sql170).toContain('search_path = public, private, pg_temp');
    expect(sql170).toContain('idempotent_replay');
  });
});
