import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateSupplierPlatformFeeWithGst,
  SUBSCRIPTION_TIERS,
  PERSONA_EXTRA_RFQ_PRICES,
} from '@otp/domain';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE_00330 = '00330_authoritative_pricing_and_supplier_fee_gate.sql';

describe('Migration 00330: Static SQL Contract & Security Boundaries', () => {
  const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.+\.sql$/.test(f)).sort();
  const sql = readFileSync(resolve(MIGRATIONS_DIR, FILE_00330), 'utf8');

  it('is contiguous in the promoted repository chain', () => {
    const index = migrations.indexOf(FILE_00330);
    expect(index).toBe(329); // 330th file (0-indexed)
    expect(migrations[index - 1]).toBe('00329_fix_direct_invites_and_supplier_quoting_for_demo.sql');
    expect(migrations[index + 1]).toBe('00331_authoritative_17_category_taxonomy.sql');
  });

  it('seeds authoritative canonical plans matching published commercial rules', () => {
    // Individual
    expect(sql).toMatch(/'INDIVIDUAL',\s*'INDIVIDUAL',\s*'Individual Buyer'/);
    expect(sql).toMatch(/199\.00,\s*1999\.00,\s*149\.00/);

    // RWA
    expect(sql).toMatch(/'RWA',\s*'RWA',\s*'RWA & Society'/);
    expect(sql).toMatch(/1499\.00,\s*14999\.00,\s*999\.00/);

    // MSME
    expect(sql).toMatch(/'MSME',\s*'MSME',\s*'MSME & Commercial Business'/);
    expect(sql).toMatch(/1999\.00,\s*19999\.00,\s*1499\.00/);

    // Preserves unmapped legacy MVP plans for subscription_pricing_report
    expect(sql).toContain("'COMMUNITY_FREE'");
    expect(sql).toContain("'MSME_STARTER'");
    expect(sql).toContain("'ENTERPRISE'");

    // Backward compatibility alias normalization in organizations
    expect(sql).toContain("WHEN subscription_tier = 'TIER_1_MSME' THEN 'INDIVIDUAL'");
    expect(sql).toContain("WHEN subscription_tier = 'TIER_2_ENTERPRISE' THEN 'RWA'");
  });

  it('creates public.supplier_fee_orders with strict constraints and RLS', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.supplier_fee_orders');
    expect(sql).toContain('fee_rate numeric(5, 4) NOT NULL DEFAULT 0.0050 CHECK (fee_rate = 0.0050)');
    expect(sql).toContain('gst_rate numeric(5, 2) NOT NULL DEFAULT 18.00 CHECK (gst_rate = 18.00)');
    expect(sql).toContain("status IN ('PENDING', 'SUCCEEDED', 'DISPUTED', 'REFUNDED')");
    expect(sql).toContain('ALTER TABLE public.supplier_fee_orders ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.supplier_fee_orders FORCE ROW LEVEL SECURITY;');
  });

  it('enforces supplier fee gate before reveal in lock_and_reveal_award_atomic', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.lock_and_reveal_award_atomic');
    expect(sql).toContain('round(v_gross * 0.0050, 2)');
    expect(sql).toContain('INSERT INTO public.supplier_fee_orders');
    expect(sql).toContain("v_fee_order.status = 'SUCCEEDED'");
    expect(sql).toContain("'supplier_fee_required', true");
  });

  it('strictly gates public.reveal_award on verified fee payment', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reveal_award');
    expect(sql).toContain("FEE-NOT-PAID");
    expect(sql).toContain("status <> 'SUCCEEDED'");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reveal_award\(uuid\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.reveal_award\(uuid\) TO authenticated, service_role;/);
  });

  it('provides complete supplier fee lifecycle RPCs with non-refundable policy enforcement', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_supplier_fee_details');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.accept_supplier_fee_terms');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.record_verified_supplier_fee_payment');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pay_supplier_fee_simulated');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.request_supplier_fee_refund');

    // record_verified_supplier_fee_payment must be service_role ONLY
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.record_verified_supplier_fee_payment\([^)]*\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.record_verified_supplier_fee_payment\([^)]*\) TO service_role;/,
    );

    // Non-refundable exception enforcement: buyer withdrawal rejected
    expect(sql).toContain('NON-REFUNDABLE-FEE-POLICY');
    expect(sql).toContain("'DUPLICATE_PAYMENT', 'GATEWAY_ERROR', 'PLATFORM_REVEAL_FAILURE'");
  });

  it('protects buyer identity in rfq_buyer_revealed until fee is paid and supports personal buyers', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW public.rfq_buyer_revealed');
    expect(sql).toContain('LEFT JOIN public.organizations o');
    expect(sql).toContain('LEFT JOIN public.profiles p_owner');
    expect(sql).toContain("COALESCE(o.name, p_owner.full_name, 'Individual Buyer')");
    expect(sql).toContain("status = 'SUCCEEDED'");
  });
});

describe('Monetization Commercial Rules Invariants', () => {
  it('verifies published individual plan: ₹199/month, 3 included RFQs, ₹149 extra RFQ', () => {
    const individual = SUBSCRIPTION_TIERS.INDIVIDUAL;
    expect(individual.monthlyPrice).toBe(199);
    expect(individual.yearlyPrice).toBe(1999);
    expect(individual.monthlyRfqs).toBe(3);
    expect(individual.additionalRfqPrice).toBe(149);
    expect(PERSONA_EXTRA_RFQ_PRICES.INDIVIDUAL).toBe(149);
  });

  it('verifies published RWA plan: ₹1,499/month, ₹14,999/year, 3 included RFQs, ₹999 extra RFQ', () => {
    const rwa = SUBSCRIPTION_TIERS.RWA;
    expect(rwa.monthlyPrice).toBe(1499);
    expect(rwa.yearlyPrice).toBe(14999);
    expect(rwa.monthlyRfqs).toBe(3);
    expect(rwa.additionalRfqPrice).toBe(999);
    expect(PERSONA_EXTRA_RFQ_PRICES.RWA).toBe(999);
  });

  it('verifies published MSME plan: ₹1,999/month, ₹19,999/year, 3 included RFQs, ₹1,499 extra RFQ', () => {
    const msme = SUBSCRIPTION_TIERS.MSME;
    expect(msme.monthlyPrice).toBe(1999);
    expect(msme.yearlyPrice).toBe(19999);
    expect(msme.monthlyRfqs).toBe(3);
    expect(msme.additionalRfqPrice).toBe(1499);
    expect(PERSONA_EXTRA_RFQ_PRICES.MSME).toBe(1499);
  });

  it('computes supplier platform fee exactly: 0.50% fee + 18% GST on fee', () => {
    // Case 1: ₹100,000 transaction
    const res1 = calculateSupplierPlatformFeeWithGst({ poGrossAmount: 100000 });
    expect(res1.feeAmount).toBe(500); // 0.50% of 100,000
    expect(res1.gstOnFeeAmount).toBe(90); // 18% of 500
    expect(res1.totalFeeWithGst).toBe(590);
    expect(res1.netSupplierDisbursement).toBe(99410);
    expect(res1.poGrossUntouched).toBe(true);

    // Case 2: ₹25,000 transaction
    const res2 = calculateSupplierPlatformFeeWithGst({ poGrossAmount: 25000 });
    expect(res2.feeAmount).toBe(125); // 0.50% of 25,000
    expect(res2.gstOnFeeAmount).toBe(22.50); // 18% of 125
    expect(res2.totalFeeWithGst).toBe(147.50);
    expect(res2.netSupplierDisbursement).toBe(24852.50);

    // Case 3: ₹5,000,000 enterprise transaction
    const res3 = calculateSupplierPlatformFeeWithGst({ poGrossAmount: 5000000 });
    expect(res3.feeAmount).toBe(25000); // 0.50% of 5,000,000
    expect(res3.gstOnFeeAmount).toBe(4500); // 18% of 25,000
    expect(res3.totalFeeWithGst).toBe(29500);
    expect(res3.netSupplierDisbursement).toBe(4970500);
  });
});
