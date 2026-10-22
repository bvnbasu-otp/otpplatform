import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

describe('desktop scrollbar accessibility contract', () => {
  it('keeps a discoverable global scrollbar and forced-color fallback', () => {
    const css = read('apps/web/src/index.css');
    expect(css).toMatch(/::-webkit-scrollbar\s*\{[^}]*width:\s*10px;[^}]*height:\s*10px;/s);
    expect(css).toMatch(/\.scrollbar-thin::-webkit-scrollbar\s*\{[^}]*width:\s*8px;[^}]*height:\s*8px;/s);
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toMatch(/\.scrollbar-thin:focus\s*\{/);
    expect(css).toContain('@media (min-width: 768px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/\[data-scroll-container\]:focus-visible/);
    const desktop = css.slice(css.indexOf('@media (min-width: 768px)'));
    expect(desktop).toMatch(/\.no-scrollbar::-webkit-scrollbar[\s\S]*display:\s*block/);
    expect(desktop).toMatch(/width:\s*10px/);
  });

  it('does not hide the critical procurement and evaluation scrollers', () => {
    const stages = read('apps/web/src/features/lifecycle/components/ProcurementStageNavigator.tsx');
    const evaluation = read('apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx');
    for (const source of [stages, evaluation]) {
      expect(source).toContain('overflow-x-auto scrollbar-thin');
      expect(source).toContain('tabIndex={0}');
      expect(source).not.toContain('overflow-x-auto no-scrollbar');
    }
    expect(stages).toContain("event.key === 'ArrowRight'");
    expect(evaluation).toContain("event.key === 'ArrowRight'");
  });

  it('keeps wide admin and purchase-order tables intentionally keyboard scrollable', () => {
    const admin = read('apps/web/src/features/admin/components/AdminTransactionsTable.tsx');
    const sellerOrders = read('apps/web/src/features/admin/components/AdminSellerOrdersTable.tsx');
    const purchaseOrder = read('apps/web/src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx');

    expect(admin).toContain('aria-label="Buyer radar transaction table; scroll horizontally for all columns"');
    expect(sellerOrders).toContain('aria-label="Seller order table; scroll horizontally for all columns"');
    const users = read('apps/web/src/features/admin/components/AdminUsersActivityPanel.tsx');
    expect(users).toContain('aria-label="Admin user table; scroll horizontally for all columns"');
    const audit = read('apps/web/src/features/admin/components/AdminAuditLogsViewer.tsx');
    expect(audit).toContain('aria-label="Audit payload; scroll horizontally for the full record"');
    expect(users).toContain('function handleWideTableKeyDown');
    expect(purchaseOrder).toContain('aria-label="Purchase order line items; scroll horizontally for all columns"');
    for (const source of [admin, sellerOrders, purchaseOrder]) {
      expect(source).toContain('tabIndex={0}');
      expect(source).toContain("event.key === 'ArrowLeft' || event.key === 'ArrowRight'");
      expect(source).toContain("event.key === 'Home' || event.key === 'End'");
    }
  });
});
