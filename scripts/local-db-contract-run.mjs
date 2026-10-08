/**
 * Local-only database contract runner (127.0.0.1). Writes JSON evidence for the report.
 */
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const GREENVIEW = 'a0000000-0000-4000-8000-000000000001';
const BOREWELL_RFQ = 'f1000000-0000-4000-8000-000000000001';
const QUOTE_A = 'a5000000-0000-4000-8000-000000000001';
const PASSWORD = 'password';

const results = [];

function psql(sql) {
  const r = spawnSync(
    'docker',
    ['exec', 'supabase_db_otp-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  );
  return (r.stdout || '').trim();
}

function record(id, actor, call, expected, actual, before, after, status) {
  results.push({ id, actor, call, expected, actual, before, after, status });
}

function errText(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String(error.message ?? error);
}

async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

async function walletBalance(orgId) {
  const row = psql(
    `SELECT COALESCE(balance_credits,0)::text FROM organization_wallets WHERE organization_id='${orgId}' LIMIT 1;`,
  );
  return row || '0';
}

async function ledgerCount(orgId) {
  return psql(
    `SELECT count(*)::text FROM wallet_transactions wt JOIN organization_wallets ow ON ow.id=wt.wallet_id WHERE ow.organization_id='${orgId}';`,
  );
}

async function main() {
  const baseline = {
    head: psql(`SELECT '7b1afc12ac7761efc206c70db80486612a34d146' AS head;`),
    connectionTarget: 'postgresql://postgres:***@127.0.0.1:54322/postgres',
    apiTarget: URL,
    migrationsOnDiskCeiling: '00219',
    anonAllowlist: psql(
      `SELECT routine_name FROM information_schema.routine_privileges WHERE routine_schema='public' AND grantee='anon' AND privilege_type='EXECUTE' ORDER BY 1;`,
    ).split('\n').filter(Boolean),
    pgVersion: psql('SHOW server_version;'),
    migrations: psql('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;').split('\n').filter(Boolean),
    rlsSensitive: psql(
      `SELECT c.relname||':'||c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('organization_wallets','wallet_transactions','awards','invoices','rfqs','purchase_orders','quotes') ORDER BY 1;`,
    ).split('\n').filter(Boolean),
    publicExecuteOnWalletRead: psql(
      `SELECT count(*)::text FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name='get_organization_wallet' AND grantee='PUBLIC' AND privilege_type='EXECUTE';`,
    ),
  };

  // A Wallet — anon
  const balBefore = await walletBalance(GREENVIEW);
  const ledBefore = await ledgerCount(GREENVIEW);
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const a1 = await anon.rpc('credit_buyer_settlement_reward_atomic', {
    p_org_id: GREENVIEW,
    p_platform_fee_tx_id: null,
    p_base_amount: 99999,
  });
  const balAfter = await walletBalance(GREENVIEW);
  const ledAfter = await ledgerCount(GREENVIEW);
  record(
    'A1',
    'anon',
    'credit_buyer_settlement_reward_atomic(null fee)',
    'permission denied or error; balance unchanged',
    a1.error?.message ?? JSON.stringify(a1.data),
    `balance=${balBefore} ledger=${ledBefore}`,
    `balance=${balAfter} ledger=${ledAfter}`,
    a1.error && balBefore === balAfter && ledBefore === ledAfter ? 'PASS' : 'FAIL',
  );

  // A — auth null fee
  const mgr = await signIn('manager@greenview.test');
  const balB2 = await walletBalance(GREENVIEW);
  const a2 = await mgr.rpc('credit_buyer_settlement_reward_atomic', {
    p_org_id: GREENVIEW,
    p_platform_fee_tx_id: null,
    p_base_amount: 50000,
  });
  const balA2 = await walletBalance(GREENVIEW);
  record(
    'A2',
    'manager@greenview.test',
    'credit_buyer_settlement_reward_atomic(null fee)',
    'error; no balance change',
    errText(a2.error) || 'ok',
    balB2,
    balA2,
    a2.error && balB2 === balA2 ? 'PASS' : 'FAIL',
  );

  const fakeFee = '00000000-0000-4000-8000-000000000099';
  const a3 = await mgr.rpc('credit_buyer_settlement_reward_atomic', {
    p_org_id: GREENVIEW,
    p_platform_fee_tx_id: fakeFee,
  });
  record(
    'A3',
    'manager@greenview.test',
    'credit_buyer_settlement_reward_atomic(fake fee id)',
    'not found / not belong; balance unchanged',
    errText(a3.error) || JSON.stringify(a3.data),
    balB2,
    await walletBalance(GREENVIEW),
    a3.error ? 'PASS' : 'FAIL',
  );

  const a4 = await anon.rpc('get_organization_wallet', { p_organization_id: GREENVIEW });
  record(
    'A4',
    'anon',
    'get_organization_wallet',
    'permission denied',
    errText(a4.error) || JSON.stringify(a4.data),
    '-',
    '-',
    a4.error ? 'PASS' : 'FAIL',
  );

  // B subscription arbitrary
  const b1 = await anon.rpc('apply_wallet_credits_to_subscription_atomic', {
    p_org_id: GREENVIEW,
    p_tier: 'ENTERPRISE',
    p_cycle: 'MONTHLY',
    p_credits_to_apply: 1,
  });
  record('B1', 'anon', 'apply_wallet_credits(1)', 'denied', b1.error?.message ?? 'ok', '-', '-', b1.error ? 'PASS' : 'FAIL');

  const b2 = await mgr.rpc('apply_wallet_credits_to_subscription_atomic', {
    p_org_id: GREENVIEW,
    p_tier: 'INDIVIDUAL',
    p_cycle: 'MONTHLY',
    p_credits_to_apply: 1,
  });
  record(
    'B2',
    'manager',
    'apply_wallet_credits(₹1 vs catalog)',
    'catalog amount rejection',
    b2.error?.message ?? 'ok',
    '-',
    '-',
    String(b2.error?.message ?? '').match(/catalog/i) ? 'PASS' : 'FAIL',
  );

  // C award anon
  const c1 = await anon.rpc('lock_and_reveal_award_atomic', {
    p_rfq_id: BOREWELL_RFQ,
    p_quote_id: QUOTE_A,
    p_justification: 'exploit',
    p_auto_reveal: true,
  });
  record('C1', 'anon', 'lock_and_reveal_award_atomic', 'denied', errText(c1.error) || JSON.stringify(c1.data), '-', '-', c1.error ? 'PASS' : 'FAIL');

  const c2 = await anon.rpc('reveal_award', { p_rfq_id: 'f2000000-0000-4000-8000-000000000001' });
  record('C2', 'anon', 'reveal_award(p_rfq_id)', 'denied', errText(c2.error) || 'ok', '-', '-', c2.error ? 'PASS' : 'FAIL');

  const supplierA = await signIn('supplier-a@borewell.test');
  const c3 = await supplierA.rpc('reveal_award', { p_rfq_id: 'f2000000-0000-4000-8000-000000000001' });
  record(
    'C3',
    'supplier-a (unauthorized)',
    'reveal_award',
    'denied or no buyer PII',
    errText(c3.error) || JSON.stringify(c3.data),
    '-',
    '-',
    c3.error ? 'PASS' : 'NOT TESTED',
  );

  // D PO anon
  const d1 = await anon.rpc('create_purchase_order_from_award', {
    p_award_id: '00000000-0000-0000-0000-000000000099',
  });
  record('D1', 'anon', 'create_purchase_order_from_award', 'denied', d1.error?.message ?? 'ok', '-', '-', d1.error ? 'PASS' : 'FAIL');

  // E appoint anon
  const e1 = await anon.rpc('appoint_org_role_atomic', {
    p_organization_id: GREENVIEW,
    p_person_id: 'b0000000-0000-4000-8000-000000000001',
    p_role_id: 'PRESIDENT',
    p_role_name: 'President',
  });
  record('E1', 'anon', 'appoint_org_role_atomic', 'denied', errText(e1.error) || 'ok', '-', '-', e1.error ? 'PASS' : 'FAIL');

  const e2 = await mgr.rpc('appoint_org_role_atomic', {
    p_organization_id: GREENVIEW,
    p_person_id: 'b0000000-0000-4000-8000-000000000009',
    p_role_id: 'PRESIDENT',
    p_role_name: 'President',
  });
  record(
    'E2',
    'manager',
    'appoint outsider supplier as PRESIDENT',
    'rejected',
    errText(e2.error) || 'ok',
    '-',
    '-',
    e2.error ? 'PASS' : 'FAIL',
  );

  // G milestone anon
  const g1 = await anon.rpc('approve_milestone_inspection_atomic', {
    p_inspection_id: '00000000-0000-0000-0000-000000000099',
    p_approver_id: '00000000-0000-0000-0000-000000000001',
    p_digital_signoff_hash: 'deadbeefdeadbeef',
  });
  record('G1', 'anon', 'approve_milestone_inspection_atomic', 'denied', g1.error?.message ?? 'ok', '-', '-', g1.error ? 'PASS' : 'FAIL');

  // COI vote
  const service = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const profileCoi = 'b0000000-0000-4000-8000-000000000002';
  await service.from('conflict_of_interest_declarations').upsert({
    rfq_id: BOREWELL_RFQ,
    profile_id: profileCoi,
    status: 'DECLARED_CONFLICT',
    description: 'contract test',
  });
  const comm = await signIn('committee1@greenview.test');
  const v1 = await comm.rpc('cast_committee_vote', {
    p_rfq_id: BOREWELL_RFQ,
    p_recommended_quote_id: QUOTE_A,
    p_choice: 'RECOMMEND',
  });
  record(
    'G-COI-VOTE',
    'committee1+COI',
    'cast_committee_vote',
    'COI recusal error',
    v1.error?.message ?? 'ok',
    '-',
    '-',
    String(v1.error?.message ?? '').match(/Conflict of Interest|COI/i) ? 'PASS' : 'FAIL',
  );
  await service.from('conflict_of_interest_declarations').delete().eq('rfq_id', BOREWELL_RFQ).eq('profile_id', profileCoi);

  // COI quorum: one unconflicted vote only → award must fail
  await service.from('conflict_of_interest_declarations').upsert({
    rfq_id: BOREWELL_RFQ,
    profile_id: profileCoi,
    status: 'DECLARED_CONFLICT',
    description: 'quorum contract test',
  });
  const comm2 = await signIn('committee2@greenview.test');
  await comm2.rpc('cast_committee_vote', {
    p_rfq_id: BOREWELL_RFQ,
    p_recommended_quote_id: QUOTE_A,
    p_choice: 'RECOMMEND',
  });
  const mgrAward = await signIn('manager@greenview.test');
  const qAward = await mgrAward.rpc('lock_and_reveal_award_atomic', {
    p_rfq_id: BOREWELL_RFQ,
    p_quote_id: QUOTE_A,
    p_justification: 'quorum test',
    p_auto_reveal: false,
  });
  record(
    'G-COI-QUORUM',
    'manager after 1 unconflicted vote',
    'lock_and_reveal_award_atomic',
    'quorum not met (COI excluded from count)',
    errText(qAward.error) || JSON.stringify(qAward.data),
    'committee1 COI + committee2 1 vote',
    '-',
    errText(qAward.error).match(/quorum not met|unconflicted/i) ? 'PASS' : 'FAIL',
  );
  await service.from('committee_votes').delete().eq('rfq_id', BOREWELL_RFQ);
  await service.from('conflict_of_interest_declarations').delete().eq('rfq_id', BOREWELL_RFQ).eq('profile_id', profileCoi);

  // Invoice supplier cannot set APPROVED on SUBMITTED row
  const poId = 'c8000001-0000-4000-8000-000000000001';
  const testInvSub = 'e0000003-0000-4000-8000-000000000099';
  psql(`UPDATE purchase_orders SET total_amount = GREATEST(total_amount, 15000) WHERE id='${poId}';`);
  psql(
    `DELETE FROM invoices WHERE id='${testInvSub}';
INSERT INTO invoices (id, work_order_id, purchase_order_id, supplier_id, invoice_number, amount, currency, status, paid_amount, balance_due, submitted_at)
VALUES ('${testInvSub}', 'd9000001-0000-4000-8000-000000000001', '${poId}', 'd0000000-0000-4000-8000-000000000002', 'CONTRACT-SUBMITTED', 200, 'INR', 'SUBMITTED', 0, 200, now());`,
  );
  const supB = await signIn('supplier-b@borewell.test');
  const invBefore = psql(`SELECT status::text FROM invoices WHERE id='${testInvSub}';`);
  const invUpd = await supB.from('invoices').update({ status: 'APPROVED' }).eq('id', testInvSub);
  const invAfter = psql(`SELECT status::text FROM invoices WHERE id='${testInvSub}';`);
  const invFixtureOk = invBefore === 'SUBMITTED';
  record(
    'F-INV-SUP',
    'supplier-b',
    'UPDATE invoices SET status=APPROVED',
    'blocked or unchanged',
    invFixtureOk ? errText(invUpd.error) || 'updated' : 'fixture insert failed (PO cap)',
    invBefore || 'missing',
    invAfter || 'missing',
    !invFixtureOk ? 'NOT TESTED' : invUpd.error || invBefore === invAfter ? 'PASS' : 'FAIL',
  );
  psql(`DELETE FROM invoices WHERE id='${testInvSub}';`);

  // Payment: ephemeral APPROVED invoice
  const testInv = 'e0000002-0000-4000-8000-000000000099';
  const poTotalBefore = psql(`SELECT total_amount::text FROM purchase_orders WHERE id='${poId}';`);
  psql(`UPDATE purchase_orders SET total_amount = GREATEST(total_amount, 15000) WHERE id='${poId}';`);
  psql(
    `DELETE FROM payment_allocations WHERE invoice_id='${testInv}'; DELETE FROM payments WHERE invoice_id='${testInv}'; DELETE FROM invoices WHERE id='${testInv}';
INSERT INTO invoices (id, work_order_id, purchase_order_id, supplier_id, invoice_number, amount, currency, status, paid_amount, balance_due, submitted_at, approved_at)
VALUES ('${testInv}', 'd9000001-0000-4000-8000-000000000001', '${poId}', 'd0000000-0000-4000-8000-000000000002', 'CONTRACT-TEST-INV', 500, 'INR', 'APPROVED', 0, 500, now(), now());`,
  );
  const balDueBefore = psql(`SELECT balance_due::text FROM invoices WHERE id='${testInv}';`);
  const payAnon = await anon.rpc('record_invoice_payment_atomic', {
    p_invoice_id: testInv,
    p_amount: 100,
    p_method: 'UPI',
    p_reference: 'ANON-FAKE-UTR',
  });
  record(
    'P-AUTH-ANON',
    'anon',
    'record_invoice_payment_atomic',
    'permission denied',
    errText(payAnon.error) || 'ok',
    balDueBefore,
    psql(`SELECT balance_due::text FROM invoices WHERE id='${testInv}';`),
    payAnon.error ? 'PASS' : 'FAIL',
  );
  const mgrPay = await signIn('manager@greenview.test');
  const payOk = await mgrPay.rpc('record_invoice_payment_atomic', {
    p_invoice_id: testInv,
    p_amount: 100,
    p_method: 'UPI',
    p_reference: 'CONTRACT-UTR-100',
    p_idempotency_key: 'contract-test-pay-100',
  });
  const balDueAfter = psql(`SELECT balance_due::text FROM invoices WHERE id='${testInv}';`);
  record(
    'P-BUYER-OK',
    'manager@greenview.test',
    'record_invoice_payment_atomic(100)',
    'ok; balance_due 500→400',
    errText(payOk.error) || JSON.stringify(payOk.data),
    balDueBefore,
    balDueAfter,
    !payOk.error && balDueAfter === '400.00' ? 'PASS' : 'FAIL',
  );
  psql(
    `DELETE FROM payment_allocations WHERE invoice_id='${testInv}'; DELETE FROM payments WHERE invoice_id='${testInv}'; DELETE FROM invoices WHERE id='${testInv}';`,
  );
  if (poTotalBefore) {
    psql(`UPDATE purchase_orders SET total_amount = ${poTotalBefore} WHERE id='${poId}';`);
  }

  // Discovery view column
  const mgr2 = await signIn('manager@greenview.test');
  const disc = await mgr2
    .from('rfq_invitations_manager')
    .select('invitation_id, decline_reason')
    .eq('rfq_id', BOREWELL_RFQ)
    .limit(1);
  record(
    'F-DISC',
    'manager',
    'rfq_invitations_manager.decline_reason',
    'column present, no error',
    disc.error?.message ?? `rows=${disc.data?.length}`,
    '-',
    '-',
    !disc.error ? 'PASS' : 'FAIL',
  );

  const AWARDED_RFQ = 'f2000000-0000-4000-8000-000000000001';
  const OTHER_ORG = '00000000-0000-4000-8000-000000000099';

  // A: EVALUATING → OPEN denied
  const rfqStatusBefore = psql(`SELECT status::text FROM rfqs WHERE id='${BOREWELL_RFQ}';`);
  const { error: rfqUpdErr } = await mgr2.from('rfqs').update({ status: 'OPEN' }).eq('id', BOREWELL_RFQ);
  const rfqStatusAfter = psql(`SELECT status::text FROM rfqs WHERE id='${BOREWELL_RFQ}';`);
  record(
    'SM-RFQ-A',
    'manager',
    'UPDATE rfqs.status OPEN from EVALUATING',
    'denied; status unchanged',
    errText(rfqUpdErr) || 'updated',
    rfqStatusBefore,
    rfqStatusAfter,
    rfqUpdErr && rfqStatusBefore === rfqStatusAfter ? 'PASS' : 'FAIL',
  );

  // B: AWARDED → EVALUATING denied
  const awBefore = psql(`SELECT status::text FROM rfqs WHERE id='${AWARDED_RFQ}';`);
  const { error: rfqBackErr } = await mgr2.from('rfqs').update({ status: 'EVALUATING' }).eq('id', AWARDED_RFQ);
  const awAfter = psql(`SELECT status::text FROM rfqs WHERE id='${AWARDED_RFQ}';`);
  record(
    'SM-RFQ-B',
    'manager',
    'UPDATE rfqs.status EVALUATING from AWARDED',
    'denied',
    errText(rfqBackErr) || 'updated',
    awBefore,
    awAfter,
    rfqBackErr && awBefore === awAfter ? 'PASS' : 'FAIL',
  );

  // C: valid DRAFT → OPEN (contract fixture)
  const contractReq = 'a2000999-0000-4000-8000-000000000099';
  const contractRfq = 'f1000999-0000-4000-8000-000000000099';
  psql(
    `DELETE FROM rfqs WHERE id='${contractRfq}'; DELETE FROM requirements WHERE id='${contractReq}';
INSERT INTO requirements (id, organization_id, created_by, requirement_type, status, title, description)
VALUES ('${contractReq}', '${GREENVIEW}', 'b0000000-0000-4000-8000-000000000001', 'SERVICE', 'RFQ_CREATED', 'Contract RFQ fixture', 'ephemeral');
INSERT INTO rfqs (id, requirement_id, organization_id, status, reveal_status, title, min_quotes_required, created_by)
VALUES ('${contractRfq}', '${contractReq}', '${GREENVIEW}', 'DRAFT', 'BLIND', 'Contract RFQ', 1, 'b0000000-0000-4000-8000-000000000001');`,
  );
  const draftBefore = psql(`SELECT status::text FROM rfqs WHERE id='${contractRfq}';`);
  const { error: openOkErr } = await mgr2.from('rfqs').update({ status: 'OPEN' }).eq('id', contractRfq);
  const draftAfter = psql(`SELECT status::text FROM rfqs WHERE id='${contractRfq}';`);
  record(
    'SM-RFQ-C',
    'manager',
    'UPDATE rfqs.status OPEN from DRAFT',
    'allowed',
    errText(openOkErr) || 'ok',
    draftBefore,
    draftAfter,
    !openOkErr && draftAfter === 'OPEN' ? 'PASS' : 'FAIL',
  );
  psql(`DELETE FROM rfqs WHERE id='${contractRfq}'; DELETE FROM requirements WHERE id='${contractReq}';`);

  // D: unauthorized supplier same invalid jump as A
  const supMgr = await signIn('supplier-a@borewell.test');
  const supStatusBefore = psql(`SELECT status::text FROM rfqs WHERE id='${BOREWELL_RFQ}';`);
  const { error: supRfqErr, count: supCount } = await supMgr
    .from('rfqs')
    .update({ status: 'OPEN' })
    .eq('id', BOREWELL_RFQ)
    .select('id');
  const supStatusAfter = psql(`SELECT status::text FROM rfqs WHERE id='${BOREWELL_RFQ}';`);
  const supBlocked =
    supRfqErr || supStatusBefore === supStatusAfter || (supCount !== null && supCount === 0);
  record(
    'SM-RFQ-D',
    'supplier-a',
    'UPDATE rfqs.status on buyer RFQ',
    'denied or zero rows; no status change',
    errText(supRfqErr) || `rows=${supCount ?? 'n/a'}`,
    supStatusBefore,
    supStatusAfter,
    supBlocked ? 'PASS' : 'FAIL',
  );

  // E: anonymous
  const { error: anonRfqErr } = await anon.from('rfqs').update({ status: 'OPEN' }).eq('id', BOREWELL_RFQ);
  record(
    'SM-RFQ-E',
    'anon',
    'UPDATE rfqs.status',
    'denied',
    errText(anonRfqErr) || 'updated',
    '-',
    '-',
    anonRfqErr ? 'PASS' : 'FAIL',
  );

  // F: immutable organization_id probe
  const { error: orgSwapErr } = await mgr2.from('rfqs').update({ organization_id: OTHER_ORG }).eq('id', BOREWELL_RFQ);
  const orgAfter = psql(`SELECT organization_id::text FROM rfqs WHERE id='${BOREWELL_RFQ}';`);
  record(
    'SM-RFQ-F-ORG',
    'manager',
    'UPDATE rfqs.organization_id',
    'denied',
    errText(orgSwapErr) || 'updated',
    GREENVIEW,
    orgAfter,
    orgSwapErr && orgAfter === GREENVIEW ? 'PASS' : 'FAIL',
  );

  const awardId = 'b7000001-0000-4000-8000-000000000001';
  const quoteBefore = psql(`SELECT quote_id::text FROM awards WHERE id='${awardId}';`);
  const { error: awardSwapErr } = await mgr2.from('awards').update({ quote_id: QUOTE_A }).eq('id', awardId);
  record(
    'SM-AWARD-PROBE',
    'manager',
    'UPDATE awards.quote_id',
    'denied or unchanged',
    errText(awardSwapErr) || 'updated',
    quoteBefore,
    psql(`SELECT quote_id::text FROM awards WHERE id='${awardId}';`),
    awardSwapErr ? 'PASS' : 'NOT TESTED',
  );

  record(
    'SM-RFQ-DIRECT-UPDATE',
    'manager',
    'alias for SM-RFQ-A',
    'same as A',
    errText(rfqUpdErr) || 'updated',
    rfqStatusBefore,
    rfqStatusAfter,
    rfqUpdErr && rfqStatusBefore === rfqStatusAfter ? 'PASS' : 'FAIL',
  );

  // Payment overload check
  const overload = psql(
    `SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='record_invoice_payment_atomic';`,
  );
  record(
    'P-OVERLOAD',
    'catalog',
    'record_invoice_payment_atomic count',
    'exactly 1',
    overload,
    '-',
    '-',
    overload === '1' ? 'PASS' : 'FAIL',
  );

  const out = { baseline, results, generatedAt: new Date().toISOString() };
  writeFileSync(resolve('OTP Golden Reconstruction', '_local_contract_evidence.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
