import { describe, expect, it } from 'vitest';

export interface PurchaseOrderRow {
  id: string;
  organization_id: string;
  category: string;
  total_amount: number;
  status: string;
  created_at: string;
}

export function computeSpendAnalytics(
  orders: PurchaseOrderRow[],
  targetOrgId: string,
): { totalSpend: number; poCount: number; categoryBreakdown: Record<string, number> } {
  const filtered = orders.filter(
    (o) => o.organization_id === targetOrgId && ['ISSUED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(o.status),
  );

  let totalSpend = 0;
  const categoryBreakdown: Record<string, number> = {};

  for (const o of filtered) {
    totalSpend += o.total_amount;
    categoryBreakdown[o.category] = (categoryBreakdown[o.category] || 0) + o.total_amount;
  }

  return { totalSpend, poCount: filtered.length, categoryBreakdown };
}

describe('Spend Analytics In-Memory Computation & Aggregation', () => {
  const sampleOrders: PurchaseOrderRow[] = [
    { id: 'po-1', organization_id: 'org-1', category: 'Painting', total_amount: 495600, status: 'COMPLETED', created_at: '2026-08-01' },
    { id: 'po-2', organization_id: 'org-1', category: 'Painting', total_amount: 150000, status: 'IN_PROGRESS', created_at: '2026-08-15' },
    { id: 'po-3', organization_id: 'org-1', category: 'Water Supply', total_amount: 80000, status: 'ISSUED', created_at: '2026-09-01' },
    { id: 'po-4', organization_id: 'org-1', category: 'Plumbing', total_amount: 25000, status: 'CANCELLED', created_at: '2026-09-02' },
    { id: 'po-5', organization_id: 'org-2', category: 'Security', total_amount: 500000, status: 'COMPLETED', created_at: '2026-09-02' },
  ];

  it('aggregates total active spend excluding cancelled purchase orders', () => {
    const res = computeSpendAnalytics(sampleOrders, 'org-1');
    expect(res.totalSpend).toBe(725600); // 495600 + 150000 + 80000
    expect(res.poCount).toBe(3);
    expect(res.categoryBreakdown['Painting']).toBe(645600);
    expect(res.categoryBreakdown['Water Supply']).toBe(80000);
  });
});
