import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/00253_cancelled_rfq_allowance_and_utgst.sql', 'utf8');

describe('00253 cancelled allowance and UTGST', () => {
  it('excludes cancelled RFQs from the monthly count and the quarterly bonus count', () => {
    const counts = sql.split('CREATE OR REPLACE FUNCTION public.create_purchase_order_from_award')[0];
    expect(counts).toContain("status IS DISTINCT FROM 'CANCELLED'::public.rfq_status");
    expect(counts.match(/status IS DISTINCT FROM 'CANCELLED'::public.rfq_status/g)).toHaveLength(2);
    expect(counts).toContain("v_org_type IN ('INDIVIDUAL', 'COMMUNITY', 'MSME')");
  });

  it('splits intra-state Union Territory GST into CGST and UTGST and leaves inter-state as IGST', () => {
    expect(sql).toContain("IN ('04', '25', '26', '31', '35', '38', '97')");
    expect(sql).toContain('private.gst_component_split');
    expect(sql).toContain("'utgstAmount', v_utgst");
    expect(sql).toContain('v_sgst, v_utgst, v_igst');
    expect(sql).not.toContain('v_sgst, 0, v_igst');
  });
});
