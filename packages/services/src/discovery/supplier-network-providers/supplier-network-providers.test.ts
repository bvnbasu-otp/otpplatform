import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SupplierDiscoverySourceKind,
  SupplierDiscoveryLifecycleTier,
  OndcIntegrationState,
} from '@otp/domain';
import { OndcSupplierProvider } from './ondc-supplier-provider';
import { GoogleDiscoveryProvider } from './google-discovery-provider';
import { OtpSupplierProvider } from './otp-supplier-provider';
import { SupplierNetworkProviderEngine } from './supplier-network-provider-engine';
import { InMemoryRepositories } from '../../repositories/in-memory';

describe('supplier network providers — provenance boundary', () => {
  const originalFlag = process.env.ONDC_ENABLED;

  beforeEach(() => {
    delete process.env.ONDC_ENABLED;
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.ONDC_ENABLED;
    else process.env.ONDC_ENABLED = originalFlag;
  });

  it('ONDC NOT_CONFIGURED does not invent sellers even when ONDC_ENABLED=true', async () => {
    process.env.ONDC_ENABLED = 'true';
    const provider = new OndcSupplierProvider({ enabled: true });
    expect(provider.getIntegrationState()).toBe(OndcIntegrationState.NOT_CONFIGURED);
    const result = await provider.discover({ category: 'MOTOR_WINDING', location: { pinCode: '560001' } });
    expect(result.candidates).toEqual([]);
  });

  it('Google discovery never marks OTP_VERIFIED lifecycle', async () => {
    const provider = new GoogleDiscoveryProvider();
    const result = await provider.discover({
      category: 'ELECTRICAL',
      location: { pinCode: '560048', city: 'Bengaluru' },
    });
    for (const c of result.candidates) {
      expect(c.sourceKind).toBe(SupplierDiscoverySourceKind.GOOGLE_DISCOVERY);
      expect(c.lifecycleTier).toBe(SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA);
      expect(c.lifecycleTier).not.toBe(SupplierDiscoveryLifecycleTier.OTP_VERIFIED);
    }
  });

  it('engine aggregates buyer-facing counts', async () => {
    const mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: 'sup-otp-1',
      businessName: 'Verified OTP Vendor',
      source: 'OTP_REGISTERED',
      status: 'ACTIVE',
      categories: ['VALVE_FABRICATION'],
      verificationStatus: 'VERIFIED',
      lifecycleState: 'VERIFIED',
    });

    const engine = new SupplierNetworkProviderEngine([
      new OtpSupplierProvider(mem.asRepositories().suppliers),
      new OndcSupplierProvider({ enabled: false }),
      new GoogleDiscoveryProvider(),
    ]);

    const agg = await engine.discover({
      category: 'VALVE_FABRICATION',
      location: { pinCode: '560048' },
    });

    expect(agg.buyerCounts.otpVerified).toBeGreaterThanOrEqual(1);
    expect(agg.results.find((r) => r.sourceKind === SupplierDiscoverySourceKind.ONDC_SELLER)?.candidates).toEqual([]);
  });
});
