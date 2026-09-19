import { createContext, useContext } from 'react';
import { SIGNED_OUT_CONTEXT, type RoleContext } from '../api/roles';

export interface RoleContextState {
  context: RoleContext;
  isLoading: boolean;
  /** Re-reads the context after onboarding or a switch. */
  refresh: () => Promise<void>;
  /** Switches the role in force, and with it what this person may do. */
  switchTo: (code: string) => Promise<{ ok: boolean; error?: string }>;
  /** Switches the active organization context (e.g. Personal vs Society/Enterprise). */
  switchOrg: (orgId: string) => Promise<{ ok: boolean; error?: string }>;
  /** Switches the active portal side between BUYER and SUPPLIER. */
  switchSide: (side: import('../api/roles').PortalSide) => Promise<{ ok: boolean; error?: string }>;
}

export const RoleContextContext = createContext<RoleContextState>({
  context: SIGNED_OUT_CONTEXT,
  isLoading: true,
  refresh: async () => {},
  switchTo: async () => ({ ok: false, error: 'Not ready' }),
  switchOrg: async () => ({ ok: false, error: 'Not ready' }),
  switchSide: async () => ({ ok: false, error: 'Not ready' }),
});

/**
 * The signed-in person's role, held once for the whole app.
 *
 * In context rather than fetched per screen, because the header badge, the
 * navigation, the onboarding gate and every action button all need the same
 * answer. Asking four times invites four answers during the moment after a
 * switch, which is exactly when being wrong is most visible.
 */
export function useRoleContext(): RoleContextState {
  return useContext(RoleContextContext);
}
