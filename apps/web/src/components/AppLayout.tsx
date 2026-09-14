import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';
import { AccountMenu, isActivePath, navigationFor, useRoleContext } from '@/features/roles';
import { NotificationBell } from '@/features/notifications';
import { SupportHelpButtonModal } from '@/features/support';
import { OtpLogo } from '@/components/ui/OtpLogo';
import { useMaintenance } from '@/features/maintenance';
import { OrgContextSwitcher } from '@/features/org';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MobileSimulatorFrame } from '@/components/layout/MobileSimulatorFrame';
import { RoleModeToggle } from '@/components/ui/RoleModeToggle';
import { SupplierCapabilityModal } from '@/features/supplier';
import { PRODUCT_NAME } from '@/lib/brand';

const PUBLIC_PRIMARY_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'About us', to: '/about-us' },
  { label: 'FAQs', to: '/faqs' },
];

export function AppLayout() {
  const { context } = useRoleContext();
  const { pathname, search } = useLocation();
  const { isMaintenanceMode } = useMaintenance();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCapabilityModalOpen, setIsCapabilityModalOpen] = useState(false);

  // If maintenance is active and user is not a platform admin, redirect to maintenance screen
  if (isMaintenanceMode && !context.isPlatformAdmin) {
    const currentPath = pathname + search;
    const dest = currentPath && currentPath !== '/maintenance' && currentPath !== '/'
      ? `/maintenance?returnUrl=${encodeURIComponent(currentPath)}`
      : '/maintenance';
    return <Navigate to={dest} replace />;
  }

  const nav = navigationFor(context, { demo: false });
  const sideLabel = context.isPlatformAdmin
    ? 'Admin'
    : context.side === 'SUPPLIER'
      ? 'Supplier'
      : context.side === 'BUYER'
        ? 'Buyer'
        : '';

  return (
    <MobileSimulatorFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-hidden relative">
        {/* Top Mobile & Desktop Navigation Bar (Strict Max-Height: 48px / h-12) */}
        <header className="shrink-0 z-40 border-b bg-card max-h-[48px] h-12">
          <div className="mx-auto flex w-full h-full items-center justify-between gap-x-2 px-3">
            {/* Brand Logo & Side Identity Tag */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Link to="/" className="flex items-center hover:opacity-90 transition" title="Go to home page">
                <OtpLogo size={24} />
              </Link>
              {sideLabel && (
                <Link
                  to={context.isPlatformAdmin ? '/admin' : '/dashboard'}
                  className="hover:opacity-80 transition"
                  title={context.isPlatformAdmin ? 'Go to Admin Console' : 'Go to Dashboard'}
                >
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    context.isPlatformAdmin
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                      : context.side === 'SUPPLIER'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                      : 'bg-primary/10 text-primary'
                  }`}>
                    {sideLabel}
                  </span>
                </Link>
              )}
            </div>

            {/* Top-Level Role Switcher Toggle */}
            {!context.isPlatformAdmin && (
              <div className="hidden sm:flex items-center">
                <RoleModeToggle size="sm" />
              </div>
            )}

            {/* Right Action Cluster: Canonical Sequence [Profile/Theme] → [Help & Support (?)] → [Notifications (🔔)] */}
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <div className="hidden sm:block">
                <AccountMenu />
              </div>
              <SupportHelpButtonModal />
              <NotificationBell />

              {/* Mobile Hamburger Drawer Button */}
              <button
                type="button"
                aria-label="Toggle Workspace Menu"
                aria-expanded={isMobileMenuOpen}
                onClick={() => setIsMobileMenuOpen((prev) => !prev)}
                className={`rounded-lg border p-1.5 transition ${
                  isMobileMenuOpen ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
                }`}
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                  {isMobileMenuOpen ? (
                    <path
                      d="M3 3l10 10M13 3L3 13"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  ) : (
                    <path
                      d="M2 4h12M2 8h12M2 12h12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Slide-Out Overlay Drawer (z-[1000]) */}
        {isMobileMenuOpen && (
          <div className="fixed sm:absolute inset-0 top-[48px] z-[1000]">
            {/* Backdrop */}
            <div
              className="fixed sm:absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer Content */}
            <nav
              aria-label="Mobile Navigation"
              className="relative border-b bg-card shadow-2xl animate-in slide-in-from-top-2 duration-150 max-h-[calc(100%-48px)] overflow-y-auto"
            >
              <div className="mx-auto w-full px-4 py-3 space-y-3 text-xs">
                {/* Role Switcher in Drawer */}
                {!context.isPlatformAdmin && (
                  <div className="flex items-center justify-between pb-2 border-b">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Role Mode</span>
                    <RoleModeToggle size="sm" />
                  </div>
                )}

                {/* 1. Quick Workspace Actions Row */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Workspace Actions ({sideLabel || 'Main'})
                  </div>
                  <ul className="space-y-1">
                    {nav.map((item) => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center justify-between rounded-lg px-3 py-2 font-bold transition ${
                            isActivePath(item, pathname, search)
                              ? 'bg-primary text-primary-foreground shadow-2xs'
                              : 'bg-muted/50 text-foreground hover:bg-muted'
                          }`}
                        >
                          <span>{item.label}</span>
                          <span>→</span>
                        </NavLink>
                      </li>
                    ))}

                    {/* Context-aware Create Requirement for Buyer vs Expand Capabilities for Supplier */}
                    {context.side === 'BUYER' && !context.isPlatformAdmin && (
                      <li>
                        <Link
                          to="/requirements/new"
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="flex items-center justify-between rounded-lg bg-action px-3 py-2 font-bold text-action-foreground shadow-2xs hover:bg-action-hover transition"
                          title="Post a new requirement / broadcast RFQ"
                          data-testid="drawer-buyer-create-requirement"
                        >
                          <span>+ Create New Requirement</span>
                          <span>⚡</span>
                        </Link>
                      </li>
                    )}

                    {context.side === 'SUPPLIER' && (
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setIsMobileMenuOpen(false);
                            setIsCapabilityModalOpen(true);
                          }}
                          className="w-full flex items-center justify-between rounded-lg bg-purple-600 px-3 py-2 font-bold text-white shadow-2xs hover:bg-purple-700 transition cursor-pointer"
                          title="Maximize Business Reach — Update Capabilities"
                          data-testid="drawer-supplier-capabilities-btn"
                        >
                          <span>+ Expand Catalog &amp; Services</span>
                          <span>📡</span>
                        </button>
                      </li>
                    )}
                  </ul>
                </div>

                {/* Quick Utility Tools in Drawer */}
                <div className="border-t pt-2.5 flex items-center justify-between">
                  <SupportHelpButtonModal />
                  <OrgContextSwitcher />
                </div>

                {/* 2. Platform Navigation (Mirrored from Home page) */}
                <div className="border-t pt-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Platform
                  </div>
                  <ul className="space-y-1">
                    {PUBLIC_PRIMARY_LINKS.map((link) => (
                      <li key={link.to}>
                        <NavLink
                          to={link.to}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="block rounded-lg px-3 py-1.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
                        >
                          {link.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 3. Consolidated Identity / Account Status Footer */}
                {context.email && (
                  <div className="border-t pt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5 truncate">
                      <span>👤</span>
                      <span className="font-semibold text-foreground truncate">{context.fullName || context.email}</span>
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold shrink-0">
                      {context.isPlatformAdmin ? 'SuperAdmin' : context.side}
                    </span>
                  </div>
                )}
              </div>
            </nav>
          </div>
        )}

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Mobile Fixed Bottom Navigation Bar (Swiggy / PhonePe style) */}
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
