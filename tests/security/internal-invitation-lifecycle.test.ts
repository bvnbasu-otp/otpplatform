/**
 * Behavioral checks for the internal invitation lifecycle on disposable local
 * Postgres (127.0.0.1:54322). Never a hosted database. Fixture rows are rolled
 * back, or deleted in finally after the concurrency case. Existing founder and
 * Yahoo profiles are compared and must stay unchanged.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: Number(process.env.OTP_PG_PORT ?? 54322),
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

async function asOperator(client: Client): Promise<void> {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', '', true)`);
  await client.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
  await client.query(`SELECT set_config('request.jwt.claim.role', '', true)`);
}

async function asUser(client: Client, authUserId: string, email: string): Promise<void> {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: authUserId, role: 'authenticated', email }),
  ]);
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authUserId]);
  await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
  await client.query('SET LOCAL ROLE authenticated');
}

async function privilegeSnapshot(client: Client): Promise<string> {
  const res = await client.query(
    `SELECT id::text, is_platform_admin, is_founder, COALESCE(status, '') AS status, (deleted_at IS NULL) AS alive
     FROM public.profiles
     WHERE is_founder IS TRUE OR position('yahoo' in lower(email)) > 0
     ORDER BY id`,
  );
  return JSON.stringify(res.rows);
}

async function createAccount(
  client: Client,
  email: string,
  options: { admin?: boolean; status?: string; confirmed?: boolean },
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       email_change_token_current, phone_change, phone_change_token, reauthentication_token,
       is_super_admin, is_sso_user, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) VALUES (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       extensions.crypt('not-a-login', extensions.gen_salt('bf')), $3,
       '', '', '', '', '', '', '', '', false, false, false,
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
     )`,
    [id, email, options.confirmed === false ? null : new Date()],
  );
  await client.query(
    `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin, active_portal_side, status)
     VALUES ($1, $1, $2, 'Invitation Fixture', false, $3, $4)`,
    [id, email, options.admin ? 'CONSOLE' : 'BUYER', options.status ?? 'ACTIVE'],
  );
  if (options.admin) {
    await client.query(`SELECT set_config('otp.platform_privilege_write', 'on', true)`);
    await client.query(`UPDATE public.profiles SET is_platform_admin = true WHERE id = $1`, [id]);
    await client.query(`SELECT set_config('otp.platform_privilege_write', 'off', true)`);
  }
  return id;
}

async function callRpc(
  client: Client,
  sql: string,
  params: unknown[],
): Promise<{ result: Record<string, unknown> | null; error: string }> {
  await client.query('SAVEPOINT probe');
  try {
    const res = await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT probe');
    return { result: res.rows[0]?.result ?? null, error: '' };
  } catch (err: any) {
    await client.query('ROLLBACK TO SAVEPOINT probe');
    return { result: null, error: `${err?.code ?? ''} ${err?.message ?? err}` };
  }
}

async function requireLifecycle(client: Client): Promise<void> {
  const ready = await client.query(
    `SELECT to_regprocedure('public.accept_internal_invitation_atomic(text)') IS NOT NULL AS ready`,
  );
  if (!ready.rows[0]?.ready) {
    throw new Error('00314 accept_internal_invitation_atomic is not installed on local Postgres');
  }
}

describe('internal invitation lifecycle on local Postgres', () => {
  it('stores only a hash, hides it from clients, and rejects unauthorized or SUPER_ADMIN creation', async () => {
    const client = await connect();
    if (!client) return;

    try {
      await client.query('BEGIN');
      await asOperator(client);
      await requireLifecycle(client);
      const before = await privilegeSnapshot(client);

      const role = await client.query<{ id: string }>(
        `SELECT id FROM public.internal_roles WHERE code = 'INTERNAL_OPERATOR' LIMIT 1`,
      );
      const superRole = await client.query<{ id: string }>(
        `SELECT id FROM public.internal_roles WHERE code = 'SUPER_ADMIN' LIMIT 1`,
      );
      expect(role.rows.length).toBe(1);
      expect(superRole.rows.length).toBe(1);

      const adminEmail = `invite-admin-${randomUUID()}@otp.test`;
      const staffEmail = `invite-staff-${randomUUID()}@otp.test`;
      const adminId = await createAccount(client, adminEmail, { admin: true });
      await createAccount(client, staffEmail, { confirmed: true });

      await client.query('SET ROLE anon');
      const anonCreate = await callRpc(
        client,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [staffEmail, role.rows[0].id],
      );
      expect(anonCreate.error.toLowerCase()).toContain('permission denied');
      await client.query('RESET ROLE');

      const plainUserEmail = `invite-plain-${randomUUID()}@otp.test`;
      const plainId = await createAccount(client, plainUserEmail, { confirmed: true });
      await asUser(client, plainId, 'jwt-does-not-grant-admin@otp.test');
      const plainCreate = await callRpc(
        client,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [staffEmail, role.rows[0].id],
      );
      expect(plainCreate.error).toContain('Only an authenticated platform administrator');

      await asUser(client, adminId, 'jwt-email-is-not-consulted@otp.test');
      const superCreate = await callRpc(
        client,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [staffEmail, superRole.rows[0].id],
      );
      expect(superCreate.error).toContain('SUPER_ADMIN cannot be granted through ordinary invitations');

      const created = await callRpc(
        client,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [staffEmail, role.rows[0].id],
      );
      expect(created.error).toBe('');
      const first = created.result as { token: string; invitationId: string; roleCode: string };
      expect(first.roleCode).toBe('INTERNAL_OPERATOR');
      expect(first.token).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.keys(first)).not.toContain('invitation_token_hash');

      const secondCall = await callRpc(
        client,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [staffEmail, role.rows[0].id],
      );
      const second = secondCall.result as { token: string; invitationId: string };
      expect(second.token).toMatch(/^[0-9a-f]{64}$/);
      expect(second.token).not.toBe(first.token);

      await asOperator(client);
      const directSuper = await callRpc(
        client,
        `INSERT INTO public.internal_invitations (
           email, role_id, invited_by, invitation_token_hash, status, expires_at
         ) VALUES (
           $1, $2, $3, private.hash_invitation_token($4), 'PENDING', clock_timestamp() + interval '1 hour'
         )`,
        [`super-${randomUUID()}@otp.test`, superRole.rows[0].id, adminId, `super-token-${randomUUID()}`],
      );
      expect(directSuper.error).toContain('SUPER_ADMIN cannot be granted through ordinary invitations');

      const stored = await client.query<{ matches: boolean; pending_count: string; revoked_reason: string | null }>(
        `SELECT
           invitation_token_hash = private.hash_invitation_token($2) AS matches,
           (SELECT count(*) FROM public.internal_invitations WHERE lower(email) = lower($3) AND status = 'PENDING')::text AS pending_count,
           (SELECT revocation_reason FROM public.internal_invitations WHERE id = $1) AS revoked_reason
         FROM public.internal_invitations
         WHERE id = $4`,
        [first.invitationId, second.token, staffEmail, second.invitationId],
      );
      expect(stored.rows[0].matches).toBe(true);
      expect(stored.rows[0].pending_count).toBe('1');
      expect(stored.rows[0].revoked_reason).toBe('Superseded by a newer invitation');

      const plaintext = await client.query(
        `SELECT count(*)::int AS n
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'internal_invitations'
           AND column_name = 'invitation_token'`,
      );
      expect(plaintext.rows[0].n).toBe(0);

      const audit = await client.query<{ no_token: boolean; no_hash: boolean; actor_ok: boolean }>(
        `SELECT NOT (payload ? 'token') AS no_token,
                NOT (payload ? 'invitation_token_hash') AS no_hash,
                actor_id = $2 AS actor_ok
         FROM public.audit_events
         WHERE entity_id = $1 AND event_type = 'internal_invitation.created'`,
        [second.invitationId, adminId],
      );
      expect(audit.rows[0]).toEqual({ no_token: true, no_hash: true, actor_ok: true });

      await asUser(client, adminId, adminEmail);
      const hashRead = await callRpc(
        client,
        `SELECT invitation_token_hash AS result FROM public.internal_invitations WHERE id = $1`,
        [second.invitationId],
      );
      expect(hashRead.error.toLowerCase()).toContain('permission denied');
      const emailRead = await client.query(`SELECT email FROM public.internal_invitations WHERE id = $1`, [
        second.invitationId,
      ]);
      expect(emailRead.rows[0].email).toBe(staffEmail);
      const directWrite = await callRpc(
        client,
        `INSERT INTO public.internal_invitations (
           email, role_id, invited_by, invitation_token_hash, status, expires_at
         ) VALUES (
           $1, $2, $3, private.hash_invitation_token('client-write'), 'PENDING', clock_timestamp() + interval '1 hour'
         )`,
        [`other-${randomUUID()}@otp.test`, role.rows[0].id, adminId],
      );
      expect(directWrite.error.toLowerCase()).toContain('permission denied');

      await asOperator(client);
      expect(await privilegeSnapshot(client)).toBe(before);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end();
    }
  });

  it('accepts only a verified matching email once, and reconciliation does not grant a role', async () => {
    const client = await connect();
    if (!client) return;

    try {
      await client.query('BEGIN');
      await asOperator(client);
      await requireLifecycle(client);
      const before = await privilegeSnapshot(client);
      const roleId = (await client.query<{ id: string }>(
        `SELECT id FROM public.internal_roles WHERE code = 'FINANCE_OPERATOR' LIMIT 1`,
      )).rows[0].id;

      const adminId = await createAccount(client, `invite-admin-${randomUUID()}@otp.test`, { admin: true });
      const staffEmail = `invite-staff-${randomUUID()}@otp.test`;
      const staffId = await createAccount(client, staffEmail, { confirmed: true });
      const otherId = await createAccount(client, `invite-other-${randomUUID()}@otp.test`, { confirmed: true });
      const unverifiedEmail = `invite-unverified-${randomUUID()}@otp.test`;
      const unverifiedId = await createAccount(client, unverifiedEmail, { confirmed: false });
      const pendingEmail = `invite-pending-${randomUUID()}@otp.test`;
      const pendingId = await createAccount(client, pendingEmail, { confirmed: true, status: 'PENDING' });
      await client.query(`UPDATE public.profiles SET status = 'PENDING' WHERE id = $1`, [pendingId]);

      await asUser(client, adminId, 'jwt-ignored@otp.test');
      const created = await callRpc(
        client,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [staffEmail, roleId],
      );
      const token = String((created.result as { token: string }).token);
      const invitationId = String((created.result as { invitationId: string }).invitationId);

      await asUser(client, otherId, staffEmail);
      const wrongEmail = await callRpc(
        client,
        `SELECT public.accept_internal_invitation_atomic($1) AS result`,
        [token],
      );
      expect(wrongEmail.result).toMatchObject({ ok: false });
      expect(String((wrongEmail.result as { error: string }).error)).toContain('different email address');
      expect(String((wrongEmail.result as { error: string }).error)).not.toContain(staffEmail);

      await asUser(client, unverifiedId, unverifiedEmail);
      const unverifiedInvite = await callRpc(
        client,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [unverifiedEmail, roleId],
      );
      expect(unverifiedInvite.error).toContain('Only an authenticated platform administrator');
      await asUser(client, adminId, adminId);
      const unverifiedCreated = await callRpc(
        client,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [unverifiedEmail, roleId],
      );
      const unverifiedToken = String((unverifiedCreated.result as { token: string }).token);
      await asUser(client, unverifiedId, 'jwt-claims-verified@otp.test');
      const unverifiedAccept = await callRpc(
        client,
        `SELECT public.accept_internal_invitation_atomic($1) AS result`,
        [unverifiedToken],
      );
      expect(unverifiedAccept.result).toMatchObject({ ok: false });
      expect(String((unverifiedAccept.result as { error: string }).error)).toContain('Verify the signed-in email');

      await asOperator(client);
      await client.query(
        `INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
         VALUES ('profile.email_verified', $1::uuid, 'profile', $2::text, jsonb_build_object('credential_value', $3::text))`,
        [unverifiedId, unverifiedId, unverifiedEmail],
      );
      await asUser(client, unverifiedId, 'still-not-the-database-email@otp.test');
      const otpAccept = await callRpc(
        client,
        `SELECT public.accept_internal_invitation_atomic($1) AS result`,
        [unverifiedToken],
      );
      expect(otpAccept.result).toMatchObject({ ok: true, alreadyAccepted: false, roleCode: 'FINANCE_OPERATOR' });

      await asUser(client, adminId, adminId);
      const pendingCreated = await callRpc(
        client,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [pendingEmail, roleId],
      );
      const pendingToken = String((pendingCreated.result as { token: string }).token);
      await asUser(client, pendingId, pendingEmail);
      const pendingAccept = await callRpc(
        client,
        `SELECT public.accept_internal_invitation_atomic($1) AS result`,
        [pendingToken],
      );
      expect(String((pendingAccept.result as { error: string }).error)).toContain('not eligible');

      await asUser(client, staffId, 'attacker@otp.test');
      const accepted = await callRpc(
        client,
        `SELECT public.accept_internal_invitation_atomic($1) AS result`,
        [token],
      );
      expect(accepted.result).toMatchObject({ ok: true, alreadyAccepted: false, roleCode: 'FINANCE_OPERATOR' });
      const replay = await callRpc(
        client,
        `SELECT public.accept_internal_invitation_atomic($1) AS result`,
        [token],
      );
      expect(replay.result).toMatchObject({ ok: true, alreadyAccepted: true });

      await asOperator(client);
      const grants = await client.query<{ assignments: string; still_admin: boolean }>(
        `SELECT
           (SELECT count(*) FROM public.internal_user_assignments WHERE profile_id = $1 AND role_id = $2)::text AS assignments,
           (SELECT is_platform_admin FROM public.profiles WHERE id = $1) AS still_admin`,
        [staffId, roleId],
      );
      expect(grants.rows[0].assignments).toBe('1');
      expect(grants.rows[0].still_admin).toBe(false);

      await asUser(client, staffId, staffEmail);
      const missing = await callRpc(
        client,
        `SELECT public.accept_internal_invitation_atomic($1) AS result`,
        ['0'.repeat(64)],
      );
      expect(missing.result).toMatchObject({ ok: false });
      expect(String((missing.result as { error: string }).error)).toContain('invalid');

      await asOperator(client);
      const expiredEmail = `invite-expired-${randomUUID()}@otp.test`;
      const expiredUser = await createAccount(client, expiredEmail, { confirmed: true });
      await asUser(client, adminId, adminId);
      const expiredCreated = await callRpc(
        client,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [expiredEmail, roleId],
      );
      const expiredId = String((expiredCreated.result as { invitationId: string }).invitationId);
      const expiredToken = String((expiredCreated.result as { token: string }).token);
      await asOperator(client);
      await client.query(
        `UPDATE public.internal_invitations
         SET created_at = clock_timestamp() - interval '2 hours',
             expires_at = clock_timestamp() - interval '1 minute'
         WHERE id = $1`,
        [expiredId],
      );
      await asUser(client, expiredUser, expiredEmail);
      const expiredAccept = await callRpc(
        client,
        `SELECT public.accept_internal_invitation_atomic($1) AS result`,
        [expiredToken],
      );
      expect(String((expiredAccept.result as { error: string }).error).toLowerCase()).toContain('expired');

      await asOperator(client);
      const revokeEmail = `invite-revoke-${randomUUID()}@otp.test`;
      await createAccount(client, revokeEmail, { confirmed: true });
      await asUser(client, adminId, adminId);
      const revokeCreated = await callRpc(
        client,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [revokeEmail, roleId],
      );
      const revokeId = String((revokeCreated.result as { invitationId: string }).invitationId);
      const revokeToken = String((revokeCreated.result as { token: string }).token);
      const blank = await callRpc(
        client,
        `SELECT public.revoke_internal_invitation_atomic($1, $2) AS result`,
        [revokeId, '   '],
      );
      expect(blank.error).toContain('A reason is required');
      const revoked = await callRpc(
        client,
        `SELECT public.revoke_internal_invitation_atomic($1, $2) AS result`,
        [revokeId, 'Issued to the wrong team'],
      );
      expect(revoked.result).toMatchObject({ ok: true, status: 'REVOKED' });
      await asOperator(client);
      const revokeRow = await client.query<{ actor_ok: boolean; reason_ok: boolean; audit_ok: boolean }>(
        `SELECT i.revoked_by = $2 AS actor_ok,
                i.revocation_reason = 'Issued to the wrong team' AS reason_ok,
                EXISTS (
                  SELECT 1 FROM public.audit_events a
                  WHERE a.entity_id = i.id::text
                    AND a.event_type = 'internal_invitation.revoked'
                    AND a.actor_id = $2
                    AND NOT (a.payload ? 'token')
                    AND NOT (a.payload ? 'invitation_token_hash')
                ) AS audit_ok
         FROM public.internal_invitations i
         WHERE i.id = $1`,
        [revokeId, adminId],
      );
      expect(revokeRow.rows[0]).toEqual({ actor_ok: true, reason_ok: true, audit_ok: true });
      await asUser(client, adminId, adminId);
      const acceptRevoked = await callRpc(
        client,
        `SELECT public.accept_internal_invitation_atomic($1) AS result`,
        [revokeToken],
      );
      expect(String((acceptRevoked.result as { error: string }).error)).toContain('revoked');

      await asOperator(client);
      const reconcileEmail = `invite-reconcile-${randomUUID()}@otp.test`;
      const reconcileUser = await createAccount(client, reconcileEmail, { confirmed: true });
      await asUser(client, adminId, adminId);
      const reconcileCreated = await callRpc(
        client,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [reconcileEmail, roleId],
      );
      const reconcileId = String((reconcileCreated.result as { invitationId: string }).invitationId);
      const noGrant = await callRpc(
        client,
        `SELECT public.reconcile_internal_invitation_atomic($1) AS result`,
        [reconcileId],
      );
      expect(noGrant.result).toMatchObject({ ok: false });
      await asOperator(client);
      const beforeGrant = await client.query(
        `SELECT count(*)::text AS n FROM public.internal_user_assignments WHERE profile_id = $1`,
        [reconcileUser],
      );
      expect(beforeGrant.rows[0].n).toBe('0');
      await client.query(
        `INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_by)
         VALUES ($1, $2, $3)`,
        [reconcileUser, roleId, adminId],
      );
      await asUser(client, adminId, adminId);
      const reconciled = await callRpc(
        client,
        `SELECT public.reconcile_internal_invitation_atomic($1) AS result`,
        [reconcileId],
      );
      expect(reconciled.result).toMatchObject({ ok: true, reconciled: true, roleCode: 'FINANCE_OPERATOR' });
      await asOperator(client);
      const afterGrant = await client.query<{ n: string; admin: boolean }>(
        `SELECT count(*)::text AS n,
                (SELECT is_platform_admin FROM public.profiles WHERE id = $1) AS admin
         FROM public.internal_user_assignments
         WHERE profile_id = $1 AND role_id = $2`,
        [reconcileUser, roleId],
      );
      expect(afterGrant.rows[0]).toEqual({ n: '1', admin: false });

      const triggers = await client.query(
        `SELECT count(*)::int AS n
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE ns.nspname = 'auth'
           AND c.relname = 'users'
           AND NOT t.tgisinternal
           AND pg_get_triggerdef(t.oid) ILIKE '%internal_invitation%'`,
      );
      expect(triggers.rows[0].n).toBe(0);
      const roleContext = await client.query<{ clean: boolean }>(
        `SELECT pg_get_functiondef('public.my_role_context()'::regprocedure) NOT ILIKE '%internal_invitations%' AS clean`,
      );
      expect(roleContext.rows[0].clean).toBe(true);
      expect(await privilegeSnapshot(client)).toBe(before);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end();
    }
  });

  it('lets only one concurrent acceptance grant the invited role', async () => {
    const setup = await connect();
    if (!setup) return;
    const a = await connect();
    const b = await connect();
    const watch = await connect();
    if (!a || !b || !watch) {
      await setup.end();
      await a?.end();
      await b?.end();
      await watch?.end();
      return;
    }

    let adminId = '';
    let staffId = '';
    let invitationId = '';
    try {
      await setup.query('BEGIN');
      await asOperator(setup);
      await requireLifecycle(setup);
      const before = await privilegeSnapshot(setup);
      const roleId = (await setup.query<{ id: string }>(
        `SELECT id FROM public.internal_roles WHERE code = 'CATALOG_MANAGER' LIMIT 1`,
      )).rows[0].id;
      const staffEmail = `invite-concurrent-${randomUUID()}@otp.test`;
      adminId = await createAccount(setup, `invite-admin-${randomUUID()}@otp.test`, { admin: true });
      staffId = await createAccount(setup, staffEmail, { confirmed: true });
      await asUser(setup, adminId, adminId);
      const created = await callRpc(
        setup,
        `SELECT public.create_internal_invitation_atomic($1, $2) AS result`,
        [staffEmail, roleId],
      );
      expect(created.error).toBe('');
      invitationId = String((created.result as { invitationId: string }).invitationId);
      const token = String((created.result as { token: string }).token);
      await asOperator(setup);
      expect(await privilegeSnapshot(setup)).toBe(before);
      await setup.query('COMMIT');

      await a.query('BEGIN');
      await a.query(`SELECT id FROM public.internal_invitations WHERE id = $1 FOR UPDATE`, [invitationId]);
      await asUser(a, staffId, 'jwt-ignored@otp.test');
      await b.query('BEGIN');
      await asUser(b, staffId, 'jwt-ignored@otp.test');
      const bPending = b.query(`SELECT public.accept_internal_invitation_atomic($1) AS result`, [token]);
      let waiting = false;
      for (let i = 0; i < 20; i += 1) {
        const locks = await watch.query(
          `SELECT count(*)::int AS n
           FROM pg_stat_activity
           WHERE state = 'active'
             AND wait_event_type = 'Lock'
             AND query ILIKE '%accept_internal_invitation_atomic%'`,
        );
        if (locks.rows[0].n > 0) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(waiting).toBe(true);
      const aResult = await a.query(`SELECT public.accept_internal_invitation_atomic($1) AS result`, [token]);
      await a.query('COMMIT');
      const bResult = await bPending;
      await b.query('COMMIT');

      expect(aResult.rows[0].result).toMatchObject({ ok: true, alreadyAccepted: false, roleCode: 'CATALOG_MANAGER' });
      expect(bResult.rows[0].result).toMatchObject({ ok: true, alreadyAccepted: true });
      const count = await watch.query(
        `SELECT count(*)::text AS n
         FROM public.internal_user_assignments
         WHERE profile_id = $1 AND role_id = $2`,
        [staffId, roleId],
      );
      expect(count.rows[0].n).toBe('1');
      expect(await privilegeSnapshot(watch)).toBe(before);
    } finally {
      await a.query('ROLLBACK').catch(() => undefined);
      await b.query('ROLLBACK').catch(() => undefined);
      await setup.query('ROLLBACK').catch(() => undefined);
      if (invitationId) {
        await watch.query('ALTER TABLE public.audit_events DISABLE TRIGGER USER').catch(() => undefined);
        await watch.query(
          `DELETE FROM public.audit_events
           WHERE entity_id = $1 OR actor_id = ANY($2::uuid[])`,
          [invitationId, [adminId, staffId].filter(Boolean)],
        ).catch(() => undefined);
        await watch.query('ALTER TABLE public.audit_events ENABLE TRIGGER USER').catch(() => undefined);
        await watch.query(`DELETE FROM public.internal_user_assignments WHERE profile_id = ANY($1::uuid[])`, [[adminId, staffId].filter(Boolean)]).catch(() => undefined);
        await watch.query(`DELETE FROM public.internal_invitations WHERE id = $1 OR invited_by = ANY($2::uuid[]) OR accepted_profile_id = ANY($2::uuid[])`, [invitationId, [adminId, staffId].filter(Boolean)]).catch(() => undefined);
        await watch.query(`DELETE FROM public.profiles WHERE id = ANY($1::uuid[])`, [[adminId, staffId].filter(Boolean)]).catch(() => undefined);
        await watch.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [[adminId, staffId].filter(Boolean)]).catch(() => undefined);
      }
      await setup.end();
      await a.end();
      await b.end();
      await watch.end();
    }
  });
});
