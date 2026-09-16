import React, { useEffect, useRef } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { useRoleContext } from '@/features/roles';
import { hasMultipleRoles, hasMultipleOrganizations } from '@/features/roles/api/roles';
import { RoleModeToggle } from '@/components/ui/RoleModeToggle';
import { getHomeRoute, getOrdersRoute, getRoleLabel } from '../navigation-config';

export interface WorkspaceHeaderMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSupport?: () => void;
  onOpenSupplierCapabilities?: () => void;
}

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

export function WorkspaceHeaderMenu({
  isOpen,
  onClose,
  onOpenSupport,
  onOpenSupplierCapabilities,
}: WorkspaceHeaderMenuProps) {
  const { user, signOut } = useAuth();
  const { context, switchTo, switchOrg } = useRoleContext();
  const { pathname } = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);

  const [pendingRole, setPendingRole] = React.useState<string | null>(null);
  const [pendingOrg, setPendingOrg] = React.useState<string | null>(null);

  const roleLabel = getRoleLabel(context);
  const homeRoute = getHomeRoute(context);
  const ordersRoute = getOrdersRoute(context);
  const multiRole = hasMultipleRoles(context);
  const multiOrg = hasMultipleOrganizations(context);
  const userInitials = initials(context.fullName || user?.email);

  // Close menu on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll on mobile when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  async function handleChooseRole(code: string) {
    if (code === context.activeRole?.code) {
      onClose();
      return;
    }
    setPendingRole(code);
    const result = await switchTo(code);
    setPendingRole(null);
    if (result.ok) {
      onClose();
    }
  }

  async function handleChooseOrg(orgId: string) {
    if (orgId === context.organizationId) {
      onClose();
      return;
    }
    setPendingOrg(orgId);
    const result = await switchOrg(orgId);
    setPendingOrg(null);
    if (result.ok) {
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      id="workspace-header-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Navigation Menu"
      className="fixed inset-0 top-[48px] z-[1000] flex flex-col"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 top-[48px] bg-black/50 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <nav
        ref={menuRef}
        aria-label="Workspace Secondary Navigation"
        className="relative z-10 w-full max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain border-b border-border bg-card shadow-2xl animate-in slide-in-from-top-2 duration-150"
      >
        <div className="mx-auto w-full max-w-lg px-4 py-4 space-y-4 text-xs">
          
          {/* SECTION 1: WORKSPACE PRIMARY & CONTEXTUAL NAVIGATION */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Workspace ({roleLabel})
              </span>
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                {roleLabel} Active
              </span>
            </div>

            <ul className="space-y-1">
              <li>
                <NavLink
                  to={homeRoute}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-xl px-3.5 py-2.5 font-bold transition min-h-[44px] mobile-touch-target ${
                      isActive || pathname === '/dashboard' || pathname === '/admin'
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'bg-muted/40 text-foreground hover:bg-muted'
                    }`
                  }
                >
                  <span className="flex items-center gap-2">
                    <span>🏠</span> Home
                  </span>
                  <span>→</span>
                </NavLink>
              </li>

              <li>
                <NavLink
                  to={ordersRoute}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-xl px-3.5 py-2.5 font-bold transition min-h-[44px] mobile-touch-target ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'bg-muted/40 text-foreground hover:bg-muted'
                    }`
                  }
                >
                  <span className="flex items-center gap-2">
                    <span>📋</span> Orders &amp; Reports
                  </span>
                  <span>→</span>
                </NavLink>
              </li>

              <li>
                <NavLink
                  to="/audit"
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-xl px-3.5 py-2.5 font-bold transition min-h-[44px] mobile-touch-target ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'bg-muted/40 text-foreground hover:bg-muted'
                    }`
                  }
                >
                  <span className="flex items-center gap-2">
                    <span>🛡️</span> Audit History &amp; Proofs
                  </span>
                  <span>→</span>
                </NavLink>
              </li>

              <li>
                <NavLink
                  to="/profile"
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-xl px-3.5 py-2.5 font-bold transition min-h-[44px] mobile-touch-target ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'bg-muted/40 text-foreground hover:bg-muted'
                    }`
                  }
                >
                  <span className="flex items-center gap-2">
                    <span>👤</span> Profile &amp; Settings
                  </span>
                  <span>→</span>
                </NavLink>
              </li>

              {/* Role-Specific Contextual Action */}
              {context.isPlatformAdmin ? (
                <li>
                  <Link
                    to="/admin"
                    onClick={onClose}
                    className="flex items-center justify-between rounded-xl bg-purple-600 px-3.5 py-2.5 font-bold text-white shadow-2xs hover:bg-purple-700 transition min-h-[44px] mobile-touch-target"
                  >
                    <span className="flex items-center gap-2">
                      <span>⚡</span> Super Admin Operations
                    </span>
                    <span>→</span>
                  </Link>
                </li>
              ) : context.side === 'SUPPLIER' ? (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSupplierCapabilities?.();
                    }}
                    data-testid="drawer-supplier-capabilities-btn"
                    className="w-full flex items-center justify-between rounded-xl bg-emerald-600 px-3.5 py-2.5 font-bold text-white shadow-2xs hover:bg-emerald-700 transition cursor-pointer min-h-[44px] mobile-touch-target"
                  >
                    <span className="flex items-center gap-2">
                      <span>📡</span> + Expand Catalog &amp; Capabilities
                    </span>
                    <span>⚡</span>
                  </button>
                </li>
              ) : (
                <li>
                  <Link
                    to="/requirements/new"
                    onClick={onClose}
                    data-testid="drawer-buyer-create-requirement"
                    className="flex items-center justify-between rounded-xl bg-primary px-3.5 py-2.5 font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition min-h-[44px] mobile-touch-target"
                  >
                    <span className="flex items-center gap-2">
                      <span>⚡</span> + Create New Requirement
                    </span>
                    <span>→</span>
                  </Link>
                </li>
              )}
            </ul>
          </div>

          {/* SECTION 2: SUPPORT */}
          <div className="border-t border-border pt-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block mb-2">
              Support
            </span>
            <ul className="space-y-1">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSupport?.();
                  }}
                  data-testid="drawer-help-support-btn"
                  className="w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2 font-medium text-foreground bg-muted/30 hover:bg-muted transition min-h-[44px] mobile-touch-target text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span>🛠️</span> Help &amp; Support Center
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0">Open →</span>
                </button>
              </li>
              <li>
                <NavLink
                  to="/faqs"
                  onClick={onClose}
                  className="flex items-center justify-between rounded-xl px-3.5 py-2 font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition min-h-[44px] mobile-touch-target"
                >
                  <span className="flex items-center gap-2">
                    <span>📖</span> FAQs &amp; Help Guides
                  </span>
                  <span>→</span>
                </NavLink>
              </li>
            </ul>
          </div>

          {/* SECTION 3: WEBSITE */}
          <div className="border-t border-border pt-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block mb-2">
              Website
            </span>
            <ul className="grid grid-cols-2 gap-1">
              <li>
                <NavLink
                  to="/"
                  onClick={onClose}
                  className="block rounded-lg px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] mobile-touch-target flex items-center"
                >
                  Public Home
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/faqs#workflow"
                  onClick={onClose}
                  className="block rounded-lg px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] mobile-touch-target flex items-center"
                >
                  How OTP Works
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/pricing"
                  onClick={onClose}
                  className="block rounded-lg px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] mobile-touch-target flex items-center"
                >
                  Pricing
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/about-us"
                  onClick={onClose}
                  className="block rounded-lg px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] mobile-touch-target flex items-center"
                >
                  About OTP
                </NavLink>
              </li>
            </ul>
          </div>

          {/* SECTION 4: ACCOUNT */}
          <div className="border-t border-border pt-3 space-y-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block">
              Account
            </span>

            {/* User Identity Card */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-black text-primary overflow-hidden shadow-xs">
                {context.avatarUrl ? (
                  <img src={context.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  userInitials
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-xs text-foreground truncate">
                    {context.fullName || user?.email}
                  </span>
                  <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.2 text-[9px] font-extrabold">
                    {roleLabel}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
                {context.organizationName && (
                  <p className="text-[10px] text-muted-foreground font-medium truncate mt-0.5">
                    🏢 {context.organizationName}
                  </p>
                )}
              </div>
            </div>

            {/* Portal / Role Mode Switcher */}
            {!context.isPlatformAdmin && (
              <div className="rounded-xl border border-border bg-muted/30 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Portal Mode</span>
                  <span className="text-primary font-bold">
                    {context.side === 'SUPPLIER' ? 'Supplier Mode Active' : 'Buyer Mode Active'}
                  </span>
                </div>
                <div className="flex justify-center">
                  <RoleModeToggle size="sm" className="w-full justify-center" onToggle={onClose} />
                </div>
              </div>
            )}

            {/* Switch Organization (if multi-org) */}
            {multiOrg && !context.isPlatformAdmin && (
              <div className="rounded-xl border border-border p-3 space-y-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                  Switch Organization
                </span>
                <ul className="space-y-1">
                  {context.organizations.map((org) => {
                    const active = org.id === context.organizationId;
                    return (
                      <li key={org.id}>
                        <button
                          type="button"
                          onClick={() => void handleChooseOrg(org.id)}
                          disabled={pendingOrg !== null}
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition min-h-[44px] mobile-touch-target ${
                            active ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-foreground'
                          }`}
                        >
                          <div className="truncate min-w-0">
                            <span className="block truncate font-semibold text-xs">{org.name}</span>
                            <span className="block text-[10px] text-muted-foreground capitalize">
                              {org.isPersonal ? 'Personal' : org.role.toLowerCase()}
                            </span>
                          </div>
                          {active && <span className="text-primary font-bold ml-2">✓</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Switch Role (if multi-role) */}
            {multiRole && !context.isPlatformAdmin && (
              <div className="rounded-xl border border-border p-3 space-y-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                  Switch Role / View
                </span>
                <ul className="space-y-1">
                  {context.roles.map((role) => {
                    const active = role.code === context.activeRole?.code;
                    return (
                      <li key={role.code}>
                        <button
                          type="button"
                          onClick={() => void handleChooseRole(role.code)}
                          disabled={pendingRole !== null}
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition min-h-[44px] mobile-touch-target ${
                            active ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-foreground'
                          }`}
                        >
                          <span className="truncate font-semibold text-xs">{role.label}</span>
                          {active && <span className="text-primary font-bold ml-2">✓</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Sign Out Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void signOut();
                }}
                data-testid="header-menu-sign-out"
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition active:scale-95 min-h-[44px] mobile-touch-target"
              >
                <span>🚪</span> Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}
