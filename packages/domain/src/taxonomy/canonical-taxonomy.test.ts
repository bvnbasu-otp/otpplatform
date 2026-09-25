import { describe, expect, it } from 'vitest';
import {
  ALL_CANONICAL_TAXONOMY_NODES,
  CANONICAL_REGIONAL_CLUSTERS,
  CanonicalBuyerContext,
  ClassificationConfidence,
  ClassificationSource,
  ClusterProvenance,
  ProcurementType,
  RecurringFrequency,
  TaxonomyNodeStatus,
  buildDiscoveryPayload,
  classifyRawBuyerIntent,
  detectBundledComponents,
  detectRegionalCluster,
  extractProcurementType,
  extractRecurringFrequency,
  normalizeRequirementText,
} from './canonical-taxonomy';
import { InMemoryTaxonomyCache } from './taxonomy-cache';

describe('Canonical Sourcing Taxonomy & Classification Engine', () => {
  describe('1. 3 Canonical Buyer Contexts & Scope Governance', () => {
    it('defines strictly 3 canonical buyer contexts with zero enterprise persona', () => {
      const contexts = Object.values(CanonicalBuyerContext);
      expect(contexts).toEqual(['INDIVIDUAL', 'RWA', 'MSME']);
      expect(contexts).not.toContain('ENTERPRISE');
    });

    it('all seed taxonomy nodes declare authorized buyer contexts', () => {
      expect(ALL_CANONICAL_TAXONOMY_NODES.length).toBeGreaterThan(15);
      for (const node of ALL_CANONICAL_TAXONOMY_NODES) {
        expect(node.buyerContexts.length).toBeGreaterThan(0);
        for (const ctx of node.buyerContexts) {
          expect(['INDIVIDUAL', 'RWA', 'MSME']).toContain(ctx);
        }
      }
    });

    it('enforces context-scoped categorization (Individual vs RWA vs MSME)', () => {
      // Individual: Home AC Purchase
      const indRes = classifyRawBuyerIntent(
        'Need 1.5 ton 5 star split inverter AC for 2 BHK flat',
        CanonicalBuyerContext.INDIVIDUAL,
      );
      expect(indRes.buyerContext).toBe(CanonicalBuyerContext.INDIVIDUAL);
      expect(indRes.categoryCode).toBe('home_appliances');
      expect(indRes.subcategoryCode).toBe('air_conditioner_purchase');
      expect(indRes.confidence).toBe(ClassificationConfidence.HIGH_CONFIDENCE);

      // RWA: Bulk Water Tanker
      const rwaRes = classifyRawBuyerIntent(
        'Require 24000 litre bulk water tanker supply for society sump filling daily',
        CanonicalBuyerContext.RWA,
      );
      expect(rwaRes.buyerContext).toBe(CanonicalBuyerContext.RWA);
      expect(rwaRes.categoryCode).toBe('water_management');
      expect(rwaRes.subcategoryCode).toBe('bulk_water_tanker_supply');
      expect(rwaRes.recurringFrequency).toBe(RecurringFrequency.RECURRING_CONTRACT);

      // MSME: Turmeric Processing
      const msmeRes = classifyRawBuyerIntent(
        'Need turmeric finger grading and steam sterilization jobwork 10 MT batch in Erode',
        CanonicalBuyerContext.MSME,
        { city: 'Erode', pincode: '638001' },
      );
      expect(msmeRes.buyerContext).toBe(CanonicalBuyerContext.MSME);
      expect(msmeRes.categoryCode).toBe('turmeric_processing');
      expect(msmeRes.subcategoryCode).toBe('turmeric_polishing_sterilization');
      expect(msmeRes.regionalClusterCode).toBe('erode_agro_textile');
    });
  });

  describe('2. 5 Primary Procurement Types & Recurring Frequencies', () => {
    it('supports 5 distinct procurement types', () => {
      expect(extractProcurementType('Buy 50 kgs turmeric powder')).toBe(ProcurementType.PRODUCT);
      expect(extractProcurementType('Annual maintenance contract for passenger lift')).toBe(ProcurementType.SERVICE);
      expect(extractProcurementType('External building painting and terrace waterproofing project')).toBe(ProcurementType.PROJECT);
      expect(extractProcurementType('Society AGM stage setup, shamiana and event catering')).toBe(ProcurementType.FUNCTION);
      expect(extractProcurementType('Sound system and microphones on rent for 2 days')).toBe(ProcurementType.RENTAL);
    });

    it('extracts recurring frequencies accurately', () => {
      expect(extractRecurringFrequency('Comprehensive lift AMC for 1 year')).toBe(RecurringFrequency.AMC_ANNUAL);
      expect(extractRecurringFrequency('Monthly swimming pool chemical supply')).toBe(RecurringFrequency.PERIODIC_MONTHLY);
      expect(extractRecurringFrequency('Quarterly fire extinguisher audit and testing')).toBe(RecurringFrequency.PERIODIC_QUARTERLY);
      expect(extractRecurringFrequency('Daily water tanker delivery on contract basis')).toBe(RecurringFrequency.RECURRING_CONTRACT);
      expect(extractRecurringFrequency('Projector on hire for 3 days rental')).toBe(RecurringFrequency.RENTAL_PERIOD);
      expect(extractRecurringFrequency('One-time deep cleaning of 3 BHK apartment')).toBe(RecurringFrequency.ONE_TIME);
    });
  });

  describe('3. Regional Industrial Clusters & Provenance Ladder', () => {
    it('contains verified regional business intelligence for Tamil Nadu industrial hubs', () => {
      const clusterCodes = CANONICAL_REGIONAL_CLUSTERS.map((c) => c.code);
      expect(clusterCodes).toContain('erode_agro_textile');
      expect(clusterCodes).toContain('bhavani_weaving');
      expect(clusterCodes).toContain('tiruppur_knitwear');
      expect(clusterCodes).toContain('coimbatore_engineering');
      expect(clusterCodes).toContain('hosur_automotive');

      for (const cluster of CANONICAL_REGIONAL_CLUSTERS) {
        expect(cluster.provenance).toBe(ClusterProvenance.VERIFIED_CLUSTER);
        expect(cluster.confidenceScore).toBeGreaterThanOrEqual(0.95);
        expect(cluster.pincodes.length).toBeGreaterThan(0);
        expect(cluster.specialties.length).toBeGreaterThan(0);
      }
    });

    it('detects regional cluster by PIN code, city, and specialties', () => {
      // By PIN code
      const clusterPin = detectRegionalCluster('Need weaving yarn', 'Unknown', '638301');
      expect(clusterPin?.code).toBe('bhavani_weaving');
      expect(clusterPin?.city).toBe('Bhavani');

      // By City
      const clusterCity = detectRegionalCluster('Need circular knitting jobwork', 'Tiruppur');
      expect(clusterCity?.code).toBe('tiruppur_knitwear');

      // By In-Text Specialty
      const clusterSpecialty = detectRegionalCluster(
        'Looking for cast iron casting and submersible pump body foundry in Peelamedu',
      );
      expect(clusterSpecialty?.code).toBe('coimbatore_engineering');
    });
  });

  describe('4. Composite / Bundled Requirement Parsing', () => {
    it('detects bundled components for RWA Community Events without splitting commercial order', () => {
      const prompt = 'Society AGM celebration with shamiana tent, sound system microphones, and dinner catering for 250 residents';
      const bundle = detectBundledComponents(prompt, CanonicalBuyerContext.RWA);
      expect(bundle.isBundled).toBe(true);
      expect(bundle.parts.length).toBe(3);

      const partTitles = bundle.parts.map((p) => p.title);
      expect(partTitles).toContain('Shamiana, Stage & Chairs Infrastructure');
      expect(partTitles).toContain('Audio Visual, Microphones & Stage Lighting');
      expect(partTitles).toContain('Event Catering & Refreshment Services');
    });

    it('detects bundled components for MSME garment manufacturing', () => {
      const prompt = 'Need circular single jersey knitting and zero liquid discharge fabric dyeing for 2000 t-shirts';
      const bundle = detectBundledComponents(prompt, CanonicalBuyerContext.MSME);
      expect(bundle.isBundled).toBe(true);
      expect(bundle.parts.length).toBe(2);
    });

    it('returns isBundled=false for single-part requirements', () => {
      const prompt = 'Need 12.5 HP submersible pump motor repair';
      const bundle = detectBundledComponents(prompt, CanonicalBuyerContext.INDIVIDUAL);
      expect(bundle.isBundled).toBe(false);
      expect(bundle.parts.length).toBe(0);
    });
  });

  describe('5. Natural Language Classification & Raw Intent Preservation', () => {
    it('preserves raw intent, normalized requirement, confidence, and taxonomy version', () => {
      const rawText = '  Urgent: Need 24,000 Ltr Bulk Water Tanker for Sump Filling in Society!  ';
      const res = classifyRawBuyerIntent(rawText, CanonicalBuyerContext.RWA);

      expect(res.rawIntent).toBe(rawText);
      expect(res.normalizedRequirement).toBe('Urgent: Need 24,000 Ltr Bulk Water Tanker for Sump Filling in Society!');
      expect(res.categoryCode).toBe('water_management');
      expect(res.subcategoryCode).toBe('bulk_water_tanker_supply');
      expect(res.confidence).toBe(ClassificationConfidence.HIGH_CONFIDENCE);
      expect(res.confidenceScore).toBeGreaterThanOrEqual(0.80);
      expect(res.taxonomyVersion).toBe('1.3.0');
    });

    it('assigns multi-signal match when multiple keywords and context align', () => {
      const text = 'Deep cleaning and sanitization for 3 BHK flat including kitchen deep clean and bathroom';
      const res = classifyRawBuyerIntent(text, CanonicalBuyerContext.INDIVIDUAL);

      expect(res.categoryCode).toBe('cleaning_domestic');
      expect(res.subcategoryCode).toBe('deep_home_cleaning');
      expect(res.source).toBe(ClassificationSource.MULTI_SIGNAL_MATCH);
      expect(res.matchedKeywords.length).toBeGreaterThanOrEqual(2);
    });

    it('handles regional MSME manufacturing classification with high confidence', () => {
      const text = 'Require sheet metal pressing and deep drawing automotive components in Hosur Sipcot';
      const res = classifyRawBuyerIntent(text, CanonicalBuyerContext.MSME, { city: 'Hosur' });

      expect(res.categoryCode).toBe('auto_components');
      expect(res.subcategoryCode).toBe('sheet_metal_turned_components');
      expect(res.regionalClusterCode).toBe('hosur_automotive');
      expect(res.confidence).toBe(ClassificationConfidence.HIGH_CONFIDENCE);
    });
  });

  describe('6. Universal Fallback ("Not listed? Tell OTP what you need")', () => {
    it('preserves raw intent and assigns UNCLASSIFIED fallback for novel requirements without crashing', () => {
      const novelText = 'Looking for antique handcrafted brass telescope restoration with wooden tripod';
      const res = classifyRawBuyerIntent(novelText, CanonicalBuyerContext.INDIVIDUAL);

      expect(res.confidence).toBe(ClassificationConfidence.UNCLASSIFIED);
      expect(res.source).toBe(ClassificationSource.FREE_TEXT_FALLBACK);
      expect(res.categoryCode).toBeNull();
      expect(res.subcategoryCode).toBeNull();
      expect(res.rawIntent).toBe(novelText);
      expect(res.unclassifiedReason).toContain('No existing taxonomy subcategory reached confidence threshold');
      expect(res.suggestedActions?.length).toBeGreaterThan(0);
    });

    it('handles empty input gracefully with unclassified fallback', () => {
      const res = classifyRawBuyerIntent('   ', CanonicalBuyerContext.INDIVIDUAL);
      expect(res.confidence).toBe(ClassificationConfidence.UNCLASSIFIED);
      expect(res.source).toBe(ClassificationSource.FREE_TEXT_FALLBACK);
      expect(res.unclassifiedReason).toBe('Empty buyer intent provided');
    });
  });

  describe('7. Supplier Network Engine (R2-07) Integration Payload', () => {
    it('constructs typed discovery payload without duplicating queries or bypassing quotas', () => {
      const classification = classifyRawBuyerIntent(
        'Fire fighting system hydrant testing and extinguisher refilling AMC for 3 towers',
        CanonicalBuyerContext.RWA,
      );
      const payload = buildDiscoveryPayload(
        classification,
        { city: 'Bengaluru', pincode: '560102', radiusKm: 15 },
        { extinguisher_count: 45, hydrant_points: 12 },
      );

      expect(payload.categoryCode).toBe('fire_safety');
      expect(payload.subcategoryCode).toBe('fire_fighting_amc');
      expect(payload.buyerContext).toBe(CanonicalBuyerContext.RWA);
      expect(payload.procurementType).toBe(ProcurementType.SERVICE);
      expect(payload.recurringFrequency).toBe(RecurringFrequency.AMC_ANNUAL);
      expect(payload.deliveryLocation.city).toBe('Bengaluru');
      expect(payload.deliveryLocation.pincode).toBe('560102');
      expect(payload.deliveryLocation.radiusKm).toBe(15);
      expect(payload.targetAttributes).toEqual({ extinguisher_count: 45, hydrant_points: 12 });
      expect(payload.confidence).toBe(ClassificationConfidence.HIGH_CONFIDENCE);
    });
  });

  describe('8. In-Memory LRU Cache & Node Versioning', () => {
    it('caches canonical taxonomy nodes with TTL support', () => {
      const cache = new InMemoryTaxonomyCache(10_000);
      expect(cache.getNodes()).toBeNull();

      cache.setNodes('canonical_nodes', ALL_CANONICAL_TAXONOMY_NODES);
      const retrieved = cache.getNodes();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.length).toBe(ALL_CANONICAL_TAXONOMY_NODES.length);

      cache.clear();
      expect(cache.getNodes()).toBeNull();
    });

    it('expires cached nodes after TTL', () => {
      const cache = new InMemoryTaxonomyCache(-100); // Expired immediately
      cache.setNodes('canonical_nodes', ALL_CANONICAL_TAXONOMY_NODES);
      expect(cache.getNodes()).toBeNull();
    });
  });
});
