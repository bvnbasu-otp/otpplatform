/**
 * Migration 00257: canonical 12-role catalog restoration + signup role resolution.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
} from '../helpers/supabase-local';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE = '00257_canonical_role_catalog_and_signup_provisioning.sql';
const SOURCE_00039 = '00039_role_based_access.sql';
const sql = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');
const sql00039 = readFileSync(resolve(MIGRATIONS_DIR, SOURCE_00039), 'utf8');

const CANONICAL_BUYER = [
  'FACILITY_MANAGER',
  'PROCUREMENT_LEAD',
  'COMMITTEE_MEMBER',
  'OPERATIONS_MANAGER',
  'FINANCE_APPROVER',
  'PROPERTY_OWNER',
  'GENERAL_AUDITOR',
] as const;

const CANONICAL_SUPPLIER = [
  'SUPPLIER_FOUNDER',
  'SUPPLIER_BD_HEAD',
  'SUPPLIER_SALES_MANAGER',
  'SUPPLIER_TECHNICAL_LEAD',
  'SUPPLIER_FINANCE',
] as const;

type RoleCatalogRow = {
  code: string;
  side: string;
  label: string;
  description: string;
  permissions: string[];
  sortOrder: number;
  isActive: boolean;
};

function stripComments(s: string): string {
  return s.replace(/--.*$/gm, '');
}

function parseUserRolesCatalog(source: string): Map<string, RoleCatalogRow> {
  const body = stripComments(source);
  const re =
    /\('([A-Z_]+)',\s*'(BUYER|SUPPLIER)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*ARRAY\[([^\]]+)\]::role_permission\[\],\s*(\d+)(?:,\s*(true|false))?\)/g;
  const map = new Map<string, RoleCatalogRow>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const permissions = m[5]
      .split(',')
      .map((p) => p.replace(/'/g, '').trim())
      .filter(Boolean);
    map.set(m[1], {
      code: m[1],
      side: m[2],
      label: m[3].replace(/''/g, "'"),
      description: m[4].replace(/''/g, "'"),
      permissions,
      sortOrder: Number(m[6]),
      isActive: m[7] === undefined ? true : m[7] === 'true',
    });
  }
  return map;
}

function functionBody(src: string, name: string): string {
  const start = src.lastIndexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('$$', start);
  const close = src.indexOf('$$;', open + 2);
  return src.slice(start, close + 3);
}

const code = stripComments(sql);
const resolveBody = functionBody(code, 'private.resolve_signup_role');
const catalog00039 = parseUserRolesCatalog(sql00039);
const catalog00257 = parseUserRolesCatalog(sql);

describe('Migration 00257 static SQL contract', () => {
  it('follows 00256 and precedes 00258 in the contiguous migration chain', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    const index = files.indexOf(FILE);
    expect(files[index - 1]).toBe('00256_standardize_auth_otp_eight_digits.sql');
    expect(files[index + 1]).toBe('00258_rwa_committee_vote_authority_trigger_order.sql');
    expect(files[index + 2]).toBe('00259_document_reveal_integrity_digest_hmac_parity.sql');
    expect(files.at(-1)).toBe('00259_document_reveal_integrity_digest_hmac_parity.sql');
  });

  it('matches 00039 for all twelve canonical roles (permissions, sort, side, labels)', () => {
    const codes = [...CANONICAL_BUYER, ...CANONICAL_SUPPLIER];
    expect(catalog00257.size).toBeGreaterThanOrEqual(12);
    for (const roleCode of codes) {
      const canonical = catalog00039.get(roleCode);
      const restored = catalog00257.get(roleCode);
      expect(canonical, `${roleCode} missing in 00039 parse`).toBeDefined();
      expect(restored, `${roleCode} missing in 00257 insert`).toBeDefined();
      expect(restored).toMatchObject({
        side: canonical!.side,
        label: canonical!.label,
        description: canonical!.description,
        permissions: canonical!.permissions,
        sortOrder: canonical!.sortOrder,
        isActive: true,
      });
    }
  });

  it('restores all twelve canonical roles idempotently', () => {
    for (const role of [...CANONICAL_BUYER, ...CANONICAL_SUPPLIER]) {
      expect(sql).toContain(`'${role}'`);
    }
    expect(sql).toContain('ON CONFLICT (code) DO UPDATE');
    expect(sql.match(/ON CONFLICT \(code\) DO UPDATE/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('defines private.resolve_signup_role with fail-closed errors', () => {
    expect(code).toContain('CREATE OR REPLACE FUNCTION private.resolve_signup_role');
    expect(resolveBody).toContain('SIGNUP_ROLE_INVALID');
    expect(resolveBody).toContain('SIGNUP_ROLE_UNAVAILABLE');
    expect(resolveBody).toContain('SIGNUP_INDIVIDUAL_ROLE_MISMATCH');
    expect(resolveBody).toContain('SIGNUP_INDIVIDUAL_ROLE_UNAVAILABLE');
    expect(resolveBody).toContain('SIGNUP_ROLE_SIDE_MISMATCH');
    expect(resolveBody).toContain('SIGNUP_ROLE_UNKNOWN');
    expect(resolveBody).not.toMatch(/Wrong-side or unknown explicit codes are dropped/);
  });

  it('routes submit_signup_request and provision through resolve_signup_role', () => {
    expect(code).toContain('v_role := private.resolve_signup_role');
    expect(code).toContain(
      'v_role_code := private.resolve_signup_role(v_req.side, v_req.buyer_type, v_req.role_code)',
    );
    expect(code).not.toMatch(
      /IF NOT EXISTS \(SELECT 1 FROM public\.user_roles WHERE code = v_role_code\) THEN[\s\S]*FACILITY_MANAGER.*SUPPLIER_FOUNDER/,
    );
  });

  it('validates role before auth provisioning in provision_signup_request', () => {
    const provisionStart = code.indexOf('CREATE OR REPLACE FUNCTION private.provision_signup_request');
    const authStep = code.indexOf('INSERT INTO auth.users', provisionStart);
    const resolveStep = code.indexOf('v_role_code := private.resolve_signup_role', provisionStart);
    expect(resolveStep).toBeGreaterThan(0);
    expect(authStep).toBeGreaterThan(0);
    expect(resolveStep).toBeLessThan(authStep);
  });

  it('defaults omitted roles: INDIVIDUAL→PROPERTY_OWNER, COMMUNITY→COMMITTEE_MEMBER, other buyer→FACILITY_MANAGER, supplier→SUPPLIER_FOUNDER', () => {
    expect(resolveBody).toMatch(/p_buyer_type = 'COMMUNITY'[\s\S]*'COMMITTEE_MEMBER'/);
    expect(resolveBody).toMatch(/p_buyer_type = 'INDIVIDUAL'[\s\S]*'PROPERTY_OWNER'/);
    expect(resolveBody).toMatch(/ELSIF p_side = 'BUYER' THEN[\s\S]*'FACILITY_MANAGER'/);
    expect(resolveBody).toMatch(/ELSE[\s\S]*'SUPPLIER_FOUNDER'/);
  });

  it('submit_signup_request body matches 00254 idempotency and buyer allow-list (00257 supersedes inline role SQL)', () => {
    const submit257 = functionBody(code, 'public.submit_signup_request');
    const submit254File = readFileSync(
      resolve(MIGRATIONS_DIR, '00254_individual_signup_property_owner_catalog_and_rpc.sql'),
      'utf8',
    );
    const submit254Body = functionBody(stripComments(submit254File), 'public.submit_signup_request');
    expect(submit257).toContain('SIGNUP_BUYER_TYPE_REJECTED');
    expect(submit257).toContain('already_submitted');
    expect(submit257).toContain('signup.review_required');
    expect(submit254Body).not.toContain('private.resolve_signup_role');
    expect(submit257).toContain('private.resolve_signup_role');
  });
});

describe('Migration 00257 local database behaviour', () => {
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

  it('rejects unknown explicit role_code (fail-closed)', async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc('submit_signup_request', {
      p_request: {
        side: 'BUYER',
        business_name: 'Unknown Role MSME',
        contact_first_name: 'A',
        contact_last_name: 'B',
        email: email('unknown.role'),
        phone: '9876500011',
        buyer_type: 'MSME',
        role_code: 'NOT_A_REAL_ROLE',
      },
    });
    expect(error?.message).toMatch(/SIGNUP_ROLE_UNKNOWN/);
  });

  it('rejects wrong-side explicit role_code for MSME buyer', async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc('submit_signup_request', {
      p_request: {
        side: 'BUYER',
        business_name: 'Side Mismatch MSME',
        contact_first_name: 'Ravi',
        contact_last_name: 'Kumar',
        email: email('buyer.supplier.role'),
        phone: '9876500088',
        buyer_type: 'MSME',
        role_code: 'SUPPLIER_FOUNDER',
      },
    });
    expect(error?.message).toMatch(/SIGNUP_ROLE_SIDE_MISMATCH/);
  });

  it('COMMUNITY with omitted role_code defaults to COMMITTEE_MEMBER', async () => {
    const anon = createAnonClient();
    const service = createServiceClient();
    const addr = email('community.default');
    const { data, error } = await anon.rpc('submit_signup_request', {
      p_request: {
        side: 'BUYER',
        business_name: 'Greenview RWA',
        contact_first_name: 'Asha',
        contact_last_name: 'Rao',
        email: addr,
        phone: '9876500066',
        buyer_type: 'COMMUNITY',
      },
    });
    expect(error).toBeNull();
    expect((data as { status: string }).status).toBe('ONBOARDED');
    const { data: row } = await service.from('signup_requests').select('role_code').eq('email', addr).single();
    expect(row!.role_code).toBe('COMMITTEE_MEMBER');
  });

  it('MSME with omitted role_code defaults to FACILITY_MANAGER', async () => {
    const anon = createAnonClient();
    const service = createServiceClient();
    const addr = email('msme.default');
    const { error } = await anon.rpc('submit_signup_request', {
      p_request: {
        side: 'BUYER',
        business_name: 'Acme Tools Pvt Ltd',
        contact_first_name: 'Neha',
        contact_last_name: 'Shah',
        email: addr,
        phone: '9876500077',
        buyer_type: 'MSME',
      },
    });
    expect(error).toBeNull();
    const { data: row } = await service.from('signup_requests').select('role_code').eq('email', addr).single();
    expect(row!.role_code).toBe('FACILITY_MANAGER');
  });
});

/**
 * Read-only recovery for REG-076B7BE3 (do not execute without operator authorization):
 *
 * SELECT id, status, side, role_code, email, organization_id, supplier_id
 * FROM public.signup_requests WHERE id = '076b7be3-5839-4b5d-a35f-44289c6b5b04';
 *
 * SELECT u.id FROM auth.users u
 * JOIN public.signup_requests sr ON lower(u.email) = lower(sr.email)
 * WHERE sr.id = '076b7be3-5839-4b5d-a35f-44289c6b5b04';
 *
 * SELECT p.id, p.email FROM public.profiles p
 * JOIN public.signup_requests sr ON lower(p.email) = lower(sr.email)
 * WHERE sr.id = '076b7be3-5839-4b5d-a35f-44289c6b5b04';
 *
 * SELECT pr.* FROM public.profile_roles pr
 * JOIN public.profiles p ON p.id = pr.profile_id
 * JOIN public.signup_requests sr ON lower(p.email) = lower(sr.email)
 * WHERE sr.id = '076b7be3-5839-4b5d-a35f-44289c6b5b04';
 *
 * Recovery (after 00257 on hosted): admin_review_signup_request APPROVE or re-run provision
 * only if no duplicate auth/profile exists and status is still PENDING.
 */
