import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/00225_rfq_pin_coverage_supplier_bridge.sql'),
  'utf8',
);

describe('00225 RFQ pin coverage bridge (static contract)', () => {
  it('creates QUOTE_PARTICIPANT placeholders without VERIFIED verification', () => {
    expect(sql).toContain("'QUOTE_PARTICIPANT'");
    expect(sql).toContain("'NOT_PROVIDED'");
    expect(sql).not.toMatch(/lifecycle_state\s*=\s*'VERIFIED'/);
  });

  it('records no_contact_channel without fabricating messaging dispatch', () => {
    expect(sql).toContain('no_contact_channel');
    expect(sql).not.toContain('dispatch_supplier_invitation_notification');
  });

  it('preserves rank_discovery_candidates pass when coverage is empty', () => {
    expect(sql).toContain('private.rank_discovery_candidates');
    expect(sql).toContain('v_pin_cov = 0');
  });

  it('does not weaken PO VERIFIED gates (unchanged migrations)', () => {
    const poGate = readFileSync(
      resolve(__dirname, '../../../../supabase/migrations/00216_verified_remediation_p0_p1_security_integrity.sql'),
      'utf8',
    );
    expect(poGate).toMatch(/create_purchase_order_from_award/);
    expect(poGate).toContain("lifecycle_state = 'VERIFIED'");
  });
});
