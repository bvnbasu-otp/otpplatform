import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SupplierIdentityShieldBanner } from './components/SupplierIdentityShieldBanner';

describe('SupplierIdentityShieldBanner dynamic business name', () => {
  it('renders the custom business name passed from profile or account creation', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SupplierIdentityShieldBanner
          businessName="Aqua Prime Borewell Works"
          profile={{
            categories: ['water_environmental', 'construction_infrastructure'],
            radiusKm: 75,
            isPanIndia: false,
            baseCity: 'Bengaluru',
            pincode: '560001',
            slaBadges: ['24h_response'],
            certifications: [],
            updatedAt: new Date().toISOString(),
          }}
          opportunitiesCount={5}
          actionCount={1}
          activeQuotesCount={2}
          activeOrdersCount={3}
        />
      </MemoryRouter>
    );

    expect(html).toContain('Aqua Prime Borewell Works');
    expect(html).toContain('Bengaluru');
    expect(html).not.toContain('Sri Vinayaka Works');
  });

  it('renders default fallback when businessName is not provided', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SupplierIdentityShieldBanner
          opportunitiesCount={2}
        />
      </MemoryRouter>
    );

    expect(html).toContain('Verified Supplier');
    expect(html).not.toContain('Sri Vinayaka Works');
  });
});
