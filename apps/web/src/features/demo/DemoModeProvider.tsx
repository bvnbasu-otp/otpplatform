import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth';
import { fetchDemoStatus, fetchMyDemoContext } from './api/demo';
import { DemoModeContext } from './hooks/use-demo-mode';
import type { DemoContext as DemoIdentity, DemoStatus } from './types/demo';

const OFF: DemoStatus = { enabled: false, runId: null, lastResetAt: null };

/**
 * Asks the database whether this is a demo, once.
 *
 * The status is fetched before sign-in too, because the login screen offers
 * quick-login only when demo mode is on. The identity half needs a session, so
 * it is refetched whenever the session changes — after a reset the run id moves
 * and every screen wants to know.
 */
export function DemoModeProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<DemoStatus>(OFF);
  const [identity, setIdentity] = useState<DemoIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const next = await fetchDemoStatus();
    setStatus(next);
    setIdentity(next.enabled && user ? await fetchMyDemoContext() : null);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  const value = useMemo(
    () => ({ status, identity, isLoading: authLoading || isLoading, refresh: load }),
    [status, identity, authLoading, isLoading, load],
  );

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}
