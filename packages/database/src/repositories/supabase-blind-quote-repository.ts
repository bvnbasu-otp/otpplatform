import type { TypedSupabaseClient } from '../client/supabase-client';
import { mapIdentityProtectedQuoteRow } from '../mappers/blind-quote-mapper';
import type { IdentityProtectedQuoteRepository } from './interfaces';

export class SupabaseIdentityProtectedQuoteRepository implements IdentityProtectedQuoteRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async findByRfqId(rfqId: string) {
    const { data, error } = await this.client
      .from('quotes_identity_protected')
      .select('*')
      .eq('rfq_id', rfqId);

    if (error) {
      throw new Error(`quotes_identity_protected query failed: ${error.message}`);
    }

    return (data ?? []).map(mapIdentityProtectedQuoteRow);
  }
}

// Legacy alias
export const SupabaseBlindQuoteRepository = SupabaseIdentityProtectedQuoteRepository;
