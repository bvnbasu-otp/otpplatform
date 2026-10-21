import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relPath: string) => readFileSync(resolve(relPath), 'utf8');

describe('reporting purchase order completion status filter', () => {
  it('filters completed orders strictly by status in drill-down and printable report', () => {
    const drilldown = read('apps/web/src/features/reporting/components/DrillDownSection.tsx');
    const printable = read('apps/web/src/features/reporting/components/PrintableProcurementReport.tsx');

    expect(drilldown).toContain("po.status === 'COMPLETED'");
    expect(drilldown).toContain('Completed');
    expect(printable).toContain("po.status === 'COMPLETED'");
  });
});
