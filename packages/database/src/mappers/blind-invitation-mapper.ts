import type { InviteStatus } from '@otp/domain';
import type { Database } from '../generated/supabase';

export type RfqInvitationsBlindRow =
  Database['public']['Views']['rfq_invitations_blind']['Row'];

export interface BlindInvitation {
  invitationId: string;
  rfqId: string;
  anonymousLabel: string;
  status: InviteStatus;
  invitedAt: string;
  viewedAt: string | null;
  declinedAt: string | null;
}

export type IdentityProtectedInvitation = BlindInvitation;

export function mapBlindInvitationRow(row: RfqInvitationsBlindRow): BlindInvitation {
  if (!row.invitation_id || !row.rfq_id) {
    throw new Error('rfq_invitations_blind row missing ids');
  }

  return {
    invitationId: row.invitation_id,
    rfqId: row.rfq_id,
    anonymousLabel: row.anonymous_label ?? 'Unknown',
    status: (row.status ?? 'INVITED') as InviteStatus,
    invitedAt: row.invited_at ?? new Date().toISOString(),
    viewedAt: row.viewed_at ?? null,
    declinedAt: row.declined_at ?? null,
  };
}
