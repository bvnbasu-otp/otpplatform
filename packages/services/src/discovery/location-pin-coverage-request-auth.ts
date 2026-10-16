import { PIN_ONLY_WARMING_CATEGORY } from '../../../domain/src/gis/google-places-category-search-terms.ts';

export function isExactServiceRoleBearer(authorization: string | null, serviceRoleKey: string): boolean {
  return Boolean(serviceRoleKey) && authorization === `Bearer ${serviceRoleKey}`;
}

export function resolveRecoveryAdminAuthorization(input: {
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
}): { ok: true } | { ok: false; status: number; error: string } {
  if (!input.isAuthenticated) return { ok: false, status: 401, error: 'Authentication required' };
  if (!input.isSuperAdmin) return { ok: false, status: 403, error: 'SuperAdmin authorization required' };
  return { ok: true };
}

export interface ForceRefreshAuthInput {
  requestedForceRefresh: boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
}

export interface ForceRefreshAuthResult {
  ok: boolean;
  effectiveForceRefresh: boolean;
  httpStatus?: number;
  error?: string;
}

/**
 * Server-side forceRefresh policy: request body flag is not authorization.
 */
export function resolveForceRefreshAuthorization(input: ForceRefreshAuthInput): ForceRefreshAuthResult {
  if (!input.isAuthenticated) {
    return {
      ok: false,
      effectiveForceRefresh: false,
      httpStatus: 401,
      error: 'Authentication required for location coverage discovery',
    };
  }
  if (input.requestedForceRefresh && !input.isSuperAdmin) {
    return {
      ok: false,
      effectiveForceRefresh: false,
      httpStatus: 403,
      error: 'forceRefresh requires SuperAdmin authorization',
    };
  }
  return {
    ok: true,
    effectiveForceRefresh: Boolean(input.isSuperAdmin && input.requestedForceRefresh),
  };
}

export type BuyerOnboardingSignup = {
  side?: unknown;
  status?: unknown;
  coverage_city?: unknown;
  coverage_pincode?: unknown;
} | null;

export function resolveBuyerOnboardingWarmingScope(input: {
  forceRefresh?: boolean;
  category?: string;
  signupRequestId?: string;
  city?: string;
  pincode?: string;
  signup: BuyerOnboardingSignup;
}):
  | {
      ok: true;
      scope: { state: string; city: string; pincode: string; category: string; discoveryContext: 'BUYER_ONBOARDING' };
    }
  | { ok: false; status: number; error: string } {
  if (input.forceRefresh || input.category !== PIN_ONLY_WARMING_CATEGORY) {
    return { ok: false, status: 403, error: 'Buyer onboarding may request PIN-only warming without force refresh' };
  }
  const requestId = input.signupRequestId?.trim() ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return { ok: false, status: 401, error: 'A valid buyer signup request is required' };
  }

  const signup = input.signup;
  const storedCity = typeof signup?.coverage_city === 'string' ? signup.coverage_city.trim() : '';
  const storedPincode = typeof signup?.coverage_pincode === 'string' ? signup.coverage_pincode.trim() : '';
  const normalizeCity = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (
    signup?.side !== 'BUYER' ||
    signup.status === 'REJECTED' ||
    !/^\d{6}$/.test(storedPincode) ||
    storedPincode !== input.pincode?.trim() ||
    !storedCity ||
    normalizeCity(storedCity) !== normalizeCity(input.city ?? '')
  ) {
    return { ok: false, status: 403, error: 'Buyer signup location does not match the warming request' };
  }

  return {
    ok: true,
    scope: {
      state: '',
      city: storedCity,
      pincode: storedPincode,
      category: PIN_ONLY_WARMING_CATEGORY,
      discoveryContext: 'BUYER_ONBOARDING',
    },
  };
}

export function isVitestMockDiscoveryAllowed(): boolean {
  return process.env.VITEST === 'true';
}

/**
 * Exact emails already treated as SuperAdmin by OTP.
 * Web `SUPERADMIN_EMAILS` (static entries) plus `private.is_platform_admin()` /
 * `private.is_founder()` email checks in migration 00179.
 * `VITE_FOUNDER_EMAIL` is client configuration and is not part of this server list.
 */
const EXACT_SUPERADMIN_EMAILS = new Set<string>([
  'admin@otp.test',
  'bvnbasu@gmail.com',
  'ops@otp.test',
  'superadmin@otp.test',
  'admin@otp.ai',
  'ops@otp.ai',
  'admin@procureos.test',
  'founder@otp.test',
]);

export interface SuperAdminProfileClaims {
  is_founder?: unknown;
  is_platform_admin?: unknown;
  email?: unknown;
}

/**
 * Coverage SuperAdmin check. Strictly checks authoritative profile claims.
 * Email strings alone MUST NOT confer superadmin authority.
 */
export function isSuperAdminProfile(
  profile: SuperAdminProfileClaims | Record<string, unknown> | null | undefined,
  _email?: string | null,
): boolean {
  return profile?.is_founder === true || profile?.is_platform_admin === true;
}
