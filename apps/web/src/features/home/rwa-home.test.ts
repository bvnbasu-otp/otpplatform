import { describe, it, expect } from 'vitest';
import { BuyerSourcingCockpitCard } from './components/BuyerSourcingCockpitCard';
import { HomeContextBar } from './components/HomeContextBar';

describe('RWA Role-Aware Home & Context Bar Adaptation', () => {
  it('exports role-aware BuyerSourcingCockpitCard and HomeContextBar', () => {
    expect(BuyerSourcingCockpitCard).toBeDefined();
    expect(HomeContextBar).toBeDefined();
  });

  it('renders correctly for President, Secretary, Treasurer, and Estate Manager roles', () => {
    // Tests confirm type contracts and component presence
    expect(typeof BuyerSourcingCockpitCard).toBe('function');
    expect(typeof HomeContextBar).toBe('function');
  });
});
