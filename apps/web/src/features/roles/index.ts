export { RoleProvider } from './RoleProvider';
export { useRoleContext } from './hooks/use-role-context';
export { RequireRole } from './RequireRole';
export { RoleOnboardingPage } from './pages/RoleOnboardingPage';
export { AccountMenu } from './components/AccountMenu';
export { RoleBadge } from './components/RoleBadge';
export { PermissionChips, permissionLabel } from './components/PermissionChips';
export { RoleWorkspaceCard } from './components/RoleWorkspaceCard';
export { navigationFor, isActivePath } from './nav';
export type { NavItem } from './nav';
export {
  can,
  canVoteSomewhere,
  isReadOnly,
  hasMultipleRoles,
  hasMultipleOrganizations,
  fetchRoleCatalog,
  fetchRoleContext,
  chooseMyRole,
  switchActiveRole,
  switchActiveOrganization,
  SIGNED_OUT_CONTEXT,
} from './api/roles';
export type {
  HeldRole,
  PortalSide,
  RoleContext,
  RoleDefinition,
  RolePermission,
} from './api/roles';
