import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalyticsCards } from './components/AnalyticsCards';
import { PeriodFilterBar } from './components/PeriodFilterBar';
import type { PeriodReportingSummary } from './types/reporting';
import { classifyOrderCategory } from './utils/order-category';

const pageSource = readFileSync(
  resolve(__dirname, '../fulfillment/pages/PurchaseOrdersPage.tsx'),
  'utf8',
);
const filterSource = readFileSync(resolve(__dirname, 'components/PeriodFilterBar.tsx'), 'utf8');

function filterBar(role: 'buyer' | 'supplier', extras: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <PeriodFilterBar
      periodType="MONTHLY"
      onPeriodChange={() => {}}
      customStartDate="2026-09-01"
      customEndDate="2026-10-22"
      onCustomStartChange={() => {}}
      onCustomEndChange={() => {}}
      periodLabel="October 2026"
      role={role}
      selectedCategory="ALL"
      onCategoryChange={() => {}}
      categories={['Painting & Coating', 'DG Sets & Power']}
      searchQuery=""
      onSearchChange={() => {}}
      onExportPdf={() => {}}
      {...extras}
    />,
  );
}

const summary = (role: 'buyer' | 'supplier'): PeriodReportingSummary => ({
  periodType: 'ALL',
  dateRange: { startDate: new Date('2026-01-01'), endDate: new Date('2026-10-22'), label: 'All Time' },
  role,
  totalAmount: 1000,
  totalOrdersCount: 2,
  settledAmount: 400,
  settledOrdersCount: 1,
  activeAmount: 600,
  activeOrdersCount: 1,
  cancelledAmount: 0,
  cancelledOrdersCount: 0,
  disputedAmount: 0,
  disputedOrdersCount: 0,
  averageOrderValue: 500,
  categoryBreakdown: [],
  statusBreakdown: [],
});

describe('buyer and supplier reporting presets', () => {
  it('shares one period preset list and does not offer another persona by default', () => {
    const buyer = filterBar('buyer');
    const supplier = filterBar('supplier');
    for (const label of ['All Time', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly (FY)', 'Custom Period']) {
      expect(buyer.split(label).length - 1).toBe(1);
      expect(supplier.split(label).length - 1).toBe(1);
    }
    expect(buyer).not.toContain('Perspective:');
    expect(supplier).not.toContain('Buyer Spend');
    expect(supplier).not.toContain('Approver Governance');
    expect(supplier).not.toContain('Auditor Compliance');
    expect(buyer).toContain('Painting &amp; Coating');
    expect(buyer).toContain('DG Sets &amp; Power');
  });

  it('shows a switcher only for the choices the caller explicitly allows', () => {
    const single = filterBar('buyer', { onRoleChange: () => {}, roleChoices: ['buyer'] });
    expect(single).not.toContain('Perspective:');

    const dual = filterBar('buyer', { onRoleChange: () => {}, roleChoices: ['buyer', 'supplier'] });
    expect(dual).toContain('Perspective:');
    expect(dual).not.toContain('Approver Governance');
    expect(dual).not.toContain('Auditor Compliance');
    expect(filterSource).not.toContain("['buyer', 'supplier', 'approver', 'auditor']");
    expect(filterSource).toContain('choices.length > 1');
  });

  it('keeps the orders page on the route role and clears the previous category', () => {
    expect(pageSource).not.toContain('onRoleChange');
    expect(pageSource).not.toContain('setPerspective');
    expect(pageSource).toContain("setSelectedCategory('ALL')");
    expect(pageSource).toContain('[initialRole, load]');
    expect(pageSource).toContain('role={initialRole}');
    expect(pageSource).toContain('classifyOrderCategory');
  });

  it('uses buyer spend labels and supplier revenue labels for the same summary shape', () => {
    const buyer = renderToStaticMarkup(
      <AnalyticsCards summary={summary('buyer')} role="buyer" activeMetric={null} onSelectMetric={() => {}} />,
    );
    const supplier = renderToStaticMarkup(
      <AnalyticsCards summary={summary('supplier')} role="supplier" activeMetric={null} onSelectMetric={() => {}} />,
    );
    expect(buyer).toContain('Total Spend');
    expect(buyer).not.toContain('Gross Awarded Value');
    expect(supplier).toContain('Gross Awarded Value');
    expect(supplier).not.toContain('Total Approved Spend');
    expect(buyer).not.toContain('100% Clear');
    expect(supplier).not.toContain('100% Clear');
  });

  it('classifies every dropdown category with the same rule the filter uses', () => {
    expect(classifyOrderCategory('Exterior paint for tower B')).toBe('Painting & Coating');
    expect(classifyOrderCategory('Standby DG set')).toBe('DG Sets & Power');
    expect(classifyOrderCategory('Annual budget review')).toBe('General Procurement');
    expect(classifyOrderCategory('DG set maintenance')).toBe('DG Sets & Power');
    expect(classifyOrderCategory('Diesel generator maintenance')).toBe('DG Sets & Power');
    expect(classifyOrderCategory('Gym equipment')).toBe('Gym & Sports');
    expect(classifyOrderCategory('Pool cleaning AMC')).toBe('Swimming Pool AMC');
    expect(classifyOrderCategory('Office stationery')).toBe('General Procurement');
    expect(classifyOrderCategory('')).toBe('General Procurement');
  });
});
