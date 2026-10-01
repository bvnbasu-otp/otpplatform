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
 * Coverage SuperAdmin check. Profile flags and an exact allowlist email only.
 * Callers must pass the authenticated profile and JWT email, never a request body.
 */
export function isSuperAdminProfile(
  profile: SuperAdminProfileClaims | Record<string, unknown> | null | undefined,
  email?: string | null,
): boolean {
  if (profile?.is_founder === true || profile?.is_platform_admin === true) {
    return true;
  }
  const profileEmail = typeof profile?.email === 'string' ? profile.email : undefined;
  const candidate = profileEmail ?? (typeof email === 'string' ? email : undefined);
  const normalized = candidate?.trim().toLowerCase() ?? '';
  if (!normalized) return false;
  return EXACT_SUPERADMIN_EMAILS.has(normalized);
}
