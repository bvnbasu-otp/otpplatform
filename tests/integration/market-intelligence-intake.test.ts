/**
 * Market intelligence snapshot on requirement publish.
 *
 * The buyer-facing promise is simple: every requirement carries the
 * benchmark that was current on the day it was published, so downstream
 * decisions can always be measured against the same numbers the buyer saw
 * at review time. These tests cover:
 *
 * - the lookup ladder (subcategory+city → subcategory → category+city →
 *   category → null) prefers the most specific match,
 * - publish_requirement stamps the snapshot onto the requirement row,
 * - the snapshot is immutable after that (protecting the audit trail),
 * - the publish audit event names the scope and key it matched,
 * - publishing a requirement in an unknown subcategory still succeeds and
 *   records the empty benchmark honestly rather than fabricating one.
 *
 * Requires a local Supabase seeded with `pnpm db:reset`. Skips otherwise.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';

let up = false;
const created: string[] = [];

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

afterEach(async () => {
  if (created.length === 0) return;
  const service = createServiceClient();
  await service.from('requirements').delete().in('id', created);
  created.length = 0;
});

async function buyerSession() {
  const client = createAnonClient();
  await signInAs(client, DEMO.logins.sunriseManager);
  return client;
}

async function profileId(client: ReturnType<typeof createAnonClient>) {
  const {
    data: { user },
  } = await client.auth.getUser();
  const { data } = await client
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user!.id)
    .single();
  return data!.id as string;
}

async function createDraft(
  client: ReturnType<typeof createAnonClient>,
  subcategoryCode: string,
  overrides: Record<string, unknown> = {},
) {
  const { data: subcategory } = await client
    .from('requirement_subcategories')
    .select('id, category_id')
    .eq('code', subcategoryCode)
    .single();

  if (!subcategory) {
    throw new Error(`taxonomy is missing subcategory ${subcategoryCode}`);
  }

  const { data, error } = await client
    .from('requirements')
    .insert({
      organization_id: DEMO.orgs.sunrise,
      created_by: await profileId(client),
      requirement_type: 'SERVICE',
      status: 'DRAFT',
      title: 'Test requirement',
      description: 'Fixture for market intelligence tests',
      category_id: subcategory.category_id,
      subcategory_id: subcategory.id,
      requirement_mode: 'REPAIR_MAINTENANCE',
      delivery_city: 'Bengaluru',
      required_by_mode: 'WITHIN_DAYS',
      required_by_days: 7,
      ...overrides,
    })
    .select('id')
    .single();

  if (error) throw new Error(`draft insert failed: ${error.message}`);
  created.push(data!.id);
  return data!;
}

describe('lookup_market_intelligence ladder', () => {
  it('prefers subcategory + city over any wider match', async () => {
    const service = createServiceClient();
    const { data } = await service.rpc('lookup_market_intelligence', {
      p_subcategory_code: 'motor_rewinding',
      p_category_code: 'machinery_engineering',
      p_city: 'Bengaluru',
    });

    expect(data).not.toBeNull();
    expect((data as { matchedScope: string }).matchedScope).toBe('subcategory_city');
    expect((data as { matchedKey: string }).matchedKey).toBe('motor_rewinding');
    expect((data as { matchedCity: string }).matchedCity).toBe('Bengaluru');
  });

  it('falls back to subcategory alone when the city has no baseline', async () => {
    const service = createServiceClient();
    const { data } = await service.rpc('lookup_market_intelligence', {
      p_subcategory_code: 'motor_rewinding',
      p_category_code: 'machinery_engineering',
      p_city: 'Some Town Nobody Benchmarks',
    });

    expect(data).not.toBeNull();
    expect((data as { matchedScope: string }).matchedScope).toBe('subcategory');
    expect((data as { matchedKey: string }).matchedKey).toBe('motor_rewinding');
  });

  it('falls back to category when there is no subcategory baseline at all', async () => {
    const service = createServiceClient();
    const { data } = await service.rpc('lookup_market_intelligence', {
      p_subcategory_code: 'subcategory_with_no_benchmark_ever',
      p_category_code: 'machinery_engineering',
      p_city: null,
    });

    expect(data).not.toBeNull();
    expect((data as { matchedScope: string }).matchedScope).toBe('category');
    expect((data as { matchedKey: string }).matchedKey).toBe('machinery_engineering');
  });

  it('returns null when nothing on the ladder matches', async () => {
    const service = createServiceClient();
    const { data } = await service.rpc('lookup_market_intelligence', {
      p_subcategory_code: 'not_a_real_subcategory',
      p_category_code: 'not_a_real_category',
      p_city: null,
    });

    expect(data).toBeNull();
  });
});

describe('publish_requirement snapshot', () => {
  it('stamps the matching snapshot onto the requirement', async () => {
    const client = await buyerSession();
    const draft = await createDraft(client, 'motor_rewinding');

    const { error } = await client.rpc('publish_requirement', {
      p_requirement_id: draft.id,
    });
    expect(error).toBeNull();

    const { data: row } = await createServiceClient()
      .from('requirements')
      .select('market_intel_snapshot')
      .eq('id', draft.id)
      .single();

    expect(row!.market_intel_snapshot).not.toBeNull();
    const snapshot = row!.market_intel_snapshot as {
      matchedKey: string;
      matchedScope: string;
      matchedCity: string | null;
      capturedAt: string;
      historicalPriceMin: number;
    };
    expect(snapshot.matchedKey).toBe('motor_rewinding');
    expect(snapshot.matchedScope).toBe('subcategory_city');
    expect(snapshot.matchedCity).toBe('Bengaluru');
    expect(snapshot.capturedAt).toEqual(expect.any(String));
    expect(snapshot.historicalPriceMin).toBeGreaterThan(0);
  });

  it('names the scope and key on the audit event', async () => {
    const client = await buyerSession();
    const draft = await createDraft(client, 'motor_rewinding');

    await client.rpc('publish_requirement', { p_requirement_id: draft.id });

    const { data } = await createServiceClient()
      .from('audit_events')
      .select('payload')
      .eq('entity_id', draft.id)
      .eq('event_type', 'requirement.published');

    expect(data).toHaveLength(1);
    expect(data![0].payload).toMatchObject({
      marketIntelScope: 'subcategory_city',
      marketIntelKey: 'motor_rewinding',
    });
  });

  it('records marketIntelScope="none" when nothing on the ladder matches', async () => {
    // Publish under a category that has no baseline at all so both rungs
    // return null. Category-level baselines exist for machinery_engineering,
    // so we pick one that does not: general_other has no seeded baseline.
    const service = createServiceClient();
    const { data: subcategory } = await service
      .from('requirement_subcategories')
      .select('id, category_id, categories:requirement_categories!inner(code)')
      .eq('categories.code', 'general_other')
      .limit(1)
      .maybeSingle();

    if (!subcategory) {
      // No seeded subcategory under general_other — skip rather than invent.
      return;
    }

    const client = await buyerSession();
    const { data: draft, error: insErr } = await client
      .from('requirements')
      .insert({
        organization_id: DEMO.orgs.sunrise,
        created_by: await profileId(client),
        requirement_type: 'SERVICE',
        status: 'DRAFT',
        title: 'Uncategorised work',
        description: 'Something with no benchmark yet',
        category_id: subcategory.category_id,
        subcategory_id: subcategory.id,
        requirement_mode: 'REPAIR_MAINTENANCE',
        delivery_city: 'Bengaluru',
        required_by_mode: 'WITHIN_DAYS',
        required_by_days: 7,
      })
      .select('id')
      .single();
    if (insErr) throw new Error(insErr.message);
    created.push(draft!.id);

    const { error: pubErr } = await client.rpc('publish_requirement', {
      p_requirement_id: draft!.id,
    });
    expect(pubErr).toBeNull();

    const { data: row } = await service
      .from('requirements')
      .select('market_intel_snapshot')
      .eq('id', draft!.id)
      .single();
    expect(row!.market_intel_snapshot).toBeNull();

    const { data: audit } = await service
      .from('audit_events')
      .select('payload')
      .eq('entity_id', draft!.id)
      .eq('event_type', 'requirement.published');
    expect(audit![0].payload).toMatchObject({ marketIntelScope: 'none' });
  });

  it('refuses to rewrite the snapshot after it has been stamped', async () => {
    const client = await buyerSession();
    const draft = await createDraft(client, 'motor_rewinding');

    await client.rpc('publish_requirement', { p_requirement_id: draft.id });

    // Even the service role must not be able to overwrite an existing
    // snapshot — the trigger fires on every UPDATE regardless of who runs it.
    const service = createServiceClient();
    const { error } = await service
      .from('requirements')
      .update({ market_intel_snapshot: { tampered: true } })
      .eq('id', draft.id);

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/immutable|snapshot|locked/i);
  });
});
