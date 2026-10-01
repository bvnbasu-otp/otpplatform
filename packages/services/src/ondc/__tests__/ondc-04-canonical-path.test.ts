/**
 * ONDC-04 canonical path guards. LOCAL/CI/MOCK. Does not call a live network.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveOndcSearchDomain } from '../ondc-network-service';

describe('ONDC-04 canonical search path (LOCAL/CI/MOCK)', () => {
  it('does not call the title heuristic or accept an injected domain', () => {
    const source = readFileSync(new URL('../ondc-network-service.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export function resolveOndcSearchDomain');
    const end = source.indexOf('export function mapCategoryToOndcDomain');
    const body = source.slice(start, end);
    expect(body).toContain('mapOndcDiscoveryCategory');
    expect(body).not.toContain('mapCategoryToOndcDomain');
    expect(body).not.toContain('SRV11');

    expect(resolveOndcSearchDomain('camera shirt', 'ONDC:RET14')).toBeNull();
    expect(
      resolveOndcSearchDomain('cctv', 'ONDC:RET12', {
        subcategoryCode: 'cctv_surveillance',
        requirementMode: 'PROJECT_CONTRACT',
      }),
    ).toBeNull();
    expect(
      resolveOndcSearchDomain('yarn', 'ONDC:SRV11', {
        subcategoryCode: 'garments',
        requirementMode: 'PRODUCT_MATERIAL',
      }),
    ).toBe('ONDC:RET12');
  });

  it('leaves the production factory adapter non-live', () => {
    const factory = readFileSync(new URL('../../factory/create-otp-services.ts', import.meta.url), 'utf8');
    const start = factory.indexOf('new OndcNetworkAdapter()');
    expect(start).toBeGreaterThan(-1);
    expect(factory.slice(start, start + 180)).toMatch(/isLive:\s*false/);
    const adapter = readFileSync(new URL('../../discovery/networks/ondc-network-adapter.ts', import.meta.url), 'utf8');
    expect(adapter).toContain('readonly isTruthfulLive = false');
    expect(adapter).not.toContain('discover_and_invite_for_rfq');
  });
});
