import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relPath: string) => readFileSync(resolve(relPath), 'utf8');

describe('admin tables and payload keyboard scroll accessibility', () => {
  it('provides keyboard-navigable horizontal scroll on admin tables and payloads', () => {
    const tx = read('apps/web/src/features/admin/components/AdminTransactionsTable.tsx');
    const orders = read('apps/web/src/features/admin/components/AdminSellerOrdersTable.tsx');
    const users = read('apps/web/src/features/admin/components/AdminUsersActivityPanel.tsx');
    const audit = read('apps/web/src/features/admin/components/AdminAuditLogsViewer.tsx');

    expect(tx).toContain('aria-label="Buyer radar transaction table; scroll horizontally for all columns"');
    expect(tx).toContain('tabIndex={0}');
    expect(tx).toContain("event.key === 'ArrowLeft' || event.key === 'ArrowRight'");

    expect(orders).toContain('aria-label="Seller order table; scroll horizontally for all columns"');
    expect(orders).toContain('tabIndex={0}');
    expect(orders).toContain("event.key === 'ArrowLeft' || event.key === 'ArrowRight'");

    expect(users).toContain('aria-label="Admin user table; scroll horizontally for all columns"');
    expect(users).toContain('tabIndex={0}');
    expect(users).toContain('handleWideTableKeyDown');

    expect(audit).toContain('aria-label="Audit payload; scroll horizontally for the full record"');
    expect(audit).toContain('tabIndex={0}');
    expect(audit).toContain('handlePayloadKeyDown');
  });
});
