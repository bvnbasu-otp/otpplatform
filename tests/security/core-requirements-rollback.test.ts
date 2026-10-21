/**
 * In-scope core proofs against local PostgreSQL.
 * Every case runs inside one transaction and rolls back.
 * It does not delete pre-existing rows.
 */
import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { DEMO } from '../helpers/demo-fixtures';

const LOCAL = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

async function connect(): Promise<Client | null> {
  const client = new Client(LOCAL);
  try {
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

async function withRollback(run: (client: Client) => Promise<void>): Promise<void> {
  const client = await connect();
  if (!client) {
    throw new Error('local PostgreSQL at 127.0.0.1:54322 is not available');
  }
  try {
    await client.query('BEGIN');
    await run(client);
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* transaction already closed */
    }
    await client.end();
  }
}

async function assumeJwt(client: Client, authUserId: string): Promise<void> {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authUserId]);
  await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: authUserId, role: 'authenticated' }),
  ]);
}

async function actAs(client: Client, authUserId: string): Promise<void> {
  await assumeJwt(client, authUserId);
  await client.query('SET LOCAL ROLE authenticated');
}

const ELIGIBLE_SNAPSHOT = JSON.stringify({
  currency: 'INR',
  basePrice: '5000',
  totalCost: '5000',
  deliveryDays: '7',
});
async function asOwner(client: Client): Promise<void> {
  await client.query('RESET ROLE');
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
  await client.query('RELEASE SAVEPOINT otp_expect_error');
  return message;
}

async function freshOrg(client: Client, plan: 'MONTHLY' | 'YEARLY'): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO public.organizations (name, org_type, city, status, subscription_plan, subscription_status, is_demo)
     VALUES ($1, 'MSME', 'Bengaluru', 'ACTIVE', $2, 'ACTIVE', true)
     RETURNING id`,
    [`closure ${plan} ${Date.now()}`, plan],
  );
  return rows[0].id;
}

async function profileFor(client: Client, email: string): Promise<{ id: string; authUserId: string }> {
  const { rows } = await client.query<{ id: string; auth_user_id: string }>(
    `SELECT id, auth_user_id FROM public.profiles WHERE email = $1`,
    [email],
  );
  if (!rows[0]?.auth_user_id) throw new Error(`missing profile for ${email}`);
  return { id: rows[0].id, authUserId: rows[0].auth_user_id };
}

describe('core requirements — rolled-back local PostgreSQL', () => {
  afterAll(() => {
    /* connections are closed per test */
  });

  it('supplier A cannot read or revise supplier B quotes, and the owner still can read their own', async () => {
    await withRollback(async (client) => {
      const a = await profileFor(client, DEMO.logins.motorSupplier);
      const b = await profileFor(client, DEMO.logins.tooSmallSupplier);
      const sub = await client.query<{ id: string; category_id: string }>(
        `SELECT id, category_id FROM public.requirement_subcategories WHERE code = 'motor_rewinding' LIMIT 1`,
      );
      const buyer = await profileFor(client, DEMO.logins.sunriseManager);
      const org = await freshOrg(client, 'MONTHLY');

      const requirement = await client.query<{ id: string }>(
        `INSERT INTO public.requirements (
           organization_id, created_by, requirement_type, title, category_id, subcategory_id, status
         ) VALUES ($1, $2, 'SERVICE', 'closure isolation draft', $3, $4, 'DRAFT')
         RETURNING id`,
        [org, buyer.id, sub.rows[0].category_id, sub.rows[0].id],
      );
      const rfq = await client.query<{ id: string }>(
        `INSERT INTO public.rfqs (requirement_id, organization_id, title, created_by, status, reveal_status)
         VALUES ($1, $2, 'closure isolation rfq', $3, 'OPEN', 'BLIND') RETURNING id`,
        [requirement.rows[0].id, org, buyer.id],
      );
      const inviteB = await client.query<{ id: string }>(
        `INSERT INTO public.rfq_invitations (rfq_id, supplier_id, anonymous_label, status)
         VALUES ($1, $2, 'Supplier B', 'INVITED') RETURNING id`,
        [rfq.rows[0].id, DEMO.suppliers.nandi],
      );
      const quoteB = await client.query<{ id: string }>(
        `INSERT INTO public.quotes (rfq_id, supplier_id, invitation_id, status, current_version)
         VALUES ($1, $2, $3, 'SUBMITTED', 1) RETURNING id`,
        [rfq.rows[0].id, DEMO.suppliers.nandi, inviteB.rows[0].id],
      );
      await client.query(
        `INSERT INTO public.quote_versions (quote_id, version, snapshot, created_by)
         VALUES ($1, 1, '{"totalCost": 100, "basePrice": 100}'::jsonb, $2)`,
        [quoteB.rows[0].id, b.id],
      );

      await actAs(client, a.authUserId);
      const seen = await client.query(`SELECT id FROM public.quotes WHERE id = $1`, [quoteB.rows[0].id]);
      expect(seen.rowCount).toBe(0);
      const versions = await client.query(`SELECT id FROM public.quote_versions WHERE quote_id = $1`, [quoteB.rows[0].id]);
      expect(versions.rowCount).toBe(0);
      const invites = await client.query(`SELECT id FROM public.rfq_invitations WHERE id = $1`, [inviteB.rows[0].id]);
      expect(invites.rowCount).toBe(0);
      const revised = await client.query(`UPDATE public.quotes SET status = 'WITHDRAWN' WHERE id = $1`, [quoteB.rows[0].id]);
      expect(revised.rowCount).toBe(0);
      const revisedRpc = await captureError(
        client,
        `SELECT public.revise_supplier_quote_atomic($1, $2::jsonb, NULL)`,
        [quoteB.rows[0].id, ELIGIBLE_SNAPSHOT],
      );
      expect(revisedRpc).toMatch(/QUOTE-SUPPLIER-AUTH/);

      await asOwner(client);
      const still = await client.query<{ status: string }>(`SELECT status FROM public.quotes WHERE id = $1`, [quoteB.rows[0].id]);
      expect(still.rows[0].status).toBe('SUBMITTED');

      const inviteA = await client.query<{ id: string }>(
        `INSERT INTO public.rfq_invitations (rfq_id, supplier_id, anonymous_label, status)
         VALUES ($1, $2, 'Supplier A', 'INVITED') RETURNING id`,
        [rfq.rows[0].id, DEMO.suppliers.aquaPrime],
      );
      const quoteA = await client.query<{ id: string }>(
        `INSERT INTO public.quotes (rfq_id, supplier_id, invitation_id, status, current_version)
         VALUES ($1, $2, $3, 'SUBMITTED', 1) RETURNING id`,
        [rfq.rows[0].id, DEMO.suppliers.aquaPrime, inviteA.rows[0].id],
      );
      await actAs(client, a.authUserId);
      const own = await client.query(`SELECT id FROM public.quotes WHERE id = $1`, [quoteA.rows[0].id]);
      expect(own.rowCount).toBe(1);

      await asOwner(client);
      await actAs(client, buyer.authUserId);
      const buyerSeesQuote = await client.query(`SELECT id FROM public.quotes WHERE rfq_id = $1`, [rfq.rows[0].id]);
      expect(buyerSeesQuote.rowCount).toBe(0);
      const buyerSeesName = await client.query(
        `SELECT s.business_name FROM public.quotes q JOIN public.suppliers s ON s.id = q.supplier_id WHERE q.rfq_id = $1`,
        [rfq.rows[0].id],
      );
      expect(buyerSeesName.rowCount).toBe(0);
    });
  });

  it('buyer cannot read the base quote table before reveal, and a rival buyer cannot read the draft', async () => {
    await withRollback(async (client) => {
      const buyer = await profileFor(client, DEMO.logins.sunriseManager);
      const rival = await profileFor(client, DEMO.logins.kovaiOwner);
      const sub = await client.query<{ id: string; category_id: string }>(
        `SELECT id, category_id FROM public.requirement_subcategories WHERE code = 'motor_rewinding' LIMIT 1`,
      );
      const requirement = await client.query<{ id: string }>(
        `INSERT INTO public.requirements (
           organization_id, created_by, requirement_type, title, category_id, subcategory_id, status
         ) VALUES ($1, $2, 'SERVICE', 'closure owner draft', $3, $4, 'DRAFT') RETURNING id`,
        [DEMO.orgs.sunrise, buyer.id, sub.rows[0].category_id, sub.rows[0].id],
      );
      await actAs(client, buyer.authUserId);
      const own = await client.query(`SELECT id, status FROM public.requirements WHERE id = $1`, [requirement.rows[0].id]);
      expect(own.rowCount).toBe(1);
      expect(own.rows[0].status).toBe('DRAFT');

      await asOwner(client);
      await actAs(client, rival.authUserId);
      const stolen = await client.query(`SELECT id FROM public.requirements WHERE id = $1`, [requirement.rows[0].id]);
      expect(stolen.rowCount).toBe(0);

      const failed = await captureError(
        client,
        `INSERT INTO public.requirements (organization_id, created_by, requirement_type, title)
         VALUES ($1, $2, 'SERVICE', NULL)`,
        [DEMO.orgs.kovai, rival.id],
      );
      expect(failed.length).toBeGreaterThan(0);
    });
  });

  it('monthly allowance is 3, a yearly plan adds one non-carrying quarterly bonus, and a repeat quote does not consume twice', async () => {
    await withRollback(async (client) => {
      const buyer = await profileFor(client, DEMO.logins.qaBuyer);
      const supplierProfile = await profileFor(client, DEMO.logins.motorSupplier);
      await assumeJwt(client, supplierProfile.authUserId);
      const orgId = await freshOrg(client, 'MONTHLY');
      const sub = await client.query<{ id: string; category_id: string }>(
        `SELECT id, category_id FROM public.requirement_subcategories WHERE code = 'motor_rewinding' LIMIT 1`,
      );

      async function seedQuote(): Promise<{ rfqId: string; quoteId: string; versionId: string }> {
        const requirement = await client.query<{ id: string }>(
          `INSERT INTO public.requirements (
             organization_id, created_by, requirement_type, title, category_id, subcategory_id, status
           ) VALUES ($1, $2, 'SERVICE', 'allowance req', $3, $4, 'QUOTING') RETURNING id`,
          [orgId, buyer.id, sub.rows[0].category_id, sub.rows[0].id],
        );
        const rfq = await client.query<{ id: string }>(
          `INSERT INTO public.rfqs (requirement_id, organization_id, title, created_by, status)
           VALUES ($1, $2, 'allowance rfq', $3, 'OPEN') RETURNING id`,
          [requirement.rows[0].id, orgId, buyer.id],
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
        const version = await client.query<{ id: string }>(
        `INSERT INTO public.quote_versions (quote_id, version, snapshot, created_by)
         VALUES ($1, 1, $2::jsonb, $3) RETURNING id`,
        [quote.rows[0].id, ELIGIBLE_SNAPSHOT, supplierProfile.id],
        );
        return { rfqId: rfq.rows[0].id, quoteId: quote.rows[0].id, versionId: version.rows[0].id };
      }

      const first: Array<{ rfqId: string; quoteId: string; versionId: string }> = [];
      for (let i = 0; i < 3; i += 1) first.push(await seedQuote());
      await client.query(`SELECT private.consume_pilot_allowance_for_quote($1, $2, $3)`, [
        first[0].rfqId,
        first[0].quoteId,
        first[0].versionId,
      ]);
      const once = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.rfq_allowance_consumptions WHERE organization_id = $1`,
        [orgId],
      );
      expect(once.rows[0].n).toBe('3');

      const overflowRequirement = await client.query<{ id: string }>(
        `INSERT INTO public.requirements (
           organization_id, created_by, requirement_type, title, category_id, subcategory_id, status
         ) VALUES ($1, $2, 'SERVICE', 'allowance overflow', $3, $4, 'QUOTING') RETURNING id`,
        [orgId, buyer.id, sub.rows[0].category_id, sub.rows[0].id],
      );
      const overflowRfq = await client.query<{ id: string }>(
        `INSERT INTO public.rfqs (requirement_id, organization_id, title, created_by, status)
         VALUES ($1, $2, 'allowance overflow rfq', $3, 'OPEN') RETURNING id`,
        [overflowRequirement.rows[0].id, orgId, buyer.id],
      );
      const overflowInvite = await client.query<{ id: string }>(
        `INSERT INTO public.rfq_invitations (rfq_id, supplier_id, anonymous_label, status)
         VALUES ($1, $2, 'A', 'QUOTED') RETURNING id`,
        [overflowRfq.rows[0].id, DEMO.suppliers.aquaPrime],
      );
      const overflowQuote = await client.query<{ id: string }>(
        `INSERT INTO public.quotes (rfq_id, supplier_id, invitation_id, status, current_version)
         VALUES ($1, $2, $3, 'SUBMITTED', 1) RETURNING id`,
        [overflowRfq.rows[0].id, DEMO.suppliers.aquaPrime, overflowInvite.rows[0].id],
      );
      const blocked = await captureError(
        client,
        `INSERT INTO public.quote_versions (quote_id, version, snapshot, created_by)
         VALUES ($1, 1, $2::jsonb, $3)`,
        [overflowQuote.rows[0].id, ELIGIBLE_SNAPSHOT, supplierProfile.id],
      );
      expect(blocked).toMatch(/PILOT_ALLOWANCE_EXHAUSTED|pilot allowance/i);
      const stillThree = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.rfq_allowance_consumptions WHERE organization_id = $1`,
        [orgId],
      );
      expect(stillThree.rows[0].n).toBe('3');

      await client.query(
        `UPDATE public.organizations
         SET subscription_plan = 'YEARLY', subscription_status = 'ACTIVE', subscription_expires_at = now() + interval '300 days'
         WHERE id = $1`,
        [orgId],
      );
      const bonusVersion = await client.query<{ id: string }>(
        `INSERT INTO public.quote_versions (quote_id, version, snapshot, created_by)
         VALUES ($1, 1, $2::jsonb, $3) RETURNING id`,
        [overflowQuote.rows[0].id, ELIGIBLE_SNAPSHOT, supplierProfile.id],
      );
      const bonus = await client.query<{ used_quarterly_bonus: boolean; entitlement_source: string }>(
        `SELECT used_quarterly_bonus, entitlement_source
         FROM public.rfq_allowance_consumptions WHERE quote_version_id = $1`,
        [bonusVersion.rows[0].id],
      );
      expect(bonus.rows[0].used_quarterly_bonus).toBe(true);
      expect(bonus.rows[0].entitlement_source).toBe('QUARTERLY_BONUS');
      await client.query(
        `UPDATE public.rfq_allowance_consumptions
         SET consumed_at = (date_trunc('quarter', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - interval '1 second'
         WHERE quote_version_id = $1`,
        [bonusVersion.rows[0].id],
      );

      const fifthRequirement = await client.query<{ id: string }>(
        `INSERT INTO public.requirements (
           organization_id, created_by, requirement_type, title, category_id, subcategory_id, status
         ) VALUES ($1, $2, 'SERVICE', 'allowance fifth', $3, $4, 'QUOTING') RETURNING id`,
        [orgId, buyer.id, sub.rows[0].category_id, sub.rows[0].id],
      );
      const fifthRfq = await client.query<{ id: string }>(
        `INSERT INTO public.rfqs (requirement_id, organization_id, title, created_by, status)
         VALUES ($1, $2, 'allowance fifth rfq', $3, 'OPEN') RETURNING id`,
        [fifthRequirement.rows[0].id, orgId, buyer.id],
      );
      const fifthInvite = await client.query<{ id: string }>(
        `INSERT INTO public.rfq_invitations (rfq_id, supplier_id, anonymous_label, status)
         VALUES ($1, $2, 'A', 'QUOTED') RETURNING id`,
        [fifthRfq.rows[0].id, DEMO.suppliers.aquaPrime],
      );
      const fifthQuote = await client.query<{ id: string }>(
        `INSERT INTO public.quotes (rfq_id, supplier_id, invitation_id, status, current_version)
         VALUES ($1, $2, $3, 'SUBMITTED', 1) RETURNING id`,
        [fifthRfq.rows[0].id, DEMO.suppliers.aquaPrime, fifthInvite.rows[0].id],
      );
      const currentQuarterBonus = await client.query<{ id: string }>(
        `INSERT INTO public.quote_versions (quote_id, version, snapshot, created_by)
         VALUES ($1, 1, $2::jsonb, $3) RETURNING id`,
        [fifthQuote.rows[0].id, ELIGIBLE_SNAPSHOT, supplierProfile.id],
      );
      const currentBonus = await client.query<{ used: boolean }>(
        `SELECT used_quarterly_bonus AS used
         FROM public.rfq_allowance_consumptions WHERE quote_version_id = $1`,
        [currentQuarterBonus.rows[0].id],
      );
      expect(currentBonus.rows[0].used).toBe(true);

      const sixthRequirement = await client.query<{ id: string }>(
        `INSERT INTO public.requirements (
           organization_id, created_by, requirement_type, title, category_id, subcategory_id, status
         ) VALUES ($1, $2, 'SERVICE', 'allowance sixth', $3, $4, 'QUOTING') RETURNING id`,
        [orgId, buyer.id, sub.rows[0].category_id, sub.rows[0].id],
      );
      const sixthRfq = await client.query<{ id: string }>(
        `INSERT INTO public.rfqs (requirement_id, organization_id, title, created_by, status)
         VALUES ($1, $2, 'allowance sixth rfq', $3, 'OPEN') RETURNING id`,
        [sixthRequirement.rows[0].id, orgId, buyer.id],
      );
      const sixthInvite = await client.query<{ id: string }>(
        `INSERT INTO public.rfq_invitations (rfq_id, supplier_id, anonymous_label, status)
         VALUES ($1, $2, 'A', 'QUOTED') RETURNING id`,
        [sixthRfq.rows[0].id, DEMO.suppliers.aquaPrime],
      );
      const sixthQuote = await client.query<{ id: string }>(
        `INSERT INTO public.quotes (rfq_id, supplier_id, invitation_id, status, current_version)
         VALUES ($1, $2, $3, 'SUBMITTED', 1) RETURNING id`,
        [sixthRfq.rows[0].id, DEMO.suppliers.aquaPrime, sixthInvite.rows[0].id],
      );
      const carried = await captureError(
        client,
        `INSERT INTO public.quote_versions (quote_id, version, snapshot, created_by)
         VALUES ($1, 1, $2::jsonb, $3)`,
        [sixthQuote.rows[0].id, ELIGIBLE_SNAPSHOT, supplierProfile.id],
      );
      expect(carried).toMatch(/does not carry|PILOT_ALLOWANCE_EXHAUSTED/i);
    });
  });

  it('lets the profile owner save notification preferences and rejects another profile', async () => {
    await withRollback(async (client) => {
      const buyer = await profileFor(client, DEMO.logins.sunriseManager);
      const rival = await profileFor(client, DEMO.logins.kovaiOwner);
      expect(buyer.id).not.toBe(buyer.authUserId);
      await actAs(client, buyer.authUserId);
      const saved = await client.query<{ r: { success: boolean; preference_id: string } }>(
        `SELECT public.update_notification_preferences_atomic(
           $1, NULL, '{"EMAIL": false, "IN_APP": true}'::jsonb, ARRAY['MARKETING']::text[],
           NULL, NULL, '09:00', '18:00'
         ) AS r`,
        [buyer.id],
      );
      expect(saved.rows[0].r.success).toBe(true);
      const stored = await client.query<{ email: boolean; quiet: string }>(
        `SELECT (channel_preferences->>'EMAIL')::boolean AS email, quiet_hours_start AS quiet
         FROM public.notification_preferences WHERE id = $1`,
        [saved.rows[0].r.preference_id],
      );
      expect(stored.rows[0]).toEqual({ email: false, quiet: '09:00' });
      const rivalDenied = await captureError(
        client,
        `SELECT public.update_notification_preferences_atomic(
           $1, NULL, '{"EMAIL": false}'::jsonb, ARRAY[]::text[], NULL, NULL, NULL, NULL
         )`,
        [rival.id],
      );
      expect(rivalDenied).toMatch(/AUTH-01|Access denied/i);
      const stolen = await captureError(
        client,
        `INSERT INTO public.notification_preferences (user_id, channel_preferences)
         VALUES ($1, '{"EMAIL": false}'::jsonb)`,
        [rival.id],
      );
      expect(stolen).toMatch(/row-level security|permission denied/i);
    });
  });

  it('direct quote version updates are rejected and a second version does not erase the first', async () => {
    await withRollback(async (client) => {
      const buyer = await profileFor(client, DEMO.logins.sunriseManager);
      const supplier = await profileFor(client, DEMO.logins.motorSupplier);
      const sub = await client.query<{ id: string; category_id: string }>(
        `SELECT id, category_id FROM public.requirement_subcategories WHERE code = 'motor_rewinding' LIMIT 1`,
      );
      const requirement = await client.query<{ id: string }>(
        `INSERT INTO public.requirements (
           organization_id, created_by, requirement_type, title, category_id, subcategory_id, status
         ) VALUES ($1, $2, 'SERVICE', 'version history', $3, $4, 'QUOTING') RETURNING id`,
        [await freshOrg(client, 'MONTHLY'), buyer.id, sub.rows[0].category_id, sub.rows[0].id],
      );
      const rfq = await client.query<{ id: string }>(
        `INSERT INTO public.rfqs (requirement_id, organization_id, title, created_by, status)
         VALUES ($1, (SELECT organization_id FROM public.requirements WHERE id = $1), 'version rfq', $2, 'OPEN') RETURNING id`,
        [requirement.rows[0].id, buyer.id],
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
         VALUES ($1, 1, '{"totalCost": 1000, "basePrice": 1000}'::jsonb, $2)`,
        [quote.rows[0].id, supplier.id],
      );
      await actAs(client, supplier.authUserId);
      await client.query('SAVEPOINT version_update');
      let rewriteBlocked = '';
      let rewritten = 0;
      try {
        const updated = await client.query(
          `UPDATE public.quote_versions SET snapshot = '{"totalCost": 1}'::jsonb WHERE quote_id = $1 AND version = 1 RETURNING quote_id`,
          [quote.rows[0].id],
        );
        rewritten = updated.rowCount ?? 0;
      } catch (error) {
        rewriteBlocked = (error as Error).message;
      }
      await client.query('ROLLBACK TO SAVEPOINT version_update');
      expect(rewritten).toBe(0);
      if (rewriteBlocked) {
        expect(rewriteBlocked.toLowerCase()).toMatch(/permission|not allowed|quote_versions|cannot|denied|policy/);
      }
      await asOwner(client);
      await client.query(
        `INSERT INTO public.quote_versions (quote_id, version, snapshot, created_by)
         VALUES ($1, 2, '{"totalCost": 900, "basePrice": 900}'::jsonb, $2)`,
        [quote.rows[0].id, supplier.id],
      );
      const history = await client.query<{ version: number; total: string }>(
        `SELECT version, snapshot->>'totalCost' AS total FROM public.quote_versions WHERE quote_id = $1 ORDER BY version`,
        [quote.rows[0].id],
      );
      expect(history.rows.map((row) => row.total)).toEqual(['1000', '900']);
    });
  });

  it('keeps a personal address private and leaves a copied RFQ snapshot unchanged after the book is edited', async () => {
    await withRollback(async (client) => {
      const buyer = await profileFor(client, DEMO.logins.sunriseManager);
      const rival = await profileFor(client, DEMO.logins.kovaiOwner);
      const address = await client.query<{ id: string }>(
        `INSERT INTO public.buyer_addresses (profile_id, address_line1, city, state, pincode, label)
         VALUES ($1, '12 Original Lane', 'Bengaluru', 'Karnataka', '560001', 'Home')
         RETURNING id`,
        [buyer.id],
      );
      const requirement = await client.query<{ id: string }>(
        `INSERT INTO public.requirements (
           organization_id, created_by, requirement_type, title, status
         ) VALUES ($1, $2, 'SERVICE', 'address snapshot', 'DRAFT') RETURNING id`,
        [DEMO.orgs.sunrise, buyer.id],
      );
      const rfq = await client.query<{ id: string }>(
        `INSERT INTO public.rfqs (
           requirement_id, organization_id, title, created_by, status, delivery_address_snapshot
         ) VALUES ($1, $2, 'address snapshot rfq', $3, 'DRAFT', $4::jsonb) RETURNING id`,
        [
          requirement.rows[0].id,
          DEMO.orgs.sunrise,
          buyer.id,
          JSON.stringify({ addressLine1: '12 Original Lane', city: 'Bengaluru', sourceAddressId: address.rows[0].id }),
        ],
      );
      await client.query(
        `UPDATE public.buyer_addresses SET address_line1 = '99 Edited Lane' WHERE id = $1`,
        [address.rows[0].id],
      );
      const snapshot = await client.query<{ line: string }>(
        `SELECT delivery_address_snapshot->>'addressLine1' AS line FROM public.rfqs WHERE id = $1`,
        [rfq.rows[0].id],
      );
      expect(snapshot.rows[0].line).toBe('12 Original Lane');

      await actAs(client, rival.authUserId);
      const stolen = await client.query(`SELECT id FROM public.buyer_addresses WHERE id = $1`, [address.rows[0].id]);
      expect(stolen.rowCount).toBe(0);
      const edited = await captureError(
        client,
        `UPDATE public.buyer_addresses SET address_line1 = 'stolen' WHERE id = $1`,
        [address.rows[0].id],
      );
      expect(edited).toMatch(/permission denied|row-level security/i);

      await asOwner(client);
      await actAs(client, buyer.authUserId);
      const own = await client.query<{ line: string }>(
        `SELECT address_line1 AS line FROM public.buyer_addresses WHERE id = $1`,
        [address.rows[0].id],
      );
      expect(own.rows[0].line).toBe('99 Edited Lane');
    });
  });

  it('scores two persisted quotes from stored prices and does not treat the higher score as an award', async () => {
    await withRollback(async (client) => {
      const buyer = await profileFor(client, DEMO.logins.qaBuyer);
      const supplier = await profileFor(client, DEMO.logins.motorSupplier);
      const orgId = await freshOrg(client, 'MONTHLY');
      await client.query(
        `INSERT INTO public.organization_members (organization_id, profile_id, role)
         VALUES ($1, $2, 'OWNER')`,
        [orgId, buyer.id],
      );
      await assumeJwt(client, buyer.authUserId);
      const sub = await client.query<{ id: string; category_id: string }>(
        `SELECT id, category_id FROM public.requirement_subcategories WHERE code = 'motor_rewinding' LIMIT 1`,
      );
      const requirement = await client.query<{ id: string }>(
        `INSERT INTO public.requirements (
           organization_id, created_by, requirement_type, title, category_id, subcategory_id, status
         ) VALUES ($1, $2, 'SERVICE', 'merit draft', $3, $4, 'QUOTING') RETURNING id`,
        [orgId, buyer.id, sub.rows[0].category_id, sub.rows[0].id],
      );
      const rfq = await client.query<{ id: string }>(
        `INSERT INTO public.rfqs (
           requirement_id, organization_id, title, created_by, status, evaluation_weights
         ) VALUES ($1, $2, 'merit rfq', $3, 'OPEN', '{"price": 100}'::jsonb) RETURNING id`,
        [requirement.rows[0].id, orgId, buyer.id],
      );
      const offers = [
        { supplierId: DEMO.suppliers.aquaPrime, price: '4000' },
        { supplierId: DEMO.suppliers.nandi, price: '9000' },
      ];
      for (const offer of offers) {
        const invite = await client.query<{ id: string }>(
          `INSERT INTO public.rfq_invitations (rfq_id, supplier_id, anonymous_label, status)
           VALUES ($1, $2, $3, 'QUOTED') RETURNING id`,
          [rfq.rows[0].id, offer.supplierId, `Offer ${offer.price}`],
        );
        const quote = await client.query<{ id: string }>(
          `INSERT INTO public.quotes (rfq_id, supplier_id, invitation_id, status, current_version)
           VALUES ($1, $2, $3, 'SUBMITTED', 1) RETURNING id`,
          [rfq.rows[0].id, offer.supplierId, invite.rows[0].id],
        );
        const snapshot = JSON.stringify({
          currency: 'INR',
          basePrice: offer.price,
          totalCost: offer.price,
          deliveryDays: '7',
        });
        await client.query(
          `INSERT INTO public.quote_versions (quote_id, version, snapshot, created_by)
           VALUES ($1, 1, $2::jsonb, $3)`,
          [quote.rows[0].id, snapshot, supplier.id],
        );
      }
      const scored = await client.query<{ result: { scored: number } }>(
        `SELECT public.compute_quote_evaluations($1) AS result`,
        [rfq.rows[0].id],
      );
      expect(Number(scored.rows[0].result.scored)).toBe(2);
      const ranks = await client.query<{ score: string; total: string }>(
        `SELECT e.evaluation_score::text AS score, qv.snapshot->>'totalCost' AS total
         FROM public.quote_evaluations e
         JOIN public.quote_versions qv ON qv.quote_id = e.quote_id AND qv.version = e.version_evaluated
         WHERE e.rfq_id = $1
         ORDER BY e.evaluation_score DESC, qv.snapshot->>'totalCost' ASC`,
        [rfq.rows[0].id],
      );
      expect(ranks.rows.map((row) => row.total)).toEqual(['4000', '9000']);
      expect(Number(ranks.rows[0].score)).toBeGreaterThan(Number(ranks.rows[1].score));
    });
  });

  it('rejects cross-supplier, declined, expired, and withdrawn quote submissions', async () => {
    await withRollback(async (client) => {
      const buyer = await profileFor(client, DEMO.logins.sunriseManager);
      const supplierA = await profileFor(client, DEMO.logins.motorSupplier);
      const orgId = await freshOrg(client, 'MONTHLY');
      const sub = await client.query<{ id: string; category_id: string }>(
        `SELECT id, category_id FROM public.requirement_subcategories WHERE code = 'motor_rewinding' LIMIT 1`,
      );
      const requirement = await client.query<{ id: string }>(
        `INSERT INTO public.requirements (
           organization_id, created_by, requirement_type, title, category_id, subcategory_id, status
         ) VALUES ($1, $2, 'SERVICE', 'quote rpc isolation', $3, $4, 'QUOTING') RETURNING id`,
        [orgId, buyer.id, sub.rows[0].category_id, sub.rows[0].id],
      );
      const rfq = await client.query<{ id: string }>(
        `INSERT INTO public.rfqs (requirement_id, organization_id, title, created_by, status)
         VALUES ($1, $2, 'quote rpc rfq', $3, 'OPEN') RETURNING id`,
        [requirement.rows[0].id, orgId, buyer.id],
      );
      const inviteA = await client.query<{ id: string }>(
        `INSERT INTO public.rfq_invitations (rfq_id, supplier_id, anonymous_label, status)
         VALUES ($1, $2, 'A', 'INVITED') RETURNING id`,
        [rfq.rows[0].id, DEMO.suppliers.aquaPrime],
      );
      const inviteB = await client.query<{ id: string }>(
        `INSERT INTO public.rfq_invitations (rfq_id, supplier_id, anonymous_label, status)
         VALUES ($1, $2, 'B', 'INVITED') RETURNING id`,
        [rfq.rows[0].id, DEMO.suppliers.nandi],
      );
      await actAs(client, supplierA.authUserId);
      const cross = await captureError(
        client,
        `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
        [rfq.rows[0].id, inviteB.rows[0].id, DEMO.suppliers.nandi, ELIGIBLE_SNAPSHOT],
      );
      expect(cross).toMatch(/QUOTE-SUPPLIER-AUTH/);
      const mismatched = await captureError(
        client,
        `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
        [rfq.rows[0].id, inviteB.rows[0].id, DEMO.suppliers.aquaPrime, ELIGIBLE_SNAPSHOT],
      );
      expect(mismatched).toMatch(/QUOTE-INVITATION-MISMATCH/);
      await asOwner(client);
      await client.query(`UPDATE public.rfq_invitations SET status = 'DECLINED' WHERE id = $1`, [inviteA.rows[0].id]);
      await actAs(client, supplierA.authUserId);
      const declined = await captureError(
        client,
        `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
        [rfq.rows[0].id, inviteA.rows[0].id, DEMO.suppliers.aquaPrime, ELIGIBLE_SNAPSHOT],
      );
      expect(declined).toMatch(/QUOTE-INVITATION-INELIGIBLE/);
      await asOwner(client);
      await client.query(`UPDATE public.rfq_invitations SET status = 'INVITED' WHERE id = $1`, [inviteA.rows[0].id]);
      await client.query(`UPDATE public.rfqs SET quote_deadline = now() - interval '1 minute' WHERE id = $1`, [rfq.rows[0].id]);
      await actAs(client, supplierA.authUserId);
      const expired = await captureError(
        client,
        `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
        [rfq.rows[0].id, inviteA.rows[0].id, DEMO.suppliers.aquaPrime, ELIGIBLE_SNAPSHOT],
      );
      expect(expired).toMatch(/QUOTE-WINDOW-CLOSED/);
      await asOwner(client);
      await client.query(`UPDATE public.rfqs SET quote_deadline = now() + interval '1 day' WHERE id = $1`, [rfq.rows[0].id]);
      await client.query(`UPDATE public.rfqs SET status = 'CANCELLED' WHERE id = $1`, [rfq.rows[0].id]);
      await actAs(client, supplierA.authUserId);
      const withdrawn = await captureError(
        client,
        `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
        [rfq.rows[0].id, inviteA.rows[0].id, DEMO.suppliers.aquaPrime, ELIGIBLE_SNAPSHOT],
      );
      expect(withdrawn).toMatch(/QUOTE-WINDOW-CLOSED/);
      const quotes = await client.query(`SELECT id FROM public.quotes WHERE rfq_id = $1`, [rfq.rows[0].id]);
      expect(quotes.rowCount).toBe(0);
    });
  });

  it('refuses a qualifying quote whose RFQ was created in a previous UTC month', async () => {
    await withRollback(async (client) => {
      const buyer = await profileFor(client, DEMO.logins.qaBuyer);
      const supplier = await profileFor(client, DEMO.logins.motorSupplier);
      const orgId = await freshOrg(client, 'MONTHLY');
      await assumeJwt(client, supplier.authUserId);
      const sub = await client.query<{ id: string; category_id: string }>(
        `SELECT id, category_id FROM public.requirement_subcategories WHERE code = 'motor_rewinding' LIMIT 1`,
      );
      const requirement = await client.query<{ id: string }>(
        `INSERT INTO public.requirements (
           organization_id, created_by, requirement_type, title, category_id, subcategory_id, status
         ) VALUES ($1, $2, 'SERVICE', 'stale month', $3, $4, 'QUOTING') RETURNING id`,
        [orgId, buyer.id, sub.rows[0].category_id, sub.rows[0].id],
      );
      const rfq = await client.query<{ id: string }>(
        `INSERT INTO public.rfqs (requirement_id, organization_id, title, created_by, status, created_at)
         VALUES ($1, $2, 'stale month rfq', $3, 'OPEN', date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '1 day')
         RETURNING id`,
        [requirement.rows[0].id, orgId, buyer.id],
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
      const blocked = await captureError(
        client,
        `INSERT INTO public.quote_versions (quote_id, version, snapshot, created_by)
         VALUES ($1, 1, $2::jsonb, $3)`,
        [quote.rows[0].id, ELIGIBLE_SNAPSHOT, supplier.id],
      );
      expect(blocked).toMatch(/outside the RFQ's UTC month/);
      const consumed = await client.query(
        `SELECT id FROM public.rfq_allowance_consumptions WHERE organization_id = $1`,
        [orgId],
      );
      expect(consumed.rowCount).toBe(0);
    });
  });
});
