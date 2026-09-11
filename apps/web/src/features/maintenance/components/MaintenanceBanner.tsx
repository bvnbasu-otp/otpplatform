import { Link, useLocation } from 'react-router-dom';
import { useMaintenance } from '../MaintenanceContext';
import { useRoleContext } from '@/features/roles';

export function MaintenanceBanner() {
  const { isMaintenanceMode, maintenanceMessage } = useMaintenance();
  const { pathname, search } = useLocation();
  const { context } = useRoleContext();

  if (!isMaintenanceMode) return null;
  if (pathname === '/maintenance') return null;

  const isSuperAdmin = Boolean(context.isPlatformAdmin);
  const currentPath = pathname + search;
  const maintenanceLink = currentPath && currentPath !== '/'
    ? `/maintenance?returnUrl=${encodeURIComponent(currentPath)}`
    : '/maintenance';

  return (
    <aside
      aria-label="System Maintenance Alert"
      data-testid="maintenance-banner"
      className="sticky top-0 z-50 w-full border-b border-amber-500/30 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 px-4 py-2.5 text-slate-950 shadow-md backdrop-blur-sm dark:border-amber-600/50 dark:from-amber-600 dark:via-amber-500 dark:to-yellow-600 dark:text-slate-950"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2.5 font-medium">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950/10 text-base shadow-xs">
            🚧
          </span>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className="font-bold uppercase tracking-wider text-[11px] sm:text-xs">
              Scheduled System Maintenance
            </span>
            <span className="hidden text-slate-950/40 sm:inline">·</span>
            <span className="text-slate-900 line-clamp-1 font-normal">
              {maintenanceMessage || 'Regular scheduled platform maintenance in progress.'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-semibold">
          {isSuperAdmin ? (
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full bg-slate-950/15 px-2 py-0.5 text-[11px] font-bold md:inline">
                🛡️ Super Admin Bypass Active
              </span>
              <Link
                to="/admin?tab=actions"
                className="inline-flex items-center gap-1 rounded-md bg-slate-950 px-3 py-1 text-xs font-bold text-amber-300 shadow-xs hover:bg-slate-900 transition"
              >
                <span>Admin Console</span>
                <span>➔</span>
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full bg-slate-950/15 px-2 py-0.5 text-[11px] font-bold md:inline">
                Demo &amp; Staging Restricted
              </span>
              <Link
                to={maintenanceLink}
                className="inline-flex items-center gap-1 rounded-md bg-slate-950 px-3 py-1 text-xs font-bold text-amber-300 shadow-xs hover:bg-slate-900 transition"
              >
                <span>View Status &amp; Games</span>
                <span>➔</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
