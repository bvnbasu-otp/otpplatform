/**
 * 00308 notification preference authorization.
 * Every case rolls back. It does not delete existing rows.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { DEMO } from '../helpers/demo-fixtures';

const LOCAL = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

const SAVE = `SELECT public.update_notification_preferences_atomic(
  $1, $2, '{"EMAIL": false, "IN_APP": true, "WHATSAPP": true, "SMS": false}'::jsonb,
  ARRAY['MARKETING']::text[], '9000000000', 'buyer@example.test', '09:00', '18:00'
) AS r`;

async function withRollback(run: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client(LOCAL);
  await client.connect();
  try {
    await client.query('BEGIN');
    await run(client);
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    await client.end();
  }
}

async function profileFor(client: Client, email: string): Promise<{ id: string; authUserId: string }> {
  const { rows } = await client.query<{ id: string; auth_user_id: string }>(
    `SELECT id, auth_user_id FROM public.profiles WHERE email = $1`,
    [email],
  );
  if (!rows[0]?.auth_user_id) throw new Error(`missing profile for ${email}`);
  return { id: rows[0].id, authUserId: rows[0].auth_user_id };
}

async function actAs(client: Client, authUserId: string): Promise<void> {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authUserId]);
  await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: authUserId, role: 'authenticated' }),
  ]);
  await client.query('SET LOCAL ROLE authenticated');
}

async function captureError(client: Client, sql: string, params: unknown[] = []): Promise<string> {
  await client.query('SAVEPOINT otp_expect_error');
  let message = '';
  try {
    await client.query(sql, params);
  } catch (error) {
    message = (error as Error).message;
  }
  await client.query('ROLLBACK TO SAVEPOINT otp_expect_error');
  return message;
}

describe('00308 notification preference profile authorization', () => {
  it('saves for the caller whose auth UUID differs from their profile UUID, then upserts the same row', async () => {
    await withRollback(async (client) => {
      const buyer = await profileFor(client, DEMO.logins.sunriseManager);
      expect(buyer.id).not.toBe(buyer.authUserId);
      await actAs(client, buyer.authUserId);
      const first = await client.query<{ r: { success: boolean; preference_id: string; user_id: string } }>(
        SAVE,
        [buyer.id, DEMO.orgs.sunrise],
      );
      expect(first.rows[0].r.success).toBe(true);
      expect(first.rows[0].r.user_id).toBe(buyer.id);
      const second = await client.query<{ r: { preference_id: string } }>(
        `SELECT public.update_notification_preferences_atomic(
           $1, $2, '{"EMAIL": true, "IN_APP": true}'::jsonb, ARRAY[]::text[], NULL, NULL, NULL, NULL
         ) AS r`,
        [buyer.id, DEMO.orgs.sunrise],
      );
      expect(second.rows[0].r.preference_id).toBe(first.rows[0].r.preference_id);
      const stored = await client.query<{ email: boolean; marketing: string[] }>(
        `SELECT (channel_preferences->>'EMAIL')::boolean AS email, category_opt_outs AS marketing
         FROM public.notification_preferences WHERE id = $1`,
        [first.rows[0].r.preference_id],
      );
      expect(stored.rows[0].email).toBe(true);
      expect(stored.rows[0].marketing).toEqual([]);
    });
  });

  it('upserts one personal preference row when organization_id is null', async () => {
    await withRollback(async (client) => {
      const buyer = await profileFor(client, DEMO.logins.qaBuyer);
      await actAs(client, buyer.authUserId);
      const first = await client.query<{ r: { preference_id: string } }>(
        `SELECT public.update_notification_preferences_atomic(
           $1, NULL, '{"WHATSAPP": true, "SMS": true, "EMAIL": false, "IN_APP": true}'::jsonb,
           ARRAY[]::text[], NULL, NULL, NULL, NULL
         ) AS r`,
        [buyer.id],
      );
      const second = await client.query<{ r: { preference_id: string } }>(
        `SELECT public.update_notification_preferences_atomic(
           $1, NULL, '{"WHATSAPP": false, "SMS": true, "EMAIL": true, "IN_APP": true}'::jsonb,
           ARRAY[]::text[], NULL, NULL, NULL, NULL
         ) AS r`,
        [buyer.id],
      );
      expect(second.rows[0].r.preference_id).toBe(first.rows[0].r.preference_id);
      const stored = await client.query<{ n: string; whatsapp: boolean; email: boolean }>(
        `SELECT count(*)::text AS n,
                bool_and((channel_preferences->>'WHATSAPP')::boolean) AS whatsapp,
                bool_and((channel_preferences->>'EMAIL')::boolean) AS email
         FROM public.notification_preferences
         WHERE user_id = $1 AND organization_id IS NULL`,
        [buyer.id],
      );
      expect(stored.rows[0]).toEqual({ n: '1', whatsapp: false, email: true });
    });
  });

  it('rejects another profile, an unknown caller, and a session with no auth subject', async () => {
    await withRollback(async (client) => {
      const buyer = await profileFor(client, DEMO.logins.sunriseManager);
      const rival = await profileFor(client, DEMO.logins.kovaiOwner);
      await actAs(client, buyer.authUserId);
      const cross = await captureError(client, SAVE, [rival.id, DEMO.orgs.kovai]);
      expect(cross).toMatch(/AUTH-01/);

      await client.query('RESET ROLE');
      await actAs(client, randomUUID());
      const unknown = await captureError(client, SAVE, [buyer.id, DEMO.orgs.sunrise]);
      expect(unknown).toMatch(/AUTH-01/);

      await client.query('RESET ROLE');
      await client.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
      await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
      await client.query(`SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true)`);
      const unauthenticated = await captureError(client, SAVE, [buyer.id, DEMO.orgs.sunrise]);
      expect(unauthenticated).toMatch(/AUTH-01/);

      const leftover = await client.query(
        `SELECT id FROM public.notification_preferences WHERE user_id = $1 AND email = 'buyer@example.test'`,
        [buyer.id],
      );
      expect(leftover.rowCount).toBe(0);
    });
  });

  it('allows a platform admin and a service-role session to update another profile', async () => {
    await withRollback(async (client) => {
      const buyer = await profileFor(client, DEMO.logins.qaBuyer);
      const admin = await client.query<{ id: string; auth_user_id: string }>(
        `SELECT id, auth_user_id FROM public.profiles
         WHERE is_platform_admin = true AND auth_user_id IS NOT NULL AND id <> $1
         LIMIT 1`,
        [buyer.id],
      );
      expect(admin.rowCount).toBe(1);
      await actAs(client, admin.rows[0].auth_user_id);
      const asAdmin = await client.query<{ r: { success: boolean } }>(SAVE, [buyer.id, null]);
      expect(asAdmin.rows[0].r.success).toBe(true);

      await client.query('RESET ROLE');
      await client.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
      await client.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      await client.query('SET LOCAL ROLE service_role');
      const asService = await client.query<{ r: { success: boolean } }>(
        `SELECT public.update_notification_preferences_atomic(
           $1, NULL, '{"EMAIL": true, "IN_APP": false}'::jsonb, ARRAY[]::text[], NULL, NULL, NULL, NULL
         ) AS r`,
        [buyer.id],
      );
      expect(asService.rows[0].r.success).toBe(true);
    });
  });
});
