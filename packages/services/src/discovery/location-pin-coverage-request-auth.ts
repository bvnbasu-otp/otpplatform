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
