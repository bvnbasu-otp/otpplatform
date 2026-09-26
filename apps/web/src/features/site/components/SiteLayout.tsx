import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MobileSimulatorFrame } from '@/components/layout/MobileSimulatorFrame';

function useArrivalScroll() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }

    const frame = requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    });

    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);
}

export function SiteLayout({ children }: { children: ReactNode }) {
  useArrivalScroll();

  return (
    <MobileSimulatorFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-hidden relative">
        <SiteHeader />
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex-1">
            {children}
          </div>

          <SiteFooter />
        </main>

        {/* Mobile Fixed Bottom Navigation Bar */}
        <MobileBottomNav />
      </div>
    </MobileSimulatorFrame>
  );
}
