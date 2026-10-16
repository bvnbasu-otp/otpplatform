/**
 * 00286: the first qualifying supplier quote consumes one pilot allowance.
 * Publishing an RFQ does not. Runs in one rolled-back transaction on local
 * PostgreSQL (127.0.0.1:54322) and skips when that database is unavailable.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { deleteFixtureRequirements } from '../helpers/fixture-teardown';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

describe('00286 static contract', () => {
  const sql = readFileSync(
    resolve('supabase/migrations/00286_first_qualifying_quote_rfq_allowance.sql'),
    'utf8',
  ).replace(/--.*$/gm, '');

  it('does not let an authenticated caller insert a consumption or execute the writer', () => {
    expect(sql).toContain('rfq_id uuid NOT NULL UNIQUE');
    expect(sql).toContain('GRANT SELECT ON public.rfq_allowance_consumptions TO authenticated');
    expect(sql).not.toMatch(/GRANT\s+INSERT[^;]*rfq_allowance_consumptions[^;]*authenticated/i);
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION private.consume_pilot_allowance_for_quote(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated',
    );
    expect(sql).toContain("HINT = 'PILOT_ALLOWANCE_EXHAUSTED'");
    expect(sql).toContain("HINT = 'PILOT_ALLOWANCE_PERIOD_UNDECIDED'");
    expect(sql).toContain('v_allowance CONSTANT integer := 3');
  });

  it('shares comparison eligibility and fails closed before a purchased credit changes', () => {
    const comparison = readFileSync(
      resolve('supabase/migrations/00288_authenticated_quote_comparison_levels.sql'),
      'utf8',
    ).replace(/--.*$/gm, '');
    const purchases = readFileSync(
      resolve('supabase/migrations/00289_pilot_simulated_purchase_entitlements.sql'),
      'utf8',
    ).replace(/--.*$/gm, '');
    expect(comparison).toContain('private.quote_is_comparison_eligible(q.id, qv.snapshot)');
    expect(comparison).toContain('IF NOT private.quote_is_comparison_eligible(NEW.quote_id, NEW.snapshot) THEN');
    const purchased = purchases.slice(purchases.indexOf('FUNCTION private.consume_purchased_rfq_credit_if_needed'));
    const monthHold = purchased.indexOf("HINT = 'PILOT_ALLOWANCE_PERIOD_UNDECIDED'");
    const creditUpdate = purchased.indexOf('purchased_rfq_credits = purchased_rfq_credits - 1');
    expect(monthHold).toBeGreaterThan(-1);
    expect(creditUpdate).toBeGreaterThan(monthHold);
    expect(purchases).toContain('private.quote_is_comparison_eligible(v_quote.id, NEW.snapshot)');
    expect(purchases).toContain('GRANT EXECUTE ON FUNCTION public.get_buyer_pilot_allowance(uuid) TO authenticated');
  });
});

type Account = { profileId: string; authUserId: string; email: string; supplierId?: string };

async function connect(): Promise<Client | null> {
  const client = new Client(LOCAL_POSTGRES);
  try {
    await client.connect();
  } catch {
    console.warn('[SKIP REASON] local PostgreSQL is unavailable at 127.0.0.1:54322');
    return null;
  }
  const installed = await client.query(`SELECT to_regclass('public.rfq_allowance_consumptions') AS t`);
  if (!installed.rows[0].t) {
    console.warn('[SKIP REASON] local PostgreSQL does not have migration 00286 applied');
    await client.end();
    return null;
  }
  return client;
}

async function expectError(client: Client, text: string, params: unknown[], code: string) {
  await client.query('SAVEPOINT expect_error');
  let message = '';
  try {
    await client.query(text, params);
  } catch (error) {
    const pgError = error as { message?: string; hint?: string };
    message = `${pgError.message ?? ''} ${pgError.hint ?? ''}`;
  }
  await client.query('ROLLBACK TO SAVEPOINT expect_error');
  expect(message).toContain(code);
}

async function signup(client: Client, side: 'BUYER' | 'SUPPLIER', buyerType?: 'INDIVIDUAL' | 'MSME' | 'COMMUNITY'): Promise<Account> {
  const email = `a286-${randomUUID()}@example.test`;
  await client.query('RESET ROLE');
  await client.query('SET LOCAL ROLE anon');
  const body: Record<string, unknown> = {
    side,
    business_name: side === 'SUPPLIER' ? 'Allowance Supplier' : buyerType === 'INDIVIDUAL' ? 'Self' : `Allowance ${buyerType}`,
    contact_first_name: 'Al',
    contact_last_name: 'Lowance',
    phone: '9876543210',
    verification_channel: 'EMAIL',
    coverage_city: 'Bengaluru',
    coverage_pincode: '560048',
    eula_accepted: true,
    eula_version: 'v1.0-20261014',
    email,
  };
  if (side === 'BUYER') body.buyer_type = buyerType;
  if (side === 'SUPPLIER') {
    const category = await client.query(`SELECT code FROM public.requirement_categories ORDER BY code LIMIT 1`);
    body.category_codes = [category.rows[0].code];
  }
  const res = await client.query('SELECT public.submit_signup_request($1::jsonb) AS r', [JSON.stringify(body)]);
  await client.query('RESET ROLE');
  expect(res.rows[0].r.status).toBe('ONBOARDED');
  const profile = await client.query(`SELECT id, auth_user_id FROM public.profiles WHERE lower(email) = lower($1)`, [email]);
  const account: Account = { profileId: profile.rows[0].id, authUserId: profile.rows[0].auth_user_id, email };
  if (side === 'SUPPLIER') {
    const supplier = await client.query(`SELECT supplier_id FROM public.supplier_users WHERE profile_id = $1`, [account.profileId]);
    account.supplierId = supplier.rows[0].supplier_id;
  }
  return account;
}

async function actAs(client: Client, account: Account) {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: account.authUserId, role: 'authenticated' }),
  ]);
  await client.query('SET LOCAL ROLE authenticated');
}

async function asOwner(client: Client) {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', '', true)`);
}

async function publishPersonal(client: Client, buyer: Account): Promise<string> {
  const tax = await client.query(`
    SELECT c.id AS category_id, s.id AS subcategory_id
    FROM public.requirement_categories c
    JOIN public.requirement_subcategories s ON s.category_id = c.id
    ORDER BY c.name, s.name LIMIT 1`);
  await actAs(client, buyer);
  const requirement = await client.query(
    `INSERT INTO public.requirements (organization_id, created_by, requirement_type, title, category_id, subcategory_id,
                                      delivery_city, delivery_pincode)
     VALUES (NULL, $1, 'SERVICE', 'Allowance requirement', $2, $3, 'Bengaluru', '560048')
     RETURNING id`,
    [buyer.profileId, tax.rows[0].category_id, tax.rows[0].subcategory_id],
  );
  const published = await client.query(
    `SELECT public.publish_requirement($1::uuid, 'IDENTITY_PROTECTED'::sourcing_mode, 1, 7, '{}'::jsonb, 'SUGGESTED') AS r`,
    [requirement.rows[0].id],
  );
  return published.rows[0].r.rfqId as string;
}

async function invite(client: Client, rfqId: string, supplierId: string, label: string): Promise<string> {
  await asOwner(client);
  const row = await client.query(
    `INSERT INTO public.rfq_invitations (rfq_id, supplier_id, anonymous_label)
     VALUES ($1, $2, $3) RETURNING id`,
    [rfqId, supplierId, label],
  );
  await client.query(
    `UPDATE public.rfqs SET status = 'OPEN'
     WHERE id = $1 AND status = 'DRAFT'`,
    [rfqId],
  );
  return row.rows[0].id as string;
}

async function quote(client: Client, supplier: Account, rfqId: string, invitationId: string, status: string, snapshot: string, version = 1) {
  await actAs(client, supplier);
  if (status === 'DRAFT') {
    const quoteId = randomUUID();
    await client.query(
      `INSERT INTO public.quotes (id, rfq_id, supplier_id, invitation_id, status, current_version)
       VALUES ($1, $2, $3, $4, 'DRAFT', 0)`,
      [quoteId, rfqId, supplier.supplierId, invitationId],
    );
    return quoteId;
  }
  expect(version).toBe(1);
  const result = await client.query(
    `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL) AS r`,
    [rfqId, invitationId, supplier.supplierId, snapshot],
  );
  return result.rows[0].r.quoteId as string;
}

const PRICED = '{"basePrice":1000,"gstAmount":180,"transportCost":0,"totalCost":1180,"deliveryDays":7,"currency":"INR"}';

async function consumed(client: Client, ownerId: string): Promise<number> {
  await asOwner(client);
  const row = await client.query(
    `SELECT count(*)::int AS n FROM public.rfq_allowance_consumptions WHERE owner_profile_id = $1`,
    [ownerId],
  );
  return row.rows[0].n as number;
}

async function pricedQuote(client: Client, supplier: Account, buyer: Account): Promise<string> {
  const rfqId = await publishPersonal(client, buyer);
  const invitationId = await invite(client, rfqId, supplier.supplierId!, `S-${randomUUID().slice(0, 8)}`);
  await quote(client, supplier, rfqId, invitationId, 'SUBMITTED', PRICED);
  return rfqId;
}

describe('00286 first qualifying quote consumes one allowance', () => {
  it('enforces exactly-once consumption for a personal buyer and refuses the undecided month boundary', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const alice = await signup(client, 'BUYER', 'INDIVIDUAL');
      const bob = await signup(client, 'BUYER', 'INDIVIDUAL');
      const supplier = await signup(client, 'SUPPLIER');
      const otherSupplier = await signup(client, 'SUPPLIER');

      const draftRfq = await publishPersonal(client, alice);
      await asOwner(client);
      expect((await client.query(`SELECT organization_id FROM public.rfqs WHERE id = $1`, [draftRfq])).rows[0].organization_id).toBeNull();
      const draftInvite = await invite(client, draftRfq, supplier.supplierId!, 'S-draft');
      await quote(client, supplier, draftRfq, draftInvite, 'DRAFT', PRICED);
      expect(await consumed(client, alice.profileId)).toBe(0);

      const emptyRfq = await publishPersonal(client, alice);
      const emptyInvite = await invite(client, emptyRfq, supplier.supplierId!, 'S-empty');
      await actAs(client, supplier);
      await expectError(
        client,
        `SELECT public.submit_supplier_quote_atomic($1, $2, $3, '{}'::jsonb, NULL)`,
        [emptyRfq, emptyInvite, supplier.supplierId],
        'QUOTE-PRICE-INVALID',
      );
      expect(await consumed(client, alice.profileId)).toBe(0);

      const firstRfq = await pricedQuote(client, supplier, alice);
      expect(await consumed(client, alice.profileId)).toBe(1);
      await asOwner(client);
      const row = await client.query(
        `SELECT organization_id, owner_profile_id, qualification_reason, used_quarterly_bonus
         FROM public.rfq_allowance_consumptions WHERE rfq_id = $1`,
        [firstRfq],
      );
      expect(row.rows[0]).toEqual({
        organization_id: null,
        owner_profile_id: alice.profileId,
        qualification_reason: 'FIRST_QUALIFYING_QUOTE',
        used_quarterly_bonus: false,
      });

      await actAs(client, supplier);
      const firstQuote = await client.query(`SELECT id FROM public.quotes WHERE rfq_id = $1`, [firstRfq]);
      await client.query(
        `SELECT public.revise_supplier_quote_atomic($1, $2::jsonb, NULL)`,
        [firstQuote.rows[0].id, PRICED],
      );
      expect(await consumed(client, alice.profileId)).toBe(1);

      const secondInvite = await invite(client, firstRfq, otherSupplier.supplierId!, 'S-other');
      await quote(client, otherSupplier, firstRfq, secondInvite, 'SUBMITTED', PRICED);
      expect(await consumed(client, alice.profileId)).toBe(1);

      const silent = await publishPersonal(client, alice);
      expect(await consumed(client, alice.profileId)).toBe(1);
      await asOwner(client);
      await client.query(`UPDATE public.rfqs SET status = 'CANCELLED' WHERE id = $1`, [silent]);
      expect(await consumed(client, alice.profileId)).toBe(1);

      await asOwner(client);
      await client.query(`UPDATE public.rfqs SET status = 'CANCELLED' WHERE id = $1`, [firstRfq]);
      expect(await consumed(client, alice.profileId)).toBe(1);

      expect(await consumed(client, bob.profileId)).toBe(0);
      await pricedQuote(client, supplier, bob);
      expect(await consumed(client, bob.profileId)).toBe(1);
      expect(await consumed(client, alice.profileId)).toBe(1);

      await pricedQuote(client, supplier, alice);
      await pricedQuote(client, supplier, alice);
      expect(await consumed(client, alice.profileId)).toBe(3);

      const blocked = await publishPersonal(client, alice);
      const blockedInvite = await invite(client, blocked, supplier.supplierId!, 'S-blocked');
      await actAs(client, supplier);
      await expectError(
        client,
        `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
        [blocked, blockedInvite, supplier.supplierId, PRICED],
        'PILOT_ALLOWANCE_EXHAUSTED',
      );
      await asOwner(client);
      expect((await client.query(`SELECT count(*)::int AS n FROM public.quotes WHERE rfq_id = $1`, [blocked])).rows[0].n).toBe(0);
      expect(await consumed(client, alice.profileId)).toBe(3);

      await client.query(`SAVEPOINT before_rollback`);
      const transient = await publishPersonal(client, bob);
      const transientInvite = await invite(client, transient, supplier.supplierId!, 'S-rollback');
      await quote(client, supplier, transient, transientInvite, 'SUBMITTED', PRICED);
      expect(await consumed(client, bob.profileId)).toBe(2);
      await client.query(`ROLLBACK TO SAVEPOINT before_rollback`);
      expect(await consumed(client, bob.profileId)).toBe(1);

      await asOwner(client);
      await client.query(`UPDATE public.personal_subscriptions SET subscription_plan = 'YEARLY' WHERE profile_id = $1`, [alice.profileId]);
      const bonusRfq = await pricedQuote(client, supplier, alice);
      await asOwner(client);
      const bonus = await client.query(
        `SELECT used_quarterly_bonus FROM public.rfq_allowance_consumptions WHERE rfq_id = $1`,
        [bonusRfq],
      );
      expect(bonus.rows[0].used_quarterly_bonus).toBe(true);

      const past = await publishPersonal(client, bob);
      await asOwner(client);
      await client.query(`UPDATE public.rfqs SET created_at = now() - interval '40 days' WHERE id = $1`, [past]);
      const pastInvite = await invite(client, past, supplier.supplierId!, 'S-past');
      await actAs(client, supplier);
      await expectError(
        client,
        `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
        [past, pastInvite, supplier.supplierId, PRICED],
        'PILOT_ALLOWANCE_PERIOD_UNDECIDED',
      );

      const msme = await signup(client, 'BUYER', 'MSME');
      const rwa = await signup(client, 'BUYER', 'COMMUNITY');
      for (const buyer of [msme, rwa]) {
        await asOwner(client);
        const org = await client.query(`SELECT active_organization_id AS id FROM public.profiles WHERE id = $1`, [buyer.profileId]);
        await actAs(client, buyer);
        const tax = await client.query(`
          SELECT c.id AS category_id, s.id AS subcategory_id
          FROM public.requirement_categories c
          JOIN public.requirement_subcategories s ON s.category_id = c.id
          ORDER BY c.name, s.name LIMIT 1`);
        const requirement = await client.query(
          `INSERT INTO public.requirements (organization_id, created_by, requirement_type, title, category_id, subcategory_id,
                                            delivery_city, delivery_pincode)
           VALUES ($1, $2, 'SERVICE', 'Org allowance', $3, $4, 'Bengaluru', '560048') RETURNING id`,
          [org.rows[0].id, buyer.profileId, tax.rows[0].category_id, tax.rows[0].subcategory_id],
        );
        const published = await client.query(
          `SELECT public.publish_requirement($1::uuid, 'IDENTITY_PROTECTED'::sourcing_mode, 1, 7, '{}'::jsonb, 'SUGGESTED') AS r`,
          [requirement.rows[0].id],
        );
        const orgRfq = published.rows[0].r.rfqId as string;
        const orgInvite = await invite(client, orgRfq, supplier.supplierId!, `S-${buyer.profileId.slice(0, 8)}`);
        await quote(client, supplier, orgRfq, orgInvite, 'SUBMITTED', PRICED);
        await asOwner(client);
        const scoped = await client.query(
          `SELECT organization_id, owner_profile_id FROM public.rfq_allowance_consumptions WHERE rfq_id = $1`,
          [orgRfq],
        );
        expect(scoped.rows[0]).toEqual({ organization_id: org.rows[0].id, owner_profile_id: null });
      }
      expect(await consumed(client, alice.profileId)).toBe(4);

      await actAs(client, alice);
      await expectError(
        client,
        `INSERT INTO public.rfq_allowance_consumptions (rfq_id, owner_profile_id, quote_id, quote_version_id)
         VALUES ($1, $2, $3, $4)`,
        [firstRfq, alice.profileId, randomUUID(), randomUUID()],
        'permission denied',
      );
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('serializes two real sessions on one RFQ and on the buyer final allowance', async () => {
    const setup = await connect();
    if (!setup) return;
    const sessionA = await connect();
    const sessionB = await connect();
    if (!sessionA || !sessionB) {
      await setup.end();
      await sessionA?.end();
      await sessionB?.end();
      return;
    }
    let buyerProfileId: string | null = null;
    try {
      await setup.query('BEGIN');
      const buyer = await signup(setup, 'BUYER', 'INDIVIDUAL');
      buyerProfileId = buyer.profileId;
      const supplierA = await signup(setup, 'SUPPLIER');
      const supplierB = await signup(setup, 'SUPPLIER');
      const sharedRfq = await publishPersonal(setup, buyer);
      const sharedInviteA = await invite(setup, sharedRfq, supplierA.supplierId!, 'S-race-a');
      const sharedInviteB = await invite(setup, sharedRfq, supplierB.supplierId!, 'S-race-b');
      await setup.query('COMMIT');

      await sessionA.query('BEGIN');
      await sessionB.query('BEGIN');
      await actAs(sessionA, supplierA);
      await actAs(sessionB, supplierB);
      const [sameA, sameB] = await Promise.all([
        sessionA.query(
          `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL) AS r`,
          [sharedRfq, sharedInviteA, supplierA.supplierId, PRICED],
        ).then(async (result) => {
          await sessionA.query('COMMIT');
          return result;
        }),
        sessionB.query(
          `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL) AS r`,
          [sharedRfq, sharedInviteB, supplierB.supplierId, PRICED],
        ).then(async (result) => {
          await sessionB.query('COMMIT');
          return result;
        }),
      ]);
      expect(sameA.rows[0].r.ok).toBe(true);
      expect(sameB.rows[0].r.ok).toBe(true);
      expect(await consumed(setup, buyer.profileId)).toBe(1);

      await setup.query('BEGIN');
      const secondRfq = await publishPersonal(setup, buyer);
      const secondInvite = await invite(setup, secondRfq, supplierA.supplierId!, 'S-second');
      await setup.query('COMMIT');
      await sessionA.query('BEGIN');
      await actAs(sessionA, supplierA);
      await sessionA.query(
        `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
        [secondRfq, secondInvite, supplierA.supplierId, PRICED],
      );
      await sessionA.query('COMMIT');
      expect(await consumed(setup, buyer.profileId)).toBe(2);

      await setup.query('BEGIN');
      const finalRfqA = await publishPersonal(setup, buyer);
      const finalRfqB = await publishPersonal(setup, buyer);
      const finalInviteA = await invite(setup, finalRfqA, supplierA.supplierId!, 'S-final-a');
      const finalInviteB = await invite(setup, finalRfqB, supplierB.supplierId!, 'S-final-b');
      await setup.query('COMMIT');

      await sessionA.query('BEGIN');
      await sessionB.query('BEGIN');
      await actAs(sessionA, supplierA);
      await actAs(sessionB, supplierB);
      const competing = await Promise.allSettled([
        sessionA.query(
          `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
          [finalRfqA, finalInviteA, supplierA.supplierId, PRICED],
        ).then(async (result) => {
          await sessionA.query('COMMIT');
          return result;
        }).catch(async (error) => {
          await sessionA.query('ROLLBACK');
          throw error;
        }),
        sessionB.query(
          `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
          [finalRfqB, finalInviteB, supplierB.supplierId, PRICED],
        ).then(async (result) => {
          await sessionB.query('COMMIT');
          return result;
        }).catch(async (error) => {
          await sessionB.query('ROLLBACK');
          throw error;
        }),
      ]);
      expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(competing.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(await consumed(setup, buyer.profileId)).toBe(3);
      await asOwner(setup);
      const finalQuoteCount = await setup.query(
        `SELECT count(*)::int AS n FROM public.quotes WHERE rfq_id = ANY($1::uuid[])`,
        [[finalRfqA, finalRfqB]],
      );
      expect(finalQuoteCount.rows[0].n).toBe(1);
    } finally {
      try { await setup.query('ROLLBACK'); } catch { /* no open transaction */ }
      try { await sessionA.query('ROLLBACK'); } catch { /* no open transaction */ }
      try { await sessionB.query('ROLLBACK'); } catch { /* no open transaction */ }
      if (buyerProfileId) {
        const requirements = await setup.query(
          `SELECT id FROM public.requirements WHERE created_by = $1`,
          [buyerProfileId],
        );
        await deleteFixtureRequirements(requirements.rows.map((row) => row.id as string));
      }
      await setup.end();
      await sessionA.end();
      await sessionB.end();
    }
  }, 30_000);

  it('does not consume an allowance for an ineligible quote and consumes one credit only when it is open', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const buyer = await signup(client, 'BUYER', 'INDIVIDUAL');
      const orgBuyer = await signup(client, 'BUYER', 'MSME');
      const supplier = await signup(client, 'SUPPLIER');
      const otherSupplier = await signup(client, 'SUPPLIER');
      const missingDelivery = '{"basePrice":1000,"gstAmount":180,"totalCost":1180,"currency":"INR"}';
      const mismatchedGst = '{"basePrice":1000,"gstAmount":180,"cgstAmount":1,"sgstAmount":1,"transportCost":0,"totalCost":1180,"deliveryDays":7,"currency":"INR"}';

      const rfqId = await publishPersonal(client, buyer);
      expect(await consumed(client, buyer.profileId)).toBe(0);
      const qualifying = await quote(
        client, supplier, rfqId, await invite(client, rfqId, supplier.supplierId!, 'S-ineligible'),
        'SUBMITTED', missingDelivery,
      );
      const secondQuote = await quote(
        client, otherSupplier, rfqId, await invite(client, rfqId, otherSupplier.supplierId!, 'S-gst'),
        'SUBMITTED', mismatchedGst,
      );
      expect(await consumed(client, buyer.profileId)).toBe(0);
      await asOwner(client);
      expect((await client.query(`SELECT count(*)::int AS n FROM public.quotes WHERE rfq_id = $1`, [rfqId])).rows[0].n).toBe(2);

      await actAs(client, supplier);
      await client.query(`SELECT public.revise_supplier_quote_atomic($1, $2::jsonb, NULL)`, [qualifying, PRICED]);
      expect(await consumed(client, buyer.profileId)).toBe(1);
      await actAs(client, otherSupplier);
      await client.query(`SELECT public.revise_supplier_quote_atomic($1, $2::jsonb, NULL)`, [secondQuote, PRICED]);
      expect(await consumed(client, buyer.profileId)).toBe(1);
      await asOwner(client);
      expect((await client.query(
        `SELECT quote_id FROM public.rfq_allowance_consumptions WHERE rfq_id = $1`,
        [rfqId],
      )).rows[0].quote_id).toBe(qualifying);

      for (const label of ['S-two', 'S-three']) {
        const next = await publishPersonal(client, buyer);
        await quote(client, supplier, next, await invite(client, next, supplier.supplierId!, label), 'SUBMITTED', PRICED);
      }
      expect(await consumed(client, buyer.profileId)).toBe(3);
      await actAs(client, buyer);
      const exhausted = await client.query(`SELECT public.get_buyer_pilot_allowance(NULL) AS r`);
      expect(exhausted.rows[0].r).toMatchObject({
        ok: true,
        includedAndBonusUsedThisMonth: 3,
        purchasedCredits: 0,
        canAcceptNextQuote: false,
        orgType: 'INDIVIDUAL',
      });

      await asOwner(client);
      const org = await client.query(`SELECT active_organization_id AS id FROM public.profiles WHERE id = $1`, [orgBuyer.profileId]);
      await actAs(client, orgBuyer);
      const orgAllowance = await client.query(`SELECT public.get_buyer_pilot_allowance($1) AS r`, [org.rows[0].id]);
      expect(orgAllowance.rows[0].r).toMatchObject({
        ok: true,
        includedAndBonusUsedThisMonth: 0,
        canAcceptNextQuote: true,
        orgType: 'MSME',
      });
      await actAs(client, buyer);
      const denied = await client.query(`SELECT public.get_buyer_pilot_allowance($1) AS r`, [org.rows[0].id]);
      expect(denied.rows[0].r.ok).toBe(false);

      await asOwner(client);
      await client.query(
        `UPDATE public.personal_subscriptions
         SET purchased_rfq_credits = 1, purchased_rfq_credits_expires_at = now() + interval '10 days'
         WHERE profile_id = $1`,
        [buyer.profileId],
      );
      await client.query(
        `INSERT INTO public.pilot_purchase_attempts (
           owner_key, owner_profile_id, initiated_by, idempotency_key, product_type,
           tier_code, plan_code, currency, taxable_amount, tax_amount, gross_amount,
           tax_breakdown, status, entitlement_quantity, remaining_credit,
           entitlement_expires_at, completed_at
         ) VALUES (
           $1, $2, $2, 'eligible-credit', 'EXTRA_RFQ', 'INDIVIDUAL', 'MONTHLY', 'INR',
           149, 26.82, 175.82, '{}'::jsonb, 'SUCCEEDED', 1, 1, now() + interval '10 days', now()
         )`,
        [`PROFILE:${buyer.profileId}`, buyer.profileId],
      );
      await actAs(client, buyer);
      expect((await client.query(`SELECT public.get_buyer_pilot_allowance(NULL) AS r`)).rows[0].r).toMatchObject({
        purchasedCredits: 1,
        canAcceptNextQuote: true,
      });
      const credited = await publishPersonal(client, buyer);
      await quote(client, supplier, credited, await invite(client, credited, supplier.supplierId!, 'S-credit'), 'SUBMITTED', PRICED);
      await asOwner(client);
      expect((await client.query(
        `SELECT entitlement_source FROM public.rfq_allowance_consumptions WHERE rfq_id = $1`,
        [credited],
      )).rows[0].entitlement_source).toBe('PURCHASED_EXTRA_RFQ');
      expect((await client.query(
        `SELECT purchased_rfq_credits FROM public.personal_subscriptions WHERE profile_id = $1`,
        [buyer.profileId],
      )).rows[0].purchased_rfq_credits).toBe(0);

      await client.query(
        `UPDATE public.personal_subscriptions
         SET purchased_rfq_credits = 1, purchased_rfq_credits_expires_at = now() - interval '1 minute'
         WHERE profile_id = $1`,
        [buyer.profileId],
      );
      const expired = await publishPersonal(client, buyer);
      const expiredInvite = await invite(client, expired, supplier.supplierId!, 'S-credit-expired');
      await actAs(client, supplier);
      await expectError(
        client,
        `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
        [expired, expiredInvite, supplier.supplierId, PRICED],
        'PILOT_ALLOWANCE_EXHAUSTED',
      );

      await asOwner(client);
      await client.query(
        `UPDATE public.personal_subscriptions
         SET purchased_rfq_credits = 1, purchased_rfq_credits_expires_at = now() + interval '10 days'
         WHERE profile_id = $1`,
        [buyer.profileId],
      );
      await client.query(
        `INSERT INTO public.pilot_purchase_attempts (
           owner_key, owner_profile_id, initiated_by, idempotency_key, product_type,
           tier_code, plan_code, currency, taxable_amount, tax_amount, gross_amount,
           tax_breakdown, status, entitlement_quantity, remaining_credit,
           entitlement_expires_at, completed_at
         ) VALUES (
           $1, $2, $2, 'cross-month-credit', 'EXTRA_RFQ', 'INDIVIDUAL', 'MONTHLY', 'INR',
           149, 26.82, 175.82, '{}'::jsonb, 'SUCCEEDED', 1, 1, now() + interval '10 days', now()
         )`,
        [`PROFILE:${buyer.profileId}`, buyer.profileId],
      );
      const past = await publishPersonal(client, buyer);
      await asOwner(client);
      await client.query(`UPDATE public.rfqs SET created_at = now() - interval '40 days' WHERE id = $1`, [past]);
      const pastInvite = await invite(client, past, supplier.supplierId!, 'S-credit-past');
      await actAs(client, supplier);
      await expectError(
        client,
        `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
        [past, pastInvite, supplier.supplierId, PRICED],
        'PILOT_ALLOWANCE_PERIOD_UNDECIDED',
      );
      await asOwner(client);
      expect((await client.query(
        `SELECT purchased_rfq_credits FROM public.personal_subscriptions WHERE profile_id = $1`,
        [buyer.profileId],
      )).rows[0].purchased_rfq_credits).toBe(1);
    } finally {
      try { await client.query('ROLLBACK'); } catch { /* no open transaction */ }
      await client.end();
    }
  }, 30_000);
});

describe('00288 authenticated comparison levels', () => {
  it('derives L1/L2/L3 and stable landed-cost ranks from eligible persisted quotes', async () => {
    const client = await connect();
    if (!client) return;
    const view = await client.query(`SELECT to_regclass('public.quotes_identity_protected') AS v`);
    if (!view.rows[0].v) {
      await client.end();
      return;
    }
    try {
      await client.query('BEGIN');
      const buyer = await signup(client, 'BUYER', 'INDIVIDUAL');
      const outsider = await signup(client, 'BUYER', 'INDIVIDUAL');
      const suppliers = [
        await signup(client, 'SUPPLIER'),
        await signup(client, 'SUPPLIER'),
        await signup(client, 'SUPPLIER'),
      ];
      const rfqId = await publishPersonal(client, buyer);
      const snapshots = [
        JSON.stringify({
          basePrice: 1000, cgstAmount: 90, sgstAmount: 90, gstAmount: 180,
          transportCost: 20, totalCost: 1200, deliveryDays: 5, warrantyMonths: 12, currency: 'INR',
        }),
        JSON.stringify({
          basePrice: 900, cgstAmount: 81, utgstAmount: 81, gstAmount: 162,
          transportCost: 18, totalCost: 1080, deliveryDays: 7, warrantyMonths: 6, currency: 'INR',
        }),
        JSON.stringify({
          basePrice: 1100, igstAmount: 198, gstAmount: 198,
          transportCost: 22, totalCost: 1320, deliveryDays: 3, warrantyMonths: 24, currency: 'INR',
        }),
      ];

      for (let index = 0; index < suppliers.length; index += 1) {
        const supplier = suppliers[index]!;
        const invitationId = await invite(client, rfqId, supplier.supplierId!, `S-level-${index + 1}`);
        await quote(client, supplier, rfqId, invitationId, 'SUBMITTED', snapshots[index]!);
        await actAs(client, buyer);
        const rows = await client.query(
          `SELECT quote_id, total_cost, comparable_rank, comparison_level,
                  eligible_quote_count, tax_structure
           FROM public.quotes_identity_protected
           WHERE rfq_id = $1
           ORDER BY comparable_rank`,
          [rfqId],
        );
        expect(rows.rowCount).toBe(index + 1);
        expect(rows.rows.every((row) => row.comparison_level === `L${index + 1}`)).toBe(true);
        expect(rows.rows.every((row) => row.eligible_quote_count === String(index + 1) || row.eligible_quote_count === index + 1)).toBe(true);
      }

      await actAs(client, buyer);
      const ranked = await client.query(
        `SELECT total_cost::text, comparable_rank::int, comparison_level, tax_structure
         FROM public.quotes_identity_protected WHERE rfq_id = $1 ORDER BY comparable_rank`,
        [rfqId],
      );
      expect(ranked.rows).toEqual([
        { total_cost: '1080.00', comparable_rank: 1, comparison_level: 'L3', tax_structure: 'CGST_UTGST' },
        { total_cost: '1200.00', comparable_rank: 2, comparison_level: 'L3', tax_structure: 'CGST_SGST' },
        { total_cost: '1320.00', comparable_rank: 3, comparison_level: 'L3', tax_structure: 'IGST' },
      ]);

      const revisedQuote = await client.query(
        `SELECT quote_id FROM public.quotes_identity_protected
         WHERE rfq_id = $1 AND total_cost = 1320`,
        [rfqId],
      );
      await actAs(client, suppliers[2]!);
      await client.query(
        `SELECT public.revise_supplier_quote_atomic($1, $2::jsonb, NULL)`,
        [
          revisedQuote.rows[0].quote_id,
          JSON.stringify({
            basePrice: 800, igstAmount: 144, gstAmount: 144,
            transportCost: 16, totalCost: 960, deliveryDays: 3, warrantyMonths: 24, currency: 'INR',
          }),
        ],
      );
      await actAs(client, buyer);
      const revisedRank = await client.query(
        `SELECT quote_id FROM public.quotes_identity_protected
         WHERE rfq_id = $1 ORDER BY comparable_rank`,
        [rfqId],
      );
      expect(revisedRank.rows[0].quote_id).toBe(revisedQuote.rows[0].quote_id);

      await actAs(client, outsider);
      expect((await client.query(
        `SELECT count(*)::int AS n FROM public.quotes_identity_protected WHERE rfq_id = $1`,
        [rfqId],
      )).rows[0].n).toBe(0);

      await asOwner(client);
      const columns = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'quotes_identity_protected'`,
      );
      const names = columns.rows.map((row) => row.column_name);
      expect(names).not.toContain('supplier_id');
      expect(names).not.toContain('business_name');
      expect(names).not.toContain('gstin');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});

describe('00289 pilot simulated purchases', () => {
  it('fails closed, grants exactly once, expires credits, and never transfers them to renewal', async () => {
    const client = await connect();
    if (!client) return;
    const installed = await client.query(`SELECT to_regprocedure('public.process_pilot_simulated_purchase(uuid,text,text)') AS fn`);
    if (!installed.rows[0].fn) {
      await client.end();
      return;
    }
    try {
      await client.query('BEGIN');
      const buyer = await signup(client, 'BUYER', 'INDIVIDUAL');
      const supplier = await signup(client, 'SUPPLIER');

      await actAs(client, buyer);
      await expectError(
        client,
        `SELECT public.process_pilot_simulated_purchase(NULL, 'MONTHLY_SUBSCRIPTION', 'mode-off')`,
        [],
        'PILOT-SIMULATION-DISABLED',
      );
      await asOwner(client);
      await client.query(
        `UPDATE public.platform_environment_settings
         SET environment = 'STAGING', is_production = false,
             pilot_payment_simulation_enabled = true, pilot_simulated_outcome = 'SUCCESS'
         WHERE id = 'current'`,
      );
      await actAs(client, buyer);
      await expectError(
        client,
        `SELECT public.process_pilot_simulated_purchase(NULL, 'MONTHLY_SUBSCRIPTION', 'missing-plan')`,
        [],
        'PRICE-PLAN-NOT-CONFIGURED',
      );

      await asOwner(client);
      await client.query(
        `UPDATE public.subscription_plans
         SET tier_code = 'INDIVIDUAL', price_monthly = 199, price_yearly = 1999,
             price_extra_rfq = 149, currency = 'INR', gst_rate = 18,
             supplier_state_code = '29', is_active = true
         WHERE code = 'COMMUNITY_FREE'`,
      );
      await actAs(client, buyer);
      const address = await client.query(
        `SELECT public.upsert_buyer_address_atomic(
           'Home', '1 Test Road', 'Bengaluru', 'Karnataka', '560048',
           NULL, NULL, 'India', true, 'DELIVERY', NULL, NULL, NULL, NULL, '29'
         ) AS r`,
      );
      expect(address.rows[0].r.ok).toBe(true);

      const monthly = await client.query(
        `SELECT public.process_pilot_simulated_purchase(NULL, 'MONTHLY_SUBSCRIPTION', 'monthly-1') AS r`,
      );
      expect(monthly.rows[0].r).toMatchObject({
        ok: true,
        status: 'SUCCEEDED',
        simulated: true,
        moneyCollected: false,
        entitlementGranted: true,
        taxableAmount: 199,
        taxAmount: 35.82,
        grossAmount: 234.82,
      });
      expect(monthly.rows[0].r.taxBreakdown.taxStructure).toBe('CGST_SGST');
      const duplicate = await client.query(
        `SELECT public.process_pilot_simulated_purchase(NULL, 'MONTHLY_SUBSCRIPTION', 'monthly-1') AS r`,
      );
      expect(duplicate.rows[0].r).toMatchObject({ ok: true, duplicate: true, status: 'SUCCEEDED' });

      const extra = await client.query(
        `SELECT public.process_pilot_simulated_purchase(NULL, 'EXTRA_RFQ', 'extra-1') AS r`,
      );
      expect(extra.rows[0].r).toMatchObject({
        ok: true,
        productType: 'EXTRA_RFQ',
        taxableAmount: 149,
        taxAmount: 26.82,
        grossAmount: 175.82,
      });
      await asOwner(client);
      const granted = await client.query(
        `SELECT purchased_rfq_credits, purchased_rfq_credits_expires_at, subscription_expires_at
         FROM public.personal_subscriptions WHERE profile_id = $1`,
        [buyer.profileId],
      );
      expect(granted.rows[0].purchased_rfq_credits).toBe(1);
      expect(granted.rows[0].purchased_rfq_credits_expires_at.toISOString())
        .toBe(granted.rows[0].subscription_expires_at.toISOString());

      for (const outcome of ['FAILED', 'PENDING', 'CANCELLED']) {
        await client.query(
          `UPDATE public.platform_environment_settings SET pilot_simulated_outcome = $1 WHERE id = 'current'`,
          [outcome],
        );
        await actAs(client, buyer);
        const result = await client.query(
          `SELECT public.process_pilot_simulated_purchase(NULL, 'EXTRA_RFQ', $1) AS r`,
          [`outcome-${outcome.toLowerCase()}`],
        );
        expect(result.rows[0].r).toMatchObject({
          ok: false,
          status: outcome,
          simulated: true,
          entitlementGranted: false,
        });
        await asOwner(client);
      }
      await client.query(
        `UPDATE public.platform_environment_settings SET pilot_simulated_outcome = 'SUCCESS' WHERE id = 'current'`,
      );

      for (let index = 0; index < 4; index += 1) {
        const rfqId = await publishPersonal(client, buyer);
        const invitationId = await invite(client, rfqId, supplier.supplierId!, `S-credit-${index}`);
        await quote(client, supplier, rfqId, invitationId, 'SUBMITTED', JSON.stringify({
          basePrice: 1000, gstAmount: 180, totalCost: 1180,
          deliveryDays: 5, warrantyMonths: 12, currency: 'INR',
        }));
      }
      await asOwner(client);
      const sources = await client.query(
        `SELECT entitlement_source, count(*)::int AS n
         FROM public.rfq_allowance_consumptions
         WHERE owner_profile_id = $1
         GROUP BY entitlement_source ORDER BY entitlement_source`,
        [buyer.profileId],
      );
      expect(sources.rows).toEqual([
        { entitlement_source: 'INCLUDED_ALLOWANCE', n: 3 },
        { entitlement_source: 'PURCHASED_EXTRA_RFQ', n: 1 },
      ]);
      expect((await client.query(
        `SELECT purchased_rfq_credits FROM public.personal_subscriptions WHERE profile_id = $1`,
        [buyer.profileId],
      )).rows[0].purchased_rfq_credits).toBe(0);

      await actAs(client, buyer);
      await client.query(`SELECT public.process_pilot_simulated_purchase(NULL, 'EXTRA_RFQ', 'extra-renewal')`);
      await client.query(`SELECT public.process_pilot_simulated_purchase(NULL, 'MONTHLY_SUBSCRIPTION', 'monthly-renewal')`);
      await asOwner(client);
      const renewal = await client.query(
        `SELECT purchased_rfq_credits FROM public.personal_subscriptions WHERE profile_id = $1`,
        [buyer.profileId],
      );
      expect(renewal.rows[0].purchased_rfq_credits).toBe(0);
      expect((await client.query(
        `SELECT remaining_credit, credit_invalidated_at IS NOT NULL AS invalidated
         FROM public.pilot_purchase_attempts
         WHERE owner_key = $1 AND idempotency_key = 'extra-renewal'`,
        [`PROFILE:${buyer.profileId}`],
      )).rows[0]).toEqual({ remaining_credit: 0, invalidated: true });

      await actAs(client, buyer);
      await client.query(`SELECT public.process_pilot_simulated_purchase(NULL, 'EXTRA_RFQ', 'extra-expiry')`);
      await asOwner(client);
      await client.query(
        `UPDATE public.personal_subscriptions
         SET subscription_expires_at = now(),
             purchased_rfq_credits_expires_at = now()
         WHERE profile_id = $1`,
        [buyer.profileId],
      );
      const expiredRfq = await publishPersonal(client, buyer);
      const expiredInvite = await invite(client, expiredRfq, supplier.supplierId!, 'S-expired');
      await actAs(client, supplier);
      await expectError(
        client,
        `SELECT public.submit_supplier_quote_atomic($1, $2, $3, $4::jsonb, NULL)`,
        [expiredRfq, expiredInvite, supplier.supplierId, JSON.stringify({
          basePrice: 1000, gstAmount: 180, totalCost: 1180,
          deliveryDays: 5, warrantyMonths: 12, currency: 'INR',
        })],
        'PILOT_ALLOWANCE_EXHAUSTED',
      );

      await asOwner(client);
      const tax = await client.query(
        `SELECT
           private.pilot_gst_breakdown(100, 18, '29', '27') AS igst,
           private.pilot_gst_breakdown(100, 18, '38', '38') AS utgst`,
      );
      expect(tax.rows[0].igst.taxStructure).toBe('IGST');
      expect(tax.rows[0].utgst.taxStructure).toBe('CGST_UTGST');

      await client.query(
        `UPDATE public.platform_environment_settings
         SET pilot_payment_simulation_enabled = false,
             is_production = true, environment = 'PRODUCTION'
         WHERE id = 'current'`,
      );
      await actAs(client, buyer);
      await expectError(
        client,
        `SELECT public.process_pilot_simulated_purchase(NULL, 'MONTHLY_SUBSCRIPTION', 'production-denied')`,
        [],
        'PILOT-SIMULATION-DISABLED',
      );
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
