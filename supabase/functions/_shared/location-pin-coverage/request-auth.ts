import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { resolveForceRefreshAuthorization } from '../../../../packages/services/src/discovery/location-pin-coverage-request-auth.ts';

function isSuperAdminProfile(profile: Record<string, unknown> | null, email?: string | null): boolean {
  if (profile?.is_founder === true || profile?.is_platform_admin === true) {
    return true;
  }
  const normalized = (profile?.email as string | undefined)?.trim().toLowerCase() ?? email?.trim().toLowerCase();
  if (!normalized) return false;
  return normalized === 'admin@otp.test' || normalized === 'ops@otp.test' || normalized.includes('founder');
}

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
