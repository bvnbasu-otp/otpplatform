import type { TypedSupabaseClient } from '../client/supabase-client';
import { mapBlindInvitationRow } from '../mappers/blind-invitation-mapper';
import type { BlindInvitationRepository } from './interfaces';

export class SupabaseBlindInvitationRepository
  implements BlindInvitationRepository
{
  constructor(private readonly client: TypedSupabaseClient) {}

  async findByRfqId(rfqId: string) {
    const { data, error } = await this.client
      .from('rfq_invitations_blind')
      .select('*')
      .eq('rfq_id', rfqId);

    if (error) {
      throw new Error(`rfq_invitations_blind query failed: ${error.message}`);
    }

    return (data ?? []).map(mapBlindInvitationRow);
  }
}
