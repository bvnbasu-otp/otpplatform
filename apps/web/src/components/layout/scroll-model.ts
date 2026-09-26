import { useEffect, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * OTP scroll model (shared by SiteLayout and AppLayout):
 *
 *   MobileSimulatorFrame   h-dvh, overflow-hidden — the document never scrolls on shell pages
 *   └─ shell root          SHELL_ROOT_CLASS — fixed-height flex column
 *      ├─ header           shrink-0
 *      ├─ <main>           SHELL_SCROLLER_CLASS + data-scroll-container — the ONLY vertical scroller;
 *      │                   page content, then (SiteLayout) the footer in normal flow at the end
 *      └─ bottom nav       shrink-0, in normal flow below <main> — never overlays content
 *
 * Because the bottom nav is a flex sibling rather than a fixed overlay, <main> ends at the
 * nav's top edge; the only clearance <main> needs is for the raised centre "+" button.
 * Pages whose route renders its own sticky action dock hide the nav entirely
 * (see shouldShowGlobalBottomNav) and their dock sticks to the bottom of <main>.
 */
export const SCROLL_CONTAINER_ATTR = 'data-scroll-container';

export type ScrollContainerKind = 'site' | 'app';

export function scrollContainerProps(kind: ScrollContainerKind) {
  return { [SCROLL_CONTAINER_ATTR]: kind } as const;
}

export const SHELL_ROOT_CLASS =
  'h-full w-full max-w-full flex flex-col bg-background overflow-hidden relative sm:transform-gpu sm:[transform:translate3d(0,0,0)] [contain:paint]';

export const SHELL_SCROLLER_CLASS =
  'flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col relative';

/** The centre "+" button is raised by -top-3 (0.75rem) above the nav's top edge. */
export const BOTTOM_NAV_OVERHANG_CLEARANCE_CLASS = 'pb-4';

export function shellScrollerClass(showBottomNav: boolean): string {
  return showBottomNav
    ? `${SHELL_SCROLLER_CLASS} ${BOTTOM_NAV_OVERHANG_CLEARANCE_CLASS}`
    : SHELL_SCROLLER_CLASS;
}

/**
 * Resets the shell scroll container on navigation (window.scrollTo is a no-op
 * because the document does not scroll), and honours #hash anchors.
 */
export function useScrollContainerReset(ref: RefObject<HTMLElement | null>) {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const container = ref.current;
    if (!hash) {
      container?.scrollTo?.({ top: 0, left: 0 });
      return;
    }

    const frame = requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    });

    return () => cancelAnimationFrame(frame);
  }, [ref, pathname, hash]);
}
