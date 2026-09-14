import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { hasMultipleRoles, hasMultipleOrganizations } from '../api/roles';
import { useRoleContext } from '../hooks/use-role-context';
import { PermissionChips } from './PermissionChips';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ProfileEditModal } from '@/features/profile';
import { ThemeBottomSheet, useTheme } from '@/features/theme';

function initials(nameOrEmail: string | undefined): string {
  if (!nameOrEmail) return '?';
  const clean = nameOrEmail.trim();
  if (clean.includes(' ')) {
    const parts = clean.split(' ').filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  const name = clean.split('@')[0] ?? '';
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

/**
 * Avatar, identity, profile management, and the role & organization switcher.
 *
 * Switching is a server call, not a client-side view filter: the active role
 * and organization determines what the database will accept, so the menu closes on a real answer
 * rather than an optimistic one.
 */
export function AccountMenu() {
  const { user, signOut } = useAuth();
  const { context, switchTo, switchOrg } = useRoleContext();
  const { theme, colorTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingOrg, setPendingOrg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function choose(code: string) {
    if (code === context.activeRole?.code) {
      setOpen(false);
      return;
    }
    setPending(code);
    setError(null);
    const result = await switchTo(code);
    setPending(null);
    if (!result.ok) {
      setError(result.error ?? 'Could not switch role');
      return;
    }
    setOpen(false);
  }

  async function chooseOrg(orgId: string) {
    if (orgId === context.organizationId) {
      setOpen(false);
      return;
    }
    setPendingOrg(orgId);
    setError(null);
    const result = await switchOrg(orgId);
    setPendingOrg(null);
    if (!result.ok) {
      setError(result.error ?? 'Could not switch organization');
      return;
    }
    setOpen(false);
  }

  const multiRole = hasMultipleRoles(context);
  const multiOrg = hasMultipleOrganizations(context);
  const displayName = context.fullName || user?.email;
  const userInitials = initials(context.fullName || user?.email);

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="account-menu-trigger"
        className="flex items-center gap-1 sm:gap-2 rounded-full border bg-card py-0.5 sm:py-1 pl-0.5 sm:pl-1 pr-1.5 sm:pr-2.5 text-xs hover:bg-muted transition"
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-primary/10 text-[0.65rem] sm:text-[0.7rem] font-bold text-primary overflow-hidden shadow-2xs shrink-0"
        >
          {context.avatarUrl ? (
            <img src={context.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            userInitials
          )}
        </span>
        <span className="hidden max-w-[12rem] truncate text-muted-foreground md:inline font-medium text-foreground">
          {displayName}
        </span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true">
          <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          data-testid="account-menu"
          className="fixed sm:absolute right-2 sm:right-0 top-[52px] sm:top-auto z-[1050] sm:z-50 mt-1 sm:mt-2 w-[19rem] sm:w-[20rem] max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-60px)] overflow-y-auto rounded-lg border bg-card p-3 shadow-2xl"
        >
          {/* Identity Header */}
          <div className="flex items-center gap-2.5 pb-2 border-b">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary overflow-hidden shadow-xs">
              {context.avatarUrl ? (
                <img src={context.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                userInitials
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-foreground">
                {context.fullName || user?.email}
              </p>
              {context.title && (
                <p className="truncate text-[11px] font-medium text-muted-foreground">
                  {context.title}
                </p>
              )}
              <p className="truncate text-[10px] text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </div>

          {/* Quick Profile Edit Action */}
          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShowProfileModal(true);
              }}
              className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition"
            >
              <span className="flex items-center gap-1.5">
                <span>👤</span> Edit Profile &amp; Avatar
              </span>
              <span className="text-[10px] text-muted-foreground">Manage ➔</span>
            </button>
          </div>

          <p className="mt-2 text-[0.7rem] text-muted-foreground">
            {context.isPlatformAdmin
              ? 'Platform Super Admin'
              : (context.organizationName ??
                (context.side === 'SUPPLIER' ? 'Supplier account' : 'Buyer account'))}
            {context.orgRole ? ` · ${context.orgRole.toLowerCase()}` : ''}
          </p>

          {context.isPlatformAdmin && (
            <div className="mt-2">
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-between rounded-md bg-purple-600 px-3 py-2 text-xs font-medium text-white shadow-xs hover:bg-purple-700 transition"
              >
                <span>⚡ Admin Console</span>
                <span>➔</span>
              </Link>
            </div>
          )}

          {context.activeRole && (
            <div className="mt-3 rounded-md border bg-muted/30 p-2.5">
              <p className="text-[0.7rem] font-medium">{context.activeRole.label}</p>
              <PermissionChips permissions={context.activeRole.permissions} className="mt-1.5" />
            </div>
          )}

          {multiOrg && !context.isPlatformAdmin && (
            <div className="mt-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                Switch Organization Context
              </p>
              <ul className="mt-1.5 space-y-1" data-testid="org-switcher">
                {context.organizations.map((org) => {
                  const active = org.id === context.organizationId;
                  return (
                    <li key={org.id}>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        disabled={pendingOrg !== null}
                        onClick={() => void chooseOrg(org.id)}
                        data-testid={`switch-org-${org.id}`}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                          active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
                        }`}
                      >
                        <div className="truncate flex flex-col min-w-0">
                          <span className="truncate font-medium">{org.name}</span>
                          <span className="text-[0.65rem] text-muted-foreground capitalize">
                            {org.isPersonal ? 'Personal Account' : `${org.orgType.replace(/_/g, ' ').toLowerCase()} (${org.role.toLowerCase()})`}
                          </span>
                        </div>
                        {pendingOrg === org.id ? (
                          <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                            switching…
                          </span>
                        ) : active ? (
                          <span aria-hidden="true" className="shrink-0 text-primary">
                            ✓
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {multiRole && !context.isPlatformAdmin && (
            <div className="mt-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                Switch view
              </p>
              <ul className="mt-1.5 space-y-1" data-testid="role-switcher">
                {context.roles.map((role) => {
                  const active = role.code === context.activeRole?.code;
                  return (
                    <li key={role.code}>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        disabled={pending !== null}
                        onClick={() => void choose(role.code)}
                        data-testid={`switch-role-${role.code}`}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                          active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
                        }`}
                      >
                        <span className="truncate">{role.label}</span>
                        {pending === role.code ? (
                          <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                            switching…
                          </span>
                        ) : active ? (
                          <span aria-hidden="true" className="shrink-0">
                            ✓
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[0.65rem] leading-snug text-muted-foreground">
                Switching changes what you can do, not just what you see. No need to sign in
                again.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-2 text-[0.7rem] text-red-600" role="alert">
              {error}
            </p>
          )}

          {/* Theme & Display Mode Option */}
          <div className="mt-3 pt-2 border-t space-y-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShowThemeSheet(true);
              }}
              data-testid="account-menu-theme-trigger"
              className="w-full flex items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-muted text-left text-foreground transition"
            >
              <span className="flex items-center gap-2">
                <span>🎨</span> Appearance &amp; Theme
              </span>
              <span className="text-[10px] text-muted-foreground font-mono uppercase bg-muted px-1.5 py-0.5 rounded">
                {theme} · {colorTheme}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShowChangePassword(true);
              }}
              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted text-left text-foreground transition"
            >
              <span>🔐</span> Set or Change Password
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              data-testid="sign-out"
              className="w-full rounded-md border px-2 py-1.5 text-xs hover:bg-muted text-left text-foreground transition"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
}
