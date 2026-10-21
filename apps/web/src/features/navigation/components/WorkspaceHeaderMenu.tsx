import React, { useEffect, useRef } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { useRoleContext } from '@/features/roles';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n';
import { getHomeRoute, getOrdersRoute, getRoleLabel } from '../navigation-config';


export interface WorkspaceHeaderMenuProps {
  isOpen: boolean;
  /** Matches `--workspace-chrome-height` on the header (e.g. 3rem or 5.25rem). */
  chromeTop?: string;
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
  chromeTop = '3rem',
  onClose,
  onOpenSupport,
  onOpenSupplierCapabilities,
}: WorkspaceHeaderMenuProps) {
  const { user, signOut } = useAuth();
  const { context } = useRoleContext();
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);

  const roleLabel = getRoleLabel(context);
  const displayRole = t(roleLabel);
  const homeRoute = getHomeRoute(context);
  const ordersRoute = getOrdersRoute(context);
  const userInitials = initials(context.fullName || user?.email);

  // Move focus into the modal, keep Tab inside it, and restore the invoker on close.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const focusable = (): HTMLElement[] => {
      const root = menuRef.current;
      if (!root) return [];
      return [...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
    };

    const frame = window.requestAnimationFrame(() => {
      focusable()[0]?.focus();
    });

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      const atStart = index <= 0;
      const atEnd = index === -1 || index === items.length - 1;
      if (e.shiftKey && atStart) {
        e.preventDefault();
        items[items.length - 1]?.focus();
      } else if (!e.shiftKey && atEnd) {
        e.preventDefault();
        items[0]?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
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

  if (!isOpen) return null;

  return (
    <div
      id="workspace-header-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Navigation Menu"
      className="fixed inset-0 z-[1000] flex flex-col"
      style={{ top: chromeTop }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
        style={{ top: chromeTop }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <nav
        ref={menuRef}
        aria-label="Workspace Secondary Navigation"
        className="relative z-10 w-full overflow-y-auto overscroll-contain border-b border-border bg-card shadow-2xl animate-in slide-in-from-top-2 duration-150"
        style={{ maxHeight: `calc(100dvh - ${chromeTop})` }}
      >
        <div className="mx-auto w-full max-w-lg px-4 py-4 space-y-4 text-xs">
          
          {/* SECTION 1: WORKSPACE PRIMARY & CONTEXTUAL NAVIGATION */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                {t('Workspace', 'Workspace')} ({displayRole})
              </span>
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                {displayRole} {t('Active', 'Active')}
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
                    <span>🏠</span> {t('Home', 'Home')}
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
                    <span>📋</span> {t('Orders & Reports', 'Orders & Reports')}
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
                    <span>🛡️</span> {t('Audit History & Proofs', 'Audit History & Proofs')}
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
                    <span>👤</span> {t('Profile & Settings', 'Profile & Settings')}
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
                      <span>⚡</span> {t('Super Admin Operations', 'Super Admin Operations')}
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
                      <span>📡</span> {t('+ Expand Catalog & Capabilities', '+ Expand Catalog & Capabilities')}
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
                      <span>⚡</span> + {t('Create Requirement', 'Create New Requirement')}
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
              {t('Support', 'Support')}
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
                    <span>🛠️</span> {t('Help & Support Center', 'Help & Support Center')}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{t('Open →', 'Open →')}</span>
                </button>
              </li>
              <li>
                <NavLink
                  to="/faqs"
                  onClick={onClose}
                  className="flex items-center justify-between rounded-xl px-3.5 py-2 font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition min-h-[44px] mobile-touch-target"
                >
                  <span className="flex items-center gap-2">
                    <span>📖</span> {t('FAQs & Help Guides', 'FAQs & Help Guides')}
                  </span>
                  <span>→</span>
                </NavLink>
              </li>
            </ul>
          </div>

          {/* SECTION 3: WEBSITE */}
          <div className="border-t border-border pt-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block mb-2">
              {t('Website', 'Website')}
            </span>
            <ul className="grid grid-cols-2 gap-1">
              <li>
                <NavLink
                  to="/"
                  onClick={onClose}
                  className="block rounded-lg px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] mobile-touch-target flex items-center"
                >
                  {t('Public Home', 'Public Home')}
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/faqs#workflow"
                  onClick={onClose}
                  className="block rounded-lg px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] mobile-touch-target flex items-center"
                >
                  {t('How OTP Works', 'How OTP Works')}
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/pricing"
                  onClick={onClose}
                  className="block rounded-lg px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] mobile-touch-target flex items-center"
                >
                  {t('Pricing', 'Pricing')}
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/about-us"
                  onClick={onClose}
                  className="block rounded-lg px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] mobile-touch-target flex items-center"
                >
                  {t('About OTP', 'About OTP')}
                </NavLink>
              </li>
            </ul>
          </div>

          {/* SECTION 4: LANGUAGE SELECTION */}
          <div className="border-t border-border pt-3">
            <LanguageSwitcher variant="full" placement="menu" />
          </div>

          {/* SECTION 5: ACCOUNT */}
          <div className="border-t border-border pt-3 space-y-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block">
              {t('Account', 'Account')}
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
                    {displayRole}
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

            {/* Profile Settings Link & Sign Out Row */}
            <div className="pt-2 border-t flex items-center justify-between gap-3">
              <Link
                to="/profile?tab=preferences"
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition active:scale-95 min-h-[44px] mobile-touch-target"
              >
                <span>⚙️</span> {t('Preferences', 'Preferences')}
              </Link>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  void signOut();
                }}
                data-testid="header-menu-sign-out"
                className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition active:scale-95 min-h-[44px] mobile-touch-target"
              >
                <span>🚪</span> {t('Sign Out', 'Sign Out')}
              </button>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}
