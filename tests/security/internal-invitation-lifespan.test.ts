/**
 * internal-invitation-lifespan.test.ts
 *
 * Verifies Phase 2 Internal Invitation Token Lifespan & State Rules (T-20):
 * Enforces strict 48-hour expiration ceiling and fail-closed state transitions.
 */

import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { LOCAL_POSTGRES_PORT } from '../helpers/local-postgres-sql-parity';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: LOCAL_POSTGRES_PORT,
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

describe('Internal Invitation Lifespan & State Integrity (T-20)', () => {
  it('enforces strict 48-hour expiration ceiling and fail-closed state rules (rolled back)', async () => {
    const client = await connect();
    if (!client) return;

    try {
      await client.query('BEGIN');
      await asOperator(client);

      // Fetch active platform admin profile
      const adminRes = await client.query<{ id: string }>(
        `SELECT id FROM public.profiles WHERE is_platform_admin = true AND status = 'ACTIVE' LIMIT 1`,
      );
      expect(adminRes.rows.length).toBeGreaterThan(0);
      const adminId = adminRes.rows[0].id;

      // Fetch INTERNAL_OPERATOR role
      const roleRes = await client.query<{ id: string }>(
        `SELECT id FROM public.internal_roles WHERE code = 'INTERNAL_OPERATOR' LIMIT 1`,
      );
      expect(roleRes.rows.length).toBeGreaterThan(0);
      const roleId = roleRes.rows[0].id;

      // T-20a: Attempt inserting with > 48 hours expiry (e.g., 72 hours)
      const err72h = await messageOf(
        client,
        `INSERT INTO public.internal_invitations (
           email, role_id, invited_by, invitation_token_hash, status, created_at, expires_at
         ) VALUES (
           'new-staff@otp.test', $1, $2, private.hash_invitation_token('token-72h-invalid'), 'PENDING',
           clock_timestamp(), clock_timestamp() + interval '72 hours'
         )`,
        [roleId, adminId],
      );
      expect(err72h).toContain('chk_internal_invitation_expiry');

      // T-20b: Attempt inserting with > 48 hours expiry (e.g., 48 hours and 1 minute)
      const err48h1m = await messageOf(
        client,
        `INSERT INTO public.internal_invitations (
           email, role_id, invited_by, invitation_token_hash, status, created_at, expires_at
         ) VALUES (
           'new-staff@otp.test', $1, $2, private.hash_invitation_token('token-48h1m-invalid'), 'PENDING',
           clock_timestamp(), clock_timestamp() + interval '48 hours 1 minute'
         )`,
        [roleId, adminId],
      );
      expect(err48h1m).toContain('chk_internal_invitation_expiry');

      // T-20c: Attempt inserting with expired/past timestamp
      const errPast = await messageOf(
        client,
        `INSERT INTO public.internal_invitations (
           email, role_id, invited_by, invitation_token_hash, status, created_at, expires_at
         ) VALUES (
           'new-staff@otp.test', $1, $2, private.hash_invitation_token('token-past-invalid'), 'PENDING',
           clock_timestamp(), clock_timestamp() - interval '1 hour'
         )`,
        [roleId, adminId],
      );
      expect(errPast).toContain('chk_internal_invitation_expiry');

      // T-20d: Legitimate 48-hour invitation succeeds
      const invId = randomUUID();
      const insertOk = await client.query(
        `INSERT INTO public.internal_invitations (
           id, email, role_id, invited_by, invitation_token_hash, status, created_at, expires_at
         ) VALUES (
           $1, 'new-staff@otp.test', $2, $3, private.hash_invitation_token('token-48h-valid'), 'PENDING',
           clock_timestamp(), clock_timestamp() + interval '48 hours'
         ) RETURNING id`,
        [invId, roleId, adminId],
      );
      expect(insertOk.rows[0].id).toBe(invId);

      // T-20e: Fail-closed state rule (Revoking without revoked_by or revoked_at fails)
      const errRevokeIncomplete = await messageOf(
        client,
        `UPDATE public.internal_invitations
         SET status = 'REVOKED'
         WHERE id = $1`,
        [invId],
      );
      expect(errRevokeIncomplete).toContain('chk_internal_invitation_state_rules');

      // T-20f: Complete revocation succeeds
      const updateOk = await client.query(
        `UPDATE public.internal_invitations
         SET status = 'REVOKED',
             revoked_by = $1,
             revoked_at = clock_timestamp(),
             revocation_reason = 'Invited by mistake'
         WHERE id = $2
         RETURNING status`,
        [adminId, invId],
      );
      expect(updateOk.rows[0].status).toBe('REVOKED');

    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
