import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Fulfillment Consumer Tracking & Actions', () => {
  it('PurchaseOrdersPage renders Watrify 2-pill tabs with Google Material Symbols', () => {
    const pageSrc = readFileSync(
      resolve(__dirname, 'pages/PurchaseOrdersPage.tsx'),
      'utf8',
    );
    expect(pageSrc).toContain('Active (');
    expect(pageSrc).toContain('Completed (');
    expect(pageSrc).toContain('Icon name="pending_actions"');
    expect(pageSrc).toContain('Icon name="task_alt"');
  });

  it('PurchaseOrderList renders 4 visual milestones and direct call/WhatsApp actions', () => {
    const listSrc = readFileSync(
      resolve(__dirname, 'components/PurchaseOrderList.tsx'),
      'utf8',
    );
    expect(listSrc).toContain('1. Confirmed');
    expect(listSrc).toContain('2. In-Transit');
    expect(listSrc).toContain('3. Execution');
    expect(listSrc).toContain('4. Paid');
    expect(listSrc).toContain('Icon name="call"');
    expect(listSrc).toContain('Icon name="chat"');
    expect(listSrc).toContain('tel:');
    expect(listSrc).toContain('https://wa.me/');
  });
});
