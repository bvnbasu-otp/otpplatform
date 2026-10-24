/**
 * 00276 server-authoritative legal acceptance (audit finding EULA-1).
 *
 * The behavioural cases run inside a rolled-back transaction against the local
 * PostgreSQL used for SQL parity (127.0.0.1:54322). When that database is not
 * reachable or lacks 00276 they log a skip reason, matching the other
 * loopback-PostgreSQL tests; the static cases always run.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { asLegalReviewer, catalogAcceptance, currentLegal } from '../helpers/legal-evidence-fixture';

const MIGRATION = resolve('supabase/migrations/00276_server_authoritative_legal_acceptance.sql');
const CLIENT_HASH = 'sha256:7c8b0303d8a9e7019cf39e2df95000be05e527d91d8e13711311ffb43c683b5d';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: Number(process.env.LOCAL_PG_PORT ?? 54322),
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

describe('00276 legal acceptance - static contract', () => {
  const sql = readFileSync(MIGRATION, 'utf8').replace(/--.*$/gm, '');

  it('never consumes a client-supplied acceptance timestamp', () => {
    expect(sql).not.toMatch(/p_request\s*->>?\s*'accepted_at'/);
    expect(sql).toMatch(/eula_accepted_at[\s\S]*now\(\)/);
  });

  it('requires an explicit JSON true and the current catalogue version at signup', () => {
    expect(sql).toContain("'true'::jsonb");
    expect(sql).toContain('EULA_NOT_ACCEPTED');
    expect(sql).toContain('EULA_VERSION_STALE');
  });

  it('keeps acceptance evidence append-only and not directly writable by clients', () => {
    expect(sql).toContain('LEGAL_ACCEPTANCE_IMMUTABLE');
    expect(sql).toMatch(/REVOKE ALL ON public\.legal_acceptances FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT SELECT ON public\.legal_acceptances TO authenticated/);
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)[^;]*legal_acceptances[^;]*TO[^;]*authenticated/i);
  });

  it('does not backfill acceptances for existing accounts', () => {
    expect(sql).not.toMatch(/INSERT INTO public\.legal_acceptances[\s\S]{0,200}FROM public\.profiles/);
  });
});

async function connect(): Promise<Client | null> {
  const client = new Client(LOCAL_POSTGRES);
  try {
    await client.connect();
  } catch {
    console.warn('[SKIP REASON] local PostgreSQL is unavailable at 127.0.0.1:54322');
    return null;
  }
  const installed = await client.query(
    `SELECT to_regclass('public.legal_acceptances') AS t,
            to_regprocedure('public.my_legal_acceptance_status()') AS f`,
  );
  if (!installed.rows[0].t || !installed.rows[0].f) {
    console.warn('[SKIP REASON] local PostgreSQL does not have migration 00276 applied');
    await client.end();
    return null;
  }
  return client;
}

async function expectRpcError(client: Client, text: string, params: unknown[], code: string) {
  await client.query('SAVEPOINT expect_error');
  let message = '';
  try {
    await client.query(text, params);
  } catch (error) {
    message = (error as Error).message;
  }
  await client.query('ROLLBACK TO SAVEPOINT expect_error');
  expect(message).toContain(code);
}

function signupPayload(overrides: Record<string, unknown> = {}) {
  return {
    side: 'BUYER',
    business_name: 'Self',
    contact_first_name: 'Legal',
    contact_last_name: 'Tester',
    email: `legal-${randomUUID()}@example.test`,
    phone: '9876543210',
    verification_channel: 'EMAIL',
    buyer_type: 'INDIVIDUAL',
    role_code: 'PROPERTY_OWNER',
    coverage_city: 'Bengaluru',
    coverage_pincode: '560001',
    ...buyerAcceptance,
    ...overrides,
  };
}

let buyerAcceptance = { eula_accepted: true, eula_version: '', document_hash: '' };
let supplierAcceptance = { eula_accepted: true, eula_version: '', document_hash: '' };

async function freeze(client: Client) {
  buyerAcceptance = await catalogAcceptance(client, 'BUYER');
  supplierAcceptance = await catalogAcceptance(client, 'SUPPLIER');
}

const SUBMIT = 'SELECT public.submit_signup_request($1::jsonb) AS result';

describe('00276 legal acceptance - database outcomes (rolled back)', () => {
  it('rejects missing, forged-version and forged-hash acceptance without creating a request', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      await freeze(client);
      await client.query('SET LOCAL ROLE anon');

      const base = signupPayload();
      const { eula_accepted: _drop, ...missing } = base;
      await expectRpcError(client, SUBMIT, [JSON.stringify(missing)], 'EULA_NOT_ACCEPTED');
      await expectRpcError(
        client, SUBMIT, [JSON.stringify({ ...base, eula_accepted: 'yes' })], 'EULA_NOT_ACCEPTED',
      );
      await expectRpcError(
        client, SUBMIT, [JSON.stringify({ ...base, eula_accepted: false })], 'EULA_NOT_ACCEPTED',
      );
      await expectRpcError(
        client, SUBMIT, [JSON.stringify({ ...base, eula_version: 'v0.1-forged' })], 'EULA_VERSION_STALE',
      );
      await expectRpcError(
        client, SUBMIT, [JSON.stringify({ ...base, document_hash: `sha256:${'0'.repeat(64)}` })], 'EULA_VERSION_STALE',
      );
      const { document_hash: _hash, ...missingHash } = base;
      await expectRpcError(client, SUBMIT, [JSON.stringify(missingHash)], 'EULA_VERSION_STALE');

      await client.query('RESET ROLE');
      const rows = await client.query('SELECT 1 FROM public.signup_requests WHERE lower(email) = lower($1)', [base.email]);
      expect(rows.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('persists acceptance against the provisioned profile with a server timestamp and catalogue hash', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      await freeze(client);
      await client.query('SET LOCAL ROLE anon');
      const payload = signupPayload({ accepted_at: '2001-01-01T00:00:00.000Z' });
      const submitted = await client.query(SUBMIT, [JSON.stringify(payload)]);
      expect(submitted.rows[0].result.status).toBe('ONBOARDED');
      await client.query('RESET ROLE');

      const request = await client.query(
        `SELECT eula_agreement_type, eula_version, eula_document_hash, eula_accepted_at,
                abs(extract(epoch FROM (now() - eula_accepted_at))) AS age_seconds
         FROM public.signup_requests WHERE lower(email) = lower($1)`,
        [payload.email],
      );
      expect(request.rows[0].eula_agreement_type).toBe('CUSTOMER_EULA');
      expect(request.rows[0].eula_version).toBe(buyerAcceptance.eula_version);
      expect(Number(request.rows[0].age_seconds)).toBeLessThan(60);

      const acceptance = await client.query(
        `SELECT a.agreement_type, a.version, a.document_hash, a.acceptance_source, a.signup_request_id
         FROM public.legal_acceptances a
         JOIN public.profiles p ON p.id = a.profile_id
         WHERE lower(p.email) = lower($1)`,
        [payload.email],
      );
      expect(acceptance.rowCount).toBe(1);
      expect(acceptance.rows[0]).toMatchObject({
        agreement_type: 'CUSTOMER_EULA',
        version: buyerAcceptance.eula_version,
        document_hash: buyerAcceptance.document_hash,
        acceptance_source: 'SIGNUP',
      });

      // A repeated submission neither creates a second request nor a second acceptance.
      await client.query('SET LOCAL ROLE anon');
      await client.query(SUBMIT, [JSON.stringify(payload)]);
      await client.query('RESET ROLE');
      const counts = await client.query(
        `SELECT (SELECT count(*) FROM public.signup_requests WHERE lower(email) = lower($1))::int AS requests,
                (SELECT count(*) FROM public.legal_acceptances a JOIN public.profiles p ON p.id = a.profile_id
                  WHERE lower(p.email) = lower($1))::int AS acceptances`,
        [payload.email],
      );
      expect(counts.rows[0]).toEqual({ requests: 1, acceptances: 1 });
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('records the supplier agreement type for supplier signups', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      await freeze(client);
      const category = await client.query('SELECT code FROM public.requirement_categories WHERE is_active LIMIT 1');
      expect(category.rowCount).toBe(1);
      await client.query('SET LOCAL ROLE anon');
      const payload = signupPayload({
        side: 'SUPPLIER',
        buyer_type: undefined,
        role_code: undefined,
        business_name: 'Legal Gate Supplier',
        category_codes: [category.rows[0].code],
        eula_version: supplierAcceptance.eula_version,
        document_hash: supplierAcceptance.document_hash,
      });
      const submitted = await client.query(SUBMIT, [JSON.stringify(payload)]);
      expect(submitted.rows[0].result.status).toBe('ONBOARDED');
      await client.query('RESET ROLE');
      const acceptance = await client.query(
        `SELECT a.agreement_type FROM public.legal_acceptances a
         JOIN public.profiles p ON p.id = a.profile_id WHERE lower(p.email) = lower($1)`,
        [payload.email],
      );
      expect(acceptance.rows.map((r) => r.agreement_type)).toEqual(['SUPPLIER_EULA']);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('gates post-login on a new version, rejects stale acceptance and blocks direct writes', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      await freeze(client);
      await client.query('SET LOCAL ROLE anon');
      const payload = signupPayload();
      await client.query(SUBMIT, [JSON.stringify(payload)]);
      await client.query('RESET ROLE');

      const profile = await client.query(
        'SELECT id, auth_user_id FROM public.profiles WHERE lower(email) = lower($1)', [payload.email],
      );
      const userId = profile.rows[0].auth_user_id as string;
      const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
      const asUser = async () => {
        await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [claims]);
        await client.query('SET LOCAL ROLE authenticated');
      };

      await asUser();
      const accepted = await client.query('SELECT public.my_legal_acceptance_status() AS s');
      expect(accepted.rows[0].s.requiresAcceptance).toBe(false);

      // Clients cannot fabricate or edit acceptance evidence.
      await expectRpcError(
        client,
        `INSERT INTO public.legal_acceptances (profile_id, agreement_type, version, acceptance_source)
         VALUES ($1, 'CUSTOMER_EULA', 'v9', 'POST_LOGIN')`,
        [profile.rows[0].id],
        'permission denied',
      );
      await expectRpcError(
        client, `UPDATE public.legal_acceptances SET accepted_at = now() - interval '1 year'`, [], 'permission denied',
      );
      // An agreement that does not apply to this persona is refused.
      await expectRpcError(
        client,
        `SELECT public.accept_legal_agreement('SUPPLIER_EULA', $1, $2)`,
        [supplierAcceptance.eula_version, supplierAcceptance.document_hash],
        'EULA_NOT_APPLICABLE',
      );

      // Publishing a new version makes the existing acceptance stale.
      await client.query('RESET ROLE');
      const reviewer = (await client.query<{ profile_id: string }>(
        `SELECT profile_id FROM public.legal_review_grants WHERE can_register AND revoked_at IS NULL LIMIT 1`,
      )).rows[0].profile_id;
      await asLegalReviewer(client, reviewer, () => client.query(
        `SELECT public.register_legal_snapshot(NULL, 'CUSTOMER_EULA', 'v2.0-test', convert_to('buyer-frozen-text-00276-revision', 'UTF8'))`,
      ));
      const next = await currentLegal(client, 'CUSTOMER_EULA');

      await asUser();
      const stale = await client.query('SELECT public.my_legal_acceptance_status() AS s');
      expect(stale.rows[0].s.requiresAcceptance).toBe(true);
      expect(stale.rows[0].s.agreements[0]).toMatchObject({ currentVersion: 'v2.0-test', accepted: false });

      await expectRpcError(
        client,
        `SELECT public.accept_legal_agreement('CUSTOMER_EULA', $1, $2)`,
        [buyerAcceptance.eula_version, buyerAcceptance.document_hash],
        'EULA_VERSION_STALE',
      );
      const fresh = await client.query(
        `SELECT public.accept_legal_agreement('CUSTOMER_EULA', $1, $2) AS s`,
        [next.version, next.document_hash],
      );
      expect(fresh.rows[0].s.requiresAcceptance).toBe(false);

      await client.query('RESET ROLE');
      const history = await client.query(
        `SELECT version, acceptance_source FROM public.legal_acceptances
         WHERE profile_id = $1 ORDER BY accepted_at, version`, [profile.rows[0].id],
      );
      expect(history.rows.map((r) => r.version).sort()).toEqual([buyerAcceptance.eula_version, 'v2.0-test']);

      // Published versions and recorded acceptances are immutable evidence.
      await expectRpcError(
        client, `UPDATE public.legal_document_versions SET document_hash = $1 WHERE version = 'v2.0-test'`,
        [`sha256:${'b'.repeat(64)}`], 'LEGAL_VERSION_IMMUTABLE',
      );
      await expectRpcError(
        client, `UPDATE public.legal_acceptances SET accepted_at = now() WHERE profile_id = $1`,
        [profile.rows[0].id], 'LEGAL_ACCEPTANCE_IMMUTABLE',
      );
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
