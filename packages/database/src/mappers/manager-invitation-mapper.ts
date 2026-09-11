import type { InviteStatus } from '@otp/domain';
import type { Database } from '../generated/supabase';

export type RfqInvitationsManagerRow =
  Database['public']['Views']['rfq_invitations_manager']['Row'];

export interface ManagerInvitation {
  invitationId: string;
  rfqId: string;
  anonymousLabel: string;
  status: InviteStatus;
  matchScore: number | null;
  matchReasons: string[] | null;
  invitedAt: string;
  viewedAt: string | null;
  declinedAt: string | null;
  supplierId: string | null;
}

export function mapManagerInvitationRow(
  row: RfqInvitationsManagerRow,
): ManagerInvitation {
  if (!row.invitation_id || !row.rfq_id) {
    throw new Error('rfq_invitations_manager row missing ids');
  }

  const reasons = row.match_reasons;
  let matchReasons: string[] | null = null;
  if (Array.isArray(reasons)) {
    matchReasons = reasons.map(String);
  } else if (typeof reasons === 'string') {
    try {
      const parsed = JSON.parse(reasons) as unknown;
      matchReasons = Array.isArray(parsed) ? parsed.map(String) : [reasons];
    } catch {
      matchReasons = [reasons];
    }
  }

  return {
    invitationId: row.invitation_id,
    rfqId: row.rfq_id,
    anonymousLabel: row.anonymous_label ?? 'Unknown',
    status: (row.status ?? 'INVITED') as InviteStatus,
    matchScore: row.match_score ?? null,
    matchReasons,
    invitedAt: row.invited_at ?? new Date().toISOString(),
    viewedAt: row.viewed_at ?? null,
    declinedAt: row.declined_at ?? null,
    supplierId: row.supplier_id ?? null,
  };
}
