import React from 'react';
import { Navigate } from 'react-router-dom';
import { usePortalRole } from '@/features/auth/use-portal-role';
import { useRoleContext } from '@/features/roles';
import { useMaintenance } from '@/features/maintenance';
import { DashboardPage } from './DashboardPage';
import { SupplierDashboardPage } from './SupplierDashboardPage';

export function HomePage() {
  const { role, isLoading: portalLoading } = usePortalRole();
  const { context, isLoading: contextLoading } = useRoleContext();
  const { isMaintenanceMode } = useMaintenance();

  const isSupplier = role === 'supplier' || context.side === 'SUPPLIER';
  const isAdmin = role === 'admin' || context.isPlatformAdmin;

  if (portalLoading && contextLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading portal…
      </div>
    );
  }

  // Super Admins are always directed to the SuperAdmin Console
  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  // Non-admins are redirected to the "Men at Work" comic puzzle page during maintenance
  if (isMaintenanceMode === true) {
    const currentPath = window.location.pathname + window.location.search;
    const dest = currentPath && currentPath !== '/maintenance' && currentPath !== '/'
      ? `/maintenance?returnUrl=${encodeURIComponent(currentPath)}`
      : '/maintenance';
    return <Navigate to={dest} replace />;
  }

  if (isSupplier) {
    return <SupplierDashboardPage />;
  }

  return <DashboardPage />;
}
