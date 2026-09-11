/**
 * The intake path, from a buyer's own session.
 *
 * These run as a real signed-in buyer rather than through the service role,
 * because the things most likely to break here are permission-shaped: whether a
 * draft can be saved, whether publishing can create the RFQ it needs, and
 * whether the city list can be read without exposing which supplier covers
 * which pin code.
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

/** A draft the wizard could have produced, minus whatever the test overrides. */
async function createDraft(
  client: ReturnType<typeof createAnonClient>,
  overrides: Record<string, unknown> = {},
) {
  const { data: subcategory } = await client
    .from('requirement_subcategories')
    .select('id, category_id')
    .eq('code', 'motor_rewinding')
    .single();

  const { data, error } = await client
    .from('requirements')
    .insert({
      organization_id: DEMO.orgs.sunrise,
      created_by: await profileId(client),
      requirement_type: 'SERVICE',
      status: 'DRAFT',
      title: 'Borewell motor rewinding',
      description: '12.5 HP submersible motor burnt out, needs rewinding',
      category_id: subcategory!.category_id,
      subcategory_id: subcategory!.id,
      requirement_mode: 'REPAIR_MAINTENANCE',
      attributes: { motor_hp: 12.5 },
      delivery_city: 'Bengaluru',
      required_by_mode: 'WITHIN_DAYS',
      required_by_days: 7,
      ...overrides,
    })
    .select('id, status')
    .single();

  if (error) throw new Error(`draft insert failed: ${error.message}`);
  created.push(data!.id);
  return data!;
}

describe('requirement drafts', () => {
  it('lets a buyer save a draft and pick it up again', async () => {
    const client = await buyerSession();
    const draft = await createDraft(client);

    const { error } = await client
      .from('requirements')
      .update({ quantity: 1, unit: 'NOS', site_notes: 'Gate code 4021' })
      .eq('id', draft.id);

    expect(error).toBeNull();

    const { data: reread } = await client
      .from('requirements')
      .select('status, quantity, unit, site_notes, attributes')
      .eq('id', draft.id)
      .single();

    expect(reread!.status).toBe('DRAFT');
    expect(Number(reread!.quantity)).toBe(1);
    expect(reread!.site_notes).toBe('Gate code 4021');
    expect(reread!.attributes).toMatchObject({ motor_hp: 12.5 });
  });

  it('derives requirement_type from the mode the buyer chose', async () => {
    const client = await buyerSession();
    const draft = await createDraft(client, { requirement_type: 'PRODUCT' });

    const { data } = await client
      .from('requirements')
      .select('requirement_type')
      .eq('id', draft.id)
      .single();

    // REPAIR_MAINTENANCE rolls up to SERVICE regardless of what was submitted.
    expect(data!.requirement_type).toBe('SERVICE');
  });
});

describe('publishing a requirement', () => {
  it('submits the requirement, creates its RFQ and stores normalised weights in one call', async () => {
    const client = await buyerSession();
    const draft = await createDraft(client);

    const { data, error } = await client.rpc('publish_requirement', {
      p_requirement_id: draft.id,
      p_sourcing_mode: 'IDENTITY_PROTECTED',
      p_min_quotes_required: 3,
      p_quote_deadline_days: 7,
      // Two to one, stated the way a buyer would say it.
      p_weights: { price: 2, warranty: 1 },
      p_weights_source: 'CUSTOM',
    });

    expect(error).toBeNull();

    const result = data as { rfqId: string; publicRef: string };
    expect(result.publicRef).toMatch(/^OTP-RFQ-|^RFQ-/);

    const { data: rfq } = await client
      .from('rfqs')
      .select(
        'status, reveal_status, sourcing_mode, min_quotes_required, buyer_anonymous_to_suppliers, evaluation_weights, evaluation_weights_source, quote_deadline',
      )
      .eq('id', result.rfqId)
      .single();

    expect(rfq!.status).toBe('DRAFT');
    expect(rfq!.reveal_status).toBe('BLIND');
    expect(rfq!.sourcing_mode).toBe('IDENTITY_PROTECTED');
    expect(rfq!.min_quotes_required).toBe(3);
    expect(rfq!.buyer_anonymous_to_suppliers).toBe(true);
    expect(rfq!.evaluation_weights_source).toBe('CUSTOM');
    expect(rfq!.evaluation_weights).toEqual({ price: 66.67, warranty: 33.33 });

    const { data: requirement } = await client
      .from('requirements')
      .select('status, published_at')
      .eq('id', draft.id)
      .single();

    expect(requirement!.status).toBe('RFQ_CREATED');
    expect(requirement!.published_at).not.toBeNull();
  });

  it('records the publication in the audit trail', async () => {
    const client = await buyerSession();
    const draft = await createDraft(client);

    await client.rpc('publish_requirement', { p_requirement_id: draft.id });

    const { data } = await createServiceClient()
      .from('audit_events')
      .select('event_type, entity_id, payload')
      .eq('entity_id', draft.id)
      .eq('event_type', 'requirement.published');

    expect(data).toHaveLength(1);
    expect(data![0].payload).toMatchObject({ sourcingMode: 'IDENTITY_PROTECTED' });
  });

  it('names an open enquiry to suppliers and protects an identity-protected one', async () => {
    const client = await buyerSession();
    const draft = await createDraft(client);

    const { data } = await client.rpc('publish_requirement', {
      p_requirement_id: draft.id,
      p_sourcing_mode: 'OPEN_RFQ',
    });

    const { data: rfq } = await client
      .from('rfqs')
      .select('buyer_anonymous_to_suppliers')
      .eq('id', (data as { rfqId: string }).rfqId)
      .single();

    expect(rfq!.buyer_anonymous_to_suppliers).toBe(false);
  });

  it('refuses a requirement that was never classified', async () => {
    const client = await buyerSession();
    const draft = await createDraft(client, {
      category_id: null,
      subcategory_id: null,
    });

    const { error } = await client.rpc('publish_requirement', {
      p_requirement_id: draft.id,
    });

    expect(error?.message).toMatch(/subcategory/i);
  });

  it('refuses to publish the same requirement twice', async () => {
    const client = await buyerSession();
    const draft = await createDraft(client);

    await client.rpc('publish_requirement', { p_requirement_id: draft.id });
    const { error } = await client.rpc('publish_requirement', {
      p_requirement_id: draft.id,
    });

    expect(error).not.toBeNull();
  });

  it('leaves the requirement a draft when publishing is rejected', async () => {
    const client = await buyerSession();
    const draft = await createDraft(client, { subcategory_id: null, category_id: null });

    await client.rpc('publish_requirement', { p_requirement_id: draft.id });

    const { data: requirement } = await client
      .from('requirements')
      .select('status, published_at')
      .eq('id', draft.id)
      .single();

    // The whole publication is one transaction, so a rejected publish must not
    // leave a requirement marked as published with nothing to quote against.
    expect(requirement!.status).toBe('DRAFT');
    expect(requirement!.published_at).toBeNull();

    const { count } = await createServiceClient()
      .from('rfqs')
      .select('id', { count: 'exact', head: true })
      .eq('requirement_id', draft.id);

    expect(count).toBe(0);
  });

  it('refuses a buyer from another organization', async () => {
    const owner = await buyerSession();
    const draft = await createDraft(owner);

    const outsider = createAnonClient();
    await signInAs(outsider, DEMO.logins.kovaiOwner);

    const { error } = await outsider.rpc('publish_requirement', {
      p_requirement_id: draft.id,
    });

    expect(error).not.toBeNull();
  });
});

describe('rfq visibility for the organization that owns it', () => {
  it('returns the inserted row to the buyer who created it', async () => {
    const client = await buyerSession();
    const draft = await createDraft(client);

    // An INSERT ... RETURNING has to satisfy the SELECT policy for a row that
    // does not exist yet. A policy that resolves the organization by reading
    // the table back cannot do that, which is why it reads the column.
    const { data, error } = await client
      .from('rfqs')
      .insert({
        requirement_id: draft.id,
        organization_id: DEMO.orgs.sunrise,
        status: 'DRAFT',
        reveal_status: 'BLIND',
        title: 'RFQ: returning check',
        quote_deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        evaluation_deadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        created_by: await profileId(client),
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });
});

describe('the city list intake offers', () => {
  it('gives a buyer the cities served without giving them the supplier directory', async () => {
    const client = await buyerSession();

    const { data: cities, error } = await client.rpc('served_cities');
    expect(error).toBeNull();

    const names = (cities as { city: string }[]).map((c) => c.city);
    expect(names).toContain('Coimbatore');
    expect(names).toContain('Bengaluru');
    expect(new Set(names).size).toBe(names.length);

    const { data: areas } = await client
      .from('supplier_service_areas')
      .select('supplier_id, city');

    // Which firm covers which area stays the supplier's business.
    expect(areas ?? []).toEqual([]);
  });
});
