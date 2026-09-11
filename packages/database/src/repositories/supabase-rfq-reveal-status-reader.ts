import type { TypedSupabaseClient } from '../client/supabase-client';
import type { RfqRevealStatusReader } from './interfaces';

export class SupabaseRfqRevealStatusReader implements RfqRevealStatusReader {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getRevealStatus(rfqId: string) {
    const { data, error } = await this.client
      .from('rfqs')
      .select('reveal_status')
      .eq('id', rfqId)
      .maybeSingle();

    if (error) {
      throw new Error(`rfqs reveal_status query failed: ${error.message}`);
    }

    if (!data?.reveal_status) return null;
    return data.reveal_status as 'PROTECTED' | 'REVEALED' | 'BLIND';
  }
}
