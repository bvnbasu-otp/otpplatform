import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositeDiscoveryService } from './composite-discovery-service';
import { MockNetworkDiscoveryService } from './mock-network-discovery-service';
import { InMemoryRepositories } from '../repositories/in-memory';
import { LocalRegistryDiscoveryService } from './local-registry-discovery-service';

describe('CompositeDiscoveryService — mock network truth boundary', () => {
  const originalVitest = process.env.VITEST;

  beforeEach(() => {
    process.env.VITEST = 'true';
  });

  afterEach(() => {
    if (originalVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = originalVitest;
  });

  it('does not label mock network rows as ONDC', async () => {
    const composite = new CompositeDiscoveryService([
      new MockNetworkDiscoveryService(),
    ]);
    const results = await composite.discover({ category: 'Electrical' });
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('OTHER');
    expect(results[0].supplierId).toMatch(/^mock-network-/);
    expect(results[0].matchReasons.some((r) => r.includes('ONDC'))).toBe(false);
  });

  it('returns only registry suppliers when mock is omitted (pre-prod factory shape)', async () => {
    const mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: 'sup-local-1',
      businessName: 'Local Verified',
      source: 'OTP_REGISTERED',
      status: 'ACTIVE',
      categories: ['Electrical'],
      verificationStatus: 'VERIFIED',
      lifecycleState: 'VERIFIED',
    });

    const composite = new CompositeDiscoveryService([
      new LocalRegistryDiscoveryService(mem.asRepositories().suppliers),
    ]);
    const results = await composite.discover({ category: 'Electrical' });
    expect(results.some((r) => r.supplierId.startsWith('mock-network-'))).toBe(false);
    expect(results.some((r) => r.supplierId === 'sup-local-1')).toBe(true);
  });
});

describe('createOtpServices mock gating', () => {
  it(
    'omits mock-network invitations outside Vitest',
    async () => {
    vi.stubEnv('VITEST', '');
    const { createOtpServices } = await import('../factory/create-otp-services');
    const mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: 'sup-only',
      businessName: 'Only Registry',
      source: 'OTP_REGISTERED',
      status: 'ACTIVE',
      categories: ['Pumps'],
      verificationStatus: 'VERIFIED',
      lifecycleState: 'VERIFIED',
    });
    const services = createOtpServices(mem.asRepositories());
    const discovered = await services.discovery.discover({ category: 'Pumps' });
    expect(discovered.every((r) => !r.supplierId.startsWith('mock-network-'))).toBe(true);
    vi.unstubAllEnvs();
  },
  30_000,
  );
});
