import type { TypedSupabaseClient } from '../client/supabase-client';
import type { BlindViewRepositories } from './interfaces';
import { SupabaseBlindInvitationRepository } from './supabase-blind-invitation-repository';
import { SupabaseBlindQuoteRepository } from './supabase-blind-quote-repository';
import { SupabaseManagerInvitationRepository } from './supabase-manager-invitation-repository';
import { SupabaseRevealedQuoteRepository } from './supabase-revealed-quote-repository';
import { SupabaseRfqRevealStatusReader } from './supabase-rfq-reveal-status-reader';

export function createBlindViewRepositories(
  client: TypedSupabaseClient,
): BlindViewRepositories & { rfqRevealStatus: SupabaseRfqRevealStatusReader } {
  return {
    identityProtectedQuotes: new SupabaseBlindQuoteRepository(client),
    revealedQuotes: new SupabaseRevealedQuoteRepository(client),
    identityProtectedInvitations: new SupabaseBlindInvitationRepository(client),
    managerInvitations: new SupabaseManagerInvitationRepository(client),
    rfqRevealStatus: new SupabaseRfqRevealStatusReader(client),
  };
}

export { SupabaseBlindQuoteRepository, SupabaseBlindQuoteRepository as SupabaseIdentityProtectedQuoteRepository } from './supabase-blind-quote-repository';
export { SupabaseRevealedQuoteRepository } from './supabase-revealed-quote-repository';
export { SupabaseBlindInvitationRepository } from './supabase-blind-invitation-repository';
export { SupabaseManagerInvitationRepository } from './supabase-manager-invitation-repository';
export { SupabaseRfqRevealStatusReader } from './supabase-rfq-reveal-status-reader';
export { SupabaseBuyerAddressRepository } from './supabase-buyer-address-repository';
export type { BuyerAddressRepository } from './supabase-buyer-address-repository';
