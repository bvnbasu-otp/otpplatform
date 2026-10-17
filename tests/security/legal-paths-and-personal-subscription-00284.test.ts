/**
 * 00284: remaining EULA-protected mutation paths, no fabricated provisioning payment, and
 * personal subscription settlement against the canonical price.
 *
 * Rolled-back transactions against the local PostgreSQL used for SQL parity
 * (127.0.0.1:54322); skipped with a logged reason when unavailable or lacking 00284.
 * Synthetic users and plan rows only; no real payment or provider is involved.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { activateAsReviewer, asLegalReviewer, approveCurrentSnapshots, currentLegal, ensureDistinctFrozenAgreements } from '../helpers/legal-evidence-fixture';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

describe('00284 static contract', () => {
  const sql = readFileSync(resolve('supabase/migrations/00284_legal_gate_paths_and_personal_subscription_settlement.sql'), 'utf8')
    .replace(/--.*$/gm, '');

  it('gates supplier fulfilment tables with the Supplier EULA and buyer payments with the Customer EULA', () => {
    for (const table of ['work_orders', 'invoices', 'payments']) {
      expect(sql).toMatch(new RegExp(`CREATE TRIGGER legal_acceptance_gate BEFORE INSERT[^;]*ON public\\.${table}`));
    }
    expect(sql).toMatch(/WHEN 'work_orders' THEN\s+v_type := 'SUPPLIER_EULA'/);
    expect(sql).toMatch(/WHEN 'payments' THEN\s+v_type := 'CUSTOMER_EULA'/);
  });

  it('keeps personal settlement service_role only and compares to the canonical price', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_verified_personal_subscription_payment\([^)]*\)\s+FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_verified_personal_subscription_payment\([^)]*\)\s+TO service_role/);
    expect(sql).toContain('private.canonical_subscription_price(p_tier, v_cycle, p_currency)');
  });

  it('webhook has no default tier, cycle or amount', () => {
    const verify = readFileSync(resolve('supabase/functions/payment-webhook/verify-webhook.ts'), 'utf8');
    const index = readFileSync(resolve('supabase/functions/payment-webhook/index.ts'), 'utf8');
    expect(verify).not.toMatch(/\?\?\s*'TIER_/);
    expect(verify).not.toMatch(/\?\?\s*'MONTHLY'/);
    expect(index).not.toMatch(/\?\?\s*'TIER_/);
    expect(index).toContain("'record_verified_personal_subscription_payment'");
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
  const installed = await client.query(`SELECT to_regprocedure('public.record_verified_personal_subscription_payment(uuid,numeric,text,text,text,text,text,text,jsonb)') AS f`);
  if (!installed.rows[0].f) {
    console.warn('[SKIP REASON] local PostgreSQL does not have migration 00284 applied');
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

async function errorOf(client: Client, text: string, params: unknown[]): Promise<string> {
  await client.query('SAVEPOINT probe');
  let message = '';
  try {
    await client.query(text, params);
  } catch (error) {
    message = (error as Error).message;
  }
  await client.query('ROLLBACK TO SAVEPOINT probe');
  return message;
}

type Account = { profileId: string; authUserId: string; email: string };

async function signup(client: Client, payload: Record<string, unknown>): Promise<Account> {
  const email = `p84-${randomUUID()}@example.test`;
  await ensureDistinctFrozenAgreements(client);
  const agreement = await currentLegal(client, payload.side === 'SUPPLIER' ? 'SUPPLIER_EULA' : 'CUSTOMER_EULA');
  await client.query('SET LOCAL ROLE anon');
  const res = await client.query('SELECT public.submit_signup_request($1::jsonb) AS r', [
    JSON.stringify({
      contact_first_name: 'Pay', contact_last_name: 'Path', phone: '9876543210', verification_channel: 'EMAIL',
      coverage_city: 'Bengaluru', coverage_pincode: '560001', email, ...payload,
      eula_accepted: true, eula_version: agreement.version, document_hash: agreement.document_hash,
    }),
  ]);
  await client.query('RESET ROLE');
  expect(res.rows[0].r.status).toBe('ONBOARDED');
  const p = await client.query(`SELECT id, auth_user_id FROM public.profiles WHERE lower(email) = lower($1)`, [email]);
  return { profileId: p.rows[0].id, authUserId: p.rows[0].auth_user_id, email };
}

const individual = (client: Client) => signup(client, { side: 'BUYER', buyer_type: 'INDIVIDUAL', business_name: 'Self' });
const msme = (client: Client) => signup(client, { side: 'BUYER', buyer_type: 'MSME', business_name: `Pay Org ${randomUUID().slice(0, 6)}` });
async function supplier(client: Client) {
  const c = await client.query('SELECT code FROM public.requirement_categories WHERE is_active LIMIT 1');
  return signup(client, { side: 'SUPPLIER', business_name: `Pay Supplier ${randomUUID().slice(0, 6)}`, category_codes: [c.rows[0].code] });
}

async function bareAccount(client: Client): Promise<Account> {
  const id = randomUUID();
  const email = `bare-${id}@example.test`;
  await client.query('RESET ROLE');
  await client.query(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       email_change_token_current, phone_change, phone_change_token, reauthentication_token,
       is_super_admin, is_sso_user, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) VALUES (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       extensions.crypt('not-a-login', extensions.gen_salt('bf')), now(),
       '', '', '', '', '', '', '', '', false, false, false,
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
     )`,
    [id, email],
  );
  await client.query(
    `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin, is_demo)
     VALUES ($1, $1, $2, 'Bare User', false, false)`,
    [id, email],
  );
  return { profileId: id, authUserId: id, email };
}

async function actAs(client: Client, account: Account) {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: account.authUserId, role: 'authenticated' }),
  ]);
  await client.query('SET LOCAL ROLE authenticated');
}

const SETTLE = `SELECT public.record_verified_personal_subscription_payment($1::uuid, $2::numeric, 'INR', 'RAZORPAY', $3, $4, $5, $6, '{}'::jsonb) AS r`;

describe('00284 database outcomes (rolled back)', () => {
  it('writes no payment log for organization onboarding and no hard-coded amount', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const before = (await client.query(`SELECT count(*)::int AS n FROM public.subscription_payment_logs`)).rows[0].n;
      const account = await msme(client);
      const org = await client.query(`SELECT active_organization_id AS id FROM public.profiles WHERE id = $1`, [account.profileId]);
      expect((await client.query(`SELECT count(*)::int AS n FROM public.subscription_payment_logs`)).rows[0].n).toBe(before);
      const logs = await client.query(`SELECT count(*)::int AS n FROM public.subscription_payment_logs WHERE organization_id = $1`, [org.rows[0].id]);
      expect(logs.rows[0].n).toBe(0);
      // The complimentary onboarding period is still present, but no payment was recorded.
      const sub = await client.query(`SELECT subscription_status FROM public.organizations WHERE id = $1`, [org.rows[0].id]);
      expect(sub.rows[0].subscription_status).toBe('ACTIVE');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('settles personal subscriptions only at the canonical price, idempotently, and entitles the yearly bonus', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const alice = await individual(client);
      const org = await msme(client);
      const event = () => `evt_${randomUUID()}`;

      // Unmapped plan: fail closed, nothing provisioned.
      await expectError(client, SETTLE, [alice.profileId, 100, event(), 'ref', 'INDIVIDUAL', 'YEARLY'], 'PRICE-PLAN-NOT-CONFIGURED');

      await client.query(
        `INSERT INTO public.subscription_plans (code, name, price_monthly, price_yearly, currency, tier_code)
         VALUES ('SYN_IND', 'Synthetic individual', 40, 400, 'INR', 'INDIVIDUAL')`,
      );
      await expectError(client, SETTLE, [alice.profileId, 399, event(), 'ref', 'INDIVIDUAL', 'YEARLY'], 'PAY-V-PRICE-MISMATCH');
      await expectError(client, SETTLE, [alice.profileId, 40, event(), 'ref', 'INDIVIDUAL', 'YEARLY'], 'PAY-V-PRICE-MISMATCH');
      await expectError(client, SETTLE, [alice.profileId, 400, null, 'ref', 'INDIVIDUAL', 'YEARLY'], 'PAY-V-EVENT-ID-REQUIRED');
      await expectError(client, SETTLE, [org.profileId, 400, event(), 'ref', 'INDIVIDUAL', 'YEARLY'], 'PAY-V-NOT-PERSONAL');
      expect((await client.query(`SELECT subscription_plan FROM public.personal_subscriptions WHERE profile_id = $1`, [alice.profileId])).rows[0].subscription_plan)
        .toBe('MONTHLY');

      const eventId = event();
      const ok = await client.query(SETTLE, [alice.profileId, 400, eventId, 'ref', 'INDIVIDUAL', 'YEARLY']);
      expect(ok.rows[0].r.ok).toBe(true);
      const sub = await client.query(
        `SELECT subscription_plan, subscription_status, subscription_expires_at > now() + interval '300 days' AS long FROM public.personal_subscriptions WHERE profile_id = $1`,
        [alice.profileId],
      );
      expect(sub.rows[0]).toEqual({ subscription_plan: 'YEARLY', subscription_status: 'ACTIVE', long: true });

      // Replay (even after the price changes) is a duplicate: one log, no second extension.
      await client.query(`UPDATE public.subscription_plans SET price_yearly = 500 WHERE tier_code = 'INDIVIDUAL'`);
      const replay = await client.query(SETTLE, [alice.profileId, 400, eventId, 'ref', 'INDIVIDUAL', 'YEARLY']);
      expect(replay.rows[0].r.duplicate).toBe(true);
      expect((await client.query(`SELECT count(*)::int AS n FROM public.personal_subscription_payment_logs WHERE gateway_event_id = $1`, [eventId])).rows[0].n).toBe(1);

      // Renewal at the new canonical price extends from the current expiry.
      const before = (await client.query(`SELECT subscription_expires_at FROM public.personal_subscriptions WHERE profile_id = $1`, [alice.profileId])).rows[0].subscription_expires_at as Date;
      await client.query(SETTLE, [alice.profileId, 500, event(), 'ref', 'INDIVIDUAL', 'YEARLY']);
      const after = (await client.query(`SELECT subscription_expires_at FROM public.personal_subscriptions WHERE profile_id = $1`, [alice.profileId])).rows[0].subscription_expires_at as Date;
      expect(after.getTime() - before.getTime()).toBeGreaterThanOrEqual(364 * 86400 * 1000);

      // Clients cannot call settlement.
      await actAs(client, alice);
      await expectError(client, SETTLE, [alice.profileId, 500, event(), 'ref', 'INDIVIDUAL', 'YEARLY'], 'permission denied');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('requires the applicable EULA for supplier fulfilment writes and buyer payments after grace', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const buyer = await msme(client);
      const sup = await supplier(client);
      await approveCurrentSnapshots(client);
      await activateAsReviewer(client, `now() - interval '45 days'`);
      const bareBuyer = await bareAccount(client);
      const bareSupplier = await bareAccount(client);
      await client.query(
        `INSERT INTO public.organization_members (organization_id, profile_id, role) VALUES ($1, $2, 'BUYER')`,
        [(await client.query(`SELECT active_organization_id AS id FROM public.profiles WHERE id = $1`, [buyer.profileId])).rows[0].id, bareBuyer.profileId],
      );
      const supplierId = (await client.query(`SELECT supplier_id FROM public.supplier_users WHERE profile_id = $1`, [sup.profileId])).rows[0].supplier_id as string;
      await client.query(
        `INSERT INTO public.supplier_users (supplier_id, profile_id, role) VALUES ($1, $2, 'OPERATOR')`,
        [supplierId, bareSupplier.profileId],
      );
      const buyerActor = bareBuyer;
      const supplierActor = bareSupplier;

      const PO = `INSERT INTO public.purchase_orders (award_id, rfq_id, organization_id, supplier_id, po_number, total_amount) VALUES ($1, $2, $3, $4, 'PO-X', 1)`;
      const INV = `INSERT INTO public.invoices (work_order_id, supplier_id, invoice_number, amount) VALUES ($1, $2, 'INV-X', 1)`;
      const WO = `INSERT INTO public.work_orders (purchase_order_id, supplier_id, title) VALUES ($1, $2, 'x')`;
      const PAY = `INSERT INTO public.payments (amount, method, recorded_by) VALUES (1, 'UPI', $1)`;

      // The legal gate is a trigger, so it is exercised with the caller's identity claims; table
      // privileges for these tables are a separate layer and are not what is under test here.
      const claimsOnly = async (account: Account) => {
        await actAs(client, account);
      };

      await claimsOnly(supplierActor);
      expect(await errorOf(client, PO, [randomUUID(), randomUUID(), randomUUID(), supplierId])).toContain('permission denied');
      expect(await errorOf(client, INV, [randomUUID(), supplierId])).toContain('LEGAL_ACCEPTANCE_REQUIRED');
      expect(await errorOf(client, WO, [randomUUID(), supplierId])).toContain('LEGAL_ACCEPTANCE_REQUIRED');
      // A supplier user is not acting as the buyer when someone else is recorded as payer.
      expect(await errorOf(client, PAY, [buyerActor.profileId])).not.toContain('LEGAL_ACCEPTANCE_REQUIRED');

      await claimsOnly(buyerActor);
      expect(await errorOf(client, PAY, [buyerActor.profileId])).toContain('LEGAL_ACCEPTANCE_REQUIRED');

      await actAs(client, buyerActor);
      const version = await client.query(
        `SELECT version, document_hash FROM public.legal_document_versions WHERE agreement_type = 'CUSTOMER_EULA' AND retired_at IS NULL`,
      );
      await client.query(
        `SELECT public.accept_legal_agreement('CUSTOMER_EULA', $1, $2)`,
        [version.rows[0].version, version.rows[0].document_hash],
      );
      expect(await errorOf(client, PAY, [buyerActor.profileId])).not.toContain('LEGAL_ACCEPTANCE_REQUIRED');
      await claimsOnly(supplierActor);
      expect(await errorOf(client, INV, [randomUUID(), supplierId])).toContain('LEGAL_ACCEPTANCE_REQUIRED');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('enforces grace boundaries, new roles, stale versions and dual-role separation', async () => {
    const client = await connect();
    if (!client) return;
    const pay = `INSERT INTO public.payments (amount, method, recorded_by) VALUES (1, 'UPI', $1)`;

    async function existingBuyer(rolloutSql: string): Promise<Account> {
      const orgOwner = await msme(client);
      const orgId = (await client.query(`SELECT active_organization_id AS id FROM public.profiles WHERE id = $1`, [orgOwner.profileId])).rows[0].id as string;
      const existing = await bareAccount(client);
      await client.query('RESET ROLE');
      await client.query(
        `INSERT INTO public.organization_members (organization_id, profile_id, role, joined_at)
         VALUES ($1, $2, 'BUYER', now() - interval '40 days')`,
        [orgId, existing.profileId],
      );
      await approveCurrentSnapshots(client);
      await activateAsReviewer(client, rolloutSql);
      return existing;
    }

    try {
      await client.query('BEGIN');
      const before = await existingBuyer(`now() - make_interval(days => (SELECT grace_days FROM public.legal_enforcement_config)) + interval '1 minute'`);
      await actAs(client, before);
      expect(await errorOf(client, pay, [before.profileId]), 'inside grace').not.toContain('LEGAL_ACCEPTANCE_REQUIRED');
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      const atDeadline = await existingBuyer(`now() - make_interval(days => (SELECT grace_days FROM public.legal_enforcement_config))`);
      await actAs(client, atDeadline);
      expect(await errorOf(client, pay, [atDeadline.profileId]), 'at the grace deadline').toContain('LEGAL_ACCEPTANCE_REQUIRED');
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      const after = await existingBuyer(`now() - make_interval(days => (SELECT grace_days FROM public.legal_enforcement_config)) - interval '1 second'`);
      await actAs(client, after);
      expect(await errorOf(client, pay, [after.profileId]), 'after grace').toContain('LEGAL_ACCEPTANCE_REQUIRED');
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      const orgOwner = await msme(client);
      const orgId = (await client.query(`SELECT active_organization_id AS id FROM public.profiles WHERE id = $1`, [orgOwner.profileId])).rows[0].id as string;
      const held = await bareAccount(client);
      const added = await bareAccount(client);
      await client.query('RESET ROLE');
      await client.query(
        `INSERT INTO public.organization_members (organization_id, profile_id, role, joined_at)
         VALUES ($1, $2, 'BUYER', now() - interval '40 days')`,
        [orgId, held.profileId],
      );
      await client.query(
        `INSERT INTO public.organization_members (organization_id, profile_id, role, joined_at) VALUES ($1, $2, 'BUYER', now())`,
        [orgId, added.profileId],
      );
      await approveCurrentSnapshots(client);
      await activateAsReviewer(client, `now() - interval '10 days'`);
      await actAs(client, held);
      expect(await errorOf(client, pay, [held.profileId]), 'role held before rollout').not.toContain('LEGAL_ACCEPTANCE_REQUIRED');
      await actAs(client, added);
      expect(await errorOf(client, pay, [added.profileId]), 'role added during grace').toContain('LEGAL_ACCEPTANCE_REQUIRED');
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      await expectError(
        client,
        `UPDATE public.legal_enforcement_config SET enforcement_enabled = true, rollout_at = NULL`,
        [],
        'LEGAL_ENFORCEMENT_MISCONFIGURED',
      );
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      const accepting = await existingBuyer(`now() - interval '45 days'`);
      const dual = await bareAccount(client);
      const sup = await supplier(client);
      const dualOrgOwner = await msme(client);
      const supplierId = (await client.query(`SELECT supplier_id FROM public.supplier_users WHERE profile_id = $1`, [sup.profileId])).rows[0].supplier_id as string;
      const dualOrg = (await client.query(`SELECT active_organization_id AS id FROM public.profiles WHERE id = $1`, [dualOrgOwner.profileId])).rows[0].id as string;
      await client.query('RESET ROLE');
      await client.query(
        `INSERT INTO public.organization_members (organization_id, profile_id, role) VALUES ($1, $2, 'BUYER')`,
        [dualOrg, dual.profileId],
      );
      await client.query(
        `INSERT INTO public.supplier_users (supplier_id, profile_id, role) VALUES ($1, $2, 'OPERATOR')`,
        [supplierId, dual.profileId],
      );
      const version = (await client.query(
        `SELECT version, document_hash FROM public.legal_document_versions WHERE agreement_type = 'CUSTOMER_EULA' AND retired_at IS NULL`,
      )).rows[0] as { version: string; document_hash: string };
      await actAs(client, accepting);
      await expectError(client, `SELECT public.accept_legal_agreement('CUSTOMER_EULA', $1, 'sha256:stale')`, [version.version], 'EULA_VERSION_STALE');
      await client.query(`SELECT public.accept_legal_agreement('CUSTOMER_EULA', $1, $2)`, [version.version, version.document_hash]);
      expect(await errorOf(client, pay, [accepting.profileId]), 'current acceptance').not.toContain('LEGAL_ACCEPTANCE_REQUIRED');
      await client.query('RESET ROLE');
      const reviewer = (await client.query<{ profile_id: string }>(
        `SELECT profile_id FROM public.legal_review_grants WHERE can_register AND revoked_at IS NULL LIMIT 1`,
      )).rows[0].profile_id;
      await asLegalReviewer(client, reviewer, () => client.query(
        `SELECT public.register_legal_snapshot(NULL, 'CUSTOMER_EULA', 'v-test-next', convert_to('buyer-frozen-text-revision', 'UTF8'))`,
      ));
      const next = await currentLegal(client, 'CUSTOMER_EULA');
      await actAs(client, accepting);
      expect(await errorOf(client, pay, [accepting.profileId]), 'stale version').toContain('LEGAL_ACCEPTANCE_REQUIRED');
      await client.query(`SELECT public.accept_legal_agreement('CUSTOMER_EULA', $1, $2)`, [next.version, next.document_hash]);
      expect(await errorOf(client, pay, [accepting.profileId]), 're-accepted').not.toContain('LEGAL_ACCEPTANCE_REQUIRED');

      const supplierVersion = await currentLegal(client, 'SUPPLIER_EULA');
      await actAs(client, dual);
      await client.query(`SELECT public.accept_legal_agreement('CUSTOMER_EULA', $1, $2)`, [next.version, next.document_hash]);
      expect(await errorOf(client, pay, [dual.profileId]), 'buyer acceptance only').not.toContain('LEGAL_ACCEPTANCE_REQUIRED');
      const invoice = `INSERT INTO public.invoices (work_order_id, supplier_id, invoice_number, amount) VALUES ($1, $2, 'INV-DUAL', 1)`;
      expect(await errorOf(client, invoice, [randomUUID(), supplierId]), 'supplier write still gated').toContain('LEGAL_ACCEPTANCE_REQUIRED');
      await client.query(`SELECT public.accept_legal_agreement('SUPPLIER_EULA', $1, $2)`, [supplierVersion.version, supplierVersion.document_hash]);
      expect(await errorOf(client, invoice, [randomUUID(), supplierId]), 'both acceptances').not.toContain('LEGAL_ACCEPTANCE_REQUIRED');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
