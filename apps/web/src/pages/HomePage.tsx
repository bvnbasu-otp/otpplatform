import React from 'react';
import { Navigate } from 'react-router-dom';
import { usePortalRole } from '@/features/auth/use-portal-role';
import { useMaintenance } from '@/features/maintenance';
import { DashboardPage } from './DashboardPage';
import { SupplierDashboardPage } from './SupplierDashboardPage';

export function HomePage() {
  const { role, isLoading } = usePortalRole();
  const { isMaintenanceMode } = useMaintenance();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading portal…
      </div>
    );
  }

  // Super Admins are always directed to the SuperAdmin Console
  if (role === 'admin') {
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

  if (role === 'supplier') {
    return <SupplierDashboardPage />;
  }

  return <DashboardPage />;
}
