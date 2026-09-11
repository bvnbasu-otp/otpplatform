import { supabase } from '@/lib/supabase';
import { fetchCurrentProfile } from '@/features/auth/user-role';

export interface UserOrganization {
  organizationId: string;
  organizationName: string;
  orgType: string;
  role: string;
}

export async function fetchUserOrganization(): Promise<
  { ok: true; org: UserOrganization } | { ok: false; error: string }
> {
  const profile = await fetchCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };

  if (profile.activeOrganizationId) {
    const { data: activeData, error: activeError } = await supabase
      .from('organization_members')
      .select('role, organizations(id, name, org_type)')
      .eq('profile_id', profile.profileId)
      .eq('organization_id', profile.activeOrganizationId)
      .maybeSingle();

    if (!activeError && activeData?.organizations) {
      const org = activeData.organizations as unknown as { id: string; name: string; org_type: string };
      return {
        ok: true,
        org: {
          organizationId: org.id,
          organizationName: org.name,
          orgType: org.org_type,
          role: activeData.role,
        },
      };
    }
  }

  const { data, error } = await supabase
    .from('organization_members')
    .select('role, organizations(id, name, org_type)')
    .eq('profile_id', profile.profileId)
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data?.organizations) return { ok: false, error: 'No buyer organization found' };

  const org = data.organizations as unknown as { id: string; name: string; org_type: string };
  return {
    ok: true,
    org: {
      organizationId: org.id,
      organizationName: org.name,
      orgType: org.org_type,
      role: data.role,
    },
  };
}

export interface OrganizationRequirementSummary {
  id: string;
  title: string;
  requirementType: string;
  status: string;
  effectiveStatus: string;
  createdAt: string;
  publishedAt: string | null;
  rfqId: string | null;
  rfqStatus: string | null;
  revealStatus: string | null;
  quotesCount: number;
  minQuotesRequired: number;
  poId: string | null;
  poStatus: string | null;
  workOrderProgressPercent: number | null;
  isSettled: boolean;
}

export async function fetchOrganizationRequirements(organizationId: string): Promise<
  { ok: true; requirements: OrganizationRequirementSummary[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('requirements')
    .select(`
      id,
      title,
      requirement_type,
      status,
      created_at,
      published_at,
      rfqs (
        id,
        status,
        reveal_status,
        min_quotes_required,
        purchase_orders (
          id,
          status,
          work_orders (
            id,
            status,
            progress_percent,
            buyer_accepted_at
          )
        )
      )
    `)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };

  // Buyers cannot SELECT the base `quotes` table (identity protection), so an
  // embedded `rfqs(quotes(id))` above would silently resolve to an empty array
  // under RLS. This RPC counts quotes server-side and works at every phase.
  const { data: countRows, error: countError } = await supabase.rpc(
    'organization_rfq_quote_counts',
    { p_organization_id: organizationId },
  );
  if (countError) return { ok: false, error: countError.message };
  const quoteCountByRfq = new Map<string, number>(
    (countRows ?? []).map((row: { rfq_id: string; quotes_count: number }) => [
      row.rfq_id,
      row.quotes_count,
    ]),
  );

  const requirements: OrganizationRequirementSummary[] = (data ?? []).map((row) => {
    const rfqList = Array.isArray(row.rfqs) ? row.rfqs : row.rfqs ? [row.rfqs] : [];
    const rfq = rfqList[0] as
      | {
          id: string;
          status: string;
          reveal_status: string;
          min_quotes_required: number;
          purchase_orders: {
            id: string;
            status: string;
            work_orders: {
              id: string;
              status: string;
              progress_percent: number;
              buyer_accepted_at: string | null;
            }[];
          }[];
        }
      | undefined;
    const poList = rfq && Array.isArray(rfq.purchase_orders) ? rfq.purchase_orders : [];
    const po = poList[0];
    const woList = po && Array.isArray(po.work_orders) ? po.work_orders : [];
    const wo = woList[0];

    const is100PercentDone =
      wo?.buyer_accepted_at != null ||
      (wo?.progress_percent != null && Number(wo.progress_percent) >= 100) ||
      po?.status === 'COMPLETED' ||
      row.status === 'COMPLETED';

    const effectiveStatus = is100PercentDone ? 'COMPLETED' : row.status;

    return {
      id: row.id,
      title: row.title,
      requirementType: row.requirement_type,
      status: row.status,
      effectiveStatus,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      rfqId: rfq?.id ?? null,
      rfqStatus: rfq?.status ?? null,
      revealStatus: rfq?.reveal_status ?? null,
      quotesCount: (rfq && quoteCountByRfq.get(rfq.id)) ?? 0,
      minQuotesRequired: rfq?.min_quotes_required ?? 3,
      poId: po?.id ?? null,
      poStatus: po?.status ?? null,
      workOrderProgressPercent: wo?.progress_percent != null ? Number(wo.progress_percent) : null,
      isSettled: is100PercentDone,
    };
  });

  return { ok: true, requirements };
}