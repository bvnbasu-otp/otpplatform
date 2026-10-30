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
});
