import { useMemo, useCallback } from 'react';
import { useRoleContext } from '@/features/roles/hooks/use-role-context';
import {
  evaluateWebAuthorization,
  type WebAuthorizationState,
  type WebAuthorizationPersona,
} from './canonical-auth';

export interface UseCanonicalAuthResult {
  auth: WebAuthorizationState;
  rawContext: ReturnType<typeof useRoleContext>['context'];
  isLoading: boolean;
  refresh: () => Promise<void>;
  switchOrganization: (orgId: string) => Promise<{ ok: boolean; error?: string }>;
  switchRole: (code: string) => Promise<{ ok: boolean; error?: string }>;
  switchContextToIndividual: () => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Authoritative React hook providing consolidated 13-stage authorization state
 * and multi-context switching utilities with zero authority bleed.
 */
export function useCanonicalAuth(): UseCanonicalAuthResult {
  const { context, isLoading, refresh, switchTo, switchOrg } = useRoleContext();

  const auth = useMemo<WebAuthorizationState>(() => {
    return evaluateWebAuthorization(context);
  }, [context]);

  const switchContextToIndividual = useCallback(async () => {
    const personalOrg = context.organizations.find(
      (o) => o.isPersonal || o.orgType?.toUpperCase() === 'INDIVIDUAL'
    );
    if (personalOrg) {
      return switchOrg(personalOrg.id);
    }
    // Fallback switch to default role
    return switchTo('OWNER');
  }, [context.organizations, switchOrg, switchTo]);

  return {
    auth,
    rawContext: context,
    isLoading,
    refresh,
    switchOrganization: switchOrg,
    switchRole: switchTo,
    switchContextToIndividual,
  };
}
