import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const readMigration = (file: string) =>
  readFileSync(resolve(ROOT, 'supabase/migrations', file), 'utf8');

const TENURE = readMigration('00326_authoritative_committee_tenure.sql');
const WEIGHTED = readMigration('00024_weighted_voting.sql');
const AUTHORITY = readMigration('00238_p1_rwa_vote_authority_write_boundary.sql');

describe('00326 authoritative RWA/MSME committee tenure', () => {
  it('refuses incompatible existing rows instead of rewriting or deleting them', () => {
    const precondition =
      TENURE.match(/DO \$preconditions\$[\s\S]*?\$preconditions\$;/)?.[0] ?? '';
    expect(precondition).toContain('COMMITTEE_TENURE_INCOMPATIBLE');
    expect(precondition).toContain("role_category IN ('RWA_GOVERNANCE', 'MSME_MANAGEMENT')");
    expect(precondition).not.toMatch(/\b(?:UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
  });

  it('normalizes active RWA and MSME terms to one calendar year', () => {
    expect(TENURE).toContain("NEW.effective_to := NEW.effective_from + interval '1 year'");
    expect(TENURE).toContain('NEW.term_duration_days := 365');
    expect(TENURE).toContain('COMMITTEE_TENURE_EXPIRED');
    expect(TENURE).toContain('uq_org_role_assignments_one_active_holder');
    expect(TENURE).toContain("WHERE status = 'ACTIVE'");
  });

  it('requires a current qualifying appointment and RFQ seat for RWA and MSME votes', () => {
    expect(TENURE).toContain("v_org_type IN ('COMMUNITY', 'MSME')");
    expect(TENURE).toContain("assignment.role_category = 'RWA_GOVERNANCE'");
    expect(TENURE).toContain("assignment.role_category = 'MSME_MANAGEMENT'");
    expect(TENURE).toContain('assignment.effective_to > clock_timestamp()');
    expect(TENURE).toContain('v_has_rfq_seat AND v_has_active_appointment');
    expect(TENURE).toContain("COALESCE(v_active_role, '') IN ('FACILITY_MANAGER', 'ESTATE_MANAGER')");
  });

  it('preserves weighted voting and fail-closed COI checks', () => {
    expect(WEIGHTED).toContain('voting_power');
    expect(AUTHORITY).toContain("coi.status = 'DECLARED_CONFLICT'");
    expect(TENURE).toContain("coi.status = 'DECLARED_CONFLICT'");
    expect(TENURE).toContain('Estate / Facility Manager is an operational non-voting role');
  });

  it('makes role assignment writes RPC-only and counts only each current vote for quorum', () => {
    expect(TENURE).toContain('DROP POLICY IF EXISTS p_org_role_assignments_write');
    expect(TENURE).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public.org_role_assignments FROM anon, authenticated',
    );
    expect(TENURE).toContain('ORG_ROLE_ASSIGNMENT_RPC_REQUIRED');
    expect(TENURE).toContain('FROM private.current_votes(p_rfq_id) vote');
  });
});
