import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  isSuperAdminProfile,
  resolveBuyerOnboardingWarmingScope,
  resolveForceRefreshAuthorization,
  resolveRecoveryAdminAuthorization,
} from '../../../../packages/services/src/discovery/location-pin-coverage-request-auth.ts';
import { PIN_ONLY_WARMING_CATEGORY } from '../../../../packages/domain/src/gis/google-places-category-search-terms.ts';
import { isExactServiceRoleBearer } from '../../../../packages/services/src/discovery/location-pin-coverage-request-auth.ts';

export function isLocationCoverageWorkerRequest(req: Request): boolean {
  return isExactServiceRoleBearer(
    req.headers.get('Authorization'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

export async function authorizeLocationCoverageRecoveryAdmin(
  req: Request,
  client: SupabaseClient,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return resolveRecoveryAdminAuthorization({ isAuthenticated: false, isSuperAdmin: false });

  const { data: userData, error: userErr } = await client.auth.getUser(jwt);
  if (userErr || !userData?.user) return resolveRecoveryAdminAuthorization({ isAuthenticated: false, isSuperAdmin: false });

  const { data: profile } = await client
    .from('profiles')
    .select('email, is_founder, is_platform_admin')
    .or(`auth_user_id.eq.${userData.user.id},id.eq.${userData.user.id}`)
    .maybeSingle();
  return resolveRecoveryAdminAuthorization({
    isAuthenticated: true,
    isSuperAdmin: isSuperAdminProfile(profile as Record<string, unknown> | null, userData.user.email),
  });
}

export async function authorizeLocationPinCoverageRequest(
  req: Request,
  client: SupabaseClient,
  body: {
    forceRefresh?: boolean;
    executeDiscovery?: boolean;
    discoveryContext?: string;
    signupRequestId?: string;
    city?: string;
    pincode?: string;
    category?: string;
  },
): Promise<
  | {
      ok: true;
      effectiveForceRefresh: boolean;
      scope?: { state: string; city: string; pincode: string; category: string; discoveryContext: 'BUYER_ONBOARDING' };
    }
  | { ok: false; status: number; error: string }
> {
  const executeDiscovery = body.executeDiscovery !== false;
  if (!executeDiscovery) {
    return { ok: true, effectiveForceRefresh: false };
  }

  if (body.discoveryContext === 'BUYER_ONBOARDING') {
    if (body.forceRefresh || body.category !== PIN_ONLY_WARMING_CATEGORY) {
      return { ok: false, status: 403, error: 'Buyer onboarding may request PIN-only warming without force refresh' };
    }
    const requestId = body.signupRequestId?.trim() ?? '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return { ok: false, status: 401, error: 'A valid buyer signup request is required' };
    }

    const { data: signup, error } = await client
      .from('signup_requests')
      .select('side, status, coverage_city, coverage_pincode')
      .eq('id', requestId)
      .maybeSingle();
    if (error) return { ok: false, status: 503, error: 'Buyer signup request could not be verified' };
    const warming = resolveBuyerOnboardingWarmingScope({ ...body, signup });
    if (!warming.ok) return warming;

    return {
      ok: true,
      effectiveForceRefresh: false,
      scope: warming.scope,
    };
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
