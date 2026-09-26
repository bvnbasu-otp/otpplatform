import { describe, expect, it } from 'vitest';
import * as brand from './brand';

describe('canonical product positioning', () => {
  it('titles the product as identity-protected competitive sourcing', () => {
    expect(brand.PRODUCT_TITLE).toBe('OTP — Identity-Protected Competitive Sourcing');
    expect(brand.PRODUCT_TAGLINE).toBe('Identity-Protected Competitive Sourcing');
  });

  it('uses the customer-facing subtitle, not the retired governance-platform label', () => {
    expect(brand.PRODUCT_PLATFORM_SUBTITLE).toBe(
      'Compare competing supplier quotes and make better procurement decisions.',
    );
  });

  it('defines exactly one public journey of five steps, in order', () => {
    expect(brand.PUBLIC_JOURNEY_STEPS).toEqual(['Request', 'Compare', 'Decide', 'Purchase', 'Track']);
    expect(brand.PRODUCT_JOURNEY_STATEMENT).toBe('Request. Compare. Decide. Purchase. Track.');
  });

  it('exports no retired positioning phrase in any string constant', () => {
    const strings = Object.values(brand).flatMap((value) =>
      typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [],
    );
    expect(strings.length).toBeGreaterThan(5);
    for (const text of strings) {
      expect(text).not.toMatch(/Neutral Sourcing|Governance Platform|Procurement Cockpit/i);
    }
  });

  it('keeps one reviewed-on date for public pages to share', () => {
    expect(brand.PUBLIC_CONTENT_LAST_REVIEWED).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  });
});
