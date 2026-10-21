/**
 * Two authenticated sessions revise one quote at the same time.
 * The fixture is committed only for the race, marked demo, then removed.
 */
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

const ORG_NAME = 'closure revision org';

function snapshot(total: string): string {
  return JSON.stringify({
    currency: 'INR',
    basePrice: total,
    totalCost: total,
    deliveryDays: '7',
  });
}

async function connect(): Promise<Client> {
  const client = new Client(LOCAL);
  await client.connect();
  return client;
}

async function actAs(client: Client, authUserId: string): Promise<void> {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [authUserId]);
  await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: authUserId, role: 'authenticated' }),
  ]);
  await client.query('SET ROLE authenticated');
}

async function removeOrg(orgId: string): Promise<void> {
  const client = await connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE public.rfqs SET is_demo = true WHERE organization_id = $1`, [orgId]);
    await client.query(`SELECT set_config('otp.demo_reset', 'on', true)`);
    await client.query(`DELETE FROM public.rfq_allowance_consumptions WHERE organization_id = $1`, [orgId]);
    await client.query(
      `DELETE FROM public.quote_versions WHERE quote_id IN (
         SELECT q.id FROM public.quotes q JOIN public.rfqs r ON r.id = q.rfq_id WHERE r.organization_id = $1
       )`,
      [orgId],
    );
    await client.query(`DELETE FROM public.quotes WHERE rfq_id IN (SELECT id FROM public.rfqs WHERE organization_id = $1)`, [orgId]);
    await client.query(`DELETE FROM public.rfq_invitations WHERE rfq_id IN (SELECT id FROM public.rfqs WHERE organization_id = $1)`, [orgId]);
    await client.query(`DELETE FROM public.rfqs WHERE organization_id = $1`, [orgId]);
    await client.query(`DELETE FROM public.requirements WHERE organization_id = $1`, [orgId]);
    const removed = await client.query(
      `DELETE FROM public.organizations WHERE id = $1 AND name = $2`,
      [orgId, ORG_NAME],
    );
    if (removed.rowCount !== 1) throw new Error('cleanup did not remove the revision fixture');
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    throw error;
  } finally {
    await client.end();
  }
}

describe('quote revision concurrency', () => {
  it('appends both overlapping revisions in order and rejects another supplier', async () => {
    const setup = await connect();
    let orgId = '';
    try {
      const supplier = await setup.query<{ id: string; auth_user_id: string }>(
        `SELECT id, auth_user_id FROM public.profiles WHERE email = $1`,
        [DEMO.logins.motorSupplier],
      );
      const rival = await setup.query<{ auth_user_id: string }>(
        `SELECT auth_user_id FROM public.profiles WHERE email = $1`,
        [DEMO.logins.tooSmallSupplier],
      );
      const buyer = await setup.query<{ id: string }>(
        `SELECT id FROM public.profiles WHERE email = $1`,
        [DEMO.logins.qaBuyer],
      );
      const org = await setup.query<{ id: string }>(
        `INSERT INTO public.organizations (name, org_type, city, status, subscription_plan, subscription_status, is_demo)
         VALUES ($1, 'MSME', 'Bengaluru', 'ACTIVE', 'MONTHLY', 'ACTIVE', true) RETURNING id`,
        [ORG_NAME],
      );
      orgId = org.rows[0].id;
      const sub = await setup.query<{ id: string; category_id: string }>(
        `SELECT id, category_id FROM public.requirement_subcategories WHERE code = 'motor_rewinding' LIMIT 1`,
      );
      const requirement = await setup.query<{ id: string }>(
        `INSERT INTO public.requirements (
           organization_id, created_by, requirement_type, title, category_id, subcategory_id, status
         ) VALUES ($1, $2, 'SERVICE', 'revision race', $3, $4, 'QUOTING') RETURNING id`,
        [orgId, buyer.rows[0].id, sub.rows[0].category_id, sub.rows[0].id],
      );
      const rfq = await setup.query<{ id: string }>(
        `INSERT INTO public.rfqs (
           requirement_id, organization_id, title, created_by, status, is_demo, quote_deadline
         ) VALUES ($1, $2, 'revision race rfq', $3, 'OPEN', true, now() + interval '1 day') RETURNING id`,
        [requirement.rows[0].id, orgId, buyer.rows[0].id],
      );
      const invite = await setup.query<{ id: string }>(
        `INSERT INTO public.rfq_invitations (rfq_id, supplier_id, anonymous_label, status)
         VALUES ($1, $2, 'A', 'QUOTED') RETURNING id`,
        [rfq.rows[0].id, DEMO.suppliers.aquaPrime],
      );
      const quote = await setup.query<{ id: string }>(
        `INSERT INTO public.quotes (rfq_id, supplier_id, invitation_id, status, current_version)
         VALUES ($1, $2, $3, 'SUBMITTED', 1) RETURNING id`,
        [rfq.rows[0].id, DEMO.suppliers.aquaPrime, invite.rows[0].id],
      );
      await setup.query(
        `INSERT INTO public.quote_versions (quote_id, version, snapshot, created_by)
         VALUES ($1, 1, $2::jsonb, $3)`,
        [quote.rows[0].id, snapshot('5000'), supplier.rows[0].id],
      );
      const quoteId = quote.rows[0].id;

      const revise = async (total: string): Promise<string> => {
        const client = await connect();
        try {
          await actAs(client, supplier.rows[0].auth_user_id);
          const result = await client.query<{ r: { version: number } }>(
            `SELECT public.revise_supplier_quote_atomic($1, $2::jsonb, NULL) AS r`,
            [quoteId, snapshot(total)],
          );
          return String(result.rows[0].r.version);
        } finally {
          await client.end();
        }
      };

      const versions = await Promise.all([revise('6100'), revise('7200')]);
      expect(new Set(versions)).toEqual(new Set(['2', '3']));

      const history = await setup.query<{ version: number; total: string }>(
        `SELECT version, snapshot->>'totalCost' AS total
         FROM public.quote_versions WHERE quote_id = $1 ORDER BY version`,
        [quoteId],
      );
      expect(history.rows.map((row) => row.version)).toEqual([1, 2, 3]);
      expect(new Set(history.rows.map((row) => row.total))).toEqual(new Set(['5000', '6100', '7200']));
      const current = await setup.query<{ current_version: number; status: string }>(
        `SELECT current_version, status FROM public.quotes WHERE id = $1`,
        [quoteId],
      );
      expect(current.rows[0]).toEqual({ current_version: 3, status: 'REVISED' });

      const rivalClient = await connect();
      try {
        await actAs(rivalClient, rival.rows[0].auth_user_id);
        await expect(
          rivalClient.query(`SELECT public.revise_supplier_quote_atomic($1, $2::jsonb, NULL)`, [quoteId, snapshot('8000')]),
        ).rejects.toThrow(/QUOTE-SUPPLIER-AUTH/);
      } finally {
        await rivalClient.end();
      }
      const afterRival = await setup.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.quote_versions WHERE quote_id = $1`,
        [quoteId],
      );
      expect(afterRival.rows[0].n).toBe('3');

      const replay = await revise('8300');
      expect(replay).toBe('4');
      const rolled = await connect();
      try {
        await rolled.query('BEGIN');
        await actAs(rolled, supplier.rows[0].auth_user_id);
        await rolled.query(`SELECT public.revise_supplier_quote_atomic($1, $2::jsonb, NULL)`, [quoteId, snapshot('9000')]);
        await rolled.query('ROLLBACK');
      } finally {
        await rolled.end();
      }
      const finalHistory = await setup.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.quote_versions WHERE quote_id = $1`,
        [quoteId],
      );
      expect(finalHistory.rows[0].n).toBe('4');
    } finally {
      await setup.end();
      if (orgId) await removeOrg(orgId);
    }
  });
});
