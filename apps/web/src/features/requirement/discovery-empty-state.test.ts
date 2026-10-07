import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyDiscoveryEmpty, discoveryFailureCopy, displayedSupplierCount } from './lib/discovery-empty-state';

describe('discovery empty state', () => {
  it('keeps a real zero distinct from auth and service failure', () => {
    expect(classifyDiscoveryEmpty({ supplierCount: 0, error: null })).toBe('LEGITIMATE_ZERO');
    expect(classifyDiscoveryEmpty({ supplierCount: 0, error: 'Not authenticated' })).toBe('AUTH_PENDING');
    expect(classifyDiscoveryEmpty({ supplierCount: 0, error: 'discover_and_invite_for_rfq failed' })).toBe(
      'SERVICE_FAILURE',
    );
    expect(classifyDiscoveryEmpty({ supplierCount: 2, error: null })).toBe('HAS_RESULTS');
    expect(classifyDiscoveryEmpty({ supplierCount: 0, error: 'RESOURCE_EXHAUSTED quota' })).toBe('QUOTA_FAILURE');
    expect(classifyDiscoveryEmpty({ supplierCount: 0, error: 'Unsupported category for discovery' })).toBe(
      'UNSUPPORTED_CATEGORY',
    );
    expect(classifyDiscoveryEmpty({ supplierCount: 0, error: 'RFQ not found' })).toBe('INVALID_REQUIREMENT');
    expect(classifyDiscoveryEmpty({ supplierCount: 0, error: 'Supplier is not addressable' })).toBe(
      'ELIGIBILITY_REJECTION',
    );
    expect(discoveryFailureCopy('QUOTA_FAILURE')?.title).toMatch(/quota/i);
    expect(discoveryFailureCopy('LEGITIMATE_ZERO')).toBeNull();
  });

  it('does not invent a supplier count when the pool is empty', () => {
    expect(displayedSupplierCount(0)).toBe(0);
    expect(displayedSupplierCount(3)).toBe(3);
  });

  it('leaves a zero-result requirement with the existing retry, invite, and specification return', () => {
    const page = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'pages', 'DiscoverSuppliersPage.tsx'),
      'utf8',
    );
    expect(page).toContain('data-testid="empty-suppliers-pool"');
    expect(page).toContain('Retry Google Places');
    expect(page).toContain('Search OTP Registered Suppliers');
    expect(page).toContain('+ Invite Known Vendor');
    expect(page).toContain('backToUrl={`/requirements/${requirementId}`}');
    expect(page).toContain('data-testid="discovery-not-a-zero-result"');
    expect(page).not.toContain('invitationCount || 4');
  });
});
