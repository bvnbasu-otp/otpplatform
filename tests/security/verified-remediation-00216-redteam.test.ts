import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE = '00216_verified_remediation_p0_p1_security_integrity.sql';
const CEILING = '00245_f13_po_gst_tax_accuracy.sql';
const SUPPLIER_WALLET_FILE = '00220_supplier_wallet_ledger_events.sql';
const SQL = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');
const DEPLOY = readFileSync(resolve(ROOT, 'scripts/deploy-migrations.ts'), 'utf8');

describe('migration 00216 verified remediation (static contract)', () => {
  it('exists as the next contiguous migration after 00215', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    expect(files[files.length - 1]).toBe(CEILING);
    expect(files.some((f) => f === FILE)).toBe(true);
    expect(files.some((f) => f === '00219_guard_rfq_approval_stage_direct_write.sql')).toBe(true);
  });

  it('00220 supplier wallet RPC: no anon execute and no client amount override', () => {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, SUPPLIER_WALLET_FILE), 'utf8');
    expect(sql).toContain('Supplier cashback has been removed');
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.credit_supplier_wallet_event_atomic[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toContain('Client cannot override supplier wallet amount');
    expect(sql).toContain('uq_wallet_supplier_event_source');
  });

  it('AUD-SEC-001: wallet credit requires platform fee tx and membership', () => {
    expect(SQL).toContain('platform_fee_tx_id is required');
    expect(SQL).toContain('Platform fee transaction does not belong to organization');
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.credit_buyer_settlement_reward_atomic[\s\S]*FROM PUBLIC, anon/);
  });

  it('N8: subscription wallet redemption uses catalog amounts', () => {
    expect(SQL).toContain('private.subscription_wallet_credit_inr');
    expect(SQL).toContain('Wallet redemption must equal catalog amount');
    expect(SQL).toContain('Payment amount must equal catalog price');
  });

  it('N5: approval RPC uses profile id not auth.uid', () => {
    const n5 = SQL.slice(
      SQL.indexOf('-- 2. Atomic Digital Sign-Off RPC'),
      SQL.indexOf('-- N4: appoint_org_role_atomic'),
    );
    expect(n5).toContain('v_caller_id := private.get_profile_id();');
    expect(n5).not.toContain('COALESCE(auth.uid(), private.get_profile_id())');
  });

  it('N1: revokes anon from award and PO paths', () => {
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.lock_and_reveal_award_atomic[\s\S]*FROM PUBLIC, anon/);
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.create_purchase_order_from_award\(uuid\) FROM PUBLIC, anon/);
    expect(SQL).toContain('REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM anon');
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.submit_signup_request(jsonb) TO anon');
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.service_categories() TO anon');
  });

  it('N11: rfq_invitations_manager exposes decline_reason', () => {
    expect(SQL).toContain('ri.decline_reason');
  });

  it('N2: record_invoice_payment uses event_type audit column', () => {
    expect(SQL).toContain("INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload, actor_id)");
    expect(SQL).not.toContain('INSERT INTO public.audit_events (\n    action,');
  });

  it('N7: milestone approve checks server digest', () => {
    expect(SQL).toContain('Signoff hash does not match server inspection digest');
    expect(SQL).toContain('Only authorized buyer organization members can approve milestone inspections');
  });
});

describe('deploy-migrations.ts N14/N15 guards', () => {
  it('does not default to deploy and fails closed in CI without DB', () => {
    expect(DEPLOY).toContain('const isDeploy = args.includes(\'--deploy\');');
    expect(DEPLOY).toContain('CI deploy requires DATABASE_URL');
    expect(DEPLOY).not.toMatch(/isDeploy = args\.includes\('--deploy'\) \|\| \(!isCheckOnly/);
  });
});

describe('supplier discovery truthfulness (static)', () => {
  const src = readFileSync(resolve(ROOT, 'apps/web/src/features/requirement/api/rfq-lifecycle.ts'), 'utf8');
  it('does not hardcode gstVerified true or fake distances', () => {
    expect(src).not.toContain('gstVerified: true');
    expect(src).not.toContain('distanceKm: isLocal');
    expect(src).not.toContain('Available Immediately');
  });
});
