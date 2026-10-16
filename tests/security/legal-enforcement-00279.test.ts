/**
 * 00279: separate Buyer/Supplier agreements, 30-day existing-user grace and
 * database-level enforcement.
 *
 * Behavioural cases run in rolled-back transactions against the local PostgreSQL
 * used for SQL parity (127.0.0.1:54322) and are skipped with a logged reason when
 * it is unavailable or lacks 00279. Writes are attempted directly against the
 * protected tables (the BEFORE trigger runs ahead of NOT NULL, foreign-key and RLS
 * checks), so a denial is the legal gate and an allowed write fails later on
 * unrelated constraints.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

describe('00279 static contract', () => {
  const sql = readFileSync(resolve('supabase/migrations/00279_legal_agreement_grace_and_database_enforcement.sql'), 'utf8')
    .replace(/--.*$/gm, '');

  it('protects every buyer and supplier write table with the matching agreement', () => {
    for (const table of ['requirements', 'rfqs', 'awards', 'purchase_orders', 'quotes', 'quote_versions']) {
      expect(sql).toMatch(new RegExp(`CREATE TRIGGER legal_acceptance_gate BEFORE INSERT OR UPDATE ON public\\.${table}`));
    }
    expect(sql).toMatch(/WHEN 'quotes' THEN\s+v_type := 'SUPPLIER_EULA'/);
    expect(sql).toMatch(/WHEN 'rfqs', 'requirements' THEN\s+v_type := 'CUSTOMER_EULA'/);
  });

  it('reads time only from the database and fails closed when configuration is invalid', () => {
    expect(sql).not.toMatch(/p_request|client_time|accepted_at\s*:=\s*p_/);
    expect(sql).toContain('LEGAL_ENFORCEMENT_MISCONFIGURED');
    expect(sql).toContain('p_at < v_cfg.rollout_at + make_interval(days => v_cfg.grace_days)');
  });

  it('keeps the activation function service_role only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.activate_legal_enforcement\(timestamptz\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.activate_legal_enforcement\(timestamptz\) TO service_role/);
  });

  it('refuses activation in 00290 until both current agreements are approved', () => {
    const guard = readFileSync(resolve('supabase/migrations/00290_legal_enforcement_requires_approval.sql'), 'utf8');
    expect(guard).toContain('LEGAL_APPROVAL_REQUIRED');
    expect(guard).toContain("'CUSTOMER_EULA'");
    expect(guard).toContain("'SUPPLIER_EULA'");
    expect(guard).not.toMatch(/SET\s+legal_approval_status/i);
    expect(guard).toMatch(/REVOKE ALL ON FUNCTION public\.activate_legal_enforcement\(timestamptz\) FROM PUBLIC, anon, authenticated/);
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
  const installed = await client.query(`SELECT to_regclass('public.legal_enforcement_config') AS t`);
  if (!installed.rows[0].t) {
    console.warn('[SKIP REASON] local PostgreSQL does not have migration 00279 applied');
    await client.end();
    return null;
  }
  return client;
}

async function markCurrentAgreementsApprovedForTest(client: Client) {
  await client.query(
    `UPDATE public.legal_document_versions
     SET legal_approval_status = 'APPROVED'
     WHERE retired_at IS NULL AND agreement_type IN ('CUSTOMER_EULA', 'SUPPLIER_EULA')`,
  );
}

async function expectError(client: Client, text: string, params: unknown[], code: string) {
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

async function errorOf(client: Client, text: string, params: unknown[]): Promise<string> {
  await client.query('SAVEPOINT probe');
  let message = '';
  try {
    await client.query(text, params);
  } catch (error) {
    message = (error as Error).message;
  }
  await client.query('ROLLBACK TO SAVEPOINT probe');
  return message;
}

type Account = { profileId: string; authUserId: string; orgId: string | null; email: string };

async function signup(client: Client, payload: Record<string, unknown>): Promise<Account> {
  const email = `legal79-${randomUUID()}@example.test`;
  await client.query('SET LOCAL ROLE anon');
  const res = await client.query('SELECT public.submit_signup_request($1::jsonb) AS r', [
    JSON.stringify({
      contact_first_name: 'Grace',
      contact_last_name: 'Tester',
      phone: '9876543210',
      verification_channel: 'EMAIL',
      coverage_city: 'Bengaluru',
      coverage_pincode: '560001',
      eula_accepted: true,
      eula_version: 'v1.0-20261014',
      email,
      ...payload,
    }),
  ]);
  await client.query('RESET ROLE');
  expect(res.rows[0].r.status).toBe('ONBOARDED');
  const p = await client.query(
    `SELECT id, auth_user_id, active_organization_id FROM public.profiles WHERE lower(email) = lower($1)`, [email],
  );
  return { profileId: p.rows[0].id, authUserId: p.rows[0].auth_user_id, orgId: p.rows[0].active_organization_id, email };
}

const buyer = (client: Client) =>
  signup(client, { side: 'BUYER', buyer_type: 'MSME', business_name: `Grace Buyer ${randomUUID().slice(0, 6)}` });

async function supplier(client: Client) {
  const category = await client.query('SELECT code FROM public.requirement_categories WHERE is_active LIMIT 1');
  return signup(client, {
    side: 'SUPPLIER',
    business_name: `Grace Supplier ${randomUUID().slice(0, 6)}`,
    category_codes: [category.rows[0].code],
  });
}

async function asUser(client: Client, account: Account) {
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: account.authUserId, role: 'authenticated' }),
  ]);
}

const noAcceptance = async (client: Client, account: Account, type: string) => {
  await client.query(`SET LOCAL session_replication_role = replica`);
  await client.query(`DELETE FROM public.legal_acceptances WHERE profile_id = $1 AND agreement_type = $2`, [account.profileId, type]);
  await client.query(`SET LOCAL session_replication_role = origin`);
};

const statusOf = async (client: Client, account: Account, type: string, at?: string) =>
  (await client.query(`SELECT private.legal_acceptance_status($1, $2, COALESCE($3::timestamptz, now())) AS s`, [
    account.profileId, type, at ?? null,
  ])).rows[0].s as string;

const REQ_INSERT = `INSERT INTO public.requirements (organization_id, created_by, title) VALUES ($1, $2, 'Legal gate probe')`;
const QUOTE_INSERT = `INSERT INTO public.quotes (rfq_id, supplier_id) VALUES ($1, $2)`;

describe('00279 database outcomes (rolled back)', () => {
  it('keeps separate Buyer and Supplier agreement records pending legal approval', async () => {
    const client = await connect();
    if (!client) return;
    try {
      const rows = await client.query(
        `SELECT agreement_type, audience, legal_approval_status, reacceptance_policy
         FROM public.legal_document_versions WHERE retired_at IS NULL ORDER BY agreement_type`,
      );
      expect(rows.rows).toEqual([
        { agreement_type: 'CUSTOMER_EULA', audience: 'BUYER', legal_approval_status: 'PENDING_LEGAL_APPROVAL', reacceptance_policy: 'IMMEDIATE' },
        { agreement_type: 'SUPPLIER_EULA', audience: 'SUPPLIER', legal_approval_status: 'PENDING_LEGAL_APPROVAL', reacceptance_policy: 'IMMEDIATE' },
      ]);
    } finally {
      await client.end();
    }
  });

  it('does not enforce until configured, and refuses invalid or repeated activation', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const acct = await buyer(client);
      await noAcceptance(client, acct, 'CUSTOMER_EULA');
      expect(await statusOf(client, acct, 'CUSTOMER_EULA')).toBe('NOT_ENFORCED');
      await asUser(client, acct);
      expect(await errorOf(client, REQ_INSERT, [acct.orgId, acct.profileId])).not.toContain('LEGAL_');

      await expectError(client, `SELECT public.activate_legal_enforcement(NULL)`, [], 'LEGAL_ENFORCEMENT_MISCONFIGURED');
      await expectError(
        client, `UPDATE public.legal_enforcement_config SET enforcement_enabled = true WHERE singleton`, [],
        'LEGAL_ENFORCEMENT_MISCONFIGURED',
      );
      await expectError(
        client,
        `SELECT public.activate_legal_enforcement(now() - interval '10 days')`,
        [],
        'LEGAL_APPROVAL_REQUIRED',
      );

      await markCurrentAgreementsApprovedForTest(client);
      await client.query(`SELECT public.activate_legal_enforcement(now() - interval '10 days')`);
      await expectError(client, `SELECT public.activate_legal_enforcement(now())`, [], 'LEGAL_CONFIG_IMMUTABLE');
      await expectError(
        client, `UPDATE public.legal_enforcement_config SET rollout_at = now() WHERE singleton`, [], 'LEGAL_CONFIG_IMMUTABLE',
      );
      await client.query('SET LOCAL ROLE authenticated');
      await expectError(client, `SELECT public.activate_legal_enforcement(now())`, [], 'permission denied');
    } finally {
      await client.query('ROLLBACK');
      const persisted = await client.query<{ pending: boolean; enforced: boolean; rollout: string | null }>(
        `SELECT bool_and(legal_approval_status = 'PENDING_LEGAL_APPROVAL') AS pending,
                (SELECT enforcement_enabled FROM public.legal_enforcement_config) AS enforced,
                (SELECT rollout_at FROM public.legal_enforcement_config) AS rollout
         FROM public.legal_document_versions
         WHERE retired_at IS NULL AND agreement_type IN ('CUSTOMER_EULA', 'SUPPLIER_EULA')`,
      );
      expect(persisted.rows[0]?.pending).toBe(true);
      expect(persisted.rows[0]?.enforced).toBe(false);
      expect(persisted.rows[0]?.rollout).toBeNull();
      await client.end();
    }
  });

  it('applies the exact 30-day grace boundary to existing users', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const acct = await buyer(client);
      await noAcceptance(client, acct, 'CUSTOMER_EULA');
      // Existing capability: granted well before the rollout.
      await client.query(`UPDATE public.profile_roles SET assigned_at = now() - interval '90 days' WHERE profile_id = $1`, [acct.profileId]);
      await client.query(`UPDATE public.organization_members SET joined_at = now() - interval '90 days' WHERE profile_id = $1`, [acct.profileId]);
      await markCurrentAgreementsApprovedForTest(client);
      await client.query(`SELECT public.activate_legal_enforcement('2026-11-01T00:00:00Z')`);

      const deadline = Date.parse('2026-12-01T00:00:00Z'); // rollout + 30 days
      const at = (ms: number) => new Date(deadline + ms).toISOString();
      expect(await statusOf(client, acct, 'CUSTOMER_EULA', at(-1000))).toBe('GRACE');
      expect(await statusOf(client, acct, 'CUSTOMER_EULA', at(0))).toBe('REQUIRED');
      expect(await statusOf(client, acct, 'CUSTOMER_EULA', at(1000))).toBe('REQUIRED');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('allows existing users writes inside grace', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const acct = await buyer(client);
      await noAcceptance(client, acct, 'CUSTOMER_EULA');
      await client.query(`UPDATE public.profile_roles SET assigned_at = now() - interval '40 days' WHERE profile_id = $1`, [acct.profileId]);
      await client.query(`UPDATE public.organization_members SET joined_at = now() - interval '40 days' WHERE profile_id = $1`, [acct.profileId]);
      await markCurrentAgreementsApprovedForTest(client);
      await client.query(`SELECT public.activate_legal_enforcement(now() - interval '10 days')`);
      expect(await statusOf(client, acct, 'CUSTOMER_EULA')).toBe('GRACE');
      await asUser(client, acct);
      expect(await errorOf(client, REQ_INSERT, [acct.orgId, acct.profileId])).not.toContain('LEGAL_');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('denies direct protected writes after expiry and lets acceptance lift the restriction at once', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const acct = await buyer(client);
      await noAcceptance(client, acct, 'CUSTOMER_EULA');
      await client.query(`UPDATE public.profile_roles SET assigned_at = now() - interval '120 days' WHERE profile_id = $1`, [acct.profileId]);
      await client.query(`UPDATE public.organization_members SET joined_at = now() - interval '120 days' WHERE profile_id = $1`, [acct.profileId]);
      await markCurrentAgreementsApprovedForTest(client);
      await client.query(`SELECT public.activate_legal_enforcement(now() - interval '45 days')`);
      expect(await statusOf(client, acct, 'CUSTOMER_EULA')).toBe('REQUIRED');

      await asUser(client, acct);
      await client.query('SET LOCAL ROLE authenticated');
      await expectError(client, REQ_INSERT, [acct.orgId, acct.profileId], 'LEGAL_ACCEPTANCE_REQUIRED');
      await expectError(
        client,
        `INSERT INTO public.rfqs (organization_id, created_by, requirement_id, title) VALUES ($1, $2, $3, 'x')`,
        [acct.orgId, acct.profileId, randomUUID()],
        'LEGAL_ACCEPTANCE_REQUIRED',
      );

      // Acceptance itself is never blocked by the missing acceptance, and clients cannot pick another agreement.
      await expectError(client, `SELECT public.accept_legal_agreement('SUPPLIER_EULA', 'v1.0-20261014')`, [], 'EULA_NOT_APPLICABLE');
      await expectError(client, `SELECT public.accept_legal_agreement('CUSTOMER_EULA', 'v0-forged')`, [], 'EULA_VERSION_STALE');
      const accepted = await client.query(`SELECT public.accept_legal_agreement('CUSTOMER_EULA', 'v1.0-20261014') AS s`);
      expect(accepted.rows[0].s.agreements[0].status).toBe('ACCEPTED');
      await client.query('RESET ROLE');
      expect(await errorOf(client, REQ_INSERT, [acct.orgId, acct.profileId])).not.toContain('LEGAL_');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('requires acceptance immediately for new accounts and newly enabled roles, evaluated per agreement', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const acct = await buyer(client);
      await markCurrentAgreementsApprovedForTest(client);
      await client.query(`SELECT public.activate_legal_enforcement(now() - interval '5 days')`);

      // New account (capability created after rollout): no grace without acceptance.
      await noAcceptance(client, acct, 'CUSTOMER_EULA');
      expect(await statusOf(client, acct, 'CUSTOMER_EULA')).toBe('REQUIRED');
      await client.query(
        `INSERT INTO public.legal_acceptances (profile_id, agreement_type, version, acceptance_source)
         VALUES ($1, 'CUSTOMER_EULA', 'v1.0-20261014', 'POST_LOGIN')`, [acct.profileId],
      );
      expect(await statusOf(client, acct, 'CUSTOMER_EULA')).toBe('ACCEPTED');

      // Buyer acceptance does not satisfy a newly enabled supplier capability, and vice versa.
      const owner = await supplier(client);
      await client.query(
        `INSERT INTO public.supplier_users (supplier_id, profile_id, role)
         SELECT supplier_id, $1, 'OPERATOR' FROM public.supplier_users WHERE profile_id = $2 LIMIT 1`,
        [acct.profileId, owner.profileId],
      );
      expect(await statusOf(client, acct, 'SUPPLIER_EULA')).toBe('REQUIRED');
      expect(await statusOf(client, acct, 'CUSTOMER_EULA')).toBe('ACCEPTED');

      await asUser(client, acct);
      const supplierId = (await client.query(
        `SELECT supplier_id FROM public.supplier_users WHERE profile_id = $1 LIMIT 1`, [acct.profileId],
      )).rows[0].supplier_id;
      expect(await errorOf(client, QUOTE_INSERT, [randomUUID(), supplierId])).toContain('LEGAL_ACCEPTANCE_REQUIRED');
      // The same account may still act as a buyer.
      expect(await errorOf(client, REQ_INSERT, [acct.orgId, acct.profileId])).not.toContain('LEGAL_');

      // Supplier-side acceptance is independent of the buyer one.
      expect(await statusOf(client, owner, 'SUPPLIER_EULA')).toBe('ACCEPTED');
      await client.query('SET LOCAL ROLE authenticated');
      const status = await client.query('SELECT public.my_legal_acceptance_status() AS s');
      const byType = Object.fromEntries(
        status.rows[0].s.agreements.map((a: { agreementType: string; status: string }) => [a.agreementType, a.status]),
      );
      expect(byType).toEqual({ CUSTOMER_EULA: 'ACCEPTED', SUPPLIER_EULA: 'REQUIRED' });
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('keeps acceptance history append-only, exempts service contexts narrowly, and hides other users', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const acct = await buyer(client);
      const other = await buyer(client);
      await markCurrentAgreementsApprovedForTest(client);
      await client.query(`SELECT public.activate_legal_enforcement(now() - interval '45 days')`);
      await noAcceptance(client, acct, 'CUSTOMER_EULA');

      await expectError(
        client, `DELETE FROM public.legal_acceptances WHERE profile_id = $1`, [other.profileId], 'LEGAL_ACCEPTANCE_IMMUTABLE',
      );
      await expectError(
        client, `UPDATE public.legal_acceptances SET accepted_at = now() WHERE profile_id = $1`, [other.profileId], 'LEGAL_ACCEPTANCE_IMMUTABLE',
      );

      // Service/background context (no profile) is not blocked by the legal gate.
      await client.query(`SELECT set_config('request.jwt.claims', '', true)`);
      expect(await errorOf(client, REQ_INSERT, [acct.orgId, acct.profileId])).not.toContain('LEGAL_');

      // A user sees only their own acceptance records.
      await asUser(client, acct);
      await client.query('SET LOCAL ROLE authenticated');
      const visible = await client.query(`SELECT DISTINCT profile_id FROM public.legal_acceptances`);
      expect(visible.rows.every((r) => r.profile_id === acct.profileId)).toBe(true);
      await expectError(client, `DELETE FROM public.legal_acceptances`, [], 'permission denied');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
