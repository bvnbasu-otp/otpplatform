import {
  createBlindViewRepositories,
  createSupabaseClient,
  type TypedSupabaseClient,
} from '@otp/database';
import type { BlindViewPorts } from '../interfaces/blind-view-ports';

/**
 * Wire Supabase blind view repositories for production / live integration.
 * Client must carry the end-user JWT so RLS on underlying tables applies.
 */
export function createSupabaseBlindViewPorts(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
): BlindViewPorts {
  const client = createSupabaseClient(supabaseUrl, anonKey, { accessToken });
  return adaptSupabaseClient(client);
}

export function adaptSupabaseClient(client: TypedSupabaseClient): BlindViewPorts {
  const repos = createBlindViewRepositories(client);
  return {
    blindQuotes: repos.identityProtectedQuotes,
    revealedQuotes: repos.revealedQuotes,
    blindInvitations: repos.identityProtectedInvitations,
    managerInvitations: repos.managerInvitations,
    rfqRevealStatus: repos.rfqRevealStatus,
  };
}
