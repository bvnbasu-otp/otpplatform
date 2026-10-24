import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = (name: string) =>
  readFileSync(resolve(__dirname, '../../../../../supabase/migrations', name), 'utf8');

describe('RFQ lifecycle database authorization contract', () => {
  it('removes anonymous execution from buyer-initiated discovery', () => {
    const discovery = migration('00251_fresh_pin_coverage_otp_registered_fallback.sql');
    const guard = migration('00317_rfq_category_service_coverage_guard.sql');

    expect(discovery).toMatch(
      /IF NOT \([\s\S]*private\.is_org_member\(v_rfq\.organization_id\)[\s\S]*private\.is_platform_admin\(\)[\s\S]*RAISE EXCEPTION 'Access denied: not an organization member'/,
    );
    expect(guard).toMatch(
      /REVOKE ALL ON FUNCTION public\.discover_and_invite_for_rfq\(uuid, integer, uuid\[\], text\) FROM PUBLIC, anon;/,
    );
    expect(guard).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.discover_and_invite_for_rfq\(uuid, integer, uuid\[\], text\) TO authenticated, service_role;/,
    );
    expect(guard).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.discover_and_invite_for_rfq\([^;]+\) TO[^;]*\banon\b/,
    );
  });

  it('keeps direct RFQ and requirement updates behind owner-scoped RLS', () => {
    const client = readFileSync(resolve(__dirname, 'api/rfq-lifecycle.ts'), 'utf8');
    const base = migration('00004_rls_policies.sql');
    const buyerSelect = migration('00030_publish_requirement.sql');
    const personal = migration('00281_individual_personal_ownership_foundation.sql');
    const hardDeny = migration('00299_internal_procurement_hard_deny.sql');

    const openRfqStart = client.indexOf('export async function openRfq');
    const openRfqEnd = client.indexOf('export async function updateRfqDeadline', openRfqStart);
    expect(openRfqStart).toBeGreaterThanOrEqual(0);
    expect(openRfqEnd).toBeGreaterThan(openRfqStart);
    const openRfq = client.slice(openRfqStart, openRfqEnd);
    expect(openRfq).toContain(".from('rfqs')");
    expect(openRfq).toContain(".eq('id', rfqId)");
    expect(openRfq).toContain(".eq('status', 'DRAFT')");
    expect(openRfq).toContain(".from('requirements')");
    expect(openRfq).toContain(".eq('id', rfq.requirement_id)");

    expect(base).toContain('ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;');
    expect(base).toContain('ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;');
    expect(base).toMatch(
      /CREATE POLICY rfqs_update ON rfqs[\s\S]*?FOR UPDATE TO authenticated[\s\S]*?USING \([\s\S]*?private\.is_org_member\(organization_id\)[\s\S]*?private\.get_org_role\(organization_id\) IN \('OWNER', 'MANAGER', 'BUYER'\)[\s\S]*?WITH CHECK \(private\.is_org_member\(organization_id\)\);/,
    );
    expect(base).toMatch(
      /CREATE POLICY requirements_update ON requirements[\s\S]*?FOR UPDATE TO authenticated[\s\S]*?private\.is_org_member\(organization_id\)[\s\S]*?WITH CHECK \(private\.is_org_member\(organization_id\)\);/,
    );
    expect(buyerSelect).toMatch(
      /CREATE POLICY rfqs_select_buyer ON rfqs[\s\S]*?FOR SELECT TO authenticated[\s\S]*?USING \(private\.is_org_member\(organization_id\)\);/,
    );
    expect(personal).toMatch(
      /CREATE POLICY rfqs_personal_update ON public\.rfqs FOR UPDATE TO authenticated[\s\S]*?USING \(owner_profile_id IS NOT NULL AND owner_profile_id = private\.get_profile_id\(\)\)[\s\S]*?WITH CHECK \(organization_id IS NULL AND owner_profile_id = private\.get_profile_id\(\)\);/,
    );
    expect(personal).toMatch(
      /CREATE POLICY requirements_personal_update ON public\.requirements FOR UPDATE TO authenticated[\s\S]*?USING \(owner_profile_id IS NOT NULL AND owner_profile_id = private\.get_profile_id\(\)\)[\s\S]*?WITH CHECK \(organization_id IS NULL AND owner_profile_id = private\.get_profile_id\(\)\);/,
    );

    const currentMembershipBody =
      hardDeny.match(
        /CREATE OR REPLACE FUNCTION private\.is_org_member\(p_org_id uuid\)([\s\S]*?)\n\$\$;/,
      )?.[1] ?? '';
    expect(currentMembershipBody).toContain('om.profile_id = private.get_profile_id()');
    expect(currentMembershipBody).not.toContain('private.is_platform_admin()');
  });
});
