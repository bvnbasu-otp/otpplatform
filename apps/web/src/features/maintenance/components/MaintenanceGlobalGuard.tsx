import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMaintenance } from '../MaintenanceContext';
import { useRoleContext } from '@/features/roles';
import { captureUnsavedSession } from '../session-retention';

export function MaintenanceGlobalGuard({ children }: { children: ReactNode }) {
  const { isMaintenanceMode } = useMaintenance();
  const { context } = useRoleContext();
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = new URLSearchParams(location.search);
  const isAdminLogin = location.pathname === '/login' && searchParams.get('admin') === 'true';
  const isSuperAdmin = Boolean(context.isPlatformAdmin);
  const isMaintPage = location.pathname === '/maintenance';

  const shouldBlock = isMaintenanceMode && !isSuperAdmin && !isMaintPage && !isAdminLogin;

  useEffect(() => {
    if (shouldBlock) {
      // Capture any active or dirty form state before redirecting
      captureUnsavedSession(location.pathname + location.search);

      const currentPath = location.pathname + location.search;
      const dest = currentPath && currentPath !== '/'
        ? `/maintenance?returnUrl=${encodeURIComponent(currentPath)}`
        : '/maintenance';

      navigate(dest, { replace: true });
    }
  }, [shouldBlock, location.pathname, location.search, navigate]);

  if (shouldBlock) {
    return (
      <div
        data-testid="maintenance-redirect-guard"
        className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center text-slate-100"
      >
        <div className="space-y-4 max-w-md animate-in fade-in duration-200">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-500/30 text-3xl shadow-lg">
            🚧
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Scheduled Maintenance Active</h1>
            <p className="mt-1 text-xs text-amber-300/90 font-medium">
              Saving active session &amp; transferring directly to maintenance status…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
