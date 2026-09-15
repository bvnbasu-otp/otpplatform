import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import { NotificationBell } from '@/features/notifications';
import { SupportHelpButtonModal } from '@/features/support';
import { OtpLogo } from '@/components/ui/OtpLogo';
import { getHomeRoute, getRoleLabel } from '../navigation-config';
import { WorkspaceHeaderMenu } from './WorkspaceHeaderMenu';

export interface WorkspaceHeaderProps {
  onOpenSupplierCapabilities?: () => void;
}

export function WorkspaceHeader({ onOpenSupplierCapabilities }: WorkspaceHeaderProps) {
  const { context } = useRoleContext();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const homeRoute = getHomeRoute(context);
  const roleLabel = getRoleLabel(context);

  return (
    <>
      <header className="shrink-0 z-40 border-b border-border bg-card max-h-[48px] h-12 w-full max-w-full overflow-x-hidden select-none">
        <div className="mx-auto flex w-full h-full items-center justify-between gap-x-2 px-3">
          
          {/* LEFT CLUSTER: OTP LOGO | ROLE INDICATOR */}
          <div className="flex items-center gap-1.5 shrink-0 min-w-0">
            {/* OTP Logo (Role-aware Home Link) */}
            <Link
              to={homeRoute}
              className="flex items-center hover:opacity-90 transition shrink-0 min-h-[36px] items-center"
              title={`OTP Home (${roleLabel})`}
              aria-label={`OTP Home (${roleLabel})`}
            >
              <OtpLogo size={24} />
            </Link>

            {/* Separator */}
            <span className="text-muted-foreground/50 text-xs font-light select-none shrink-0" aria-hidden="true">
              |
            </span>

            {/* Role Indicator Tag */}
            <Link
              to={homeRoute}
              className="hover:opacity-85 transition shrink-0"
              title={`Active Workspace: ${roleLabel}`}
              aria-label={`Active Workspace: ${roleLabel}`}
            >
              <span
                data-testid="header-role-indicator"
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-tight shrink-0 transition shadow-2xs ${
                  context.isPlatformAdmin
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                    : context.side === 'SUPPLIER'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    : 'bg-primary/10 text-primary border border-primary/20'
                }`}
              >
                {roleLabel}
              </span>
            </Link>
          </div>

          {/* RIGHT ACTION CLUSTER: [Help & Support] → [Notifications (🔔)] → [Menu (☰)] */}
          <div className="ml-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Help & Support Universal Trigger */}
            <SupportHelpButtonModal />

            {/* Notifications Universal Trigger */}
            <NotificationBell />

            {/* Secondary Navigation Menu Trigger */}
            <button
              type="button"
              aria-label="Toggle Workspace Menu"
              aria-expanded={isMenuOpen}
              aria-controls="workspace-header-menu"
              data-testid="header-menu-trigger"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition min-h-[32px] mobile-touch-target ${
                isMenuOpen
                  ? 'border-primary bg-primary text-primary-foreground shadow-2xs'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true">
                {isMenuOpen ? (
                  <path
                    d="M3 3l10 10M13 3L3 13"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M2 4h12M2 8h12M2 12h12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                )}
              </svg>
              <span className="hidden md:inline font-semibold">Menu</span>
            </button>
          </div>
        </div>
      </header>

      {/* Secondary Workspace Navigation Drawer Overlay */}
      <WorkspaceHeaderMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onOpenSupplierCapabilities={onOpenSupplierCapabilities}
      />
    </>
  );
}
