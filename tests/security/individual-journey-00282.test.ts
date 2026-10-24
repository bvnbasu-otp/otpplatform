/**
 * 00282: complete Individual (personal ownership, organization_id = NULL) procurement journey
 * at the database boundary, plus isolation and RWA/MSME regression checks.
 *
 * Runs in rolled-back transactions against the local PostgreSQL used for SQL parity
 * (127.0.0.1:54322); skipped with a logged reason when unavailable or lacking 00282.
 * All users, suppliers, quotes and payments are synthetic. Browser-level journeys are
 * NOT covered here.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { catalogAcceptance } from '../helpers/legal-evidence-fixture';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: Number(process.env.LOCAL_PG_PORT ?? 54322),
  database: process.env.OTP_PG_DATABASE ?? 'postgres',
  user: 'postgres',
  password: 'postgres',
};

describe('00282 static contract', () => {
  const sql = readFileSync(resolve('supabase/migrations/00282_individual_personal_procurement_lifecycle.sql'), 'utf8')
    .replace(/--.*$/gm, '');

  it('keeps personal-buyer status server-owned and never creates an organization for it', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.personal_buyer_accounts, public\.personal_subscriptions FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)[^;]*personal_buyer_accounts[^;]*TO[^;]*authenticated/i);
    expect(sql).toContain('IF private.is_personal_buyer_profile(v_profile) THEN');
  });

  it('asserts every patched fragment matches exactly once', () => {
    expect(sql).toContain('matched % times (expected exactly 1)');
  });

  it('does not make any table permissive for NULL organizations', () => {
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/organization_id IS NULL\s+OR/i);
  });

  it('exercises the journey without disabling triggers', () => {
    const testSource = readFileSync(resolve('tests/security/individual-journey-00282.test.ts'), 'utf8');
    expect(testSource.includes(['session', 'replication_role'].join('_'))).toBe(false);
  });
});

async function connect(): Promise<Client | null> {
  const client = new Client(LOCAL_POSTGRES);
  try {
    await client.connect();
  } catch {
    console.warn('[SKIP REASON] local PostgreSQL is unavailable at 127.0.0.1:54322');
    return null;
  }
  const installed = await client.query(`SELECT to_regclass('public.personal_buyer_accounts') AS t`);
  if (!installed.rows[0].t) {
    console.warn('[SKIP REASON] local PostgreSQL does not have migration 00282 applied');
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
    message = (error as Error).message;
  }
  await client.query('ROLLBACK TO SAVEPOINT expect_error');
  expect(message).toContain(code);
}

type Account = { profileId: string; authUserId: string; email: string };

async function signup(client: Client, buyerType: 'INDIVIDUAL' | 'MSME' | 'COMMUNITY'): Promise<Account> {
  const email = `j82-${randomUUID()}@example.test`;
  await client.query('RESET ROLE');
  const legal = await catalogAcceptance(client, 'BUYER');
  await client.query('SET LOCAL ROLE anon');
  const res = await client.query('SELECT public.submit_signup_request($1::jsonb) AS r', [
    JSON.stringify({
      side: 'BUYER',
      buyer_type: buyerType,
      business_name: buyerType === 'INDIVIDUAL' ? 'Self' : `Journey Org ${randomUUID().slice(0, 6)}`,
      contact_first_name: 'Jo',
      contact_last_name: 'Journey',
      phone: '9876543210',
      verification_channel: 'EMAIL',
      coverage_city: 'Bengaluru',
      coverage_pincode: '560001',
      ...legal,
      email,
    }),
  ]);
  await client.query('RESET ROLE');
  expect(res.rows[0].r.status).toBe('ONBOARDED');
  const p = await client.query(`SELECT id, auth_user_id FROM public.profiles WHERE lower(email) = lower($1)`, [email]);
  return { profileId: p.rows[0].id, authUserId: p.rows[0].auth_user_id, email };
}

async function signupSupplier(
  client: Client,
  categoryCodes: string[],
  businessName: string,
): Promise<Account & { supplierId: string }> {
  const email = `j82s-${randomUUID()}@example.test`;
  const phone = `98${randomUUID().replace(/\D/g, '').padEnd(8, '0').slice(0, 8)}`;
  await client.query('RESET ROLE');
  const legal = await catalogAcceptance(client, 'SUPPLIER');
  await client.query('SET LOCAL ROLE anon');
  await client.query(`SELECT public.submit_signup_request($1::jsonb)`, [JSON.stringify({
    side: 'SUPPLIER',
    business_name: businessName,
    contact_first_name: 'Su',
    contact_last_name: 'Pplier',
    phone,
    verification_channel: 'EMAIL',
    coverage_city: 'Bengaluru',
    coverage_pincode: '560048',
    category_codes: categoryCodes,
    ...legal,
    email,
  })]);
  await client.query('RESET ROLE');
  const row = await client.query(
    `SELECT su.supplier_id, p.id AS profile_id, p.auth_user_id
     FROM public.supplier_users su JOIN public.profiles p ON p.id = su.profile_id
     WHERE lower(p.email) = lower($1)`,
    [email],
  );
  await client.query(
    `UPDATE public.suppliers
     SET address = jsonb_build_object(
       'kind', 'BUSINESS_OFFICE', 'line1', '82 Journey Road', 'city', 'Bengaluru',
       'state', 'Karnataka', 'pincode', '560048', 'postalCode', '560048', 'country', 'India'
     )
     WHERE id = $1`,
    [row.rows[0].supplier_id],
  );
  return {
    profileId: row.rows[0].profile_id,
    authUserId: row.rows[0].auth_user_id,
    supplierId: row.rows[0].supplier_id,
    email,
  };
}

async function actAs(client: Client, account: Account) {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: account.authUserId, role: 'authenticated' }),
  ]);
  await client.query('SET LOCAL ROLE authenticated');
}

async function asService(client: Client) {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', '', true)`);
}

async function taxonomy(client: Client) {
  const t = await client.query(`
    SELECT c.id AS category_id, s.id AS subcategory_id, c.name AS category_name, s.name AS subcategory_name,
           c.code AS category_code, s.code AS subcategory_code
    FROM public.requirement_categories c JOIN public.requirement_subcategories s ON s.category_id = c.id
    ORDER BY c.name, s.name LIMIT 1`);
  return t.rows[0] as {
    category_id: string; subcategory_id: string; category_name: string; subcategory_name: string;
    category_code: string; subcategory_code: string;
  };
}

async function newRequirement(client: Client, ownerOrg: string | null, tax: Awaited<ReturnType<typeof taxonomy>>, creator: string) {
  const r = await client.query(
    `INSERT INTO public.requirements (organization_id, created_by, requirement_type, title, category_id, subcategory_id,
                                      description, quantity, unit, delivery_line1, delivery_city, delivery_pincode,
                                      delivery_state, commercial)
     VALUES ($1, $2, 'SERVICE', 'Journey requirement', $3, $4, 'Motor rewinding service', 1, 'job',
             '12 Journey Lane', 'Bengaluru', '560048', 'Karnataka', '{"paymentTerms":"30-50-20"}'::jsonb)
     RETURNING id, status`,
    [ownerOrg, creator, tax.category_id, tax.subcategory_id],
  );
  expect(r.rows[0].status).toBe('DRAFT');
  return r.rows[0].id as string;
}

const PUBLISH = `SELECT public.publish_requirement($1::uuid, 'IDENTITY_PROTECTED'::sourcing_mode, 1, 7, '{}'::jsonb, 'SUGGESTED') AS r`;

describe('00282 Individual journey (database, rolled back)', () => {
  it('provisions an Individual with no organization, no Self org, no fabricated payment and a personal subscription', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const orgsBefore = (await client.query(`SELECT count(*)::int AS n FROM public.organizations`)).rows[0].n;
      const logsBefore = (await client.query(`SELECT count(*)::int AS n FROM public.subscription_payment_logs`)).rows[0].n;
      const alice = await signup(client, 'INDIVIDUAL');

      const profile = await client.query(`SELECT active_organization_id FROM public.profiles WHERE id = $1`, [alice.profileId]);
      expect(profile.rows[0].active_organization_id).toBeNull();
      expect((await client.query(`SELECT count(*)::int AS n FROM public.organization_members WHERE profile_id = $1`, [alice.profileId])).rows[0].n).toBe(0);
      expect((await client.query(`SELECT count(*)::int AS n FROM public.organizations`)).rows[0].n).toBe(orgsBefore);
      expect((await client.query(`SELECT count(*)::int AS n FROM public.subscription_payment_logs`)).rows[0].n).toBe(logsBefore);
      const sub = await client.query(`SELECT subscription_status, payment_reference FROM public.personal_subscriptions WHERE profile_id = $1`, [alice.profileId]);
      expect(sub.rows[0]).toEqual({ subscription_status: 'ACTIVE', payment_reference: 'REG-ONBOARD-COMPLIMENTARY' });
      const req = await client.query(`SELECT organization_id FROM public.signup_requests WHERE lower(email) = lower($1)`, [alice.email]);
      expect(req.rows[0].organization_id).toBeNull();

      // Reading the role context or ensuring an organization must not recreate a Self organization.
      await actAs(client, alice);
      const ctx = await client.query(`SELECT public.my_role_context() AS c`);
      expect(ctx.rows[0].c.organizationId).toBeNull();
      expect(ctx.rows[0].c.buyerType).toBe('INDIVIDUAL');
      const ensured = await client.query(`SELECT public.ensure_buyer_organization() AS e`);
      expect(ensured.rows[0].e).toMatchObject({ ok: true, personal: true, organizationId: null });
      await asService(client);
      expect((await client.query(`SELECT count(*)::int AS n FROM public.organizations`)).rows[0].n).toBe(orgsBefore);
      expect((await client.query(`SELECT count(*)::int AS n FROM public.organization_members WHERE profile_id = $1`, [alice.profileId])).rows[0].n).toBe(0);

      // A client cannot make itself a personal buyer or edit its subscription.
      const bob = await signup(client, 'MSME');
      await actAs(client, bob);
      await expectError(client, `INSERT INTO public.personal_buyer_accounts (profile_id) VALUES ($1)`, [bob.profileId], 'permission denied');
      await expectError(client, `UPDATE public.personal_subscriptions SET subscription_plan = 'YEARLY'`, [], 'permission denied');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('runs requirement -> RFQ -> discovery -> award -> PO -> invoice -> payment under personal ownership', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      // The local fixture enables the pilot fulfilment stub, which auto-completes
      // demo work and raises an invoice with no tax snapshot. This transaction
      // turns that stub off so the supplier submits the invoice.
      await client.query(`UPDATE public.demo_settings SET supplier_network_stub_enabled = false WHERE id`);
      const alice = await signup(client, 'INDIVIDUAL');
      const tax = await taxonomy(client);

      // Requirement and RFQ, entered as the Individual through RLS.
      await actAs(client, alice);
      const requirementId = await newRequirement(client, null, tax, alice.profileId);
      const published = await client.query(PUBLISH, [requirementId]);
      const rfqId = published.rows[0].r.rfqId as string;
      await asService(client);
      const rfq = await client.query(`SELECT organization_id, owner_profile_id FROM public.rfqs WHERE id = $1`, [rfqId]);
      expect(rfq.rows[0]).toEqual({ organization_id: null, owner_profile_id: alice.profileId });
      expect((await client.query(`SELECT organization_id, owner_profile_id FROM public.requirements WHERE id = $1`, [requirementId])).rows[0])
        .toEqual({ organization_id: null, owner_profile_id: alice.profileId });

      // Two suppliers match both the RFQ category and PIN. A third supplier in
      // the same PIN has another category and must not be invited.
      const supplier = await signupSupplier(
        client,
        [tax.category_code],
        'Journey Awarded Supplier',
      );
      const rival = await signupSupplier(
        client,
        [tax.category_code],
        'Journey Rival Supplier',
      );
      const otherTax = await client.query<{ code: string }>(
        `SELECT code FROM public.requirement_categories WHERE id <> $1 ORDER BY code LIMIT 1`,
        [tax.category_id],
      );
      const decoy = await signupSupplier(client, [otherTax.rows[0].code], 'Journey Wrong Category');

      for (const matching of [supplier, rival]) {
        await actAs(client, matching);
        await client.query(
          `UPDATE public.suppliers SET categories = $2::text[] WHERE id = $1`,
          [matching.supplierId, [tax.category_code, tax.subcategory_code, tax.subcategory_name]],
        );
        await client.query(
          `INSERT INTO public.supplier_service_areas (supplier_id, city, pincode, is_primary)
           VALUES ($1, 'Bengaluru', '560048', true)`,
          [matching.supplierId],
        );
      }
      await actAs(client, decoy);
      await client.query(
        `UPDATE public.suppliers SET categories = $2::text[] WHERE id = $1`,
        [decoy.supplierId, [otherTax.rows[0].code]],
      );
      await client.query(
        `INSERT INTO public.supplier_service_areas (supplier_id, city, pincode, is_primary) VALUES ($1, 'Bengaluru', '560048', true)`,
        [decoy.supplierId],
      );
      await actAs(client, alice);
      const masked = await client.query(`SELECT count(*)::int AS n FROM public.suppliers WHERE id = $1`, [supplier.supplierId]);
      expect(masked.rows[0].n, 'supplier identity stays hidden before award').toBe(0);
      const discovery = await client.query(`SELECT public.discover_and_invite_for_rfq($1::uuid, 5, '{}'::uuid[], 'OTP_REGISTERED') AS d`, [rfqId]);
      await actAs(client, supplier);
      const invitation = await client.query(`SELECT id FROM public.rfq_invitations WHERE rfq_id = $1 AND supplier_id = $2`, [rfqId, supplier.supplierId]);
      expect(invitation.rowCount, JSON.stringify(discovery.rows[0].d)).toBe(1);
      const quoteSubmitted = await client.query(
        `SELECT public.submit_supplier_quote_atomic(
           $1, $2, $3,
           '{"basePrice":1000,"gstAmount":180,"transportCost":0,"totalCost":1180,"deliveryDays":7,"warrantyMonths":0,"currency":"INR"}'::jsonb,
           NULL
         ) AS result`,
        [rfqId, invitation.rows[0].id, supplier.supplierId],
      );
      const quoteId = quoteSubmitted.rows[0].result.quoteId as string;

      await actAs(client, rival);
      const rivalInvitation = await client.query(
        `SELECT id FROM public.rfq_invitations WHERE rfq_id = $1 AND supplier_id = $2`,
        [rfqId, rival.supplierId],
      );
      expect(rivalInvitation.rowCount, JSON.stringify(discovery.rows[0].d)).toBe(1);
      const rivalQuote = await client.query(
        `SELECT public.submit_supplier_quote_atomic(
           $1, $2, $3,
           '{"basePrice":1500,"gstAmount":270,"transportCost":0,"totalCost":1770,"deliveryDays":9,"warrantyMonths":0,"currency":"INR"}'::jsonb,
           NULL
         ) AS result`,
        [rfqId, rivalInvitation.rows[0].id, rival.supplierId],
      );
      expect(rivalQuote.rows[0].result.quoteId).toBeTruthy();

      await actAs(client, alice);
      const decoyInvitation = await client.query(
        `SELECT id FROM public.rfq_invitations WHERE rfq_id = $1 AND supplier_id = $2`,
        [rfqId, decoy.supplierId],
      );
      expect(decoyInvitation.rowCount, 'same-PIN supplier in another category must not be invited').toBe(0);
      await client.query(`SELECT public.close_clarification_for_evaluation($1::uuid)`, [rfqId]);
      const buyerView = await client.query(`SELECT private.can_access_rfq_as_buyer($1) AS ok`, [rfqId]);
      expect(buyerView.rows[0].ok).toBe(true);
      const scored = await client.query<{ r: { scored: number } }>(
        `SELECT public.compute_quote_evaluations($1) AS r`,
        [rfqId],
      );
      expect(Number(scored.rows[0].r.scored)).toBe(2);
      const ranking = await client.query<{ quote_id: string; score: string }>(
        `SELECT quote_id, evaluation_score::text AS score
         FROM public.quote_evaluations
         WHERE rfq_id = $1 ORDER BY evaluation_score DESC, quote_id`,
        [rfqId],
      );
      expect(ranking.rows[0].quote_id).toBe(quoteId);
      expect(Number(ranking.rows[0].score)).toBeGreaterThan(Number(ranking.rows[1].score));
      await expectError(
        client,
        `SELECT public.cast_committee_vote($1::uuid, $2::uuid, 'RECOMMEND'::vote_choice, 'no')`,
        [rfqId, quoteId],
        'committee',
      );

      // The supplier cannot verify itself. A seeded platform admin, acting as
      // authenticated, records the same verification the admin console writes.
      await actAs(client, supplier);
      await expectError(
        client,
        `UPDATE public.suppliers SET verification_status = 'VERIFIED', lifecycle_state = 'VERIFIED' WHERE id = $1`,
        [supplier.supplierId],
        'SUPPLIER-TRUST',
      );
      await asService(client);
      const adminRow = await client.query(
        `SELECT id, auth_user_id, email FROM public.profiles WHERE lower(email) = 'admin@otp.test' AND is_platform_admin`,
      );
      const admin: Account = {
        profileId: adminRow.rows[0].id,
        authUserId: adminRow.rows[0].auth_user_id,
        email: adminRow.rows[0].email,
      };
      await actAs(client, admin);
      const verified = await client.query(
        `UPDATE public.suppliers SET verification_status = 'VERIFIED', lifecycle_state = 'VERIFIED' WHERE id = $1 RETURNING verification_status`,
        [supplier.supplierId],
      );
      expect(verified.rows[0].verification_status).toBe('VERIFIED');

      await actAs(client, alice);
      const locked = await client.query(
        `SELECT public.lock_and_reveal_award_atomic($1::uuid, $2::uuid, 'Best value', true) AS r`, [rfqId, quoteId],
      );
      expect(locked.rows[0].r.ok).toBe(true);
      expect(locked.rows[0].r.revealed).toBe(true);

      await asService(client);
      const po = await client.query(
        `SELECT id, organization_id, owner_profile_id, supplier_id, status, total_amount::float AS total
         FROM public.purchase_orders WHERE rfq_id = $1`,
        [rfqId],
      );
      expect(po.rowCount).toBe(1);
      expect(po.rows[0]).toMatchObject({
        organization_id: null,
        owner_profile_id: alice.profileId,
        supplier_id: supplier.supplierId,
        status: 'ISSUED',
        total: 1180,
      });
      const poId = po.rows[0].id as string;
      const award = await client.query(`SELECT awarded_by FROM public.awards WHERE rfq_id = $1`, [rfqId]);
      expect(award.rows[0].awarded_by).toBe(alice.profileId);

      await actAs(client, rival);
      await expectError(
        client,
        `SELECT public.transition_purchase_order($1, 'ACCEPTED'::purchase_order_status, 'ISSUED'::purchase_order_status)`,
        [poId],
        'PO-TRANSITION-UNAUTHORIZED',
      );
      await actAs(client, supplier);
      const accepted = await client.query<{ r: { status: string } }>(
        `SELECT public.transition_purchase_order(
           $1, 'ACCEPTED'::purchase_order_status, 'ISSUED'::purchase_order_status
         ) AS r`,
        [poId],
      );
      expect(accepted.rows[0].r.status).toBe('ACCEPTED');
      await actAs(client, alice);
      const started = await client.query<{ r: { status: string } }>(
        `SELECT public.transition_purchase_order(
           $1, 'IN_PROGRESS'::purchase_order_status, 'ACCEPTED'::purchase_order_status
         ) AS r`,
        [poId],
      );
      expect(started.rows[0].r.status).toBe('IN_PROGRESS');

      // Work order is created with the PO. The supplier submits the invoice,
      // carrying the purchase order's canonical tax snapshot.
      const wo = await client.query(`SELECT id FROM public.work_orders WHERE purchase_order_id = $1`, [poId]);
      expect(wo.rowCount).toBeGreaterThan(0);
      const poTax = await client.query(
        `SELECT total_amount::float AS amount, currency, tax_snapshot, taxable_total, cgst_total, sgst_total, utgst_total, igst_total
         FROM public.purchase_orders WHERE id = $1`,
        [poId],
      );
      expect(poTax.rows[0].tax_snapshot).toBeTruthy();
      await actAs(client, supplier);
      const progressed = await client.query(
        `UPDATE public.work_orders
         SET progress_percent = 100, status = 'IN_PROGRESS', updated_at = now()
         WHERE id = $1 AND progress_percent = 0
         RETURNING progress_percent`,
        [wo.rows[0].id],
      );
      expect(progressed.rows[0].progress_percent).toBe(100);
      const submitted = await client.query(
        `INSERT INTO public.invoices (
           work_order_id, purchase_order_id, supplier_id, invoice_number, amount, currency, status, submitted_at,
           tax_snapshot, taxable_total, cgst_total, sgst_total, utgst_total, igst_total
         ) VALUES (
           $1, $2, $3, $4, $5, $6, 'SUBMITTED', now(),
           $7, $8, $9, $10, $11, $12
         ) RETURNING id, amount::float AS amount`,
        [
          wo.rows[0].id, poId, supplier.supplierId, `INV-J-${randomUUID().slice(0, 8)}`,
          poTax.rows[0].amount, poTax.rows[0].currency,
          poTax.rows[0].tax_snapshot, poTax.rows[0].taxable_total, poTax.rows[0].cgst_total,
          poTax.rows[0].sgst_total, poTax.rows[0].utgst_total, poTax.rows[0].igst_total,
        ],
      );
      const invoiceId = submitted.rows[0].id as string;
      const invoiceAmount = submitted.rows[0].amount as number;

      await actAs(client, supplier);
      await expectError(
        client,
        `UPDATE public.invoices SET status = 'APPROVED', approved_at = now() WHERE id = $1`,
        [invoiceId],
        'INV-SUPPLIER-STATUS',
      );
      const intruder = await signup(client, 'INDIVIDUAL');
      await actAs(client, intruder);
      const deniedUpdate = await client.query(`UPDATE public.invoices SET status = 'APPROVED' WHERE id = $1`, [invoiceId]);
      expect(deniedUpdate.rowCount).toBe(0);

      await actAs(client, alice);
      const approved = await client.query(
        `UPDATE public.invoices SET status = 'APPROVED', approved_at = now() WHERE id = $1 RETURNING status`,
        [invoiceId],
      );
      expect(approved.rows[0].status).toBe('APPROVED');
      await client.query(
        `SELECT public.accept_delivery_inspection($1, 'Journey delivery accepted', 5)`,
        [wo.rows[0].id],
      );
      const inspected = await client.query<{ buyer_accepted_at: Date; status: string }>(
        `SELECT buyer_accepted_at, status FROM public.work_orders WHERE id = $1`,
        [wo.rows[0].id],
      );
      expect(inspected.rows[0].buyer_accepted_at).toBeTruthy();
      expect(inspected.rows[0].status).toBe('COMPLETED');
      const beforePaymentCompletion = await client.query<{ status: string }>(
        `SELECT status FROM public.purchase_orders WHERE id = $1`,
        [poId],
      );
      expect(beforePaymentCompletion.rows[0].status).toBe('IN_PROGRESS');

      await actAs(client, intruder);
      await expectError(
        client,
        `SELECT public.record_invoice_payment_atomic($1::uuid, 1, 'UPI'::payment_method, 'UTR-DENY', 'INR', $2::uuid, NULL, $3)`,
        [invoiceId, poId, `idem-${randomUUID()}`],
        'not authorized',
      );
      await actAs(client, alice);
      const firstPart = Math.round(invoiceAmount * 0.4 * 100) / 100;
      const part = await client.query(
        `SELECT public.record_invoice_payment_atomic($1::uuid, $4::numeric, 'UPI'::payment_method, 'UTR-J-1', 'INR', $2::uuid, NULL, $3) AS r`,
        [invoiceId, poId, `idem-${randomUUID()}`, firstPart],
      );
      expect(part.rows[0].r.ok).toBe(true);
      const rest = await client.query(
        `SELECT public.record_invoice_payment_atomic($1::uuid, $4::numeric, 'UPI'::payment_method, 'UTR-J-2', 'INR', $2::uuid, NULL, $3) AS r`,
        [invoiceId, poId, `idem-${randomUUID()}`, Math.round((invoiceAmount - firstPart) * 100) / 100],
      );
      expect(rest.rows[0].r.invoice).toMatchObject({ status: 'PAID' });
      expect(Number(rest.rows[0].r.invoice.balance_due)).toBe(0);
      await expectError(
        client,
        `SELECT public.record_invoice_payment_atomic($1::uuid, 1, 'UPI'::payment_method, 'UTR-J-3', 'INR', $2::uuid, NULL, $3)`,
        [invoiceId, poId, `idem-${randomUUID()}`],
        'not payable',
      );
      const completed = await client.query<{ r: { status: string } }>(
        `SELECT public.transition_purchase_order(
           $1, 'COMPLETED'::purchase_order_status, 'IN_PROGRESS'::purchase_order_status
         ) AS r`,
        [poId],
      );
      expect(completed.rows[0].r.status).toBe('COMPLETED');
      const final = await client.query<{ po_status: string; requirement_status: string; allocated: string }>(
        `SELECT po.status AS po_status,
                req.status AS requirement_status,
                COALESCE(sum(pa.allocated_amount), 0)::text AS allocated
         FROM public.purchase_orders po
         JOIN public.rfqs r ON r.id = po.rfq_id
         JOIN public.requirements req ON req.id = r.requirement_id
         LEFT JOIN public.payments p ON p.purchase_order_id = po.id
         LEFT JOIN public.payment_allocations pa ON pa.payment_id = p.id
         WHERE po.id = $1
         GROUP BY po.status, req.status`,
        [poId],
      );
      expect(final.rows[0]).toEqual({
        po_status: 'COMPLETED',
        requirement_status: 'COMPLETED',
        allocated: invoiceAmount.toFixed(2),
      });

      // History: audit events exist for the personal actor with no organization.
      await asService(client);
      const history = await client.query(
        `SELECT count(*)::int AS n FROM public.audit_events WHERE actor_id = $1 AND organization_id IS NULL`, [alice.profileId],
      );
      expect(history.rows[0].n).toBeGreaterThan(0);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('isolates personal procurement between users and from organization members', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const alice = await signup(client, 'INDIVIDUAL');
      const bob = await signup(client, 'INDIVIDUAL');
      const msme = await signup(client, 'MSME');
      const tax = await taxonomy(client);

      await actAs(client, alice);
      const requirementId = await newRequirement(client, null, tax, alice.profileId);
      const rfqId = (await client.query(PUBLISH, [requirementId])).rows[0].r.rfqId as string;

      for (const intruder of [bob, msme]) {
        await actAs(client, intruder);
        expect((await client.query(`SELECT count(*)::int AS n FROM public.requirements WHERE id = $1`, [requirementId])).rows[0].n).toBe(0);
        expect((await client.query(`SELECT count(*)::int AS n FROM public.rfqs WHERE id = $1`, [rfqId])).rows[0].n).toBe(0);
        expect((await client.query(`SELECT private.can_access_rfq_as_buyer($1) AS ok`, [rfqId])).rows[0].ok).toBe(false);
        await expectError(client, PUBLISH, [requirementId], 'Access denied');
      }

      // Personal records cannot be created for or by non-personal accounts.
      await actAs(client, msme);
      await expectError(
        client,
        `INSERT INTO public.requirements (organization_id, created_by, requirement_type, title) VALUES (NULL, $1, 'SERVICE', 'x')`,
        [msme.profileId],
        'PERSONAL_OWNER_REQUIRES_INDIVIDUAL',
      );
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('does not consume a personal allowance when an RFQ is published', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const alice = await signup(client, 'INDIVIDUAL');
      const bob = await signup(client, 'INDIVIDUAL');
      const tax = await taxonomy(client);

      await actAs(client, alice);
      for (let i = 0; i < 4; i += 1) {
        const requirementId = await newRequirement(client, null, tax, alice.profileId);
        expect((await client.query(PUBLISH, [requirementId])).rows[0].r.rfqId).toBeTruthy();
      }
      await asService(client);
      expect((await client.query(
        `SELECT count(*)::int AS n FROM public.rfq_allowance_consumptions WHERE owner_profile_id = $1`,
        [alice.profileId],
      )).rows[0].n).toBe(0);

      await actAs(client, bob);
      const bobReq = await newRequirement(client, null, tax, bob.profileId);
      expect((await client.query(PUBLISH, [bobReq])).rows[0].r.rfqId).toBeTruthy();
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('keeps organization-owned MSME procurement working and the legacy report read-only', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const msme = await signup(client, 'MSME');
      const tax = await taxonomy(client);
      const org = await client.query(`SELECT active_organization_id AS id FROM public.profiles WHERE id = $1`, [msme.profileId]);

      await actAs(client, msme);
      const requirementId = await newRequirement(client, org.rows[0].id, tax, msme.profileId);
      const rfqId = (await client.query(PUBLISH, [requirementId])).rows[0].r.rfqId as string;
      await asService(client);
      const rfq = await client.query(`SELECT organization_id, owner_profile_id FROM public.rfqs WHERE id = $1`, [rfqId]);
      expect(rfq.rows[0]).toEqual({ organization_id: org.rows[0].id, owner_profile_id: null });

      const before = (await client.query(`SELECT count(*)::int AS n FROM public.organizations WHERE org_type = 'INDIVIDUAL'`)).rows[0].n;
      const report = await client.query(`SELECT public.individual_ownership_migration_report() AS r`);
      expect(report.rows[0].r).toHaveProperty('unambiguous');
      expect(report.rows[0].r).toHaveProperty('ambiguous');
      const after = (await client.query(`SELECT count(*)::int AS n FROM public.organizations WHERE org_type = 'INDIVIDUAL'`)).rows[0].n;
      expect(after).toBe(before);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
