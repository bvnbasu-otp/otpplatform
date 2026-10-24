/**
 * 00291 approval evidence. Every database change is rolled back.
 * Nothing in this file is a legal approval, a rollout, or enabled enforcement.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  activateAsReviewer,
  activateCall,
  asLegalReviewer,
  approveCurrentSnapshots,
  currentLegal,
  ensureDistinctFrozenAgreements,
  TEST_EXTERNAL_REF,
} from '../helpers/legal-evidence-fixture';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: Number(process.env.LOCAL_PG_PORT ?? 54322),
  database: process.env.OTP_PG_DATABASE ?? 'postgres',
  user: 'postgres',
  password: 'postgres',
};

describe('00291 static contract', () => {
  const sql = readFileSync(resolve('supabase/migrations/00291_legal_approval_evidence.sql'), 'utf8');

  it('does not seed a grant, a document, an approval, or an enabled rollout', () => {
    expect(sql.match(/INSERT INTO public\.legal_review_grants/gi)).toHaveLength(1);
    expect(sql.match(/INSERT INTO public\.legal_agreement_approvals/gi)).toHaveLength(1);
    expect(sql).not.toContain("SET legal_approval_status = 'APPROVED'");
    expect(sql).toContain('A caller-supplied profile id is not the actor');
    expect(sql).toContain('private.verified_legal_actor()');
    expect(sql).not.toContain('GRANT EXECUTE ON FUNCTION public.grant_legal_reviewer(uuid, uuid, boolean, boolean, boolean, boolean, text) TO service_role');
    expect(sql).toContain('does not clear enforcement_enabled');
    expect(sql).toContain('EULA_SNAPSHOT_UNAVAILABLE');
    expect(sql).toContain('LEGAL_REVIEW_UNAUTHORIZED');
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
  const installed = await client.query(`SELECT to_regprocedure('public.register_legal_snapshot(uuid,text,text,bytea)') AS fn`);
  if (!installed.rows[0].fn) {
    console.warn('[SKIP REASON] local PostgreSQL does not have migration 00291 applied');
    await client.end();
    return null;
  }
  return client;
}

async function errorOf(client: Client, text: string, params: unknown[] = []): Promise<string> {
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

async function bareProfile(client: Client): Promise<string> {
  const id = randomUUID();
  const email = `bare-${id}@example.test`;
  await client.query('RESET ROLE');
  await client.query(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       email_change_token_current, phone_change, phone_change_token, reauthentication_token,
       is_super_admin, is_sso_user, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) VALUES (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       extensions.crypt('not-a-login', extensions.gen_salt('bf')), now(),
       '', '', '', '', '', '', '', '', false, false, false,
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
     )`,
    [id, email],
  );
  await client.query(
    `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin, is_demo)
     VALUES ($1, $1, $2, 'Bare User', false, false)`,
    [id, email],
  );
  return id;
}

async function signup(client: Client, side: 'BUYER' | 'SUPPLIER'): Promise<{ profileId: string; authUserId: string; orgId: string | null }> {
  await ensureDistinctFrozenAgreements(client);
  const agreement = await currentLegal(client, side === 'SUPPLIER' ? 'SUPPLIER_EULA' : 'CUSTOMER_EULA');
  const email = `e291-${randomUUID()}@example.test`;
  const category = side === 'SUPPLIER'
    ? (await client.query<{ code: string }>('SELECT code FROM public.requirement_categories WHERE is_active LIMIT 1')).rows[0].code
    : null;
  await client.query('SET LOCAL ROLE anon');
  const res = await client.query('SELECT public.submit_signup_request($1::jsonb) AS r', [JSON.stringify({
    side,
    buyer_type: side === 'BUYER' ? 'MSME' : undefined,
    business_name: `Evidence ${randomUUID().slice(0, 6)}`,
    contact_first_name: 'Evidence',
    contact_last_name: 'Tester',
    phone: '9876543210',
    verification_channel: 'EMAIL',
    coverage_city: 'Bengaluru',
    coverage_pincode: '560001',
    category_codes: category ? [category] : undefined,
    email,
    eula_accepted: true,
    eula_version: agreement.version,
    document_hash: agreement.document_hash,
  })]);
  await client.query('RESET ROLE');
  expect(res.rows[0].r.status).toBe('ONBOARDED');
  const profile = await client.query<{ id: string; auth_user_id: string; active_organization_id: string | null }>(
    `SELECT id, auth_user_id, active_organization_id FROM public.profiles WHERE lower(email) = lower($1)`,
    [email],
  );
  return { profileId: profile.rows[0].id, authUserId: profile.rows[0].auth_user_id, orgId: profile.rows[0].active_organization_id };
}

async function committedState(client: Client) {
  return client.query<{
    pending: boolean;
    enforced: boolean;
    rollout: string | null;
    snapshots: number;
    approvals: number;
    grants: number;
  }>(
    `SELECT bool_and(legal_approval_status = 'PENDING_LEGAL_APPROVAL') AS pending,
            (SELECT enforcement_enabled FROM public.legal_enforcement_config) AS enforced,
            (SELECT rollout_at FROM public.legal_enforcement_config) AS rollout,
            (SELECT count(*)::int FROM public.legal_document_snapshots) AS snapshots,
            (SELECT count(*)::int FROM public.legal_agreement_approvals) AS approvals,
            (SELECT count(*)::int FROM public.legal_review_grants) AS grants
     FROM public.legal_document_versions
     WHERE retired_at IS NULL AND agreement_type IN ('CUSTOMER_EULA', 'SUPPLIER_EULA')`,
  );
}

describe('00291 database outcomes (rolled back)', () => {
  it('does not commit a read-only transaction and binds distinct synthetic bytes', async () => {
    const client = await connect();
    if (!client) return;
    try {
      const seed = await client.query<{ document_hash: string; legal_approval_status: string }>(
        `SELECT document_hash, legal_approval_status
         FROM public.legal_document_versions
         WHERE retired_at IS NULL AND version = 'v1.0-20261014'
         ORDER BY agreement_type`,
      );
      expect(seed.rows).toHaveLength(2);
      expect(seed.rows[0].document_hash).toBe(seed.rows[1].document_hash);
      expect(seed.rows.every((row) => row.legal_approval_status === 'PENDING_LEGAL_APPROVAL')).toBe(true);

      await client.query('BEGIN');
      const profileId = (await client.query<{ id: string }>(`SELECT id FROM public.profiles LIMIT 1`)).rows[0].id;
      await asLegalReviewer(client, profileId, () => client.query('SELECT 1'));
      await client.query('SAVEPOINT after_reviewer');
      await client.query('ROLLBACK TO SAVEPOINT after_reviewer');

      await ensureDistinctFrozenAgreements(client);
      const buyer = await currentLegal(client, 'CUSTOMER_EULA');
      const supplier = await currentLegal(client, 'SUPPLIER_EULA');
      const expected = await client.query<{ buyer: string; supplier: string }>(
        `SELECT 'sha256:' || encode(extensions.digest(convert_to('buyer-frozen-text', 'UTF8'), 'sha256'), 'hex') AS buyer,
                'sha256:' || encode(extensions.digest(convert_to('supplier-frozen-text-distinct', 'UTF8'), 'sha256'), 'hex') AS supplier`,
      );
      expect(buyer.document_hash).toBe(expected.rows[0].buyer);
      expect(supplier.document_hash).toBe(expected.rows[0].supplier);
      expect(buyer.document_hash).not.toBe(supplier.document_hash);
    } finally {
      await client.query('ROLLBACK');
      const state = await committedState(client);
      expect(state.rows[0].enforced).toBe(false);
      expect(state.rows[0].approvals).toBe(0);
      expect(state.rows[0].snapshots).toBe(0);
      await client.end();
    }
  });

  it('leaves the committed catalogue unapproved and enforcement off', async () => {
    const client = await connect();
    if (!client) return;
    try {
      const state = await committedState(client);
      expect(state.rows[0].pending).toBe(true);
      expect(state.rows[0].enforced).toBe(false);
      expect(state.rows[0].rollout).toBeNull();
      expect(state.rows[0].approvals).toBe(0);
    } finally {
      await client.end();
    }
  });

  it('rejects signup until frozen bytes exist, then rejects a missing, stale, or wrong-side hash', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('otp.legal_catalogue_write', 'on', true)`);
      await client.query(
        `UPDATE public.legal_document_versions
         SET retired_at = now()
         WHERE retired_at IS NULL AND snapshot_id IS NOT NULL`,
      );
      await client.query(
        `UPDATE public.legal_document_versions SET retired_at = NULL WHERE version = 'v1.0-20261014'`,
      );
      const missing = await errorOf(client, `SELECT public.submit_signup_request($1::jsonb)`, [JSON.stringify({
        side: 'BUYER', buyer_type: 'MSME', business_name: 'No Snapshot',
        contact_first_name: 'A', contact_last_name: 'B', phone: '9876543210',
        email: `nosnap-${randomUUID()}@example.test`, eula_accepted: true, eula_version: 'v1.0-20261014',
      })]);
      expect(missing).toContain('EULA_SNAPSHOT_UNAVAILABLE');

      const reviewer = await ensureDistinctFrozenAgreements(client);
      const buyer = await currentLegal(client, 'CUSTOMER_EULA');
      const supplier = await currentLegal(client, 'SUPPLIER_EULA');
      expect(buyer.document_hash).not.toBe(supplier.document_hash);

      const base = {
        side: 'BUYER', buyer_type: 'MSME', business_name: 'Hash Probe',
        contact_first_name: 'A', contact_last_name: 'B', phone: '9876543210',
        coverage_city: 'Bengaluru', coverage_pincode: '560001', eula_accepted: true,
      };
      expect(await errorOf(client, `SELECT public.submit_signup_request($1::jsonb)`, [JSON.stringify({
        ...base, email: `miss-${randomUUID()}@example.test`, eula_version: buyer.version,
      })])).toContain('EULA_VERSION_STALE');
      expect(await errorOf(client, `SELECT public.submit_signup_request($1::jsonb)`, [JSON.stringify({
        ...base, email: `stale-${randomUUID()}@example.test`, eula_version: buyer.version, document_hash: supplier.document_hash,
      })])).toContain('EULA_VERSION_STALE');
      expect(await errorOf(client, `SELECT public.submit_signup_request($1::jsonb)`, [JSON.stringify({
        ...base, side: 'SUPPLIER', buyer_type: undefined, category_codes: ['WILL_NOT_MATCH'],
        email: `side-${randomUUID()}@example.test`, eula_version: buyer.version, document_hash: buyer.document_hash,
      })])).toContain('EULA_VERSION_STALE');

      const same = await asLegalReviewer(client, reviewer, () => errorOf(
        client,
        `SELECT public.register_legal_snapshot(NULL, 'SUPPLIER_EULA', 'v-copy', convert_to('buyer-frozen-text', 'UTF8'))`,
      ));
      expect(same).toContain('LEGAL_SNAPSHOT_BYTES_NOT_DISTINCT');
      expect(await asLegalReviewer(client, reviewer, () => errorOf(
        client,
        `SELECT public.register_legal_snapshot(NULL, 'CUSTOMER_EULA', 'v-bad-utf8', '\\xff'::bytea)`,
      ))).toMatch(/UTF8|invalid byte/i);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('rejects unauthorized approvers, one-sided approval, revocation, and tampered evidence', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const reviewer = await ensureDistinctFrozenAgreements(client);
      const stranger = await bareProfile(client);
      const buyer = await currentLegal(client, 'CUSTOMER_EULA');
      const supplier = await currentLegal(client, 'SUPPLIER_EULA');

      expect(await errorOf(
        client,
        `SELECT public.record_legal_decision($1, $2, 'APPROVED', $3, NULL)`,
        [stranger, buyer.snapshot_id, TEST_EXTERNAL_REF],
      )).toContain('LEGAL_REVIEW_UNAUTHORIZED');
      expect(await errorOf(
        client,
        `SELECT public.activate_legal_enforcement(now(), $1)`,
        [stranger],
      )).toContain('LEGAL_APPROVAL_REQUIRED');
      expect(await errorOf(
        client,
        `UPDATE public.legal_document_versions SET legal_approval_status = 'APPROVED' WHERE snapshot_id = $1`,
        [buyer.snapshot_id],
      )).toContain('LEGAL_APPROVAL_IMMUTABLE');
      expect(await errorOf(
        client,
        `UPDATE public.legal_document_snapshots SET body = convert_to('tampered', 'UTF8') WHERE id = $1`,
        [buyer.snapshot_id],
      )).toContain('LEGAL_SNAPSHOT_IMMUTABLE');
      expect(await errorOf(
        client,
        `UPDATE public.legal_document_versions SET document_hash = 'sha256:' || repeat('ab', 32) WHERE id = (SELECT id FROM public.legal_document_versions WHERE snapshot_id = $1)`,
        [buyer.snapshot_id],
      )).toContain('LEGAL_VERSION_IMMUTABLE');
      expect(await errorOf(
        client,
        `INSERT INTO public.legal_document_versions (agreement_type, version, document_hash, title)
         VALUES ('CUSTOMER_EULA', 'v-second-current', 'sha256:' || repeat('cd', 32), 'Duplicate current')`,
      )).toContain('legal_document_versions_one_current');

      await asLegalReviewer(client, reviewer, () => client.query(
        `SELECT public.record_legal_decision($1, $2, 'APPROVED', $3, NULL)`,
        [stranger, buyer.snapshot_id, TEST_EXTERNAL_REF],
      ));
      const attributed = await client.query<{ approver_profile_id: string }>(
        `SELECT approver_profile_id FROM public.legal_agreement_approvals WHERE snapshot_id = $1`,
        [buyer.snapshot_id],
      );
      expect(attributed.rows[0].approver_profile_id).toBe(reviewer);
      expect(await errorOf(client, activateCall('now()'), [])).toContain('LEGAL_APPROVAL_REQUIRED');

      await asLegalReviewer(client, reviewer, async () => {
        await client.query(
          `SELECT public.record_legal_decision(NULL, $1, 'APPROVED', $2, NULL)`,
          [supplier.snapshot_id, TEST_EXTERNAL_REF],
        );
        await client.query(
          `SELECT public.record_legal_decision(NULL, $1, 'REVOKED', $2, 'test revocation')`,
          [supplier.snapshot_id, TEST_EXTERNAL_REF],
        );
      });
      const history = await client.query(
        `SELECT decision FROM public.legal_agreement_approvals WHERE snapshot_id = $1 ORDER BY decision_seq`,
        [supplier.snapshot_id],
      );
      expect(history.rows.map((row) => row.decision)).toEqual(['APPROVED', 'REVOKED']);
      expect(await errorOf(
        client,
        `UPDATE public.legal_agreement_approvals SET decision = 'APPROVED' WHERE snapshot_id = $1`,
        [supplier.snapshot_id],
      )).toContain('LEGAL_APPROVAL_IMMUTABLE');
      expect(await errorOf(client, activateCall('now()'), [])).toContain('LEGAL_APPROVAL_REQUIRED');

      await asLegalReviewer(client, reviewer, () => client.query(
        `SELECT public.revoke_legal_reviewer(NULL, $1, $2)`,
        [reviewer, 'TEST-EVIDENCE-NOT-A-LEGAL-APPROVAL'],
      ));
      expect(await asLegalReviewer(client, reviewer, () => errorOf(
        client,
        `SELECT public.record_legal_decision(NULL, $1, 'APPROVED', $2, NULL)`,
        [supplier.snapshot_id, TEST_EXTERNAL_REF],
      ))).toContain('LEGAL_REVIEW_UNAUTHORIZED');

      const cfg = await client.query(`SELECT enforcement_enabled, rollout_at FROM public.legal_enforcement_config`);
      expect(cfg.rows[0]).toEqual({ enforcement_enabled: false, rollout_at: null });
    } finally {
      await client.query('ROLLBACK');
      const state = await committedState(client);
      expect(state.rows[0].enforced).toBe(false);
      expect(state.rows[0].rollout).toBeNull();
      expect(state.rows[0].approvals).toBe(0);
      await client.end();
    }
  });

  it('activates only with both current artifacts and rolls the activation back', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const reviewer = await ensureDistinctFrozenAgreements(client);
      await approveCurrentSnapshots(client);
      const buyer = await currentLegal(client, 'CUSTOMER_EULA');
      const supplier = await currentLegal(client, 'SUPPLIER_EULA');
      expect(await errorOf(client, activateCall(`now() - interval '1 day'`), [])).toContain('LEGAL_REVIEW_UNAUTHORIZED');
      await activateAsReviewer(client, `now() - interval '1 day'`);
      const cfg = await client.query<{ enforcement_enabled: boolean; grace_customer_snapshot_id: string; grace_supplier_snapshot_id: string }>(
        `SELECT enforcement_enabled, grace_customer_snapshot_id, grace_supplier_snapshot_id FROM public.legal_enforcement_config`,
      );
      expect(cfg.rows[0].enforcement_enabled).toBe(true);
      expect(cfg.rows[0].grace_customer_snapshot_id).toBe(buyer.snapshot_id);
      expect(cfg.rows[0].grace_supplier_snapshot_id).toBe(supplier.snapshot_id);

      const audit = await client.query<{ actor_id: string; payload: Record<string, string> }>(
        `SELECT actor_id, payload FROM public.audit_events WHERE event_type = 'legal.enforcement_activated' ORDER BY occurred_at DESC LIMIT 1`,
      );
      expect(audit.rows[0].actor_id).toBe(reviewer);
      expect(audit.rows[0].payload.customer_hash).toBe(buyer.document_hash);
      expect(audit.rows[0].payload.supplier_hash).toBe(supplier.document_hash);
      expect(audit.rows[0].payload.customer_snapshot_id).toBe(buyer.snapshot_id);
      expect(audit.rows[0].payload.supplier_snapshot_id).toBe(supplier.snapshot_id);
      expect(audit.rows[0].payload.customer_approval_id).toBeTruthy();
      expect(audit.rows[0].payload.supplier_approval_id).toBeTruthy();
      expect(await client.query(`SELECT current_user AS u`)).toMatchObject({ rows: [{ u: 'postgres' }] });

      await asLegalReviewer(client, reviewer, () => client.query(
        `SELECT public.record_legal_decision(NULL, $1, 'REVOKED', $2, 'after activation')`,
        [supplier.snapshot_id, TEST_EXTERNAL_REF],
      ));
      expect((await client.query(`SELECT enforcement_enabled FROM public.legal_enforcement_config`)).rows[0].enforcement_enabled).toBe(true);
    } finally {
      await client.query('ROLLBACK');
      const state = await committedState(client);
      expect(state.rows[0].enforced).toBe(false);
      expect(state.rows[0].rollout).toBeNull();
      await client.end();
    }
  });

  it('serializes activation against a concurrent catalogue lock and leaves enforcement off', async () => {
    const holder = await connect();
    const waiter = await connect();
    if (!holder || !waiter) {
      await holder?.end();
      await waiter?.end();
      return;
    }
    try {
      await holder.query('BEGIN');
      await ensureDistinctFrozenAgreements(holder);
      await approveCurrentSnapshots(holder);
      const locked = await holder.query<{ id: string; content_ref: string }>(
        `SELECT id, content_ref FROM public.legal_document_versions WHERE retired_at IS NULL FOR UPDATE`,
      );

      await waiter.query('BEGIN');
      await waiter.query(`SET lock_timeout = '400ms'`);
      expect(await errorOf(waiter, activateCall('now()'))).toMatch(/lock timeout/i);
      expect(await errorOf(
        waiter,
        `UPDATE public.legal_document_versions SET content_ref = 'mutated' WHERE retired_at IS NULL`,
      )).toMatch(/lock timeout/i);
      await waiter.query('ROLLBACK');

      await holder.query('ROLLBACK');
      const state = await committedState(holder);
      expect(state.rows[0].enforced).toBe(false);
      expect(state.rows[0].rollout).toBeNull();
      expect(state.rows[0].approvals).toBe(0);
      expect((await holder.query(
        `SELECT count(*)::int AS n FROM public.legal_document_versions WHERE content_ref = 'mutated'`,
      )).rows[0].n).toBe(0);
    } finally {
      await holder.query('ROLLBACK');
      await waiter.query('ROLLBACK');
      await holder.end();
      await waiter.end();
    }
  });

  it('keeps grace on the activated snapshot and requires a new version or a new capability immediately', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const account = await signup(client, 'BUYER');
      await client.query(`SET LOCAL session_replication_role = replica`);
      await client.query(`DELETE FROM public.legal_acceptances WHERE profile_id = $1`, [account.profileId]);
      await client.query(`SET LOCAL session_replication_role = origin`);
      await client.query(
        `UPDATE public.profile_roles SET assigned_at = now() - interval '90 days' WHERE profile_id = $1`,
        [account.profileId],
      );
      await client.query(
        `UPDATE public.organization_members SET joined_at = now() - interval '90 days' WHERE profile_id = $1`,
        [account.profileId],
      );
      await approveCurrentSnapshots(client);
      await activateAsReviewer(client, `now() - interval '10 days'`);

      const status = async (type: string, at: string | null = null) => (await client.query(
        `SELECT private.legal_acceptance_status($1, $2, COALESCE($3::timestamptz, now())) AS s`,
        [account.profileId, type, at],
      )).rows[0].s as string;
      expect(await status('CUSTOMER_EULA')).toBe('GRACE');
      const boundary = (await client.query<{ inside: string; deadline: string }>(
        `SELECT
           (rollout_at + make_interval(days => grace_days) - interval '1 second')::text AS inside,
           (rollout_at + make_interval(days => grace_days))::text AS deadline
         FROM public.legal_enforcement_config`,
      )).rows[0];
      expect(await status('CUSTOMER_EULA', boundary.inside)).toBe('GRACE');
      expect(await status('CUSTOMER_EULA', boundary.deadline)).toBe('REQUIRED');

      const reviewer = (await client.query<{ profile_id: string }>(
        `SELECT profile_id FROM public.legal_review_grants WHERE can_register AND revoked_at IS NULL LIMIT 1`,
      )).rows[0].profile_id;
      await asLegalReviewer(client, reviewer, () => client.query(
        `SELECT public.register_legal_snapshot(NULL, 'CUSTOMER_EULA', 'v-during-grace', convert_to('buyer-frozen-text-during-grace', 'UTF8'))`,
      ));
      expect(await status('CUSTOMER_EULA')).toBe('REQUIRED');
      const next = await currentLegal(client, 'CUSTOMER_EULA');
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: account.authUserId, role: 'authenticated' }),
      ]);
      await client.query('SET LOCAL ROLE authenticated');
      await client.query(
        `SELECT public.accept_legal_agreement('CUSTOMER_EULA', $1, $2)`,
        [next.version, next.document_hash],
      );
      await client.query('RESET ROLE');
      expect(await status('CUSTOMER_EULA')).toBe('ACCEPTED');

      const supplierOwner = await signup(client, 'SUPPLIER');
      await client.query(
        `INSERT INTO public.supplier_users (supplier_id, profile_id, role)
         SELECT supplier_id, $1, 'OPERATOR' FROM public.supplier_users WHERE profile_id = $2 LIMIT 1`,
        [account.profileId, supplierOwner.profileId],
      );
      expect(await status('SUPPLIER_EULA')).toBe('REQUIRED');
      expect(await status('CUSTOMER_EULA')).toBe('ACCEPTED');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('treats a missing catalogue as misconfiguration and archives acceptance when the profile is removed', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const account = await signup(client, 'BUYER');
      await client.query(`SELECT set_config('request.jwt.claims', '', true)`);
      expect(await errorOf(client, `SELECT public.my_legal_acceptance_status()`)).toContain('AUTH_REQUIRED');

      await client.query('RESET ROLE');
      await client.query(`SELECT set_config('otp.legal_catalogue_write', 'on', true)`);
      await client.query(`UPDATE public.legal_document_versions SET retired_at = now() WHERE retired_at IS NULL`);
      expect((await client.query(
        `SELECT private.legal_acceptance_status($1, 'CUSTOMER_EULA', now()) AS s`,
        [account.profileId],
      )).rows[0].s).toBe('NOT_ENFORCED');
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: account.authUserId, role: 'authenticated' }),
      ]);
      await client.query('SET LOCAL ROLE authenticated');
      const status = await client.query<{ s: { agreements: Array<{ status: string }> } }>(
        `SELECT public.my_legal_acceptance_status() AS s`,
      );
      expect(status.rows[0].s.agreements.some((row) => row.status === 'MISCONFIGURED')).toBe(true);
      await client.query('RESET ROLE');

      await client.query('ROLLBACK');
      await client.query('BEGIN');
      const kept = await signup(client, 'BUYER');
      const before = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.legal_acceptance_archives WHERE profile_id = $1`,
        [kept.profileId],
      );
      expect(await errorOf(client, `DELETE FROM public.legal_acceptances WHERE profile_id = $1`, [kept.profileId])).toContain('LEGAL_ACCEPTANCE_IMMUTABLE');
      const archivedProfile = await bareProfile(client);
      await client.query(
        `INSERT INTO public.legal_acceptances (profile_id, agreement_type, version, acceptance_source)
         SELECT $1, agreement_type, version, 'POST_LOGIN'
         FROM public.legal_document_versions
         WHERE agreement_type = 'CUSTOMER_EULA' AND retired_at IS NULL`,
        [archivedProfile],
      );
      const removed = await client.query(
        `DELETE FROM public.profiles WHERE id = $1 RETURNING id`,
        [archivedProfile],
      );
      expect(removed.rowCount).toBe(1);
      const archived = await client.query<{ document_hash: string }>(
        `SELECT document_hash FROM public.legal_acceptance_archives WHERE profile_id = $1`,
        [archivedProfile],
      );
      expect(archived.rows.length).toBe(1);
      expect(archived.rows[0].document_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect((await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.legal_acceptance_archives WHERE profile_id = $1`,
        [kept.profileId],
      )).rows[0].n).toBe(before.rows[0].n);

      await approveCurrentSnapshots(client);
      await activateAsReviewer(client, `now() - interval '45 days'`);
      await client.query(`SELECT set_config('otp.legal_catalogue_write', 'on', true)`);
      await client.query(`UPDATE public.legal_document_versions SET retired_at = now() WHERE retired_at IS NULL`);
      expect((await client.query(
        `SELECT private.legal_acceptance_status($1, 'CUSTOMER_EULA', now()) AS s`,
        [kept.profileId],
      )).rows[0].s).toBe('MISCONFIGURED');
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: kept.authUserId, role: 'authenticated' }),
      ]);
      const write = await errorOf(
        client,
        `INSERT INTO public.requirements (organization_id, created_by, title) VALUES ($1, $2, 'missing catalogue')`,
        [kept.orgId, kept.profileId],
      );
      expect(write).toContain('LEGAL_ENFORCEMENT_MISCONFIGURED');
      expect((await client.query(`SELECT enforcement_enabled FROM public.legal_enforcement_config`)).rows[0].enforcement_enabled).toBe(true);
    } finally {
      await client.query('ROLLBACK');
      const state = await committedState(client);
      expect(state.rows[0].enforced).toBe(false);
      expect(state.rows[0].approvals).toBe(0);
      await client.end();
    }
  });

  it('denies direct service-role mutation of legal evidence', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const stranger = await bareProfile(client);
      await client.query('SET LOCAL ROLE authenticated');
      expect(await errorOf(
        client,
        `SELECT public.grant_legal_reviewer(NULL, $1, true, true, true, true, 'authenticated-first-grant')`,
        [stranger],
      )).toContain('LEGAL_REVIEW_UNAUTHORIZED');
      await client.query('RESET ROLE');
      await client.query('SET LOCAL ROLE service_role');
      expect(await errorOf(
        client,
        `SELECT public.grant_legal_reviewer(NULL, $1, true, true, true, true, 'forged-first-grant')`,
        [stranger],
      )).toMatch(/permission denied/i);
      await client.query('RESET ROLE');
      await client.query(
        `SELECT public.grant_legal_reviewer(NULL, $1, true, false, false, false, 'owner-bootstrap')`,
        [stranger],
      );
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: stranger, role: 'authenticated' }),
      ]);
      await client.query('SET LOCAL ROLE service_role');
      expect(await errorOf(
        client,
        `SELECT public.record_legal_decision($1, gen_random_uuid(), 'APPROVED', 'forged-approval', NULL)`,
        [stranger],
      )).toMatch(/permission denied/i);
      expect(await errorOf(
        client,
        `SELECT public.activate_legal_enforcement(now(), $1)`,
        [stranger],
      )).toMatch(/permission denied/i);
      expect(await errorOf(
        client,
        `SELECT public.accept_legal_agreement('CUSTOMER_EULA', 'v-forged', 'sha256:' || repeat('ab', 32))`,
      )).toMatch(/permission denied/i);
      await client.query('RESET ROLE');
      await client.query('SET LOCAL ROLE authenticated');
      expect(await errorOf(
        client,
        `SELECT public.grant_legal_reviewer(NULL, $1, true, true, true, true, 'authenticated-bootstrap')`,
        [stranger],
      )).toContain('LEGAL_REVIEW_UNAUTHORIZED');
      await client.query('RESET ROLE');
      await client.query('SET LOCAL ROLE service_role');
      expect(await errorOf(
        client,
        `INSERT INTO public.legal_review_grants (profile_id, can_decide, external_record_ref)
         VALUES (gen_random_uuid(), true, 'bypass')`,
      )).toMatch(/permission denied/i);
      expect(await errorOf(
        client,
        `INSERT INTO public.legal_document_snapshots (agreement_type, version, document_hash, body)
         VALUES ('CUSTOMER_EULA', 'v-bypass', 'sha256:' || repeat('ab', 32), convert_to('bypass', 'UTF8'))`,
      )).toMatch(/permission denied/i);
      expect(await errorOf(
        client,
        `UPDATE public.legal_document_versions SET content_ref = 'bypass'`,
      )).toMatch(/permission denied/i);
      expect(await errorOf(
        client,
        `UPDATE public.legal_enforcement_config SET enforcement_enabled = true`,
      )).toMatch(/permission denied/i);
      expect(await errorOf(client, `DELETE FROM public.legal_acceptances`)).toMatch(/permission denied/i);
      await client.query('RESET ROLE');
    } finally {
      await client.query('ROLLBACK');
      const state = await committedState(client);
      expect(state.rows[0].enforced).toBe(false);
      expect(state.rows[0].approvals).toBe(0);
      await client.end();
    }
  });
});
