import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OndcDiscoveryAdapter, OndcNetworkAdapter } from './ondc-network-adapter';
import { SupplierNetwork, OndcIntegrationState } from '@otp/domain';

const CRITERIA = { category: 'MOTOR_WINDING' } as const;

describe('ONDC discovery adapter — feature flag', () => {
  const originalFlag = process.env.ONDC_ENABLED;

  beforeEach(() => {
    delete process.env.ONDC_ENABLED;
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.ONDC_ENABLED;
    else process.env.ONDC_ENABLED = originalFlag;
  });

  it('is disabled by default — no flag, no candidates', async () => {
    const adapter = new OndcNetworkAdapter();
    expect(adapter.isEnabled()).toBe(false);
    expect(await adapter.discover(CRITERIA)).toEqual([]);
  });

  it('is disabled when the flag is anything other than the string "true"', async () => {
    for (const value of ['1', 'yes', 'TRUE', 'True', '', 'false']) {
      process.env.ONDC_ENABLED = value;
      const adapter = new OndcNetworkAdapter();
      expect(adapter.isEnabled(), `flag=${JSON.stringify(value)}`).toBe(false);
      expect(await adapter.discover(CRITERIA)).toEqual([]);
    }
  });

  it('does not fabricate sellers when flag is true but credentials are missing', async () => {
    process.env.ONDC_ENABLED = 'true';
    const adapter = new OndcNetworkAdapter();
    expect(adapter.isEnabled()).toBe(true);
    expect(adapter.getIntegrationState()).toBe(OndcIntegrationState.NOT_CONFIGURED);
    expect(await adapter.discover(CRITERIA)).toEqual([]);
  });

  it('lets the caller override the env — explicit options win', async () => {
    process.env.ONDC_ENABLED = 'true';
    const off = new OndcNetworkAdapter({ enabled: false });
    expect(off.isEnabled()).toBe(false);
    expect(await off.discover(CRITERIA)).toEqual([]);

    delete process.env.ONDC_ENABLED;
    const on = new OndcNetworkAdapter({ enabled: true });
    expect(on.isEnabled()).toBe(true);
    expect(await on.discover(CRITERIA)).toEqual([]);
  });

  it('exposes OndcDiscoveryAdapter as an alias for OndcNetworkAdapter', () => {
    expect(OndcDiscoveryAdapter).toBe(OndcNetworkAdapter);
  });
});
