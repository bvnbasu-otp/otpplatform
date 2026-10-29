import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import { NotificationBell } from '@/features/notifications';
import { SupportHelpButtonModal } from '@/features/support';
import { OtpLogo } from '@/components/ui/OtpLogo';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n';
import { getHomeRoute, getRoleLabel } from '../navigation-config';
import { inferJourneyStageFromPath, workspaceChromeTopCss } from '../journey-stage';

import { WorkspaceHeaderMenu } from './WorkspaceHeaderMenu';
import { WorkspaceJourneyStrip } from './WorkspaceJourneyStrip';

export interface WorkspaceHeaderProps {
  onOpenSupplierCapabilities?: () => void;
}

export function WorkspaceHeader({ onOpenSupplierCapabilities }: WorkspaceHeaderProps) {
  const { context } = useRoleContext();
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const homeRoute = getHomeRoute(context);
  const roleLabel = getRoleLabel(context);
  const displayRole = t(roleLabel);
  const journeyStage = inferJourneyStageFromPath(pathname);
  const chromeTop = workspaceChromeTopCss(Boolean(journeyStage));

  return (
    <>
      <header
        className="shrink-0 z-40 border-b border-border bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/90 w-full max-w-full select-none shadow-[0_1px_0_0_hsl(var(--border)/0.6)]"
        data-testid="workspace-header-shell"
        style={{ ['--workspace-chrome-height' as string]: chromeTop }}
      >
        <div className="mx-auto flex w-full h-12 items-center justify-between gap-x-2 px-3 sm:px-4">
          
          {/* LEFT CLUSTER: OTP LOGO */}
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

            {/* Separator - Hidden across all viewports to maintain uncrowded workspace */}
            <span className="hidden text-muted-foreground/50 text-xs font-light select-none shrink-0" aria-hidden="true">
              |
            </span>

            {/* Role Indicator Tag - Hidden across all viewports; role details live in Profile */}
            <Link
              to={homeRoute}
              className="hidden hover:opacity-85 transition shrink-0"
              title={`Active Workspace: ${roleLabel}`}
              aria-label={`Active Workspace: ${roleLabel}`}
            >
              <span
                data-testid="header-role-indicator"
                className="hidden"
              >
                {displayRole}
              </span>
            </Link>
          </div>

          {/* RIGHT ACTION CLUSTER: Notifications only; Language & Support moved to Profile */}
          <div className="ml-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Language Selector Universal Trigger - Moved to Profile; kept hidden for static accessibility */}
            <div className="hidden" aria-hidden="true">
              <LanguageSwitcher placement="header" />
            </div>

            {/* Help & Support Universal Trigger - Moved to Profile; kept hidden for static accessibility */}
            <div className="hidden" aria-hidden="true">
              <SupportHelpButtonModal
                isOpen={isSupportOpen}
                onOpenChange={setIsSupportOpen}
              />
            </div>

            {/* Notifications Universal Trigger - Only persistent header icon */}
            <NotificationBell />

            {/* Secondary Navigation Menu Trigger - Hidden across all personas for minimal uncrowded workspace */}
            <button
              type="button"
              aria-label={t('Menu', 'Toggle Workspace Menu')}
              aria-expanded={isMenuOpen}
              aria-controls="workspace-header-menu"
              data-testid="header-menu-trigger"
              title={t('Menu', 'Menu')}
              onClick={() => {
                setIsMenuOpen((prev) => !prev);
                if (!isMenuOpen) {
                  setIsSupportOpen(false);
                }
              }}
              className="hidden"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true">
                <path d="M2 4h12M2 8h12M2 12h12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        {journeyStage ? <div className="hidden" aria-hidden="true"><WorkspaceJourneyStrip activeStage={journeyStage} /></div> : null}
      </header>

      {/* Secondary Workspace Navigation Drawer Overlay */}
      <WorkspaceHeaderMenu
        isOpen={isMenuOpen}
        chromeTop={chromeTop}
        onClose={() => setIsMenuOpen(false)}
        onOpenSupport={() => {
          setIsMenuOpen(false);
          setIsSupportOpen(true);
        }}
        onOpenSupplierCapabilities={onOpenSupplierCapabilities}
      />
    </>
  );
}
