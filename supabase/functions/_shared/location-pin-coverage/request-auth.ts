import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  isSuperAdminProfile,
  resolveForceRefreshAuthorization,
} from '../../../../packages/services/src/discovery/location-pin-coverage-request-auth.ts';

export async function authorizeLocationPinCoverageRequest(
  req: Request,
  client: SupabaseClient,
  body: { forceRefresh?: boolean; executeDiscovery?: boolean },
): Promise<
  | { ok: true; effectiveForceRefresh: boolean }
  | { ok: false; status: number; error: string }
> {
  const executeDiscovery = body.executeDiscovery !== false;
  if (!executeDiscovery) {
    return { ok: true, effectiveForceRefresh: false };
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return { ok: false, status: 401, error: 'Authentication required for discovery' };
  }

  const { data: userData, error: userErr } = await client.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: 'Authentication required for discovery' };
  }

  const { data: profile } = await client
    .from('profiles')
    .select('email, is_founder, is_platform_admin')
    .or(`auth_user_id.eq.${userData.user.id},id.eq.${userData.user.id}`)
    .maybeSingle();

  const isSuperAdmin = isSuperAdminProfile(profile as Record<string, unknown> | null, userData.user.email);
  const authorizedRefresh = resolveForceRefreshAuthorization({
    requestedForceRefresh: Boolean(body.forceRefresh),
    isAuthenticated: true,
    isSuperAdmin,
  });
  if (!authorizedRefresh.ok) {
    return {
      ok: false,
      status: authorizedRefresh.httpStatus ?? 403,
      error: authorizedRefresh.error ?? 'Forbidden',
    };
  }

  return { ok: true, effectiveForceRefresh: authorizedRefresh.effectiveForceRefresh };
}

/**
 * Operational phone on the coverage roster is SuperAdmin-only.
 * Coverage reads (executeDiscovery false) stay open for counts and names;
 * the phone field is applied separately from this viewer check.
 */
export async function resolveLocationPinCoveragePhoneViewer(
  req: Request,
  client: SupabaseClient,
): Promise<{ isSuperAdmin: boolean }> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return { isSuperAdmin: false };

  const { data: userData, error: userErr } = await client.auth.getUser(jwt);
  if (userErr || !userData?.user) return { isSuperAdmin: false };

  const { data: profile } = await client
    .from('profiles')
    .select('email, is_founder, is_platform_admin')
    .or(`auth_user_id.eq.${userData.user.id},id.eq.${userData.user.id}`)
    .maybeSingle();

  return {
    isSuperAdmin: isSuperAdminProfile(profile as Record<string, unknown> | null, userData.user.email),
  };
}
