import { useState } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ChangePasswordModal } from '@/features/roles/components/ChangePasswordModal';
import { ProfileEditModal } from '@/features/profile';
import { hasMultipleRoles, hasMultipleOrganizations } from '@/features/roles/api/roles';
import { SupplierCapabilityModal } from '@/features/supplier';
import { QuickRegisterModal } from '@/features/portal';
import { VoiceTextRequirementIntakeModal } from '@/features/intake';
import { RoleModeToggle } from '@/components/ui/RoleModeToggle';
import { AdminQuickActionsSheet } from '@/features/navigation';

function initials(nameOrEmail?: string | null): string {
  if (!nameOrEmail) return '?';
  const clean = nameOrEmail.trim();
  if (clean.includes(' ')) {
    const parts = clean.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }
  const name = clean.split('@')[0] ?? '';
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  return name.slice(0, 2).toUpperCase() || '?';
}

export function MobileBottomNav() {
  const { user, signOut } = useAuth();
  const { context, switchTo, switchOrg } = useRoleContext();
  const { pathname } = useLocation();

  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false);
  const [isCapabilityModalOpen, setIsCapabilityModalOpen] = useState(false);
  const [isQuickRegisterOpen, setIsQuickRegisterOpen] = useState(false);
  const [isBuyerIntakeModalOpen, setIsBuyerIntakeModalOpen] = useState(false);
  const [isAdminQuickActionsOpen, setIsAdminQuickActionsOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingOrg, setPendingOrg] = useState<string | null>(null);

  const isSupplier = context.side === 'SUPPLIER';
  const isAdmin = context.isPlatformAdmin;
  const isAuthenticated = Boolean(context.email || user?.email);

  const multiRole = hasMultipleRoles(context);
  const multiOrg = hasMultipleOrganizations(context);
  const userInitials = initials(context.fullName || user?.email);

  async function chooseRole(code: string) {
    if (code === context.activeRole?.code) {
      setIsAccountSheetOpen(false);
      return;
    }
    setPending(code);
    const result = await switchTo(code);
    setPending(null);
    if (result.ok) {
      setIsAccountSheetOpen(false);
    }
  }

  async function chooseOrg(orgId: string) {
    if (orgId === context.organizationId) {
      setIsAccountSheetOpen(false);
      return;
    }
    setPendingOrg(orgId);
    const result = await switchOrg(orgId);
    setPendingOrg(null);
    if (result.ok) {
      setIsAccountSheetOpen(false);
    }
  }

  const isPublicRoute =
    ['/', '/pricing', '/about-us', '/faqs', '/showcase', '/mobile', '/mobile-showcase', '/how-it-works', '/howitworks'].includes(pathname) ||
    pathname.startsWith('/legal');

  return (
    <>
      <nav
        aria-label="Mobile Bottom Navigation"
        className="fixed sm:absolute bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] shrink-0 select-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {isAuthenticated && !isPublicRoute ? (
          /* CANONICAL 5-TAB AUTHENTICATED WORKSPACE BOTTOM NAVIGATION: Home | Orders | + | Audit | Profile */
          <div className="flex items-center justify-around h-14 w-full max-w-md mx-auto px-2">
            {/* TAB 1: HOME */}
            <NavLink
              to={isAdmin ? '/admin' : '/dashboard'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target min-h-[48px] ${
                  isActive || pathname === '/dashboard' || (isAdmin && pathname === '/admin')
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="text-lg leading-none">🏠</span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">Home</span>
            </NavLink>

            {/* TAB 2: ORDERS */}
            <NavLink
              to={isSupplier ? '/supplier/purchase-orders' : '/purchase-orders'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target min-h-[48px] ${
                  isActive || pathname.startsWith('/purchase-orders') || pathname.startsWith('/supplier/purchase-orders') || pathname.startsWith('/supplier/work-orders')
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="text-lg leading-none">📋</span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">Orders</span>
            </NavLink>

            {/* TAB 3: CENTER ACTION '+' (Context-Aware for Buyer vs Supplier vs Admin) */}
            <div className="flex flex-col items-center justify-center flex-1 shrink-0">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setIsAdminQuickActionsOpen(true)}
                  className="relative -top-3 flex items-center justify-center w-12 h-12 rounded-full bg-purple-600 text-white shadow-lg shadow-purple-600/30 active:scale-90 transition-all duration-150 mobile-touch-target cursor-pointer hover:bg-purple-700 min-h-[48px] min-w-[48px]"
                  title="Admin Quick Operations"
                  aria-label="Admin Quick Operations"
                  data-testid="bottom-nav-admin-quick-actions"
                >
                  <span className="text-2xl font-bold leading-none select-none">+</span>
                  <span className="sr-only">Admin Quick Operations</span>
                </button>
              ) : isSupplier ? (
                <button
                  type="button"
                  onClick={() => setIsCapabilityModalOpen(true)}
                  className="relative -top-3 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-90 transition-all duration-150 mobile-touch-target cursor-pointer hover:bg-primary/90 min-h-[48px] min-w-[48px]"
                  title="Maximize Business Reach — Update Capabilities"
                  aria-label="Maximize Business Reach — Update Capabilities"
                  data-testid="bottom-nav-supplier-add-capabilities"
                >
                  <span className="text-2xl font-bold leading-none select-none">+</span>
                  <span className="sr-only">Maximize Business Reach — Update Capabilities</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsBuyerIntakeModalOpen(true)}
                  className="relative -top-3 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-90 transition-all duration-150 mobile-touch-target cursor-pointer hover:bg-primary/90 min-h-[48px] min-w-[48px]"
                  title="Post a new requirement / broadcast RFQ"
                  aria-label="Post a new requirement / broadcast RFQ"
                  data-testid="bottom-nav-buyer-create-requirement"
                >
                  <span className="text-2xl font-bold leading-none select-none">+</span>
                  <span className="sr-only">Create Requirement</span>
                </button>
              )}
            </div>

            {/* TAB 4: AUDIT (Canonical entry for Buyer, Supplier, Admin) */}
            <NavLink
              to="/audit"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target min-h-[48px] ${
                  isActive || pathname.startsWith('/audit')
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="text-lg leading-none">🛡️</span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">
                Audit
              </span>
            </NavLink>

            {/* TAB 5: PROFILE (Canonical entry for Buyer, Supplier, Admin) */}
            <NavLink
              to="/profile"
              data-testid="bottom-nav-profile"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target min-h-[48px] ${
                  isActive || pathname.startsWith('/profile')
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[9px] font-black text-primary overflow-hidden shadow-2xs border border-primary/20">
                {context.avatarUrl ? (
                  <img src={context.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  userInitials
                )}
              </span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold truncate max-w-[48px]">
                Profile
              </span>
            </NavLink>
          </div>
        ) : (
          /* PUBLIC & PRE-LOGIN STRICT 5 TABS: Home, Pricing, +, About Us, FAQs */
          <div className="flex items-center justify-around h-14 w-full max-w-md mx-auto px-2">
            {/* Tab 1: Home (/) */}
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target min-h-[48px] ${
                  isActive || pathname === '/'
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="text-lg leading-none">🏠</span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">Home</span>
            </NavLink>

            {/* Tab 2: Pricing (/pricing) */}
            <NavLink
              to="/pricing"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target min-h-[48px] ${
                  isActive
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="text-lg leading-none">💳</span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">Pricing</span>
            </NavLink>

            {/* Tab 3: + Elevated Center Button (Role & State Aware) */}
            <div className="flex flex-col items-center justify-center flex-1 shrink-0">
              {isSupplier ? (
                <button
                  type="button"
                  onClick={() => setIsCapabilityModalOpen(true)}
                  className="relative -top-3 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-90 transition-all duration-150 mobile-touch-target cursor-pointer hover:bg-primary/90 min-h-[48px] min-w-[48px]"
                  title="Maximize Business Reach — Update Capabilities"
                  aria-label="Maximize Business Reach — Update Capabilities"
                  data-testid="bottom-nav-supplier-add-capabilities"
                >
                  <span className="text-2xl font-bold leading-none select-none">+</span>
                  <span className="sr-only">Maximize Business Reach — Update Capabilities</span>
                </button>
              ) : user ? (
                <button
                  type="button"
                  onClick={() => setIsBuyerIntakeModalOpen(true)}
                  className="relative -top-3 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-90 transition-all duration-150 mobile-touch-target cursor-pointer hover:bg-primary/90 min-h-[48px] min-w-[48px]"
                  title="Post a new requirement / broadcast RFQ"
                  aria-label="Post a new requirement / broadcast RFQ"
                  data-testid="bottom-nav-buyer-create-requirement"
                >
                  <span className="text-2xl font-bold leading-none select-none">+</span>
                  <span className="sr-only">Create Requirement</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsQuickRegisterOpen(true)}
                  className="relative -top-3 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-90 transition-all duration-150 mobile-touch-target cursor-pointer hover:bg-primary/90 min-h-[48px] min-w-[48px]"
                  title="Get Started — Quick Registration"
                  aria-label="Get Started — Quick Registration"
                  data-testid="bottom-nav-prelogin-create-requirement"
                >
                  <span className="text-2xl font-bold leading-none select-none">+</span>
                  <span className="sr-only">Get Started</span>
                </button>
              )}
            </div>

            {/* Tab 4: About Us (/about-us) */}
            <NavLink
              to="/about-us"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target min-h-[48px] ${
                  isActive
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="text-lg leading-none">🏢</span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">About Us</span>
            </NavLink>

            {/* Tab 5: FAQs (/faqs) */}
            <NavLink
              to="/faqs"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target min-h-[48px] ${
                  isActive
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="text-lg leading-none">📖</span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">FAQs</span>
            </NavLink>
          </div>
        )}
      </nav>

      {/* Slide-Up Account Menu (Optional Quick Drawer) */}
      <BottomSheet
        isOpen={isAccountSheetOpen}
        onClose={() => setIsAccountSheetOpen(false)}
        title="My Profile & Workspace"
      >
        <div className="space-y-4 text-xs">
          {/* User Identity Card */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-black text-primary overflow-hidden shadow-xs">
              {context.avatarUrl ? (
                <img src={context.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                userInitials
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-extrabold text-sm text-foreground truncate">
                  {context.fullName || user?.email}
                </span>
                <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-extrabold">
                  {context.isPlatformAdmin ? 'Admin' : context.side === 'SUPPLIER' ? 'Supplier' : 'Buyer'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
              {context.organizationName && (
                <p className="text-[10px] text-muted-foreground font-medium truncate mt-0.5">
                  🏢 {context.organizationName}
                </p>
              )}
            </div>
          </div>

          {/* Portal / Role Mode Switcher */}
          {!context.isPlatformAdmin && (
            <div className="rounded-2xl border border-border/80 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                  Portal Mode
                </span>
                <span className="text-[10px] font-bold text-primary">
                  {context.side === 'SUPPLIER' ? '🚚 Supplier Portal Active' : '🏢 Buyer Portal Active'}
                </span>
              </div>
              <div className="flex justify-center">
                <RoleModeToggle
                  size="md"
                  className="w-full justify-center py-1 shadow-xs"
                  onToggle={() => setIsAccountSheetOpen(false)}
                />
              </div>
            </div>
          )}

          {/* Quick Profile Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAccountSheetOpen(false);
                setShowProfileModal(true);
              }}
              className="flex items-center justify-center gap-1.5 rounded-xl border bg-card p-2.5 font-bold text-foreground hover:bg-muted transition-all active:scale-95 text-center min-h-[44px] mobile-touch-target"
            >
              <span>👤</span> Edit Profile
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAccountSheetOpen(false);
                setShowChangePassword(true);
              }}
              className="flex items-center justify-center gap-1.5 rounded-xl border bg-card p-2.5 font-bold text-foreground hover:bg-muted transition-all active:scale-95 text-center min-h-[44px] mobile-touch-target"
            >
              <span>🔐</span> Password
            </button>
          </div>

          {/* Admin link if platform admin */}
          {context.isPlatformAdmin && (
            <Link
              to="/admin"
              onClick={() => setIsAccountSheetOpen(false)}
              className="flex w-full items-center justify-between rounded-xl bg-purple-600 px-3.5 py-2.5 font-bold text-white shadow-xs hover:bg-purple-700 transition min-h-[44px] mobile-touch-target"
            >
              <span className="flex items-center gap-2">
                <span>⚡</span> Admin Management Console
              </span>
              <span>→</span>
            </Link>
          )}

          {/* Organization Switcher (if multi-org) */}
          {multiOrg && !context.isPlatformAdmin && (
            <div className="rounded-xl border p-3 space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                Switch Organization
              </span>
              <ul className="space-y-1">
                {context.organizations.map((o) => {
                  const active = o.id === context.organizationId;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => void chooseOrg(o.id)}
                        disabled={pendingOrg !== null}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition min-h-[44px] mobile-touch-target ${
                          active ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <div className="truncate">
                          <span className="block truncate font-semibold">{o.name}</span>
                          <span className="block text-[10px] text-muted-foreground capitalize">
                            {o.isPersonal ? 'Personal' : o.role.toLowerCase()}
                          </span>
                        </div>
                        {active && <span className="text-primary font-bold">✓</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Role Switcher (if multi-role) */}
          {multiRole && !context.isPlatformAdmin && (
            <div className="rounded-xl border p-3 space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                Switch Role / View
              </span>
              <ul className="space-y-1">
                {context.roles.map((r) => {
                  const active = r.code === context.activeRole?.code;
                  return (
                    <li key={r.code}>
                      <button
                        type="button"
                        onClick={() => void chooseRole(r.code)}
                        disabled={pending !== null}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition min-h-[44px] mobile-touch-target ${
                          active ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <span className="truncate font-semibold">{r.label}</span>
                        {active && <span className="text-primary font-bold">✓</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Canonical Profile Settings Link & Sign Out Row */}
          <div className="pt-2 border-t flex items-center justify-between gap-3">
            <Link
              to="/profile?tab=preferences"
              onClick={() => setIsAccountSheetOpen(false)}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition active:scale-95 min-h-[44px] mobile-touch-target"
            >
              <span>⚙️</span> Preferences
            </Link>

            <button
              type="button"
              onClick={() => {
                setIsAccountSheetOpen(false);
                void signOut();
              }}
              data-testid="bottom-sheet-sign-out"
              className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 transition active:scale-95 min-h-[44px] mobile-touch-target"
            >
              Sign out
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Quick Capability Editor Modal for Suppliers */}
      <SupplierCapabilityModal
        open={isCapabilityModalOpen}
        onClose={() => setIsCapabilityModalOpen(false)}
      />

      {/* Super Admin Quick Actions Action Sheet */}
      <AdminQuickActionsSheet
        isOpen={isAdminQuickActionsOpen}
        onClose={() => setIsAdminQuickActionsOpen(false)}
      />

      {/* Quick Registration Modal for Unauthenticated Users */}
      <QuickRegisterModal
        open={isQuickRegisterOpen}
        onClose={() => setIsQuickRegisterOpen(false)}
      />

      {/* Voice/Text Requirement Intake Modal for Authenticated Buyers */}
      <VoiceTextRequirementIntakeModal
        open={isBuyerIntakeModalOpen}
        onClose={() => setIsBuyerIntakeModalOpen(false)}
      />

      <ChangePasswordModal
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />

      <ProfileEditModal
        open={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </>
  );
}
