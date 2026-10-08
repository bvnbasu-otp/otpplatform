/**
 * Migration 00254: Individual signup PROPERTY_OWNER catalog + RPC safety.
 * Static SQL contract plus optional local Postgres when reachable.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
} from '../helpers/supabase-local';

const MIGRATIONS_DIR = resolve('supabase/migrations');
const FILE = '00254_individual_signup_property_owner_catalog_and_rpc.sql';
const sql = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');

function stripComments(s: string): string {
  return s.replace(/--.*$/gm, '');
}

function functionBody(src: string, name: string): string {
  const start = src.lastIndexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('$$', start);
  const close = src.indexOf('$$;', open + 2);
  return src.slice(start, close + 3);
}

const code = stripComments(sql);
const submitBody = functionBody(code, 'public.submit_signup_request');

describe('Migration 00254 static SQL contract', () => {
  it('follows 00253 in the contiguous migration chain', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    const index = files.indexOf(FILE);
    expect(index).toBeGreaterThan(0);
    expect(files[index - 1]).toBe('00253_cancelled_rfq_allowance_and_utgst.sql');
  });

  it('restores canonical PROPERTY_OWNER without weakening assert_signup_role_side', () => {
    expect(code).toContain("'PROPERTY_OWNER'");
    expect(code).toContain("side = EXCLUDED.side");
    expect(code).not.toMatch(/CREATE OR REPLACE FUNCTION private\.assert_signup_role_side/i);
    expect(submitBody).not.toMatch(/v_role\s*:=\s*'PROPERTY_OWNER'/);
    expect(submitBody).toContain('SIGNUP_INDIVIDUAL_ROLE_UNAVAILABLE');
    expect(submitBody).toContain('SIGNUP_INDIVIDUAL_ROLE_MISMATCH');
  });
});

describe('Migration 00254 local database behaviour', () => {
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

  function email(prefix: string): string {
    const e = `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
    created.push(e);
    return e;
  }

  const individual = (overrides: Record<string, unknown> = {}) => ({
    side: 'BUYER',
    contact_first_name: 'Isha',
    contact_last_name: 'Mehta',
    email: email('ind.signup'),
    phone: '9876500099',
    buyer_type: 'INDIVIDUAL',
    verification_channel: 'EMAIL',
    ...overrides,
  });

  it('INDIVIDUAL with explicit PROPERTY_OWNER succeeds', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.rpc('submit_signup_request', {
      p_request: individual({ role_code: 'PROPERTY_OWNER' }),
    });
    expect(error).toBeNull();
    expect((data as { status: string }).status).toBe('ONBOARDED');
  });

  it('INDIVIDUAL with omitted role_code resolves to PROPERTY_OWNER when catalog is valid', async () => {
    const anon = createAnonClient();
    const service = createServiceClient();
    const req = individual();
    const { data, error } = await anon.rpc('submit_signup_request', { p_request: req });
    expect(error).toBeNull();
    expect((data as { status: string }).status).toBe('ONBOARDED');

    const { data: row } = await service
      .from('signup_requests')
      .select('role_code, buyer_type')
      .eq('email', req.email)
      .single();
    expect(row).toMatchObject({ role_code: 'PROPERTY_OWNER', buyer_type: 'INDIVIDUAL' });
  });

  it('INDIVIDUAL rejects a non–Property Owner buyer role', async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc('submit_signup_request', {
      p_request: individual({ role_code: 'FINANCE_APPROVER' }),
    });
    expect(error?.message).toMatch(/SIGNUP_INDIVIDUAL_ROLE_MISMATCH/);
  });

  it('MSME with a supplier-side role_code is accepted but the role is dropped (not granted)', async () => {
    const anon = createAnonClient();
    const service = createServiceClient();
    const addr = email('buyer.supplier.role');
    const { error } = await anon.rpc('submit_signup_request', {
      p_request: {
        side: 'BUYER',
        business_name: 'Side Mismatch MSME',
        contact_first_name: 'Ravi',
        contact_last_name: 'Kumar',
        email: addr,
        phone: '9876500088',
        buyer_type: 'MSME',
        role_code: 'SUPPLIER_FOUNDER',
      },
    });
    expect(error).toBeNull();
    const { data: row } = await service.from('signup_requests').select('role_code').eq('email', addr).single();
    expect(row!.role_code).toBeNull();
  });

  it('INDIVIDUAL with a supplier-side role_code cannot keep that role (resolves to Property Owner)', async () => {
    const anon = createAnonClient();
    const service = createServiceClient();
    const req = individual({ role_code: 'SUPPLIER_FOUNDER' });
    const { data, error } = await anon.rpc('submit_signup_request', { p_request: req });
    expect(error).toBeNull();
    expect((data as { status: string }).status).toBe('ONBOARDED');
    const { data: row } = await service
      .from('signup_requests')
      .select('role_code')
      .eq('email', req.email)
      .single();
    expect(row!.role_code).toBe('PROPERTY_OWNER');
  });

  it('fails explicitly when PROPERTY_OWNER catalog row is inactive (no blind assign)', async () => {
    const service = createServiceClient();
    await service
      .from('user_roles')
      .update({ is_active: false })
      .eq('code', 'PROPERTY_OWNER');

    try {
      const anon = createAnonClient();
      const { error } = await anon.rpc('submit_signup_request', { p_request: individual() });
      expect(error?.message).toMatch(/SIGNUP_INDIVIDUAL_ROLE_UNAVAILABLE/);
    } finally {
      await service.from('user_roles').update({ is_active: true }).eq('code', 'PROPERTY_OWNER');
    }
  });

  it('COMMUNITY buyer signup still works', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.rpc('submit_signup_request', {
      p_request: {
        side: 'BUYER',
        business_name: 'Greenview RWA',
        contact_first_name: 'Asha',
        contact_last_name: 'Rao',
        email: email('community.signup'),
        phone: '9876500066',
        buyer_type: 'COMMUNITY',
        role_code: 'COMMITTEE_MEMBER',
      },
    });
    expect(error).toBeNull();
    expect((data as { status: string }).status).toBe('ONBOARDED');
  });

  it('MSME buyer signup with chosen role still works', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.rpc('submit_signup_request', {
      p_request: {
        side: 'BUYER',
        business_name: 'Acme Tools Pvt Ltd',
        contact_first_name: 'Neha',
        contact_last_name: 'Shah',
        email: email('msme.signup'),
        phone: '9876500077',
        buyer_type: 'MSME',
        role_code: 'PROCUREMENT_LEAD',
      },
    });
    expect(error).toBeNull();
    expect((data as { status: string }).status).toBe('ONBOARDED');
  });
});
