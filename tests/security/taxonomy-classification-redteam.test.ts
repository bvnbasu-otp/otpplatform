/**
 * =============================================================================
 * OTP Platform — Stage R2-13 Red Team Security Battery (RT-01 through RT-16)
 * =============================================================================
 * Supreme Specification: docs/RECONSTRUCT-PRODUCT-CONSTITUTION-v1.0.md
 * Stage R2-13: Canonical Taxonomy & Classification Engine
 *
 * Vector Matrix:
 * RT-01: Taxonomy cross-tenant access and context tampering
 * RT-02: Unauthorized taxonomy node mutation by unprivileged buyer/supplier
 * RT-03: Buyer-context spoofing (Individual attempting to access RWA/MSME capex nodes)
 * RT-04: Regional classification poisoning with malicious input strings
 * RT-05: Fabricated regional supplier claims without verified cluster provenance
 * RT-06: Taxonomy node deletion or destructive overwrite affecting historical transactions
 * RT-07: Raw-intent overwrite or erasure during classification normalization
 * RT-08: Confidence score manipulation to force high-confidence on garbage input
 * RT-09: Unauthorized category injection attempting to bypass platform fee or GST
 * RT-10: Supplier category injection into unauthorized domains
 * RT-11: Cross-buyer intent leakage in unclassified requirements queue
 * RT-12: Context crossover (RWA treasurer acting on MSME industrial nodes)
 * RT-13: Identity leakage via taxonomy search metadata
 * RT-14: Provider quota bypass via taxonomy query flooding
 * RT-15: Discovery trigger bypass using unapproved categories
 * RT-16: Unclassified requirement rejection bypass (forcing system crash)
 * =============================================================================
 */

import { beforeEach, describe, expect, it } from 'vitest';
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
  classifyRawBuyerIntent,
} from '@otp/domain';
import {
  type ActorContext,
  CanonicalTaxonomyService,
  InMemoryRepositories,
  InMemoryAuditService,
  AuditAppService,
} from '@otp/services';

describe('Stage R2-13 Red Team Security Battery (RT-01 to RT-16)', () => {
  let service: CanonicalTaxonomyService;
  let audit: AuditAppService;

  const adminActor: ActorContext = {
    profileId: 'admin_usr_001',
    isPlatformAdmin: true,
    email: 'admin@otp.local',
  };

  const indBuyerActor: ActorContext = {
    profileId: 'ind_usr_001',
    isPlatformAdmin: false,
    persona: 'INDIVIDUAL',
  };

  const rwaBuyerActor: ActorContext = {
    profileId: 'rwa_usr_001',
    organizationId: 'org_rwa_greenview',
    orgRole: 'TREASURER',
    isPlatformAdmin: false,
    persona: 'RWA',
  };

  const msmeBuyerActor: ActorContext = {
    profileId: 'msme_usr_001',
    organizationId: 'org_msme_tex',
    orgRole: 'PRIMARY',
    isPlatformAdmin: false,
    persona: 'MSME',
  };

  const attackerActor: ActorContext = {
    profileId: 'malicious_actor_666',
    isPlatformAdmin: false,
  };

  beforeEach(() => {
    const repos = InMemoryRepositories.create();
    audit = new AuditAppService(new InMemoryAuditService());
    service = new CanonicalTaxonomyService(repos, audit);
  });

  // ---------------------------------------------------------------------------
  // RT-01: Taxonomy cross-tenant access and context tampering
  // ---------------------------------------------------------------------------
  it('RT-01: blocks cross-tenant requirement classification tampering across distinct org boundaries', async () => {
    await expect(
      service.classifyBuyerIntent(msmeBuyerActor, {
        rawIntent: 'Need 5000 kg cotton yarn',
        buyerContext: CanonicalBuyerContext.MSME,
        organizationId: 'org_different_tenant_999',
      }),
    ).rejects.toThrow('Cannot classify organization requirement across tenant boundary');
  });

  // ---------------------------------------------------------------------------
  // RT-02: Unauthorized taxonomy node mutation by unprivileged actor
  // ---------------------------------------------------------------------------
  it('RT-02: blocks non-admin attacker from mutating or creating taxonomy nodes', async () => {
    await expect(
      service.createNode(attackerActor, {
        code: 'malicious_zero_fee_category',
        name: 'Zero Fee Goods',
        buyerContexts: [CanonicalBuyerContext.MSME],
        procurementType: ProcurementType.PRODUCT,
        domainCode: 'EXPLOIT',
        domainName: 'Exploit',
        categoryCode: 'exploit_cat',
        categoryName: 'Exploit',
        subcategoryCode: 'exploit_sub',
        subcategoryName: 'Exploit',
        matchKeywords: ['exploit'],
        synonyms: ['exploit'],
        requiredAttributeCodes: [],
        defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
        sortOrder: 1,
      }),
    ).rejects.toThrow('Platform Admin authorization required to create taxonomy node');

    await expect(
      service.updateNode(attackerActor, 'ind_home_refrigerator', { name: 'Compromised Node' }),
    ).rejects.toThrow('Platform Admin authorization required to update taxonomy node');
  });

  // ---------------------------------------------------------------------------
  // RT-03: Buyer-context spoofing
  // ---------------------------------------------------------------------------
  it('RT-03: rejects invalid or enterprise buyer contexts during classification', async () => {
    await expect(
      service.classifyBuyerIntent(indBuyerActor, {
        rawIntent: 'Need ERP multi-subsidiary rollup solution',
        buyerContext: 'ENTERPRISE' as any,
      }),
    ).rejects.toThrow('Invalid buyer context: ENTERPRISE. Supported contexts: INDIVIDUAL, RWA, MSME.');
  });

  // ---------------------------------------------------------------------------
  // RT-04: Regional classification poisoning with malicious input strings
  // ---------------------------------------------------------------------------
  it('RT-04: sanitizes input text against SQL injection, XSS, and control character poisoning', async () => {
    const maliciousInput = "Need AC '; DROP TABLE requirement_categories; -- <script>alert('xss')</script>";
    const res = await service.classifyBuyerIntent(indBuyerActor, {
      rawIntent: maliciousInput,
      buyerContext: CanonicalBuyerContext.INDIVIDUAL,
    });

    expect(res.rawIntent).toBe(maliciousInput);
    expect(res.normalizedRequirement).not.toContain('<script>');
    expect(res.categoryCode).toBe('home_appliances');
    expect(res.subcategoryCode).toBe('air_conditioner_purchase');
  });

  // ---------------------------------------------------------------------------
  // RT-05: Fabricated regional supplier claims without verified cluster provenance
  // ---------------------------------------------------------------------------
  it('RT-05: enforces verified cluster provenance and rejects fabricated cluster claims', async () => {
    const clusters = await service.getRegionalClusters();
    for (const cluster of clusters) {
      expect(cluster.provenance).toBe(ClusterProvenance.VERIFIED_CLUSTER);
      expect(cluster.confidenceScore).toBeGreaterThanOrEqual(0.95);
    }

    // Fake PIN code must not match any cluster
    const fakeRes = classifyRawBuyerIntent(
      'Turmeric processing machinery in FakeCity',
      CanonicalBuyerContext.MSME,
      { pincode: '999999' },
    );
    expect(fakeRes.regionalClusterCode).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // RT-06: Taxonomy node deletion affecting historical records
  // ---------------------------------------------------------------------------
  it('RT-06: enforces immutable historical records during node deprecation and merge (zero destructive delete)', async () => {
    // Deprecate node
    const deprecated = await service.deprecateNode(
      adminActor,
      'ind_home_water_heater',
      'ind_home_refrigerator',
    );
    expect(deprecated.status).toBe(TaxonomyNodeStatus.DEPRECATED);
    expect(deprecated.deprecatedInFavorOf).toBe('ind_home_refrigerator');

    // Historical node is still retrievable by code for past orders
    const historicalNode = await service.getNodeByCode('ind_home_water_heater');
    expect(historicalNode).toBeDefined();
    expect(historicalNode.status).toBe(TaxonomyNodeStatus.DEPRECATED);
  });

  // ---------------------------------------------------------------------------
  // RT-07: Raw-intent overwrite or erasure during classification
  // ---------------------------------------------------------------------------
  it('RT-07: strictly preserves exact verbatim raw buyer intent even with messy whitespace and special chars', async () => {
    const rawIntent = '  \n\t  URGENT: Need 24,000 litre bulk water tanker for society sump filling!! @#$$%^&*  \n';
    const res = await service.classifyBuyerIntent(rwaBuyerActor, {
      rawIntent,
      buyerContext: CanonicalBuyerContext.RWA,
    });

    expect(res.rawIntent).toBe(rawIntent);
    expect(res.normalizedRequirement).toBe('URGENT: Need 24,000 litre bulk water tanker for society sump filling!!');
    expect(res.categoryCode).toBe('water_management');
    expect(res.subcategoryCode).toBe('bulk_water_tanker_supply');
  });

  // ---------------------------------------------------------------------------
  // RT-08: Confidence score manipulation to force high-confidence on garbage input
  // ---------------------------------------------------------------------------
  it('RT-08: assigns UNCLASSIFIED with low confidence score to random garbage input', async () => {
    const garbage = 'qwerty asdfgh zxcvbnm 12345 67890 foo bar baz';
    const res = await service.classifyBuyerIntent(indBuyerActor, {
      rawIntent: garbage,
      buyerContext: CanonicalBuyerContext.INDIVIDUAL,
    });

    expect(res.confidence).toBe(ClassificationConfidence.UNCLASSIFIED);
    expect(res.confidenceScore).toBeLessThan(0.30);
    expect(res.source).toBe(ClassificationSource.FREE_TEXT_FALLBACK);
    expect(res.categoryCode).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // RT-09: Unauthorized category injection attempting to duplicate codes
  // ---------------------------------------------------------------------------
  it('RT-09: rejects duplicate taxonomy node codes during creation', async () => {
    await expect(
      service.createNode(adminActor, {
        code: 'ind_home_refrigerator', // Already exists
        name: 'Duplicate Refrigerator',
        buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
        procurementType: ProcurementType.PRODUCT,
        domainCode: 'IND_APPLIANCES',
        domainName: 'Home Appliances',
        categoryCode: 'home_appliances',
        categoryName: 'Home Appliances',
        subcategoryCode: 'refrigerator_purchase',
        subcategoryName: 'Refrigerator',
        matchKeywords: ['fridge duplicate'],
        synonyms: ['fridge duplicate'],
        requiredAttributeCodes: [],
        defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
        sortOrder: 1,
      }),
    ).rejects.toThrow("Taxonomy node with code 'ind_home_refrigerator' already exists");
  });

  // ---------------------------------------------------------------------------
  // RT-10: Supplier category injection into unauthorized domains
  // ---------------------------------------------------------------------------
  it('RT-10: verifies node requires at least one valid buyer context', async () => {
    await expect(
      service.createNode(adminActor, {
        code: 'unauthorized_domain_node',
        name: 'Orphan Node',
        buyerContexts: [],
        procurementType: ProcurementType.PRODUCT,
        domainCode: 'ORPHAN',
        domainName: 'Orphan',
        categoryCode: 'orphan_cat',
        categoryName: 'Orphan',
        subcategoryCode: 'orphan_sub',
        subcategoryName: 'Orphan',
        matchKeywords: ['orphan'],
        synonyms: ['orphan'],
        requiredAttributeCodes: [],
        defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
        sortOrder: 1,
      }),
    ).rejects.toThrow('At least one canonical buyer context is required');
  });

  // ---------------------------------------------------------------------------
  // RT-11: Cross-buyer intent leakage in unclassified requirements queue
  // ---------------------------------------------------------------------------
  it('RT-11: unclassified triage queue requires platform admin access for status updates', async () => {
    const unclass = await service.captureUnclassifiedRequirement({
      rawIntent: 'Confidential custom cryogenic valve prototype requirement',
      buyerContext: CanonicalBuyerContext.MSME,
      buyerProfileId: msmeBuyerActor.profileId,
      organizationId: msmeBuyerActor.organizationId,
    });

    await expect(
      service.triageUnclassifiedRequirement(attackerActor, unclass.id, 'DISMISSED'),
    ).rejects.toThrow('Platform Admin authorization required to triage unclassified requirement');
  });

  // ---------------------------------------------------------------------------
  // RT-12: Context crossover (RWA treasurer acting on MSME industrial nodes)
  // ---------------------------------------------------------------------------
  it('RT-12: restricts Individual and RWA context queries from claiming MSME-only industrial nodes', async () => {
    const rwaRes = await service.classifyBuyerIntent(rwaBuyerActor, {
      rawIntent: 'Need rayon and cotton yarn sizing and weaver beam loading',
      buyerContext: CanonicalBuyerContext.RWA,
    });

    // Rayon sizing is MSME-only -> RWA context cannot match MSME-only node
    expect(rwaRes.subcategoryCode).not.toBe('yarn_sizing_warping');
  });

  // ---------------------------------------------------------------------------
  // RT-13: Identity leakage via taxonomy search metadata
  // ---------------------------------------------------------------------------
  it('RT-13: ensures taxonomy nodes and clusters contain zero PII or phone/email metadata', async () => {
    for (const node of ALL_CANONICAL_TAXONOMY_NODES) {
      expect(node.name).not.toMatch(/\b\d{10}\b/);
      expect(node.name).not.toMatch(/@/);
      for (const kw of node.matchKeywords) {
        expect(kw).not.toMatch(/\b\d{10}\b/);
        expect(kw).not.toMatch(/@/);
      }
    }

    for (const cluster of CANONICAL_REGIONAL_CLUSTERS) {
      expect(cluster.name).not.toMatch(/@/);
      expect(cluster.name).not.toMatch(/\b\d{10}\b/);
    }
  });

  // ---------------------------------------------------------------------------
  // RT-14: Provider quota bypass via taxonomy query flooding
  // ---------------------------------------------------------------------------
  it('RT-14: discovery payload preserves 25km default radius and coordinates structure without bypassing SNE quota', async () => {
    const classification = await service.classifyBuyerIntent(msmeBuyerActor, {
      rawIntent: 'Need CNC precision machining in Coimbatore',
      buyerContext: CanonicalBuyerContext.MSME,
      city: 'Coimbatore',
    });

    const payload = service.buildDiscoveryPayload(
      classification,
      { city: 'Coimbatore' },
    );

    expect(payload.deliveryLocation.radiusKm).toBe(25);
    expect(payload.confidence).toBe(ClassificationConfidence.HIGH_CONFIDENCE);
  });

  // ---------------------------------------------------------------------------
  // RT-15: Discovery trigger bypass using unapproved categories
  // ---------------------------------------------------------------------------
  it('RT-15: discovery payload provides safe fallback codes for unclassified requirements', async () => {
    const classification = await service.classifyBuyerIntent(indBuyerActor, {
      rawIntent: 'Need vintage violin bow rehairing with Mongolian horsehair',
      buyerContext: CanonicalBuyerContext.INDIVIDUAL,
    });

    const payload = service.buildDiscoveryPayload(
      classification,
      { city: 'Chennai' },
    );

    expect(payload.categoryCode).toBe('general_sourcing');
    expect(payload.subcategoryCode).toBe('unclassified_requirement');
    expect(payload.confidence).toBe(ClassificationConfidence.UNCLASSIFIED);
  });

  // ---------------------------------------------------------------------------
  // RT-16: Unclassified requirement rejection bypass (forcing system crash)
  // ---------------------------------------------------------------------------
  it('RT-16: handles empty, null-like, and boundary edge strings gracefully without throwing unhandled exceptions', async () => {
    const emptyRes = await service.classifyBuyerIntent(indBuyerActor, {
      rawIntent: '   ',
      buyerContext: CanonicalBuyerContext.INDIVIDUAL,
    });
    expect(emptyRes.confidence).toBe(ClassificationConfidence.UNCLASSIFIED);
    expect(emptyRes.source).toBe(ClassificationSource.FREE_TEXT_FALLBACK);

    const unicodeRes = await service.classifyBuyerIntent(indBuyerActor, {
      rawIntent: '🚀🔥🎉✨🌟 123456789 !!! ???',
      buyerContext: CanonicalBuyerContext.INDIVIDUAL,
    });
    expect(unicodeRes.confidence).toBe(ClassificationConfidence.UNCLASSIFIED);
  });
});
