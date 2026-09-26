import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { shouldShowGlobalBottomNav, isTransactionalWorkflowRoute } from './navigation-config';
import { AdminQuickActionsSheet } from './components/AdminQuickActionsSheet';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

const SRC_ROOT = resolve(__dirname, '../..');

function listTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listTsx(full);
    return entry.endsWith('.tsx') && !entry.includes('.test.') ? [full] : [];
  });
}

const BOTTOM_DOCK_PATTERN =
  /\b(?:sticky|fixed)\b[^"'`]*\bbottom-0\b|\bbottom-0\b[^"'`]*\b(?:sticky|fixed)\b/;

/**
 * Every page-level component that renders a sticky/fixed bottom action dock, mapped to
 * the routes that mount it. The global MobileBottomNav must be hidden on all of them so
 * the screen has exactly one bottom primary-action surface. `[]` = not mounted anywhere.
 */
const DOCK_COMPONENT_ROUTES: Record<string, string[]> = {
  'features/award/pages/AwardPage.tsx': ['/rfq/rfq-1/award'],
  'features/governance/pages/CommitteeVotePage.tsx': [
    '/rfq/rfq-1/committee',
    '/governance/evaluations/rfq-1/vote',
    '/governance/evaluations/rfq-1',
  ],
  'features/reveal/pages/SupplierRevealPage.tsx': ['/rfq/rfq-1/reveal'],
  'features/evaluation/components/EvaluationDecisionCockpit.tsx': [
    '/rfq/rfq-1/evaluation',
    '/rfq/rfq-1/cockpit',
    '/rfq/rfq-1/decision',
    '/rfq/rfq-1/quotes',
    '/rfqs/rfq-1/quotes',
    '/rfq/rfq-1',
  ],
  'features/fulfillment/pages/PurchaseOrderDetailPage.tsx': [
    '/purchase-orders/po-1',
    '/supplier/purchase-orders/po-1',
    '/orders/po-1',
    '/track/po-1',
  ],
  'features/intake/components/UnifiedThreeTierIntake.tsx': ['/intake'],
  'features/rfq/pages/ActiveRfqMonitoringPage.tsx': [
    '/rfq/rfq-1/monitoring',
    '/rfq/rfq-1/live',
    '/requirements/req-1/monitoring',
  ],
  'features/requirement/pages/RfqReviewPublishPage.tsx': [
    '/requirements/req-1/review-publish',
    '/requirements/req-1/rfq-review',
    '/rfq/rfq-1/publish',
  ],
  'features/requirement/pages/DiscoverSuppliersPage.tsx': ['/requirements/req-1/discover'],
  'features/rfq/components/QuoteStickyBottomBar.tsx': [],
};

/**
 * Bottom-anchored bars that are NOT a page's primary action dock. Listed so the inventory
 * stays exhaustive; each entry is a known presentation issue owned outside navigation.
 */
const NON_DOCK_BOTTOM_BARS: Record<string, string> = {
  'features/lifecycle/components/ProcurementStageNavigator.tsx':
    'admin-only 15-step telemetry bar (fixed bottom-0 z-30); overlaps page docks and the nav on /performance',
};

describe('Global bottom nav vs transactional action docks (one bottom action surface per screen)', () => {
  it('shows the global nav on hub routes and public pages', () => {
    for (const route of ['/', '/pricing', '/faqs', '/about-us', '/dashboard', '/admin', '/purchase-orders', '/supplier/purchase-orders', '/audit', '/profile', '/notifications', '/supplier/capabilities']) {
      expect(shouldShowGlobalBottomNav(route), route).toBe(true);
    }
  });

  it('is the exact inverse of the transactional-route rule, including query/hash/trailing-slash variants', () => {
    for (const route of ['/rfq/rfq-1/award/', '/rfq/rfq-1/award?tab=x', '/purchase-orders/po-1#docs', '/intake', '/dashboard/', '/purchase-orders?view=reports']) {
      expect(shouldShowGlobalBottomNav(route)).toBe(!isTransactionalWorkflowRoute(route));
    }
    expect(shouldShowGlobalBottomNav('/rfq/rfq-1/award/')).toBe(false);
    expect(shouldShowGlobalBottomNav('/purchase-orders?view=reports')).toBe(true);
  });

  it.each(Object.entries(DOCK_COMPONENT_ROUTES).filter(([, routes]) => routes.length > 0))(
    'hides the global nav on every route that mounts %s',
    (_file, routes) => {
      for (const route of routes) {
        expect(shouldShowGlobalBottomNav(route), route).toBe(false);
      }
    },
  );

  it('every sticky/fixed bottom-0 bar in the app is classified (new docks must be mapped to a nav-suppressed route)', () => {
    const files = [...listTsx(join(SRC_ROOT, 'features')), ...listTsx(join(SRC_ROOT, 'pages')), ...listTsx(join(SRC_ROOT, 'components'))];
    const unclassified: string[] = [];

    for (const file of files) {
      const rel = relative(SRC_ROOT, file).replace(/\\/g, '/');
      const hasDock = readFileSync(file, 'utf8').split('\n').some((line) => BOTTOM_DOCK_PATTERN.test(line));
      if (hasDock && !(rel in DOCK_COMPONENT_ROUTES) && !(rel in NON_DOCK_BOTTOM_BARS)) {
        unclassified.push(rel);
      }
    }

    expect(unclassified).toEqual([]);
  });
});

describe('AdminQuickActionsSheet settlement wording', () => {
  const source = readFileSync(join(__dirname, 'components/AdminQuickActionsSheet.tsx'), 'utf8');

  it('source has no escrow claim and describes direct settlement', () => {
    expect(source).not.toMatch(/escrow/i);
    expect(source).toMatch(/direct settlement/i);
  });

  it('rendered sheet has no escrow wording and shows direct settlement', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AdminQuickActionsSheet isOpen onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(html).not.toMatch(/escrow/i);
    expect(html).toMatch(/direct settlement/i);
  });
});
