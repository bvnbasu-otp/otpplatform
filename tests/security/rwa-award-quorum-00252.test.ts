import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/00252_rwa_award_quorum_met.sql',
  'utf8',
);

describe('00252 RWA award quorum', () => {
  it('rejects a COMMUNITY/RWA lock when quorum_met is false and leaves the two-vote rule in place', () => {
    expect(sql).toContain('quorum_met is false for this RWA/COMMUNITY award');
    expect(sql).toContain("v_org_type NOT IN ('COMMUNITY', 'RWA', 'SOCIETY')");
    expect(sql).toContain('at least 2 unconflicted votes required for this award');
    expect(sql).toContain('PERFORM private.enforce_rwa_award_quorum(p_rfq_id, p_quote_id)');
    expect(sql).toContain('DECLARED_CONFLICT');
  });

  it('does not put Individual or MSME on the RWA quorum gate', () => {
    const gate = sql.slice(sql.indexOf('Individuals, MSMEs'), sql.indexOf('SELECT COUNT(DISTINCT cv.profile_id)'));
    expect(gate).toContain('Individuals, MSMEs');
    expect(gate).toContain("NOT IN ('COMMUNITY', 'RWA', 'SOCIETY')");
    expect(gate).not.toContain("'INDIVIDUAL'");
    expect(gate).not.toContain("'MSME'");
  });
});
