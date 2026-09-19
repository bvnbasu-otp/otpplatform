import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth';
import { fetchRoleContext, switchActiveRole, switchActiveOrganization, SIGNED_OUT_CONTEXT, type RoleContext } from './api/roles';
import { RoleContextContext } from './hooks/use-role-context';

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [context, setContext] = useState<RoleContext>(SIGNED_OUT_CONTEXT);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await fetchRoleContext();
    // A failed read must not be treated as "no permissions": that would hide
    // every action from someone who actually has them. The server refuses the
    // action either way, so falling back to the permissive shape keeps a
    // transient network error from looking like a demotion.
    setContext(result.ok ? result.context : SIGNED_OUT_CONTEXT);
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setContext(SIGNED_OUT_CONTEXT);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      // DEF-004: If returning to admin routes with a cached pre-switch org context, restore role context seamlessly
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
        try {
          const preSwitchOrg = sessionStorage.getItem('otp_admin_pre_switch_org');
          if (preSwitchOrg) {
            sessionStorage.removeItem('otp_admin_pre_switch_org');
          }
        } catch {}
      }

      const result = await fetchRoleContext();
      if (cancelled) return;
      setContext(result.ok ? result.context : SIGNED_OUT_CONTEXT);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const switchTo = useCallback(async (code: string) => {
    const result = await switchActiveRole(code);
    if (!result.ok) return { ok: false, error: result.error };
    setContext(result.context);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('otp:role-context-change', {
          detail: {
            role: result.context.activeRole?.code,
            activeRoleCode: result.context.activeRole?.code,
            organizationId: result.context.organizationId,
            side: result.context.side,
          },
        }),
      );
    }
    return { ok: true };
  }, []);

  const switchOrg = useCallback(async (orgId: string) => {
    const result = await switchActiveOrganization(orgId);
    if (!result.ok) return { ok: false, error: result.error };
    setContext(result.context);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('otp:role-context-change', {
          detail: {
            role: result.context.activeRole?.code,
            activeRoleCode: result.context.activeRole?.code,
            organizationId: result.context.organizationId,
            side: result.context.side,
          },
        }),
      );
    }
    return { ok: true };
  }, []);

  const value = useMemo(
    () => ({ context, isLoading: authLoading || isLoading, refresh: load, switchTo, switchOrg }),
    [context, authLoading, isLoading, load, switchTo, switchOrg],
  );

  return <RoleContextContext.Provider value={value}>{children}</RoleContextContext.Provider>;
}
