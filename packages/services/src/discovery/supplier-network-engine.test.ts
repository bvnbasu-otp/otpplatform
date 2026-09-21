import { describe, expect, it } from 'vitest';
import {
  SupplierNetworkEngine,
  type DispatcherProviderRegistration,
} from './supplier-network-engine';
import {
  ProviderNeutralLocationIntelligence,
  NullLocationIntelligence,
  calculateHaversineDistanceKm,
} from '../gis/provider-neutral-location-intelligence';
import {
  SupplierNetwork,
  ProviderExecutionStatus,
  TruthfulProviderStatus,
  IdentityProtectedViolationError,
} from '@otp/domain';
import type { SupplierNetworkPort } from '../interfaces/supplier-network-port';
import { OndcNetworkAdapter } from './networks/ondc-network-adapter';
import {
  BniNetworkAdapter,
  AssociationNetworkAdapter,
  DirectNetworkAdapter,
  LocalRegistryNetworkAdapter,
} from './networks/supplier-network-adapters';

describe('Supplier Network Engine — SN.1 Core Orchestration & Provider Dispatcher', () => {
  describe('1. Provider-Neutral GIS Seam & Haversine Distance Calculation', () => {
    const gis = new ProviderNeutralLocationIntelligence();

    it('calculates accurate Haversine distance between coordinates', () => {
      // Bengaluru (MG Road) to Whitefield ~ 16 km
      const origin = { lat: 12.9716, lng: 77.5946 };
      const dest = { lat: 12.9698, lng: 77.7500 };
      const dist = calculateHaversineDistanceKm(origin.lat, origin.lng, dest.lat, dest.lng);
      expect(dist).toBeGreaterThan(15);
      expect(dist).toBeLessThan(18);
    });

    it('identifies local delivery via coordinate distance threshold (<=50km)', async () => {
      const origin = {
        city: 'Bengaluru',
        coordinates: { lat: 12.9716, lng: 77.5946 },
      };
      const dest = {
        city: 'Bengaluru',
        coordinates: { lat: 12.9698, lng: 77.7500 },
      };

      const result = await gis.calculateDistance(origin, dest);
      expect(result.isLocal).toBe(true);
      expect(result.distanceKm).toBeDefined();
      expect(result.calculationMethod).toBe('HAVERSINE_COORDINATES');
      expect(result.estimatedTransitDays).toBe(1);
    });

    it('identifies non-local inter-city distance (>50km)', async () => {
      // Bengaluru to Chennai ~ 290 km
      const origin = {
        city: 'Bengaluru',
        coordinates: { lat: 12.9716, lng: 77.5946 },
      };
      const dest = {
        city: 'Chennai',
        coordinates: { lat: 13.0827, lng: 80.2707 },
      };

      const result = await gis.calculateDistance(origin, dest);
      expect(result.isLocal).toBe(false);
      expect(result.distanceKm).toBeGreaterThan(250);
      expect(result.estimatedTransitDays).toBe(2);
    });

    it('matches on exact PIN code when coordinates are omitted', async () => {
      const origin = { pinCode: '560001' };
      const dest = { pinCode: '560001' };

      const result = await gis.calculateDistance(origin, dest);
      expect(result.isLocal).toBe(true);
      expect(result.calculationMethod).toBe('POSTAL_PIN_EXACT');
    });

    it('validates coverage within service radius', async () => {
      const serviceArea = {
        city: 'Bengaluru',
        radiusKm: 25,
        coordinates: { lat: 12.9716, lng: 77.5946 },
      };
      const target = {
        city: 'Bengaluru',
        coordinates: { lat: 12.9698, lng: 77.7500 }, // ~16.8km away
      };

      const coverage = await gis.validateCoverage(serviceArea, target);
      expect(coverage.isCovered).toBe(true);
      expect(coverage.matchedOn).toBe('COORDINATES_RADIUS');
    });

    it('validates coverage rejection outside service radius', async () => {
      const serviceArea = {
        city: 'Bengaluru',
        radiusKm: 10,
        coordinates: { lat: 12.9716, lng: 77.5946 },
      };
      const target = {
        city: 'Bengaluru',
        coordinates: { lat: 12.9698, lng: 77.7500 }, // ~16.8km away
      };

      const coverage = await gis.validateCoverage(serviceArea, target);
      expect(coverage.isCovered).toBe(false);
      expect(coverage.matchedOn).toBe('COORDINATES_RADIUS');
    });

    it('null location intelligence provides safe neutral fallback', async () => {
      const nullGis = new NullLocationIntelligence();
      const dist = await nullGis.calculateDistance({}, {});
      expect(dist.isLocal).toBe(true);
      expect(dist.calculationMethod).toBe('FALLBACK_DEFAULT');

      const cov = await nullGis.validateCoverage({}, {});
      expect(cov.isCovered).toBe(true);
    });
  });

  describe('2. Multi-Provider Orchestration & Execution Semantics', () => {
    it('dispatches discovery to all registered providers in parallel and normalizes candidates', async () => {
      const engine = new SupplierNetworkEngine({
        providers: [
          { adapter: LocalRegistryNetworkAdapter, isLive: true },
          { adapter: DirectNetworkAdapter, isLive: true },
          { adapter: BniNetworkAdapter },
          { adapter: AssociationNetworkAdapter },
        ],
      });

      const response = await engine.discoverCandidates({
        rfqId: 'rfq-sne-101',
        category: 'VALVE_FABRICATION',
        location: { city: 'Bengaluru', pinCode: '560001' },
      });

      expect(response.candidates.length).toBeGreaterThanOrEqual(4);
      expect(response.providerSummaries.length).toBe(4);
      expect(response.hasPartialFailures).toBe(false);

      for (const summary of response.providerSummaries) {
        expect(summary.status).toBe(ProviderExecutionStatus.SUCCESS);
        expect(summary.candidateCount).toBeGreaterThan(0);
      }

      for (const cand of response.candidates) {
        expect(cand.anonymousLabel).toMatch(/^Supplier [0-9A-Z]{4}$/);
        expect(cand.matchScore).toBeGreaterThanOrEqual(0);
        expect(cand.matchScore).toBeLessThanOrEqual(100);
        expect(cand.provenance.discoveredAt).toBeDefined();
        // Verify no source leakage in match reasons
        expect(cand.matchReasons.some((r) => r.startsWith('source:'))).toBe(false);
      }
    });

    it('handles disabled providers with DISABLED execution status', async () => {
      const ondcDisabled = new OndcNetworkAdapter({ enabled: false });
      const engine = new SupplierNetworkEngine({
        providers: [
          { adapter: LocalRegistryNetworkAdapter, isLive: true },
          { adapter: ondcDisabled },
        ],
      });

      const response = await engine.discoverCandidates({
        rfqId: 'rfq-sne-102',
        category: 'PUMP_REPAIR',
      });

      const ondcSummary = response.providerSummaries.find(
        (s) => s.provider === SupplierNetwork.ONDC,
      );
      expect(ondcSummary).toBeDefined();
      expect(ondcSummary?.status).toBe(ProviderExecutionStatus.DISABLED);
      expect(ondcSummary?.candidateCount).toBe(0);
      expect(ondcSummary?.truthfulStatus).toBe(TruthfulProviderStatus.DISABLED_GATE);
    });

    it('handles provider timeout gracefully with partial success', async () => {
      const slowAdapter: SupplierNetworkPort = {
        network: SupplierNetwork.BNI,
        async discover() {
          await new Promise((resolve) => setTimeout(resolve, 300));
          return [];
        },
      };

      const fastAdapter = LocalRegistryNetworkAdapter;

      const engine = new SupplierNetworkEngine({
        defaultTimeoutMs: 50,
        providers: [
          { adapter: fastAdapter, isLive: true },
          { adapter: slowAdapter, timeoutMs: 50 },
        ],
      });

      const response = await engine.discoverCandidates({
        rfqId: 'rfq-sne-103',
        category: 'MOTOR_WINDING',
      });

      expect(response.hasPartialFailures).toBe(true);

      const bniSummary = response.providerSummaries.find(
        (s) => s.provider === SupplierNetwork.BNI,
      );
      expect(bniSummary?.status).toBe(ProviderExecutionStatus.TIMEOUT);
      expect(bniSummary?.errorMessage).toContain('timed out');

      const localSummary = response.providerSummaries.find(
        (s) => s.provider === SupplierNetwork.LOCAL_REGISTRY,
      );
      expect(localSummary?.status).toBe(ProviderExecutionStatus.SUCCESS);
      expect(response.candidates.length).toBeGreaterThan(0);
    });

    it('handles provider runtime exception gracefully without crashing other results', async () => {
      const brokenAdapter: SupplierNetworkPort = {
        network: SupplierNetwork.ASSOCIATION,
        async discover() {
          throw new Error('Remote connection refused');
        },
      };

      const engine = new SupplierNetworkEngine({
        providers: [
          { adapter: LocalRegistryNetworkAdapter, isLive: true },
          { adapter: brokenAdapter },
        ],
      });

      const response = await engine.discoverCandidates({
        rfqId: 'rfq-sne-104',
        category: 'SOLAR_INVERTER',
      });

      expect(response.hasPartialFailures).toBe(true);

      const assocSummary = response.providerSummaries.find(
        (s) => s.provider === SupplierNetwork.ASSOCIATION,
      );
      expect(assocSummary?.status).toBe(ProviderExecutionStatus.INTERNAL_ERROR);
      expect(assocSummary?.errorMessage).toBe('Remote connection refused');

      expect(response.candidates.length).toBeGreaterThan(0);
    });
  });

  describe('3. Cross-Provider Deduplication & Ranking', () => {
    it('deduplicates candidate returned by multiple networks, preserving highest matchScore and merging provenance', async () => {
      const provider1: SupplierNetworkPort = {
        network: SupplierNetwork.DIRECT,
        async discover() {
          return [
            {
              externalRef: 'canonical-supp-001',
              network: SupplierNetwork.DIRECT,
              businessName: 'Alpha Engineering',
              capability: { categories: ['VALVES'], verificationStatus: 'VERIFIED' },
              matchScore: 80,
              matchReasons: ['category_match'],
              canReceiveRfq: true,
              canSubmitQuote: true,
            },
          ];
        },
      };

      const provider2: SupplierNetworkPort = {
        network: SupplierNetwork.LOCAL_REGISTRY,
        async discover() {
          return [
            {
              externalRef: 'canonical-supp-001', // Same supplier
              network: SupplierNetwork.LOCAL_REGISTRY,
              businessName: 'Alpha Engineering',
              capability: { categories: ['VALVES'], verificationStatus: 'VERIFIED' },
              matchScore: 94, // Higher score
              matchReasons: ['category_match', 'geo:local'],
              canReceiveRfq: true,
              canSubmitQuote: true,
            },
          ];
        },
      };

      const engine = new SupplierNetworkEngine({
        providers: [
          { adapter: provider1, isLive: true },
          { adapter: provider2, isLive: true },
        ],
      });

      const response = await engine.discoverCandidates({
        rfqId: 'rfq-sne-105',
        category: 'VALVES',
      });

      expect(response.totalCandidatesDiscovered).toBe(2);
      expect(response.totalUniqueCandidates).toBe(1);
      expect(response.candidates.length).toBe(1);

      const winner = response.candidates[0]!;
      expect(winner.matchScore).toBe(94);
      expect(winner.provenance.discoveredNetworks).toContain(SupplierNetwork.DIRECT);
      expect(winner.provenance.discoveredNetworks).toContain(SupplierNetwork.LOCAL_REGISTRY);
    });

    it('respects excludedSupplierIds filter in discovery requests', async () => {
      const engine = new SupplierNetworkEngine({
        providers: [
          { adapter: LocalRegistryNetworkAdapter, isLive: true },
          { adapter: DirectNetworkAdapter, isLive: true },
        ],
      });

      const response = await engine.discoverCandidates({
        rfqId: 'rfq-sne-106',
        category: 'BEARINGS',
        excludedSupplierIds: ['local_registry:BEARINGS'],
      });

      expect(
        response.candidates.some((c) => c.provenance.externalRef === 'local_registry:BEARINGS'),
      ).toBe(false);
    });
  });
});
