import { supabase } from '@/lib/supabase';
import type {
  DemoContext,
  DemoScenarioRow,
  DemoStage,
  DemoStatus,
} from '../types/demo';

/**
 * Reads and drives the demo.
 *
 * demo_status is readable by anon so the app can know whether it is in a demo
 * before anyone signs in. Everything here is gated server-side on demo mode
 * being enabled, so switching demo mode off removes it everywhere at once
 * rather than relying on the client to stop asking.
 */

export async function fetchDemoStatus(): Promise<DemoStatus> {
  // Client-side quick check: if VITE_DEMO_MODE is not true, immediately report disabled
  const envDemo = import.meta.env.VITE_DEMO_MODE === 'true';
  if (!envDemo) {
    return { enabled: false, runId: null, lastResetAt: null };
  }

  const { data, error } = await supabase.rpc('demo_status');

  if (error || !data) return { enabled: false, runId: null, lastResetAt: null };

  const row = data as { enabled: boolean; run_id: string | null; last_reset_at: string | null };
  return {
    enabled: Boolean(row.enabled && envDemo),
    runId: row.run_id,
    lastResetAt: row.last_reset_at,
  };
}

export async function fetchMyDemoContext(): Promise<DemoContext | null> {
  const { data, error } = await supabase.rpc('my_demo_context');
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  if (!row.signed_in) return null;

  return {
    signedIn: true,
    profileId: (row.profile_id as string | null) ?? null,
    fullName: (row.full_name as string | null) ?? null,
    isDemo: Boolean(row.is_demo),
    demoModeEnabled: Boolean(row.demo_mode_enabled),
    side: (row.side as 'BUYER' | 'SUPPLIER') ?? 'BUYER',
    organizationId: (row.organization_id as string | null) ?? null,
    organizationName: (row.organization_name as string | null) ?? null,
    buyerType: (row.buyer_type as string | null) ?? null,
    buyerTypeLabel: (row.buyer_type_label as string | null) ?? null,
    buyerTypeDescription: (row.buyer_type_description as string | null) ?? null,
    votingPower: Number(row.voting_power ?? 1),
    defaultCommitteeSize:
      row.default_committee_size === null ? null : Number(row.default_committee_size),
  };
}

export async function fetchScenarioBoard(): Promise<
  { ok: true; scenarios: DemoScenarioRow[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('demo_scenario_board')
    .select('*')
    .order('sort_order');

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    scenarios: (data ?? []).map((row) => ({
      code: row.code as string,
      title: row.title as string,
      narrative: row.narrative as string,
      buyerType: row.buyer_type as string,
      buyerTypeLabel: (row.buyer_type_label as string | null) ?? null,
      votingPower: row.voting_power === null ? null : Number(row.voting_power),
      organizationName: (row.organization_name as string | null) ?? null,
      requirementId: (row.requirement_id as string | null) ?? null,
      rfqId: (row.rfq_id as string | null) ?? null,
      publicRef: (row.public_ref as string | null) ?? null,
      stageLabel: row.stage_label as string,
      targetStage: row.target_stage as DemoStage,
      actualStage: row.actual_stage as DemoStage,
      requirementStatus: (row.requirement_status as string | null) ?? null,
      rfqStatus: (row.rfq_status as string | null) ?? null,
      revealStatus: (row.reveal_status as string | null) ?? null,
      minQuotesRequired:
        row.min_quotes_required === null ? null : Number(row.min_quotes_required),
      suppliersInvited: Number(row.suppliers_invited ?? 0),
      quotesReceived: Number(row.quotes_received ?? 0),
      membersVoted: Number(row.members_voted ?? 0),
      weightCast: Number(row.weight_cast ?? 0),
      awardStatus: (row.award_status as string | null) ?? null,
      awardedAt: (row.awarded_at as string | null) ?? null,
      revealedAt: (row.revealed_at as string | null) ?? null,
      hasPurchaseOrder: Boolean(row.has_purchase_order),
    })),
  };
}

export interface ResetOutcome {
  runId: string;
  rfqsReset: number;
  deleted: Record<string, number>;
}

/**
 * Rebuilds the demo. Scoped server-side to is_demo rows, so a real tender in
 * the same database is untouched, and audit history survives the reset under
 * its own run id.
 */
export async function resetDemo(
  restage = true,
): Promise<{ ok: true; outcome: ResetOutcome } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('demo_reset', { p_restage: restage });

  if (error) return { ok: false, error: error.message };

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    outcome: {
      runId: (row.run_id as string) ?? '',
      rfqsReset: Number(row.rfqs_reset ?? 0),
      deleted: (row.deleted as Record<string, number>) ?? {},
    },
  };
}

/** Moves one scenario to the stage it was written to demonstrate. */
export async function stageScenario(
  code: string,
): Promise<{ ok: true; stage: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('demo_stage_scenario', { p_code: code });

  if (error) return { ok: false, error: error.message };

  const row = (data ?? {}) as Record<string, unknown>;
  return { ok: true, stage: (row.stage as string) ?? 'DRAFT' };
}
