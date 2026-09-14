import { useState } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ChangePasswordModal } from '@/features/roles/components/ChangePasswordModal';
import { ProfileEditModal } from '@/features/profile';
import { hasMultipleRoles, hasMultipleOrganizations } from '@/features/roles/api/roles';
import { ThemeBottomSheet } from '@/features/theme';
import { SupplierCapabilityModal } from '@/features/supplier';
import { QuickRegisterModal } from '@/features/portal';

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
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);
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

  return (
    <>
      <nav
        aria-label="Mobile Bottom Navigation"
        className="fixed sm:absolute bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] shrink-0 select-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {isAuthenticated ? (
          /* AUTHENTICATED BOTTOM TABS: Home, Orders, +, Audit/Caps, Profile */
          <div className="flex items-center justify-around h-14 w-full max-w-md mx-auto px-2">
            {/* TAB 1: HOME */}
            <NavLink
              to={isAdmin ? '/admin' : '/dashboard'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target ${
                  isActive || pathname === '/dashboard'
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="text-lg leading-none">🏠</span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">Home</span>
            </NavLink>

            {/* TAB 2: ORDERS / MY WORK */}
            <NavLink
              to={isSupplier ? '/supplier/purchase-orders' : '/purchase-orders'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target ${
                  isActive
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="text-lg leading-none">📋</span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">Orders</span>
            </NavLink>

            {/* TAB 3: CENTER ACTION (Elevated Global CTA - Context-Aware for Buyer vs Supplier) */}
            <div className="flex flex-col items-center justify-center flex-1 shrink-0">
              {isSupplier ? (
                <button
                  type="button"
                  onClick={() => setIsCapabilityModalOpen(true)}
                  className="relative -top-3 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-90 transition-all duration-150 mobile-touch-target cursor-pointer hover:bg-primary/90"
                  title="Maximize Business Reach — Update Capabilities"
                  aria-label="Maximize Business Reach — Update Capabilities"
                  data-testid="bottom-nav-supplier-add-capabilities"
                >
                  <span className="text-2xl font-bold leading-none select-none">+</span>
                  <span className="sr-only">Maximize Business Reach — Update Capabilities</span>
                </button>
              ) : (
                <NavLink
                  to="/requirements/new"
                  className={({ isActive }) =>
                    `relative -top-3 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-90 transition-all duration-150 mobile-touch-target ${
                      isActive ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:bg-primary/90'
                    }`
                  }
                  title="Post a new requirement / broadcast RFQ"
                  aria-label="Post a new requirement / broadcast RFQ"
                  data-testid="bottom-nav-buyer-create-requirement"
                >
                  <span className="text-2xl font-bold leading-none select-none">+</span>
                  <span className="sr-only">Create Requirement</span>
                </NavLink>
              )}
            </div>

            {/* TAB 4: AUDIT / QUOTES */}
            <NavLink
              to={isSupplier ? '/supplier/capabilities' : '/audit'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target ${
                  isActive
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="text-lg leading-none">{isSupplier ? '🏷️' : '🛡️'}</span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">
                {isSupplier ? 'Quotes' : 'Audit'}
              </span>
            </NavLink>

            {/* TAB 5: PROFILE / ACCOUNT DRAWER */}
            <button
              type="button"
              onClick={() => setIsAccountSheetOpen(true)}
              data-testid="bottom-nav-profile"
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target ${
                isAccountSheetOpen
                  ? 'text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground font-medium'
              }`}
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
            </button>
          </div>
        ) : (
          /* PRE-LOGIN STRICT 5 TABS: Home, Pricing, +, About Us, FAQs */
          <div className="flex items-center justify-around h-14 w-full max-w-md mx-auto px-2">
            {/* Tab 1: Home (/) */}
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target ${
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
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target ${
                  isActive
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="text-lg leading-none">💳</span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">Pricing</span>
            </NavLink>

            {/* Tab 3: + Elevated Center Button (Quick Register Modal trigger) */}
            <div className="flex flex-col items-center justify-center flex-1 shrink-0">
              <button
                type="button"
                onClick={() => setIsQuickRegisterOpen(true)}
                className="relative -top-3 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-90 transition-all duration-150 mobile-touch-target cursor-pointer hover:bg-primary/90"
                title="Get Started — Quick Registration"
                aria-label="Get Started — Quick Registration"
                data-testid="bottom-nav-prelogin-create-requirement"
              >
                <span className="text-2xl font-bold leading-none select-none">+</span>
                <span className="sr-only">Get Started</span>
              </button>
            </div>

            {/* Tab 4: About Us (/about-us) */}
            <NavLink
              to="/about-us"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target ${
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
                `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 active:scale-95 mobile-touch-target ${
                  isActive
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground font-medium'
                }`
              }
            >
              <span className="text-lg leading-none">❓</span>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">FAQs</span>
            </NavLink>
          </div>
        )}
      </nav>

      {/* Bottom-Up Slide-Up Account Menu */}
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

          {/* Quick Profile Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAccountSheetOpen(false);
                setShowProfileModal(true);
              }}
              className="flex items-center justify-center gap-1.5 rounded-xl border bg-card p-2.5 font-bold text-foreground hover:bg-muted transition-all active:scale-95 text-center mobile-touch-target"
            >
              <span>👤</span> Edit Profile
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAccountSheetOpen(false);
                setShowChangePassword(true);
              }}
              className="flex items-center justify-center gap-1.5 rounded-xl border bg-card p-2.5 font-bold text-foreground hover:bg-muted transition-all active:scale-95 text-center mobile-touch-target"
            >
              <span>🔐</span> Password
            </button>
          </div>

          {/* Admin link if platform admin */}
          {context.isPlatformAdmin && (
            <Link
              to="/admin"
              onClick={() => setIsAccountSheetOpen(false)}
              className="flex w-full items-center justify-between rounded-xl bg-purple-600 px-3.5 py-2.5 font-bold text-white shadow-xs hover:bg-purple-700 transition"
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
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition ${
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
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition ${
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

          {/* Utility & Legal Links */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 px-1">
            <Link
              to="/legal/terms"
              onClick={() => setIsAccountSheetOpen(false)}
              className="hover:text-foreground transition underline"
            >
              Terms &amp; Privacy
            </Link>
            <Link
              to="/faqs"
              onClick={() => setIsAccountSheetOpen(false)}
              className="hover:text-foreground transition underline"
            >
              FAQs &amp; Help
            </Link>
          </div>

          {/* Theme & Settings Shortcut & Sign Out Row */}
          <div className="pt-2 border-t flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setIsAccountSheetOpen(false);
                setShowThemeSheet(true);
              }}
              data-testid="bottom-nav-theme-sheet-trigger"
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition active:scale-95 mobile-touch-target"
            >
              <span>🎨</span> Appearance
            </button>

            <button
              type="button"
              onClick={() => {
                setIsAccountSheetOpen(false);
                void signOut();
              }}
              data-testid="bottom-sheet-sign-out"
              className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 transition active:scale-95 mobile-touch-target"
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

      {/* Quick Registration Modal for Unauthenticated Users */}
      <QuickRegisterModal
        open={isQuickRegisterOpen}
        onClose={() => setIsQuickRegisterOpen(false)}
      />

      <ChangePasswordModal
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />

      <ProfileEditModal
        open={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />

      <ThemeBottomSheet
        isOpen={showThemeSheet}
        onClose={() => setShowThemeSheet(false)}
      />
    </>
  );
}
