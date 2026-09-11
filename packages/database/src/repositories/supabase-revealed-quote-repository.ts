import type { TypedSupabaseClient } from '../client/supabase-client';
import { mapRevealedQuoteRow } from '../mappers/revealed-quote-mapper';
import type { RevealedQuoteRepository } from './interfaces';

export class SupabaseRevealedQuoteRepository implements RevealedQuoteRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async findByRfqId(rfqId: string) {
    const { data, error } = await this.client
      .from('quotes_revealed')
      .select('*')
      .eq('rfq_id', rfqId);

    if (error) {
      throw new Error(`quotes_revealed query failed: ${error.message}`);
    }

    return (data ?? []).map(mapRevealedQuoteRow);
  }
}
