import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
  SEED,
} from '../helpers/supabase-local';

let supabaseUp = false;

describe('audit and performance RLS', () => {
  beforeAll(async () => {
    supabaseUp = await isLocalSupabaseReachable();
  });

  beforeEach((ctx) => {
    if (!supabaseUp) ctx.skip();
  });

  it('manager can read org audit events', async () => {
    const client = createAnonClient();
    await signInAs(client, 'manager@greenview.test');

    const { data, error } = await client
      .from('audit_events')
      .select('id, event_type')
      .eq('organization_id', SEED.greenviewOrg)
      .limit(5);

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it('committee member cannot read audit events', async () => {
    const client = createAnonClient();
    await signInAs(client, 'committee1@greenview.test');

    const { data, error } = await client
      .from('audit_events')
      .select('id')
      .eq('organization_id', SEED.greenviewOrg)
      .limit(1);

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it('org members can read performance records', async () => {
    const client = createAnonClient();
    await signInAs(client, 'manager@greenview.test');

    const { data, error } = await client
      .from('procurement_performance_records')
      .select('id, quoted_total, quality_rating')
      .limit(5);

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it('performance record has expected Greenview seed values', async () => {
    const service = createServiceClient();
    const { data } = await service
      .from('procurement_performance_records')
      .select('quoted_total, actual_total, quality_rating')
      .eq('id', 'e1000001-0000-4000-8000-000000000001')
      .maybeSingle();

    expect(Number(data?.quoted_total)).toBe(9204);
    expect(Number(data?.actual_total)).toBe(9204);
    expect(Number(data?.quality_rating)).toBe(4.5);
  });
});
