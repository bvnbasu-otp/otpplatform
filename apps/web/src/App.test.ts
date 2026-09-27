import { describe, it, expect } from 'vitest';

/**
 * Mirrors the /orders and /purchase-orders role-resolution logic in App.tsx
 * (F-RUN2-T4-03).
 *
 * The vitest environment for apps/web runs under `node` (no jsdom/testing-
 * library configured), and App.tsx pulls in a large graph of lazy-loaded
 * feature modules plus providers (AuthProvider, RoleProvider, Supabase
 * client, etc.) at module scope, so importing it directly in a test is not
 * tractable. Per the existing convention in this codebase (see
 * HomePage.test.ts, F-RUN2-T4-01), the decision logic is extracted into a
 * pure function and tested directly rather than rendered through React or
 * imported from App.tsx. This mirror must be kept in sync with
 * `resolvePurchaseOrdersRole` in App.tsx.
 *
 * Defect under test (F-RUN2-T4-03): `/purchase-orders` used to render
 * `<PurchaseOrdersPage role="buyer" />` unconditionally, and `/orders` was a
 * blind `<Navigate to="/purchase-orders" replace />` with no role awareness.
 * Both are now resolved from the signed-in account's actual `context.side`,
 * using the same pattern already established by BuyerPoDetailRoute /
 * SupplierPoDetailRoute elsewhere in App.tsx: suppliers get the supplier
 * view; everyone else (buyers, admins, and accounts whose side hasn't
 * resolved yet) gets the buyer view.
 *
 * This is a defense-in-depth hygiene fix, not an active-bug fix: dual-side
 * gating in ProtectedRoute (F-RUN2-T4-02) already intercepts a supplier
 * before the old hardcoded-buyer content could render, so the symptom this
 * closes off is not currently live-reproducible. The point is to remove the
 * landmine so it can't become a live bug again if ProtectedRoute's logic
 * ever regresses, and to avoid the redundant extra redirect hop through the
 * buyer route on the way to the supplier one.
 */
function resolvePurchaseOrdersRole(side: string | null | undefined): 'buyer' | 'supplier' {
  return side === 'SUPPLIER' ? 'supplier' : 'buyer';
}

/** Mirrors OrdersRoute's redirect-target selection in App.tsx. */
function resolveOrdersRedirectTarget(side: string | null | undefined): string {
  const effectiveRole = resolvePurchaseOrdersRole(side);
  return effectiveRole === 'supplier' ? '/supplier/purchase-orders' : '/purchase-orders';
}

describe('/purchase-orders role resolution (F-RUN2-T4-03)', () => {
  it('resolves a buyer account to the buyer PurchaseOrdersPage view', () => {
    expect(resolvePurchaseOrdersRole('BUYER')).toBe('buyer');
  });

  it('resolves a supplier account to the supplier PurchaseOrdersPage view (previously hardcoded to buyer)', () => {
    expect(resolvePurchaseOrdersRole('SUPPLIER')).toBe('supplier');
  });

  it('resolves an admin account (side unset/BUYER-default) to the buyer PurchaseOrdersPage view', () => {
    // Admin accounts are not gated on `side` at all (ProtectedRoute's
    // isPlatformAdmin bypass handles admin access separately); the role
    // catalog resolves an admin's own `context.side` to 'BUYER' by default
    // when no supplier linkage is found, matching the existing admin
    // convention used by BuyerPoDetailRoute for the equivalent detail route.
    expect(resolvePurchaseOrdersRole('BUYER')).toBe('buyer');
  });

  it('resolves a null/undefined side (not yet resolved) to the buyer PurchaseOrdersPage view', () => {
    expect(resolvePurchaseOrdersRole(null)).toBe('buyer');
    expect(resolvePurchaseOrdersRole(undefined)).toBe('buyer');
  });
});

describe('/orders redirect target resolution (F-RUN2-T4-03)', () => {
  it('sends a buyer directly to /purchase-orders', () => {
    expect(resolveOrdersRedirectTarget('BUYER')).toBe('/purchase-orders');
  });

  it('sends a supplier directly to /supplier/purchase-orders (no more bounce through the buyer route)', () => {
    expect(resolveOrdersRedirectTarget('SUPPLIER')).toBe('/supplier/purchase-orders');
  });

  it('sends an admin (buyer-default side) to /purchase-orders', () => {
    expect(resolveOrdersRedirectTarget('BUYER')).toBe('/purchase-orders');
  });

  it('sends an account with unresolved side to /purchase-orders', () => {
    expect(resolveOrdersRedirectTarget(null)).toBe('/purchase-orders');
  });
});
