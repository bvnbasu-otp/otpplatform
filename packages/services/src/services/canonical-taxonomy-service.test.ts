import { beforeEach, describe, expect, it } from 'vitest';
import {
  CanonicalBuyerContext,
  ClassificationConfidence,
  ClassificationSource,
  ProcurementType,
  RecurringFrequency,
  TaxonomyNodeStatus,
} from '@otp/domain';
import { CanonicalTaxonomyService } from './canonical-taxonomy-service';
import { InMemoryRepositories } from '../repositories/in-memory';
import { InMemoryAuditService } from '../audit/in-memory-audit-service';
import { AuditAppService } from './audit-service';
import type { ActorContext } from '../types/actor-context';

describe('CanonicalTaxonomyService', () => {
  let service: CanonicalTaxonomyService;
  let audit: AuditAppService;

  const adminActor: ActorContext = {
    profileId: 'admin_usr_001',
    isPlatformAdmin: true,
    email: 'admin@otp.local',
  };

  const buyerActor: ActorContext = {
    profileId: 'buyer_usr_001',
    isPlatformAdmin: false,
    organizationId: 'org_msme_001',
  };

  beforeEach(() => {
    const repos = InMemoryRepositories.create().asRepositories();
    audit = new AuditAppService(new InMemoryAuditService());
    service = new CanonicalTaxonomyService(repos, audit);
  });

  describe('1. Buyer Intent Classification & Raw Intent Preservation', () => {
    it('classifies Individual Home Appliance intent accurately', async () => {
      const res = await service.classifyBuyerIntent(buyerActor, {
        rawIntent: 'Need 1.5 ton 5 star inverter split AC for home bedroom',
        buyerContext: CanonicalBuyerContext.INDIVIDUAL,
      });

      expect(res.buyerContext).toBe(CanonicalBuyerContext.INDIVIDUAL);
      expect(res.categoryCode).toBe('home_appliances');
      expect(res.subcategoryCode).toBe('air_conditioner_purchase');
      expect(res.confidence).toBe(ClassificationConfidence.HIGH_CONFIDENCE);
      expect(res.rawIntent).toBe('Need 1.5 ton 5 star inverter split AC for home bedroom');
    });

    it('classifies RWA Facility Water Tanker & STP AMC intent', async () => {
      const res = await service.classifyBuyerIntent(buyerActor, {
        rawIntent: 'Require 24000 litre bulk water tanker for society sump filling',
        buyerContext: CanonicalBuyerContext.RWA,
      });

      expect(res.buyerContext).toBe(CanonicalBuyerContext.RWA);
      expect(res.categoryCode).toBe('water_management');
      expect(res.subcategoryCode).toBe('bulk_water_tanker_supply');
      expect(res.recurringFrequency).toBe(RecurringFrequency.RECURRING_CONTRACT);
    });

    it('classifies MSME Erode Turmeric Processing with regional cluster binding', async () => {
      const res = await service.classifyBuyerIntent(buyerActor, {
        rawIntent: 'Need turmeric polishing and steam sterilization job work 20 MT batch in Erode',
        buyerContext: CanonicalBuyerContext.MSME,
        city: 'Erode',
        pincode: '638001',
      });

      expect(res.buyerContext).toBe(CanonicalBuyerContext.MSME);
      expect(res.categoryCode).toBe('turmeric_processing');
      expect(res.subcategoryCode).toBe('turmeric_polishing_sterilization');
      expect(res.regionalClusterCode).toBe('erode_agro_textile');
      expect(res.confidence).toBe(ClassificationConfidence.HIGH_CONFIDENCE);
    });

    it('captures unclassified requirement to triage queue without blocking buyer', async () => {
      const res = await service.classifyBuyerIntent(buyerActor, {
        rawIntent: 'Need specialized diamond polishing laser machine calibration with optical prism',
        buyerContext: CanonicalBuyerContext.MSME,
      });

      expect(res.confidence).toBe(ClassificationConfidence.UNCLASSIFIED);
      expect(res.source).toBe(ClassificationSource.FREE_TEXT_FALLBACK);

      const queue = await service.getUnclassifiedQueue('PENDING');
      expect(queue.length).toBeGreaterThan(0);
      expect(queue.some((q) => q.rawIntent.includes('diamond polishing laser'))).toBe(true);
    });
  });

  describe('2. Regional Industrial Clusters Retrieval', () => {
    it('returns verified regional industrial clusters', async () => {
      const clusters = await service.getRegionalClusters();
      expect(clusters.length).toBeGreaterThanOrEqual(5);

      const codes = clusters.map((c) => c.code);
      expect(codes).toContain('erode_agro_textile');
      expect(codes).toContain('bhavani_weaving');
      expect(codes).toContain('tiruppur_knitwear');
      expect(codes).toContain('coimbatore_engineering');
      expect(codes).toContain('hosur_automotive');
    });

    it('filters clusters by state', async () => {
      const tnClusters = await service.getRegionalClusters('Tamil Nadu');
      expect(tnClusters.length).toBeGreaterThanOrEqual(5);

      const mhClusters = await service.getRegionalClusters('Maharashtra');
      expect(mhClusters.length).toBe(0);
    });
  });

  describe('3. Taxonomy Node Lifecycle Governance (Admin-Gated)', () => {
    it('blocks non-admin actors from creating taxonomy nodes', async () => {
      await expect(
        service.createNode(buyerActor, {
          code: 'test_illegal_node',
          name: 'Illegal Category',
          buyerContexts: [CanonicalBuyerContext.MSME],
          procurementType: ProcurementType.PRODUCT,
          domainCode: 'TEST',
          domainName: 'Test',
          categoryCode: 'test_cat',
          categoryName: 'Test Cat',
          subcategoryCode: 'test_sub',
          subcategoryName: 'Test Sub',
          matchKeywords: ['test'],
          synonyms: ['test'],
          requiredAttributeCodes: [],
          defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
          sortOrder: 999,
        }),
      ).rejects.toThrow('Platform Admin authorization required');
    });

    it('allows platform admin to create, update, deprecate, and merge taxonomy nodes', async () => {
      // 1. Create Node
      const created = await service.createNode(adminActor, {
        code: 'msme_solar_panel_supply',
        name: 'Industrial Rooftop Solar Panels & Inverters',
        buyerContexts: [CanonicalBuyerContext.MSME, CanonicalBuyerContext.RWA],
        procurementType: ProcurementType.PRODUCT,
        domainCode: 'ENERGY',
        domainName: 'Solar & Renewable Energy',
        categoryCode: 'solar_energy',
        categoryName: 'Solar Energy Systems',
        subcategoryCode: 'solar_panel_supply',
        subcategoryName: 'Solar Panels & Inverters',
        matchKeywords: ['solar panel', 'monocrystalline solar', 'solar inverter 50kw'],
        synonyms: ['solar power', 'rooftop solar'],
        requiredAttributeCodes: ['panel_capacity_kw', 'inverter_type'],
        defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
        sortOrder: 500,
      });

      expect(created.code).toBe('msme_solar_panel_supply');
      expect(created.status).toBe(TaxonomyNodeStatus.ACTIVE);

      // 2. Update Node
      const updated = await service.updateNode(adminActor, 'msme_solar_panel_supply', {
        name: 'High-Efficiency Industrial Solar Panels & Inverters',
      });
      expect(updated.name).toBe('High-Efficiency Industrial Solar Panels & Inverters');

      // 3. Deprecate Node
      const deprecated = await service.deprecateNode(adminActor, 'msme_solar_panel_supply');
      expect(deprecated.status).toBe(TaxonomyNodeStatus.DEPRECATED);

      // 4. Merge Nodes
      const mergeSource = await service.createNode(adminActor, {
        code: 'source_merge_node',
        name: 'Legacy Solar Inverters',
        buyerContexts: [CanonicalBuyerContext.MSME],
        procurementType: ProcurementType.PRODUCT,
        domainCode: 'ENERGY',
        domainName: 'Energy',
        categoryCode: 'solar_energy',
        categoryName: 'Solar',
        subcategoryCode: 'legacy_inverters',
        subcategoryName: 'Legacy Inverters',
        matchKeywords: ['legacy inverter', 'string inverter'],
        synonyms: ['inverter old'],
        requiredAttributeCodes: [],
        defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
        sortOrder: 501,
      });

      const mergedTarget = await service.mergeNodes(
        adminActor,
        'source_merge_node',
        'rwa_ev_charging_infrastructure',
      );
      expect(mergedTarget.matchKeywords).toContain('legacy inverter');

      const sourceNode = await service.getNodeByCode('source_merge_node');
      expect(sourceNode.status).toBe(TaxonomyNodeStatus.MERGED);
    });
  });

  describe('4. Unclassified Requirements Triage', () => {
    it('allows superadmin to triage unclassified requirement', async () => {
      const unclassified = await service.captureUnclassifiedRequirement({
        rawIntent: 'Looking for industrial boiler refractory brick lining repairs',
        buyerContext: CanonicalBuyerContext.MSME,
        city: 'Coimbatore',
        suggestedKeywords: ['boiler', 'refractory', 'lining'],
      });

      const triaged = await service.triageUnclassifiedRequirement(
        adminActor,
        unclassified.id,
        'TRIAGED',
        {
          targetSubcategoryCode: 'iron_castings_supply',
          reviewNotes: 'Classified under foundry & high-temperature civil works',
        },
      );

      expect(triaged.reviewStatus).toBe('TRIAGED');
      expect(triaged.reviewedBy).toBe(adminActor.profileId);
      expect(triaged.targetSubcategoryCode).toBe('iron_castings_supply');
    });
  });

  describe('5. SNE Discovery Payload Construction (R2-07)', () => {
    it('builds full discovery payload for SupplierNetworkEngine without bypassing quota', async () => {
      const classification = await service.classifyBuyerIntent(buyerActor, {
        rawIntent: 'Submersible pump motor rewiring and VMC CNC precision machining in Coimbatore',
        buyerContext: CanonicalBuyerContext.MSME,
        city: 'Coimbatore',
        pincode: '641006',
      });

      const payload = service.buildDiscoveryPayload(
        classification,
        { city: 'Coimbatore', pincode: '641006', radiusKm: 25 },
        { motor_power_hp: 15 },
      );

      expect(payload.categoryCode).toBe('pumps_motors_machining');
      expect(payload.subcategoryCode).toBe('pumps_cnc_machining');
      expect(payload.regionalClusterCode).toBe('coimbatore_engineering');
      expect(payload.buyerContext).toBe(CanonicalBuyerContext.MSME);
      expect(payload.deliveryLocation.city).toBe('Coimbatore');
      expect(payload.targetAttributes).toEqual({ motor_power_hp: 15 });
    });
  });

  describe('6. Superadmin & Founder Visibility Metrics', () => {
    it('computes master taxonomy health metrics and regional demand heatmap', async () => {
      // Execute a few classifications to populate demand telemetry
      await service.classifyBuyerIntent(buyerActor, {
        rawIntent: 'Turmeric grinding batch',
        buyerContext: CanonicalBuyerContext.MSME,
        city: 'Erode',
      });
      await service.classifyBuyerIntent(buyerActor, {
        rawIntent: 'Bhavani jamakkalam weaving',
        buyerContext: CanonicalBuyerContext.MSME,
        city: 'Bhavani',
      });

      const health = await service.getTaxonomyHealthMetrics();
      expect(health.totalNodes).toBeGreaterThan(15);
      expect(health.activeNodes).toBeGreaterThan(10);
      expect(health.nodesByContext.INDIVIDUAL).toBeGreaterThan(0);
      expect(health.nodesByContext.RWA).toBeGreaterThan(0);
      expect(health.nodesByContext.MSME).toBeGreaterThan(0);
      expect(health.regionalClusterCount).toBe(5);

      const heatmap = await service.getRegionalDemandHeatmap();
      expect(heatmap.length).toBe(5);
      const erodeDemand = heatmap.find((h) => h.clusterCode === 'erode_agro_textile');
      expect(erodeDemand?.queryCount).toBeGreaterThanOrEqual(1);
    });
  });
});
