import { useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MobileSimulatorFrame } from '@/components/layout/MobileSimulatorFrame';
import {
  SHELL_ROOT_CLASS,
  scrollContainerProps,
  shellScrollerClass,
  useScrollContainerReset,
} from '@/components/layout/scroll-model';
import { shouldShowGlobalBottomNav } from '@/features/navigation/navigation-config';

export function SiteLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useScrollContainerReset(mainRef);

  const showBottomNav = shouldShowGlobalBottomNav(pathname);

  return (
    <MobileSimulatorFrame>
      <div className={SHELL_ROOT_CLASS}>
        <SiteHeader />
        <main ref={mainRef} className={shellScrollerClass(showBottomNav)} {...scrollContainerProps('site')}>
          <div className="flex-1">
            {children}
          </div>

          <SiteFooter />
        </main>

        {showBottomNav && <MobileBottomNav />}
      </div>
    </MobileSimulatorFrame>
  );
}
