import { supabase } from '@/lib/supabase';

// Callers use the signed-in user's session. Authorization (effective active
// SUPER_ADMIN), trusted demo/QA eligibility, dependency blocking, and the
// one-time confirmation are enforced by the database functions, not here.

export interface DemoUserDeletionDependency {
  schema: string;
  table: string;
  column: string | null;
  constraint: string;
  target: string;
  deleteAction: string;
  category: string;
  count: number;
  disposition: string;
  blocks: boolean;
}

export interface DemoUserDeletionPreview {
  targetProfileId: string;
  eligible: boolean;
  blockerCount: number;
  fingerprint: string;
  policyBlockers: Array<{ code: string; category: string }>;
  dependencies: DemoUserDeletionDependency[];
  confirmationToken: string | null;
  expiresAt: string | null;
}

export interface DemoUserDeletionResult {
  targetProfileId: string;
  auditEventId: string;
  outcome: string;
}

export async function previewDemoUserDeletion(
  targetProfileId: string,
): Promise<{ ok: true; preview: DemoUserDeletionPreview } | { ok: false; error: string }> {
  if (!targetProfileId?.trim()) return { ok: false, error: 'A target account is required.' };
  const { data, error } = await supabase.rpc('preview_demo_user_deletion', {
    p_target_profile_id: targetProfileId,
  });
  if (error) return { ok: false, error: error.message };
  if (!data || typeof data !== 'object' || typeof data.fingerprint !== 'string' || typeof data.eligible !== 'boolean') {
    return { ok: false, error: 'The server did not return a deletion preview.' };
  }
  const eligible = data.eligible === true && Number(data.blockerCount) === 0;
  return {
    ok: true,
    preview: {
      targetProfileId: data.targetProfileId,
      eligible,
      blockerCount: Number(data.blockerCount ?? 0),
      fingerprint: data.fingerprint,
      policyBlockers: Array.isArray(data.policyBlockers) ? data.policyBlockers : [],
      dependencies: Array.isArray(data.dependencies) ? data.dependencies : [],
      confirmationToken: eligible && typeof data.confirmationToken === 'string' ? data.confirmationToken : null,
      expiresAt: eligible && typeof data.expiresAt === 'string' ? data.expiresAt : null,
    },
  };
}

export async function executeDemoUserDeletion(input: {
  targetProfileId: string;
  confirmationToken: string;
  reason: string;
  outcome: string;
}): Promise<{ ok: true; result: DemoUserDeletionResult } | { ok: false; error: string }> {
  const reason = input.reason?.trim() ?? '';
  const outcome = input.outcome?.trim() ?? '';
  const token = input.confirmationToken?.trim() ?? '';
  if (!input.targetProfileId?.trim()) return { ok: false, error: 'A target account is required.' };
  if (!token) return { ok: false, error: 'Run a fresh preview before deleting.' };
  if (!reason) return { ok: false, error: 'A reason is required.' };
  if (!outcome) return { ok: false, error: 'An outcome is required.' };

  const { data, error } = await supabase.rpc('execute_demo_user_deletion', {
    p_target_profile_id: input.targetProfileId,
    p_confirmation_token: token,
    p_reason: reason,
    p_outcome: outcome,
  });
  if (error) return { ok: false, error: error.message };
  if (
    !data ||
    data.ok !== true ||
    data.targetProfileId !== input.targetProfileId ||
    Number(data.deletedProfileCount) !== 1 ||
    Number(data.deletedAuthUserCount) !== 1 ||
    typeof data.auditEventId !== 'string'
  ) {
    return { ok: false, error: 'The server did not confirm the deletion.' };
  }
  return {
    ok: true,
    result: { targetProfileId: data.targetProfileId, auditEventId: data.auditEventId, outcome: data.outcome },
  };
}
