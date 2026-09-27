import { describe, it, expect } from 'vitest';

/**
 * Mirrors the routing/loading-gate decision logic in HomePage.tsx.
 *
 * HomePage.tsx combines two independent async role sources
 * (usePortalRole + useRoleContext) plus maintenance-mode state to decide
 * what to render. The vitest environment for apps/web runs under `node`
 * (no jsdom/testing-library configured), so per the existing convention in
 * this codebase (see features/portal/pages/LoginPage.test.ts), the decision
 * logic is extracted into a pure function and tested directly rather than
 * rendered through React. This function must be kept in sync with the
 * control flow in HomePage.tsx.
 *
 * Regression under test (F-RUN2-T4-01): the loading gate previously used
 * `portalLoading && contextLoading`, which only showed the loading state
 * while BOTH sources were loading. If one resolved before the other, the
 * gate was bypassed and role-based rendering ran on partially-resolved
 * data. The fix changes the gate to `portalLoading || contextLoading`, so
 * ANY source still loading holds the loading state.
 */
type HomeRouteDecision =
  | { type: 'loading' }
  | { type: 'redirect'; to: string }
  | { type: 'supplier' }
  | { type: 'buyer' };

function resolveHomeRoute(params: {
  portalLoading: boolean;
  contextLoading: boolean;
  role: string;
  contextSide?: string;
  isPlatformAdmin?: boolean;
  isMaintenanceMode: boolean | undefined;
  currentPath: string;
}): HomeRouteDecision {
  const {
    portalLoading,
    contextLoading,
    role,
    contextSide,
    isPlatformAdmin,
    isMaintenanceMode,
    currentPath,
  } = params;

  // Fixed loading gate: wait for ALL role-context sources before deciding.
  if (portalLoading || contextLoading) {
    return { type: 'loading' };
  }

  const isSupplier = role === 'supplier' || contextSide === 'SUPPLIER';
  const isAdmin = role === 'admin' || isPlatformAdmin === true;

  if (isAdmin) {
    return { type: 'redirect', to: '/admin' };
  }

  if (isMaintenanceMode === true) {
    const dest =
      currentPath && currentPath !== '/maintenance' && currentPath !== '/'
        ? `/maintenance?returnUrl=${encodeURIComponent(currentPath)}`
        : '/maintenance';
    return { type: 'redirect', to: dest };
  }

  if (isSupplier) {
    return { type: 'supplier' };
  }

  return { type: 'buyer' };
}

const base = {
  role: 'unknown',
  contextSide: undefined as string | undefined,
  isPlatformAdmin: undefined as boolean | undefined,
  isMaintenanceMode: false as boolean | undefined,
  currentPath: '/',
};

describe('HomePage loading gate (F-RUN2-T4-01 regression)', () => {
  it('shows loading state when portalLoading=true and contextLoading=false (previously broken)', () => {
    const result = resolveHomeRoute({
      ...base,
      portalLoading: true,
      contextLoading: false,
    });
    expect(result).toEqual({ type: 'loading' });
  });

  it('shows loading state when portalLoading=false and contextLoading=true (previously broken)', () => {
    const result = resolveHomeRoute({
      ...base,
      portalLoading: false,
      contextLoading: true,
    });
    expect(result).toEqual({ type: 'loading' });
  });

  it('shows loading state when portalLoading=true and contextLoading=true', () => {
    const result = resolveHomeRoute({
      ...base,
      portalLoading: true,
      contextLoading: true,
    });
    expect(result).toEqual({ type: 'loading' });
  });

  it('does NOT show loading state when portalLoading=false and contextLoading=false, and proceeds to role-based rendering', () => {
    const result = resolveHomeRoute({
      ...base,
      portalLoading: false,
      contextLoading: false,
      role: 'buyer',
    });
    expect(result).not.toEqual({ type: 'loading' });
    expect(result).toEqual({ type: 'buyer' });
  });
});

describe('HomePage post-loading routing branches', () => {
  it('redirects to /admin when role is admin', () => {
    const result = resolveHomeRoute({
      ...base,
      portalLoading: false,
      contextLoading: false,
      role: 'admin',
    });
    expect(result).toEqual({ type: 'redirect', to: '/admin' });
  });

  it('redirects to /admin when context.isPlatformAdmin is true', () => {
    const result = resolveHomeRoute({
      ...base,
      portalLoading: false,
      contextLoading: false,
      role: 'buyer',
      isPlatformAdmin: true,
    });
    expect(result).toEqual({ type: 'redirect', to: '/admin' });
  });

  it('redirects supplier to /maintenance with returnUrl during maintenance mode when not on / or /maintenance', () => {
    const result = resolveHomeRoute({
      ...base,
      portalLoading: false,
      contextLoading: false,
      role: 'supplier',
      isMaintenanceMode: true,
      currentPath: '/supplier/quotes',
    });
    expect(result).toEqual({
      type: 'redirect',
      to: `/maintenance?returnUrl=${encodeURIComponent('/supplier/quotes')}`,
    });
  });

  it('redirects to bare /maintenance (no returnUrl) when already at root path during maintenance mode', () => {
    const result = resolveHomeRoute({
      ...base,
      portalLoading: false,
      contextLoading: false,
      role: 'buyer',
      isMaintenanceMode: true,
      currentPath: '/',
    });
    expect(result).toEqual({ type: 'redirect', to: '/maintenance' });
  });

  it('renders the supplier dashboard when role is supplier and not in maintenance', () => {
    const result = resolveHomeRoute({
      ...base,
      portalLoading: false,
      contextLoading: false,
      role: 'supplier',
    });
    expect(result).toEqual({ type: 'supplier' });
  });

  it('renders the supplier dashboard when context.side is SUPPLIER even if role is not yet "supplier"', () => {
    const result = resolveHomeRoute({
      ...base,
      portalLoading: false,
      contextLoading: false,
      role: 'unknown',
      contextSide: 'SUPPLIER',
    });
    expect(result).toEqual({ type: 'supplier' });
  });

  it('renders the buyer dashboard by default when not admin, not in maintenance, and not a supplier', () => {
    const result = resolveHomeRoute({
      ...base,
      portalLoading: false,
      contextLoading: false,
      role: 'buyer',
    });
    expect(result).toEqual({ type: 'buyer' });
  });
});
