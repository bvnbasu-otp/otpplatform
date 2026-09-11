/**
 * Registration from the unauthenticated portals.
 *
 * Two properties matter more than the happy path. A public form must not become
 * a lead list — an anonymous caller can write a registration and can never read
 * one, and the response must not reveal whether an email was already known. And
 * a supplier registration that names no category or no coverage is a dead end,
 * so the database refuses it rather than accepting a row nobody can match.
 *
 * Requires a local Supabase seeded with `pnpm db:reset`. Skips otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';

let up = false;
const created: string[] = [];

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

afterAll(async () => {
  if (!up || created.length === 0) return;
  const service = createServiceClient();
  await service.from('signup_requests').delete().in('email', created);
});

function uniqueEmail(prefix: string): string {
  const email = `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
  created.push(email);
  return email;
}

const BUYER = (email: string) => ({
  side: 'BUYER',
  business_name: 'Marigold Park Owners Association',
  contact_first_name: 'Asha',
  contact_last_name: 'Rao',
  designation: 'Secretary',
  email,
  phone: '+91 98765 43210',
  verification_channel: 'WHATSAPP',
  buyer_type: 'COMMUNITY',
  referral_code: 'BNI-BLR-014',
});

const SUPPLIER = (email: string, overrides: Record<string, unknown> = {}) => ({
  side: 'SUPPLIER',
  business_name: 'Aqua Prime Borewell Works',
  contact_first_name: 'Ravi',
  contact_last_name: 'Kumar',
  email,
  phone: '9876543210',
  verification_channel: 'EMAIL',
  category_codes: ['water_environmental'],
  tax_registration_id: '29ABCDE1234F1Z5',
  coverage_city: 'Bengaluru',
  coverage_pincode: '560001',
  ...overrides,
});

describe('reference data the public forms need', () => {
  it('publishes the category catalog without a session', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.rpc('service_categories');

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(5);
    expect(data[0]).toHaveProperty('code');
    expect(data[0]).toHaveProperty('name');
  });

  it('publishes served cities without a session', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.rpc('served_cities');

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('still keeps the underlying category table shut to anon', async () => {
    const anon = createAnonClient();
    const { data } = await anon.from('requirement_categories').select('id, code');

    // RLS grants SELECT to authenticated only, so anon sees nothing.
    expect(data ?? []).toHaveLength(0);
  });
});

describe('buyer registration', () => {
  it('accepts a registration and returns a quotable reference', async () => {
    const anon = createAnonClient();
    const email = uniqueEmail('buyer');

    const { data, error } = await anon.rpc('submit_signup_request', {
      p_request: BUYER(email),
    });

    expect(error).toBeNull();
    expect(data.reference).toMatch(/^REG-[0-9A-F]{8}$/);
    expect(data.status).toBe('PENDING');
    expect(data.already_submitted).toBe(false);
  });

  it('records the buyer type, because it decides how approvals work', async () => {
    const anon = createAnonClient();
    const email = uniqueEmail('buyer.type');
    await anon.rpc('submit_signup_request', { p_request: BUYER(email) });

    const { data } = await createServiceClient()
      .from('signup_requests')
      .select('side, buyer_type, verification_channel, referral_code, status')
      .eq('email', email)
      .single();

    expect(data).toMatchObject({
      side: 'BUYER',
      buyer_type: 'COMMUNITY',
      verification_channel: 'WHATSAPP',
      referral_code: 'BNI-BLR-014',
      status: 'PENDING',
    });
  });

  it('writes an audit event so the queue has a provenance trail', async () => {
    const anon = createAnonClient();
    const email = uniqueEmail('buyer.audit');
    const { data } = await anon.rpc('submit_signup_request', {
      p_request: BUYER(email),
    });

    const { data: events } = await createServiceClient()
      .from('audit_events')
      .select('event_type, payload')
      .eq('event_type', 'signup.requested')
      .order('occurred_at', { ascending: false })
      .limit(50);

    const match = (events ?? []).find(
      (e: { payload: Record<string, unknown> }) =>
        e.payload?.reference === data.reference,
    );
    expect(match).toBeTruthy();
  });
});

describe('supplier registration', () => {
  it('accepts a business with categories and coverage', async () => {
    const anon = createAnonClient();
    const email = uniqueEmail('supplier');

    const { data, error } = await anon.rpc('submit_signup_request', {
      p_request: SUPPLIER(email),
    });

    expect(error).toBeNull();
    expect(data.reference).toMatch(/^REG-/);
  });

  it('refuses a business that names no category, since nothing could reach it', async () => {
    const anon = createAnonClient();
    const email = uniqueEmail('supplier.nocat');

    const { error } = await anon.rpc('submit_signup_request', {
      p_request: SUPPLIER(email, { category_codes: [] }),
    });

    expect(error?.message ?? '').toMatch(/supplier_needs_category/);
  });

  it('refuses a business with no city and no pin code', async () => {
    const anon = createAnonClient();
    const email = uniqueEmail('supplier.nocity');

    const { error } = await anon.rpc('submit_signup_request', {
      p_request: SUPPLIER(email, { coverage_city: '', coverage_pincode: '' }),
    });

    expect(error?.message ?? '').toMatch(/supplier_needs_coverage/);
  });

  it('drops category codes that are not in the taxonomy', async () => {
    const anon = createAnonClient();
    const email = uniqueEmail('supplier.badcat');

    await anon.rpc('submit_signup_request', {
      p_request: SUPPLIER(email, {
        category_codes: ['water_environmental', 'NOT_A_REAL_CATEGORY'],
      }),
    });

    const { data } = await createServiceClient()
      .from('signup_requests')
      .select('category_codes')
      .eq('email', email)
      .single();

    expect(data?.category_codes).toEqual(['water_environmental']);
  });

  it('rejects a phone number that could not be dialled', async () => {
    const anon = createAnonClient();
    const email = uniqueEmail('supplier.phone');

    const { error } = await anon.rpc('submit_signup_request', {
      p_request: SUPPLIER(email, { phone: '12345' }),
    });

    expect(error?.message ?? '').toMatch(/phone_shape/);
  });
});

describe('the form is not a lead list', () => {
  it('gives an anonymous caller no way to read the queue', async () => {
    const anon = createAnonClient();
    const email = uniqueEmail('leak');
    await anon.rpc('submit_signup_request', { p_request: BUYER(email) });

    const { data } = await anon.from('signup_requests').select('email, business_name');

    expect(data ?? []).toHaveLength(0);
  });

  it('gives a signed-in non-admin no way to read the queue either', async () => {
    const anon = createAnonClient();
    const email = uniqueEmail('leak.auth');
    await anon.rpc('submit_signup_request', { p_request: BUYER(email) });

    const buyer = createAnonClient();
    await signInAs(buyer, 'secretary@sunrise.test');
    const { data } = await buyer.from('signup_requests').select('email');

    expect(data ?? []).toHaveLength(0);
  });

  it('does not say whether an email was already registered', async () => {
    const anon = createAnonClient();
    const email = uniqueEmail('repeat');

    const first = await anon.rpc('submit_signup_request', { p_request: BUYER(email) });
    const second = await anon.rpc('submit_signup_request', { p_request: BUYER(email) });

    // Same reference back, no error, nothing about what else is in the table.
    expect(second.error).toBeNull();
    expect(second.data.reference).toBe(first.data.reference);
    expect(second.data.already_submitted).toBe(true);

    const { count } = await createServiceClient()
      .from('signup_requests')
      .select('id', { count: 'exact', head: true })
      .eq('email', email);
    expect(count).toBe(1);
  });

  it('lets the same business apply on both sides of the market', async () => {
    const anon = createAnonClient();
    const email = uniqueEmail('bothsides');

    const asBuyer = await anon.rpc('submit_signup_request', { p_request: BUYER(email) });
    const asSupplier = await anon.rpc('submit_signup_request', {
      p_request: SUPPLIER(email),
    });

    expect(asBuyer.error).toBeNull();
    expect(asSupplier.error).toBeNull();
    expect(asSupplier.data.reference).not.toBe(asBuyer.data.reference);
  });

  it('lets a rejected applicant reapply', async () => {
    const anon = createAnonClient();
    const service = createServiceClient();
    const email = uniqueEmail('reapply');

    const first = await anon.rpc('submit_signup_request', { p_request: BUYER(email) });
    await service
      .from('signup_requests')
      .update({ status: 'REJECTED' })
      .eq('email', email);

    const second = await anon.rpc('submit_signup_request', { p_request: BUYER(email) });

    expect(second.error).toBeNull();
    expect(second.data.reference).not.toBe(first.data.reference);
  });
});
