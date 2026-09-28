/**
 * An organization of a suite's own for tests that publish RFQs.
 *
 * The pilot allowance (00199, private.enforce_pilot_rfq_allowance) is 3 RFQs
 * per organization per calendar month and counts every rfqs row, including the
 * seeded demo RFQs and fixtures other files cannot delete (quote_versions are
 * append-only). A suite that publishes into a shared demo organization
 * therefore passes or fails depending on what ran before it. Publishing into
 * an organization nobody else writes to keeps the real publish path and the
 * real allowance, without depending on file order.
 *
 * The id is fixed rather than random: audit_events references the
 * organization, so it can never be deleted once something was published, and
 * a fixed id means one row per suite instead of one per run.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const ISOLATED_ORGS = {
  requirementIntake: 'e2e00000-0000-4000-8000-000000000001',
  marketIntelligenceIntake: 'e2e00000-0000-4000-8000-000000000002',
  attachments: 'e2e00000-0000-4000-8000-000000000003',
  demoResetControl: 'e2e00000-0000-4000-8000-000000000004',
} as const;

async function purgeRequirements(service: SupabaseClient, orgId: string): Promise<void> {
  // Requirements cascade to their RFQs, invitations and attachments.
  const { error } = await service.from('requirements').delete().eq('organization_id', orgId);
  if (error) throw new Error(`isolated org ${orgId} cleanup failed: ${error.message}`);

  const { count } = await service
    .from('rfqs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  if (count !== 0) throw new Error(`isolated org ${orgId} still holds ${count} RFQs`);
}

/**
 * Creates (or reuses) the organization, empties it, and makes `memberEmail`
 * a MANAGER of it. Call `release` in afterAll.
 */
export async function useIsolatedBuyerOrg(
  service: SupabaseClient,
  orgId: string,
  name: string,
  memberEmail: string,
): Promise<{ orgId: string; release: () => Promise<void> }> {
  const { error: orgError } = await service.from('organizations').upsert({
    id: orgId,
    name,
    org_type: 'COMMUNITY',
    city: 'Bengaluru',
    status: 'ACTIVE',
    subscription_plan: 'MONTHLY',
    subscription_status: 'ACTIVE',
    is_demo: false,
  });
  if (orgError) throw new Error(`isolated org ${orgId} upsert failed: ${orgError.message}`);

  await purgeRequirements(service, orgId);

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id')
    .eq('email', memberEmail)
    .single();
  if (profileError || !profile) throw new Error(`no profile for ${memberEmail}`);

  const { error: memberError } = await service
    .from('organization_members')
    .upsert(
      { organization_id: orgId, profile_id: profile.id, role: 'MANAGER' },
      { onConflict: 'organization_id,profile_id' },
    );
  if (memberError) throw new Error(`isolated org membership failed: ${memberError.message}`);

  return {
    orgId,
    release: async () => {
      await purgeRequirements(service, orgId);
      await service.from('organization_members').delete().eq('organization_id', orgId);
    },
  };
}
