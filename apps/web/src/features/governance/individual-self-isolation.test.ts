import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');

describe('Individual Self organisation isolation', () => {
  it('creates a new organisation id and does not look up the display name Self', () => {
    const sql = readFileSync(
      join(root, 'supabase/migrations/00212_reconcile_supplier_verification_buyer_addresses_and_self_service_signup.sql'),
      'utf8',
    );
    const buyer = sql.slice(sql.indexOf("IF v_req.side = 'BUYER'"), sql.indexOf('ELSE -- SUPPLIER'));
    expect(buyer).toContain("v_org_name := 'Self'");
    expect(buyer).toContain('v_org_id := gen_random_uuid()');
    expect(buyer).toContain('organization_members');
    expect(buyer).not.toMatch(/WHERE\s+name\s*=\s*'Self'/i);
    expect(buyer).not.toContain('committee_assignments');
    expect(buyer).not.toContain('committee_votes');

    const member = readFileSync(join(root, 'supabase/migrations/00003_auth_helpers.sql'), 'utf8');
    const isMember = member.slice(member.indexOf('FUNCTION private.is_org_member'), member.indexOf('FUNCTION private.get_org_role'));
    expect(isMember).toContain('om.organization_id = p_org_id');
    expect(isMember).toContain('om.profile_id = private.get_profile_id()');
    expect(isMember).not.toMatch(/organizations\.name|name = 'Self'/);
  });
});
