import { describe, it, expect } from 'vitest';
import { FounderDashboardPage } from '../pages/FounderDashboardPage';

describe('Founder Executive Dashboard Module', () => {
  it('exports FounderDashboardPage component', () => {
    expect(FounderDashboardPage).toBeDefined();
    expect(typeof FounderDashboardPage).toBe('function');
  });
});
