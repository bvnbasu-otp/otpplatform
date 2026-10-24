/**
 * internal-staff-referrals.test.ts
 *
 * Verifies Phase 2 Internal Staff Referral Ledger (T-15 through T-19):
 * T-15: Anti-self-approval enforced (referrer cannot authorize or payout own referral).
 * T-16: Fail-closed salary/bonus constraint (awarded_amount_inr > 0 required for AUTHORIZED/SETTLED).
 * T-17: Canonical duplicate prevention (unique index blocks duplicate org referrals).
 * T-18: Verified payout evidence (bank UTR and structured reconciliation required for PROCESSED).
 * T-19: Atomic payout cancellation (rolls back achievement to RECORDED).
 */

import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: Number(process.env.LOCAL_PG_PORT ?? 54322),
  database: process.env.OTP_PG_DATABASE ?? 'postgres',
  user: 'postgres',
  password: 'postgres',
};

async function connect(): Promise<Client | null> {
  const client = new Client(LOCAL_POSTGRES);
  try {
    await client.connect();
    return client;
  } catch {
    console.warn('[SKIP REASON] local PostgreSQL unavailable at 127.0.0.1:54322');
    return null;
  }
}

async function asUser(client: Client, authUserId: string, email = 'user@example.test'): Promise<void> {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: authUserId, role: 'authenticated', email }),
  ]);
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authUserId]);
  await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
  await client.query('SET LOCAL ROLE authenticated');
}

async function asOperator(client: Client): Promise<void> {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', '', true)`);
  await client.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
  await client.query(`SELECT set_config('request.jwt.claim.role', '', true)`);
}

async function messageOf(client: Client, sql: string, params: unknown[] = []): Promise<string> {
  await client.query('SAVEPOINT probe');
  try {
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT probe');
    return '';
  } catch (err: any) {
    await client.query('ROLLBACK TO SAVEPOINT probe');
    return `${err?.code ?? ''} ${err?.message ?? ''}`;
  }
}

async function createPerson(client: Client, label: string, side: 'BUYER' | 'SUPPLIER' | 'CONSOLE' = 'CONSOLE'): Promise<string> {
  const id = randomUUID();
  const email = `${label.replace(/\s+/g, '-').toLowerCase()}-${id}@example.test`;
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
    `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin, active_portal_side, status)
     VALUES ($1, $1, $2, $3, false, $4, 'ACTIVE')`,
    [id, email, label, side],
  );
  return id;
}

describe('Internal Staff Referral Ledger (T-15 to T-19)', () => {
  it('enforces anti-self-approval, bonus constraints, duplicate prevention, payout evidence, and atomic cancellation (rolled back)', async () => {
    const client = await connect();
    if (!client) return;

    try {
      await client.query('BEGIN');
      await asOperator(client);

      // Fetch active platform admin profile
      const adminRes = await client.query<{ id: string; email: string }>(
        `SELECT id, email FROM public.profiles WHERE is_platform_admin = true AND status = 'ACTIVE' LIMIT 1`,
      );
      expect(adminRes.rows.length).toBeGreaterThan(0);
      const adminId = adminRes.rows[0].id;
      const adminEmail = adminRes.rows[0].email;

      // Create two staff members: Referrer (Alice) and Independent Approver (Bob)
      const referrerId = await createPerson(client, 'Staff Alice', 'CONSOLE');
      const approverId = await createPerson(client, 'Staff Bob', 'CONSOLE');

      // Assign both staff members to INTERNAL_OPERATOR role
      const roleRes = await client.query<{ id: string }>(
        `SELECT id FROM public.internal_roles WHERE code = 'INTERNAL_OPERATOR' LIMIT 1`,
      );
      const roleId = roleRes.rows[0].id;

      await client.query(
        `INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_by)
         VALUES ($1, $3, $4), ($2, $3, $4)`,
        [referrerId, approverId, roleId, adminId],
      );

      // Create customer organization
      const buyerOrgId = randomUUID();
      await client.query(
        `INSERT INTO public.organizations (id, name, org_type, status)
         VALUES ($1, 'Acme Engineering Ltd', 'ENTERPRISE', 'ACTIVE')`,
        [buyerOrgId],
      );

      // Fetch default referral plan
      const planRes = await client.query<{ id: string }>(
        `SELECT id FROM public.internal_referral_plans WHERE code = 'EMPLOYEE_REFERRAL_2026' LIMIT 1`,
      );
      expect(planRes.rows.length).toBeGreaterThan(0);
      const planId = planRes.rows[0].id;

      // 1. Record an achievement by Alice
      const achId = randomUUID();
      await client.query(
        `INSERT INTO public.internal_referral_achievements (
           id, plan_id, employee_profile_id, target_kind, referred_organization_id, referral_code, status
         ) VALUES (
           $1, $2, $3, 'BUYER_ORGANIZATION', $4, 'REF-ALICE-001', 'RECORDED'
         )`,
        [achId, planId, referrerId, buyerOrgId],
      );

      // T-15: Anti-Self-Approval via RPC (Alice cannot authorize her own referral)
      await asUser(client, referrerId);
      const errT15Rpc = await messageOf(
        client,
        `SELECT public.authorize_staff_referral_achievement($1, 10000)`,
        [achId],
      );
      expect(errT15Rpc).toContain('42501');
      expect(errT15Rpc).toContain('Anti-self-approval violation');

      // T-15 (Direct DB Constraint): Direct UPDATE where authorized_by = employee_profile_id
      await asOperator(client);
      const errT15Db = await messageOf(
        client,
        `UPDATE public.internal_referral_achievements
         SET status = 'AUTHORIZED',
             awarded_amount_inr = 10000,
             authorized_by = $1,
             authorized_at = clock_timestamp()
         WHERE id = $2`,
        [referrerId, achId],
      );
      expect(errT15Db).toContain('chk_staff_achievement_state_rules');

      // T-16: Bonus Constraint (awarded_amount_inr must be > 0 and NOT NULL for AUTHORIZED)
      const errT16Null = await messageOf(
        client,
        `UPDATE public.internal_referral_achievements
         SET status = 'AUTHORIZED',
             awarded_amount_inr = NULL,
             authorized_by = $1,
             authorized_at = clock_timestamp()
         WHERE id = $2`,
        [approverId, achId],
      );
      expect(errT16Null).toContain('chk_staff_achievement_state_rules');

      const errT16Zero = await messageOf(
        client,
        `UPDATE public.internal_referral_achievements
         SET status = 'AUTHORIZED',
             awarded_amount_inr = 0,
             authorized_by = $1,
             authorized_at = clock_timestamp()
         WHERE id = $2`,
        [approverId, achId],
      );
      expect(errT16Zero).toContain('chk_staff_achievement_state_rules');

      // T-17: Duplicate Referral Prevention (Unique index uq_staff_referral_org)
      const errT17 = await messageOf(
        client,
        `INSERT INTO public.internal_referral_achievements (
           id, plan_id, employee_profile_id, target_kind, referred_organization_id, referral_code, status
         ) VALUES (
           $1, $2, $3, 'BUYER_ORGANIZATION', $4, 'REF-BOB-DUPLICATE', 'RECORDED'
         )`,
        [randomUUID(), planId, approverId, buyerOrgId],
      );
      expect(errT17).toContain('uq_staff_referral_org');

      // Now authorize legitimately via independent approver Bob
      await asUser(client, approverId);
      const authRes = await client.query<{ authorize_staff_referral_achievement: { ok: boolean; payout_id: string } }>(
        `SELECT public.authorize_staff_referral_achievement($1, 15000) as authorize_staff_referral_achievement`,
        [achId],
      );
      expect(authRes.rows[0].authorize_staff_referral_achievement.ok).toBe(true);
      const payoutId = authRes.rows[0].authorize_staff_referral_achievement.payout_id;

      // T-18: Verified Payout Evidence (Without UTR or evidence fails)
      await asOperator(client);
      const errT18NoUtr = await messageOf(
        client,
        `UPDATE public.internal_referral_payouts
         SET status = 'PROCESSED',
             finance_reference_id = NULL,
             reconciliation_evidence = '{"bank":"HDFC"}'::jsonb,
             processed_by = $1,
             processed_at = clock_timestamp()
         WHERE id = $2`,
        [approverId, payoutId],
      );
      expect(errT18NoUtr).toContain('chk_staff_payout_state_rules');

      const errT18NoEvidence = await messageOf(
        client,
        `UPDATE public.internal_referral_payouts
         SET status = 'PROCESSED',
             finance_reference_id = 'UTR-HDFC-999888',
             reconciliation_evidence = '{}'::jsonb,
             processed_by = $1,
             processed_at = clock_timestamp()
         WHERE id = $2`,
        [approverId, payoutId],
      );
      expect(errT18NoEvidence).toContain('chk_staff_payout_state_rules');

      // T-19: Atomic Payout Cancellation & Achievement Rollback
      await asUser(client, approverId);
      const cancelRes = await client.query<{ cancel_staff_referral_payout: { ok: boolean; status: string } }>(
        `SELECT public.cancel_staff_referral_payout($1, 'Disqualified due to policy violation') as cancel_staff_referral_payout`,
        [payoutId],
      );
      expect(cancelRes.rows[0].cancel_staff_referral_payout.ok).toBe(true);

      // Check that payout is CANCELLED and achievement is rolled back to RECORDED
      const payoutCheck = await client.query<{ status: string; cancellation_reason: string }>(
        `SELECT status, cancellation_reason FROM public.internal_referral_payouts WHERE id = $1`,
        [payoutId],
      );
      expect(payoutCheck.rows[0].status).toBe('CANCELLED');
      expect(payoutCheck.rows[0].cancellation_reason).toBe('Disqualified due to policy violation');

      const achCheck = await client.query<{ status: string; awarded_amount_inr: string | null; authorized_by: string | null }>(
        `SELECT status, awarded_amount_inr, authorized_by FROM public.internal_referral_achievements WHERE id = $1`,
        [achId],
      );
      expect(achCheck.rows[0].status).toBe('RECORDED');
      expect(achCheck.rows[0].awarded_amount_inr).toBeNull();
      expect(achCheck.rows[0].authorized_by).toBeNull();

    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
