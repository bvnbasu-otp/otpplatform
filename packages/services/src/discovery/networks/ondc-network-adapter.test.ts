import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OndcDiscoveryAdapter, OndcNetworkAdapter } from './ondc-network-adapter';
import { SupplierNetwork } from '@otp/domain';

/**
 * The ONDC adapter is Phase 4A shape-only work: a documented port
 * implementation that stays quiet until the platform is actually connected to
 * an ONDC Buyer App. What this file locks in is that the flag is respected on
 * every path so that a deploy without `ONDC_ENABLED=true` cannot leak
 * placeholder rows into a real buyer's discovery panel.
 */

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
    // A permissive check ("truthy") would flip the network on for empty strings
    // and typos, which is exactly the class of accident this flag exists to
    // prevent. The comparison is strict on purpose.
    for (const value of ['1', 'yes', 'TRUE', 'True', '', 'false']) {
      process.env.ONDC_ENABLED = value;
      const adapter = new OndcNetworkAdapter();
      expect(adapter.isEnabled(), `flag=${JSON.stringify(value)}`).toBe(false);
      expect(await adapter.discover(CRITERIA)).toEqual([]);
    }
  });

  it('enables discovery when the flag is exactly "true"', async () => {
    process.env.ONDC_ENABLED = 'true';
    const adapter = new OndcNetworkAdapter();
    expect(adapter.isEnabled()).toBe(true);

    const results = await adapter.discover(CRITERIA);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.network).toBe(SupplierNetwork.ONDC);
    }
  });

  it('lets the caller override the env — explicit options win', async () => {
    process.env.ONDC_ENABLED = 'true';
    const off = new OndcNetworkAdapter({ enabled: false });
    expect(off.isEnabled()).toBe(false);
    expect(await off.discover(CRITERIA)).toEqual([]);

    delete process.env.ONDC_ENABLED;
    const on = new OndcNetworkAdapter({ enabled: true });
    expect(on.isEnabled()).toBe(true);
    expect((await on.discover(CRITERIA)).length).toBeGreaterThan(0);
  });

  it('exposes OndcDiscoveryAdapter as an alias for OndcNetworkAdapter', () => {
    // Two names, one class. New wiring uses the Discovery suffix; older
    // callers stay on OndcNetworkAdapter. Both must be interchangeable.
    expect(OndcDiscoveryAdapter).toBe(OndcNetworkAdapter);
  });
});
