import type { TypedSupabaseClient } from '../client/supabase-client';
import { mapManagerInvitationRow } from '../mappers/manager-invitation-mapper';
import type { ManagerInvitationRepository } from './interfaces';

export class SupabaseManagerInvitationRepository
  implements ManagerInvitationRepository
{
  constructor(private readonly client: TypedSupabaseClient) {}

  async findByRfqId(rfqId: string) {
    const { data, error } = await this.client
      .from('rfq_invitations_manager')
      .select('*')
      .eq('rfq_id', rfqId);

    if (error) {
      throw new Error(`rfq_invitations_manager query failed: ${error.message}`);
    }

    return (data ?? []).map(mapManagerInvitationRow);
  }
}
