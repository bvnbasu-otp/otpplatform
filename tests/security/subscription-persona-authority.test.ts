/**
 * Subscription columns and record_verified_payment, local Docker only.
 * Buyer, RWA member, RWA manager, MSME non-owner, supplier, platform admin,
 * and an unauthenticated role. The transaction rolls back.
 *
 * organization_members.role has no DELEGATE value. The MSME case uses the
 * stored non-owner role (APPROVER, then COMMITTEE_MEMBER, then BUYER).
 */
import { Client, type ClientConfig } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { isLocalSupabaseReachable } from '../helpers/supabase-local';

const LOCAL_PG: ClientConfig = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

const PAYMENT_FN =
  'public.record_verified_payment(text,uuid,uuid,numeric,text,text,text,text,text,text,jsonb)';

const HIDDEN_ADMIN_EMAILS = [
  'admin@otp.test',
  'bvnbasu@gmail.com',
  'ops@otp.test',
  'superadmin@otp.test',
  'admin@otp.ai',
  'ops@otp.ai',
  'admin@procureos.test',
];

type Persona = {
  label: string;
  authUserId: string;
  orgId: string;
};

let dbUp = false;

async function asAuthenticated<T>(
  c: Client,
  authUserId: string | null,
  role: 'authenticated' | 'anon',
  fn: () => Promise<T>,
): Promise<T> {
  await c.query('SAVEPOINT persona');
  try {
    if (authUserId) {
      await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authUserId]);
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: authUserId, role }),
      ]);
    } else {
      await c.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ role }),
      ]);
    }
    await c.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [role]);
    await c.query(`SET LOCAL ROLE ${role}`);
    const value = await fn();
    await c.query('ROLLBACK TO SAVEPOINT persona');
    return value;
  } catch (error) {
    await c.query('ROLLBACK TO SAVEPOINT persona');
    throw error;
  }
}

describe('subscription persona authority (local postgres)', () => {
  beforeAll(async () => {
    dbUp = await isLocalSupabaseReachable();
  });

  it('blocks client subscription writes and client payment execution for every non-service persona', async () => {
    if (!dbUp) return;
    const c = new Client(LOCAL_PG);
    await c.connect();
    try {
      await c.query('BEGIN');
      const hidden = HIDDEN_ADMIN_EMAILS;
      const members = await c.query<{
        auth_user_id: string;
        org_id: string;
        org_type: string;
        role: string;
      }>(
        `SELECT p.auth_user_id, o.id AS org_id, o.org_type, m.role
         FROM organization_members m
         JOIN profiles p ON p.id = m.profile_id
         JOIN organizations o ON o.id = m.organization_id
         WHERE p.auth_user_id IS NOT NULL
           AND COALESCE(p.is_platform_admin, false) = false
           AND lower(coalesce(p.email, '')) <> ALL($1::text[])
           AND NOT EXISTS (
             SELECT 1 FROM auth.users u
             WHERE u.id = p.auth_user_id
               AND lower(u.email) = ANY($1::text[])
           )`,
        [hidden],
      );

      function pick(orgType: string, roles: string[], label: string): Persona {
        const row = roles
          .map((role) => members.rows.find((item) => item.org_type === orgType && item.role === role))
          .find((item) => item !== undefined);
        expect(row, label).toBeTruthy();
        return {
          label: `${label} (${row!.org_type}/${row!.role})`,
          authUserId: row!.auth_user_id,
          orgId: row!.org_id,
        };
      }

      const personas: Persona[] = [
        pick('INDIVIDUAL', ['OWNER', 'BUYER'], 'buyer'),
        pick('COMMUNITY', ['COMMITTEE_MEMBER'], 'RWA member'),
        pick('COMMUNITY', ['MANAGER'], 'RWA manager'),
        pick('MSME', ['APPROVER', 'COMMITTEE_MEMBER', 'BUYER'], 'MSME delegate'),
      ];

      const supplier = await c.query<{ auth_user_id: string; org_id: string | null }>(
        `SELECT p.auth_user_id, m.organization_id AS org_id
         FROM supplier_users su
         JOIN profiles p ON p.id = su.profile_id
         LEFT JOIN organization_members m ON m.profile_id = p.id
         WHERE p.auth_user_id IS NOT NULL
           AND COALESCE(p.is_platform_admin, false) = false
           AND lower(coalesce(p.email, '')) <> ALL($1::text[])
         LIMIT 1`,
        [hidden],
      );
      expect(supplier.rowCount).toBeGreaterThan(0);
      const supplierOrg = supplier.rows[0].org_id ?? personas[0].orgId;
      personas.push({
        label: 'supplier',
        authUserId: supplier.rows[0].auth_user_id,
        orgId: supplierOrg,
      });

      const admin = await c.query<{ auth_user_id: string }>(
        `SELECT auth_user_id FROM profiles
         WHERE is_platform_admin = true AND auth_user_id IS NOT NULL
         LIMIT 1`,
      );
      expect(admin.rowCount).toBeGreaterThan(0);

      const targetOrg = personas[0].orgId;
      const before = await c.query<{
        subscription_plan: string;
        subscription_status: string;
        subscription_expires_at: string | null;
      }>(
        `SELECT subscription_plan, subscription_status, subscription_expires_at
         FROM organizations WHERE id = $1`,
        [targetOrg],
      );
      const started = before.rows[0];

      async function assertDirectWriteBlocked(authUserId: string | null, role: 'authenticated' | 'anon') {
        let denied = false;
        try {
          const updated = await asAuthenticated(c, authUserId, role, () =>
            c.query(
              `UPDATE organizations
               SET subscription_plan = 'YEARLY',
                   subscription_status = 'ACTIVE',
                   subscription_expires_at = now() + interval '365 days'
               WHERE id = $1`,
              [targetOrg],
            ),
          );
          denied = updated.rowCount === 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          denied = /SUBSCRIPTION-ENTITLEMENT-IMMUTABLE|row-level security|permission denied/i.test(message);
          if (!denied) throw error;
        }
        expect(denied).toBe(true);
        const row = await c.query(
          `SELECT subscription_plan, subscription_status, subscription_expires_at
           FROM organizations WHERE id = $1`,
          [targetOrg],
        );
        expect(row.rows[0].subscription_plan).toBe(started.subscription_plan);
        expect(row.rows[0].subscription_status).toBe(started.subscription_status);
        expect(String(row.rows[0].subscription_expires_at)).toBe(String(started.subscription_expires_at));
      }

      for (const persona of personas) {
        await assertDirectWriteBlocked(persona.authUserId, 'authenticated');
        let rpcDenied = false;
        try {
          await asAuthenticated(c, persona.authUserId, 'authenticated', () =>
            c.query(`SELECT public.platform_admin_set_organization_subscription_status($1)`, [targetOrg]),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          rpcDenied = /SUBSCRIPTION-ADMIN-ACTIVATE|permission denied/i.test(message);
          if (!rpcDenied) throw error;
        }
        expect(rpcDenied, persona.label).toBe(true);
      }

      await assertDirectWriteBlocked(null, 'anon');
      let anonRpcDenied = false;
      try {
        await asAuthenticated(c, null, 'anon', () =>
          c.query(`SELECT public.platform_admin_set_organization_subscription_status($1)`, [targetOrg]),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        anonRpcDenied = /permission denied|SUBSCRIPTION-ADMIN-ACTIVATE/i.test(message);
        if (!anonRpcDenied) throw error;
      }
      expect(anonRpcDenied).toBe(true);

      await assertDirectWriteBlocked(admin.rows[0].auth_user_id, 'authenticated');

      await c.query(
        `UPDATE organizations SET subscription_status = 'PAUSED' WHERE id = $1`,
        [targetOrg],
      );
      const activated = await asAuthenticated(c, admin.rows[0].auth_user_id, 'authenticated', async () => {
        const call = await c.query<{ result: { ok?: boolean } }>(
          `SELECT public.platform_admin_set_organization_subscription_status($1) AS result`,
          [targetOrg],
        );
        const row = await c.query<{
          subscription_plan: string;
          subscription_status: string;
          subscription_expires_at: string | null;
        }>(
          `SELECT subscription_plan, subscription_status, subscription_expires_at
           FROM organizations WHERE id = $1`,
          [targetOrg],
        );
        return { result: call.rows[0].result, row: row.rows[0] };
      });
      expect(activated.result.ok).toBe(true);
      expect(activated.row.subscription_status).toBe('ACTIVE');
      expect(activated.row.subscription_plan).toBe(started.subscription_plan);
      expect(String(activated.row.subscription_expires_at)).toBe(String(started.subscription_expires_at));

      const grants = await c.query<{ anon_exec: boolean; auth_exec: boolean; service_exec: boolean }>(
        `SELECT
           has_function_privilege('anon', $1, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', $1, 'EXECUTE') AS auth_exec,
           has_function_privilege('service_role', $1, 'EXECUTE') AS service_exec`,
        [PAYMENT_FN],
      );
      expect(grants.rows[0].anon_exec).toBe(false);
      expect(grants.rows[0].auth_exec).toBe(false);
      expect(grants.rows[0].service_exec).toBe(true);

      await expect(
        asAuthenticated(c, personas[0].authUserId, 'authenticated', () =>
          c.query(
            `SELECT public.record_verified_payment(
               'SUBSCRIPTION', $1, NULL, 1, 'INR', 'test', 'evt-local', 'ref', 'TIER_1_MSME', 'MONTHLY', '{}'::jsonb
             )`,
            [targetOrg],
          ),
        ),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await c.query('ROLLBACK');
      await c.end();
    }
  });
});
