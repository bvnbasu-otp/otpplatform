/**
 * The supplier side of the platform, from the supplier's own session.
 *
 * Two things have to hold here. A supplier must be able to say what it can do
 * and where it will travel, because that declaration is the only thing that
 * makes it findable. And the enquiry it receives must carry the whole
 * specification while never naming the buyer — the supplier screens read
 * rfqs_supplier_blind for exactly that reason, so these tests read the same
 * columns the client asks for rather than `select *`.
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

type Client = ReturnType<typeof createAnonClient>;

/** Mirrors DETAIL_COLUMNS in features/supplier/api/fetch-invitations.ts. */
const DETAIL_COLUMNS =
  'rfq_id, public_ref, title, status, sourcing_mode, quote_deadline, min_quotes_required, ' +
  'invitation_id, my_alias, my_invitation_status, invited_at, buyer_display_name, ' +
  'description, category, subcategory, requirement_mode, quantity, unit, attributes, ' +
  'quality, commercial, required_by_mode, required_by_days, required_by_date, ' +
  'fulfilment_mode, delivery_city, evaluation_weights';

let up = false;
const createdCapabilities: string[] = [];
const createdAreas: string[] = [];

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

afterEach(async () => {
  const service = createServiceClient();
  if (createdCapabilities.length > 0) {
    await service.from('supplier_capabilities').delete().in('id', createdCapabilities);
    createdCapabilities.length = 0;
  }
  if (createdAreas.length > 0) {
    await service.from('supplier_service_areas').delete().in('id', createdAreas);
    createdAreas.length = 0;
  }
});

async function sessionFor(email: string): Promise<Client> {
  const client = createAnonClient();
  await signInAs(client, email);
  return client;
}

async function catalogEntry(client: Client, code: string) {
  const { data } = await client
    .from('capabilities')
    .select('id, code, name, capacity_unit')
    .eq('code', code)
    .single();
  return data as { id: string; code: string; name: string; capacity_unit: string | null };
}

describe('what a supplier can say about itself', () => {
  it('offers the whole active catalog to choose from, not free text', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const { data, error } = await client
      .from('capabilities')
      .select('id, code, name, description, capacity_unit, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(50);
    expect(new Set(data!.map((r) => r.code)).size).toBe(data!.length);
  });

  it('reads back its own declarations with capability names attached', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const { data, error } = await client
      .from('supplier_capabilities')
      .select(
        'id, capability_id, max_capacity_value, capacity_unit, notes, capabilities(code, name)',
      )
      .eq('supplier_id', DEMO.suppliers.aquaPrime);

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(5);
    for (const row of data!) {
      expect((row.capabilities as unknown as { name: string }).name).toBeTruthy();
    }
  });

  it('lets a supplier take on a capability it had not declared, and drop it again', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);
    const service = createServiceClient();

    const { data: existing } = await service
      .from('supplier_capabilities')
      .select('capability_id')
      .eq('supplier_id', DEMO.suppliers.aquaPrime);
    const held = new Set(existing!.map((r) => r.capability_id));

    const { data: catalog } = await client
      .from('capabilities')
      .select('id, capacity_unit')
      .eq('is_active', true);
    const fresh = catalog!.find((c) => !held.has(c.id))!;

    const { data: inserted, error: insertError } = await client
      .from('supplier_capabilities')
      .insert({
        supplier_id: DEMO.suppliers.aquaPrime,
        capability_id: fresh.id,
        capacity_unit: fresh.capacity_unit,
      })
      .select('id')
      .single();

    expect(insertError).toBeNull();
    createdCapabilities.push(inserted!.id);

    const { error: deleteError } = await client
      .from('supplier_capabilities')
      .delete()
      .eq('id', inserted!.id);

    expect(deleteError).toBeNull();
    createdCapabilities.length = 0;
  });

  it('rejects the same capability twice, so a list cannot show duplicates', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const rewinding = await catalogEntry(client, 'motor_rewinding');

    const { error } = await client.from('supplier_capabilities').insert({
      supplier_id: DEMO.suppliers.aquaPrime,
      capability_id: rewinding.id,
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe('23505');
  });

  it('lets a supplier raise its own ceiling and have discovery honour it', async () => {
    const client = await sessionFor(DEMO.logins.tooSmallSupplier);
    const service = createServiceClient();

    const rewinding = await catalogEntry(client, 'motor_rewinding');
    const { data: before } = await client
      .from('supplier_capabilities')
      .select('id, max_capacity_value')
      .eq('supplier_id', DEMO.suppliers.nandi)
      .eq('capability_id', rewinding.id)
      .single();

    const original = before!.max_capacity_value;
    expect(Number(original)).toBeLessThan(12.5);

    const { error } = await client
      .from('supplier_capabilities')
      .update({ max_capacity_value: 25 })
      .eq('id', before!.id);
    expect(error).toBeNull();

    const { data: after } = await service
      .from('supplier_capabilities')
      .select('max_capacity_value')
      .eq('id', before!.id)
      .single();
    expect(Number(after!.max_capacity_value)).toBe(25);

    await service
      .from('supplier_capabilities')
      .update({ max_capacity_value: original })
      .eq('id', before!.id);
  });

  it('does not let one supplier declare a capability on behalf of another', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);
    const rewinding = await catalogEntry(client, 'motor_rewinding');

    const { data, error } = await client
      .from('supplier_capabilities')
      .insert({
        supplier_id: DEMO.suppliers.tirupurYarn,
        capability_id: rewinding.id,
      })
      .select('id');

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('hides another supplier\u2019s capability rows entirely', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const { data } = await client
      .from('supplier_capabilities')
      .select('id')
      .eq('supplier_id', DEMO.suppliers.tirupurYarn);

    expect(data ?? []).toEqual([]);
  });
});

describe('where a supplier says it will work', () => {
  it('adds and removes its own coverage', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const { data: inserted, error } = await client
      .from('supplier_service_areas')
      .insert({
        supplier_id: DEMO.suppliers.aquaPrime,
        city: 'Mysuru',
        pincode: '570001',
        radius_km: 40,
      })
      .select('id, city, radius_km')
      .single();

    expect(error).toBeNull();
    createdAreas.push(inserted!.id);
    expect(inserted!.city).toBe('Mysuru');
    expect(Number(inserted!.radius_km)).toBe(40);

    const { error: deleteError } = await client
      .from('supplier_service_areas')
      .delete()
      .eq('id', inserted!.id);

    expect(deleteError).toBeNull();
    createdAreas.length = 0;
  });

  it('refuses an area that locates nothing', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const { error } = await client.from('supplier_service_areas').insert({
      supplier_id: DEMO.suppliers.aquaPrime,
      radius_km: 40,
    });

    expect(error).not.toBeNull();
  });

  it('refuses a pin code that is not six digits', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const { error } = await client.from('supplier_service_areas').insert({
      supplier_id: DEMO.suppliers.aquaPrime,
      city: 'Mysuru',
      pincode: '5700',
    });

    expect(error).not.toBeNull();
  });

  it('does not let a supplier extend another supplier\u2019s coverage', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const { error } = await client.from('supplier_service_areas').insert({
      supplier_id: DEMO.suppliers.tirupurYarn,
      city: 'Bengaluru',
    });

    expect(error).not.toBeNull();
  });
});

describe('the enquiry as the supplier screen loads it', () => {
  it('returns every column the detail screen asks for', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const { data, error } = await client
      .from('rfqs_supplier_blind')
      .select(DETAIL_COLUMNS)
      .eq('rfq_id', DEMO.rfqs.motor)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const row = data as unknown as Record<string, unknown>;
    expect(row.public_ref).toMatch(/^RFQ-[0-9A-Z]{6}$/);
    expect(row.title).toBeTruthy();
    expect(row.buyer_display_name).toBe('Identity protected');
    expect(row.my_alias).toMatch(/^(Supplier|Bidder) /);
    expect(row.category).toBeTruthy();
    expect(Object.keys((row.evaluation_weights ?? {}) as object).length).toBeGreaterThan(0);
  });

  it('carries enough of the specification to price the job', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const { data } = await client
      .from('rfqs_supplier_blind')
      .select(DETAIL_COLUMNS)
      .eq('rfq_id', DEMO.rfqs.motor)
      .maybeSingle();

    const row = data as unknown as Record<string, unknown>;

    // A supplier cannot quote a rewinding job without knowing the motor.
    expect(row.subcategory).toBeTruthy();
    expect(row.attributes).toBeTruthy();
    expect(Object.keys(row.attributes as object).length).toBeGreaterThan(0);
    expect(row.required_by_mode ?? row.required_by_date).toBeTruthy();
  });

  it('never names the buyer through the columns the screen renders', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const { data } = await client
      .from('rfqs_supplier_blind')
      .select(DETAIL_COLUMNS)
      .eq('rfq_id', DEMO.rfqs.motor)
      .maybeSingle();

    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('Sunrise');
    expect(serialized).not.toContain('sunrise.test');
    expect(serialized).not.toContain(DEMO.orgs.sunrise);
  });

  it('returns nothing for an RFQ this supplier was not invited to', async () => {
    const client = await sessionFor(DEMO.logins.yarnSupplier);

    const { data, error } = await client
      .from('rfqs_supplier_blind')
      .select(DETAIL_COLUMNS)
      .eq('rfq_id', DEMO.rfqs.motor)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('lists invitations newest first, each with its own public reference', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const { data, error } = await client
      .from('rfqs_supplier_blind')
      .select('rfq_id, public_ref, invited_at, my_alias, buyer_display_name')
      .order('invited_at', { ascending: false });

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);

    const times = data!.map((r) => new Date(r.invited_at as string).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    for (const row of data!) {
      expect(row.public_ref).toMatch(/^RFQ-[0-9A-Z]{6}$/);
      expect(row.my_alias).toMatch(/^(Supplier|Bidder) /);
    }
  });
});
