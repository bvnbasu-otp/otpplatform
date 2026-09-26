import { describe, expect, it } from 'vitest';
import { SupplierNetwork } from '@otp/domain';
import type { SupplierNetworkPort } from '../../interfaces/supplier-network-port';
import {
  AssociationNetworkAdapter,
  BniNetworkAdapter,
  DirectNetworkAdapter,
  LocalRegistryNetworkAdapter,
  GooglePlacesNetworkAdapter,
} from './supplier-network-adapters';
import { OndcNetworkAdapter } from './ondc-network-adapter';

/**
 * Every value in the SupplierNetwork enum must have a network adapter — even a
 * stubbed one — because the site copy lists channels by that enum and the
 * discovery composite would otherwise silently drop candidates from a network
 * that had a marketing label but no adapter behind it.
 *
 * This test is the guard rail for adding a new network: any new enum value
 * lands here as a failing test until the adapter is registered.
 */

const ADAPTERS: SupplierNetworkPort[] = [
  BniNetworkAdapter,
  AssociationNetworkAdapter,
  DirectNetworkAdapter,
  LocalRegistryNetworkAdapter,
  GooglePlacesNetworkAdapter,
  // Explicitly enabled for the guard suite — production wiring reads the
  // feature flag; the guard only cares about shape.
  new OndcNetworkAdapter({ enabled: true }),
];

describe('supplier network adapters', () => {
  it('has an adapter registered for every SupplierNetwork enum value', () => {
    const covered = new Set(ADAPTERS.map((a) => a.network));

    for (const network of Object.values(SupplierNetwork)) {
      expect(covered.has(network), `no adapter for ${network}`).toBe(true);
    }
  });

  it('reports its own network id on every adapter, matching the enum', () => {
    // A stub adapter that returned the wrong network would look correct in
    // isolation but pollute the composite's dedupe-by-network reasoning.
    for (const adapter of ADAPTERS) {
      expect(Object.values(SupplierNetwork), adapter.network).toContain(adapter.network);
    }
  });

  it('registers each network exactly once — no two adapters claim the same network', () => {
    const seen = new Map<SupplierNetwork, number>();
    for (const adapter of ADAPTERS) {
      seen.set(adapter.network, (seen.get(adapter.network) ?? 0) + 1);
    }
    for (const [network, count] of seen) {
      expect(count, `${network} has ${count} adapters`).toBe(1);
    }
  });

  it('returns candidates that carry the adapter\'s own network id, not another', () => {
    // A stub that leaks the wrong network on the candidate would show up in the
    // buyer's summary panel under the wrong heading — subtle and hard to spot
    // once the composite has aggregated by supplier.
    return Promise.all(
      ADAPTERS.map(async (adapter) => {
        const candidates = await adapter.discover({ category: 'MOTOR_WINDING' });
        for (const c of candidates) {
          expect(c.network, adapter.network).toBe(adapter.network);
        }
      }),
    );
  });
});
