/**
 * Maps authenticated routes to the public procurement journey (TELL → REVIEW → DECIDE → TRACK).
 * Informational only — does not drive server state or eligibility.
 */

export type JourneyStage = 'TELL' | 'REVIEW' | 'DECIDE' | 'TRACK';

export const JOURNEY_STAGES: JourneyStage[] = ['TELL', 'REVIEW', 'DECIDE', 'TRACK'];

export const JOURNEY_STAGE_LABELS: Record<JourneyStage, string> = {
  TELL: 'Tell',
  REVIEW: 'Review',
  DECIDE: 'Decide',
  TRACK: 'Track',
};

function cleanPath(pathname: string): string {
  const withoutQuery = pathname.split('?')[0] ?? '/';
  const withoutHash = withoutQuery.split('#')[0] ?? '/';
  return withoutHash.replace(/\/+$/, '') || '/';
}

/**
 * Returns the active journey stage for the current path, or null when the strip should stay hidden
 * (hubs, admin console, public routes).
 */
export function inferJourneyStageFromPath(pathname: string): JourneyStage | null {
  const path = cleanPath(pathname);

  if (path === '/admin' || path.startsWith('/admin') || path === '/founder' || path.startsWith('/founder')) {
    return null;
  }

  if (
    path === '/dashboard' ||
    path === '/profile' ||
    path.startsWith('/profile/') ||
    path === '/notifications' ||
    path === '/audit' ||
    path === '/supplier/quotes' ||
    path === '/supplier/capabilities' ||
    path === '/org/members' ||
    path === '/demo' ||
    path === '/financial-controls' ||
    path === '/reconciliation'
  ) {
    return null;
  }

  if (
    path === '/purchase-orders' ||
    path.startsWith('/purchase-orders/') ||
    path === '/supplier/purchase-orders' ||
    path.startsWith('/supplier/purchase-orders/') ||
    path.startsWith('/supplier/work-orders/') ||
    path.startsWith('/work-orders/') ||
    path.startsWith('/orders/') ||
    path.startsWith('/track/')
  ) {
    return 'TRACK';
  }

  if (
    /\/rfq\/[^/]+\/(evaluation|cockpit|decision|quotes|committee|award|reveal)/.test(path) ||
    /\/rfqs\/[^/]+\/(evaluation|quotes)/.test(path) ||
    path.startsWith('/governance/evaluations')
  ) {
    return 'DECIDE';
  }

  if (
    path.includes('/discover') ||
    path.includes('/rfq-review') ||
    path.includes('/review-publish') ||
    path.includes('/monitoring') ||
    path.endsWith('/live') ||
    path.includes('/market-intelligence') ||
    path.includes('/clarification') ||
    /\/rfq\/[^/]+\/(publish|review)/.test(path) ||
    path.startsWith('/supplier/rfq/') ||
    path.startsWith('/supplier/rfqs/')
  ) {
    return 'REVIEW';
  }

  if (path === '/intake' || path.startsWith('/intake/') || /^\/requirements\/[^/]+$/.test(path)) {
    return 'TELL';
  }

  if (path.startsWith('/requirements/')) {
    return 'REVIEW';
  }

  if (path.startsWith('/rfq/') || path.startsWith('/rfqs/')) {
    return 'DECIDE';
  }

  return null;
}

/** CSS length for fixed overlays (header row + optional journey strip). */
export function workspaceChromeTopCss(includesJourneyStrip: boolean): string {
  return includesJourneyStrip ? '5.25rem' : '3rem';
}
