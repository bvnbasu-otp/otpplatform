export { AuthProvider, useAuth } from './AuthProvider';
export { RequireAuth } from './RequireAuth';
export { ProtectedRoute, clearSensitiveClientState } from './ProtectedRoute';
export type { AllowedRole, ProtectedRouteProps } from './ProtectedRoute';
export { usePortalRole } from './use-portal-role';
export { usePresenceHeartbeat } from './usePresenceHeartbeat';
export { fetchCurrentProfile, resolvePortalRole } from './user-role';
export type { PortalRole, UserProfile } from './user-role';
