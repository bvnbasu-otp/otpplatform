import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SupplierOpportunityCard } from './components/SupplierOpportunityCard';
import type { SupplierOpportunityItem } from './types';

function opportunity(overrides: Partial<SupplierOpportunityItem> = {}): SupplierOpportunityItem {
  return {
    id: 'opp-1',
    invitation: {} as SupplierOpportunityItem['invitation'],
    title: 'Supply of OPC 53 cement',
    publicRef: 'ENQ-2026-0101',
    anonymousLabel: 'Supplier #01',
    buyerDisplayName: 'Identity protected',
    buyerAnonymous: true,
    quoteDeadline: null,
    deadlineCountdown: '2 days left',
    invitedAt: '2026-09-20T08:00:00Z',
    actionUrl: '/supplier/rfq/rfq-1',
    isClosingSoon: false,
    ...overrides,
  };
}

function render(item: SupplierOpportunityItem): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <SupplierOpportunityCard opportunity={item} />
    </MemoryRouter>,
  );
}

describe('Supplier home opportunity card: buyer identity', () => {
  it('does not render a buyer name even if one reaches the item', () => {
    const markup = render(opportunity({ buyerDisplayName: 'Greenview Apartments RWA', buyerAnonymous: false }));
    expect(markup).not.toContain('Greenview');
    expect(markup).toContain('Buyer: Identity protected');
  });

  it('does not fall back to an invented buyer name', () => {
    const markup = render(opportunity({ buyerDisplayName: '' }));
    expect(markup).not.toContain('Palm Meadows');
    expect(markup).toContain('Buyer: Identity protected');
  });

  it('uses the shared Identity-Protected shield', () => {
    const markup = render(opportunity());
    expect(markup).toContain('data-testid="identity-protected-shield"');
    expect(markup).toContain('Identity-Protected');
  });
});
