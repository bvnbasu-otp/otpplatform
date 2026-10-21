/**
 * Two sessions compete for the last monthly allowance slot.
 * The organization is committed only for the race, marked demo, then removed
 * through the demo-reset exception. No shared demo rows are touched.
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

const SNAPSHOT = JSON.stringify({
  currency: 'INR',
  basePrice: '5000',
  totalCost: '5000',
  deliveryDays: '7',
});

async function seedQuote(
  client: Client,
  orgId: string,
  buyerId: string,
  supplierProfileId: string,
  title: string,
): Promise<void> {
  const sub = await client.query<{ id: string; category_id: string }>(
    `SELECT id, category_id FROM public.requirement_subcategories WHERE code = 'motor_rewinding' LIMIT 1`,
  );
  const requirement = await client.query<{ id: string }>(
    `INSERT INTO public.requirements (
       organization_id, created_by, requirement_type, title, category_id, subcategory_id, status
     ) VALUES ($1, $2, 'SERVICE', $3, $4, $5, 'QUOTING') RETURNING id`,
    [orgId, buyerId, title, sub.rows[0].category_id, sub.rows[0].id],
  );
  const rfq = await client.query<{ id: string }>(
    `INSERT INTO public.rfqs (
       requirement_id, organization_id, title, created_by, status, is_demo
     ) VALUES ($1, $2, $3, $4, 'OPEN', true) RETURNING id`,
    [requirement.rows[0].id, orgId, `${title} rfq`, buyerId],
  );
  const invite = await client.query<{ id: string }>(
    `INSERT INTO public.rfq_invitations (rfq_id, supplier_id, anonymous_label, status)
     VALUES ($1, $2, 'A', 'QUOTED') RETURNING id`,
    [rfq.rows[0].id, DEMO.suppliers.aquaPrime],
  );
  const quote = await client.query<{ id: string }>(
    `INSERT INTO public.quotes (rfq_id, supplier_id, invitation_id, status, current_version)
     VALUES ($1, $2, $3, 'SUBMITTED', 1) RETURNING id`,
    [rfq.rows[0].id, DEMO.suppliers.aquaPrime, invite.rows[0].id],
  );
  await client.query(
    `INSERT INTO public.quote_versions (quote_id, version, snapshot, created_by)
     VALUES ($1, 1, $2::jsonb, $3)`,
    [quote.rows[0].id, SNAPSHOT, supplierProfileId],
  );
}

async function removeOrg(orgId: string): Promise<void> {
  const client = new Client(LOCAL);
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE public.rfqs SET is_demo = true WHERE organization_id = $1`, [orgId]);
    await client.query(`SELECT set_config('otp.demo_reset', 'on', true)`);
    await client.query(`DELETE FROM public.rfq_allowance_consumptions WHERE organization_id = $1`, [orgId]);
    await client.query(
      `DELETE FROM public.quote_versions WHERE quote_id IN (
         SELECT q.id FROM public.quotes q
         JOIN public.rfqs r ON r.id = q.rfq_id
         WHERE r.organization_id = $1
       )`,
      [orgId],
    );
    await client.query(
      `DELETE FROM public.quotes WHERE rfq_id IN (SELECT id FROM public.rfqs WHERE organization_id = $1)`,
      [orgId],
    );
    await client.query(
      `DELETE FROM public.rfq_invitations WHERE rfq_id IN (SELECT id FROM public.rfqs WHERE organization_id = $1)`,
      [orgId],
    );
    await client.query(`DELETE FROM public.rfqs WHERE organization_id = $1`, [orgId]);
    await client.query(`DELETE FROM public.requirements WHERE organization_id = $1`, [orgId]);
    const removed = await client.query(
      `DELETE FROM public.organizations WHERE id = $1 AND name = 'closure lock org'`,
      [orgId],
    );
    if (removed.rowCount !== 1) throw new Error('cleanup did not remove the closure lock organization');
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    throw error;
  } finally {
    await client.end();
  }
}

describe('allowance last-slot race', () => {
  it('does not let two overlapping qualifying quotes both consume the last monthly slot', async () => {
    const setup = new Client(LOCAL);
    await setup.connect();
    let orgId = '';
    try {
      const supplier = await setup.query<{ id: string; auth_user_id: string }>(
        `SELECT id, auth_user_id FROM public.profiles WHERE email = $1`,
        [DEMO.logins.motorSupplier],
      );
      const buyer = await setup.query<{ id: string }>(
        `SELECT id FROM public.profiles WHERE email = $1`,
        [DEMO.logins.qaBuyer],
      );
      await setup.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [supplier.rows[0].auth_user_id]);
      await setup.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
      await setup.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
        JSON.stringify({ sub: supplier.rows[0].auth_user_id, role: 'authenticated' }),
      ]);
      const org = await setup.query<{ id: string }>(
        `INSERT INTO public.organizations (name, org_type, city, status, subscription_plan, subscription_status, is_demo)
         VALUES ('closure lock org', 'MSME', 'Bengaluru', 'ACTIVE', 'MONTHLY', 'ACTIVE', true)
         RETURNING id`,
      );
      orgId = org.rows[0].id;
      for (let i = 0; i < 2; i += 1) {
        await seedQuote(setup, orgId, buyer.rows[0].id, supplier.rows[0].id, `lock base ${i}`);
      }

      const runFourth = async (title: string): Promise<string> => {
        const client = new Client(LOCAL);
        await client.connect();
        try {
          await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [supplier.rows[0].auth_user_id]);
          await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
          await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
            JSON.stringify({ sub: supplier.rows[0].auth_user_id, role: 'authenticated' }),
          ]);
          await seedQuote(client, orgId, buyer.rows[0].id, supplier.rows[0].id, title);
          return '';
        } catch (error) {
          return (error as Error).message;
        } finally {
          await client.end();
        }
      };

      const [first, second] = await Promise.all([
        runFourth('lock race a'),
        runFourth('lock race b'),
      ]);
      const count = await setup.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.rfq_allowance_consumptions WHERE organization_id = $1`,
        [orgId],
      );
      const used = Number(count.rows[0].n);
      const detail = `used=${used}; a=${JSON.stringify(first)}; b=${JSON.stringify(second)}`;
      expect(used, detail).toBe(3);
      const failures = [first, second].filter((message) => message.length > 0);
      expect(failures, detail).toHaveLength(1);
      expect(failures[0], detail).toMatch(/0 of 3 RFQs remaining|pilot allowance/i);
    } finally {
      await setup.end();
      if (orgId) await removeOrg(orgId);
    }
  });
});
