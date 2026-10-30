import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Home Cockpit Google Material Symbols & Layout', () => {
  it('renders Google Material Symbols for categories and actions', () => {
    const cockpitSrc = readFileSync(
      resolve(__dirname, 'components/BuyerSourcingCockpitCard.tsx'),
      'utf8',
    );
    expect(cockpitSrc).toContain('Icon name={chip.icon}');
    expect(cockpitSrc).toContain("icon: 'build'");
    expect(cockpitSrc).toContain("icon: 'electrical_services'");
    expect(cockpitSrc).toContain("icon: 'water_drop'");
    expect(cockpitSrc).toContain("icon: 'cleaning_services'");
    expect(cockpitSrc).toContain("icon: 'chair'");
    expect(cockpitSrc).toContain("icon: 'inventory_2'");
  });

  it('SupplierDashboardPage renders Find Opportunities banner and 4-card action grid with Google Material Symbols', () => {
    const supplierSrc = readFileSync(
      resolve(__dirname, '../../pages/SupplierDashboardPage.tsx'),
      'utf8',
    );
    expect(supplierSrc).toContain('data-testid="find-opportunities-banner"');
    expect(supplierSrc).toContain('data-testid="supplier-action-grid"');
    expect(supplierSrc).toContain('Icon name="search"');
    expect(supplierSrc).toContain('Icon name="request_quote"');
    expect(supplierSrc).toContain('Icon name="local_shipping"');
    expect(supplierSrc).toContain('Icon name="notifications"');
    expect(supplierSrc).toContain('Icon name="person"');
  });
});
