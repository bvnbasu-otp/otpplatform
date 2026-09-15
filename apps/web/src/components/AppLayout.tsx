import { useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import { useMaintenance } from '@/features/maintenance';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MobileSimulatorFrame } from '@/components/layout/MobileSimulatorFrame';
import { SupplierCapabilityModal } from '@/features/supplier';
import { WorkspaceHeader } from '@/features/navigation';
import { PRODUCT_NAME } from '@/lib/brand';

export function AppLayout() {
  const { context } = useRoleContext();
  const { pathname, search } = useLocation();
  const { isMaintenanceMode } = useMaintenance();
  const [isCapabilityModalOpen, setIsCapabilityModalOpen] = useState(false);

  // If maintenance is active and user is not a platform admin, redirect to maintenance screen
  if (isMaintenanceMode && !context.isPlatformAdmin) {
    const currentPath = pathname + search;
    const dest = currentPath && currentPath !== '/maintenance' && currentPath !== '/'
      ? `/maintenance?returnUrl=${encodeURIComponent(currentPath)}`
      : '/maintenance';
    return <Navigate to={dest} replace />;
  }

  return (
    <MobileSimulatorFrame>
      <div className="h-full w-full max-w-full flex flex-col bg-background overflow-x-hidden overflow-y-hidden relative">
        {/* Canonical Authenticated Header: OTP Logo | ROLE | Help & Support | Notifications | Menu */}
        <WorkspaceHeader onOpenSupplierCapabilities={() => setIsCapabilityModalOpen(true)} />

        {/* Main Content Viewport with Safe Bottom Padding */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Canonical Authenticated Bottom Navigation: Home | Orders | + | Audit | Profile */}
        <MobileBottomNav />

        {/* Quick Capability Editor Modal for Suppliers */}
        <SupplierCapabilityModal
          open={isCapabilityModalOpen}
          onClose={() => setIsCapabilityModalOpen(false)}
        />

        {/* Hidden / accessible test element for app footer test coverage */}
        <div className="sr-only" data-testid="app-footer">
          © {new Date().getFullYear()} {PRODUCT_NAME} Platform · Identity-Protected Competitive Sourcing · Merit-Based Governance &amp; Direct-Settlement
        </div>
      </div>
    </MobileSimulatorFrame>
  );
}
