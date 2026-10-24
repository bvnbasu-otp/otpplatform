import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const DB = {
  host: '127.0.0.1',
  port: Number(process.env.LOCAL_PG_PORT ?? 54322),
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

type Actor = { profileId: string; authUserId: string };

async function connect(): Promise<Client | null> {
  const client = new Client(DB);
  try {
    await client.connect();
  } catch {
    console.warn('[SKIP REASON] local PostgreSQL is unavailable at 127.0.0.1:54322');
    return null;
  }
  const installed = await client.query(`SELECT to_regprocedure('public.deactivate_buyer_address_atomic(uuid,uuid)') AS fn`);
  if (!installed.rows[0].fn) {
    console.warn('[SKIP REASON] local PostgreSQL does not have migration 00287 applied');
    await client.end();
    return null;
  }
  return client;
}

async function beginAs(client: Client, actor: Actor) {
  await client.query('BEGIN');
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: actor.authUserId, role: 'authenticated' }),
  ]);
  await client.query('SET LOCAL ROLE authenticated');
}

async function save(
  client: Client,
  actor: Actor,
  orgId: string,
  label: string,
  primary: boolean,
  addressId: string | null = null,
) {
  await beginAs(client, actor);
  const result = await client.query(
    `SELECT public.upsert_buyer_address_atomic(
       $1, $2, 'Bengaluru', 'Karnataka', '560048',
       NULL, NULL, 'India', $3, 'DELIVERY', $4, $5, 'Address Owner', '9876543210', '29'
     ) AS r`,
    [label, `${label} line 1`, primary, orgId, addressId],
  );
  await client.query('COMMIT');
  return result.rows[0].r as { ok: boolean; error?: string; address_id?: string; is_primary?: boolean };
}

async function deactivate(
  client: Client,
  actor: Actor,
  addressId: string,
  replacementId: string | null,
) {
  await beginAs(client, actor);
  const result = await client.query(
    `SELECT public.deactivate_buyer_address_atomic($1, $2) AS r`,
    [addressId, replacementId],
  );
  await client.query('COMMIT');
  return result.rows[0].r as { ok: boolean; error?: string; code?: string };
}

describe('00287 buyer address invariants', () => {
  it('enforces cap, one default, atomic replacement, ownership, and immutable snapshots', async () => {
    const setup = await connect();
    if (!setup) return;
    const a = await connect();
    const b = await connect();
    if (!a || !b) {
      await setup.end();
      await a?.end();
      await b?.end();
      return;
    }
    const actorRow = await setup.query(
      `SELECT id, auth_user_id FROM public.profiles
       WHERE auth_user_id IS NOT NULL
         AND is_platform_admin IS NOT TRUE
         AND is_founder IS NOT TRUE
       ORDER BY created_at LIMIT 2`,
    );
    const owner: Actor = { profileId: actorRow.rows[0].id, authUserId: actorRow.rows[0].auth_user_id };
    const outsider: Actor = { profileId: actorRow.rows[1].id, authUserId: actorRow.rows[1].auth_user_id };
    const orgId = randomUUID();
    let requirementId: string | null = null;
    try {
      await setup.query(
        `INSERT INTO public.organizations (id, name, org_type, status)
         VALUES ($1, 'Address invariant fixture', 'MSME', 'ACTIVE')`,
        [orgId],
      );
      await setup.query(
        `INSERT INTO public.organization_members (organization_id, profile_id, role)
         VALUES ($1, $2, 'OWNER')`,
        [orgId, owner.profileId],
      );

      const first = await save(a, owner, orgId, 'First', false);
      expect(first).toMatchObject({ ok: true, is_primary: true });

      await beginAs(a, owner);
      const leadingZero = await a.query(
        `SELECT public.upsert_buyer_address_atomic(
           'Zero', 'Zero line', 'Bengaluru', 'Karnataka', '012345',
           NULL, NULL, 'India', false, 'DELIVERY', $1, NULL, 'Address Owner', '9876543210', '29'
         ) AS r`,
        [orgId],
      );
      await a.query('ROLLBACK');
      expect(leadingZero.rows[0].r.ok).toBe(false);
      const pinRule = await setup.query(
        `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conname = 'chk_buyer_pincode_format'`,
      );
      expect(pinRule.rows[0].def).toContain('^[1-9][0-9]{5}$');

      const [second, third] = await Promise.all([
        save(a, owner, orgId, 'Second', false),
        save(b, owner, orgId, 'Third', false),
      ]);
      expect(second.ok).toBe(true);
      expect(third.ok).toBe(true);

      const [fourthA, fourthB] = await Promise.all([
        save(a, owner, orgId, 'Fourth A', false),
        save(b, owner, orgId, 'Fourth B', false),
      ]);
      expect([fourthA, fourthB].filter((row) => row.ok)).toHaveLength(0);
      expect([fourthA, fourthB].every((row) => row.error?.includes('maximum of three'))).toBe(true);

      const defaultsBefore = await setup.query(
        `SELECT count(*)::int AS n FROM public.buyer_addresses
         WHERE organization_id = $1 AND is_active AND is_primary`,
        [orgId],
      );
      expect(defaultsBefore.rows[0].n).toBe(1);

      const [switchSecond, switchThird] = await Promise.all([
        save(a, owner, orgId, 'Second', true, second.address_id!),
        save(b, owner, orgId, 'Third', true, third.address_id!),
      ]);
      expect(switchSecond.ok).toBe(true);
      expect(switchThird.ok).toBe(true);
      const primary = await setup.query(
        `SELECT id FROM public.buyer_addresses
         WHERE organization_id = $1 AND is_active AND is_primary`,
        [orgId],
      );
      expect(primary.rowCount).toBe(1);

      const noReplacement = await deactivate(a, owner, primary.rows[0].id, null);
      expect(noReplacement).toMatchObject({ ok: false, code: 'ADDRESS-DEFAULT-REPLACEMENT-REQUIRED' });
      const replacementId = [first.address_id!, second.address_id!, third.address_id!]
        .find((id) => id !== primary.rows[0].id)!;
      expect((await deactivate(a, owner, primary.rows[0].id, replacementId)).ok).toBe(true);

      const remaining = await setup.query(
        `SELECT id, is_primary FROM public.buyer_addresses
         WHERE organization_id = $1 AND is_active ORDER BY is_primary DESC, id`,
        [orgId],
      );
      expect(remaining.rowCount).toBe(2);
      expect(remaining.rows.filter((row) => row.is_primary)).toHaveLength(1);
      const nonDefault = remaining.rows.find((row) => !row.is_primary);
      expect((await deactivate(a, owner, nonDefault.id, null)).ok).toBe(true);
      const last = await setup.query(
        `SELECT id FROM public.buyer_addresses WHERE organization_id = $1 AND is_active`,
        [orgId],
      );
      expect(await deactivate(a, owner, last.rows[0].id, null)).toMatchObject({
        ok: false,
        code: 'ADDRESS-LAST',
      });

      await beginAs(a, outsider);
      const denied = await a.query(
        `SELECT public.upsert_buyer_address_atomic(
           'Outsider', 'No access', 'Bengaluru', 'Karnataka', '560048',
           NULL, NULL, 'India', false, 'DELIVERY', $1, NULL, NULL, NULL, '29'
         ) AS r`,
        [orgId],
      );
      await a.query('COMMIT');
      expect(denied.rows[0].r).toMatchObject({ ok: false, error: 'Access denied to organization' });

      await beginAs(a, owner);
      let directError = '';
      try {
        await a.query(`UPDATE public.buyer_addresses SET is_active = false WHERE id = $1`, [last.rows[0].id]);
      } catch (error) {
        directError = (error as Error).message;
      }
      await a.query('ROLLBACK');
      expect(directError).toContain('permission denied');

      const tax = await setup.query(
        `SELECT c.id AS category_id, s.id AS subcategory_id
         FROM public.requirement_categories c
         JOIN public.requirement_subcategories s ON s.category_id = c.id
         LIMIT 1`,
      );
      const requirement = await setup.query(
        `INSERT INTO public.requirements (
           organization_id, created_by, requirement_type, title,
           category_id, subcategory_id, delivery_city, delivery_pincode
         ) VALUES ($1, $2, 'SERVICE', 'Address snapshot fixture', $3, $4, 'Bengaluru', '560048')
         RETURNING id`,
        [orgId, owner.profileId, tax.rows[0].category_id, tax.rows[0].subcategory_id],
      );
      requirementId = requirement.rows[0].id as string;
      await beginAs(a, owner);
      const published = await a.query(
        `SELECT public.publish_requirement(
           $1::uuid, 'IDENTITY_PROTECTED'::sourcing_mode, 1, 7, '{}'::jsonb, 'SUGGESTED'
         ) AS result`,
        [requirement.rows[0].id],
      );
      await a.query('COMMIT');
      const rfqId = published.rows[0].result.rfqId as string;
      const before = await setup.query(
        `SELECT delivery_address_snapshot, billing_address_snapshot
         FROM public.rfqs WHERE id = $1`,
        [rfqId],
      );
      expect(before.rows[0].delivery_address_snapshot).toMatchObject({
        addressId: last.rows[0].id,
        line1: expect.not.stringContaining('Changed future address'),
        pincode: '560048',
        isFrozen: true,
      });
      expect(before.rows[0].billing_address_snapshot).toEqual(
        before.rows[0].delivery_address_snapshot,
      );

      await setup.query('BEGIN');
      await setup.query(
        `UPDATE public.buyer_addresses SET address_line1 = 'Changed future address' WHERE id = $1`,
        [last.rows[0].id],
      );
      const historical = await setup.query(
        `SELECT delivery_address_snapshot FROM public.rfqs WHERE id = $1`,
        [rfqId],
      );
      expect(historical.rows[0].delivery_address_snapshot).toEqual(
        before.rows[0].delivery_address_snapshot,
      );
      await setup.query('ROLLBACK');
    } finally {
      try { await a.query('ROLLBACK'); } catch { /* no transaction */ }
      try { await b.query('ROLLBACK'); } catch { /* no transaction */ }
      if (requirementId) {
        await setup.query(`DELETE FROM public.requirements WHERE id = $1`, [requirementId]);
      }
      await setup.end();
      await a.end();
      await b.end();
    }
  }, 30_000);
});
