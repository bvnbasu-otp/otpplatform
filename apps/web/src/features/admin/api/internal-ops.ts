import { supabase } from '@/lib/supabase';

export interface InternalRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

export interface InternalPermissionGroup {
  id: string;
  code: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface InternalPermission {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface InternalUserAssignment {
  id: string;
  profile_id: string;
  role_id: string;
  role_code?: string;
  role_name?: string;
  assigned_by: string | null;
  assigned_at: string;
  email?: string;
  full_name?: string;
}

export interface InternalInvitation {
  id: string;
  email: string;
  role_id: string;
  role_code?: string;
  role_name?: string;
  invited_by: string;
  invitation_token: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
}

export interface StaffReferralAchievement {
  id: string;
  plan_id: string;
  plan_code?: string;
  employee_profile_id: string;
  employee_email?: string;
  target_kind: 'BUYER_ORGANIZATION' | 'SUPPLIER';
  referred_organization_id: string | null;
  referred_supplier_id: string | null;
  target_name?: string;
  referral_code: string;
  status: 'RECORDED' | 'AUTHORIZED' | 'SETTLED' | 'REJECTED';
  awarded_amount_inr: number | null;
  authorized_by: string | null;
  authorized_at: string | null;
  settled_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  payout?: StaffReferralPayout | null;
}

export interface StaffReferralPayout {
  id: string;
  achievement_id: string;
  employee_profile_id: string;
  payout_amount_inr: number;
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
  finance_reference_id: string | null;
  reconciliation_evidence: Record<string, unknown> | null;
  processed_by: string | null;
  processed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
}

export async function fetchInternalRoles(): Promise<InternalRole[]> {
  const { data, error } = await supabase
    .from('internal_roles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[InternalOps] fetchInternalRoles error:', error.message);
    return [];
  }
  return data || [];
}

export async function fetchInternalInvitations(): Promise<InternalInvitation[]> {
  const { data, error } = await supabase
    .from('internal_invitations')
    .select('*, internal_roles(code, name)')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[InternalOps] fetchInternalInvitations error:', error.message);
    return [];
  }
  return (data || []).map((row: any) => ({
    ...row,
    role_code: row.internal_roles?.code,
    role_name: row.internal_roles?.name,
  }));
}

export async function createInternalInvitation(
  email: string,
  roleId: string,
): Promise<{ ok: boolean; invitation?: InternalInvitation; error?: string }> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return { ok: false, error: 'Unauthenticated' };

  const token = `inv_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // Strictly 48 hours

  const { data, error } = await supabase
    .from('internal_invitations')
    .insert({
      email: email.trim().toLowerCase(),
      role_id: roleId,
      invited_by: user.id,
      invitation_token: token,
      expires_at: expiresAt.toISOString(),
      status: 'PENDING',
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, invitation: data };
}

export async function revokeInternalInvitation(
  invitationId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return { ok: false, error: 'Unauthenticated' };

  const { error } = await supabase
    .from('internal_invitations')
    .update({
      status: 'REVOKED',
      revoked_by: user.id,
      revoked_at: new Date().toISOString(),
      revocation_reason: reason.trim(),
    })
    .eq('id', invitationId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchStaffReferralAchievements(): Promise<StaffReferralAchievement[]> {
  const { data, error } = await supabase
    .from('internal_referral_achievements')
    .select(`
      *,
      internal_referral_plans(code),
      internal_referral_payouts(*)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[InternalOps] fetchStaffReferralAchievements error:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    ...row,
    plan_code: row.internal_referral_plans?.code,
    payout: Array.isArray(row.internal_referral_payouts)
      ? row.internal_referral_payouts[0] ?? null
      : row.internal_referral_payouts ?? null,
  }));
}

export async function authorizeStaffReferral(
  achievementId: string,
  amountInr?: number,
): Promise<{ ok: boolean; error?: string; result?: any }> {
  const { data, error } = await supabase.rpc('authorize_staff_referral_achievement', {
    p_achievement_id: achievementId,
    p_amount_inr: amountInr ?? null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, result: data };
}

export async function rejectStaffReferral(
  achievementId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; result?: any }> {
  const { data, error } = await supabase.rpc('reject_staff_referral_achievement', {
    p_achievement_id: achievementId,
    p_reason: reason.trim(),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, result: data };
}

export async function processStaffPayout(
  payoutId: string,
  utr: string,
  evidence: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; result?: any }> {
  const { data, error } = await supabase.rpc('process_staff_referral_payout', {
    p_payout_id: payoutId,
    p_finance_reference_id: utr.trim(),
    p_reconciliation_evidence: evidence,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, result: data };
}

export async function cancelStaffPayout(
  payoutId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; result?: any }> {
  const { data, error } = await supabase.rpc('cancel_staff_referral_payout', {
    p_payout_id: payoutId,
    p_reason: reason.trim(),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, result: data };
}
